"""Synthetic stream tests, including fragments, unknown IDs and reset boundaries."""
import csv
import json
from pathlib import Path
import tempfile
import unittest
import io
from collector import Capture


class StreamTests(unittest.TestCase):
    def test_old_sdk_prefix_recovers_status_and_preserves_wire(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)/'capture'
            c=Capture(folder)
            wire=b'W synthetic truncated SDK log{"type":"status","product":"BafangReader","protocol":1,"boot":"synthetic","can":"stopped"}\n'
            messages=c.feed(wire)
            self.assertEqual(messages[0]['product'],'BafangReader')
            self.assertEqual(c.resyncs,1)
            c.close()
            self.assertEqual((folder/'wire.bin').read_bytes(),wire)
            events=[json.loads(x) for x in (folder/'capture.jsonl').read_text(encoding='utf-8').splitlines()]
            self.assertTrue(any(x['type']=='transport_resync' for x in events))
    def test_disk_full_still_closes_all_capture_files(self):
        class FullDisk(io.StringIO):
            def write(self, value):
                raise OSError('synthetic disk full')
        c = Capture.__new__(Capture)
        c.wire = io.BytesIO()
        c.events = FullDisk()
        c.csv_file = io.StringIO()
        c.buf, c.session = bytearray(), 'synthetic'
        c.frames = c.invalid = c.gaps = c.resets = 0
        with self.assertRaises(OSError):
            c.close()
        self.assertTrue(c.wire.closed)
        self.assertTrue(c.events.closed)
        self.assertTrue(c.csv_file.closed)
    def test_raw_fragments_gaps_unknown_and_reset(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / 'capture'
            c = Capture(folder)
            c.new_session(reason='synthetic_test')
            a = dict(type='frame', boot='A', epoch=1, t_us=100, seq=1,
                     id='00000123', extended=False, rtr=False, dlc=1, data='FF')
            b = dict(a, seq=4, t_us=200, id='02F83201', extended=True, rtr=True, dlc=8, data='')
            d = dict(a, seq=1, boot='B', t_us=5)
            wire = b'ROM boot\r\n' + b''.join(json.dumps(x).encode() + b'\n' for x in (a, b, d)) + b'{partial'
            for i in range(0, len(wire), 7):
                c.feed(wire[i:i+7])
            c.event('mark', action='synthetic wheel turn')
            self.assertEqual((c.frames, c.gaps, c.resets), (3, 2, 1))
            c.close()
            self.assertEqual((folder / 'wire.bin').read_bytes(), wire)
            events = [json.loads(x) for x in (folder / 'capture.jsonl').read_text(encoding='utf-8').splitlines()]
            self.assertTrue(any(x['type'] == 'partial_line' for x in events))
            self.assertTrue(any(x['type'] == 'mark' for x in events))
            with (folder / 'frames.csv').open(encoding='utf-8-sig', newline='') as f:
                rows = list(csv.DictReader(f))
            self.assertEqual([r['decode_status'] for r in rows], ['unknown', 'rtr', 'unknown'])
            self.assertEqual(rows[0]['session'], rows[1]['session'])
            self.assertNotEqual(rows[1]['session'], rows[2]['session'])

    def test_malformed_frame_still_saved(self):
        with tempfile.TemporaryDirectory() as tmp:
            c = Capture(Path(tmp) / 'capture')
            c.new_session(reason='synthetic_test')
            c.feed(b'{"type":"frame","id":"02F83201","data":"XX","extended":true,"rtr":false,"dlc":8}\n')
            self.assertEqual((c.frames, c.invalid), (1, 1))
            c.close()
