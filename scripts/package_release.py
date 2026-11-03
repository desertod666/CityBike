"""Build verified public assets. Private source SYM and device logs never enter ZIPs."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import re
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-exe',action='store_true')
    parser.add_argument('--exe-only',action='store_true')
    args=parser.parse_args()
    if not args.exe_only:
        parser.error('Legacy combined release is retired. Build reader/ on GitHub and verify its ci-artifacts; --exe-only builds the legacy desktop app without firmware.')
    project=json.loads((ROOT/'project.json').read_text(encoding='utf-8'))
    sys.path.insert(0,str(ROOT/'pc'))
    from updates import VERSION,REPOSITORY
    from sym_decoder import verify_tables, verify_bundled
    references = (ROOT/'reference'/'BafangReader_Handoff'/'protocol', ROOT)
    for reference in references:
        if (reference/'SYSTEM TESTING_BAFANG SYSTEM_V1.sym').exists():
            source = verify_tables(reference)
            verify_bundled(ROOT/'pc'/'decoder_reference.json', source)
            verify_bundled(ROOT/'web'/'decoder_reference.json', source)
    assert (ROOT/'pc'/'decoder_reference.json').read_bytes() == (ROOT/'web'/'decoder_reference.json').read_bytes(), 'PC/web decoder mismatch'
    assert VERSION==project['version'] and REPOSITORY==project['repository']
    firmware_version=re.search(r'#define VERSION "([^"]+)"',(ROOT/'src/main.c').read_text(encoding='utf-8'))[1]
    cmake_version=re.search(r'set\(PROJECT_VER "([^"]+)"\)',(ROOT/'CMakeLists.txt').read_text(encoding='utf-8'))[1]
    assert firmware_version==VERSION and cmake_version==VERSION, 'Version mismatch before release'
    if not args.skip_exe:
        subprocess.run([sys.executable,'-m','PyInstaller','--noconfirm','--clean','--onefile','--noconsole',
            '--name','BafangReader','--distpath',str(ROOT/'dist'),'--workpath',str(ROOT/'build'/'desktop'),
            '--specpath',str(ROOT/'build'),'--add-data',str(ROOT/'web')+':web',
            '--add-data',str(ROOT/'pc'/'decoder_reference.json')+':.',
            '--collect-all','esptool',str(ROOT/'pc'/'desktop.py')],cwd=ROOT,check=True)
    if args.exe_only:
        return
    out=ROOT/'release';out.mkdir(exist_ok=True)
    program=out/project['asset']
    readme=(f"BafangReader {VERSION}\n\nRun BafangReader.exe. Open the local browser UI.\n"
            "Select the ESP32 USB COM port explicitly, connect, choose the known CAN bitrate and start listen-only capture.\n"
            "Logs are stored in diag-logs beside BafangReader.exe, with a subfolder per recording.\n"
            "Updates need internet; capture does not. Firmware update is only for ESP32-C3, never Bafang.\n"
            f"Source and releases: https://github.com/{REPOSITORY}\n")
    with zipfile.ZipFile(program,'w',zipfile.ZIP_DEFLATED) as z:
        z.write(ROOT/'dist'/'BafangReader.exe','BafangReader.exe')
        z.writestr('README.txt',readme)
        z.writestr('version.json',json.dumps(project))
    firmware=out/'BafangReader-ESP32C3.zip'
    fm=dict(version=VERSION,chip='esp32c3',flash_size='4MB',files=[])
    for name,offset in [('bootloader.bin',0),('partitions.bin',0x8000),('firmware.bin',0x10000)]:
        path=ROOT/'artifacts'/name
        fm['files'].append(dict(name=name,offset=offset,sha256=digest(path)))
    with zipfile.ZipFile(firmware,'w',zipfile.ZIP_DEFLATED) as z:
        for item in fm['files']:z.write(ROOT/'artifacts'/item['name'],item['name'])
        z.writestr('firmware.json',json.dumps(fm,indent=2))
    manifest=dict(schema=1,repository=REPOSITORY,version=VERSION)
    for key,path in [('windows',program),('firmware',firmware)]:
        manifest[key]=dict(url=f'https://github.com/{REPOSITORY}/releases/download/v{VERSION}/{path.name}',sha256=digest(path),size=path.stat().st_size)
    manifest['firmware']['chip']='esp32c3'
    (out/'latest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    from updates import validate_manifest,unpack_firmware
    validate_manifest(manifest)
    unpack_firmware(firmware,ROOT/'build'/'verify-firmware')
    print(json.dumps(manifest,indent=2))


if __name__=='__main__':main()
