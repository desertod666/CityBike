"""Synthetic offline identity plans only; never opens a device or sends data."""
from functools import reduce
from operator import xor
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spard_identity_plan import plan_identity_change, compare_identity_readback


def reply(serial=b'ORIGINAL-TEST-SN', model=b'ORIGINAL-TEST-MODEL'):
    body=bytes((0x68,72,0xb7,0x30,0,0))+serial.ljust(32,b'\0')+model.ljust(32,b'\0')
    return body+bytes((reduce(xor,body,0),0x16))


class IdentityPlanTests(unittest.TestCase):
    def test_exact_host_frame_layout_and_restoration(self):
        baseline=reply();original=bytearray(baseline)
        plan=plan_identity_change(original,normal_service_context=True,serial_number='NEW-TEST-SN')
        out=bytes.fromhex(plan['request_hex']);restore=bytes.fromhex(plan['restoration_request_hex'])
        self.assertEqual(original,baseline)
        self.assertEqual(out[:6],bytes((0x68,72,0xb7,0x31,0,0)))
        self.assertEqual(out[6:38],b'NEW-TEST-SN'.ljust(32,b'\0'))
        self.assertEqual(out[38:70],baseline[38:70])
        self.assertEqual(restore[6:70],baseline[6:70])
        expected=bytearray(baseline);expected[3]=0x31;expected[70]^=1;self.assertEqual(restore,expected)
        for p in (out,restore):
            self.assertEqual(len(p),72);self.assertEqual(p[-1],0x16)
            checksum=0
            for b in p[:70]:checksum^=b
            self.assertEqual(p[70],checksum)
        self.assertEqual([x['field'] for x in plan['changes']],['serial_number'])
        self.assertEqual(plan['transport'],'none');self.assertIs(plan['live_write_verified'],False)
        self.assertIs(plan['restoration_verified'],False)

    def test_full_slots_and_preservation_of_unknown_original_bytes(self):
        raw_slot=bytes(range(128,160));baseline=reply(serial=raw_slot)
        plan=plan_identity_change(baseline,normal_service_context=True,model='M'*32)
        out=bytes.fromhex(plan['request_hex'])
        self.assertEqual(out[6:38],raw_slot);self.assertEqual(out[38:70],b'M'*32)
        both=plan_identity_change(baseline,normal_service_context=True,serial_number='S'*32,model='M'*32)
        self.assertEqual(bytes.fromhex(both['request_hex'])[6:70],b'S'*32+b'M'*32)
        self.assertEqual(len(both['changes']),2)

    def test_requires_known_context_baseline_and_actual_change(self):
        b=reply()
        for context in (False,None,1,'true'):
            with self.assertRaises(ValueError):plan_identity_change(b,normal_service_context=context,serial_number='NEW')
        for value in ('', ' ', 'S'*33, 'line\nbreak', 'null\0byte', 'Ж', '\x7f', b'bytes', 123):
            with self.assertRaises(ValueError):plan_identity_change(b,normal_service_context=True,serial_number=value)
        for changes in ({},{'serial_number':'ORIGINAL-TEST-SN'},{'model':'ORIGINAL-TEST-MODEL'}):
            with self.assertRaises(ValueError):plan_identity_change(b,normal_service_context=True,**changes)
        altered=bytearray(b);altered[4]=1;altered[-2]=reduce(xor,altered[:-2],0)
        with self.assertRaises(ValueError):plan_identity_change(altered,normal_service_context=True,model='NEW')

    def test_corruption_of_every_bit_and_wrong_opcode_rejected(self):
        b=reply()
        for index in range(len(b)):
            for bit in range(8):
                bad=bytearray(b);bad[index]^=1<<bit
                with self.assertRaises(ValueError):plan_identity_change(bad,normal_service_context=True,serial_number='NEW')
        for opcode in (0,6,0x31):
            bad=bytearray(b);bad[3]=opcode;bad[-2]=reduce(xor,bad[:-2],0)
            with self.assertRaises(ValueError):plan_identity_change(bad,normal_service_context=True,serial_number='NEW')
        for invalid in (None,'not bytes',b[:-1],b+b'\0'):
            with self.assertRaises(ValueError):plan_identity_change(invalid,normal_service_context=True,serial_number='NEW')


class IdentityReadbackTests(unittest.TestCase):
    def compare(self, actual, **changes):
        return compare_identity_readback(reply(), actual,
                                         normal_service_context=True, **changes)

    def test_exact_readback_covers_both_slots_without_claiming_persistence(self):
        actual = reply(serial=b'NEW', model=b'NEW-MODEL')
        report = self.compare(actual, serial_number='NEW', model='NEW-MODEL')
        self.assertEqual(report['state'], 'matches_expected')
        self.assertTrue(report['matches_expected'])
        self.assertFalse(report['matches_baseline'])
        self.assertTrue(all(f['matches_expected'] for f in report['fields'].values()))
        for flag in ('live_write_verified', 'persistence_verified', 'restoration_verified'):
            self.assertIs(report[flag], False)
        self.assertEqual(report['transport'], 'none')

    def test_unchanged_old_readback_is_not_success(self):
        report = self.compare(reply(), serial_number='NEW')
        self.assertEqual(report['state'], 'matches_baseline')
        self.assertFalse(report['matches_expected'])
        self.assertTrue(report['fields']['model']['matches_expected'])
        self.assertFalse(report['fields']['serial_number']['matches_expected'])

    def test_partial_change_and_unrequested_slot_corruption_are_reported(self):
        partial = self.compare(reply(serial=b'NEW'), serial_number='NEW', model='NEW-MODEL')
        self.assertEqual(partial['state'], 'different_identity')
        self.assertTrue(partial['fields']['serial_number']['matches_expected'])
        self.assertFalse(partial['fields']['model']['matches_expected'])
        unwanted = self.compare(reply(serial=b'NEW', model=b'OTHER'), serial_number='NEW')
        self.assertFalse(unwanted['matches_expected'])
        self.assertFalse(unwanted['fields']['model']['requested_change'])
        self.assertFalse(unwanted['fields']['model']['matches_expected'])

    def test_binary_untouched_slot_must_match_every_byte(self):
        before = reply(model=bytes(range(128, 160)))
        actual = reply(serial=b'NEW', model=bytes(range(128, 160)))
        report = compare_identity_readback(before, actual, normal_service_context=True,
                                           serial_number='NEW')
        self.assertTrue(report['matches_expected'])
        changed = bytearray(actual)
        changed[69] ^= 1
        changed[70] = reduce(xor, changed[:70], 0)
        report = compare_identity_readback(before, changed, normal_service_context=True,
                                           serial_number='NEW')
        self.assertFalse(report['matches_expected'])
        self.assertFalse(report['fields']['model']['matches_expected'])

    def test_write_echo_invalid_reply_and_missing_context_are_rejected(self):
        echo = bytes.fromhex(plan_identity_change(
            reply(), normal_service_context=True, serial_number='NEW')['request_hex'])
        invalid_reserved = bytearray(reply(serial=b'NEW'))
        invalid_reserved[4] = 1
        invalid_reserved[70] = reduce(xor, invalid_reserved[:70], 0)
        corrupt = bytearray(reply(serial=b'NEW'))
        corrupt[70] ^= 1
        for actual in (None, b'', echo, corrupt, invalid_reserved, reply()[:-1]):
            with self.assertRaises(ValueError):
                self.compare(actual, serial_number='NEW')
        for context in (False, None, 1, 'true'):
            with self.assertRaises(ValueError):
                compare_identity_readback(reply(), reply(serial=b'NEW'),
                                          normal_service_context=context, serial_number='NEW')


if __name__=='__main__':
    unittest.main()
