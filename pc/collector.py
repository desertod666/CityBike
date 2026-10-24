"""Windows USB capture; wire bytes are retained before parsing or decoding."""
import argparse
import csv
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import queue
import re
import sys
import threading
import time
import uuid

import serial
from serial.tools import list_ports
from sym_decoder import Decoder

BITRATES = (10000, 20000, 50000, 100000, 125000, 250000, 500000, 800000, 1000000)


def utc():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


def select_port(name=None):
    ports = sorted(list_ports.comports(), key=lambda p: p.device)
    if name:
        matches = [p for p in ports if p.device.upper() == name.upper()]
    else:
        matches = [p for p in ports if (p.vid, p.pid) == (0x303A, 0x1001)]
    if len(matches) != 1:
        raise ValueError('Specify --port COMn explicitly; selection is ambiguous or absent. Use --list.')
    return matches[0]


def open_port(name):
    # Set modem lines BEFORE opening: do not deliberately reset into bootloader.
    s = serial.Serial(port=None, baudrate=115200, timeout=0.1, write_timeout=0.5)
    s.dtr = False
    s.rts = False
    s.port = name
    s.open()
    return s


class Capture:
    COLUMNS = ('host_utc', 'host_monotonic_ns', 'session', 'boot', 'epoch', 't_us',
               'seq', 'id', 'extended', 'rtr', 'dlc', 'data', 'decode_status', 'decoded_json')

    def __init__(self, folder):
        if folder is not None:
            folder.mkdir(parents=True, exist_ok=False)
        self.decoder = Decoder()
        self.wire = (folder / 'wire.bin' if folder else Path(os.devnull)).open('wb')
        self.events = (folder / 'capture.jsonl' if folder else Path(os.devnull)).open('w', encoding='utf-8', buffering=1)
        self.csv_file = (folder / 'frames.csv' if folder else Path(os.devnull)).open('w', encoding='utf-8-sig', newline='')
        self.csv = csv.DictWriter(self.csv_file, fieldnames=self.COLUMNS)
        self.csv.writeheader()
        self.session = ''
        self.buf = bytearray()
        self.frames = self.invalid = self.gaps = self.resets = 0
        self.resyncs = 0
        self.last_boot = self.last_us = self.last_seq = None
        self.last_status = None
        self.event('metadata', sym_sha256=self.decoder.sha256,
                   compatibility='unconfirmed', timestamp_semantics='ESP software dequeue us, host UTC on line processing')

    def event(self, typ, **data):
        obj = dict(host_utc=utc(), host_monotonic_ns=time.monotonic_ns(), session=self.session, type=typ, **data)
        self.events.write(json.dumps(obj, ensure_ascii=False) + '\n')
        return obj

    def new_session(self, **info):
        if self.buf:
            self.event('partial_line', raw_hex=self.buf.hex())
        self.buf.clear()
        self.session = str(uuid.uuid4())
        self.last_boot = self.last_us = self.last_seq = None
        self.last_status = None
        self.event('session', **info)

    def feed(self, data):
        self.wire.write(data)
        self.buf.extend(data)
        output = []
        while b'\n' in self.buf:
            line, _, tail = self.buf.partition(b'\n')
            self.buf = bytearray(tail)
            output.append(self.line(bytes(line)))
        if len(self.buf) > 16384:
            self.event('oversize_fragment', raw_hex=self.buf.hex())
            self.buf.clear()
            self.invalid += 1
        return output

    def line(self, line):
        raw = line.decode('utf-8', errors='replace')
        try:
            msg = json.loads(raw)
            if not isinstance(msg, dict):
                raise ValueError('JSON is not an object')
        except (ValueError, TypeError):
            # Older firmware may prepend a truncated SDK log to a complete JSON
            # record. Keep original bytes/text and recover only a valid suffix.
            start = raw.find('{"type":')
            try:
                if start <= 0:
                    raise ValueError('No framed suffix')
                msg = json.loads(raw[start:])
                if not isinstance(msg, dict) or msg.get('type') not in ('status','hello','help','error','frame','log'):
                    raise ValueError('Not a protocol record')
                self.resyncs += 1
                self.event('transport_resync', raw_prefix=raw[:start], recovered_type=msg['type'])
            except (ValueError, TypeError):
                self.event('service_log', raw=raw, raw_hex=line.hex())
                return None
        boot = msg.get('boot')
        us = msg.get('t_us', msg.get('uptime_us'))
        if boot and self.last_boot and boot != self.last_boot:
            self.resets += 1
            self.new_session(reason='device_reset', previous_boot=self.last_boot, boot=boot)
        elif us is not None and self.last_us is not None and us < self.last_us and msg.get('type') == 'status':
            # A queued older frame may follow STATUS. Only compare status times here.
            self.resets += 1
            self.new_session(reason='device_time_reset', previous_us=self.last_us, device_us=us)
        if boot:
            self.last_boot = boot
        if msg.get('type') == 'status':
            self.last_status = msg
            self.last_us = us
        elif msg.get('type') in ('help', 'error'):
            print(json.dumps(msg, ensure_ascii=False))
        record = self.event('device', device=msg, raw=raw)
        if msg.get('type') == 'frame':
            decoded = self.decoder.decode(msg)
            self.frames += 1
            if decoded['status'] == 'invalid':
                self.invalid += 1
            seq = msg.get('seq')
            if isinstance(seq, int):
                if self.last_seq is not None:
                    if seq > self.last_seq + 1:
                        gap = seq - self.last_seq - 1
                        self.gaps += gap
                        self.event('sequence_gap', missing=gap, previous=self.last_seq, current=seq)
                    elif seq <= self.last_seq:
                        self.event('sequence_regression', previous=self.last_seq, current=seq)
                self.last_seq = seq
            row = {k: record[k] for k in ('host_utc', 'host_monotonic_ns', 'session')}
            row.update({k: msg.get(k) for k in self.COLUMNS if k in msg})
            row.update(decode_status=decoded['status'], decoded_json=json.dumps(decoded, ensure_ascii=False))
            self.csv.writerow(row)
            self.event('decode', seq=seq, result=decoded)
        return msg

    def flush(self):
        self.wire.flush()
        self.events.flush()
        self.csv_file.flush()

    def close(self):
        error = None
        try:
            if self.buf:
                self.event('partial_line', raw_hex=self.buf.hex())
            self.event('summary', frames=self.frames, invalid=self.invalid, sequence_gaps=self.gaps, resets=self.resets,
                       transport_resyncs=getattr(self,'resyncs',0))
            self.flush()
        except OSError as exc:
            error = exc
        finally:
            for handle in (self.wire, self.events, self.csv_file):
                try:
                    handle.close()
                except OSError as exc:
                    error = error or exc
        if error:
            raise error


def send(s, cap, command):
    data = (command + '\n').encode('ascii')
    if s.write(data) != len(data):
        raise serial.SerialTimeoutException('Incomplete command write')
    cap.event('command_sent', command=command)


def wait_status(s, cap, seconds=3, stopped=False):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        for msg in cap.feed(s.read(max(1, min(s.in_waiting, 8192)))):
            if msg and msg.get('type') == 'status' and msg.get('product') == 'BafangReader' and msg.get('protocol') == 1:
                if not stopped or msg.get('can') == 'stopped':
                    return msg
    raise serial.SerialException('BafangReader STATUS response missing')


def keyboard(q):
    while True:
        try:
            q.put(input())
        except EOFError:
            return


def run(args):
    port = select_port(args.port)
    folder = Path(args.output) / (datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6])
    cap = Capture(folder)
    print(f'Port {port.device} ({port.hwid}); logs: {folder.resolve()}')
    print('Commands: start <bitrate>, stop, status, help, mark <action>, led low|high|auto, quit')
    q = queue.Queue()
    if not args.no_input:
        threading.Thread(target=keyboard, args=(q,), daemon=True).start()
    s = None
    recognized = False
    first = True
    identity = (port.vid, port.pid, port.serial_number)
    end = time.monotonic() + args.duration if args.duration else float('inf')
    next_status = next_print = 0
    try:
        while time.monotonic() < end:
            try:
                if s is None:
                    current = select_port(port.device)
                    if (current.vid, current.pid, current.serial_number) != identity:
                        raise ValueError('Port identity changed; refusing to open another device')
                    s = open_port(port.device)
                    cap.new_session(reason='serial_open', port=port.device, hwid=current.hwid)
                    # Identify our firmware before issuing any control command.
                    send(s, cap, 'STATUS')
                    status = wait_status(s, cap)
                    recognized = True
                    print(f"BafangReader {status.get('version')}, boot={status.get('boot')}, reset_reason={status.get('reset_reason')}")
                    send(s, cap, 'STOP')
                    wait_status(s, cap, stopped=True)
                    if first and args.bitrate:
                        send(s, cap, f'START {args.bitrate}')
                    first = False
                    print('Connected. Reconnection always leaves CAN stopped; use start explicitly.')
                    next_status = time.monotonic() + 2
                cap.feed(s.read(max(1, min(s.in_waiting, 8192))))
                while not q.empty():
                    text = q.get().strip()
                    lower = text.lower()
                    if lower == 'quit':
                        return 0
                    if lower.startswith('mark '):
                        cap.event('mark', action=text[5:])
                        print('Marked:', text[5:])
                    elif lower in ('stop', 'status', 'help', 'led low', 'led high', 'led auto'):
                        send(s, cap, text.upper())
                    elif re.fullmatch(r'start \d+', lower) and int(lower[6:]) in BITRATES:
                        send(s, cap, text.upper())
                    elif text:
                        print('Unknown command or bitrate')
                now = time.monotonic()
                if now >= next_status:
                    send(s, cap, 'STATUS')
                    next_status = now + 2
                if now >= next_print:
                    st = cap.last_status or {}
                    print(f"frames={cap.frames} gaps={cap.gaps} invalid={cap.invalid} CAN={st.get('can')} "
                          f"RXmiss={st.get('rx_missed')} overrun={st.get('rx_overrun')} "
                          f"USBdrop={st.get('usb_frame_drops')} queuedrop={st.get('frame_queue_drops')}")
                    cap.flush()
                    next_print = now + 2
            except (serial.SerialException, OSError) as exc:
                cap.event('disconnect', error=str(exc))
                if s:
                    s.close()
                s = None
                recognized = False
                if not args.reconnect:
                    raise
                print(f'Disconnected: {exc}; retry same port in 1 second')
                time.sleep(min(1, max(0, end - time.monotonic())))
    except KeyboardInterrupt:
        print('Stopping capture')
    finally:
        if s and s.is_open and recognized:
            try:
                send(s, cap, 'STOP')
                st = wait_status(s, cap, stopped=True)
                cap.event('stop_confirmed', status=st)
                # Drain already buffered frames after the stop response.
                deadline = time.monotonic() + 0.3
                while time.monotonic() < deadline:
                    cap.feed(s.read(max(1, min(s.in_waiting, 8192))))
            except (serial.SerialException, OSError) as exc:
                cap.event('stop_unconfirmed', error=str(exc))
                print('STOP unconfirmed:', exc)
            finally:
                s.close()
        elif s:
            s.close()
        cap.close()
        print(f'Saved {cap.frames} frames to {folder.resolve()}')
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--list', action='store_true')
    p.add_argument('--port', help='COMn; otherwise one unique 303A:1001 device required')
    p.add_argument('--bitrate', type=int, choices=BITRATES, help='explicit initial listen-only START; default stopped')
    p.add_argument('--duration', type=float, default=0, help='total seconds; 0 until quit/Ctrl+C')
    p.add_argument('--output', default=str(Path(__file__).resolve().parents[1] / 'logs'))
    p.add_argument('--reconnect', action='store_true', help='retry same port and USB identity; never auto-start again')
    p.add_argument('--no-input', action='store_true')
    args = p.parse_args()
    if args.duration < 0:
        p.error('--duration must be >= 0')
    if args.list:
        for x in list_ports.comports():
            print(f'{x.device}: {x.description}; {x.hwid}')
        return 0
    try:
        return run(args)
    except (ValueError, serial.SerialException, OSError) as exc:
        print(f'Capture failed: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
