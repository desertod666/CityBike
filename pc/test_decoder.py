"""All vectors here are synthetic, never observations from a bicycle."""
import unittest
from sym_decoder import Decoder, verify_tables, ROOT


def frame(ident, data, **kw):
    f = dict(id=ident, data=data, extended=True, rtr=False, dlc=len(bytes.fromhex(data)))
    return dict(f, **kw)


class DecoderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = Decoder()

    def values(self, ident, data):
        d = self.d.decode(frame(ident, data))
        self.assertEqual(d['status'], 'decoded_unconfirmed')
        return {k: v['value'] for k, v in d['fields'].items()}

    def test_full_tables(self):
        if not (ROOT / 'SYSTEM TESTING_BAFANG SYSTEM_V1.sym').exists():
            self.skipTest('Original private SYM is not distributed; bundled five-ID reference tested below')
        self.assertEqual(len(verify_tables()['messages']), 59)

    def test_controller_order_unsigned(self):
        v = self.values('02F83201', 'C409E80380144146')
        for key, value in dict(Speed=25, Current=10, CR_Voltage=52.48,
                               Controller_Temperature=25, Motor_Temperature=30).items():
            self.assertAlmostEqual(v[key], value)
        self.assertAlmostEqual(self.values('02F83201', '0000FFFF00000000')['Current'], 655.35)

    def test_battery_signed(self):
        v = self.values('04F83401', '9CFF100E28')
        self.assertEqual(v, dict(Battery_Current_A=-1, Battery_Voltage_V=36, Temperature=0))

    def test_torque(self):
        self.assertEqual(self.values('01F83100', 'E8035AFF'),
                         dict(Torque_Sensor_Voltage=1000, Cadence=90, Frame_Counts=255))

    def test_capacity(self):
        self.assertEqual(self.values('04F83400', '1027881364325A'),
                         {'Total_Capacity_mAh': 10000, 'Residual_Capacity_mAh': 5000,
                          'Relative_Capacity %': 100, 'Absolut_Capacity %': 50, 'SOH': 90})

    def test_nibbles(self):
        self.assertEqual(self.values('03106300', 'A503FF80'),
                         dict(No_of_total_Modes=5, Mode=10, Gears=3, Light_Status=255, Trip_Reset=128))

    def test_flags_length_unknown_rtr(self):
        for f in [frame('02F83201', '00'), frame('02F83201', '00'*8, extended=False),
                  frame('123', '00', dlc=9), frame('123', '00', rtr=True)]:
            self.assertEqual(self.d.decode(f)['status'], 'invalid')
        self.assertEqual(self.d.decode(frame('02F83201', '', rtr=True, dlc=8))['status'], 'rtr')
        self.assertEqual(self.d.decode(frame('123', '42', extended=False))['status'], 'unknown')


if __name__ == '__main__':
    unittest.main()
