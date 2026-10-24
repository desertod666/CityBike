"""Public GitHub release updates. HTTPS, bounded downloads, SHA256, fixed assets."""
import hashlib
import json
from pathlib import Path
import re
import urllib.request
from urllib.parse import urlparse
import zipfile

VERSION = '0.2.1'
REPOSITORY = 'desertod666/CityBike'
RELEASE_URL = f'https://github.com/{REPOSITORY}/releases/latest'
DOWNLOAD_URL = RELEASE_URL + '/download/BafangReader-Windows-x64.zip'
MANIFEST_URL = RELEASE_URL + '/download/latest.json'


def version_tuple(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d+\.\d+\.\d+', value):
        raise ValueError('Invalid stable version')
    return tuple(int(x) for x in value.split('.'))


def fetch_manifest(url=MANIFEST_URL):
    request = urllib.request.Request(url, headers={'User-Agent': 'BafangReader/' + VERSION})
    with urllib.request.urlopen(request, timeout=8) as response:
        if urlparse(response.geturl()).scheme != 'https':
            raise ValueError('HTTPS required')
        raw = response.read(65537)
    if len(raw) > 65536:
        raise ValueError('Update manifest too large')
    return validate_manifest(json.loads(raw))


def validate_manifest(manifest):
    if manifest.get('schema') != 1 or manifest.get('repository') != REPOSITORY:
        raise ValueError('Unexpected update manifest')
    version = manifest.get('version')
    version_tuple(version)
    for name, limit in [('windows', 200 * 1024 * 1024), ('firmware', 8 * 1024 * 1024)]:
        asset = manifest[name]
        expected = f'https://github.com/{REPOSITORY}/releases/download/v{version}/'
        if not isinstance(asset.get('url'), str) or not asset['url'].startswith(expected):
            raise ValueError('Update URL outside release')
        suffix = asset['url'][len(expected):]
        if not re.fullmatch(r'[A-Za-z0-9_.-]+\.zip', suffix):
            raise ValueError('Invalid asset name')
        if not re.fullmatch(r'[a-f0-9]{64}', asset.get('sha256', '')):
            raise ValueError('Invalid SHA256')
        if type(asset.get('size')) is not int or not 0 < asset['size'] <= limit:
            raise ValueError('Invalid update size')
    if manifest['firmware'].get('chip') != 'esp32c3':
        raise ValueError('Unexpected firmware target')
    return manifest


def download_asset(asset, destination):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + '.part')
    digest, count = hashlib.sha256(), 0
    try:
        request = urllib.request.Request(asset['url'], headers={'User-Agent': 'BafangReader/' + VERSION})
        with urllib.request.urlopen(request, timeout=12) as response, temporary.open('wb') as out:
            if urlparse(response.geturl()).scheme != 'https':
                raise ValueError('HTTPS required')
            while True:
                block = response.read(65536)
                if not block:
                    break
                count += len(block)
                if count > asset['size']:
                    raise ValueError('Download exceeded declared size')
                digest.update(block)
                out.write(block)
        if count != asset['size'] or digest.hexdigest() != asset['sha256']:
            raise ValueError('Update SHA256/size mismatch')
        temporary.replace(destination)
        return destination
    finally:
        temporary.unlink(missing_ok=True)


def unpack_program(archive, folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        info = z.getinfo('BafangReader.exe')
        if info.file_size > 160 * 1024 * 1024:
            raise ValueError('Program executable too large')
        with z.open(info) as source, (folder / 'BafangReader.exe').open('wb') as out:
            while block := source.read(65536):
                out.write(block)
    return folder / 'BafangReader.exe'


def unpack_firmware(archive, folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    allowed = {'bootloader.bin': 0, 'partitions.bin': 0x8000, 'firmware.bin': 0x10000}
    with zipfile.ZipFile(archive) as z:
        manifest_info = z.getinfo('firmware.json')
        if manifest_info.file_size > 16384:
            raise ValueError('Firmware manifest too large')
        manifest = json.loads(z.read(manifest_info))
        version_tuple(manifest['version'])
        if manifest.get('chip') != 'esp32c3' or manifest.get('flash_size') != '4MB':
            raise ValueError('Firmware is not for this ESP32-C3')
        files = manifest['files']
        if len(files) != 3 or {f['name'] for f in files} != set(allowed):
            raise ValueError('Unexpected firmware files')
        for item in files:
            name = item['name']
            if item['offset'] != allowed[name] or z.getinfo(name).file_size > (2 * 1024 * 1024):
                raise ValueError('Invalid firmware offset/size')
            raw = z.read(name)
            if hashlib.sha256(raw).hexdigest() != item['sha256']:
                raise ValueError('Firmware file SHA256 mismatch')
            (folder / name).write_bytes(raw)
        (folder / 'firmware.json').write_text(json.dumps(manifest), encoding='utf-8')
    return manifest
