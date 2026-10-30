import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
from handset import Handset,HandsetError
class HandsetTests(unittest.TestCase):
 def setUp(self):self.time=0.;self.h=Handset(lambda:self.time,lambda:1700000000+self.time);self.seq=0
 def send(self,action,**extra):
  if action in ('down','keep'):extra.setdefault('expires_at_ms',self.h.wall_clock()*1000+900)
  self.seq+=1;return self.h.request(dict(actor='1'*16,seq=self.seq,action=action,expected_boot='12345678',**extra),'u','12345678','m')
 def test_control_and_release(self):
  self.send('on');self.send('down',hold='a'*8,button=2);self.time=.5;self.send('keep',hold='a'*8);self.assertEqual(self.h.snapshot('u','12345678')['button'],2);self.send('up',hold='a'*8);self.assertEqual(self.h.snapshot('u','12345678')['button'],0)
 def test_missing_keep_expires_cannot_rearm(self):
  self.send('on');self.send('down',hold='a'*8,button=2);self.time=1.;self.assertEqual(self.h.snapshot('u','12345678')['button'],0)
  with self.assertRaises(HandsetError):self.send('keep',hold='a'*8)
  with self.assertRaises(HandsetError):self.send('down',hold='a'*8,button=2)
 def test_power_confirmation(self):
  self.send('on')
  for value in [False,None,1,'true']:
   with self.assertRaises(HandsetError):self.send('down',hold='a'*8,button=3,confirmed=value)
  self.assertEqual(self.send('down',hold='a'*8,button=3,confirmed=True)['button'],3)
 def test_timeout_boot_and_second_actor(self):
  self.send('on');self.send('down',hold='a'*8,button=2);self.assertFalse(self.h.snapshot('u','87654321')['enabled'])
  with self.assertRaises(HandsetError):self.h.request(dict(actor='2'*16,seq=1,action='on',expected_boot='12345678'),'u','12345678','m')
  self.time=3.;self.assertFalse(self.h.snapshot('u','12345678')['enabled']);self.send('on');self.send('off');self.assertFalse(self.h.snapshot('u','12345678')['enabled'])
 def test_stale_release_does_not_drop_new_hold(self):
  self.send('on');self.send('down',hold='a'*8,button=1);self.send('up',hold='a'*8);self.send('down',hold='b'*8,button=2);self.send('up',hold='a'*8);self.assertEqual(self.h.snapshot('u','12345678')['button'],2)
 def test_malformed(self):
  for body in [None,[],{},dict(actor=[],seq=1,action='on'),dict(actor='1'*16,seq=True,action='on'),dict(actor='1'*16,seq=1,action=[]),dict(actor='1'*16,seq=1,action='on',command='motor')]:
   with self.assertRaises(HandsetError):self.h.request(body,'u','b','m')
 def test_max_hold(self):
  self.send('on');self.send('down',hold='a'*8,button=2)
  for i in range(1,60):self.time=i*.5;self.send('keep',hold='a'*8)
  self.time=30.;self.assertEqual(self.h.snapshot('u','12345678')['button'],0)
 def test_delayed_input_keeps_original_deadline(self):
  initial=self.send('on');deadline=initial['server_time_ms']+900
  self.time=.7;pressed=self.send('down',hold='a'*8,button=2,expires_at_ms=deadline)
  self.assertLessEqual(pressed['key_lease_ms'],200)
  self.time=.91;self.assertEqual(self.h.snapshot('u','12345678')['button'],0)
  with self.assertRaises(HandsetError):self.send('down',hold='b'*8,button=2,expires_at_ms=deadline)
 def test_release_overtakes_inflight_press(self):
  self.send('on');self.send('up',hold='a'*8)
  with self.assertRaises(HandsetError):self.h.request(dict(actor='1'*16,seq=1,action='down',expected_boot='12345678',hold='a'*8,button=2,expires_at_ms=self.h.wall_clock()*1000+900),'u','12345678','m')
  self.assertEqual(self.h.snapshot('u','12345678')['button'],0)
 def test_missing_invalid_and_future_deadlines(self):
  self.send('on')
  for deadline in (None,True,float('nan'),float('inf'),self.h.wall_clock()*1000-1,self.h.wall_clock()*1000+901):
   with self.subTest(deadline=deadline),self.assertRaises(HandsetError):self.send('down',hold='a'*8,button=1,expires_at_ms=deadline)
if __name__=='__main__':unittest.main()
