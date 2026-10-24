import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from updates import validate_manifest, version_tuple, unpack_firmware, unpack_program, REPOSITORY
from desktop import allowed_command, Runtime


def manifest():
    prefix = f'https://github.com/{REPOSITORY}/releases/download/v0.2.0/'
    return dict(schema=1, repository=REPOSITORY, version='0.2.0',
                windows=dict(url=prefix+'BafangReader-Windows-x64.zip', sha256='a'*64, size=100),
                firmware=dict(url=prefix+'BafangReader-ESP32C3.zip', sha256='b'*64, size=100, chip='esp32c3'))


class UpdateTests(unittest.TestCase):
    def test_last_browser_close_reload_and_firmware_deferral(self):
        r=Runtime('unused')
        self.assertFalse(r.browser_exit_due(now=1000))
        first=r.browser_open(now=1000)
        r.browser_ping(first,leaving=True,now=1001)
        second=r.browser_open(now=1004) # Reload registers before old grace ends.
        self.assertFalse(r.browser_exit_due(now=1010))
        r.browser_ping(second,leaving=True,now=1011)
        self.assertFalse(r.browser_exit_due(now=1018))
        r.busy=True;r.job_kind='firmware'
        self.assertFalse(r.browser_exit_due(now=1020))
        r.busy=False
        self.assertTrue(r.browser_exit_due(now=1020))

    def test_browser_crash_has_heartbeat_timeout(self):
        r=Runtime('unused')
        token=r.browser_open(now=50)
        r.browser_ping(token,now=100)
        self.assertFalse(r.browser_exit_due(now=219))
        self.assertTrue(r.browser_exit_due(now=220))
    def test_versions_and_release_boundaries(self):
        self.assertGreater(version_tuple('0.10.0'), version_tuple('0.2.0'))
        self.assertEqual(validate_manifest(manifest())['version'], '0.2.0')
        for field, value in [('url','https://evil.example/app.zip'),('sha256','bad'),('size',-1)]:
            m=manifest(); m['windows'][field]=value
            with self.assertRaises(ValueError): validate_manifest(m)
        with self.assertRaises(ValueError): version_tuple('0.2.0;execute')
        m=manifest();m['firmware']['chip']='esp32s3'
        with self.assertRaises(ValueError): validate_manifest(m)

    def test_firmware_hash_and_offsets_before_flash(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp); archive=p/'firmware.zip'
            files=[dict(name=n,offset=o,sha256=hashlib.sha256(n.encode()).hexdigest()) for n,o in
                   [('bootloader.bin',0),('partitions.bin',0x8000),('firmware.bin',0x10000)]]
            m=dict(version='0.2.0',chip='esp32c3',flash_size='4MB',files=files)
            def write(data):
                with zipfile.ZipFile(archive,'w') as z:
                    z.writestr('firmware.json',json.dumps(data))
                    for f in files:z.writestr(f['name'],f['name'].encode())
                    z.writestr('../outside','must never be extracted')
            write(m)
            self.assertEqual(unpack_firmware(archive,p/'out')['version'],'0.2.0')
            self.assertFalse((p/'outside').exists())
            bad=copy.deepcopy(m);bad['files'][0]['offset']=0x9000;write(bad)
            with self.assertRaises(ValueError):unpack_firmware(archive,p/'bad')
            bad=copy.deepcopy(m);bad['files'][2]['sha256']='0'*64;write(bad)
            with self.assertRaises(ValueError):unpack_firmware(archive,p/'bad-hash')

    def test_program_extracts_only_expected_executable(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);a=p/'app.zip'
            with zipfile.ZipFile(a,'w') as z:
                z.writestr('BafangReader.exe',b'fake executable, synthetic test')
                z.writestr('../outside',b'no')
            self.assertTrue(unpack_program(a,p/'out').exists())
            self.assertFalse((p/'outside').exists())

    def test_no_transmit_or_shell_commands(self):
        for c in ['STOP','START 125000','LED ACTIVE LOW','WIFI 6 BafangReader-1234']:
            self.assertTrue(allowed_command(c))
        for c in ['TX 123 00','START 123456','STOP\nTX','WIFI 6 bad"name','LED GPIO 18 LOW']:
            self.assertFalse(allowed_command(c))

    def test_desktop_preview_counts_eviction(self):
        r=Runtime('unused')
        r.device={'boot':'synthetic','received':600}
        r.frames.extend(dict(seq=i,id='123',data='',boot='synthetic') for i in range(1,601))
        p=r.preview(1)
        self.assertEqual((p['oldest'],p['latest'],p['missed']),(89,600,87))
        self.assertEqual(len(p['frames']),64)
