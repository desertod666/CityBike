"""Independent stock relay authorization/dispatch tests; synthetic storage only."""
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


class StockBridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.now=1700000000.
        self.clock=patch('remote_operator.time.time',side_effect=lambda:self.now);self.clock.start()
        self.uid='a'*32;self.key='b'*64;self.auth='Bearer synthetic-owner'
        config=self.root/'config';config.mkdir()
        self.policy=config/'control-policy.json';self.policy.write_text(json.dumps(dict(schema=1,enabled=True,manual_lock=False)))
        self.owner=config/'operator-policy.json';self.owner.write_text(json.dumps(dict(schema=1,enabled=True,mac='e0:72:a1:72:38:d9',token_sha256=hashlib.sha256(self.auth[7:].encode()).hexdigest(),initial_bridge_key_sha256=hashlib.sha256(self.key.encode()).hexdigest())))
        self.store=Storage(self.root/'data',self.root/'clients.json',reserve=0,control_policy=self.policy)
        self.report=dict(schema=1,sequence=1,source='browser-stock',connected=True,events=[],
            device=dict(product='StockCANAdapter',protocol=1,usb_vid='1A86',usb_pid='7523'),
            bridge=dict(kind='stock',boot='1234ABCD',uptime_us=1000000,port_count=1),
            control=dict(version=2,web_build='synthetic-stock-build',ready=True,capabilities=['spard_probe','stop'],
                local_permission=dict(remote_support_enabled=True,manual_mode=False),lease_expires_at=self.now+30,
                last=None,stock_adapter=dict(active=False,latest_information=None),recording=False,busy=False,updating=False))

    def tearDown(self):self.clock.stop();self.tmp.cleanup()
    def heartbeat(self,auth='',report=None,uid=None,key=None,advance=True):
        report=self.report if report is None else report;uid=uid or self.uid;key=self.key if key is None else key
        if advance:report['sequence']+=1;report['bridge']['uptime_us']+=1000
        report['control']['lease_expires_at']=self.now+30
        self.store.monitor(uid,report,control_key=key,authorization=auth)
        return self.store.support(uid,report,key)
    def register(self):return self.heartbeat(auth=self.auth)
    def enqueue(self,action='spard_information',ident='c'*32):return self.store.operator.enqueue(self.auth,dict(id=ident,action=action))
    def error(self,code,call):
        with self.assertRaises(OperatorError) as exc:call()
        self.assertEqual(exc.exception.code,code)
    def pending(self):return self.store.root/'control'/self.uid/'pending.json'
    def start(self):
        self.enqueue();self.heartbeat()
        self.report['control'].update(last=dict(id='c'*32,kind='spard_probe',state='started'),busy=True,stock_adapter=dict(active=True,remaining_ms=30000))
        self.heartbeat()

    def test_initial_stock_cannot_use_ESP_pin_without_owner(self):
        self.error('unauthorized',lambda:self.heartbeat())
        self.assertFalse(self.store.operator.state(self.auth)['bridge_authenticated'])
        self.assertFalse((self.store.root/'monitor'/self.uid/'latest.json').exists())

    def test_service_read_requires_explicit_new_page_capability(self):
        self.register()
        for action in ('spard_identity','spard_parameters'):
            self.error('unsupported_client',lambda action=action:self.enqueue(action))
        self.assertFalse(self.pending().exists())

    def service_read(self,mode):
        self.report['control']['capabilities'].append('spard_service_reads_v1')
        self.register();self.enqueue('spard_'+mode)
        original=self.pending().read_bytes()
        job=self.heartbeat()
        self.assertEqual(job['mode'],mode);self.assertEqual(job['duration'],30)
        self.assertIn('expected_bridge_boot',job)
        # A queued identity read cannot be changed into a parameter read.
        changed=json.loads(original);changed['mode']='parameters' if mode=='identity' else 'identity'
        self.pending().write_text(json.dumps(changed));self.assertIsNone(self.heartbeat())
        self.pending().write_bytes(original)
        self.report['control']['capabilities'].remove('spard_service_reads_v1')
        self.assertIsNone(self.heartbeat())

    def test_identity_read_is_bound_to_record_and_page(self):self.service_read('identity')
    def test_parameter_read_is_bound_to_record_and_page(self):self.service_read('parameters')

    def test_owner_enrollment_then_registered_key_without_bearer(self):
        self.register();self.now+=5;self.heartbeat()
        state=self.store.operator.state(self.auth)
        self.assertTrue(state['online']);self.assertEqual(state['bridge']['kind'],'stock')
        self.assertEqual(state['device'],self.report['device'])
        self.assertNotIn('boot',state['device']);self.assertNotIn('can',state['device']);self.assertNotIn('ap_mac',state['device'])
        self.assertNotIn(self.key,json.dumps(state));self.assertNotIn('key_sha256',json.dumps(state))
        session=json.loads((self.pending().parent/'session.json').read_text())
        self.assertEqual(session['bridge_boot'],'1234ABCD');self.assertNotIn('mac',session)

    def test_site_update_status_is_visible_without_credentials(self):
        self.report['control']['site_update']=dict(state='waiting',controlled=True,waiting=True,busy_reasons=['stock_probe'],last_error='x'*200,token='never return',unexpected='drop')
        self.register();update=self.store.operator.state(self.auth)['control']['site_update']
        self.assertEqual(update['busy_reasons'],['stock_probe']);self.assertEqual(update['state'],'waiting')
        self.assertNotIn('token',update)
        self.assertNotIn('unexpected',update);self.assertEqual(len(update['last_error']),160)

    def test_known_key_and_uid_cannot_be_overwritten_even_with_owner(self):
        self.register();before=copy.deepcopy(self.store.operator.bridges)
        self.error('bridge_key_required',lambda:self.heartbeat(auth=self.auth,key='d'*64))
        self.assertEqual(self.store.operator.bridges,before)

    def test_wrong_adapter_fake_ESP_fields_extra_caps_and_bad_bridge_rejected(self):
        variants=[]
        for change in ({'usb_pid':'0000'},{'product':'BafangReader'},{'boot':'DEADBEEF'},{'ap_mac':'e0:72:a1:72:38:d9'}):
            r=copy.deepcopy(self.report);r['device'].update(change);variants.append(r)
        for caps in (['spard_probe','capture'],['stop','flash'],[['stop']],['stop','stop']):
            r=copy.deepcopy(self.report);r['control']['capabilities']=caps;variants.append(r)
        for change in ({'boot':'not-hex'},{'uptime_us':True},{'port_count':2},{'uptime_us':-1}):
            r=copy.deepcopy(self.report);r['bridge'].update(change);variants.append(r)
        for report in variants:
            with self.subTest(report=report):
                with self.assertRaises(ValueError):self.heartbeat(auth=self.auth,report=report,advance=False)
        self.assertFalse(self.store.operator.bridges['items'])

    def test_frozen_uptime_and_replayed_sequence_cannot_refresh_online(self):
        self.register()
        for _ in range(4):
            self.now+=5;self.report['sequence']+=1;self.heartbeat(advance=False)
        self.assertFalse(self.store.operator.state(self.auth)['online'])
        self.error('offline',lambda:self.enqueue())
        self.report['bridge']['uptime_us']+=1000
        self.heartbeat(advance=False)  # same sequence is also a replay
        self.assertFalse(self.store.operator.state(self.auth)['online'])

    def test_same_epoch_uptime_rollback_does_not_replace_high_water(self):
        self.register();before=copy.deepcopy(self.store.operator.bridges)
        self.report['bridge']['uptime_us']=0
        self.error('bridge_clock_reversed',lambda:self.heartbeat(advance=False))
        self.assertEqual(self.store.operator.bridges,before)

    def test_stock_information_dispatch_and_idempotent_listen(self):
        self.register();self.enqueue('spard_listen');job=self.heartbeat()
        self.assertEqual(job['kind'],'spard_probe');self.assertEqual(job['mode'],'listen');self.assertEqual(job['duration'],30)
        self.assertEqual(job['expected_bridge_boot'],'1234ABCD');self.assertEqual(job['adapter_vid'],'1A86')
        self.assertNotIn('expected_boot',job);self.assertNotIn('expected_mac',job);self.assertNotIn('key_sha256',job)
        raw=self.pending().read_bytes();self.now+=70
        self.assertEqual(self.enqueue('spard_listen')['job']['id'],'c'*32)
        self.assertEqual(self.pending().read_bytes(),raw)

    def test_stock_denies_all_ESP_actions(self):
        self.register()
        for action in ('capture30','capture60','rx_check'):
            self.error('unsupported_client',lambda action=action:self.enqueue(action))
        for action in ('sampling_sweep','flash','paired_probe','arbitrary_can','set_can_id'):
            self.error('invalid_action',lambda action=action:self.enqueue(action))

    def test_dispatch_requires_owner_record_not_SSH_pending_or_legacy_grant(self):
        self.register();self.enqueue();(self.store.operator.root/'jobs'/('c'*32+'.json')).unlink()
        self.assertIsNone(self.heartbeat())

    def test_pending_cannot_change_target_adapter_or_duration_or_add_fields(self):
        self.register();self.enqueue();original=json.loads(self.pending().read_text())
        for changes in ({'adapter_pid':'0000'},{'expected_bridge_boot':'DEADBEEF'},{'duration':120},{'expected_mac':'e0:72:a1:72:38:d9'},{'mode':'arbitrary'},{'kind':'flash'}):
            with self.subTest(changes=changes):
                self.pending().write_text(json.dumps({**original,**changes}))
                self.assertIsNone(self.heartbeat())

    def test_local_revocation_and_server_hold_prevent_dispatch_and_new_jobs(self):
        self.register();self.enqueue();self.report['control']['local_permission']['manual_mode']=True
        self.assertIsNone(self.heartbeat());self.error('permission_denied',lambda:self.enqueue(ident='d'*32))
        self.report['control']['local_permission']['manual_mode']=False
        self.policy.write_text(json.dumps(dict(schema=1,enabled=False,manual_lock=True)))
        self.assertIsNone(self.heartbeat());self.error('permission_denied',lambda:self.enqueue(ident='d'*32))

    def test_disconnected_and_ambiguous_reports_are_trusted_but_offline(self):
        self.register();self.start()
        self.report['connected']=False;self.report['bridge']['port_count']=0
        self.assertIsNone(self.heartbeat())
        state=self.store.operator.state(self.auth)
        self.assertFalse(state['online']);self.assertEqual(state['pending']['state'],'interrupted')
        self.report['bridge']['port_count']=2;self.heartbeat()
        self.assertEqual(self.store.operator.state(self.auth)['bridge']['port_count'],2)
        self.error('offline',lambda:self.enqueue(ident='d'*32))

    def test_new_bridge_epoch_interrupts_active_job(self):
        self.register();self.start();self.report['bridge'].update(boot='DEADBEEF',uptime_us=0)
        self.heartbeat()
        self.assertEqual(self.store.operator.state(self.auth)['pending']['reason'],'bridge_reset_or_disconnected')

    def test_two_authenticated_stock_tabs_conflict(self):
        self.register();other=copy.deepcopy(self.report)
        self.heartbeat(auth=self.auth,report=other,uid='d'*32,key='e'*64)
        self.assertTrue(self.store.operator.state(self.auth)['conflict'])
        self.error('bridge_conflict',lambda:self.enqueue())

    def test_STOP_only_exact_started_owner_stock_job(self):
        self.register();self.enqueue();self.error('not_started',lambda:self.enqueue('stop','d'*32))
        self.report['control'].update(last=dict(id='c'*32,kind='spard_probe',state='started'),busy=True,stock_adapter=dict(active=True))
        self.heartbeat();queued=self.enqueue('stop','d'*32);self.assertEqual(queued['job']['target_job_id'],'c'*32)
        stop=self.heartbeat();self.assertEqual(stop['target_job_id'],'c'*32);self.assertEqual(stop['expected_bridge_boot'],'1234ABCD')
        self.report['control']['last']=dict(id='d'*32,kind='stop',state='complete');self.heartbeat()
        self.assertEqual(self.store.operator.load_job('c'*32)['state'],'cancelled')

    def test_fabricated_started_last_cannot_authorize_STOP(self):
        self.register();self.report['control']['last']=dict(id='f'*32,kind='spard_probe',state='started');self.heartbeat()
        self.error('not_started',lambda:self.enqueue('stop'))

    def test_untrusted_last_identifier_cannot_read_outside_job_directory(self):
        self.register();self.report['control']['last']=dict(id='../../config/operator-policy',kind='spard_probe',state='started')
        self.heartbeat();self.error('not_started',lambda:self.enqueue('stop'))

    def test_kind_rebind_interrupts_even_if_boot_tokens_collide(self):
        self.register();self.start()
        esp=dict(schema=1,sequence=self.report['sequence']+1,source='browser-usb',connected=True,events=[],
            device=dict(product='BafangReader',protocol=1,ap_mac='e0:72:a1:72:38:d9',boot='1234ABCD',uptime_us=500000,can='stopped'),
            control=copy.deepcopy(self.report['control']))
        self.store.monitor(self.uid,esp,control_key=self.key,authorization=self.auth)
        self.assertEqual(self.store.operator.load_job('c'*32)['state'],'interrupted')

    def test_same_UID_rebind_requires_owner_and_preserves_key(self):
        self.register()
        esp=dict(schema=1,sequence=self.report['sequence']+1,source='browser-usb',connected=True,events=[],
            device=dict(product='BafangReader',protocol=1,ap_mac='e0:72:a1:72:38:d9',boot='DEADBEEF',uptime_us=500000,can='stopped'),
            control=copy.deepcopy(self.report['control']))
        self.error('bridge_identity_changed',lambda:self.store.monitor(self.uid,esp,control_key=self.key))
        self.store.monitor(self.uid,esp,control_key=self.key,authorization=self.auth)
        self.assertEqual(self.store.operator.state(self.auth)['device']['product'],'BafangReader')
        self.report['sequence']=esp['sequence']+1
        self.error('bridge_identity_changed',lambda:self.heartbeat(advance=False))
        self.heartbeat(auth=self.auth,advance=False)
        self.assertEqual(self.store.operator.state(self.auth)['bridge']['kind'],'stock')
        self.assertEqual(json.loads((self.pending().parent/'session.json').read_text())['bridge_kind'],'stock')


if __name__=='__main__':unittest.main()
