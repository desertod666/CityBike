"""Interpret already-captured C3 ECC fields, not bicycle fault codes.

Names come from the pinned IDF5.5 ESP32-C3 twai_ll.h. No transport or commands.
"""
import re

SEGMENTS={3:'start_of_frame',2:'identifier_28_21',4:'substitute_RTR',5:'IDE',
          6:'identifier_20_18',7:'identifier_17_13',8:'CRC_sequence',9:'reserved_0',
          10:'data',11:'DLC',12:'RTR',13:'reserved_1',14:'identifier_4_0',
          15:'identifier_12_5',17:'active_error_flag',18:'intermission',
          19:'error_flag_superposition',22:'passive_error_flag',23:'error_delimiter',
          24:'CRC_delimiter',25:'ACK_slot',26:'end_of_frame',27:'ACK_delimiter',28:'overload_flag'}
TYPES=('bit','form','stuff','other')


def uint(value,maximum=9007199254740991):
    return type(value) is int and 0<=value<=maximum


def decode_last_status(status,*,expected_boot=None):
    """Interpret the last observer event without claiming an RX capture epoch."""
    result=dict(valid=False,scope='boot_history')
    if not isinstance(status,dict) or status.get('product')!='BafangReader' or type(status.get('protocol')) is not int or status['protocol']!=1:
        return {**result,'reason':'wrong_status'}
    boot=status.get('boot');uptime=status.get('uptime_us');event=status.get('last_bus_error')
    if not isinstance(boot,str) or not re.fullmatch('[A-F0-9]{8}',boot) or not uint(uptime):return {**result,'reason':'invalid_status_scope'}
    if expected_boot is not None and boot!=expected_boot:return {**result,'reason':'scope_mismatch'}
    if event is None:return {**result,'reason':'no_observed_error'}
    if (not isinstance(event,dict) or set(event)!={'source','scope','event','t_us','raw','type','direction','segment','saturated'}
            or event.get('source')!='single_HAL_ECC_read' or event.get('scope')!='boot_history'
            or not uint(event.get('event'),4294967295) or event['event']==0
            or not uint(event.get('t_us')) or event['t_us']>uptime
            or not uint(event.get('raw'),255) or not uint(event.get('type'),3)
            or not uint(event.get('direction'),1) or not uint(event.get('segment'),31)
            or type(event.get('saturated')) is not bool
            or event['raw']!=(event['type']<<6)|(event['direction']<<5)|event['segment']):
        return {**result,'reason':'invalid_observer_event'}
    return {**result,'valid':True,'boot':boot,'age_us':uptime-event['t_us'],'event':{
        **event,'error_type':TYPES[event['type']],'direction_name':'TX' if event['direction']==0 else 'RX',
        'segment_name':SEGMENTS.get(event['segment'],'unknown_segment')},
        'reference':'Pinned ESP-IDF5.5 ESP32-C3 hal/twai_ll.h; no additional ECC register read'}


def decode(message,*,expected_boot=None,expected_epoch=None):
    result=dict(valid=False,scope_checked=False,events=[],scope='CAN_transport_not_bicycle_fault_code')
    if not isinstance(message,dict) or message.get('type')!='battery_bus_error_detail':return {**result,'reason':'wrong_message_type'}
    boot=message.get('boot');epoch=message.get('epoch');capture=message.get('capture')
    if (not isinstance(boot,str) or not re.fullmatch('[A-F0-9]{8}',boot) or not uint(epoch)
            or not uint(message.get('frame_index'),1) or not isinstance(capture,dict)
            or set(capture)!={'source','after_event','total','incomplete','events'}
            or capture.get('source')!='single_HAL_ECC_read'
            or not uint(capture.get('after_event'),4294967295) or not uint(capture.get('total'),4294967295)
            or type(capture.get('incomplete')) is not bool or not isinstance(capture.get('events'),list) or len(capture['events'])>8):
        return {**result,'reason':'invalid_capture_shape'}
    if expected_boot is not None and boot!=expected_boot or expected_epoch is not None and epoch!=expected_epoch:return {**result,'reason':'scope_mismatch'}
    previous=capture['after_event'];previous_us=None;events=[]
    for event in capture['events']:
        if (not isinstance(event,dict) or set(event)!={'event','t_us','raw','type','direction','segment'}
                or not uint(event.get('event'),4294967295) or not previous<event['event']<=capture['total']
                or not uint(event.get('t_us')) or previous_us is not None and event['t_us']<previous_us
                or not uint(event.get('raw'),255) or not uint(event.get('type'),3)
                or not uint(event.get('direction'),1) or not uint(event.get('segment'),31)
                or event['raw']!=(event['type']<<6)|(event['direction']<<5)|event['segment']):
            return {**result,'reason':'invalid_capture_event'}
        previous=event['event'];previous_us=event['t_us']
        events.append({**event,'error_type':TYPES[event['type']],'direction_name':'TX' if event['direction']==0 else 'RX','segment_name':SEGMENTS.get(event['segment'],'unknown_segment')})
    if not capture['incomplete'] and capture['total']-capture['after_event']!=len(events):return {**result,'reason':'missing_events_in_complete_history'}
    return {**result,'valid':True,'scope_checked':expected_boot is not None and expected_epoch is not None,
            'boot':boot,'epoch':epoch,'frame_index':message['frame_index'],'incomplete':capture['incomplete'],
            'events':events,'reference':'Pinned ESP-IDF5.5 ESP32-C3 hal/twai_ll.h; single ECC read'}
