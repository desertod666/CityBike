import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import uuid
from sharing import Sharing, PART_SIZE, save_credential
from bitrate_scan import scan, SCAN_RATES
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from receiver import Storage


class SharingTests(unittest.TestCase):
    def test_opt_in_is_persistent_and_old_logs_are_not_scanned(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            sharing = Sharing(root)
            self.assertFalse(sharing.settings()['enabled'])
            folder = root / 'capture';folder.mkdir()
            for name in ('wire.bin','capture.jsonl','frames.csv','completed.json'):
                (folder/name).write_text('synthetic')
            sharing.enqueue(folder)
            self.assertEqual(sharing.snapshot()['pending'],0)
            sharing.configure(dict(enabled=True,mode='marked',duration=30))
            sharing.enqueue(folder);sharing.enqueue(folder)
            self.assertEqual(Sharing(root).settings(),dict(enabled=True,mode='marked',duration=30))
            self.assertEqual(sharing.snapshot()['pending'],1)
            sharing.configure(dict(enabled=False))
            with self.assertRaises(InterruptedError):sharing.once()
            self.assertEqual(sharing.snapshot()['pending'],1)
            self.assertTrue((folder/'wire.bin').exists())

    def test_private_idempotent_chunks_hash_quota_and_no_extraction(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary); clients=root/'clients.json';client=uuid.uuid4().hex;uid=uuid.uuid4().hex
            clients.write_text(json.dumps(dict(clients=[dict(id=client,token_sha256=hashlib.sha256(b'test-only').hexdigest())])))
            store=Storage(root/'data',clients,quota=PART_SIZE*4,reserve=0)
            self.assertEqual(store.authorize('Bearer test-only'),client)
            with self.assertRaises(PermissionError):store.authorize('Bearer wrong')
            data=b'synthetic archive, deliberately not extracted'*50000
            meta=dict(schema=1,id=uid,size=len(data),sha256=hashlib.sha256(data).hexdigest(),parts=(len(data)+PART_SIZE-1)//PART_SIZE,part_size=PART_SIZE,format='tar.gz')
            self.assertEqual(store.begin(client,uid,meta)['next_part'],0)
            for part in range(meta['parts']):
                chunk=data[part*PART_SIZE:(part+1)*PART_SIZE];digest=hashlib.sha256(chunk).hexdigest()
                with self.assertRaises(ValueError):store.put(client,uid,part,chunk,'0'*64)
                store.put(client,uid,part,chunk,digest);store.put(client,uid,part,chunk,digest)
                self.assertEqual(store.begin(client,uid,meta)['next_part'],part+1)
            receipt=store.complete(client,uid)
            self.assertEqual(store.complete(client,uid),receipt)
            self.assertEqual((store.folder(client,uid)/'capture.tar.gz').read_bytes(),data)
            with self.assertRaises(ValueError):store.folder(client,'../outside')
            store.quota=len(data)
            other=uuid.uuid4().hex
            with self.assertRaises(OSError):store.begin(client,other,dict(meta,id=other))

    def test_client_resume_and_off_never_contacts_server(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);s=Sharing(root/'pc');folder=root/'capture';folder.mkdir()
            for name in ('wire.bin','capture.jsonl','frames.csv','completed.json'):(folder/name).write_text(name*1000)
            s.configure(dict(enabled=True));s.enqueue(folder)
            save_credential(s.root,dict(url='https://example.test',token='test-only'))
            client=uuid.uuid4().hex;clients=root/'clients.json'
            clients.write_text(json.dumps(dict(clients=[dict(id=client,token_sha256=hashlib.sha256(b'test-only').hexdigest())])))
            store=Storage(root/'server',clients,reserve=0)
            calls=[]
            def request(cred,method,route,data,headers=None):
                calls.append(route);items=route.split('/');uid=items[3]
                if len(items)==4:return store.begin(client,uid,json.loads(data))
                if items[4]=='complete':return store.complete(client,uid)
                return store.put(client,uid,int(items[4]),data,headers['X-Content-SHA256'])
            s.request=request
            self.assertTrue(s.once());self.assertEqual(s.snapshot()['sent'],1)
            self.assertTrue((folder/'wire.bin').exists())
            previous=len(calls);s.configure(dict(enabled=False))
            with self.assertRaises(InterruptedError):s.once()
            self.assertEqual(len(calls),previous)


class ScannerTests(unittest.TestCase):
    def test_valid_frames_select_rate_and_always_stop(self):
        calls=[];status=dict(received=0,bus_errors=0,rx_missed=0,rx_overrun=0);rate=0
        def command(text):
            nonlocal rate
            calls.append(text)
            if text.startswith('START '):rate=int(text[6:])
            if text=='STATUS':status['received']+=12 if rate==250000 else 0
            return dict(status)
        result=scan(command,lambda:False,lambda _:None,wait=lambda _:None)
        self.assertEqual(result['selected'],250000)
        self.assertEqual(calls[-1],'STOP')
        self.assertEqual(len(result['results']),len(SCAN_RATES))

    def test_silence_and_error_do_not_prove_speed(self):
        result=scan(lambda _:dict(received=0),lambda:False,lambda _:None,wait=lambda _:None)
        self.assertIsNone(result['selected'])
        calls=[]
        def broken(text):
            calls.append(text)
            if text=='START 250000':raise OSError('synthetic USB disconnect')
            return dict(received=0)
        with self.assertRaises(OSError):scan(broken,lambda:False,lambda _:None)
        self.assertEqual(calls[-1],'STOP')


if __name__=='__main__':unittest.main()
