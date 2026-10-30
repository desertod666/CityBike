"""Bounded latest ESP Information00 response, never adapter data or commands."""
from reader_version import version_at_least
import re
from functools import reduce
from operator import xor
MAX_INT=9007199254740991
PHASES={'idle','preparing','qualifying','querying','complete','failed','cancelled'}
def integer(value,low=0,high=MAX_INT):return type(value) is int and low<=value<=high

def sanitize_battery(value,device):
 if (not isinstance(device,dict) or device.get('product')!='BafangReader' or type(device.get('protocol')) is not int or device.get('protocol')!=1
     or not isinstance(value,dict) or set(value) not in ({'active','phase','error','valid_packets','remaining_ms','information'},{'active','phase','error','valid_packets','remaining_ms','information','read_mode'})
     or value.get('read_mode','normal') not in ('normal','quiet')
     or value.get('read_mode')=='quiet' and (not version_at_least(device.get('version'),'0.5.7') or 'spard_quiet_query_v1' not in device.get('capabilities',[]))
     or type(value.get('active')) is not bool or value.get('phase') not in PHASES
     or not integer(value.get('valid_packets')) or not integer(value.get('remaining_ms'),0,45000)
     or value.get('error') is not None and (not isinstance(value['error'],str) or len(value['error'])>160)):
  return None
 result=dict(value);info=value.get('information')
 if info is None:return result
 if (not isinstance(info,dict) or set(info)!={'schema','source','origin','boot','epoch','first_seq','last_seq','t_us','fragments','raw_hex','age_ms'}
     or type(info.get('schema')) is not int or info['schema']!=1 or info.get('source')!='esp_can_std666'
     or info.get('origin') not in ('observed','esp_query') or not isinstance(info.get('boot'),str)
     or not re.fullmatch(r'[A-F0-9]{8}',info['boot']) or info['boot']!=device.get('boot')
     or not integer(info.get('epoch')) or not integer(device.get('epoch')) or info['epoch']>device['epoch']
     or not integer(info.get('first_seq')) or not integer(info.get('last_seq'),info['first_seq'])
     or not integer(info.get('t_us')) or not integer(info.get('fragments'),12,90)
     or info['fragments']>info['last_seq']-info['first_seq']+1 or not integer(info.get('age_ms'),0,86400000)
     or not isinstance(info.get('raw_hex'),str) or not re.fullmatch(r'[A-F0-9]{180}',info['raw_hex'])):
  return None
 raw=bytes.fromhex(info['raw_hex'])
 if raw[:4]!=bytes([0x68,90,0xA5,0]) or raw[-1]!=0x16 or reduce(xor,raw[:-2],0)!=raw[-2] or not 1<=raw[71]<=16:return None
 result['information']=dict(info)
 return result
