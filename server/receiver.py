"""Private, idempotent CityBike capture receiver; no public read/list endpoint.

Bind localhost behind HTTPS. Store token hashes only, and provision a separate
per-installation token outside the source tree. Archives are never extracted.
"""
import argparse
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
import threading
import time

PART_SIZE = 2 * 1024 * 1024
MAX_ARCHIVE = 512 * 1024 * 1024
HEX = re.compile(r'[a-f0-9]{64}')
ID = re.compile(r'[a-f0-9]{32}')


class Storage:
    def __init__(self, root, clients, quota=2 * 1024**3, reserve=4 * 1024**3):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.clients = Path(clients)
        self.quota, self.reserve = quota, reserve
        self.lock = threading.RLock()

    def authorize(self, authorization):
        if not authorization.startswith('Bearer ') or len(authorization) > 256:
            raise PermissionError('Authentication required')
        digest = hashlib.sha256(authorization[7:].encode()).hexdigest()
        for client in json.loads(self.clients.read_text()).get('clients', []):
            if hmac.compare_digest(client.get('token_sha256', ''), digest) and ID.fullmatch(client.get('id', '')):
                return client['id']
        raise PermissionError('Invalid credential')

    def folder(self, client, uid):
        if not ID.fullmatch(client) or not ID.fullmatch(uid):
            raise ValueError('Invalid capture ID')
        return self.root / client / uid

    def usage(self):
        reserved = 0
        for path in self.root.glob('*/*/manifest.json'):
            reserved += json.loads(path.read_text())['size']
        return reserved

    def begin(self, client, uid, meta):
        folder = self.folder(client, uid)
        if (not isinstance(meta, dict) or meta.get('schema') != 1 or meta.get('id') != uid or type(meta.get('size')) is not int
                or not 0 < meta['size'] <= MAX_ARCHIVE or meta.get('part_size') != PART_SIZE
                or meta.get('parts') != (meta['size'] + PART_SIZE - 1) // PART_SIZE
                or not isinstance(meta.get('sha256'), str) or not HEX.fullmatch(meta['sha256'])
                or meta.get('format') != 'tar.gz'):
            raise ValueError('Invalid archive manifest')
        with self.lock:
            manifest = folder / 'manifest.json'
            if manifest.exists():
                if json.loads(manifest.read_text()) != meta:
                    raise ValueError('Capture ID already has different content')
            else:
                if self.usage() + meta['size'] > self.quota:
                    raise OSError('CityBike storage quota reached; local logs must be retained')
                if shutil.disk_usage(self.root).free < self.reserve + 2 * meta['size']:
                    raise OSError('Server free-space reserve reached')
                folder.mkdir(parents=True)
                manifest.write_text(json.dumps(meta))
            part = 0
            if (folder / 'receipt.json').exists():
                part = meta['parts']
            else:
                while (folder / f'{part:04}.part').exists():
                    part += 1
            return dict(ok=True, next_part=part)

    def put(self, client, uid, part, data, digest):
        folder = self.folder(client, uid)
        with self.lock:
            meta = json.loads((folder / 'manifest.json').read_text())
            if not 0 <= part < meta['parts']:
                raise ValueError('Invalid part')
            expected = min(PART_SIZE, meta['size'] - part * PART_SIZE)
            if len(data) != expected or hashlib.sha256(data).hexdigest() != digest:
                raise ValueError('Part length/hash mismatch')
            if (folder / 'receipt.json').exists():
                return dict(ok=True)
            target = folder / f'{part:04}.part'
            if target.exists():
                if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
                    raise ValueError('Different part already exists')
                return dict(ok=True)
            if shutil.disk_usage(self.root).free < self.reserve + len(data):
                raise OSError('Server free-space reserve reached')
            temporary = target.with_suffix('.tmp')
            with temporary.open('wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.replace(target)
            return dict(ok=True)

    def complete(self, client, uid):
        folder = self.folder(client, uid)
        with self.lock:
            receipt = folder / 'receipt.json'
            if receipt.exists():
                return json.loads(receipt.read_text())
            meta = json.loads((folder / 'manifest.json').read_text())
            digest = hashlib.sha256()
            total = 0
            temporary = folder / 'capture.tmp'
            try:
                with temporary.open('wb') as output:
                    for index in range(meta['parts']):
                        with (folder / f'{index:04}.part').open('rb') as source:
                            while chunk := source.read(1024 * 1024):
                                output.write(chunk)
                                digest.update(chunk)
                                total += len(chunk)
                    output.flush()
                    os.fsync(output.fileno())
                if total != meta['size'] or digest.hexdigest() != meta['sha256']:
                    raise ValueError('Complete archive hash mismatch')
                temporary.replace(folder / 'capture.tar.gz')
                result = dict(ok=True, id=uid, bytes=total, sha256=meta['sha256'], received_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
                receipt.write_text(json.dumps(result))
                for index in range(meta['parts']):
                    (folder / f'{index:04}.part').unlink()
                return result
            finally:
                temporary.unlink(missing_ok=True)


class Handler(BaseHTTPRequestHandler):
    store = None
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_):
        pass # No credentials, payloads or device identifiers in access logs.

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def answer(self, value, status=200):
        raw = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(raw)
        self.close_connection = True

    def do_GET(self):
        self.answer(dict(ok=True, service='CityBike capture receiver', protocol=1), 200 if self.path == '/health' else 404)

    def mutate(self):
        try:
            client = self.store.authorize(self.headers.get('Authorization', ''))
            match = re.fullmatch(r'/v1/uploads/([a-f0-9]{32})(?:/(complete|[0-9]{1,4}))?', self.path)
            if not match:
                raise ValueError('Invalid route')
            uid, operation = match.groups()
            length = int(self.headers.get('Content-Length', '-1'))
            if not 0 < length <= (PART_SIZE if self.command == 'PUT' else 4096):
                raise ValueError('Invalid content length')
            data = self.rfile.read(length)
            if len(data) != length:
                raise ValueError('Truncated request')
            if self.command == 'POST' and operation is None:
                result = self.store.begin(client, uid, json.loads(data))
            elif self.command == 'POST' and operation == 'complete':
                result = self.store.complete(client, uid)
            elif self.command == 'PUT' and operation and operation.isdecimal():
                result = self.store.put(client, uid, int(operation), data, self.headers.get('X-Content-SHA256', ''))
            else:
                raise ValueError('Invalid operation')
            self.answer(result)
        except PermissionError as exc:
            self.answer(dict(ok=False, error=str(exc)), 401)
        except (ValueError, KeyError, TypeError, FileNotFoundError) as exc:
            self.answer(dict(ok=False, error='Invalid or incomplete capture'), 400)
        except OSError as exc:
            self.answer(dict(ok=False, error='Storage unavailable or quota reached'), 507)

    do_POST = mutate
    do_PUT = mutate


class Server(ThreadingHTTPServer):
    daemon_threads = True
    slots = threading.BoundedSemaphore(8)

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', required=True)
    parser.add_argument('--clients', required=True)
    parser.add_argument('--port', type=int, default=18841)
    args = parser.parse_args()
    Handler.store = Storage(args.data, args.clients)
    with Server(('127.0.0.1', args.port), Handler) as server:
        server.serve_forever()


if __name__ == '__main__':
    main()
