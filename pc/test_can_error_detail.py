import copy
import unittest
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from can_error_detail import decode,decode_last_status


def fixture(raw=3):
    return dict(type='battery_bus_error_detail',boot='ABCDEF12',epoch=1,frame_index=0,
                capture=dict(source='single_HAL_ECC_read',after_event=10,total=11,incomplete=False,
                             events=[dict(event=11,t_us=123456,raw=raw,type=raw>>6,direction=(raw>>5)&1,segment=raw&31)]))


class CanErrorDetailTests(unittest.TestCase):
    def test_status_last_event_retains_boot_scope_and_age(self):
        for raw in range(256):
            event=dict(source='single_HAL_ECC_read',scope='boot_history',event=1,t_us=100,raw=raw,type=raw>>6,direction=(raw>>5)&1,segment=raw&31,saturated=False)
            status=dict(product='BafangReader',protocol=1,boot='1234ABCD',uptime_us=150,last_bus_error=event)
            before=copy.deepcopy(status);result=decode_last_status(status,expected_boot='1234ABCD')
            self.assertTrue(result['valid']);self.assertEqual(result['scope'],'boot_history');self.assertEqual(result['age_us'],50)
            self.assertEqual(result['event']['raw'],raw);self.assertEqual(status,before)
            self.assertFalse(decode_last_status(status,expected_boot='FFFFFFFF')['valid'])
        for changes in [dict(t_us=151),dict(raw=True),dict(direction=2),dict(segment=32),dict(event=0),dict(saturated=1),dict(scope='capture_epoch')]:
            bad=copy.deepcopy(status);bad['last_bus_error'].update(changes);self.assertFalse(decode_last_status(bad)['valid'])
        status['last_bus_error']=None;self.assertEqual(decode_last_status(status)['reason'],'no_observed_error')

    def test_distinguishes_transport_error_direction_and_segment(self):
        for raw,direction,kind,segment in [(3,'TX','bit','start_of_frame'),(0xD9,'TX','other','ACK_slot'),(0xAA,'RX','stuff','data'),(0,'TX','bit','unknown_segment')]:
            decoded=decode(fixture(raw),expected_boot='ABCDEF12',expected_epoch=1)
            self.assertTrue(decoded['valid']);self.assertTrue(decoded['scope_checked'])
            event=decoded['events'][0]
            self.assertEqual((event['direction_name'],event['error_type'],event['segment_name']),(direction,kind,segment))
        self.assertFalse(decode(fixture())['scope_checked'])

    def test_rejects_mixed_scope_inconsistent_bits_and_missing_history(self):
        self.assertFalse(decode(fixture(),expected_boot='11223344')['valid'])
        self.assertFalse(decode(fixture(),expected_epoch=2)['valid'])
        for changes in [dict(type=1),dict(direction=1),dict(segment=4),dict(raw=True),dict(event=10),dict(t_us=-1)]:
            message=fixture();message['capture']['events'][0].update(changes);self.assertFalse(decode(message)['valid'])
        message=fixture();message['capture']['events']=[];self.assertFalse(decode(message)['valid'])
        message['capture']['incomplete']=True;decoded=decode(message);self.assertTrue(decoded['valid']);self.assertTrue(decoded['incomplete'])
        message=fixture();message['capture']['events']*=9;self.assertFalse(decode(message)['valid'])

    def test_preserves_input_and_empty_complete_window(self):
        original=fixture();before=copy.deepcopy(original);decode(original);self.assertEqual(original,before)
        original['capture'].update(total=10,events=[]);self.assertTrue(decode(original)['valid'])


if __name__=='__main__':unittest.main()
