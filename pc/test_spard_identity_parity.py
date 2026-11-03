"""Compare the actual embedded C encoder with Python; host-only, no devices."""
import ctypes
from functools import reduce
from operator import xor
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parent))
from spard_identity_plan import plan_identity_change

ROOT=Path(__file__).resolve().parents[1]


def reply(identity):
    body=bytes((0x68,72,0xb7,0x30,0,0))+identity
    return body+bytes((reduce(xor,body,0),0x16))


class IdentityParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cc=shutil.which('cc') or shutil.which('gcc') or shutil.which('clang')
        if not cc:raise unittest.SkipTest('A host C compiler is required')
        cls.temp=tempfile.TemporaryDirectory(prefix='spard-identity-parity-')
        cls.addClassCleanup(cls.temp.cleanup)
        source=Path(cls.temp.name)/'wrapper.c';lib=source.with_suffix('.so')
        source.write_text(f'#include "{ROOT / "reader/src/spard_identity_codec.h"}"\n'+'''
int encode(const uint8_t *raw,size_t n,int context,const uint8_t *sn,size_t sn_len,
           const uint8_t *model,size_t model_len,uint8_t out[146]) {
    spard_identity_plan_t p;
    memset(&p,0xa5,sizeof(p));
    int result=spard_identity_encode(&p,raw,n,context==1,sn,sn_len,model,model_len);
    memcpy(out,p.request,72);memcpy(out+72,p.restoration_request,72);
    out[144]=p.changed_slots;out[145]=p.valid;
    return result;
}
''')
        subprocess.run([cc,'-std=c11','-shared','-fPIC','-Wall','-Wextra','-Werror',str(source),'-o',str(lib)],check=True)
        cls.library=ctypes.CDLL(str(lib));cls.native=cls.library.encode
        cls.native.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_int,ctypes.c_void_p,ctypes.c_size_t,ctypes.c_void_p,ctypes.c_size_t,ctypes.c_void_p]
        cls.native.restype=ctypes.c_int

    def compare(self,raw,serial=None,model=None,context=True):
        sn=None if serial is None else serial.encode('utf8');mo=None if model is None else model.encode('utf8')
        rb=ctypes.create_string_buffer(raw);sb=None if sn is None else ctypes.create_string_buffer(sn);mb=None if mo is None else ctypes.create_string_buffer(mo)
        output=(ctypes.c_ubyte*146)()
        rc=self.native(rb,len(raw),int(context),sb,len(sn or b''),mb,len(mo or b''),output)
        try:
            py=plan_identity_change(raw,normal_service_context=context,serial_number=serial,model=model)
        except ValueError:
            self.assertNotEqual(rc,0);self.assertFalse(any(output));return False
        self.assertEqual(rc,0);self.assertEqual(bytes(output[:72]).hex().upper(),py['request_hex'])
        self.assertEqual(bytes(output[72:144]).hex().upper(),py['restoration_request_hex'])
        mask=sum(1 if c['field']=='serial_number' else 2 for c in py['changes'])
        self.assertEqual(output[144],mask);self.assertEqual(output[145],1);return True

    def test_random_binary_baselines_and_valid_replacements(self):
        rng=random.Random(0x31)
        for i in range(400):
            baseline=reply(bytes(rng.randrange(256) for _ in range(64)))
            sn=''.join(chr(rng.randrange(33,127)) for _ in range(rng.randrange(1,33))) if i%3!=0 else None
            model=''.join(chr(rng.randrange(33,127)) for _ in range(rng.randrange(1,33))) if i%3!=1 else None
            self.assertTrue(self.compare(baseline,sn,model))

    def test_slot_boundaries_and_context(self):
        baseline=reply(b'ORIGINAL'.ljust(32,b'\0')+b'MODEL'.ljust(32,b'\0'))
        for value in (None,'',' ','\0','\n','\x7f','Ж','ORIGINAL',*('A'*n for n in range(1,42))):
            self.compare(baseline,value)
            self.compare(baseline,None,value)
        self.compare(baseline,'NEW',context=False)
        self.compare(baseline,'NEW',model='\t')
        self.compare(baseline,'NEW',model='MODEL')

    def test_every_bit_corruption_and_lengths(self):
        baseline=reply(b'SYNTHETIC'.ljust(64,b'\0'))
        for i in range(72):
            for bit in range(8):
                bad=bytearray(baseline);bad[i]^=1<<bit;self.assertFalse(self.compare(bytes(bad),'NEW'))
        for n in range(72):self.assertFalse(self.compare(baseline[:n],'NEW'))
        self.assertFalse(self.compare(baseline+b'\0','NEW'))
        for field in (3,4,5):
            bad=bytearray(baseline);bad[field]^=1;bad[70]=reduce(xor,bad[:70],0)
            self.assertFalse(self.compare(bytes(bad),'NEW'))


if __name__=='__main__':
    unittest.main()
