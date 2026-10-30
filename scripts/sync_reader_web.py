"""Sync the hosted portal into the canonical reader build, or verify parity."""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    reader=ROOT/'reader';assets=re.findall(r'^\s+web/([^\s]+)',(reader/'platformio.ini').read_text(),re.M)
    for name in assets:
        source=ROOT/'web'/name;target=reader/'web'/name
        if args.check:
            if source.read_bytes()!=target.read_bytes():raise SystemExit('Portal differs: '+name+'; run python scripts/sync_reader_web.py')
        else:target.write_bytes(source.read_bytes())
    if not args.check:
        path=reader/'SOURCE_MANIFEST.json';manifest=json.loads(path.read_text())
        manifest['version']=re.search(r'#define VERSION "([^"]+)"',(reader/'src/main.c').read_text())[1]
        manifest['web_build']=re.search(r"this.webBuild='([^']+)'",(ROOT/'web/browser.js').read_text())[1]
        for name in manifest['files']:
            data=(reader/name).read_bytes();manifest['files'][name]={'size':len(data),'sha256':hashlib.sha256(data).hexdigest()}
        path.write_text(json.dumps(manifest,indent=2)+'\n')
    print('PASS hosted/embedded portal parity:',len(assets),'assets')

if __name__=='__main__':main()
