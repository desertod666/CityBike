import sys,unittest,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
from remote_operator import sanitize_ble,control_snapshot

class BleStatusTests(unittest.TestCase):
 def status(self):
  return dict(schema=1,phase='disconnected',stage='service_discovery',bluetooth_api=True,adapter_available=True,gatt_connected=False,device_name='Citybike Tester',notification_count=0,advertisement_count=0,updated_utc='2026-10-29T08:00:00Z',last_error=dict(stage='service_discovery',name='NotFoundError',message='No service',host_utc='2026-10-29T07:59:00Z'))
 def test_failed_stage_visible_in_private_control(self):
  value=self.status();self.assertEqual(sanitize_ble(value),value)
  self.assertEqual(control_snapshot({'ble_remote':value})['ble_remote'],value)
 def test_rejects_invalid_types_and_unhashable_stages(self):
  for key,values in dict(schema=[True,2,None],phase=[None,[],{},'running'],stage=[None,{},[],'write'],bluetooth_api=[None,1],gatt_connected=[0,'false'],adapter_available=[0,'true'],notification_count=[True,-1,1.2,9007199254740992],advertisement_count=[False,-1]).items():
   for item in values:
    value=self.status();value[key]=item
    with self.subTest(key=key,item=item):self.assertIsNone(sanitize_ble(value))
  for value in [None,[],1,'ble']:self.assertIsNone(sanitize_ble(value))
 def test_bounds_and_discards_unrelated_fields(self):
  value=self.status();value.update(device_name='x'*900,updated_utc='x'*100,raw_key='not exported',command='MOTOR START',advertisements=['raw']*100)
  value['last_error'].update(name='x'*900,message='x'*900,host_utc='x'*900,secret='not exported')
  result=sanitize_ble(value);self.assertEqual(len(result['device_name']),248);self.assertEqual(len(result['updated_utc']),32);self.assertEqual(len(result['last_error']['message']),240);self.assertNotIn('command',result);self.assertNotIn('advertisements',result);self.assertNotIn('raw_key',result);self.assertNotIn('secret',result['last_error'])
 def test_unknown_last_error_does_not_crash_heartbeat(self):
  for item in [None,[],True,{},dict(stage=[]),dict(stage='write')]:
   value=self.status();value['last_error']=item;self.assertIsNone(sanitize_ble(value)['last_error'])
 def test_api_missing_or_adapter_unknown_remains_honest(self):
  value=self.status();value.update(bluetooth_api=False,adapter_available=None,last_error=None,device_name=None)
  self.assertEqual(sanitize_ble(value),value)
 def test_discovered_service_is_bounded_and_optional(self):
  value=self.status()
  for uuid in ['70079900-30e2-492d-b593-a5e53006fc60','60fc0630-e5a5-93b5-2d49-e23000990770',None]:
   value['service_uuid']=uuid;self.assertEqual(sanitize_ble(value)['service_uuid'],uuid)
  for bad in [[],{},True,'unknown','x'*999]:
   value['service_uuid']=bad;self.assertIsNone(sanitize_ble(value)['service_uuid'])

if __name__=='__main__':unittest.main()
