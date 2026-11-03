"""Live ESP view: bounded snapshots and fixed, owner-authorized controls."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
from can_live import sanitize_live
from receiver import Storage
from remote_operator import OperatorError


class LiveCANTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.now=1700000000.
        self.clock=patch('remote_operator.time.time',side_effect=lambda:self.now);self.clock.start()
        self.uid='a'*32;self.key='b'*64;self.auth='Bearer synthetic-owner'
        config=self.root/'config';config.mkdir()
        policy=config/'control-policy.json';policy.write_text(json.dumps(dict(schema=1,enabled=True,manual_lock=False)))
        (config/'operator-policy.json').write_text(json.dumps(dict(schema=1,enabled=True,mac='e0:72:a1:72:38:d9',token_sha256=hashlib.sha256(self.auth[7:].encode()).hexdigest())))
        self.store=Storage(self.root/'data',self.root/'clients.json',reserve=0,control_policy=policy)
        self.report=dict(schema=1,source='browser-usb',sequence=1,connected=True,events=[],
            device=dict(product='BafangReader',protocol=1,ap_mac='e0:72:a1:72:38:d9',boot='ABCDEF12',epoch=1,uptime_us=1000000,received=10,can='stopped',tx_gpio=4,rx_gpio=5,twai_tx_gpio=10,rx_check=dict(state='idle'),
                ctx_guard=dict(policy='fixed_recessive',valid=True,level=1,out_sel=128,mux=1,enabled=True,input_enabled=True,latch_high=True,inverted=False)),
            control=dict(version=2,ready=True,recorder_version=2,capabilities=['rx_check','capture','stop','flash','sampling','sampling_sweep','spard_probe','paired_probe','live_view'],busy=False,recording=False,updating=False,last=None,stock_adapter=dict(active=False),live_view=dict(active=False,remote=False),local_permission=dict(remote_support_enabled=True,manual_mode=False),lease_expires_at=self.now+30))
        self.snapshot=dict(schema=1,boot='ABCDEF12',epoch=1,stream_active=True,evicted_ids=0,frames=[dict(id='04F83401',extended=True,rtr=False,dlc=5,data='EAFF0B103B',seq=5,t_us=1000,age_ms=100)])

    def tearDown(self):self.clock.stop();self.tmp.cleanup()
    def heartbeat(self):
        self.report['sequence']+=1;self.report['device']['uptime_us']+=1000
        self.report['control']['lease_expires_at']=self.now+30
        self.store.monitor(self.uid,self.report,control_key=self.key,authorization=self.auth)
        return self.store.support(self.uid,self.report,self.key)
    def enqueue(self,action='live_start',ident='c'*32):
        return self.store.operator.enqueue(self.auth,dict(id=ident,action=action))
    def error(self,code,action):
        with self.assertRaises(OperatorError) as cm:action()
        self.assertEqual(cm.exception.code,code)
    def pending(self):return self.store.root/'control'/self.uid/'pending.json'

    def test_latest_snapshot_is_bounded_raw_ESP_not_adapter(self):
        self.report['device']['can']='running';d=self.report['device']
        self.assertEqual(sanitize_live(self.snapshot,d),self.snapshot)
        self.assertFalse(sanitize_live(self.snapshot,d,False)['stream_active'])
        for device in (dict(product='StockCANAdapter'),{**d,'boot':'BAD00000'},{**d,'epoch':2}):
            self.assertIsNone(sanitize_live(self.snapshot,device))
        variants=[]
        for change in ({'seq':True},{'dlc':9},{'data':'00'},{'age_ms':-1},{'id':'FFFFFFFF'},{'token':'secret'}):
            v=copy.deepcopy(self.snapshot);v['frames'][0].update(change);variants.append(v)
        v=copy.deepcopy(self.snapshot);v['frames']*=65;variants.append(v)
        v=copy.deepcopy(self.snapshot);v['frames']*=2;variants.append(v)
        for value in variants:self.assertIsNone(sanitize_live(value,d))

    def test_snapshot_visible_to_owner_but_not_accumulated_in_history(self):
        self.report['device']['can']='running';self.report['control'].update(can_live=self.snapshot,live_view=dict(active=True,remote=True))
        self.report['events']=[dict(type='device',device=dict(type='frame',data='EAFF0B103B'))]
        self.heartbeat();self.now+=1;self.heartbeat()
        state=self.store.operator.state(self.auth)
        self.assertEqual(state['control']['can_live']['frames'],self.snapshot['frames'])
        latest=json.loads((self.store.root/'monitor'/self.uid/'latest.json').read_text())
        self.assertIn('can_live',latest['report']['control'])
        history=(self.store.root/'monitor'/self.uid/'history.jsonl').read_text()
        self.assertNotIn('EAFF0B103B',history);self.assertNotIn('can_live',history)
        self.assertEqual(len(history.splitlines()),1)

    def test_fixed_start_and_stop_are_distinct_completed_actions(self):
        self.heartbeat();self.enqueue();job=self.heartbeat()
        self.assertEqual(job['kind'],'live_view');self.assertEqual(job['mode'],'start');self.assertEqual(job['bitrate'],250000)
        self.assertNotIn('key_sha256',job)
        self.report['device']['can']='running';self.report['control'].update(last=dict(id='c'*32,kind='live_view',state='complete'),live_view=dict(active=True,remote=True))
        self.heartbeat();self.enqueue('live_stop','d'*32);stop=self.heartbeat()
        self.assertEqual(stop['mode'],'stop');self.assertEqual(stop['kind'],'live_view')
        self.report['device']['can']='stopped';self.report['control'].update(last=dict(id='d'*32,kind='live_view',state='complete'),live_view=dict(active=False,remote=False))
        self.heartbeat();self.assertEqual(self.store.operator.load_job('d'*32)['state'],'complete')

    def test_pending_cannot_inject_command_mode_rate_or_omit_owner_record(self):
        self.heartbeat();self.enqueue();original=json.loads(self.pending().read_text())
        for change in ({'command':'CAN TX'},{'bitrate':500000},{'mode':'stop'},{'expected_boot':'FFFFFFFF'}):
            self.pending().write_text(json.dumps({**original,**change}));self.assertIsNone(self.heartbeat())
        self.pending().write_text(json.dumps(original));(self.store.operator.root/'jobs'/('c'*32+'.json')).unlink()
        self.assertIsNone(self.heartbeat())

    def test_recording_revocation_and_other_active_jobs_deny_live_actions(self):
        self.heartbeat();self.report['control']['recording']=True;self.heartbeat()
        self.error('reader_busy',lambda:self.enqueue())
        self.report['control']['recording']=False;self.report['control']['local_permission']['manual_mode']=True;self.heartbeat()
        self.error('permission_denied',lambda:self.enqueue())

    def test_stop_cannot_stop_an_unrelated_CAN_recording(self):
        self.report['device']['can']='running';self.heartbeat()
        self.error('not_started',lambda:self.enqueue('live_stop'))
        self.report['control']['live_view']['active']=True;self.report['control']['recording']=True;self.heartbeat()
        self.error('reader_busy',lambda:self.enqueue('live_stop'))

    def test_snapshot_clears_on_identity_or_epoch_change(self):
        self.report['device']['can']='running';self.report['control']['can_live']=self.snapshot;self.heartbeat()
        self.assertIsNotNone(self.store.operator.state(self.auth)['control']['can_live'])
        self.report['device']['epoch']=2;self.heartbeat()
        self.assertIsNone(self.store.operator.state(self.auth)['control']['can_live'])

    def test_start_requires_the_existing_recessive_guard_and_known_capability(self):
        self.heartbeat();self.report['device']['ctx_guard']['valid']=False;self.heartbeat()
        self.error('permission_denied',lambda:self.enqueue())
        self.report['device']['ctx_guard']['valid']=True;self.report['control']['capabilities'].remove('live_view');self.heartbeat()
        self.error('unsupported_client',lambda:self.enqueue())


if __name__=='__main__':unittest.main()
