"""Verify the current reader source, native ELF and all embedded portal assets.

Offline only: no USB, no CAN, no publishing, no production-server credentials.
"""
from pathlib import Path
import argparse,hashlib,json,os,re,shutil
ROOT=Path(__file__).resolve().parents[1]
def sha(data):return hashlib.sha256(data).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--source-only',action='store_true');args=p.parse_args()
 manifest=json.loads((ROOT/'SOURCE_MANIFEST.json').read_text())
 for name,meta in manifest['files'].items():
  path=ROOT/name;assert path.is_file() and sha(path.read_bytes())==meta['sha256'],name
 if args.source_only:print('PASS source manifest:',len(manifest['files']),'files');return
 from elftools.elf.elffile import ELFFile
 build=ROOT/'.pio/build/esp32c3';artifact=ROOT/'ci-artifacts';artifact.mkdir(exist_ok=True)
 version=re.search(r'#define VERSION "([^"]+)"',(ROOT/'src/main.c').read_text())[1]
 assert re.search(r'set\(PROJECT_VER "([^"]+)"\)',(ROOT/'CMakeLists.txt').read_text())[1]==version
 assets=re.findall(r'^\s+web/([^\s]+)',(ROOT/'platformio.ini').read_text(),re.M);embedded={}
 with (build/'firmware.elf').open('rb') as stream:
  elf=ELFFile(stream);symbols={s.name:s for s in elf.get_section_by_name('.symtab').iter_symbols()}
  assert {'__wrap_twai_hal_get_events','reader_observed_hal_get_events','reader_ecc_record'}<=symbols.keys()
  assert 'twai_hal_get_events' not in symbols
  for name in assets:
   stem=re.sub('[^a-zA-Z0-9]','_',name);a=symbols['_binary_'+stem+'_start'];z=symbols['_binary_'+stem+'_end'];section=elf.get_section(a['st_shndx']);offset=a['st_value']-section['sh_addr'];data=section.data()[offset:offset+z['st_value']-a['st_value']]
   assert data==(ROOT/'web'/name).read_bytes(),name;embedded[name]=sha(data)
 app=(build/'firmware.bin').read_bytes();assert app[48:80].split(b'\0')[0].decode()==version
 assert len(app)<0x200000,'App must fit the verified 2 MiB factory partition'
 files={}
 for name in ['firmware.bin','bootloader.bin','partitions.bin']:
  shutil.copy2(build/name,artifact/name);data=(artifact/name).read_bytes();files[name]={'size':len(data),'sha256':sha(data)}
 proof={'version':version,'commit':os.environ.get('GITHUB_SHA'),'runner_environment':os.environ.get('RUNNER_ENVIRONMENT'),'source_manifest_sha256':sha((ROOT/'SOURCE_MANIFEST.json').read_bytes()),'files':files,'embedded_assets':embedded,'observed_HAL_only':True,'device_access':False,'server_deployment':False}
 (artifact/'build-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
 print('PASS firmware',version,len(app),'bytes;',len(embedded),'actual ELF portal assets match')
if __name__=='__main__':main()
