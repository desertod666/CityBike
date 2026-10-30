"""Private owner console for one authenticated USB bridge. No serial access."""
from reader_version import version_at_least
import copy
import hashlib
import hmac
import json
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from can_live import sanitize_live
from battery_information import sanitize_battery
from reader_selftest import sanitize_selftest
from handset import Handset,HandsetError

ID=re.compile(r'[a-f0-9]{32}');HEX=re.compile(r'[a-f0-9]{64}');BOOT=re.compile(r'[0-9A-F]{8}')
MAC_ADDRESS=re.compile(r'(?:[a-f0-9]{2}:){5}[a-f0-9]{2}');FRESH=15

def esp_identity(device):
    return (isinstance(device,dict) and device.get('product')=='BafangReader' and type(device.get('protocol')) is int and device['protocol']==1 and isinstance(device.get('ap_mac'),str) and MAC_ADDRESS.fullmatch(device['ap_mac'].lower()) is not None and device['ap_mac'].lower()!='00:00:00:00:00:00')
AUTH_LIMIT=5;AUTH_WINDOW=60;AUTH_COOLDOWN=60;AUTH_IP_CAP=1024
ACTIVE={'queued','accepted','started'}
LISTEN_BUILDS={'20261030-voltmeter1','20261030-gpioprobe1','20261030-auditfix1','20261029-battery1','20261029-clean2','20261029-clean1','20261029-remote6','20261029-remote5','20261029-remote4','20261029-remote3','20261029-remote2','20261029-remote1','20261029-ble3','20261029-ble2','20261029-layout1','20261029-ble1','20261029-recording1','20261028-simple1','20261028-faults1','20261028-identity2','20261028-identity1','20261028-protocol1','20261028-errors1','20261028-rmt3','20261028-rmt2','20261028-rmt1','20261028-quiet1','20261028-selftest2','20261028-selftest1','20261028-cells1','20261028-view1','20261028-bms-txtrace1','20261028-spard-access1','20261028-bms-quality1','20261028-esp-battery1','20261028-open-readers1','20261028-reader2','20261028-manual-flash1','20261027-bus-listen1','20261027-auto-update1','20261027-single-device1','20261027-single-device2','20261027-paired-probe1','20261027-stock-bridge1','20261027-live-can1','20261027-live-can2'}
ACTIONS={'reader_voltmeter':('reader_selftest',10),'battery_information_quiet':('battery_information',12),'reader_selftest':('reader_selftest',2),'battery_information':('battery_information',45),'live_start':('live_view',0),'live_stop':('live_view',0),'capture30':('capture',30),'capture60':('capture',60),'rx_check':('rx_check',10),'spard_information':('spard_probe',30),'spard_listen':('spard_probe',30),'stop':('stop',0)}
DEVICE_FIELDS=('type','product','protocol','version','boot','can','received','bus_errors','bus_error_types','last_bus_error','rx_missed','rx_overrun','frame_queue_drops','usb_frame_drops','uptime_us','ap_mac','tx_gpio','rx_gpio','twai_tx_gpio','ctx_guard','rx_sampling_250k','sampling_profiles','timing','rx_check','bitrate','epoch','heap_free','hardware_readback','can_stack_free','usb_stack_free','capabilities','mode','ble_remote')
STOCK_DEVICE_FIELDS=('product','protocol','usb_vid','usb_pid')
STOCK_CAPABILITIES={'spard_probe','stop'}
CONTROL_FIELDS=('version','web_build','recorder_version','ready','updating','capabilities','last','stock_adapter','local_permission','lease_expires_at','countdown','busy','recording','site_update','can_live','live_view','battery_information','reader_selftest','ble_remote','handset_log')
SECRET=re.compile(r'(^key$)|token|key_sha256|raw_key|credential|authorization|password|secret',re.I)

class OperatorError(Exception):
    def __init__(self,code,message,status=409,retry_after_s=None):
        super().__init__(message);self.code=code;self.message=message;self.status=status;self.retry_after_s=retry_after_s

def utc(value=None):return datetime.fromtimestamp(time.time() if value is None else value,timezone.utc).isoformat().replace('+00:00','Z')
def safe(value):
    if isinstance(value,dict):return {str(k):safe(v) for k,v in value.items() if not SECRET.search(str(k))}
    if isinstance(value,list):return [safe(v) for v in value[:100]]
    if isinstance(value,str):return value[:4096]
    return value if value is None or type(value) in (bool,int,float) else None

def atomic(path,value):
    path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(value),encoding='utf-8');tmp.replace(path)

def stock_identity(report):
    """A browser epoch identifies the relay, never pretends to be an ESP boot."""
    d,b,c=report.get('device'),report.get('bridge'),report.get('control')
    return (report.get('source')=='browser-stock' and isinstance(d,dict)
            and set(d)==set(STOCK_DEVICE_FIELDS) and d.get('product')=='StockCANAdapter'
            and type(d.get('protocol')) is int and d['protocol']==1
            and d.get('usb_vid')=='1A86' and d.get('usb_pid')=='7523'
            and isinstance(b,dict) and set(b)=={'kind','boot','uptime_us','port_count'}
            and b.get('kind')=='stock' and isinstance(b.get('boot'),str) and BOOT.fullmatch(b['boot']) is not None
            and type(b.get('uptime_us')) is int and 0<=b['uptime_us']<=9007199254740991
            and type(report.get('connected')) is bool
            and type(b.get('port_count')) is int and 0<=b['port_count']<=128
            and (report['connected'] is False or b['port_count']==1)
            and isinstance(c,dict) and type(c.get('version')) is int and c['version']==2 and isinstance(c.get('capabilities'),list)
            and len(c['capabilities'])<=2 and all(isinstance(x,str) and x in STOCK_CAPABILITIES for x in c['capabilities'])
            and len(set(c['capabilities']))==len(c['capabilities']))

def identity_boot(item):
    return item.get('bridge',{}).get('boot') if item.get('bridge',{}).get('kind')=='stock' else item.get('device',{}).get('boot')

def identity_uptime(item):
    return item.get('bridge',{}).get('uptime_us',-1) if item.get('bridge',{}).get('kind')=='stock' else item.get('device',{}).get('uptime_us',-1)

def expected_boot(job):
    return job.get('expected_bridge_boot') if job.get('bridge_kind')=='stock' or 'expected_bridge_boot' in job else job.get('expected_boot')

BLE_PHASES={'idle','selecting','selected','connecting','listening','stopping','disconnected'}
BLE_STAGES={'idle','picker','selected','gatt_connect','service_discovery','characteristic_discovery','subscribe','listening'}
def sanitize_ble(value):
    if not isinstance(value,dict) or type(value.get('schema')) is not int or value['schema']!=1 or not isinstance(value.get('phase'),str) or value['phase'] not in BLE_PHASES or not isinstance(value.get('stage'),str) or value['stage'] not in BLE_STAGES:return None
    for k in ('bluetooth_api','gatt_connected'):
        if type(value.get(k)) is not bool:return None
    if value.get('adapter_available') is not None and type(value.get('adapter_available')) is not bool:return None
    for k in ('notification_count','advertisement_count'):
        if type(value.get(k)) is not int or not 0<=value[k]<=9007199254740991:return None
    result={k:value[k] for k in ('schema','phase','stage','bluetooth_api','gatt_connected','notification_count','advertisement_count')}
    result['adapter_available']=value.get('adapter_available')
    if 'service_uuid' in value:
        service=value.get('service_uuid')
        result['service_uuid']=service if isinstance(service,str) and service in ('70079900-30e2-492d-b593-a5e53006fc60','60fc0630-e5a5-93b5-2d49-e23000990770') else None
    result['device_name']=value['device_name'][:248] if isinstance(value.get('device_name'),str) else None
    result['updated_utc']=value['updated_utc'][:32] if isinstance(value.get('updated_utc'),str) else None
    e=value.get('last_error');result['last_error']=None
    if isinstance(e,dict) and isinstance(e.get('stage'),str) and e['stage'] in BLE_STAGES:
        result['last_error']={k:e[k][:limit] for k,limit in [('name',80),('message',240),('host_utc',32)] if isinstance(e.get(k),str)}
        result['last_error']['stage']=e['stage']
    return result

def control_snapshot(control,device=None,connected=True):
    result={k:copy.deepcopy(control[k]) for k in CONTROL_FIELDS if k in control}
    if 'ble_remote' in result:result['ble_remote']=sanitize_ble(control.get('ble_remote'))
    if 'handset_log' in result:
        v=control.get('handset_log');result['handset_log']=None
        if isinstance(v,dict):
            log=v.get('log',{});last=log.get('last') if isinstance(log,dict) else None
            result['handset_log']={'enabled':v.get('enabled') is True,'local_control':v.get('local_control') is True,'error':v['error'][:160] if isinstance(v.get('error'),str) else None,'log':{'recording':isinstance(log,dict) and log.get('recording') is True,'error':log['error'][:160] if isinstance(log,dict) and isinstance(log.get('error'),str) else None,'last':{k:last[k] for k in ('id','frames','receipt') if k in last and (type(last[k]) is int or isinstance(last[k],str) and len(last[k])<=64 or last[k] is None)} if isinstance(last,dict) else None}}
    if 'can_live' in result:result['can_live']=sanitize_live(control.get('can_live'),device,connected)
    if 'battery_information' in result:result['battery_information']=sanitize_battery(control.get('battery_information'),device)
    if 'reader_selftest' in result:result['reader_selftest']=sanitize_selftest(control.get('reader_selftest'),device)
    if 'live_view' in result:
        v=control.get('live_view');result['live_view']={'active':bool(isinstance(v,dict) and v.get('active') is True and device and device.get('can')=='running' and connected),'remote':bool(isinstance(v,dict) and v.get('remote') is True)}
    update=control.get('site_update')
    if 'site_update' in result:
        if not isinstance(update,dict):result['site_update']=None
        else:
            bounded={k:update[k] for k in ('controlled','waiting') if type(update.get(k)) is bool}
            if update.get('state') in ('starting','current','error','waiting','checking','holding','reloading'):bounded['state']=update['state']
            bounded['last_error']=update['last_error'][:160] if isinstance(update.get('last_error'),str) else None
            bounded['busy_reasons']=[v[:64] for v in update.get('busy_reasons',[])[:20] if isinstance(v,str)] if isinstance(update.get('busy_reasons'),list) else []
            if isinstance(update.get('last_check_utc'),str):bounded['last_check_utc']=update['last_check_utc'][:32]
            result['site_update']=bounded
    return result

class RemoteOperator:
    def __init__(self,storage,policy):
        self.store=storage;self.policy=Path(policy) if policy else None;self.root=storage.root/'operator'
        self.index=self.root/'bridges.json'
        self.failed_ips={}
        self.handset=Handset(wall_clock=lambda:time.time())
        try:self.bridges=json.loads(self.index.read_text())
        except (OSError,ValueError):self.bridges={'selected':None,'items':{}}
    def config(self):
        try:
            p=json.loads(self.policy.read_text()) if self.policy else {}
            if (not isinstance(p,dict) or type(p.get('schema')) is not int or p.get('schema')!=1 or p.get('enabled') is not True or not isinstance(p.get('token_sha256'),str) or not HEX.fullmatch(p['token_sha256'])):return None
            return p
        except (OSError,ValueError):return None
    def authorized(self,authorization):
        p=self.config()
        return bool(p and isinstance(authorization,str) and authorization.startswith('Bearer ') and len(authorization)<=256 and hmac.compare_digest(hashlib.sha256(authorization[7:].encode()).hexdigest(),p['token_sha256']))
    def authorize(self,authorization):
        if not self.authorized(authorization):raise OperatorError('unauthorized','Нужен ключ владельца',401)
    def handset_bridge(self,allow_busy=False):
        uid,conflict=self.select();bridge=self.bridges['items'].get(uid)
        if conflict or not self.online(bridge) or bridge.get('bridge',{}).get('kind')=='stock':raise OperatorError('reader_offline','USB ESP is unavailable',409)
        d=bridge['device'];c=bridge['control'];p=c.get('local_permission',{})
        lease=c.get('lease_expires_at')
        if not self.config() or not self.store.support_allowed() or c.get('ready') is not True or p.get('remote_support_enabled') is not True or p.get('manual_mode') is not False or type(lease) not in (int,float) or not time.time()<lease<=time.time()+35 or 'ble_remote_v1' not in d.get('capabilities',[]):raise OperatorError('remote_unavailable','Enable remote access and install BLE firmware',409)
        if c.get('updating') or not allow_busy and (c.get('recording') or c.get('busy')):raise OperatorError('reader_busy','Reader is busy',409)
        return uid,bridge
    def handset_request(self,authorization,body):
        self.authorize(authorization);uid,b=self.handset_bridge(allow_busy=isinstance(body,dict) and body.get('action') not in ('on','down'))
        self.handset_local_hold_guard(uid,b,body)
        try:return dict(ok=True,handset=self.handset.request(body,uid,b['device']['boot'],b['device']['ap_mac']))
        except HandsetError as e:raise OperatorError('invalid_remote_input',str(e),409)
    def handset_poll(self,uid,key,body=None):
        selected,b=self.handset_bridge(allow_busy=body is None or isinstance(body,dict) and body.get('action') not in ('on','down'))
        if uid!=selected or not isinstance(key,str) or not HEX.fullmatch(key) or not hmac.compare_digest(hashlib.sha256(key.encode()).hexdigest(),b['key_sha256']):raise OperatorError('bridge_key_required','USB bridge is not authenticated',403)
        self.handset_local_hold_guard(uid,b,body)
        try:desired=self.handset.snapshot(uid,b['device']['boot']) if body is None else self.handset.request(body,uid,b['device']['boot'],b['device']['ap_mac'])
        except HandsetError as e:raise OperatorError('invalid_remote_input',str(e),409)
        return dict(ok=True,handset=desired)
    def handset_local_hold_guard(self,uid,b,body):
        if not isinstance(body,dict) or body.get('action')!='on':return
        if (b['control'].get('handset_log') or {}).get('local_control') and (b['device'].get('ble_remote') or {}).get('button'):
            owner=self.handset.snapshot(uid,b['device']['boot']).get('actor')
            if body.get('actor')!=owner:raise OperatorError('reader_busy','A button is held on the USB computer',409)
    def spard_access(self, authorization):
        self.authorize(authorization)
        try:
            data=json.loads((self.policy.parent/'spard-access.json').read_text())
            if (not isinstance(data,dict) or data.get('schema')!=1
                    or set(data.get('credentials',{}))!={'Engineer','Developer'}
                    or any(not isinstance(v,str) or not 1<=len(v)<=128 for v in data['credentials'].values())):
                raise ValueError('invalid private reference')
        except (OSError,ValueError,TypeError,AttributeError):
            raise OperatorError('reference_unavailable','Справка Spard пока недоступна',503)
        return dict(ok=True,software='Spard SBS Plus V1.3',credentials=[
            dict(role=role,password=data['credentials'][role]) for role in ('Engineer','Developer')])
    def authorize_http(self, authorization, peer_ip):
        """Bound failed HTTP guesses to the actual TCP peer, across all owner routes.

        Pinned monitor requests without Authorization never call this method.
        Direct storage/API helpers keep their original authorization contract.
        """
        with self.store.lock:
            now=time.monotonic();entry=self.failed_ips.get(peer_ip)
            if entry and entry['locked_until']>now:
                raise OperatorError('rate_limited','Слишком много неверных попыток. Повторите позже.',429,max(1,math.ceil(entry['locked_until']-now)))
            if entry:
                entry['attempts']=[at for at in entry['attempts'] if now-at<AUTH_WINDOW]
                entry['failed']=len(entry['attempts'])
                if not entry['attempts']:
                    del self.failed_ips[peer_ip];entry=None
            # A locked peer is rejected above, before any credential comparison.
            if self.authorized(authorization):
                return True
            if entry is None:
                for ip,old in list(self.failed_ips.items()):
                    if old['locked_until']<=now and now-old['touched']>=AUTH_WINDOW:
                        del self.failed_ips[ip]
                if len(self.failed_ips)>=AUTH_IP_CAP:
                    victim=min(self.failed_ips,key=lambda ip:self.failed_ips[ip]['touched'])
                    del self.failed_ips[victim]
                entry=dict(attempts=[],failed=0,locked_until=0,touched=now)
                self.failed_ips[peer_ip]=entry
            entry['attempts'].append(now);entry['failed']=len(entry['attempts']);entry['touched']=now
            if entry['failed']>=AUTH_LIMIT:
                entry['locked_until']=now+AUTH_COOLDOWN
                raise OperatorError('rate_limited','Слишком много неверных попыток. Повторите позже.',429,AUTH_COOLDOWN)
            raise OperatorError('unauthorized','Нужен ключ владельца',401)

    def guard_monitor(self,uid,report,key,authorization):
        """Protect known control sessions before the public sequence store changes."""
        target=self.store.root/'control'/uid/'session.json';expected=None
        if target.exists():
            try:expected=json.loads(target.read_text()).get('key_sha256')
            except (OSError,ValueError):raise OperatorError('bridge_key_required','Не подтверждён ключ USB-моста',403)
        if expected is None:expected=self.bridges['items'].get(uid,{}).get('key_sha256')
        if expected:
            digest=hashlib.sha256(key.encode()).hexdigest() if isinstance(key,str) and HEX.fullmatch(key) else ''
            if not hmac.compare_digest(expected,digest):
                raise OperatorError('bridge_key_required','Не подтверждён ключ USB-моста',403)
        old=self.bridges['items'].get(uid)
        if old and old.get('bridge',{}).get('kind')=='stock' and report.get('source')!='browser-stock':
            d=report.get('device',{})
            if not self.authorized(authorization) or report.get('source')!='browser-usb' or not esp_identity(d):
                raise OperatorError('bridge_identity_changed','Смена ридера требует ключ владельца',403)
        if report.get('source')=='browser-stock':
            if not self.config() or not stock_identity(report) or not isinstance(key,str) or not HEX.fullmatch(key):
                raise OperatorError('invalid_stock_bridge','Не подтверждён штатный USB-адаптер',403)
            if old and old.get('bridge',{}).get('kind')!='stock':
                if not self.authorized(authorization):raise OperatorError('bridge_identity_changed','Смена ридера требует ключ владельца',403)
            if not old and not self.authorized(authorization):
                raise OperatorError('unauthorized','Первое подключение адаптера требует ключ владельца',401)
            if old and old.get('bridge',{}).get('boot')==report['bridge']['boot'] and report['bridge']['uptime_us']<identity_uptime(old):
                raise OperatorError('bridge_clock_reversed','Время USB-моста сброшено; нужна новая эпоха',409)
    def observe(self,uid,report,key,authorization):
        p=self.config();d=report.get('device',{});c=report.get('control',{})
        stock=stock_identity(report)
        if (not p or not isinstance(key,str) or not HEX.fullmatch(key) or (not stock and (report.get('source')!='browser-usb' or not esp_identity(d) or not isinstance(c,dict) or not BOOT.fullmatch(str(d.get('boot',''))) or type(d.get('uptime_us')) is not int or d['uptime_us']<0))):return
        digest=hashlib.sha256(key.encode()).hexdigest();bearer=self.authorized(authorization)
        old=self.bridges['items'].get(uid)
        registered_stock=stock and old and old.get('bridge',{}).get('kind')=='stock' and hmac.compare_digest(old['key_sha256'],digest)
        pinned=False
        pin=p.get('initial_bridge_key_sha256')
        if not stock and isinstance(pin,str) and HEX.fullmatch(pin) and hmac.compare_digest(pin,digest):
            existing=self.store.root/'control'/uid/'session.json'
            try:pinned=hmac.compare_digest(json.loads(existing.read_text()).get('key_sha256',''),digest)
            except (OSError,ValueError):pass
        if not (bearer or pinned or registered_stock):return
        if old and (old['key_sha256']!=digest or report['sequence']<=old['sequence']):return
        identity={'device':d,'bridge':report.get('bridge',{}) if stock else {}}
        now=time.time();measured=0.
        # Older bridges carry a 30-second permission lease. It also bounds
        # their original sample time when they retry an old envelope.
        lease=c.get('lease_expires_at')
        if type(lease) in (int,float) and math.isfinite(lease) and lease<=now+35:measured=min(now,lease-30)
        if 'host_utc' in report:
            try:
                stamp=datetime.fromisoformat(report['host_utc'].replace('Z','+00:00'))
                age=report.get('device_age_ms',0)
                if stamp.tzinfo is None or type(age) not in (int,float) or not math.isfinite(age) or age<0:raise ValueError('Invalid telemetry age')
                observed=stamp.timestamp()-age/1000
                measured=min(now,observed) if observed<=now+5 else 0.
            except (ValueError,TypeError,AttributeError,OverflowError):measured=0.
        progress=measured if not old or identity_boot(old)!=identity_boot(identity) or identity_uptime(identity)>identity_uptime(old) else old['progress_at']
        item=dict(sequence=report['sequence'],received_at=now,progress_at=progress,key_sha256=digest,connected=report.get('connected') is True,device={k:copy.deepcopy(d[k]) for k in (STOCK_DEVICE_FIELDS if stock else DEVICE_FIELDS) if k in d},control=control_snapshot(c,None if stock else d,report.get('connected') is True),events=copy.deepcopy(report.get('events',[])[:100]),authenticated=True)
        if stock:item['bridge']=copy.deepcopy(report['bridge'])
        self.bridges['items'][uid]=item
        if not self.bridges.get('selected'):self.bridges['selected']=uid
        self.select();atomic(self.index,self.bridges);self.sync_jobs()
    def online(self,item,now=None):
        now=time.time() if now is None else now
        return bool(item and item.get('connected') is True and 0<=now-item['received_at']<=FRESH and 0<=now-item['progress_at']<=FRESH)
    def select(self):
        items=self.bridges['items'];fresh=[uid for uid,item in items.items() if self.online(item)];selected=self.bridges.get('selected')
        if len(fresh)==1 and (selected is None or selected not in items or time.time()-items[selected]['progress_at']>FRESH):
            if selected!=fresh[0]:self.bridges['selected']=fresh[0];atomic(self.index,self.bridges)
        return self.bridges.get('selected'),len(fresh)>1
    def records(self):
        result=[]
        for p in (self.root/'jobs').glob('*.json'):
            try:result.append(json.loads(p.read_text()))
            except (OSError,ValueError):continue
        return result
    def load_job(self,ident):
        if not isinstance(ident,str) or not ID.fullmatch(ident):return None
        try:return json.loads((self.root/'jobs'/(ident+'.json')).read_text())
        except (OSError,ValueError):return None
    def save_job(self,record):atomic(self.root/'jobs'/(record['id']+'.json'),record)
    def sync_jobs(self):
        now=time.time()
        for r in self.records():
            if r['state'] not in ACTIVE:continue
            old=copy.deepcopy(r);b=self.bridges['items'].get(r['session']);last=(b or {}).get('control',{}).get('last') or {}
            selected=self.bridges.get('selected')
            if selected and selected!=r['session']:
                r.update(state='interrupted',reason='bridge_replaced',ended_at=now)
            elif r['state']=='started' and now>r.get('started_at',r['created_at'])+r['duration_s']+30:
                r.update(state='interrupted',reason='execution_timeout',ended_at=now)
            elif b and ((b.get('bridge',{}).get('kind')=='stock')!=(r.get('bridge_kind')=='stock') or identity_boot(b)!=expected_boot(r) or b.get('connected') is False):r.update(state='interrupted',reason='bridge_reset_or_disconnected',ended_at=now)
            elif last.get('id')==r['id'] and last.get('state') in ('accepted','started','complete','failed','cancelled'):
                state=last['state']
                if state=='complete' and not self.online(b):state='interrupted'
                r['state']=state
                if state=='started' and not r.get('started_at'):
                    r['started_at']=now;r['estimated_deadline_utc']=utc(now+r['duration_s'])
                if state not in ACTIVE:r['ended_at']=now
            elif r['state']!='started' and now>r['expires_at']:
                r.update(state='interrupted' if r.get('dispatched_at') else 'expired',ended_at=now,reason='dispatch_expired')
            if r!=old:self.save_job(r)
            if r['kind']=='stop' and r['state']=='complete':
                target=self.load_job(r.get('target_job_id',''))
                if target and target['state'] in ACTIVE:target.update(state='cancelled',ended_at=now,reason='owner_stop');self.save_job(target)
    def safe_job(self,r):
        if not r:return None
        return {k:r[k] for k in ('id','action','kind','state','duration_s','created_at','expires_at','started_at','ended_at','estimated_deadline_utc','reason','target_job_id','bridge_kind') if k in r}
    def state(self,authorization):
        self.authorize(authorization)
        with self.store.lock:
            self.sync_jobs();uid,conflict=self.select();b=self.bridges['items'].get(uid)
            age=max(time.time()-b['received_at'],time.time()-b['progress_at']) if b else None
            control=safe(copy.deepcopy(b['control'])) if b else {};elapsed=max(0,time.time()-b['received_at'])*1000 if b else 0
            stock=control.get('stock_adapter')
            if isinstance(stock,dict) and type(stock.get('remaining_ms')) in (int,float):stock['remaining_ms']=max(0,stock['remaining_ms']-elapsed)
            countdown=control.get('countdown')
            if isinstance(countdown,dict) and type(countdown.get('remaining_ms')) in (int,float):countdown['remaining_ms']=max(0,countdown['remaining_ms']-elapsed)
            all_records=sorted(self.records(),key=lambda r:r['created_at'],reverse=True)
            active=[r for r in all_records if r['state'] in ACTIVE]
            latest=active[0] if active else all_records[0] if all_records else None
            return dict(ok=True,online=self.online(b) and not conflict,age_seconds=round(age,3) if age is not None else None,session=uid,device=safe(b['device']) if b else {},bridge=safe(b.get('bridge',{})) if b else {},control=control,events=safe(b['events']) if b else [],pending=self.safe_job(latest),bridge_authenticated=bool(b),conflict=conflict,server_utc=utc(),handset=self.handset.snapshot(uid,b['device'].get('boot')) if b else None)
    def guard(self,b,conflict):
        if not self.config():raise OperatorError('permission_denied','Серверная панель владельца выключена')
        if conflict:raise OperatorError('bridge_conflict','Одновременно подключены два USB-моста')
        if not self.online(b):raise OperatorError('offline','Нет свежего состояния USB-ридера')
        if b.get('bridge',{}).get('kind')=='stock' and b['bridge'].get('port_count')!=1:raise OperatorError('offline','Не выбран единственный штатный адаптер')
        c=b['control'];p=c.get('local_permission',{});lease=c.get('lease_expires_at')
        if (not self.store.support_allowed() or c.get('ready') is not True or not isinstance(p,dict) or p.get('remote_support_enabled') is not True or p.get('manual_mode') is not False or type(lease) not in (int,float) or not time.time()<lease<=time.time()+35):raise OperatorError('permission_denied','Удалённые тесты не разрешены на USB-мосте')
    @staticmethod
    def ctx(d):
        g=d.get('ctx_guard',{})
        return d.get('tx_gpio')==4 and d.get('rx_gpio')==5 and d.get('twai_tx_gpio')==10 and isinstance(g,dict) and g.get('policy')=='fixed_recessive' and g.get('valid') is True and g.get('level')==1 and g.get('out_sel')==128 and g.get('mux')==1 and g.get('enabled') is True and g.get('input_enabled') is True and g.get('latch_high') is True and g.get('inverted') is False
    def enqueue(self,authorization,body):
        self.authorize(authorization)
        isolated=isinstance(body,dict) and body.get('action') in ('reader_selftest','reader_voltmeter')
        quiet=isinstance(body,dict) and body.get('action')=='battery_information_quiet'
        fields={'id','action','isolation_asserted','expected_mac','expected_boot'} if isolated else {'id','action','session_ended','expected_mac','expected_boot'} if quiet else {'id','action'}
        if not isinstance(body,dict) or set(body)!=fields or not isinstance(body.get('id'),str) or not ID.fullmatch(body['id']):raise OperatorError('invalid_request','Нужны точные поля задания',400)
        if isolated and (body.get('isolation_asserted') is not True or not isinstance(body.get('expected_mac'),str) or not MAC_ADDRESS.fullmatch(body['expected_mac']) or not isinstance(body.get('expected_boot'),str) or not BOOT.fullmatch(body['expected_boot'])):raise OperatorError('invalid_request','Подтвердите физическое отсоединение CAN для выбранного ридера',400)
        if quiet and (body.get('session_ended') is not True or not isinstance(body.get('expected_mac'),str) or not MAC_ADDRESS.fullmatch(body['expected_mac']) or not isinstance(body.get('expected_boot'),str) or not BOOT.fullmatch(body['expected_boot'])):raise OperatorError('invalid_request','Подтвердите завершение сессии для выбранного ридера',400)
        action=body['action']
        if not isinstance(action,str) or action not in ACTIONS:raise OperatorError('invalid_action','Неизвестное действие',400)
        with self.store.lock:
            prior=self.load_job(body['id'])
            if prior:
                if prior['action']!=action or (isolated or quiet) and (prior.get('expected_boot')!=body['expected_boot'] or prior.get('expected_mac')!=body['expected_mac']):raise OperatorError('id_conflict','Этот id уже относится к другому действию')
                return dict(ok=True,job=self.safe_job(prior))
            self.sync_jobs();uid,conflict=self.select();b=self.bridges['items'].get(uid);self.guard(b,conflict)
            d,c=b['device'],b['control'];kind,duration=ACTIONS[action];caps=c.get('capabilities',[]);last=c.get('last') or {};pending_file=self.store.root/'control'/uid/'pending.json'
            if kind not in caps:raise OperatorError('unsupported_client','Вкладка USB-моста не поддерживает действие')
            is_stock=b.get('bridge',{}).get('kind')=='stock'
            if is_stock and action not in ('spard_information','spard_listen','stop'):raise OperatorError('unsupported_client','Штатный адаптер поддерживает только чтение Spard')
            job=dict(id=body['id'],kind=kind,key_sha256=b['key_sha256'],expires_at=time.time()+60)
            if is_stock:job.update(expected_bridge_boot=identity_boot(b),adapter_vid='1A86',adapter_pid='7523')
            else:job.update(expected_mac=d['ap_mac'],expected_boot=d['boot'])
            if action=='stop':
                target=self.load_job(last.get('id','')) if is_stock else None
                if last.get('state')!='started' or last.get('kind') not in (('spard_probe',) if is_stock else ('capture','rx_check','sampling_sweep','spard_probe','paired_probe','battery_information')) or (is_stock and (not target or target.get('session')!=uid or target.get('kind')!='spard_probe' or target.get('key_sha256')!=b['key_sha256'] or target.get('bridge_kind')!='stock' or expected_boot(target)!=identity_boot(b) or target.get('state')!='started')):raise OperatorError('not_started','Тест ещё не подтвердил запуск; дождитесь состояния started')
                job['target_job_id']=last['id']
            elif kind=='reader_selftest':
                if body['expected_mac']!=d.get('ap_mac') or body['expected_boot']!=d.get('boot'):raise OperatorError('permission_denied','Выбранный ридер изменился; подтвердите его подключение заново')
                if any(r['state'] in ACTIVE for r in self.records()):raise OperatorError('job_pending','Предыдущее задание ещё не завершено')
                if c.get('busy') is True or c.get('recording') is True or c.get('updating') is True or (c.get('stock_adapter') or {}).get('active') is True or d.get('rx_check',{}).get('state')=='running' or last.get('state') in ('accepted','started'):raise OperatorError('reader_busy','Ридер занят')
                if not version_at_least(d.get('version'),'0.5.5') or d.get('rx_sampling_250k')!='TRIPLE' or not self.ctx(d) or not all(x in d.get('capabilities',[]) for x in ('command_ids','isolated_twai_selftest_v1')):raise OperatorError('unsupported_client','Нужна прошивка ESP 0.5.5 с самотестом')
                if d.get('can')!='stopped' and not (d.get('can')=='running' and (c.get('live_view') or {}).get('active') is True):raise OperatorError('reader_busy','Приём занят другой операцией')
                if action=='reader_voltmeter':
                    if not version_at_least(d.get('version'),'0.6.8') or 'isolated_gpio_voltmeter_v1' not in d.get('capabilities',[]):raise OperatorError('unsupported_client','Voltmeter test requires reader 0.6.8')
                    job['voltmeter']=True
                job['isolation_asserted']=True
            elif kind=='battery_information':
                if quiet:
                    if body['expected_mac']!=d.get('ap_mac') or body['expected_boot']!=d.get('boot'):raise OperatorError('permission_denied','Выбранный ридер изменился; подтвердите его состояние заново')
                    if not version_at_least(d.get('version'),'0.5.7') or 'spard_quiet_query_v1' not in d.get('capabilities',[]):raise OperatorError('unsupported_client','Для опроса тихой линии нужна прошивка ESP 0.5.7')
                    job.update(read_mode='quiet',session_ended=True)
                if any(r['state'] in ACTIVE for r in self.records()):raise OperatorError('job_pending','Предыдущее задание ещё не завершено')
                stock=c.get('stock_adapter') or {}
                if c.get('busy') is True or c.get('recording') is True or c.get('updating') is True or stock.get('active') is True or d.get('rx_check',{}).get('state')=='running' or last.get('state') in ('accepted','started'):raise OperatorError('reader_busy','Ридер занят')
                if (not version_at_least(d.get('version'),'0.5.2') or d.get('rx_sampling_250k')!='TRIPLE' or not self.ctx(d) or not isinstance(d.get('capabilities'),list) or not all(x in d['capabilities'] for x in ('command_ids','spard_information_query'))):raise OperatorError('unsupported_client','Нужна прошивка ESP 0.5.2+ с опросом батареи')
                if d.get('can')!='stopped' and not (d.get('can')=='running' and (c.get('live_view') or {}).get('active') is True):raise OperatorError('reader_busy','Приём занят другой операцией')
            elif kind=='live_view':
                if any(r['state'] in ACTIVE for r in self.records()):raise OperatorError('job_pending','Предыдущее задание ещё не завершено')
                stock=c.get('stock_adapter') or {}
                if c.get('busy') is True or c.get('recording') is True or c.get('updating') is True or stock.get('active') is True or d.get('rx_check',{}).get('state')=='running' or last.get('state') in ('accepted','started'):raise OperatorError('reader_busy','Ридер занят отдельным тестом')
                if action=='live_start':
                    if d.get('can')!='stopped' or not self.ctx(d):raise OperatorError('permission_denied','Пассивный приём не подтверждён или уже запущен')
                elif d.get('can')!='running' or (c.get('live_view') or {}).get('active') is not True:raise OperatorError('not_started','Живой просмотр не запущен')
                job.update(mode='start' if action=='live_start' else 'stop',bitrate=250000)
            else:
                if any(r['state'] in ACTIVE for r in self.records()):raise OperatorError('job_pending','Предыдущее задание ещё не завершено')
                stock=c.get('stock_adapter') or {}
                if (not b.get('bridge') and (d.get('can')!='stopped' or d.get('rx_check',{}).get('state')=='running')) or stock.get('active') is True or last.get('state') in ('accepted','started') or c.get('updating') is True or c.get('busy') is True or c.get('recording') is True:raise OperatorError('reader_busy','USB-ридер занят')
                if b.get('bridge',{}).get('kind')!='stock' and not self.ctx(d):raise OperatorError('permission_denied','Не подтверждена защита CTX')
                if kind=='capture':
                    if c.get('recorder_version')!=2:raise OperatorError('unsupported_client','Обновите вкладку записи')
                    job.update(duration=duration,bitrate=250000,sampling='TRIPLE')
                elif kind=='sampling_sweep':
                    required={'TRIPLE','SP625','SP625_TRIPLE','SP6875','SP6875_TRIPLE','DEFAULT','MID','MID_TRIPLE'}
                    if not required.issubset(set(d.get('sampling_profiles',[]))):raise OperatorError('unsupported_client','Нет профилей автоподбора')
                    job.update(duration=30,bitrate=250000);duration=270
                elif kind=='spard_probe':
                    if action=='spard_listen' and b.get('bridge',{}).get('kind')!='stock' and c.get('web_build') not in LISTEN_BUILDS:raise OperatorError('unsupported_client','Обновите вкладку для режима наблюдения')
                    job.update(duration=30,mode='listen' if action=='spard_listen' else 'information',adapter_vid='1A86',adapter_pid='7523')
            if pending_file.exists():
                pending=json.loads(pending_file.read_text());ack=last.get('id')==pending.get('id')
                if pending.get('expires_at',0)>time.time() and not ack:raise OperatorError('job_pending','Есть неподтверждённое задание')
            record=dict(id=body['id'],action=action,kind=kind,state='queued',session=uid,key_sha256=b['key_sha256'],duration_s=duration,created_at=time.time(),expires_at=job['expires_at'])
            if b.get('bridge',{}).get('kind')=='stock':record.update(bridge_kind='stock',expected_bridge_boot=identity_boot(b))
            else:record['expected_boot']=d['boot']
            if isolated or quiet:record['expected_mac']=body['expected_mac']
            if action=='stop':record['target_job_id']=job['target_job_id']
            self.save_job(record);atomic(pending_file,job)
            return dict(ok=True,job=self.safe_job(record))
    def trusted_latest(self,uid):
        b=self.bridges['items'].get(uid)
        return dict(received_utc=utc(b['received_at']),report={'sequence':b['sequence']}) if b else None
    def delivery_allowed(self,uid,report,digest,job):
        r=self.load_job(job['id'])
        if not r:return True
        selected,conflict=self.select();b=self.bridges['items'].get(uid)
        if r['state'] not in ('queued','accepted') or selected!=uid or r['session']!=uid or expected_boot(r)!=expected_boot(job) or not b or b['key_sha256']!=digest or (b.get('bridge',{}).get('kind')=='stock')!=(r.get('bridge_kind')=='stock'):return False
        try:self.guard(b,conflict)
        except OperatorError:return False
        return report.get('sequence')==b['sequence'] and identity_boot(b)==expected_boot(r)
    def delivered(self,job):
        r=self.load_job(job['id'])
        if r and not r.get('dispatched_at'):r['dispatched_at']=time.time();self.save_job(r)
