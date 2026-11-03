"""Service framing is not direction proof; update data must remain raw by default."""
import struct
import sys
import unittest
from functools import reduce
from operator import xor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spard_service import decode, decode_identity, decode_parameters


def packet(command, payload):
    size = len(payload) + 6
    raw = bytes((0x68, size, size ^ 255, command)) + payload
    return raw + bytes((reduce(xor, raw, 0), 0x16))


class ServiceReadTests(unittest.TestCase):
    def setUp(self):
        # Deliberately synthetic layout fixtures, not battery readings.
        words = [0] * 60
        words[1], words[16], words[24] = 14700, 13024, 10
        words[23] = struct.unpack('<I', struct.pack('<f', 1.0))[0]
        words[25], words[28], words[43] = 845, 135, 0xffffffd3
        self.parameters = packet(6, struct.pack('<60I', *words))
        self.identity = packet(0x30, b'\0\0' + b'SYNTHETIC-ONLY'.ljust(32, b'\0') + b'TEST-MODEL'.ljust(32, b'\0'))

    def test_shared_envelope_requires_explicit_service_context(self):
        for raw in (self.parameters, self.identity):
            for flags in ({}, {'normal_service_context': True}, {'normal_service_context': 1, 'expected_command': raw[3]}):
                result = decode(raw, **flags)
                self.assertEqual(result['status'], 'context_required')
                self.assertTrue(result['validated_packet'])
                self.assertEqual(result['fields'], {})

    def test_parameters_capacity_not_mixed_with_information(self):
        result = decode_parameters(self.parameters)
        self.assertEqual(result['status'], 'decoded')
        self.assertEqual(len(result['words_raw']), 60)
        self.assertFalse(result['live_reply_validation'])
        self.assertEqual(result['fields']['FCC_Parameter']['value'], 13024)
        self.assertEqual(result['fields']['DC_Parameter']['value'], 14700)
        self.assertEqual(result['fields']['OV']['value'], 4225)
        self.assertEqual(result['fields']['UV']['value'], 2700)
        self.assertEqual(result['fields']['EOTC']['value'], -45)

    def test_identity_preserves_full_raw_slots(self):
        result = decode_identity(self.identity)
        self.assertEqual(result['fields']['serial_number']['text'], 'SYNTHETIC-ONLY')
        self.assertEqual(result['fields']['model']['text'], 'TEST-MODEL')
        self.assertEqual(len(result['fields']['model']['raw_hex']), 64)
        raw = packet(0x30, b'\0\0' + b'A\0hidden'.ljust(32, b'\0') + bytes([255]) * 32)
        result = decode_identity(raw)
        self.assertIsNone(result['fields']['serial_number']['text'])
        self.assertIsNone(result['fields']['model']['text'])
        self.assertEqual(result['fields']['model']['raw_hex'], 'FF' * 32)

    def test_cross_command_and_corrupt_or_short_replies_refused(self):
        self.assertEqual(decode_identity(self.parameters)['reason'], 'unexpected_service_reply')
        self.assertEqual(decode_parameters(self.identity)['reason'], 'unexpected_service_reply')
        for raw, decoder in ((self.parameters, decode_parameters), (self.identity, decode_identity)):
            for end in range(len(raw)):
                self.assertNotEqual(decoder(raw[:end])['status'], 'decoded')
            broken = bytearray(raw)
            broken[10] ^= 1
            self.assertEqual(decoder(broken)['reason'], 'invalid_xor_checksum')

    def test_bad_lookup_float_and_masked_payload_are_honest(self):
        words = [0] * 60
        words[23], words[27], words[35] = 0x7fc00000, 16, 1
        result = decode_parameters(packet(6, struct.pack('<60I', *words)))
        self.assertIsNone(result['fields']['OVT']['value'])
        self.assertIsNone(result['fields']['OCD1V']['value'])
        self.assertIsNone(result['fields']['SampleRV']['value'])
        result = decode_parameters(packet(6, bytes(240)))
        self.assertIn('parameter_payload_all_zero', result['warnings'])


if __name__ == '__main__':
    unittest.main()
