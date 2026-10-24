"""Local USB capture service and browser UI, packaged as a Windows application."""
import argparse
from collections import deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import os
from pathlib import Path
import queue
import re
import subprocess
import sys
import threading
import time
from urllib.parse import urlparse, parse_qs
import uuid
import webbrowser

from serial.tools import list_ports
import serial
from collector import Capture, open_port, select_port, send
from updates import VERSION, REPOSITORY, RELEASE_URL, DOWNLOAD_URL, fetch_manifest, version_tuple, download_asset, unpack_program, unpack_firmware
from sharing import Sharing
from bitrate_scan import scan

ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[1]))
WEB = ROOT / 'web'
DATA = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'BafangReader'


def allowed_command(command):
    return isinstance(command, str) and len(command) < 80 and bool(re.fullmatch(
        r'(?:HELP|STATUS|STOP|START (?:10000|20000|50000|100000|125000|250000|500000|800000|1000000)|LED (?:LOW|HIGH|AUTO|ACTIVE LOW|ACTIVE HIGH)|WIFI (?:[1-9]|10|11) [A-Za-z0-9 _-]{1,32})', command))


class Runtime:
    def __init__(self, log_root, sharing=None):
        self.lock = threading.RLock()
        self.device = {}
        self.frames = deque(maxlen=512)
        self.connected = False
        self.error = ''
        self.port = ''
        self.identity = None
        self.log_path = ''
        self.worker = None
        self.requests = queue.Queue(maxsize=16)
        self.stop_event = threading.Event()
        self.ready = threading.Event()
        self.log_root = Path(log_root)
        self.busy = False
        self.job_kind = ''
        self.progress = ''
        self.update = {}
        self.manifest = None
        self.on_exit = lambda: None
        self.sharing = sharing
        self.recording = False
        self.recording_deadline = None
        self.scan_cancel = threading.Event()
        self.scan_state = dict(active=False, results=[], selected=None)
        self.browser_sessions = {}
        self.browser_seen = False
        self.browser_required = False
        self.browser_started = time.monotonic()

    def browser_open(self, now=None):
        token = uuid.uuid4().hex
        with self.lock:
            self.browser_sessions[token] = dict(last=time.monotonic() if now is None else now, leaving=False)
            self.browser_seen = True
        return token

    def browser_ping(self, token, leaving=False, now=None):
        with self.lock:
            if token not in self.browser_sessions:
                raise ValueError('Unknown browser session')
            self.browser_sessions[token] = dict(last=time.monotonic() if now is None else now, leaving=leaving)

    def browser_exit_due(self, now=None):
        now = time.monotonic() if now is None else now
        with self.lock:
            for token, session in list(self.browser_sessions.items()):
                if now-session['last'] >= (8 if session['leaving'] else 120):
                    del self.browser_sessions[token]
            if self.busy and self.job_kind in ('firmware', 'program'):
                return False
            return (self.browser_seen and not self.browser_sessions) or (
                self.browser_required and not self.browser_seen and now-self.browser_started >= 90)

    def safe_event(self, cap, kind, **values):
        try:
            cap.event(kind, **values)
        except OSError:
            logging.exception('Could not write capture event %s', kind)

    def ingest(self, cap, data):
        messages = cap.feed(data)
        with self.lock:
            for msg in messages:
                if not msg:
                    continue
                if msg.get('type') == 'status':
                    if self.device.get('boot') != msg.get('boot'):
                        self.frames.clear()
                    self.device = msg
                elif msg.get('type') == 'frame':
                    if self.frames and self.frames[-1].get('boot') != msg.get('boot'):
                        self.frames.clear()
                    self.frames.append(msg)
        return messages

    def wait(self, s, cap, command='STATUS', seconds=3):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            for msg in self.ingest(cap, s.read(max(1, min(s.in_waiting, 8192)))):
                if not msg:
                    continue
                if msg.get('type') == 'error':
                    raise ValueError(msg.get('message', 'Device error'))
                if command == 'HELP' and msg.get('type') == 'help':
                    return msg
                if msg.get('type') == 'status' and msg.get('product') == 'BafangReader' and msg.get('protocol') == 1:
                    if command == 'STOP' and msg.get('can') != 'stopped':
                        continue
                    if command.startswith('START ') and (msg.get('can') != 'running' or msg.get('bitrate') != int(command[6:])):
                        continue
                    return msg
        raise serial.SerialException('Нет подтверждения команды ' + command)

    def connect(self, port):
        if self.worker and self.worker.is_alive():
            raise ValueError('Сначала отключите текущий сеанс')
        target = select_port(port)
        if (target.vid, target.pid) != (0x303A, 0x1001):
            raise ValueError('Выберите ESP32 с native USB Serial/JTAG 303A:1001')
        with self.lock:
            self.port = target.device
            self.identity = (target.vid, target.pid, target.serial_number)
            self.error = ''
            self.device = {}
            self.frames.clear()
        self.stop_event.clear()
        self.ready.clear()
        self.worker = threading.Thread(target=self.capture_worker, name='USB capture', daemon=True)
        self.worker.start()
        if not self.ready.wait(5):
            self.stop_event.set()
            raise ValueError('Тайм-аут подключения')
        if not self.connected:
            raise ValueError(self.error or 'Нет подключения')

    def capture_worker(self):
        s = cap = None
        identified = False
        active_request = None
        folder = None
        def settings():
            return self.sharing.settings() if self.sharing else dict(mode='continuous', duration=60)
        def begin_capture():
            nonlocal cap, folder
            if self.recording:
                return
            cap.close()
            folder = self.log_root / (datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6])
            cap = Capture(folder)
            cap.new_session(reason='recording_started', port=self.port, usb_identity=self.identity)
            self.log_path = str(folder.resolve())
            self.recording = True
        def finish_capture(reason):
            nonlocal cap, folder
            if not self.recording:
                return
            cap.event('recording_finished', reason=reason)
            summary = dict(schema=1, frames=cap.frames, invalid=cap.invalid, sequence_gaps=cap.gaps,
                           device=self.device, reason=reason, version=VERSION)
            previous = cap
            cap = Capture(None)
            self.recording = False
            self.recording_deadline = None
            previous.close()
            (folder / 'completed.json').write_text(json.dumps(summary, ensure_ascii=False), encoding='utf-8')
            if self.sharing:
                try:
                    self.sharing.enqueue(folder)
                except Exception:
                    logging.exception('Could not queue capture; local log is retained')
            folder = None
        try:
            cap = Capture(None)
            s = open_port(self.port)
            cap.new_session(reason='desktop_connect', port=self.port, usb_identity=self.identity)
            send(s, cap, 'STATUS')
            self.wait(s, cap)
            identified = True
            send(s, cap, 'STOP')
            self.wait(s, cap, 'STOP')
            with self.lock:
                self.connected = True
                self.error = ''
            self.ready.set()
            next_status, next_flush = time.monotonic() + 2, time.monotonic() + 1
            while not self.stop_event.is_set():
                self.ingest(cap, s.read(max(1, min(s.in_waiting, 8192))))
                try:
                    active_request = self.requests.get_nowait()
                except queue.Empty:
                    active_request = None
                if active_request:
                    kind, value, result, event = active_request
                    try:
                        if kind == 'mark':
                            if settings()['mode'] == 'marked':
                                rate = value['bitrate']
                                if not allowed_command('START ' + str(rate)):
                                    raise ValueError('Выберите скорость CAN перед записью')
                                begin_capture()
                                if self.device.get('can') != 'running':
                                    send(s, cap, 'START ' + str(rate))
                                    self.wait(s, cap, 'START ' + str(rate))
                                self.recording_deadline = time.monotonic() + settings()['duration']
                            elif not self.recording:
                                raise ValueError('Сначала начните непрерывную запись')
                            cap.event('mark', action=value['action'])
                            result.update(ok=True, t_us=None)
                        else:
                            if value.startswith('START ') and not self.scan_state.get('active'):
                                if settings()['mode'] == 'marked':
                                    raise ValueError('Для записи нажмите «Добавить отметку»')
                                begin_capture()
                            send(s, cap, value)
                            response = self.wait(s, cap, value)
                            if value == 'STOP':
                                finish_capture('stop_button')
                            result.update(ok=True, response=response)
                    except (ValueError, serial.SerialException) as e:
                        result.update(ok=False, error=str(e))
                        if self.recording and self.recording_deadline is None and settings()['mode'] == 'marked':
                            send(s, cap, 'STOP')
                            self.wait(s, cap, 'STOP')
                            finish_capture('start_failed')
                    finally:
                        event.set()
                        active_request = None
                now = time.monotonic()
                if self.recording_deadline is not None and now >= self.recording_deadline:
                    send(s, cap, 'STOP')
                    self.wait(s, cap, 'STOP')
                    finish_capture('timer')
                if now >= next_status:
                    send(s, cap, 'STATUS')
                    next_status = now + 2
                if now >= next_flush:
                    cap.flush()
                    next_flush = now + 1
        except Exception as exc:
            logging.exception('Capture failed')
            with self.lock:
                self.error = str(exc)
            if cap:
                self.safe_event(cap, 'disconnect', error=str(exc))
        finally:
            if s and s.is_open and cap and identified:
                try:
                    send(s, cap, 'STOP')
                    self.wait(s, cap, 'STOP')
                    self.safe_event(cap, 'stop_confirmed', status=self.device)
                except Exception as exc:
                    self.safe_event(cap, 'stop_unconfirmed', error=str(exc))
                    with self.lock:
                        self.error = 'STOP не подтверждён: ' + str(exc)
            if s:
                try:
                    s.close()
                except serial.SerialException:
                    logging.exception('Serial close failed')
            if cap:
                try:
                    finish_capture('disconnected')
                    cap.close()
                except OSError as exc:
                    logging.exception('Could not close capture files')
                    self.error = 'Ошибка записи лога: ' + str(exc)
            with self.lock:
                self.connected = False
                self.recording = False
                self.recording_deadline = None
            self.ready.set()
            while True:
                try:
                    _, _, result, event = self.requests.get_nowait()
                    result.update(ok=False, error='Сеанс закрыт')
                    event.set()
                except queue.Empty:
                    break

    def request(self, kind, value):
        if not self.connected:
            raise ValueError('Сначала подключите ридер')
        result, event = {}, threading.Event()
        self.requests.put_nowait((kind, value, result, event))
        if not event.wait(4):
            raise ValueError('Команда ожидает ответа; проверьте состояние устройства')
        if not result.get('ok'):
            raise ValueError(result.get('error', 'Command failed'))
        return result

    def disconnect(self):
        self.scan_cancel.set()
        self.stop_event.set()
        if self.worker and self.worker.is_alive():
            self.worker.join(5)
            if self.worker.is_alive():
                raise ValueError('Запись ещё завершается')

    def snapshot(self):
        with self.lock:
            d = dict(self.device)
            update = dict(self.update)
            if self.manifest:
                update['firmware_available'] = bool(self.connected and version_tuple(self.manifest['version']) > version_tuple(d.get('version', '0.0.0')))
            return dict(device=d, connection=dict(transport='usb', connected=self.connected, port=self.port,
                        error=self.error, log_path=self.log_path, updating=self.busy and self.job_kind == 'firmware'),
                        network=dict(ssid=d.get('ssid', ''), ip=d.get('ip', '192.168.4.1'), channel=d.get('wifi_channel'), clients=d.get('wifi_clients'),
                                     mac=d.get('ap_mac',''), saved_ssid=d.get('saved_ssid',''), saved_channel=d.get('saved_wifi_channel')),
                        app=dict(version=VERSION, repository=REPOSITORY, release_url=RELEASE_URL,
                                 download_url=DOWNLOAD_URL, desktop=True, busy=self.busy, progress=self.progress, update=update,
                                 recording=self.recording, remaining=max(0, int(self.recording_deadline-time.monotonic()+.999)) if self.recording_deadline else None,
                                 sharing=self.sharing.snapshot() if self.sharing else {}, scan=dict(self.scan_state)))

    def configure_recording(self, values):
        if not self.sharing:
            raise ValueError('Settings unavailable')
        if set(values) & {'mode', 'duration'} and (self.recording or self.device.get('can') == 'running' or self.scan_state.get('active')):
            raise ValueError('Сначала остановите CAN')
        self.sharing.configure(values)

    def scan_bitrate(self):
        if not self.connected or self.recording:
            raise ValueError('Подключите ридер и завершите запись перед поиском')
        self.scan_cancel.clear()
        def progress(value):
            with self.lock:
                self.scan_state = value
        def command(text):
            return self.request('command', text)['response']
        self.scan_state = dict(active=True, results=[], selected=None)
        try:
            scan(command, self.scan_cancel.is_set, progress)
        finally:
            self.scan_state['active'] = False

    def preview(self, after):
        with self.lock:
            available = list(self.frames)
            latest = available[-1]['seq'] if available else self.device.get('received', 0)
            oldest = available[0]['seq'] if available else 0
            return dict(boot=self.device.get('boot'), latest=latest, oldest=oldest,
                        missed=max(0, oldest - after - 1) if oldest else 0,
                        frames=[x for x in available if x['seq'] > after][:64])

    def job(self, kind, target):
        with self.lock:
            if self.busy:
                raise ValueError('Дождитесь завершения текущей операции')
            self.busy, self.job_kind = True, kind
            self.progress = 'Проверка GitHub Releases…'
        def execute():
            try:
                target()
            except Exception as exc:
                logging.exception('Update job failed')
                with self.lock:
                    self.progress = 'Ошибка: ' + str(exc)
                    if kind == 'check':
                        self.update = dict(checked=False, error='Нет доступа к обновлениям: ' + str(exc))
            finally:
                with self.lock:
                    self.busy = False
        threading.Thread(target=execute, name='Update '+kind, daemon=True).start()

    def check_updates(self):
        manifest = fetch_manifest()
        with self.lock:
            self.manifest = manifest
            self.update = dict(checked=True, version=manifest['version'], available=version_tuple(manifest['version']) > version_tuple(VERSION), error='')
            self.progress = 'Версии проверены. Диагностика работает и без интернета.'

    def get_update(self, kind):
        manifest = fetch_manifest()
        current = VERSION if kind == 'windows' else self.device.get('version', '0.0.0')
        if version_tuple(manifest['version']) <= version_tuple(current):
            raise ValueError('Установлена актуальная версия')
        self.progress = 'Скачивание версии ' + manifest['version'] + '…'
        target = DATA / 'updates' / manifest['version']
        archive = download_asset(manifest[kind], target / (kind + '.zip'))
        return manifest, target, archive

    def update_program(self):
        manifest, target, archive = self.get_update('windows')
        program = unpack_program(archive, target / 'program')
        if self.connected:
            self.request('command', 'STOP')
        self.disconnect()
        self.progress = 'Запуск новой программы…'
        environment = os.environ.copy()
        environment['PYINSTALLER_RESET_ENVIRONMENT'] = '1'
        subprocess.Popen([str(program)], cwd=str(program.parent), close_fds=True, env=environment)
        self.on_exit()

    def update_firmware(self):
        if not self.connected:
            raise ValueError('Для прошивки требуется подключённая ESP32-C3')
        manifest, target, archive = self.get_update('firmware')
        firmware = unpack_firmware(archive, target / 'firmware')
        if firmware['version'] != manifest['version']:
            raise ValueError('Firmware version mismatch')
        port, identity = self.port, self.identity
        self.request('command', 'STOP')
        self.disconnect()
        current = select_port(port)
        if (current.vid, current.pid, current.serial_number) != identity:
            raise ValueError('USB identity changed')
        self.progress = 'Запись ESP32-C3 по USB. Не отключайте питание…'
        command = [sys.executable]
        if not getattr(sys, 'frozen', False):
            command.append(str(Path(__file__).resolve()))
        command += ['--flash', port, str(target / 'firmware'), identity[2] or '']
        flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        with (target / 'flash.log').open('w', encoding='utf-8') as log:
            result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, creationflags=flags, timeout=120)
        if result.returncode:
            raise ValueError('Прошивка не завершена; журнал: ' + str(target / 'flash.log'))
        time.sleep(2)
        self.connect(port)
        if self.device.get('version') != manifest['version']:
            raise ValueError('Новая версия не подтверждена STATUS')
        self.manifest = manifest
        self.progress = 'ESP32 обновлена до ' + manifest['version'] + '. CAN остановлен.'


def flash_helper(port, folder, expected_serial):
    import hashlib
    import esptool
    current = select_port(port)
    if (current.vid, current.pid) != (0x303A, 0x1001) or current.serial_number != expected_serial:
        raise ValueError('Unexpected USB target')
    folder = Path(folder)
    manifest = json.loads((folder / 'firmware.json').read_text(encoding='utf-8'))
    if manifest.get('chip') != 'esp32c3' or manifest.get('flash_size') != '4MB':
        raise ValueError('Invalid firmware manifest')
    expected = {'bootloader.bin': 0, 'partitions.bin': 0x8000, 'firmware.bin': 0x10000}
    if len(manifest['files']) != 3 or {x['name'] for x in manifest['files']} != set(expected):
        raise ValueError('Invalid firmware files')
    args = ['--chip', 'esp32c3', '--port', port, '--baud', '460800', '--after', 'hard_reset',
            'write_flash', '--flash_mode', 'dio', '--flash_freq', '40m', '--flash_size', '4MB']
    for item in sorted(manifest['files'], key=lambda f: f['offset']):
        path = folder / item['name']
        if item['offset'] != expected[item['name']] or hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('Firmware verification failed')
        args += [hex(item['offset']), str(path)]
    esptool.main(args)


class Handler(BaseHTTPRequestHandler):
    runtime = None
    server_version = 'BafangReader/' + VERSION

    def log_message(self, format, *args):
        logging.debug(format, *args)

    def trusted_host(self):
        return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

    def answer(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if not self.trusted_host():
            return self.answer(dict(ok=False, error='Invalid Host'), 403)
        parsed = urlparse(self.path)
        try:
            if parsed.path in ('/api/state', '/api/info'):
                return self.answer(self.runtime.snapshot())
            if parsed.path == '/api/ports':
                return self.answer(dict(ports=[dict(port=p.device, description=p.description, serial=p.serial_number,
                                                    compatible=(p.vid,p.pid)==(0x303A,0x1001))
                                               for p in sorted(list_ports.comports(),key=lambda p:p.device)]))
            if parsed.path == '/api/frames':
                after = int(parse_qs(parsed.query).get('after', ['0'])[0])
                if not 0 <= after <= 0xffffffffffffffff:
                    raise ValueError('Invalid cursor')
                return self.answer(self.runtime.preview(after))
            files = {'/': ('index.html','text/html'), '/style.css': ('style.css','text/css'),
                     '/app.js': ('app.js','application/javascript'), '/decoder.js': ('decoder.js','application/javascript'),
                     '/decoder_reference.json': ('decoder_reference.json','application/json')}
            if parsed.path not in files:
                return self.answer(dict(ok=False, error='Not found'), 404)
            name, mime = files[parsed.path]
            raw = (WEB / name).read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', mime + '; charset=utf-8')
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(raw)
        except (ValueError, OSError) as exc:
            self.answer(dict(ok=False, error=str(exc)), 400)

    def do_POST(self):
        route = urlparse(self.path).path
        leave = route == '/api/session/leave'
        origins = (f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}')
        if not self.trusted_host() or (self.headers.get('X-Reader-UI') != '1' and not (
                leave and self.headers.get('Origin') in origins)):
            return self.answer(dict(ok=False, error='Invalid request origin'), 403)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 1024:
                raise ValueError('Invalid body size')
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError('Expected JSON object')
            r = self.runtime
            if route == '/api/session/open':
                return self.answer(dict(ok=True, session=r.browser_open()))
            if route in ('/api/session/ping', '/api/session/leave'):
                r.browser_ping(body.get('session'), leaving=leave)
                return self.answer(dict(ok=True))
            if r.busy and r.job_kind != 'check' and route in ('/api/connect', '/api/disconnect', '/api/command', '/api/mark', '/api/exit'):
                raise ValueError('Дождитесь завершения обновления')
            if route == '/api/connect':
                r.connect(body.get('port'))
            elif route == '/api/disconnect':
                r.disconnect()
            elif route == '/api/command':
                command = body.get('command')
                if not allowed_command(command):
                    raise ValueError('Unsupported command')
                return self.answer(r.request('command', command))
            elif route == '/api/mark':
                action = body.get('action')
                if not isinstance(action, str) or not 0 < len(action) <= 120:
                    raise ValueError('Invalid mark')
                return self.answer(r.request('mark', dict(action=action, bitrate=body.get('bitrate'))))
            elif route == '/api/recording/settings':
                r.configure_recording(body)
            elif route == '/api/bitrate/scan':
                if not r.connected or r.recording:
                    raise ValueError('Подключите ридер и остановите запись')
                r.job('scan', r.scan_bitrate)
            elif route == '/api/bitrate/cancel':
                r.scan_cancel.set()
            elif route == '/api/updates/check':
                r.job('check', r.check_updates)
            elif route == '/api/updates/app':
                r.job('program', r.update_program)
            elif route == '/api/updates/firmware':
                r.job('firmware', r.update_firmware)
            elif route == '/api/open-logs':
                folder = Path(r.log_path) if r.log_path else r.log_root
                folder.mkdir(parents=True, exist_ok=True)
                if os.name == 'nt':
                    os.startfile(str(folder))
            elif route == '/api/exit':
                r.disconnect()
                self.answer(dict(ok=True))
                threading.Thread(target=r.on_exit, daemon=True).start()
                return
            else:
                return self.answer(dict(ok=False, error='Unknown route'), 404)
            self.answer(dict(ok=True))
        except (ValueError, KeyError, OSError, queue.Full) as exc:
            self.answer(dict(ok=False, error=str(exc)), 400)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--flash':
        import traceback
        with (Path(sys.argv[3]) / 'esptool.log').open('w', encoding='utf-8', buffering=1) as output:
            sys.stdout = sys.stderr = output
            try:
                flash_helper(*sys.argv[2:5])
            except Exception:
                traceback.print_exc()
                raise SystemExit(1)
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--port', type=int, default=0, help='localhost HTTP port; 0 selects a free port')
    parser.add_argument('--logs', default=str(DATA / 'logs'))
    parser.add_argument('--data-dir', default=str(DATA), help='settings and upload queue directory')
    parser.add_argument('--no-update-check', action='store_true')
    args = parser.parse_args()
    data = Path(args.data_dir)
    data.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(filename=data / 'application.log', level=logging.INFO, encoding='utf-8')
    sharing = Sharing(data)
    sharing.start()
    runtime = Runtime(args.logs, sharing)
    Handler.runtime = runtime
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    runtime.on_exit = server.shutdown
    runtime.browser_required = not args.no_browser
    lifecycle_stop = threading.Event()
    def watch_browser():
        while not lifecycle_stop.wait(0.5):
            if runtime.browser_exit_due():
                try:
                    runtime.disconnect()
                finally:
                    server.shutdown()
                return
    threading.Thread(target=watch_browser, name='Browser lifetime', daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/'
    instances = data / 'instances'
    instances.mkdir(exist_ok=True)
    instance_file = instances / f'{os.getpid()}.json'
    instance_file.write_text(json.dumps(dict(pid=os.getpid(), url=url, version=VERSION)), encoding='utf-8')
    if sys.stdout:
        print('BafangReader', VERSION, url, flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    if not args.no_update_check:
        runtime.job('check', runtime.check_updates)
    try:
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        pass
    finally:
        lifecycle_stop.set()
        runtime.disconnect()
        sharing.close()
        server.server_close()
        instance_file.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
