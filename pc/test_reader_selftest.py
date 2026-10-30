"""Synthetic owner jobs and genuine C-execution test fixtures; no device access."""
import copy
import json
from pathlib import Path
import unittest
import test_remote_operator as base
from reader_selftest import sanitize_selftest


class ReaderSelftestTests(unittest.TestCase):
    setUp = base.RemoteOperatorTests.setUp
    tearDown = base.RemoteOperatorTests.tearDown
    heartbeat = base.RemoteOperatorTests.heartbeat
    error = base.RemoteOperatorTests.error

    def ready(self):
        self.report['device'].update(version='0.5.5', epoch=7, capabilities=['command_ids', 'isolated_twai_selftest_v1'])
        self.report['control']['capabilities'].append('reader_selftest')
        self.report['control']['web_build'] = '20261028-selftest1'
        self.report['sequence'] += 1
        self.report['device']['uptime_us'] += 1000
        self.heartbeat()

    def body(self):
        return dict(id='c'*32, action='reader_selftest', isolation_asserted=True,
                    expected_mac=self.report['device']['ap_mac'], expected_boot=self.report['device']['boot'])

    def enqueue(self, body):
        return self.store.operator.enqueue(self.auth, body)

    def test_explicit_isolation_scope_and_single_delivery(self):
        self.ready()
        for key in ('isolation_asserted', 'expected_mac', 'expected_boot'):
            bad=self.body();del bad[key]
            self.error('invalid_request', lambda: self.enqueue(bad))
        for value in (False, 1, 'true'):
            bad=self.body();bad['isolation_asserted']=value
            self.error('invalid_request', lambda: self.enqueue(bad))
        bad=self.body();bad['expected_boot']='DEADBEEF'
        self.error('permission_denied', lambda: self.enqueue(bad))
        queued=self.enqueue(self.body());self.assertEqual(queued['job']['state'], 'queued')
        path=self.store.root/'control'/self.uid/'pending.json';before=path.read_bytes();job=json.loads(before)
        self.assertTrue(job['isolation_asserted']);self.assertEqual(job['expected_boot'], self.body()['expected_boot'])
        self.assertEqual(self.enqueue(self.body())['job']['id'], queued['job']['id']);self.assertEqual(path.read_bytes(), before)
        self.report['sequence']+=1;self.report['device']['uptime_us']+=1000
        delivered=self.heartbeat()
        self.assertEqual(delivered['kind'], 'reader_selftest');self.assertTrue(delivered['isolation_asserted'])
        self.assertNotIn('key_sha256', delivered)
        tampered=dict(job, isolation_asserted=False);path.write_text(json.dumps(tampered))
        self.assertIsNone(self.heartbeat())
        path.write_bytes(before)
        self.now+=70
        self.assertEqual(self.enqueue(self.body())['job']['id'], queued['job']['id']);self.assertEqual(path.read_bytes(), before)

    def test_old_firmware_busy_and_identity_changes_refused(self):
        self.ready();self.report['device']['version']='0.5.4';self.report['sequence']+=1;self.report['device']['uptime_us']+=1000;self.heartbeat()
        self.error('unsupported_client', lambda: self.enqueue(self.body()))
        self.ready();self.report['control']['busy']=True;self.report['sequence']+=1;self.report['device']['uptime_us']+=1000;self.heartbeat()
        self.error('reader_busy', lambda: self.enqueue(self.body()))

    def test_bounded_results_and_boot_separation(self):
        fixtures=json.loads((Path(__file__).resolve().parents[1]/'pc/fixtures/reader-selftest-055.json').read_text())['results']
        for raw in fixtures:
            device=dict(product='BafangReader', boot=raw['boot'], epoch=raw['epoch'])
            value=dict(phase='complete' if raw['state']=='complete' else 'failed', error=None, result=raw)
            self.assertIsNotNone(sanitize_selftest(value, device)['result'])
            bad=copy.deepcopy(value);bad['result']['boot']='00000000'
            self.assertIsNone(sanitize_selftest(bad, device)['result'])
            bad=copy.deepcopy(value);bad['result']['stages'][0]['bus_errors']=True
            self.assertIsNone(sanitize_selftest(bad, device)['result'])
        modern=json.loads((Path(__file__).resolve().parents[1]/'pc/fixtures/reader-selftest-056.json').read_text())['results']
        for raw in modern:
            device=dict(product='BafangReader', version='0.5.6', boot=raw['boot'], epoch=raw['epoch'])
            value=dict(phase=raw['state'] if raw['state']=='complete' else 'failed', result=raw)
            self.assertEqual(sanitize_selftest(value, device)['result']['test_frame_dlc'], 8)
            bad=copy.deepcopy(value);bad['result'].pop('test_frame_dlc')
            self.assertIsNone(sanitize_selftest(bad, device)['result'])
        device=dict(product='BafangReader', boot=fixtures[0]['boot'], epoch=fixtures[0]['epoch'])
        raw=copy.deepcopy(fixtures[0]);raw['stages'][0]['bus_errors']=1
        self.assertIsNone(sanitize_selftest(dict(phase='complete', result=raw), device)['result'])

    def test_gpio_probe_and_pre_cleanup_error_preserved(self):
        raw=json.loads((Path(__file__).resolve().parents[1]/'pc/fixtures/reader-selftest-056.json').read_text())['results'][0]
        raw['gpio_probe']=dict(attempted=True, passed=True, ctx_restored=True, reason='gpio_loopback_verified',
            driver_installed=False, low_hold_us=100, tx=[1,0,1], rx=[1,0,1], low_rc=0, high_rc=0)
        raw['stage3_ecc']=dict(after_event=5, captured_before_cleanup=True, last=dict(source='single_HAL_ECC_read',
            scope='boot_history',event=6,t_us=123,raw=129,type=2,direction=0,segment=1,saturated=False))
        d=dict(product='BafangReader',version='0.6.7',boot=raw['boot'],epoch=raw['epoch'])
        def clean(v): return sanitize_selftest(dict(phase='complete',result=v),d)['result']
        self.assertEqual(clean(raw)['gpio_probe'],raw['gpio_probe'])
        self.assertEqual(clean(raw)['stage3_ecc'],raw['stage3_ecc'])
        for field,value in [('driver_installed',True),('passed',False),('rx',[1,1,1]),('tx',[1,False,1]),('low_hold_us',1000),('high_rc',-1)]:
            bad=copy.deepcopy(raw);bad['gpio_probe'][field]=value;self.assertIsNone(clean(bad))
        for field,value in [('captured_before_cleanup',False),('after_event',6),('last',dict(raw['stage3_ecc']['last'],type=1))]:
            bad=copy.deepcopy(raw);bad['stage3_ecc'][field]=value;self.assertIsNone(clean(bad))
        for field in ('gpio_probe','stage3_ecc'):
            bad=copy.deepcopy(raw);bad.pop(field);self.assertIsNone(clean(bad))
        raw['stage3_ecc']['last']=None
        self.assertIsNotNone(clean(raw))


if __name__=='__main__':
    unittest.main()
