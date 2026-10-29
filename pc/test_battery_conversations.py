import unittest
from battery_conversations import correlate


def frame(seq, stamp, identifier, data='', **changes):
    return dict(type='frame',boot='1234ABCD',epoch=1,seq=seq,t_us=stamp,
                id=identifier,extended=True,rtr=False,dlc=len(data)//2,data=data,**changes)


class BatteryConversations(unittest.TestCase):
    def test_reverse_address_only_and_unrelated_traffic(self):
        rows=[frame(10,1000,'03216400'),frame(11,1100,'04F83401','0000000000'),
              frame(12,1200,'04226400','0A036C39'),frame(13,1300,'041A6400','0A036C39')]
        s=correlate(rows);self.assertEqual(len(s['transactions']),1)
        self.assertEqual(s['transactions'][0]['reply_delay_us'],300)
        self.assertEqual(len(s['orphan_replies']),1)

    def test_gaps_scopes_resets_expiry_and_bad_request(self):
        pairs=[(frame(3,1200,'041A6400','0A036C39'),'sequence'),
               ({**frame(2,1200,'041A6400','0A036C39'),'boot':'ABCD1234'},'scope'),
               ({**frame(2,1200,'041A6400','0A036C39'),'epoch':2},'epoch'),
               (frame(2,999,'041A6400','0A036C39'),'clock'),
               (frame(2,101001,'041A6400','0A036C39'),'expiry')]
        for reply,name in pairs:
            with self.subTest(name=name):self.assertFalse(correlate([frame(1,1000,'03216400'),reply])['transactions'])
        self.assertFalse(correlate([frame(1,1000,'03216400','01'),frame(2,1200,'041A6400','0A036C39')])['transactions'])
        self.assertFalse(correlate([frame(1,1000,'03216400'),{'type':'decode_error'},frame(2,1200,'041A6400','0A036C39')])['transactions'])

    def test_ambiguous_repeated_requests_and_malformed_frames(self):
        s=correlate([frame(1,1000,'03216400'),frame(2,1100,'03216400'),frame(3,1200,'041A6400','0A036C39')])
        self.assertFalse(s['transactions']);self.assertTrue(all('ambiguous' in r['unmatched_reason'] for r in s['requests']))
        for bad in [{'seq':True},{'data':'xx','dlc':1},{'id':'FFFFFFFF'},{'id':'+3216400'},{'boot':'+234ABCD'},{'dlc':9}]:
            s=correlate([frame(1,1000,'03216400'),{**frame(2,1100,'04F83401','0000000000'),**bad},frame(3,1200,'041A6400','0A036C39')])
            self.assertFalse(s['transactions'])

    def test_ten_cells_excludes_padding_and_never_combines_cohorts(self):
        rows=[]
        for obj,data in [('6400','0A036C39'),('6401','2E00A2000100'),('6402','DF0FDD0FDF0FDE0F'),('6403','DF0FDF0FDE0FDF0F'),('6404','DE0FDD0FFFFFFFFF')]:
            i=len(rows);rows.extend([frame(i+1,1000+i*1000,'0321'+obj),frame(i+2,1200+i*1000,'041A'+obj,data)])
        reads=correlate(rows)['coherent_cell_reads'];self.assertEqual(len(reads),1)
        self.assertEqual(reads[0]['sum_mv'],40623);self.assertEqual(reads[0]['delta_mv'],2)
        for mutate in [lambda r:r.pop(5),lambda r:r.__setitem__(7,{**r[7],'epoch':2}),lambda r:r.__setitem__(7,{**r[7],'id':'04226403'})]:
            changed=[dict(r) for r in rows];mutate(changed);self.assertFalse(correlate(changed)['coherent_cell_reads'])


    def test_cli_gzip_plain_equivalence_invalid_json_and_read_only(self):
        import gzip,hashlib,json,subprocess,sys,tempfile
        from pathlib import Path
        raw='\n'.join([json.dumps(frame(1,1000,'03216400')),json.dumps(frame(2,1200,'041A6400','0A036C39'))])+'\n'
        with tempfile.TemporaryDirectory() as tmp:
            plain=Path(tmp)/'capture.jsonl';compressed=Path(tmp)/'capture.bin'
            plain.write_text(raw);compressed.write_bytes(gzip.compress(raw.encode()))
            before=[p.read_bytes() for p in [plain,compressed]]
            command=[sys.executable,str(Path(__file__).with_name('battery_conversations.py'))]
            result=json.loads(subprocess.check_output(command+[str(plain),str(compressed)],text=True))
            self.assertEqual([p.read_bytes() for p in [plain,compressed]],before)
            self.assertEqual(result['captures'][0]['transactions'],result['captures'][1]['transactions'])
            self.assertEqual(len(result['captures'][0]['transactions']),1)
            self.assertEqual(result['captures'][0]['input_sha256'],hashlib.sha256(before[0]).hexdigest())
            plain.write_text(raw.splitlines()[0]+'\nmalformed\n'+raw.splitlines()[1]+'\n')
            result=json.loads(subprocess.check_output(command+[str(plain)],text=True))
            self.assertEqual(result['captures'][0]['parse_errors'],1)
            self.assertFalse(result['captures'][0]['transactions'])


if __name__=='__main__':unittest.main()
