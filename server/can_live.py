"""Bounded latest-value ESP CAN snapshots. No decoding or device commands."""
import re
from controller_identity import validate_identity

MAX_FRAMES=64
MAX_AGE_MS=86400000
MAX_INT=9007199254740991


def integer(value,low=0,high=MAX_INT):
    return type(value) is int and low<=value<=high


def sanitize_live(value,device,connected=True):
    if (not isinstance(value,dict) or not isinstance(device,dict)
            or device.get('product')!='BafangReader'
            or not {'schema','boot','epoch','stream_active','frames','evicted_ids'}<=set(value)<= {'schema','boot','epoch','stream_active','frames','evicted_ids','controller_identity','warning_journal'}
            or type(value.get('schema')) is not int or value['schema']!=1
            or not isinstance(value.get('boot'),str) or not re.fullmatch('[A-F0-9]{8}',value['boot'])
            or value['boot']!=device.get('boot') or not integer(value.get('epoch'))
            or value['epoch']!=device.get('epoch') or type(value.get('stream_active')) is not bool
            or not integer(value.get('evicted_ids')) or not isinstance(value.get('frames'),list)
            or len(value['frames'])>MAX_FRAMES):
        return None
    frames=[];seen=set()
    for f in value['frames']:
        if (not isinstance(f,dict) or set(f)!={'id','extended','rtr','dlc','data','seq','t_us','age_ms'}
                or not isinstance(f.get('id'),str) or not re.fullmatch('[A-F0-9]{8}',f['id'])
                or type(f.get('extended')) is not bool or type(f.get('rtr')) is not bool
                or int(f['id'],16)>=(1<<29 if f['extended'] else 1<<11)
                or not integer(f.get('dlc'),0,8) or not isinstance(f.get('data'),str)
                or not re.fullmatch('(?:[A-F0-9]{2})*',f['data'])
                or len(f['data'])!=(0 if f['rtr'] else f['dlc']*2)
                or not integer(f.get('seq')) or not integer(f.get('t_us'))
                or not integer(f.get('age_ms'),0,MAX_AGE_MS)):
            return None
        key=(f['extended'],f['id'],f['rtr'])
        if key in seen:return None
        seen.add(key);frames.append(dict(f))
    extra={}
    if 'warning_journal' in value:
        journal=validate_warning_journal(value['warning_journal'])
        if journal is None:return None
        extra['warning_journal']=journal
    if 'controller_identity' in value:
        records=value['controller_identity']
        if not isinstance(records,list) or len(records)>4:return None
        normalized=[validate_identity(r) for r in records]
        if any(r is None or r['boot']!=device.get('boot') or r['epoch']!=device.get('epoch') for r in normalized) or len({r['object'] for r in normalized})!=len(normalized):return None
        extra['controller_identity']=normalized
    return dict(**extra,schema=1,boot=value['boot'],epoch=value['epoch'],
                stream_active=value['stream_active'] and connected and device.get('can')=='running',
                frames=frames,evicted_ids=value['evicted_ids'])

WARNING_LIMIT=8
WARNING_FRAME_KEYS={'id','extended','rtr','dlc','data','seq','t_us'}

def warning_frame(f):
    if (not isinstance(f,dict) or set(f)!=WARNING_FRAME_KEYS or f.get('extended') is not True
            or f.get('rtr') is not False or type(f.get('dlc')) is not int or f['dlc']!=1
            or not isinstance(f.get('id'),str) or not re.fullmatch('[A-F0-9]{8}',f['id'])
            or not isinstance(f.get('data'),str) or not re.fullmatch('[A-F0-9]{2}',f['data'])
            or not integer(f.get('seq')) or not integer(f.get('t_us'))):return False
    ident=int(f['id'],16);source=ident>>24
    return 1<=source<=15 and (ident>>19)&31==31 and (ident>>16)&7==7 and ident&65535==(0x10+source)*256

def validate_warning_journal(value):
    if (not isinstance(value,dict) or set(value)!={'schema','events','evicted'} or type(value.get('schema')) is not int
            or value['schema']!=1 or not integer(value.get('evicted')) or not isinstance(value.get('events'),list)
            or len(value['events'])>WARNING_LIMIT):return None
    events=[];prior=None
    for e in value['events']:
        if (not isinstance(e,dict) or set(e)!={'first','last','next','count','first_age_ms','last_age_ms','next_age_ms'}
                or not integer(e.get('count'),1) or not warning_frame(e.get('first')) or not warning_frame(e.get('last'))
                or e.get('next') is not None and not warning_frame(e['next'])):return None
        a,b,c=e['first'],e['last'],e['next']
        if (a['data']=='00' or a['id']!=b['id'] or a['data']!=b['data'] or b['seq']<a['seq'] or b['t_us']<a['t_us']
                or e['count']>b['seq']-a['seq']+1 or prior and a['seq']<=prior['first']['seq']):return None
        if c and (c['id']!=a['id'] or c['data']==a['data'] or c['seq']<=b['seq'] or c['t_us']<b['t_us']):return None
        if (not integer(e.get('first_age_ms'),0,MAX_AGE_MS) or not integer(e.get('last_age_ms'),0,e['first_age_ms'])
                or c and not integer(e.get('next_age_ms'),0,e['last_age_ms']) or not c and e['next_age_ms'] is not None):return None
        events.append(dict(first=dict(a),last=dict(b),next=dict(c) if c else None,count=e['count'],first_age_ms=e['first_age_ms'],last_age_ms=e['last_age_ms'],next_age_ms=e['next_age_ms']));prior=e
    return dict(schema=1,events=events,evicted=value['evicted'])

def warning_changes(current,previous,device):
    """Save new warning episodes/code changes, never the full CAN stream."""
    live=sanitize_live(current,device)
    if not live or 'warning_journal' not in live:return []
    old=sanitize_live(previous,device) if isinstance(previous,dict) else None
    def signature(e):return (e['first']['id'],e['first']['seq'],e['next']['seq'] if e['next'] else None)
    known={signature(e) for e in (old or {}).get('warning_journal',{}).get('events',[])}
    return [dict(boot=live['boot'],epoch=live['epoch'],**e) for e in live['warning_journal']['events'] if signature(e) not in known]
