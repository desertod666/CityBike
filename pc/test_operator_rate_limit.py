"""HTTP owner authentication throttling, using only loopback and temporary policy."""
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
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
from receiver import Handler, Storage
from remote_operator import OperatorError, AUTH_LIMIT, AUTH_IP_CAP


class OperatorRateLimitTests(unittest.TestCase):
    OWNER='synthetic-short-key-test'
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.now=1000.
        config=self.root/'config';config.mkdir();control=config/'control-policy.json';control.write_text(json.dumps(dict(schema=1,enabled=True,manual_lock=False)))
        self.pin='b'*64;policy=config/'operator-policy.json';policy.write_text(json.dumps(dict(schema=1,enabled=True,mac='e0:72:a1:72:38:d9',token_sha256=hashlib.sha256(self.OWNER.encode()).hexdigest(),initial_bridge_key_sha256=hashlib.sha256(self.pin.encode()).hexdigest())))
        self.store=Storage(self.root/'data',config/'unused.json',reserve=0,control_policy=control)
        self.clock=patch('remote_operator.time.monotonic',side_effect=lambda:self.now);self.clock.start()
        class TestHandler(Handler):pass
        TestHandler.store=self.store;self.server=ThreadingHTTPServer(('127.0.0.1',0),TestHandler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.clock.stop();self.tmp.cleanup()
    def call(self,method='GET',path='/v1/operator/state',token='wrong',body=None,headers=None):
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3);h=dict(headers or {})
        if token is not None:h['Authorization']='Bearer '+token
        raw=json.dumps(body or {}).encode();c.request(method,path,None if method=='GET' else raw,h)
        r=c.getresponse();result=(r.status,dict(r.getheaders()),json.loads(r.read()));c.close();return result
    def lock(self):
        for i in range(AUTH_LIMIT):
            status,_,data=self.call(headers={'X-Forwarded-For':'198.51.100.'+str(i+1)})
            self.assertEqual(status,401 if i<AUTH_LIMIT-1 else 429)
        self.assertEqual(data['error'],'rate_limited');self.assertEqual(data['retry_after_s'],60)
    def test_locked_peer_is_denied_before_comparison_even_with_valid_key(self):
        with patch.object(self.store.operator,'authorized',wraps=self.store.operator.authorized) as compare:
            self.lock();count=compare.call_count
            status,headers,data=self.call(token=self.OWNER,headers={'X-Forwarded-For':'203.0.113.99'})
            self.assertEqual(status,429);self.assertEqual(compare.call_count,count)
            self.assertEqual(headers['Retry-After'],str(data['retry_after_s']))
            self.now+=61;self.assertEqual(self.call(token=self.OWNER)[0],200)
    def test_other_peer_and_direct_helpers_are_not_globally_locked(self):
        self.lock()
        self.assertTrue(self.store.operator.authorize_http('Bearer '+self.OWNER,'203.0.113.5'))
        self.assertTrue(self.store.operator.state('Bearer '+self.OWNER)['ok'])
        self.assertEqual(self.call(token=self.OWNER)[0],429)
    def test_valid_requests_do_not_create_or_increment_failed_counts(self):
        for _ in range(10):self.assertEqual(self.call(token=self.OWNER)[0],200)
        self.assertEqual(self.store.operator.failed_ips,{})
        for _ in range(AUTH_LIMIT-1):self.assertEqual(self.call()[0],401)
        before=self.store.operator.failed_ips['127.0.0.1']['failed']
        self.assertEqual(self.call(token=self.OWNER)[0],200)
        self.assertEqual(self.store.operator.failed_ips['127.0.0.1']['failed'],before)
        self.assertEqual(self.call()[0],429)
    def test_all_owner_routes_share_one_peer_budget_including_unknown_monitor_uid(self):
        calls=[('POST','/v1/monitor/'+'a'*32),('GET','/v1/operator/state'),('POST','/v1/operator/jobs'),('POST','/v1/monitor/'+'c'*32),('POST','/v1/monitor/not-a-uuid')]
        for i,(method,path) in enumerate(calls):self.assertEqual(self.call(method,path)[0],401 if i<AUTH_LIMIT-1 else 429)
        self.assertEqual(self.call(token=self.OWNER)[0],429)
        self.assertFalse((self.store.root/'monitor').exists())
    def test_existing_pinned_monitor_without_bearer_is_untouched(self):
        uid='d'*32;folder=self.store.root/'control'/uid;folder.mkdir(parents=True)
        (folder/'session.json').write_text(json.dumps(dict(key_sha256=hashlib.sha256(self.pin.encode()).hexdigest())))
        report=dict(schema=1,sequence=1,source='browser-usb',connected=True,events=[],device=dict(product='BafangReader',protocol=1,ap_mac='e0:72:a1:72:38:d9',boot='AABBCCDD',uptime_us=1000,version='0.4.8',can='stopped'),control=dict(version=2,ready=False,capabilities=[]))
        self.lock();status,_,data=self.call('POST','/v1/monitor/'+uid,token=None,body=report,headers={'X-Reader-Control':self.pin})
        self.assertEqual(status,200);self.assertTrue(data['ok']);self.assertEqual(self.store.operator.bridges['selected'],uid)
        self.assertEqual(self.call(token=self.OWNER)[0],429)
    def test_sliding_window_does_not_reset_more_recent_failures(self):
        self.assertEqual(self.call()[0],401)
        self.now+=59
        for _ in range(AUTH_LIMIT-2):self.assertEqual(self.call()[0],401)
        self.now+=2
        self.assertEqual(self.call()[0],401) # Only the oldest failure has expired.
        self.assertEqual(self.call()[0],429)

    def test_failure_window_and_map_are_bounded(self):
        for _ in range(AUTH_LIMIT-1):self.assertEqual(self.call()[0],401)
        self.now+=61;self.assertEqual(self.call()[0],401)
        self.assertEqual(self.store.operator.failed_ips['127.0.0.1']['failed'],1)
        for i in range(AUTH_IP_CAP+10):
            with self.assertRaises(OperatorError):self.store.operator.authorize_http('Bearer wrong','peer-'+str(i))
        self.assertLessEqual(len(self.store.operator.failed_ips),AUTH_IP_CAP)
        self.assertTrue(self.store.operator.authorize_http('Bearer '+self.OWNER,'unrelated-valid-peer'))
        self.assertLessEqual(len(self.store.operator.failed_ips),AUTH_IP_CAP)

if __name__=='__main__':unittest.main()
