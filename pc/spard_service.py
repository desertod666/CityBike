"""Pure decoders for normal Spard BMS replies. No transport or request builder.

Layouts: supplied Spard PC executable, SystemInfoParser 0041E672 / identity
branch00424416; supplied BMS2.4 image handler06 and30. Not yet validated on a
complete captured06/30 reply. Keep Parameters FCC separate from Information FCC.
The shared framing also carries update traffic; caller must establish normal
service context before interpreting a packet. Shape/XOR do not prove direction.
"""
import math
import struct
from functools import reduce
from operator import xor

TABLES = {
 'OVT':[100,200,300,400,600,800,1000,2000,3000,4000,6000,8000,10000,20000,30000,40000],
 'UVT':[100,200,300,400,600,800,1000,2000,3000,4000,6000,8000,10000,20000,30000,40000],
 'OCD1V': [20,30,40,50,60,70,80,90,100,110,120,130,140,160,180,200],
 'OCD1T': [50,100,200,400,600,800,1000,2000,4000,6000,8000,10000,15000,20000,30000,40000],
 'OCD2V': [30,40,50,60,70,80,90,100,120,140,160,180,200,300,400,500],
 'OCD2T': [10,20,40,60,80,100,200,400,600,800,1000,2000,4000,8000,10000,20000],
 'SCV': [50,80,110,140,170,200,230,260,290,320,350,400,500,600,800,1000],
 'SCT': list(range(0,1024,64)),
 'OCCV': [20,30,40,50,60,70,80,90,100,110,120,130,140,160,180,200],
 'OCCT': [10,20,40,60,80,100,200,400,600,800,1000,2000,4000,8000,10000,20000],
}
# word index, stock control suffix, unit, transform. Named values only; all60 raw
# words remain available, including words unused by this PC application.
FIELDS = [
 (0,'ShutDTime','s','u'),(1,'DC_Parameter','mAh','u'),(2,'BalEndV','mV','u'),
 (3,'ChgEndCur','mA','u'),(4,'ChgEndolV','mV','u'),(5,'ChgEndDel','s','u'),
 (6,'CfgOption',None,'u'),(8,'MNFDate',None,'u'),(9,'SlfDsqBalV','mV','u'),
 (10,'BalStartV','mV','u'),(11,'BalDelay','s','u'),(12,'SlfDsgDel',None,'u'),
 (14,'SOCC','mA','u'),(15,'SOCCD','ms','quarter_second'),(16,'FCC_Parameter','mAh','u'),
 (23,'SampleRV',None,'f32'),(24,'CellNum',None,'u'),(25,'OV','mV','x5'),(26,'OVR','mV','x5'),
 (27,'OVT','ms','table'),(28,'UV','mV','x20'),(29,'UVR','mV','x20'),(30,'UVT','ms','table'),
 (31,'BALV','mV','x20'),(32,'PREV','mV','x20'),(33,'LZV','mV','x20'),(34,'PFV','mV','x20'),
 (35,'OCD1V','A','current_table'),(36,'OCD1T','ms','table'),(37,'OCD2V','A','current_table'),
 (38,'OCD2T','ms','table'),(39,'SCV','A','current_table'),(40,'SCT','us','table'),
 (41,'OCCV','A','current_table'),(42,'OCCT','ms','table'),
 (43,'EOTC','C','s32'),(44,'EOTCR','C','s32'),(45,'EUTC','C','s32'),(46,'EUTCR','C','s32'),
 (47,'EOTD','C','s32'),(48,'EOTDR','C','s32'),(49,'EUTD','C','s32'),(50,'EUTDR','C','s32'),
]

def decode(raw, *, normal_service_context=False, expected_command=None):
 result={'schema':1,'status':'invalid','validated_packet':False,'fields':{},'warnings':[],
         'layout_evidence':'supplied_PC_and_BMS2.4_static_analysis','live_reply_validation':False}
 if not isinstance(raw,(bytes,bytearray,memoryview)):return {**result,'reason':'bytes_required'}
 raw=bytes(raw)
 if not 6<=len(raw)<=255:return {**result,'reason':'invalid_packet_length'}
 if raw[0]!=0x68 or raw[-1]!=0x16:return {**result,'reason':'invalid_header_or_footer'}
 if raw[1]!=len(raw) or raw[2]!=(raw[1]^255):return {**result,'reason':'invalid_length_or_complement'}
 if reduce(xor,raw[:-2],0)!=raw[-2]:return {**result,'reason':'invalid_xor_checksum'}
 result.update(validated_packet=True,raw_hex=raw.hex().upper(),command=raw[3])
 # Update traffic uses the same envelope and opcode space. A valid shape/XOR
 # must never silently become a battery configuration or an identity response.
 if normal_service_context is not True or type(expected_command) is not int or expected_command not in (6,0x30):
  return {**result,'status':'context_required','reason':'explicit_normal_service_and_expected_command_required'}
 if raw[3]!=expected_command:return {**result,'reason':'unexpected_service_reply'}
 if raw[3]==6 and len(raw)==246:
  words=list(struct.unpack('<60I',raw[4:-2]));sample=struct.unpack('<f',raw[96:100])[0]
  result.update(status='decoded',kind='parameters',words_raw=words)
  for index,name,unit,transform in FIELDS:
   value=words[index];reason=None
   if transform in ('table','current_table'):
    if value>=16:reason='lookup_index_outside_16_entries';value=None
    else:
     value=TABLES[name][value]
     if transform=='current_table':
      if not math.isfinite(sample) or sample<=0:reason='invalid_sample_resistance';value=None
      else:
       try:value=struct.unpack('<f',struct.pack('<f',value/sample))[0]
       except (OverflowError,struct.error):value=None
       if value is not None and not math.isfinite(value):value=None
       if value is None:reason='nonfinite_derived_current'
   elif transform=='f32':
    value=sample
    if not math.isfinite(value):value=None;reason='nonfinite_float'
   elif transform=='s32':value=value if value<0x80000000 else value-0x100000000
   elif transform in ('x5','x20'):value=(value*(5 if transform=='x5' else 20))&0xffffffff
   elif transform=='quarter_second':value=((value*1000)&0xffffffff)>>2
   result['fields'][name]={'word':index,'offset':4+index*4,'raw':words[index],'value':value,'unit':unit}
   if reason:result['fields'][name]['reason']=reason;result['warnings'].append(name+':'+reason)
  result['limitations']=['Parameters FCC is separate from Information FCC.','Supplied BMS2.4 can mask words45/46 and zero the parameter payload according to internal state; a reply does not guarantee a full persistent configuration dump.']
  if not any(words):result['warnings'].append('parameter_payload_all_zero')
  return result
 if raw[3]==0x30 and len(raw)==72:
  result.update(status='decoded',kind='identity',reserved_hex=raw[4:6].hex().upper())
  if raw[4:6]!=b'\0\0':result['warnings'].append('nonzero_identity_reserved_bytes')
  for name,offset in [('serial_number',6),('model',38)]:
   data=raw[offset:offset+32];prefix=data.split(b'\0',1)[0];tail=data[len(prefix):]
   printable=bool(prefix) and all(32<=c<=126 for c in prefix) and all(c==0 for c in tail)
   result['fields'][name]={'offset':offset,'bytes':32,'raw_hex':data.hex().upper(),'text':prefix.decode('ascii') if printable else None}
   if not printable:result['warnings'].append(name+':not_plain_ascii_with_optional_zero_padding')
  return result
 return {**result,'reason':'unsupported_normal_service_command_or_length'}

def decode_parameters(raw):
 """Decode only an independently identified normal Parameters06 response."""
 return decode(raw, normal_service_context=True, expected_command=6)

def decode_identity(raw):
 """Decode only an independently identified normal Identity30 response."""
 return decode(raw, normal_service_context=True, expected_command=0x30)
