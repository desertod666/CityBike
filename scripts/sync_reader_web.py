"""Sync the hosted portal into the canonical reader build, or verify parity."""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
LOCAL_ASSETS={'offline-index.html','offline.css','offline.js'}

def offline_i18n(reader):
    source=(ROOT/'web/i18n.js').read_text()
    start=source.index('String.raw`')+len('String.raw`');end=source.index('`.split',start)
    needed='\n'.join((reader/'web'/name).read_text() for name in sorted(LOCAL_ASSETS))
    needed+='\n'+'\n'.join((ROOT/'web'/name).read_text() for name in ('can-live.js','bafang-battery.js','decoder.js','preferences.js'))
    rows={}
    for line in source[start:end].splitlines():
        fields=re.split(r'\t|\\t',line)
        if len(fields)==3 and fields[0] and fields[0] in needed:rows[fields[0]]=line
    for line in (reader/'portal-translations.tsv').read_text().splitlines():
        fields=line.split('\t');assert len(fields)==3,line
        rows[fields[0]]=line
    assert len(rows)>50,'Missing local translations'
    return (source[:start]+'\n'.join(rows.values())+'\n'+source[end:]).encode()

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    reader=ROOT/'reader';assets=re.findall(r'^\s+web/([^\s]+)',(reader/'platformio.ini').read_text(),re.M)
    for name in assets:
        target=reader/'web'/name
        if name in LOCAL_ASSETS:
            assert target.is_file(),name
            continue
        expected=offline_i18n(reader) if name=='offline-i18n.js' else (ROOT/'web'/name).read_bytes()
        if args.check:
            if expected!=target.read_bytes():raise SystemExit('Portal differs: '+name+'; run python scripts/sync_reader_web.py')
        else:target.write_bytes(expected)
    if not args.check:
        path=reader/'SOURCE_MANIFEST.json';manifest=json.loads(path.read_text())
        manifest['version']=re.search(r'#define VERSION "([^"]+)"',(reader/'src/main.c').read_text())[1]
        manifest['web_build']=re.search(r"this.webBuild='([^']+)'",(ROOT/'web/browser.js').read_text())[1]
        for name in manifest['files']:
            data=(reader/name).read_bytes();manifest['files'][name]={'size':len(data),'sha256':hashlib.sha256(data).hexdigest()}
        path.write_text(json.dumps(manifest,indent=2)+'\n')
    print('PASS hosted/embedded portal parity:',len(assets),'assets')

if __name__=='__main__':main()
