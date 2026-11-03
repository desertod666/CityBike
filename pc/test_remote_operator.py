"""Owner console storage regressions; all state is synthetic and temporary."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
from receiver import Storage
from remote_operator import OperatorError

class RemoteOperatorTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.now=1700000000.;self.clock=patch('remote_operator.time.time',side_effect=lambda:self.now);self.clock.start()
        self.uid='a'*32;self.key='b'*64;self.auth='Bearer test-owner-only';self.control=self.root/'config/control-policy.json';self.control.parent.mkdir();self.control.write_text(json.dumps(dict(schema=1,enabled=True,manual_lock=False)))
        self.policy=self.control.parent/'operator-policy.json';self.policy.write_text(json.dumps(dict(schema=1,enabled=True,mac='e0:72:a1:72:38:d9',token_sha256=hashlib.sha256(self.auth[7:].encode()).hexdigest(),initial_bridge_key_sha256=hashlib.sha256(self.key.encode()).hexdigest())))
        self.store=Storage(self.root/'data',self.root/'clients.json',reserve=0,control_policy=self.control)
        self.report=dict(schema=1,sequence=1,source='browser-usb',connected=True,events=[],device=dict(type='status',product='BafangReader',protocol=1,ap_mac='e0:72:a1:72:38:d9',version='0.4.8',boot='A1B2C3D4',uptime_us=1000000,can='stopped',rx_sampling_250k='TRIPLE',tx_gpio=4,rx_gpio=5,twai_tx_gpio=10,sampling_profiles=['TRIPLE','SP625','SP625_TRIPLE','SP6875','SP6875_TRIPLE','DEFAULT','MID','MID_TRIPLE'],ctx_guard=dict(policy='fixed_recessive',valid=True,level=1,out_sel=128,mux=1,enabled=True,input_enabled=True,latch_high=True,inverted=False)),control=dict(version=2,web_build='20261027-single-device1',ready=True,recorder_version=2,capabilities=['capture','sampling','sampling_sweep','rx_check','stop','spard_probe'],local_permission=dict(remote_support_enabled=True,manual_mode=False),lease_expires_at=self.now+30,last=None,countdown=dict(duration_ms=30000,remaining_ms=30000,phase='running')))
        self.heartbeat();self.report['sequence']+=1;self.report['device']['uptime_us']+=1000000;self.heartbeat()
    def tearDown(self):self.clock.stop();self.tmp.cleanup()
    def heartbeat(self,report=None,uid=None,key=None,auth=''):
        report=report or self.report;uid=uid or self.uid;key=key or self.key
        self.store.monitor(uid,report,control_key=key,authorization=auth)
        return self.store.support(uid,report,key)
    def enqueue(self,action,ident='c'*32):return self.store.operator.enqueue(self.auth,dict(id=ident,action=action))
    def error(self,code,call):
        with self.assertRaises(OperatorError) as result:call()
        self.assertEqual(result.exception.code,code)
    def test_owner_auth_and_no_secret_response(self):
        self.error('unauthorized',lambda:self.store.operator.state('Bearer wrong'))
        state=self.store.operator.state(self.auth);self.assertTrue(state['online']);self.assertTrue(state['bridge_authenticated']);self.assertEqual(state['session'],self.uid)
        text=json.dumps(state);self.assertNotIn(self.key,text);self.assertNotIn('key_sha256',text);self.assertNotIn('token_sha256',text)
        self.now+=5;state=self.store.operator.state(self.auth);self.assertEqual(state['control']['countdown']['remaining_ms'],25000)
    def test_last_observed_bus_error_survives_device_relay(self):
        self.report['sequence']+=1;self.report['device']['uptime_us']+=1000
        event=dict(source='single_HAL_ECC_read',scope='boot_history',event=1,t_us=100,raw=0xE8,type=3,direction=1,segment=8,saturated=False)
        self.report['device']['last_bus_error']=event;self.heartbeat()
        self.assertEqual(self.store.operator.state(self.auth)['device']['last_bus_error'],event)
    def test_known_uid_cannot_be_poisoned_and_replays_cannot_refresh(self):
        bad=copy.deepcopy(self.report);bad['sequence']=1000000
        self.error('bridge_key_required',lambda:self.store.monitor(self.uid,bad))
        self.now+=16;self.heartbeat();self.assertFalse(self.store.operator.state(self.auth)['online'])
        self.error('offline',lambda:self.enqueue('capture30'))
    def test_advancing_auth_sequence_with_frozen_usb_status_is_stale(self):
        for _ in range(4):self.now+=5;self.report['sequence']+=1;self.report['control']['lease_expires_at']=self.now+30;self.heartbeat()
        state=self.store.operator.state(self.auth);self.assertFalse(state['online']);self.assertGreaterEqual(state['age_seconds'],20)
    def test_delayed_newer_uptime_never_becomes_fresh(self):
        report=copy.deepcopy(self.report);report['sequence']+=1;report['device']['uptime_us']+=1000000
        report['host_utc']='2023-11-14T22:13:20Z';report['device_age_ms']=0
        self.now+=3600;self.heartbeat(report)
        state=self.store.operator.state(self.auth)
        self.assertFalse(state['online']);self.assertGreaterEqual(state['age_seconds'],3600)
        self.error('offline',lambda:self.enqueue('capture30'))
    def test_new_envelope_preserves_device_measurement_age(self):
        from remote_operator import utc
        report=copy.deepcopy(self.report);report['sequence']+=1;report['device']['uptime_us']+=1000000
        self.now+=60;report.update(host_utc=utc(self.now),device_age_ms=60000)
        report['control']['lease_expires_at']=self.now+30;self.heartbeat(report)
        state=self.store.operator.state(self.auth);self.assertFalse(state['online']);self.assertEqual(state['age_seconds'],60)
    def test_legacy_retry_uses_original_permission_time(self):
        self.report['sequence']+=1;self.report['device']['uptime_us']+=1000000;self.now+=3600;self.heartbeat()
        self.assertFalse(self.store.operator.state(self.auth)['online'])
    def test_handset_requires_fresh_local_permission(self):
        self.report['device']['capabilities']=['ble_remote_v1'];self.report['sequence']+=1;self.report['device']['uptime_us']+=1000000
        self.report['control']['lease_expires_at']=self.now-1;self.heartbeat()
        # Telemetry itself can still be current while permission has expired.
        b=self.store.operator.bridges['items'][self.uid];b['progress_at']=self.now
        self.error('remote_unavailable',lambda:self.store.operator.handset_request(self.auth,dict(actor='a'*16,seq=1,action='on',expected_boot=b['device']['boot'])))
    def test_idempotency_precedes_freshness_and_never_requeues(self):
        queued=self.enqueue('capture30');pending=self.store.root/'control'/self.uid/'pending.json';raw=pending.read_bytes()
        self.now+=70;self.store.operator.state(self.auth)
        again=self.enqueue('capture30');self.assertEqual(again['job']['id'],queued['job']['id']);self.assertEqual(pending.read_bytes(),raw)
        self.error('id_conflict',lambda:self.enqueue('capture60'))
    def test_conflict_and_authenticated_handover_interrupt_old_started_job(self):
        self.enqueue('capture30');self.heartbeat();self.report['sequence']+=1;self.report['device']['uptime_us']+=1000;self.report['control']['last']=dict(id='c'*32,kind='capture',state='started');self.heartbeat()
        second=copy.deepcopy(self.report);second['control']['last']=None;second['sequence']=1;second['device']['uptime_us']=9000000
        self.heartbeat(second,uid='d'*32,key='e'*64,auth=self.auth);self.assertTrue(self.store.operator.state(self.auth)['conflict']);self.error('bridge_conflict',lambda:self.enqueue('capture60',ident='f'*32))
        self.now+=16;second['sequence']+=1;second['device']['uptime_us']+=1000;second['control']['lease_expires_at']=self.now+30;self.heartbeat(second,uid='d'*32,key='e'*64,auth=self.auth)
        state=self.store.operator.state(self.auth);self.assertTrue(state['online']);self.assertEqual(state['session'],'d'*32);self.assertEqual(state['pending']['state'],'interrupted');self.assertEqual(state['pending']['reason'],'bridge_replaced')
        self.assertEqual(self.enqueue('capture60',ident='f'*32)['job']['state'],'queued')
    def test_started_capture_outlives_queue_ttl_then_times_out_honestly(self):
        self.enqueue('capture60');self.heartbeat();self.report['sequence']+=1;self.report['device']['uptime_us']+=1000;self.report['control']['last']=dict(id='c'*32,kind='capture',state='started');self.heartbeat()
        self.now+=70;self.report['sequence']+=1;self.report['device']['uptime_us']+=70000000;self.report['control']['lease_expires_at']=self.now+30;self.heartbeat()
        self.assertEqual(self.store.operator.state(self.auth)['pending']['state'],'started');self.error('job_pending',lambda:self.enqueue('capture30',ident='d'*32))
        self.now+=240;state=self.store.operator.state(self.auth);self.assertEqual(state['pending']['state'],'interrupted');self.assertEqual(state['pending']['reason'],'execution_timeout')
    def test_exact_started_stop_only_and_listen_version_gate(self):
        self.enqueue('capture30');self.error('not_started',lambda:self.enqueue('stop',ident='d'*32))
        self.report['sequence']+=1;self.report['device']['uptime_us']+=1000;self.report['control']['last']=dict(id='c'*32,kind='capture',state='started');self.heartbeat()
        stop=self.enqueue('stop',ident='d'*32);self.assertEqual(stop['job']['target_job_id'],'c'*32)
        self.report['sequence']+=1;self.report['device']['uptime_us']+=1000;self.report['control']['last']=dict(id='d'*32,kind='stop',state='complete');self.heartbeat()
        self.report['sequence']+=1;self.report['device']['uptime_us']+=1000;self.report['control']['web_build']='20261027-battery-panel1';self.heartbeat()
        self.error('unsupported_client',lambda:self.enqueue('spard_listen',ident='e'*32))

if __name__=='__main__':unittest.main()
