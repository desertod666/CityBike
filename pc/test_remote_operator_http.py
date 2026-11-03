"""Independent operator API integration tests: loopback HTTP, temporary state, no devices.

Tests deliberately exercise the real Handler/ThreadingHTTPServer boundary rather
than calling the operator storage helpers directly. Tokens and jobs are synthetic.
"""
import copy
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import http.client
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from receiver import Handler, Server, Storage


class RemoteOperatorHTTPTests(unittest.TestCase):
    MAC = 'e0:72:a1:72:38:d9'
    OWNER_TOKEN = 'synthetic-owner-http-test'
    UPLOAD_TOKEN = 'synthetic-upload-http-test'
    INITIAL_KEY = 'b' * 64
    BOOT = 'AABBCCDD'

    @staticmethod
    def digest(value):
        return hashlib.sha256(value.encode()).hexdigest()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='operator-http-')
        self.root = Path(self.tmp.name)
        self.config = self.root / 'config'
        self.config.mkdir()
        self.clients = self.config / 'clients.json'
        self.clients.write_text(json.dumps({'clients': [{
            'id': uuid.uuid4().hex, 'token_sha256': self.digest(self.UPLOAD_TOKEN)}]}))
        self.control_policy = self.config / 'control-policy.json'
        self.control_policy.write_text(json.dumps(dict(schema=1, enabled=True, manual_lock=False)))
        self.operator_policy = self.config / 'operator-policy.json'
        self.operator_policy.write_text(json.dumps(dict(
            schema=1, enabled=True, mac=self.MAC,
            token_sha256=self.digest(self.OWNER_TOKEN),
            initial_bridge_key_sha256=self.digest(self.INITIAL_KEY))))
        self.now = time.time()
        # All request threads see the same controlled server clock. No sleeps
        # or browser-provided UTC are needed to test expiry/freshness boundaries.
        self.time_patch = patch('time.time', side_effect=lambda: self.now)
        self.time_patch.start()
        self.addCleanup(self.time_patch.stop)
        store = Storage(self.root / 'data', self.clients, reserve=0,
                        control_policy=self.control_policy, operator_policy=self.operator_policy)

        class TestHandler(Handler):
            pass

        TestHandler.store = store
        TestHandler.web_root = Path(__file__).resolve().parents[1] / 'web'
        self.handler = TestHandler
        self.server = Server(('127.0.0.1', 0), TestHandler)
        self.assertIsInstance(self.server, ThreadingHTTPServer)
        self.thread = threading.Thread(
            target=lambda: self.server.serve_forever(poll_interval=0.01), daemon=True)
        self.thread.start()
        self.uid = uuid.uuid4().hex
        self.packet = self.report()

    def tearDown(self):
        if hasattr(self, 'server'):
            self.server.shutdown()
            self.server.server_close()
            self.thread.join(timeout=3)
        self.tmp.cleanup()

    def report(self, sequence=1, uptime_us=1_000_000, boot=None):
        return dict(
            schema=1, source='browser-usb', sequence=sequence, connected=True, events=[],
            host_utc=datetime.fromtimestamp(self.now, timezone.utc).isoformat(),
            device=dict(product='BafangReader', protocol=1, ap_mac=self.MAC,
                        boot=boot or self.BOOT, version='0.4.8', uptime_us=uptime_us,
                        can='stopped', bitrate=250000, epoch=7, tx_gpio=4, rx_gpio=5,
                        twai_tx_gpio=10, capabilities=['command_ids', 'stream_end'],
                        sampling_profiles=['DEFAULT', 'LATE', 'TRIPLE', 'LATE_TRIPLE',
                                           'SP625', 'SP625_TRIPLE', 'SP6875', 'SP6875_TRIPLE',
                                           'MID', 'MID_TRIPLE'],
                        rx_sampling_250k='TRIPLE', rx_check=dict(state='idle'),
                        ctx_guard=dict(policy='fixed_recessive', valid=True, level=1,
                                       out_sel=128, mux=1, enabled=True, input_enabled=True,
                                       latch_high=True, inverted=False)),
            control=dict(version=2, recorder_version=2, ready=True,
                         web_build='synthetic-operator-http-test',
                         capabilities=['rx_check', 'capture', 'stop', 'flash', 'sampling',
                                       'sampling_sweep', 'spard_probe'],
                         last=None, busy=False, recording=False, updating=False,
                         stock_adapter=dict(active=False),
                         local_permission=dict(remote_support_enabled=True, manual_mode=False),
                         lease_expires_at=self.now + 30))

    def call(self, method, path, body=None, token=None, headers=None):
        supplied = dict(headers or {})
        if token is not None:
            supplied['Authorization'] = 'Bearer ' + token
        if body is not None:
            supplied.setdefault('Content-Type', 'application/json')
        raw = None if body is None else json.dumps(body).encode()
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        try:
            connection.request(method, path, raw, supplied)
            response = connection.getresponse()
            payload = response.read()
            data = json.loads(payload) if payload else {}
            return response.status, dict(response.getheaders()), data
        finally:
            connection.close()

    def monitor(self, packet=None, *, uid=None, key=INITIAL_KEY, owner=False):
        headers = {} if key is None else {'X-Reader-Control': key}
        return self.call('POST', '/v1/monitor/' + (uid or self.uid),
                         self.packet if packet is None else packet,
                         self.OWNER_TOKEN if owner else None, headers)

    def state(self):
        status, _, data = self.call('GET', '/v1/operator/state', token=self.OWNER_TOKEN)
        self.assertEqual(status, 200, data)
        self.assertIs(data.get('ok'), True)
        return data

    def register(self):
        # Migration pin adopts an already existing private support session.
        # The first HTTP heartbeat establishes that legacy session; the next
        # heartbeat proves the same pinned key without an owner Bearer token.
        status, _, data = self.monitor()
        self.assertEqual(status, 200, data)
        status, _, data = self.monitor()
        self.assertEqual(status, 200, data)
        state = self.state()
        self.assertTrue(state['online'], state)
        self.assertTrue(state['bridge_authenticated'], state)
        self.assertEqual(state['session'], self.uid)
        return state

    def job(self, action='capture30', request_id=None, **extra):
        request_id = request_id or uuid.uuid4().hex
        body = dict(id=request_id, action=action, **extra)
        return self.call('POST', '/v1/operator/jobs', body, self.OWNER_TOKEN)

    def assert_error(self, result, status, code=None):
        actual, _, data = result
        self.assertEqual(actual, status, data)
        self.assertIs(data.get('ok'), False)
        if code is not None:
            self.assertEqual(data.get('error'), code, data)

    def test_remote_ui_dependencies_are_publicly_served(self):
        import re
        page=(self.handler.web_root/'index.html').read_text()
        for name in re.findall(r'<script[^>]+src="/([^"]+)"',page):self.assertIn(name,self.handler.assets)
        connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        try:
            connection.request('GET','/esp-remote.js');response=connection.getresponse();data=response.read()
            self.assertEqual(response.status,200);self.assertIn('application/javascript',response.getheader('Content-Type'));self.assertIn(b'class Executor',data)
        finally:connection.close()

    def test_handset_owner_and_bridge_authentication_and_power_confirmation(self):
        self.packet['device']['capabilities'].append('ble_remote_v1')
        self.packet['device']['version']='0.6.0'
        self.register()
        base=dict(actor='a'*16,seq=1,action='on',expected_boot=self.BOOT)
        self.assert_error(self.call('POST','/v1/operator/handset',base),401)
        status,_,data=self.call('POST','/v1/operator/handset',base,self.OWNER_TOKEN)
        self.assertEqual(status,200,data);self.assertTrue(data['handset']['enabled'])
        self.assert_error(self.call('GET','/v1/handset/'+self.uid,headers={'X-Reader-Control':'f'*64}),403)
        status,_,data=self.call('GET','/v1/handset/'+self.uid,headers={'X-Reader-Control':self.INITIAL_KEY})
        self.assertEqual(status,200,data);self.assertEqual(data['handset']['session'],'a'*16)
        down=dict(base,seq=2,action='down',hold='b'*8,button=3,expires_at_ms=data['handset']['server_time_ms']+900)
        self.assert_error(self.call('POST','/v1/operator/handset',down,self.OWNER_TOKEN),409)
        down['confirmed']=True
        status,_,data=self.call('POST','/v1/operator/handset',down,self.OWNER_TOKEN)
        self.assertEqual(status,200,data);self.assertEqual(data['handset']['button'],3)
        status,_,data=self.call('POST','/v1/handset/'+self.uid,dict(base,seq=3,action='up',hold='b'*8),headers={'X-Reader-Control':self.INITIAL_KEY})
        self.assertEqual(status,200,data);self.assertEqual(data['handset']['button'],0)
        self.assertEqual(self.state()['handset']['button'],0)

    def test_remote_takeover_waits_for_actual_local_USB_release(self):
        self.packet['device']['capabilities'].append('ble_remote_v1')
        self.packet['device']['version']='0.6.2'
        self.register()
        base=dict(actor='a'*16,seq=1,action='on',expected_boot=self.BOOT)
        status,_,data=self.call('POST','/v1/handset/'+self.uid,base,headers={'X-Reader-Control':self.INITIAL_KEY})
        self.assertEqual(status,200,data)
        packet=copy.deepcopy(self.packet);packet.update(sequence=2)
        packet['device'].update(uptime_us=2_000_000,ble_remote=dict(enabled=True,connected=True,subscribed=True,session='a'*16,button=2))
        packet['control']['handset_log']=dict(enabled=True,local_control=True,log=dict(recording=True))
        self.assertEqual(self.monitor(packet)[0],200)
        # Local button edges bypass the server; its desired button is neutral.
        self.assertEqual(self.state()['handset']['button'],0)
        other=dict(base,actor='b'*16)
        self.assert_error(self.call('POST','/v1/operator/handset',other,self.OWNER_TOKEN),409,'reader_busy')
        self.assert_error(self.call('POST','/v1/handset/'+self.uid,other,headers={'X-Reader-Control':self.INITIAL_KEY}),409,'reader_busy')
        status,_,data=self.call('POST','/v1/operator/handset',dict(other,action='off'),self.OWNER_TOKEN)
        self.assertEqual(status,200,data);self.assertFalse(data['handset']['enabled'],'Emergency remote OFF remains available during a local hold')
        packet['sequence']=3;packet['device'].update(uptime_us=3_000_000)
        packet['device']['ble_remote']['button']=0
        self.assertEqual(self.monitor(packet)[0],200)
        status,_,data=self.call('POST','/v1/operator/handset',other,self.OWNER_TOKEN)
        self.assertEqual(status,200,data);self.assertEqual(data['handset']['actor'],'b'*16)
        status,_,data=self.call('POST','/v1/operator/handset',dict(other,seq=2,action='off'),self.OWNER_TOKEN)
        self.assertEqual(status,200,data);self.assertFalse(data['handset']['enabled'])

    def test_private_routes_reject_missing_wrong_and_upload_credentials(self):
        # Check credential classes in separate failure windows; the burst/cooldown
        # behavior has its own HTTP suite and intentionally denies even valid keys.
        with patch('remote_operator.time.monotonic') as clock:
            for index, token in enumerate((None, 'wrong-owner-token', self.UPLOAD_TOKEN)):
                clock.return_value = index * 61.0
                with self.subTest(token_kind='none' if token is None else 'invalid'):
                    self.assert_error(self.call('GET', '/v1/operator/state', token=token), 401, 'unauthorized')
                    self.assert_error(self.call('POST', '/v1/operator/jobs',
                                                dict(id=uuid.uuid4().hex, action='capture30'), token),
                                      401, 'unauthorized')
            status, headers, state = self.call('GET', '/v1/operator/state', token=self.OWNER_TOKEN)
            self.assertEqual(status, 200, state)
            self.assertIn('no-store', headers.get('Cache-Control', ''))

    def test_same_origin_and_dynamic_localhost_are_allowed_evil_is_rejected(self):
        origins = ('https://134.98.158.132:18443',
                   'http://127.0.0.1:' + str(self.server.server_port),
                   'http://localhost:' + str(self.server.server_port))
        for origin in origins:
            with self.subTest(origin=origin):
                status, headers, data = self.call('GET', '/v1/operator/state',
                                                 token=self.OWNER_TOKEN, headers={'Origin': origin})
                self.assertEqual(status, 200, data)
                self.assertEqual(headers.get('Access-Control-Allow-Origin'), origin)
                status, headers, _ = self.call('OPTIONS', '/v1/operator/jobs',
                                               headers={'Origin': origin,
                                                        'Access-Control-Request-Headers': 'Authorization, Content-Type',
                                                        'Access-Control-Request-Method': 'POST'})
                self.assertEqual(status, 204)
                self.assertEqual(headers.get('Access-Control-Allow-Origin'), origin)
                self.assertIn('Authorization', headers.get('Access-Control-Allow-Headers', ''))
        evil = {'Origin': 'https://evil.invalid'}
        self.assert_error(self.call('GET', '/v1/operator/state', token=self.OWNER_TOKEN, headers=evil), 403)
        self.assert_error(self.call('POST', '/v1/operator/jobs',
                                   dict(id=uuid.uuid4().hex, action='capture30'), self.OWNER_TOKEN, evil), 403)
        self.assertEqual(self.call('OPTIONS', '/v1/operator/jobs', headers=evil)[0], 403)

    def test_initial_pin_is_trusted_without_bearer_and_state_is_sanitized(self):
        self.packet['device']['key_sha256'] = self.digest(self.INITIAL_KEY)
        self.packet['control']['token'] = self.OWNER_TOKEN
        self.packet['control']['raw_key'] = self.INITIAL_KEY
        self.packet['control']['private_marker'] = 'PRIVATE-NOT-FOR-OPERATOR'
        state = self.register()
        raw = json.dumps(state)
        for secret in (self.OWNER_TOKEN, self.INITIAL_KEY, self.digest(self.INITIAL_KEY),
                       self.digest(self.OWNER_TOKEN), 'PRIVATE-NOT-FOR-OPERATOR'):
            self.assertNotIn(secret, raw)
        self.assertEqual(state['device']['boot'], self.BOOT)
        self.assertNotIn('key_sha256', state['device'])
        self.assertNotIn('raw_key', state['control'])

    def test_public_usb_claim_without_pin_cannot_become_operator_target(self):
        self.monitor(uid=uuid.uuid4().hex, key='c' * 64)
        state = self.state()
        self.assertFalse(state['online'], state)
        self.assertFalse(state['bridge_authenticated'], state)
        self.assertFalse(state['conflict'], state)

    def test_duplicate_or_stalled_device_uptime_does_not_extend_online(self):
        self.register()
        self.now += 10
        self.assertEqual(self.monitor()[0], 200)  # HTTP retry of the identical packet.
        self.now += 6
        state = self.state()
        self.assertFalse(state['online'], state)
        # A newly numbered heartbeat with the identical USB STATUS is still stale.
        stalled = copy.deepcopy(self.packet)
        stalled['sequence'] = 2
        stalled['control']['lease_expires_at'] = self.now + 30
        self.assertEqual(self.monitor(stalled)[0], 200)
        self.assertFalse(self.state()['online'])
        fresh = self.report(sequence=3, uptime_us=2_000_000)
        self.assertEqual(self.monitor(fresh)[0], 200)
        self.assertTrue(self.state()['online'])

    def test_monitor_reserve_keeps_live_delivery_without_saving_history(self):
        self.register()
        folder = self.handler.store.root / 'monitor' / self.uid
        before = {p.name: p.read_bytes() for p in folder.iterdir()}
        _, _, created = self.job()
        fresh = self.report(sequence=2, uptime_us=2_000_000)
        with patch('receiver.shutil.disk_usage') as disk:
            disk.return_value.free = 0
            status, _, receipt = self.monitor(fresh)
            self.assertEqual(status, 200, receipt)
            self.assertIs(receipt['monitor_saved'], False)
            self.assertEqual(receipt['storage_warning'], 'monitor_free_space_reserve')
            self.assertEqual(receipt['command']['id'], created['job']['id'])
            self.assertEqual(receipt['command']['expected_boot'], self.BOOT)
            self.assertNotIn('key_sha256', receipt['command'])
            self.assertTrue(self.state()['online'])
            self.assertEqual(self.state()['device']['uptime_us'], 2_000_000)
            # Success is a live relay receipt, never a claim of archive storage.
            self.assertEqual({p.name: p.read_bytes() for p in folder.iterdir()}, before)
            self.now += 16
            self.assertEqual(self.monitor(fresh)[0], 200)
            self.assertFalse(self.state()['online'], 'Retries cannot renew stale hardware')
            fresh = self.report(sequence=3, uptime_us=3_000_000)
            fresh['control']['last'] = dict(id=created['job']['id'], kind='capture', state='started')
            self.assertEqual(self.monitor(fresh)[0], 200)
            self.assertEqual(self.state()['pending']['state'], 'started')
            self.assertTrue(self.state()['online'])
            # Public/untrusted clients and incorrect keys cannot use the relay.
            self.assertEqual(self.monitor(self.report(), uid=uuid.uuid4().hex, key='c'*64)[0], 507)
            self.assert_error(self.monitor(fresh, key='c'*64), 403, 'bridge_key_required')
            archive = uuid.uuid4().hex
            meta = dict(schema=1, id=archive, size=16, parts=1,
                        part_size=2*1024*1024, format='jsonl', sha256='a'*64)
            self.assertEqual(self.call('POST', '/v1/uploads/'+archive, meta,
                                       token=self.UPLOAD_TOKEN)[0], 507,
                             'Full capture uploads must retain the free-space reserve')
        recovered = self.report(sequence=4, uptime_us=4_000_000)
        recovered['control']['last'] = dict(id=created['job']['id'], kind='capture', state='complete')
        status, _, receipt = self.monitor(recovered)
        self.assertEqual(status, 200, receipt)
        self.assertIs(receipt['monitor_saved'], True)
        self.assertEqual(json.loads((folder/'latest.json').read_text())['report']['sequence'], 4)
        self.assertEqual(self.state()['pending']['state'], 'complete')

    def test_monitor_history_quota_preserves_live_state_and_rejects_public_ingestion(self):
        self.register()
        history = self.handler.store.root/'monitor'/self.uid/'history.previous.jsonl'
        with history.open('wb') as stream:
            stream.truncate(64*1024*1024)
        packet = self.report(sequence=2, uptime_us=2_000_000)
        status, _, receipt = self.monitor(packet)
        self.assertEqual(status, 200, receipt)
        self.assertIs(receipt['monitor_saved'], False)
        self.assertEqual(receipt['storage_warning'], 'monitor_history_quota')
        self.assertEqual(history.stat().st_size, 64*1024*1024)
        self.assertTrue(self.state()['online'])
        self.assertEqual(self.monitor(packet, uid=uuid.uuid4().hex, key='c'*64)[0], 507)

    def test_first_owner_bridge_can_connect_when_monitor_reserve_is_reached(self):
        with patch('receiver.shutil.disk_usage') as disk:
            disk.return_value.free = 0
            status, _, receipt = self.monitor(owner=True)
            self.assertEqual(status, 200, receipt)
            self.assertIs(receipt['monitor_saved'], False)
            self.assertFalse((self.handler.store.root/'monitor'/self.uid).exists())
            self.assertTrue(self.state()['online'])
            self.assertTrue(self.state()['bridge_authenticated'])

    def test_public_overwrite_same_uid_cannot_poison_trusted_state_or_delivery(self):
        self.register()
        for key in (None, 'c' * 64):
            spoof = self.report(sequence=1_000_000, uptime_us=9_000_000, boot='BADDBADD')
            spoof['device']['can'] = 'running'
            spoof['control']['last'] = dict(id='f' * 32, kind='capture', state='complete')
            status, _, _ = self.monitor(spoof, key=key)
            self.assertIn(status, (200, 403))  # Either rejection or isolated public ingestion.
            state = self.state()
            self.assertEqual(state['device']['boot'], self.BOOT)
            self.assertFalse(state['conflict'])
        status, _, created = self.job()
        self.assertEqual(status, 200, created)
        fresh = self.report(sequence=2, uptime_us=2_000_000)
        status, _, receipt = self.monitor(fresh)
        self.assertEqual(status, 200, receipt)
        self.assertEqual(receipt['command']['id'], created['job']['id'])
        self.assertEqual(receipt['command']['expected_boot'], self.BOOT)
        self.assertEqual(receipt['command']['expected_mac'], self.MAC)
        self.assertNotIn('key_sha256', receipt['command'])

    def test_owner_authenticates_new_bridge_conflict_and_stale_takeover(self):
        self.register()
        new_uid, new_key = uuid.uuid4().hex, 'd' * 64
        new_packet = self.report()
        self.assertEqual(self.monitor(new_packet, uid=new_uid, key=new_key, owner=True)[0], 200)
        self.assertTrue(self.state()['conflict'])
        self.assert_error(self.job(), 409, 'bridge_conflict')
        self.now += 16
        new_packet = self.report(sequence=2, uptime_us=2_000_000)
        self.assertEqual(self.monitor(new_packet, uid=new_uid, key=new_key, owner=True)[0], 200)
        state = self.state()
        self.assertTrue(state['online'], state)
        self.assertFalse(state['conflict'], state)
        self.assertEqual(state['session'], new_uid)
        status, _, created = self.job()
        self.assertEqual(status, 200, created)
        # Old duplicate packets cannot pick up the new bridge's command.
        status, _, old_receipt = self.monitor(self.packet)
        self.assertEqual(status, 200, old_receipt)
        self.assertNotIn('command', old_receipt)
        new_packet = self.report(sequence=3, uptime_us=3_000_000)
        _, _, receipt = self.monitor(new_packet, uid=new_uid, key=new_key, owner=True)
        self.assertEqual(receipt['command']['id'], created['job']['id'])

    def test_request_id_retry_survives_boot_change_offline_and_server_restart(self):
        self.register()
        request_id = uuid.uuid4().hex
        status, _, first = self.job(request_id=request_id)
        self.assertEqual(status, 200, first)
        status, _, retry = self.job(request_id=request_id)
        self.assertEqual(status, 200, retry)
        self.assertEqual(retry['job']['id'], request_id)
        self.assertEqual(retry['job']['action'], 'capture30')
        reset = self.report(sequence=2, uptime_us=10, boot='11223344')
        _, _, receipt = self.monitor(reset)
        self.assertNotIn('command', receipt)
        self.now += 16
        status, _, retry = self.job(request_id=request_id)
        self.assertEqual(status, 200, retry)
        self.assertEqual(retry['job']['id'], request_id)
        self.assert_error(self.job('capture60', request_id), 409, 'id_conflict')
        # Replace the Storage instance to prove IDs are not only an in-memory set.
        self.handler.store = Storage(self.root / 'data', self.clients, reserve=0,
                                     control_policy=self.control_policy)
        status, _, retry = self.job(request_id=request_id)
        self.assertEqual(status, 200, retry)
        self.assertEqual(retry['job']['id'], request_id)

    def test_offline_busy_and_pending_jobs_are_rejected_without_side_effects(self):
        self.register()
        self.now += 16
        self.assert_error(self.job(), 409, 'offline')
        fresh = self.report(sequence=2, uptime_us=2_000_000)
        fresh['device']['can'] = 'running'
        self.monitor(fresh)
        self.assert_error(self.job(), 409, 'reader_busy')
        fresh = self.report(sequence=3, uptime_us=3_000_000)
        self.monitor(fresh)
        status, _, created = self.job()
        self.assertEqual(status, 200, created)
        self.assert_error(self.job('capture60'), 409, 'job_pending')

    def test_only_finite_actions_are_accepted_no_caller_target_or_payload(self):
        self.register()
        for body in ({}, dict(id=True, action='capture30'),
                     dict(id=uuid.uuid4().hex, action='TX'),
                     dict(id=uuid.uuid4().hex, action='flash'),
                     dict(id=uuid.uuid4().hex, action='capture30', expected_mac='00:00:00:00:00:00'),
                     dict(id=uuid.uuid4().hex, action='capture30', expected_boot='DEADBEEF'),
                     dict(id=uuid.uuid4().hex, action='capture30', payload='666#010203'),
                     dict(id=uuid.uuid4().hex, action='capture30', duration=600)):
            with self.subTest(body=body):
                self.assert_error(self.call('POST', '/v1/operator/jobs', body, self.OWNER_TOKEN), 400)

    def test_local_browser_activity_blocks_new_jobs_even_when_can_is_stopped(self):
        self.register()
        for index, reason in enumerate(('busy', 'recording', 'updating', 'stock_adapter', 'rx_check'), 2):
            packet = self.report(sequence=index, uptime_us=index * 1_000_000)
            if reason == 'stock_adapter':
                packet['control']['stock_adapter']['active'] = True
            elif reason == 'rx_check':
                packet['device']['rx_check']['state'] = 'running'
            else:
                packet['control'][reason] = True
            self.assertEqual(self.monitor(packet)[0], 200)
            self.assert_error(self.job(), 409, 'reader_busy')

    def test_stop_is_bound_to_the_current_started_remote_job(self):
        self.register()
        self.assert_error(self.job('stop'), 409, 'not_started')
        status, _, created = self.job()
        self.assertEqual(status, 200, created)
        request_id = created['job']['id']
        active = self.report(sequence=2, uptime_us=2_000_000)
        active['device']['can'] = 'running'
        active['control']['last'] = dict(id=request_id, kind='capture', state='started')
        self.monitor(active)
        status, _, stopped = self.job('stop')
        self.assertEqual(status, 200, stopped)
        active['sequence'] = 3
        active['device']['uptime_us'] = 3_000_000
        _, _, receipt = self.monitor(active)
        self.assertEqual(receipt['command']['kind'], 'stop')
        self.assertEqual(receipt['command']['target_job_id'], request_id)
        self.assertEqual(receipt['command']['expected_boot'], self.BOOT)
        self.assertEqual(receipt['command']['id'], stopped['job']['id'])

    def test_spard_information_dispatch_is_the_bounded_30_second_reader_action(self):
        self.register()
        status, _, created = self.job('spard_information')
        self.assertEqual(status, 200, created)
        self.assertEqual(created['job']['kind'], 'spard_probe')
        self.assertEqual(created['job']['duration_s'], 30)
        _, _, receipt = self.monitor(self.report(sequence=2, uptime_us=2_000_000))
        command = receipt['command']
        self.assertEqual(command['id'], created['job']['id'])
        self.assertEqual(command['kind'], 'spard_probe')
        self.assertEqual(command['duration'], 30)
        self.assertEqual(command['mode'], 'information')
        self.assertEqual((command['adapter_vid'], command['adapter_pid']), ('1A86', '7523'))
        self.assertEqual((command['expected_mac'], command['expected_boot']), (self.MAC, self.BOOT))
        self.assertNotIn('payload', command)
        self.assertNotIn('key_sha256', command)

    def test_started_job_is_interrupted_when_a_fresh_new_bridge_takes_over(self):
        self.register()
        _, _, created = self.job()
        old_id = created['job']['id']
        started = self.report(sequence=2, uptime_us=2_000_000)
        started['device']['can'] = 'running'
        started['control']['last'] = dict(id=old_id, kind='capture', state='started')
        self.monitor(started)
        self.assertEqual(self.state()['pending']['state'], 'started')
        self.now += 16
        new_uid, new_key = uuid.uuid4().hex, 'd' * 64
        fresh = self.report(uptime_us=20_000_000)
        self.assertEqual(self.monitor(fresh, uid=new_uid, key=new_key, owner=True)[0], 200)
        state = self.state()
        self.assertEqual(state['session'], new_uid)
        self.assertEqual(state['pending']['id'], old_id)
        self.assertEqual(state['pending']['state'], 'interrupted')
        status, _, retry = self.job(request_id=old_id)
        self.assertEqual(status, 200, retry)
        self.assertEqual(retry['job']['state'], 'interrupted')
        status, _, next_job = self.job()
        self.assertEqual(status, 200, next_job)  # Old ACTIVE must not block forever.
        self.assertNotEqual(next_job['job']['id'], old_id)

    def test_battery_information_fixed_job_and_full_reply_over_HTTP(self):
        from pc.test_battery_information import RAW
        self.register()
        report=self.report(sequence=3,uptime_us=3_000_000)
        report['device'].update(version='0.5.2',capabilities=['command_ids','stream_end','spard_information_query'])
        report['control']['capabilities'].append('battery_information')
        status,_,data=self.monitor(report);self.assertEqual(status,200,data)
        status,_,data=self.job('battery_information');self.assertEqual(status,200,data);ident=data['job']['id']
        self.assertEqual(data['job']['duration_s'],45)
        report['sequence']=4;report['device']['uptime_us']=4_000_000
        status,_,data=self.monitor(report);self.assertEqual(status,200,data);self.assertEqual(data['command']['kind'],'battery_information');self.assertNotIn('opcode',data['command']);self.assertNotIn('payload',data['command'])
        report['sequence']=5;report['device'].update(uptime_us=5_000_000,received=100)
        report['control']['last']=dict(id=ident,kind='battery_information',state='complete')
        report['control']['battery_information']=dict(active=False,phase='complete',error=None,valid_packets=1,remaining_ms=0,information=dict(schema=1,source='esp_can_std666',origin='esp_query',boot=self.BOOT,epoch=7,first_seq=1,last_seq=12,t_us=4_000_000,fragments=12,raw_hex=RAW,age_ms=1000))
        status,_,data=self.monitor(report);self.assertEqual(status,200,data)
        state=self.state();self.assertEqual(state['pending']['state'],'complete');self.assertEqual(state['control']['battery_information']['information']['raw_hex'],RAW)

    def test_started_capture_survives_queue_ttl_but_has_bounded_execution(self):
        self.register()
        status, _, created = self.job('capture60')
        self.assertEqual(status, 200, created)
        ident = created['job']['id']
        self.assertEqual(created['job']['duration_s'], 60)
        active = self.report(sequence=2, uptime_us=2_000_000)
        active['control']['last'] = dict(id=ident, kind='capture', state='started')
        self.monitor(active)
        self.now += 70
        active = self.report(sequence=3, uptime_us=72_000_000)
        active['control']['last'] = dict(id=ident, kind='capture', state='started')
        self.monitor(active)
        self.assertEqual(self.state()['pending']['state'], 'started')
        self.assert_error(self.job(), 409, 'job_pending')
        self.now += 21  # 60 seconds plus 30 seconds finalization grace elapsed.
        active = self.report(sequence=4, uptime_us=93_000_000)
        active['control']['last'] = dict(id=ident, kind='capture', state='started')
        self.monitor(active)
        state = self.state()
        self.assertEqual(state['pending']['state'], 'interrupted')
        self.assertEqual(state['pending']['reason'], 'execution_timeout')

    def test_undispatched_job_expires_and_is_not_replayed(self):
        self.register()
        status, _, created = self.job()
        self.assertEqual(status, 200, created)
        self.now += 61
        fresh = self.report(sequence=2, uptime_us=63_000_000)
        _, _, receipt = self.monitor(fresh)
        self.assertNotIn('command', receipt)
        status, _, retry = self.job(request_id=created['job']['id'])
        self.assertEqual(status, 200, retry)
        self.assertEqual(retry['job']['state'], 'expired')

    def test_concurrent_job_posts_reserve_only_one_pending_action(self):
        self.register()
        ids = (uuid.uuid4().hex, uuid.uuid4().hex)
        with ThreadPoolExecutor(max_workers=2) as workers:
            results = list(workers.map(lambda ident: self.job(request_id=ident), ids))
        self.assertEqual(sorted(result[0] for result in results), [200, 409])
        winner = next(result[2]['job']['id'] for result in results if result[0] == 200)
        rejected = next(result for result in results if result[0] == 409)
        self.assert_error(rejected, 409, 'job_pending')
        self.assertEqual(self.state()['pending']['id'], winner)


    def test_spard_access_is_authenticated_private_and_uncached(self):
        private=self.config/'spard-access.json'
        private.write_text(json.dumps({'schema':1,'credentials':{'Engineer':'synthetic-engineer','Developer':'synthetic-developer'}}))
        status,headers,data=self.call('GET','/v1/operator/spard-access')
        self.assertEqual(status,401);self.assertNotIn('synthetic-engineer',json.dumps(data))
        status,headers,data=self.call('GET','/v1/operator/spard-access',token=self.OWNER_TOKEN)
        self.assertEqual(status,200);self.assertEqual(headers['Cache-Control'],'no-store')
        self.assertEqual(data['credentials'],[{'role':'Engineer','password':'synthetic-engineer'},{'role':'Developer','password':'synthetic-developer'}])
        self.assertFalse((self.handler.store.root/'monitor').exists())

    def test_spard_reference_missing_or_malformed_fails_without_secret_echo(self):
        status,_,data=self.call('GET','/v1/operator/spard-access',token=self.OWNER_TOKEN)
        self.assertEqual(status,503)
        (self.config/'spard-access.json').write_text(json.dumps({'schema':1,'credentials':{'Engineer':'must-not-echo'}}))
        status,_,data=self.call('GET','/v1/operator/spard-access',token=self.OWNER_TOKEN)
        self.assertEqual(status,503);self.assertNotIn('must-not-echo',json.dumps(data))

    def test_spard_reference_rejects_foreign_origin(self):
        status,_,data=self.call('GET','/v1/operator/spard-access',token=self.OWNER_TOKEN,headers={'Origin':'https://untrusted.invalid'})
        self.assertEqual(status,403);self.assertEqual(data['error'],'origin_not_allowed')


if __name__ == '__main__':
    unittest.main()
