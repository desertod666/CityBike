"""Persist opt-in locally; queue only completed, explicitly selected captures.

No shared credentials are embedded in the executable. A per-PC upload credential
is provisioned in sharing-credential.json (or DPAPI-protected .bin on Windows).
Uploads are bounded chunks, resumable/idempotent, and never delete local logs.
"""
import ctypes
from contextlib import contextmanager
from ctypes import wintypes
import hashlib
import http.client
import json
import logging
import os
from pathlib import Path
import sqlite3
import ssl
import tarfile
import threading
import time
from urllib.parse import urlsplit
import uuid

PART_SIZE = 2 * 1024 * 1024
CAPTURE_FILES = ('wire.bin', 'capture.jsonl', 'frames.csv', 'completed.json')


def protect(raw, decrypt=False):
    if os.name != 'nt':
        return raw
    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_byte))]
    buffer = ctypes.create_string_buffer(raw)
    source = Blob(len(raw), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    target = Blob()
    crypt = ctypes.windll.crypt32
    if decrypt:
        ok = crypt.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target))
    else:
        ok = crypt.CryptProtectData(ctypes.byref(source), 'CityBike upload credential', None, None, None, 1, ctypes.byref(target))
    if not ok:
        raise OSError('Windows credential protection failed')
    try:
        return ctypes.string_at(target.data, target.size)
    finally:
        ctypes.windll.kernel32.LocalFree(target.data)


def save_credential(data_dir, value):
    parsed = urlsplit(value['url'])
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.query or parsed.fragment:
        raise ValueError('Upload requires a configured HTTPS endpoint')
    data_dir = Path(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    target = data_dir / 'sharing-credential.bin'
    temporary = target.with_suffix('.tmp')
    temporary.write_bytes(protect(json.dumps(value).encode()))
    if os.name != 'nt':
        temporary.chmod(0o600)
    temporary.replace(target)


class Sharing:
    def __init__(self, data_dir):
        self.root = Path(data_dir)
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.halt = threading.Event()
        self.thread = None
        self.active_connection = None
        self.active = False
        self.error = ''
        self.retry_at = 0
        self.db_path = self.root / 'sharing.sqlite3'
        with self.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, folder TEXT UNIQUE, archive TEXT, status TEXT, part INTEGER DEFAULT 0, bytes INTEGER DEFAULT 0, error TEXT DEFAULT \'\')')
            defaults = {'enabled': False, 'mode': 'marked', 'duration': 60}
            for key, value in defaults.items():
                db.execute('INSERT OR IGNORE INTO settings VALUES (?,?)', (key, json.dumps(value)))

    @contextmanager
    def db(self):
        connection = sqlite3.connect(self.db_path, timeout=5)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def settings(self):
        with self.db() as db:
            return {key: json.loads(value) for key, value in db.execute('SELECT key,value FROM settings')}

    def configure(self, values):
        if set(values) - {'enabled', 'mode', 'duration'}:
            raise ValueError('Unknown setting')
        if 'enabled' in values and type(values['enabled']) is not bool:
            raise ValueError('Expected a checkbox value')
        if 'mode' in values and values['mode'] not in ('marked', 'continuous'):
            raise ValueError('Unknown recording mode')
        if 'duration' in values and (type(values['duration']) is not int or values['duration'] not in (30, 60)):
            raise ValueError('Choose 30 or 60 seconds')
        # Serializes OFF with starting the next network request.
        with self.lock, self.db() as db:
            for key, value in values.items():
                db.execute('UPDATE settings SET value=? WHERE key=?', (json.dumps(value), key))
            if values.get('enabled') is False and self.active_connection:
                self.active_connection.close()
            self.retry_at = 0

    def credential(self):
        path = self.root / 'sharing-credential.bin'
        if not path.exists():
            return None
        value = json.loads(protect(path.read_bytes(), decrypt=True))
        parsed = urlsplit(value['url'])
        if parsed.hostname and parsed.hostname.endswith('.invalid'):
            return None # Provisioned locally, awaiting a real deployment endpoint.
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.query or parsed.fragment:
            raise ValueError('Invalid upload endpoint')
        return value

    def enqueue(self, folder):
        if not self.settings()['enabled']:
            return
        folder = Path(folder).resolve()
        if not all((folder / name).is_file() for name in CAPTURE_FILES):
            raise ValueError('Only completed captures may be queued')
        with self.db() as db:
            db.execute('INSERT OR IGNORE INTO uploads(id,folder,status) VALUES (?,?,?)', (uuid.uuid4().hex, str(folder), 'pending'))

    def snapshot(self):
        with self.db() as db:
            pending = db.execute("SELECT count(*) FROM uploads WHERE status!='sent'").fetchone()[0]
            sent, size = db.execute("SELECT count(*),coalesce(sum(bytes),0) FROM uploads WHERE status='sent'").fetchone()
        try:
            cred = self.credential()
        except (OSError, ValueError):
            cred = None
        return dict(**self.settings(), configured=bool(cred), endpoint=cred['url'] if cred else '', pending=pending,
                    sent=sent, sent_bytes=size, active=self.active, error=self.error)

    def start(self):
        self.thread = threading.Thread(target=self.run, name='CityBike log uploads', daemon=True)
        self.thread.start()

    def close(self):
        self.halt.set()
        with self.lock:
            if self.active_connection:
                self.active_connection.close()
        if self.thread:
            self.thread.join(1)

    def check_enabled(self):
        if self.halt.is_set() or not self.settings()['enabled']:
            raise InterruptedError('Upload paused')

    def request(self, credential, method, route, data, headers=None):
        parsed = urlsplit(credential['url'])
        with self.lock:
            self.check_enabled()
            connection = http.client.HTTPSConnection(parsed.hostname, parsed.port, timeout=8, context=ssl.create_default_context())
            self.active_connection = connection
        try:
            connection.connect()
            connection.auto_open = 0 # OFF may close this socket; never reconnect implicitly.
            with self.lock:
                self.check_enabled()
            connection.request(method, parsed.path.rstrip('/') + route, data,
                {'Authorization': 'Bearer ' + credential['token'], 'Content-Type': 'application/json', **(headers or {})})
            response = connection.getresponse()
            result = json.loads(response.read(65536))
            if response.status >= 300 or not result.get('ok'):
                raise ValueError('Server rejected upload: HTTP ' + str(response.status) + ' ' + str(result.get('error', '')))
            return result
        finally:
            connection.close()
            with self.lock:
                if self.active_connection is connection:
                    self.active_connection = None

    def prepare(self, uid, folder):
        out = self.root / 'outbox'
        out.mkdir(exist_ok=True)
        target = out / (uid + '.tar.gz')
        if target.exists():
            return target
        temporary = out / (uid + '.part')
        with tarfile.open(temporary, 'w:gz', compresslevel=6) as archive:
            for name in CAPTURE_FILES:
                self.check_enabled()
                archive.add(Path(folder) / name, arcname=name)
        temporary.replace(target)
        return target

    def once(self):
        # Multiple desktop instances share one durable queue and one upload owner.
        with (self.root / 'upload.lock').open('a+b') as lock:
            lock.seek(0)
            if os.name == 'nt':
                import msvcrt
                if lock.read(1) == b'':
                    lock.write(b'0');lock.flush()
                lock.seek(0)
                try:
                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                except OSError:
                    return False
            else:
                import fcntl
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    return False
            return self._once()

    def _once(self):
        self.check_enabled()
        credential = self.credential()
        if not credential:
            self.error = 'Сервер ещё не настроен для этого ПК; логи остаются локально'
            return False
        with self.db() as db:
            row = db.execute("SELECT id,folder,part FROM uploads WHERE status!='sent' ORDER BY rowid LIMIT 1").fetchone()
        if not row:
            return False
        uid, folder, _ = row
        self.active = True
        try:
            archive = self.prepare(uid, folder)
            with archive.open('rb') as stream:
                sha = hashlib.file_digest(stream, 'sha256').hexdigest()
            size = archive.stat().st_size
            count = (size + PART_SIZE - 1) // PART_SIZE
            meta = dict(schema=1, id=uid, size=size, sha256=sha, parts=count, part_size=PART_SIZE, format='tar.gz')
            response = self.request(credential, 'POST', '/v1/uploads/' + uid, json.dumps(meta).encode())
            part = response['next_part']
            with archive.open('rb') as stream:
                stream.seek(part * PART_SIZE)
                while part < count:
                    self.check_enabled()
                    data = stream.read(PART_SIZE)
                    self.request(credential, 'PUT', f'/v1/uploads/{uid}/{part}', data,
                                 {'Content-Type': 'application/octet-stream', 'X-Content-SHA256': hashlib.sha256(data).hexdigest()})
                    part += 1
                    with self.db() as db:
                        db.execute('UPDATE uploads SET part=?,bytes=? WHERE id=?', (part, size, uid))
            self.request(credential, 'POST', f'/v1/uploads/{uid}/complete', b'{}')
            with self.db() as db:
                db.execute("UPDATE uploads SET status='sent',bytes=?,error='' WHERE id=?", (size, uid))
            self.error = ''
            # The original capture stays; only the redundant staged archive is removed.
            archive.unlink(missing_ok=True)
            return True
        finally:
            self.active = False

    def run(self):
        while not self.halt.wait(1):
            if time.monotonic() < self.retry_at or not self.settings()['enabled']:
                continue
            try:
                if not self.once():
                    self.retry_at = time.monotonic() + 10
            except InterruptedError:
                pass
            except Exception as exc:
                logging.exception('Log upload failed')
                self.error = str(exc)
                self.retry_at = time.monotonic() + 30
