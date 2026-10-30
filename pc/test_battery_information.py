"""Original ESP CAN reply, fixed owner job, cancellation and bounded forwarding."""
import copy,json,unittest
from pathlib import Path
from pc import test_can_live as fixtures
from battery_information import sanitize_battery
RAW='685AA500E10FDF0FE20FE10FE10FE10FE20FE10FE10FE10F000000000000000000000000121717BE05BE0565055E000000000000000000240000000000000000012B00CC5F2E010A6400080A1B100D0A0000009F02006A0BAB16'
class BatteryTests(unittest.TestCase):
 tearDown=fixtures.LiveCANTests.tearDown
 heartbeat=fixtures.LiveCANTests.heartbeat
 enqueue=fixtures.LiveCANTests.enqueue
 error=fixtures.LiveCANTests.error
 pending=fixtures.LiveCANTests.pending
 def setUp(self):
  fixtures.LiveCANTests.setUp(self)
  self.report['device'].update(version='0.5.2',rx_sampling_250k='TRIPLE',capabilities=['command_ids','spard_information_query'])
  self.report['control']['capabilities'].append('battery_information')
  self.info=dict(schema=1,source='esp_can_std666',origin='esp_query',boot='ABCDEF12',epoch=1,first_seq=11,last_seq=22,t_us=900000,fragments=12,raw_hex=RAW,age_ms=0)
  self.reading=dict(active=False,phase='complete',error=None,valid_packets=1,remaining_ms=0,information=self.info)
 def test_full_real_packet_and_scope_survives_view_restart(self):
  self.assertEqual(sanitize_battery(self.reading,self.report['device']),self.reading)
  self.report['device']['epoch']=2
  self.assertEqual(sanitize_battery(self.reading,self.report['device']),self.reading)
  for change in [dict(boot='12345678'),dict(product='StockCANAdapter'),dict(epoch=0)]:
   self.assertIsNone(sanitize_battery(self.reading,{**self.report['device'],**change}))
 def test_each_corrupted_byte_and_all_truncations_are_rejected(self):
  for i in range(90):
   raw=bytearray.fromhex(RAW);raw[i]^=1;r=copy.deepcopy(self.reading);r['information']['raw_hex']=raw.hex().upper();self.assertIsNone(sanitize_battery(r,self.report['device']),i)
  for length in range(90):
   r=copy.deepcopy(self.reading);r['information']['raw_hex']=RAW[:length*2];self.assertIsNone(sanitize_battery(r,self.report['device']),length)
 def test_source_bounds_unknown_fields_and_strict_numbers(self):
  for field,value in [('source','stock_adapter'),('origin','stock'),('fragments',1),('fragments',True),('first_seq',23),('age_ms',-1),('epoch',2),('token','private')]:
   r=copy.deepcopy(self.reading);r['information'][field]=value;self.assertIsNone(sanitize_battery(r,self.report['device']),(field,value))
  for field,value in [('active',1),('remaining_ms',45001),('valid_packets',True),('error','x'*161),('phase','write')]:
   r=copy.deepcopy(self.reading);r[field]=value;self.assertIsNone(sanitize_battery(r,self.report['device']))
 def test_latest_visible_to_owner_without_copying_raw_into_history(self):
  self.report['control']['battery_information']=self.reading;self.heartbeat()
  state=self.store.operator.state(self.auth);self.assertEqual(state['control']['battery_information']['information']['raw_hex'],RAW)
  latest=json.loads((self.store.root/'monitor'/self.uid/'latest.json').read_text());self.assertEqual(latest['report']['control']['battery_information']['information']['raw_hex'],RAW)
  history=(self.store.root/'monitor'/self.uid/'history.jsonl').read_text();self.assertNotIn(RAW,history);self.assertNotIn('battery_information',json.loads(history.splitlines()[0])['report']['control'])
 def test_fixed_query_job_and_no_extra_inputs(self):
  self.heartbeat();queued=self.enqueue('battery_information');self.assertEqual(queued['job']['duration_s'],45);job=self.heartbeat()
  self.assertEqual(set(job),{'id','kind','expected_mac','expected_boot','expires_at'});self.assertEqual(job['kind'],'battery_information')
  p=self.pending();original=json.loads(p.read_text())
  for key,value in [('opcode','05'),('payload','00'),('duration',100),('expected_mac','02:00:00:00:00:02')]:
   p.write_text(json.dumps({**original,key:value}));self.assertIsNone(self.heartbeat(),key)
  p.write_text(json.dumps(original));(self.store.operator.root/'jobs'/('c'*32+'.json')).unlink();self.assertIsNone(self.heartbeat())
 def test_053_fixed_query_delivery_with_quality_capability(self):
  self.report['device']['version']='0.5.3';self.report['device']['capabilities'].append('spard_query_quality_v1')
  self.heartbeat();self.enqueue('battery_information');job=self.heartbeat();self.assertEqual(job['kind'],'battery_information')
  self.assertEqual(set(job),{'id','kind','expected_mac','expected_boot','expires_at'})
 def test_054_trace_capability_fixed_query_delivery(self):
  self.report['device']['version']='0.5.4';self.report['device']['capabilities']+=['spard_query_quality_v1','spard_tx_trace_v1']
  self.heartbeat();self.enqueue('battery_information');self.assertEqual(self.heartbeat()['kind'],'battery_information')
 def test_query_can_pause_live_view_but_not_recording(self):
  self.report['device']['can']='running';self.report['control']['live_view']=dict(active=True,remote=True);self.heartbeat();self.enqueue('battery_information');self.assertEqual(self.heartbeat()['kind'],'battery_information')
 def test_old_firmware_or_missing_capability_cannot_query(self):
  for change in [dict(version='0.4.9'),dict(rx_sampling_250k='DEFAULT'),dict(capabilities=['command_ids'])]:
   original=copy.deepcopy(self.report['device']);self.report['device'].update(change);self.heartbeat();self.error('unsupported_client',lambda:self.enqueue('battery_information'));self.report['device']=original
  self.report['control']['recording']=True;self.heartbeat();self.error('reader_busy',lambda:self.enqueue('battery_information'))
 def test_query_diagnostics_survive_return_to_live_view_without_archiving_raw_CAN(self):
  self.report['device']['can']='running';self.report['control']['live_view']=dict(active=True,remote=True)
  self.report['events']=[dict(type='device',device=dict(type=t,boot='ABCDEF12',epoch=1)) for t in ['battery_query_result','battery_tx_diagnostic','frame']]
  self.heartbeat();history=self.store.root/'monitor'/self.uid/'history.jsonl'
  events=json.loads(history.read_text().splitlines()[-1])['report']['events']
  self.assertEqual([e['device']['type'] for e in events],['battery_query_result','battery_tx_diagnostic'])
 def test_remote_STOP_targets_only_started_query(self):
  self.heartbeat();self.enqueue('battery_information');self.heartbeat();self.error('not_started',lambda:self.enqueue('stop','d'*32))
  self.report['control']['last']=dict(id='c'*32,kind='battery_information',state='started');self.report['control']['battery_information']={**self.reading,'active':True,'phase':'qualifying'};self.heartbeat();self.enqueue('stop','d'*32);job=self.heartbeat();self.assertEqual(job['target_job_id'],'c'*32)
if __name__=='__main__':unittest.main()
