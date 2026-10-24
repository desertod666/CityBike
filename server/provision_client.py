"""Issue an upload-only PC credential. Pipe stdout directly into secure storage.

Do not run this with stdout going to an agent transcript or terminal logger.
Secret values live in Bitwarden; receiver config stores only token hashes.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import uuid

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--bws',required=True)
parser.add_argument('--token-file',required=True)
parser.add_argument('--project',required=True)
parser.add_argument('--server',default='https://vault.bitwarden.eu')
parser.add_argument('--clients',default='/opt/citybike/config/clients.json')
parser.add_argument('--key',default='CITYBIKE_WINDOWS_UPLOAD_TOKEN')
args=parser.parse_args()
if not args.key.startswith('CITYBIKE_'):
    raise SystemExit('Use a CityBike-specific key')
environment={**os.environ,'BWS_ACCESS_TOKEN':Path(args.token_file).read_text().strip()}
base=[args.bws,'--server-url',args.server]
result=subprocess.run(base+['secret','list',args.project,'-o','json'],env=environment,capture_output=True,text=True,check=True)
found=[item for item in json.loads(result.stdout) if item['key']==args.key]
if len(found)>1:raise SystemExit('Ambiguous CityBike credential')
if found:token=found[0]['value']
else:
    token=secrets.token_urlsafe(48)
    result=subprocess.run(base+['secret','create',args.key,token,args.project,'--note','CityBike upload-only credential; no remote read/admin permissions','-o','none'],env=environment,capture_output=True,text=True)
    if result.returncode:raise SystemExit('Bitwarden rejected CityBike credential creation; no client provisioned')
path=Path(args.clients)
config=json.loads(path.read_text())
digest=hashlib.sha256(token.encode()).hexdigest()
matches=[c for c in config['clients'] if c['token_sha256']==digest]
if not matches:
    config['clients'].append(dict(id=uuid.uuid4().hex,token_sha256=digest))
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(config,indent=2))
    temporary.chmod(0o640)
    temporary.replace(path)
    import grp
    os.chown(path,0,grp.getgrnam('citybike').gr_gid)
print(json.dumps(dict(token=token)))
