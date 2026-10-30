"""Open, idempotent CityBike capture uploads; no public read/list endpoint.

Legacy upload credentials retain their existing namespace. New installations
can upload without pairing. Archives are never extracted by this service.
"""
from reader_version import version_at_least
from can_live import warning_changes
import argparse
from datetime import datetime, timezone
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
import ssl
import threading
import time
from remote_operator import RemoteOperator, OperatorError, stock_identity, identity_boot, expected_boot

PART_SIZE = 2 * 1024 * 1024
MAX_ARCHIVE = 512 * 1024 * 1024
MAX_ATTACHMENT = 128 * 1024 * 1024
HEX = re.compile(r'[a-f0-9]{64}')
ID = re.compile(r'[a-f0-9]{32}')
PUBLIC_CLIENT = hashlib.sha256(b'CityBike public uploads v1').hexdigest()[:32]
UPLOAD_TTL = 24 * 60 * 60
MONITOR_TTL = 24 * 60 * 60
CONTROL_TTL = 60 * 60

def version_tuple(value):
    return tuple(map(int,value.split('.'))) if isinstance(value,str) and re.fullmatch(r'\d{1,3}\.\d{1,3}\.\d{1,3}',value) else None


class Storage:
    def __init__(self, root, clients, quota=2 * 1024**3, reserve=4 * 1024**3, control_policy=None, operator_policy=None):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.clients = Path(clients)
        self.quota, self.reserve = quota, reserve
        self.lock = threading.RLock()
        self.control_policy = Path(control_policy) if control_policy else None
        self.last_cleanup = 0
        self.operator = RemoteOperator(self, operator_policy or (self.control_policy.parent/'operator-policy.json' if self.control_policy else None))

    def support_allowed(self):
        # A missing/invalid policy denies every remote action, including STOP.
        try:
            policy = json.loads(self.control_policy.read_text()) if self.control_policy else {}
            return (isinstance(policy, dict) and type(policy.get('schema')) is int and policy.get('schema') == 1 and policy.get('enabled') is True
                    and policy.get('manual_lock') is False)
        except (OSError, ValueError, TypeError):
            return False

    def legacy_flash_grant(self, uid, report, digest, job, latest):
        """An explicit owner grant for one old 0.4.5 tab, never general support.

        New clients carry local permission/lease fields and cannot enter this
        migration path, even when those fields explicitly deny support.
        """
        control, device = report.get('control', {}), report.get('device', {})
        if (control.get('version') != 2 or control.get('ready') is not True
                or 'local_permission' in control or 'lease_expires_at' in control
                or not isinstance(control.get('capabilities'), list) or 'flash' not in control['capabilities']
                or job.get('kind') != 'flash'):
            return None
        try:
            policy = json.loads(self.control_policy.read_text()) if self.control_policy else {}
            grant = policy.get('one_shot_flash') if isinstance(policy, dict) else None
            if (type(policy.get('schema')) is not int or policy.get('schema') != 1 or policy.get('enabled') is not False
                    or policy.get('manual_lock') is not True or not isinstance(grant, dict)
                    or grant.get('owner_confirmed_can_detached') is not True
                    or grant.get('session') != uid or grant.get('expected_mac') != device.get('ap_mac')
                    or grant.get('expected_version') != '0.4.5' or grant.get('firmware_version') != '0.4.7'
                    or not isinstance(grant.get('id'), str) or not ID.fullmatch(grant['id'])
                    or not isinstance(grant.get('key_sha256'), str) or not HEX.fullmatch(grant['key_sha256'])
                    or not hmac.compare_digest(grant['key_sha256'], digest)
                    or not isinstance(grant.get('manifest_sha256'), str) or not HEX.fullmatch(grant['manifest_sha256'])
                    or not isinstance(grant.get('expected_boot'), str) or not re.fullmatch(r'[0-9A-F]{8}', grant['expected_boot'])
                    or type(grant.get('expires_at')) not in (int, float)
                    or not time.time() < job['expires_at'] <= grant['expires_at'] <= time.time()+120):
                return None
            for field in ('id','expected_mac','expected_boot','expected_version','firmware_version','manifest_sha256','key_sha256'):
                if job.get(field) != grant.get(field):
                    return None
            if (device.get('boot') != grant['expected_boot'] or device.get('version') != '0.4.5'
                    or device.get('can') != 'stopped' or device.get('rx_check', {}).get('state') == 'running'
                    or device.get('tx_gpio') != 4 or device.get('rx_gpio') != 5 or device.get('twai_tx_gpio') != 10):
                return None
            guard = device.get('ctx_guard', {})
            if (guard.get('policy') != 'fixed_recessive' or guard.get('valid') is not True
                    or guard.get('level') != 1 or guard.get('out_sel') != 128 or guard.get('mux') != 1
                    or guard.get('enabled') is not True or guard.get('input_enabled') is not True
                    or guard.get('latch_high') is not True or guard.get('inverted') is not False):
                return None
            received = datetime.strptime(latest['received_utc'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp()
            if latest.get('report') != report or not 0 <= time.time()-received <= 10:
                return None
            return grant
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            return None

    def consume_flash_grant(self, grant):
        # O_EXCL is atomic across requests and restarts. Lost HTTP responses do
        # not authorize a retry: a new explicit grant ID is required afterward.
        folder = self.root/'flash-permits'
        folder.mkdir(exist_ok=True)
        target = folder/(grant['id']+'.json')
        audit = {key:grant[key] for key in ('id','session','expected_mac','expected_boot','expected_version','firmware_version','manifest_sha256')}
        audit.update(consumed=True, consumed_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
        try:
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            return False
        with os.fdopen(fd, 'w', encoding='utf-8') as output:
            json.dump(audit, output)
            output.flush()
            os.fsync(output.fileno())
        return True

    @staticmethod
    def remove_temporary(folder, allowed):
        # Only known temporary layouts; never recurse through arbitrary content.
        files = list(folder.iterdir())
        if any(item.is_symlink() or not item.is_file() or not allowed(item.name) for item in files):
            return False
        for item in files:
            item.unlink(missing_ok=True)
        folder.rmdir()
        return True

    def cleanup(self, force=False):
        now = time.time()
        with self.lock:
            if not force and now - self.last_cleanup < 60:
                return
            self.last_cleanup = now
            for category, ttl, names in (
                    ('monitor', MONITOR_TTL, {'latest.json','latest.tmp','history.jsonl','history.previous.jsonl'}),
                    ('control', CONTROL_TTL, {'session.json','session.tmp','pending.json','pending.tmp'})):
                root = self.root / category
                if not root.exists() or root.is_symlink():
                    continue
                for folder in root.iterdir():
                    if folder.is_symlink() or not folder.is_dir() or not ID.fullmatch(folder.name):
                        continue
                    files = list(folder.iterdir())
                    newest = max((f.stat().st_mtime for f in files), default=folder.stat().st_mtime)
                    if newest < now - ttl:
                        self.remove_temporary(folder, lambda name: name in names)
            for client in self.root.iterdir():
                if client.is_symlink() or not client.is_dir() or not ID.fullmatch(client.name):
                    continue
                for folder in client.iterdir():
                    if folder.is_symlink() or not folder.is_dir() or not ID.fullmatch(folder.name):
                        continue
                    # A receipt or an original archive is permanent evidence.
                    if ((folder/'receipt.json').exists()
                            or any(f.name.startswith('capture.') and f.name != 'capture.tmp' for f in folder.iterdir())):
                        continue
                    state = folder/'upload-state.json'
                    files = list(folder.iterdir())
                    newest = max((f.stat().st_mtime for f in files), default=folder.stat().st_mtime)
                    try:
                        activity = json.loads(state.read_text()).get('last_activity', newest) if state.exists() else newest
                        activity = max(float(activity), newest)
                    except (ValueError, TypeError, OSError):
                        activity = newest
                    if activity < now - UPLOAD_TTL:
                        self.remove_temporary(folder, lambda name: name in ('manifest.json','upload-state.json','capture.tmp')
                                              or re.fullmatch(r'\d{4}\.(?:part|tmp)', name) is not None)

    @staticmethod
    def touch_upload(folder):
        (folder/'upload-state.json').write_text(json.dumps({'last_activity':time.time()}))

    def authorize(self, authorization):
        if not authorization.startswith('Bearer ') or len(authorization) > 256:
            raise PermissionError('Authentication required')
        digest = hashlib.sha256(authorization[7:].encode()).hexdigest()
        clients = json.loads(self.clients.read_text()).get('clients', [])
        browser = self.root / 'browser-access.json'
        if browser.exists(): clients += json.loads(browser.read_text()).get('clients', [])
        for client in clients:
            if hmac.compare_digest(client.get('token_sha256', ''), digest) and ID.fullmatch(client.get('id', '')):
                return client['id']
        raise PermissionError('Invalid credential')

    def folder(self, client, uid):
        if not ID.fullmatch(client) or not ID.fullmatch(uid):
            raise ValueError('Invalid capture ID')
        return self.root / client / uid

    def upload_client(self, authorization):
        # Authentication is optional for uploads. Preserve old resumable queues.
        if authorization:
            try:
                return self.authorize(authorization)
            except (PermissionError, OSError, ValueError):
                pass
        return PUBLIC_CLIENT

    def usage(self):
        self.cleanup()
        reserved = 0
        for path in self.root.glob('*/*/manifest.json'):
            reserved += json.loads(path.read_text())['size']
        return reserved

    def monitor(self, uid, report, control_key='', authorization='', page_origin=None):
        self.cleanup()
        if (not ID.fullmatch(uid) or not isinstance(report, dict) or report.get('schema') != 1
                or report.get('source') not in ('browser-usb', 'browser-stock', 'browser-wifi', 'esp32-wifi')
                or type(report.get('sequence')) is not int or report['sequence'] < 1
                or not isinstance(report.get('events'), list) or len(report['events']) > 100):
            raise ValueError('Invalid monitor report')
        device = report.get('device')
        if report.get('source')=='browser-stock':
            if not stock_identity(report):raise ValueError('Invalid stock bridge identity')
        elif (not isinstance(device, dict) or device.get('product') != 'BafangReader'
                or device.get('protocol') != 1 or not isinstance(device.get('ap_mac'), str)
                or not re.fullmatch(r'(?:[a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}', device['ap_mac'])):
            raise ValueError('Invalid monitor identity')
        stamp = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        with self.lock:
            self.operator.guard_monitor(uid, report, control_key, authorization)
            self.operator.observe(uid, report, control_key, authorization)
            root = self.root / 'monitor'
            folder = root / uid
            latest = folder / 'latest.json'
            previous = json.loads(latest.read_text()) if latest.exists() else None
            if previous and previous['report']['sequence'] >= report['sequence']:
                return dict(ok=True, sequence=report['sequence'], received_utc=previous['received_utc'], monitor_saved=True)
            # Rolling monitor history is separate from full raw CAN archives.
            usage = sum(p.stat().st_size for p in root.glob('*/*') if p.is_file()) if root.exists() else 0
            history_full = usage >= 64 * 1024 * 1024
            reserve_reached = shutil.disk_usage(self.root).free < self.reserve + 131072
            if history_full or reserve_reached:
                # observe() already authenticated and persisted this bridge's
                # bounded live state. Acknowledge it independently of optional
                # monitor history so the browser advances to a fresh USB STATUS.
                # Public ingestion and full capture uploads retain their quotas.
                bridge = self.operator.bridges['items'].get(uid)
                digest = hashlib.sha256(control_key.encode()).hexdigest() if isinstance(control_key, str) and HEX.fullmatch(control_key) else ''
                if (bridge and bridge.get('authenticated') is True
                        and hmac.compare_digest(bridge['key_sha256'], digest)
                        and bridge['sequence'] >= report['sequence']):
                    return dict(ok=True, sequence=report['sequence'], received_utc=stamp,
                                monitor_saved=False,
                                storage_warning='monitor_history_quota' if history_full else 'monitor_free_space_reserve')
                raise OSError('Monitor storage quota reached')
            folder.mkdir(parents=True, exist_ok=True)
            entry = dict(received_utc=stamp, report=report, page_origin=page_origin if isinstance(page_origin,str) and len(page_origin)<=128 else None)
            raw = json.dumps(entry, ensure_ascii=True)
            # Latest CAN values replace latest.json; do not accumulate a second
            # raw CAN archive through the diagnostic heartbeat history.
            history = folder / 'history.jsonl'
            prior_control=(previous or {}).get('report',{}).get('control')
            current_control=report.get('control')
            prior_last=prior_control.get('last') if isinstance(prior_control,dict) else None
            current_last=current_control.get('last') if isinstance(current_control,dict) else None
            has_live=isinstance(current_control,dict) and isinstance(current_control.get('can_live'),dict)
            fault_changes=warning_changes(current_control.get('can_live'),prior_control.get('can_live') if isinstance(prior_control,dict) else None,device) if has_live else []
            diagnostic_types=('battery_query_result','battery_tx_diagnostic','battery_bus_error_detail','battery_hardware_check','reader_selftest_result')
            has_diagnostic=any(isinstance(e,dict) and isinstance(e.get('device'),dict) and e['device'].get('type') in diagnostic_types for e in report['events'])
            if fault_changes or has_diagnostic or not has_live or not history.exists() or time.time()-history.stat().st_mtime>=5 or prior_last!=current_last:
                history_report=json.loads(json.dumps(report))
                history_control=history_report.get('control') if isinstance(history_report.get('control'),dict) else {}
                if fault_changes:history_report['observed_can_faults']=fault_changes
                history_control.pop('can_live',None)
                history_control.pop('battery_information',None)
                if (history_control.get('live_view') or {}).get('active') is True:
                    history_report['events']=[e for e in history_report['events'] if isinstance(e,dict) and ((e.get('type')!='device' and e.get('original_type')!='device') or isinstance(e.get('device'),dict) and e['device'].get('type') in diagnostic_types)]
                history_raw=json.dumps(dict(received_utc=stamp,report=history_report),ensure_ascii=True)
                if history.exists() and history.stat().st_size+len(history_raw)>2*1024*1024:
                    (folder/'history.previous.jsonl').unlink(missing_ok=True);history.replace(folder/'history.previous.jsonl')
                with history.open('a',encoding='utf-8') as stream:stream.write(history_raw+'\n')
            temporary = folder / 'latest.tmp'
            temporary.write_text(raw, encoding='utf-8')
            temporary.replace(latest)
        return dict(ok=True, sequence=report['sequence'], received_utc=stamp, monitor_saved=True)

    def support(self, uid, report, key):
        """Read an SSH-created job for this ephemeral browser session only.

        There is deliberately no public job creation endpoint. The raw session
        key is never persisted, echoed, or put in monitor reports.
        """
        if report.get('source')=='browser-stock':
            return self.support_stock(uid,report,key)
        device = report.get('device', {})
        control = report.get('control')
        if (not HEX.fullmatch(key) or report.get('source') != 'browser-usb'
                or device.get('product') != 'BafangReader' or device.get('protocol') != 1
                or device.get('ap_mac')=='00:00:00:00:00:00' or not isinstance(device.get('ap_mac'),str) or not re.fullmatch(r'(?:[a-f0-9]{2}:){5}[a-f0-9]{2}',device['ap_mac'].lower())
                or report.get('connected') is not True or not isinstance(control, dict)
                or control.get('version') not in (1,2)):
            return None
        last = control.get('last')
        if last is not None and (not isinstance(last, dict) or not isinstance(last.get('id'), str)
                or not ID.fullmatch(last['id']) or last.get('state') not in ('accepted','started','failed','complete','cancelled')):
            return None
        permission = control.get('local_permission', {})
        lease = control.get('lease_expires_at')
        locally_allowed = (isinstance(permission, dict)
                           and permission.get('remote_support_enabled') is True
                           and permission.get('manual_mode') is False
                           and control.get('ready') is True
                           and type(lease) in (int, float) and time.time() < lease <= time.time()+35)
        allowed = locally_allowed and self.support_allowed()
        digest = hashlib.sha256(key.encode()).hexdigest()
        self.cleanup()
        with self.lock:
            folder = self.root / 'control' / uid
            if not folder.exists() and len(list((self.root / 'control').glob('*/session.json'))) >= 128:
                return None
            latest = self.root / 'monitor' / uid / 'latest.json'
            latest_report = self.operator.trusted_latest(uid) or (json.loads(latest.read_text()) if latest.exists() else None)
            if latest_report and latest_report['report']['sequence'] > report['sequence']:
                return None
            folder.mkdir(parents=True, exist_ok=True)
            session = folder / 'session.json'
            if session.exists():
                prior = json.loads(session.read_text())
                if not hmac.compare_digest(prior['key_sha256'], digest):
                    return None
            safe_last = {k:last[k] for k in ('id','state','kind') if k in last} if last else None
            declared = control.get('capabilities')
            known_caps=('rx_check','capture','stop','flash','sampling','sampling_sweep','spard_probe','paired_probe','live_view','battery_information','reader_selftest')
            capabilities=[x for x in known_caps if x in declared] if (isinstance(declared,list) and len(declared)<=len(known_caps) and all(isinstance(x,str) and x in known_caps for x in declared) and len(set(declared))==len(declared)) else []
            state = dict(key_sha256=digest, mac=device['ap_mac'].lower(), boot=device.get('boot'),version=device.get('version'),
                         last_seen=time.time(), control=dict(version=control['version'],recorder_version=2 if control.get('recorder_version')==2 else 1,ready=allowed,capabilities=capabilities,last=safe_last,lease_expires_at=lease if locally_allowed else 0,local_permission=permission))
            temporary = folder / 'session.tmp'
            temporary.write_text(json.dumps(state)); temporary.replace(session)
            pending = folder / 'pending.json'
            if not pending.exists() or pending.stat().st_size > 4096:
                return None
            job = json.loads(pending.read_text())
            if (job.get('key_sha256') != digest or job.get('expected_mac') != state['mac']
                    or job.get('expected_boot') != state['boot']
                    or not isinstance(job.get('id'), str) or not ID.fullmatch(job['id'])
                    or type(job.get('expires_at')) not in (int, float)
                    or not time.time() < job['expires_at'] <= time.time()+90
                    or job.get('kind') not in ('rx_check', 'capture', 'stop', 'flash', 'spard_probe', 'live_view', 'battery_information', 'reader_selftest')):
                return None
            if not self.operator.delivery_allowed(uid, report, digest, job):
                return None
            legacy_grant = self.legacy_flash_grant(uid, report, digest, job, latest_report) if not allowed else None
            if not allowed and legacy_grant is None:
                return None
            if (job['kind']!='stop' and last and last.get('kind')=='paired_probe'
                    and last.get('state') in ('accepted','started') and last.get('id')!=job['id']):
                return None
            if job['kind'] == 'stop' and (not last or last.get('state') != 'started'
                    or last.get('kind') not in ('capture','rx_check','sampling_sweep','spard_probe','paired_probe','battery_information')
                    or job.get('target_job_id') != last.get('id')):
                return None
            if job['kind']=='reader_selftest':
                record=self.operator.load_job(job['id'])
                voltmeter=bool(record and record.get('action')=='reader_voltmeter')
                fields={'id','kind','expected_mac','expected_boot','expires_at','key_sha256','isolation_asserted'}|({'voltmeter'} if voltmeter else set())
                if voltmeter and (job.get('voltmeter') is not True or not version_at_least(device.get('version'),'0.6.8') or 'isolated_gpio_voltmeter_v1' not in device.get('capabilities',[])):return None
                if (set(job)!=fields or job.get('isolation_asserted') is not True
                        or 'reader_selftest' not in capabilities or not record or record.get('kind')!='reader_selftest' or record.get('action') not in ('reader_selftest','reader_voltmeter')
                        or not version_at_least(device.get('version'),'0.5.5') or device.get('rx_sampling_250k')!='TRIPLE' or not self.operator.ctx(device)
                        or not isinstance(device.get('capabilities'),list) or not all(x in device['capabilities'] for x in ('command_ids','isolated_twai_selftest_v1'))
                        or control.get('busy') is True or control.get('recording') is True or control.get('updating') is True
                        or (control.get('stock_adapter') or {}).get('active') is True or device.get('rx_check',{}).get('state')=='running'
                        or device.get('can')!='stopped' and not (device.get('can')=='running' and (control.get('live_view') or {}).get('active') is True)):
                    return None
            if job['kind']=='battery_information':
                record=self.operator.load_job(job['id'])
                quiet=record and record.get('action')=='battery_information_quiet'
                fields={'id','kind','expected_mac','expected_boot','expires_at','key_sha256'}|({'read_mode','session_ended'} if quiet else set())
                if quiet and (job.get('read_mode')!='quiet' or job.get('session_ended') is not True or not version_at_least(device.get('version'),'0.5.7') or 'spard_quiet_query_v1' not in device.get('capabilities',[])):return None
                if (set(job)!=fields or 'battery_information' not in capabilities
                        or not record or record.get('kind')!='battery_information' or record.get('action') not in ('battery_information','battery_information_quiet')
                        or not version_at_least(device.get('version'),'0.5.2') or device.get('rx_sampling_250k')!='TRIPLE' or not self.operator.ctx(device)
                        or not isinstance(device.get('capabilities'),list) or not all(x in device['capabilities'] for x in ('command_ids','spard_information_query'))
                        or control.get('busy') is True or control.get('recording') is True or control.get('updating') is True
                        or (control.get('stock_adapter') or {}).get('active') is True or device.get('rx_check',{}).get('state')=='running'
                        or device.get('can')!='stopped' and not (device.get('can')=='running' and (control.get('live_view') or {}).get('active') is True)):
                    return None
            if job['kind']=='live_view':
                record=self.operator.load_job(job['id'])
                if (set(job)!={'id','kind','mode','bitrate','expected_mac','expected_boot','expires_at','key_sha256'}
                        or 'live_view' not in capabilities or job.get('mode') not in ('start','stop')
                        or type(job.get('bitrate')) is not int or job['bitrate']!=250000
                        or not record or record.get('kind')!='live_view'
                        or record.get('action')!=('live_start' if job['mode']=='start' else 'live_stop')
                        or control.get('busy') is True or control.get('recording') is True or control.get('updating') is True
                        or (control.get('stock_adapter') or {}).get('active') is True
                        or device.get('rx_check',{}).get('state')=='running'
                        or (job['mode']=='start' and (device.get('can')!='stopped' or not self.operator.ctx(device)))
                        or (job['mode']=='stop' and (device.get('can')!='running' or (control.get('live_view') or {}).get('active') is not True))):
                    return None
            if job['kind']=='sampling_sweep' and ('sampling_sweep' not in capabilities
                    or type(job.get('duration')) is not int or job['duration'] not in (30,60)
                    or type(job.get('bitrate')) is not int or job['bitrate']!=250000
                    or device.get('can')!='stopped' or device.get('rx_check',{}).get('state')=='running'
                    or not isinstance(device.get('sampling_profiles'),list)
                    or not all(p in device['sampling_profiles'] for p in ('TRIPLE','SP625','SP625_TRIPLE','SP6875','SP6875_TRIPLE','DEFAULT','MID','MID_TRIPLE'))):
                return None
            if job['kind'] == 'capture' and (job.get('bitrate') not in (10000,20000,50000,100000,125000,250000,500000,800000,1000000)
                    or type(job.get('bitrate')) is not int or type(job.get('duration')) is not int or job['duration'] not in (30,60,600)):
                return None
            if job['kind']=='spard_probe' and (control.get('version')!=2 or 'spard_probe' not in capabilities
                    or type(job.get('duration')) is not int or job['duration'] not in (30,120)
                    or job.get('mode','information') not in ('information','listen')
                    or job.get('adapter_vid')!='1A86' or job.get('adapter_pid')!='7523'
                    or device.get('can')!='stopped'):
                return None
            if job['kind']=='paired_probe' and (control.get('version')!=2 or control.get('recorder_version')!=2
                    or not all(c in capabilities for c in ('paired_probe','capture','sampling','spard_probe'))
                    or set(job)-{'id','kind','bitrate','duration','stock_duration','mode','sampling','adapter_vid','adapter_pid','expected_mac','expected_boot','expires_at','key_sha256'}
                    or type(job.get('duration')) is not int or job['duration']!=60
                    or type(job.get('stock_duration')) is not int or job['stock_duration']!=30
                    or type(job.get('bitrate')) is not int or job['bitrate']!=250000
                    or job.get('sampling')!='DEFAULT' or job.get('mode')!='information'
                    or job.get('adapter_vid')!='1A86' or job.get('adapter_pid')!='7523'
                    or device.get('can')!='stopped' or device.get('rx_check',{}).get('state')=='running'
                    or not isinstance(device.get('sampling_profiles'),list) or 'DEFAULT' not in device['sampling_profiles']
                    or not self.operator.ctx(device) or control.get('busy') is True or control.get('recording') is True
                    or control.get('updating') is True or not isinstance(control.get('stock_adapter',{}),dict)
                    or control.get('stock_adapter',{}).get('active') is True
                    or (last or {}).get('state') in ('accepted','started')):
                return None
            if job['kind']=='capture' and (job.get('bitrate')!=250000 or job.get('sampling') not in (None,'TRIPLE')):return None
            if job['kind']=='capture' and job.get('vehicle') not in (None,'phylion_old','spard_new'):
                return None
            if job['kind']=='capture' and job.get('sampling') is not None:
                if (job['bitrate']!=250000 or job['sampling'] not in ('DEFAULT','LATE','TRIPLE','LATE_TRIPLE') or 'sampling' not in capabilities
                        or not version_tuple(device.get('version')) or version_tuple(device['version'])<(0,4,6)):
                    return None
            target_version,current_version=version_tuple(job.get('firmware_version')),version_tuple(device.get('version'))
            if job['kind'] == 'flash' and (control['version'] != 2 or 'flash' not in capabilities
                    or not target_version or not current_version or target_version<=current_version or job.get('expected_version') != device.get('version')
                    or not isinstance(job.get('manifest_sha256'), str)
                    or not HEX.fullmatch(job['manifest_sha256']) or device.get('can') != 'stopped'
                    or device.get('rx_check',{}).get('state') == 'running'):
                return None
            if control.get('last', {}) and control['last'].get('id') == job['id']:
                return None
            if legacy_grant is not None and not self.consume_flash_grant(legacy_grant):
                return None
            self.operator.delivered(job)
            return {k:v for k,v in job.items() if k != 'key_sha256'}

    def support_stock(self,uid,report,key):
        """Owner-created fixed Spard jobs only; no ESP identity or legacy grant."""
        if (not isinstance(uid,str) or not ID.fullmatch(uid) or not isinstance(key,str)
                or not HEX.fullmatch(key) or not stock_identity(report)
                or report.get('connected') is not True or report['bridge']['port_count']!=1):
            return None
        control=report['control'];last=control.get('last');permission=control.get('local_permission');lease=control.get('lease_expires_at')
        if (not isinstance(permission,dict) or permission.get('remote_support_enabled') is not True
                or permission.get('manual_mode') is not False or control.get('ready') is not True
                or type(lease) not in (int,float) or not time.time()<lease<=time.time()+35
                or not self.support_allowed()):
            return None
        if last is not None and (not isinstance(last,dict) or not isinstance(last.get('id'),str)
                or not ID.fullmatch(last['id']) or last.get('state') not in ('accepted','started','failed','complete','cancelled')
                or last.get('kind') not in ('spard_probe','stop')):
            return None
        digest=hashlib.sha256(key.encode()).hexdigest()
        self.cleanup()
        with self.lock:
            bridge=self.operator.bridges['items'].get(uid)
            if (not bridge or bridge.get('bridge',{}).get('kind')!='stock'
                    or not hmac.compare_digest(bridge['key_sha256'],digest)
                    or report.get('sequence')!=bridge['sequence']
                    or report['bridge']!=bridge['bridge'] or report['device']!=bridge['device']):
                return None
            folder=self.root/'control'/uid
            if not folder.exists() and len(list((self.root/'control').glob('*/session.json')))>=128:
                return None
            session=folder/'session.json'
            if session.exists():
                prior=json.loads(session.read_text())
                # An owner-authenticated monitor rebind can replace an ESP
                # control session with this registered stock identity.
                if not hmac.compare_digest(prior.get('key_sha256',''),digest):return None
            folder.mkdir(parents=True,exist_ok=True)
            state=dict(key_sha256=digest,bridge_kind='stock',bridge_boot=report['bridge']['boot'],
                       adapter_vid='1A86',adapter_pid='7523',last_seen=time.time(),
                       control=dict(version=2,ready=True,capabilities=control['capabilities'],
                                    last={k:last[k] for k in ('id','state','kind')} if last else None,
                                    local_permission=permission,lease_expires_at=lease))
            temporary=folder/'session.tmp';temporary.write_text(json.dumps(state));temporary.replace(session)
            pending=folder/'pending.json'
            if not pending.exists() or pending.stat().st_size>4096:return None
            job=json.loads(pending.read_text())
            common={'id','kind','expected_bridge_boot','adapter_vid','adapter_pid','expires_at','key_sha256'}
            permitted=common|({'duration','mode'} if job.get('kind')=='spard_probe' else {'target_job_id'} if job.get('kind')=='stop' else set())
            if (set(job)!=permitted or job.get('kind') not in ('spard_probe','stop')
                    or not isinstance(job.get('id'),str) or not ID.fullmatch(job['id'])
                    or job.get('key_sha256')!=digest or job.get('expected_bridge_boot')!=identity_boot(bridge)
                    or job.get('adapter_vid')!='1A86' or job.get('adapter_pid')!='7523'
                    or type(job.get('expires_at')) not in (int,float) or not time.time()<job['expires_at']<=time.time()+90
                    or job['kind'] not in control['capabilities']):
                return None
            record=self.operator.load_job(job['id'])
            if (not record or record.get('bridge_kind')!='stock' or record.get('session')!=uid
                    or record.get('key_sha256')!=digest or expected_boot(record)!=identity_boot(bridge)
                    or record.get('kind')!=job['kind'] or record.get('expires_at')!=job['expires_at']
                    or not self.operator.delivery_allowed(uid,report,digest,job)):
                return None
            if job['kind']=='spard_probe':
                if (type(job.get('duration')) is not int or job['duration'] not in (30,120)
                        or job.get('mode') not in ('information','listen')
                        or record.get('duration_s')!=job['duration']
                        or record.get('action')!=('spard_information' if job['mode']=='information' else 'spard_listen')
                        or control.get('updating') is True or control.get('busy') is True or control.get('recording') is True
                        or not isinstance(control.get('stock_adapter',{}),dict) or control.get('stock_adapter',{}).get('active') is True
                        or (last or {}).get('state') in ('accepted','started')):
                    return None
            else:
                target=self.operator.load_job(job.get('target_job_id','')) if isinstance(job.get('target_job_id'),str) and ID.fullmatch(job['target_job_id']) else None
                if (not last or last.get('kind')!='spard_probe' or last.get('state')!='started' or last.get('id')!=job.get('target_job_id')
                        or not target or target.get('bridge_kind')!='stock' or target.get('session')!=uid
                        or expected_boot(target)!=identity_boot(bridge) or target.get('state')!='started'
                        or record.get('action')!='stop' or record.get('target_job_id')!=target.get('id')):
                    return None
            if last and last.get('id')==job['id']:return None
            self.operator.delivered(job)
            return {k:v for k,v in job.items() if k!='key_sha256'}

    def begin(self, client, uid, meta):
        self.cleanup()
        folder = self.folder(client, uid)
        if (not isinstance(meta, dict) or meta.get('schema') != 1 or meta.get('id') != uid or type(meta.get('size')) is not int
                or not 0 < meta['size'] <= MAX_ARCHIVE or meta.get('part_size') != PART_SIZE
                or meta.get('parts') != (meta['size'] + PART_SIZE - 1) // PART_SIZE
                or not isinstance(meta.get('sha256'), str) or not HEX.fullmatch(meta['sha256'])
                or meta.get('format') not in ('tar.gz', 'jsonl', 'jsonl-gzip', 'attachment')):
            raise ValueError('Invalid archive manifest')
        if meta['format'] == 'attachment':
            name = meta.get('filename')
            if (meta['size'] > MAX_ATTACHMENT or not isinstance(name, str) or not 1 <= len(name) <= 240
                    or name in ('.', '..') or any(c in name for c in '/\\')
                    or any(ord(c) < 32 or ord(c) == 127 for c in name)):
                raise ValueError('Invalid attachment filename or size')
        with self.lock:
            manifest = folder / 'manifest.json'
            if manifest.exists():
                if json.loads(manifest.read_text()) != meta:
                    raise ValueError('Capture ID already has different content')
            else:
                if self.usage() + meta['size'] > self.quota:
                    raise OSError('CityBike storage quota reached; local logs must be retained')
                if shutil.disk_usage(self.root).free < self.reserve + 2 * meta['size']:
                    raise OSError('Server free-space reserve reached')
                folder.mkdir(parents=True)
                manifest.write_text(json.dumps(meta))
            part = 0
            if (folder / 'receipt.json').exists():
                part = meta['parts']
            else:
                while (folder / f'{part:04}.part').exists():
                    part += 1
            if not (folder / 'receipt.json').exists():
                self.touch_upload(folder)
            return dict(ok=True, next_part=part)

    def put(self, client, uid, part, data, digest):
        folder = self.folder(client, uid)
        with self.lock:
            meta = json.loads((folder / 'manifest.json').read_text())
            if not 0 <= part < meta['parts']:
                raise ValueError('Invalid part')
            expected = min(PART_SIZE, meta['size'] - part * PART_SIZE)
            if len(data) != expected or hashlib.sha256(data).hexdigest() != digest:
                raise ValueError('Part length/hash mismatch')
            if (folder / 'receipt.json').exists():
                return dict(ok=True)
            target = folder / f'{part:04}.part'
            if target.exists():
                if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
                    raise ValueError('Different part already exists')
                return dict(ok=True)
            if shutil.disk_usage(self.root).free < self.reserve + len(data):
                raise OSError('Server free-space reserve reached')
            temporary = target.with_suffix('.tmp')
            with temporary.open('wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.replace(target)
            self.touch_upload(folder)
            return dict(ok=True)

    def complete(self, client, uid):
        folder = self.folder(client, uid)
        with self.lock:
            receipt = folder / 'receipt.json'
            if receipt.exists():
                return json.loads(receipt.read_text())
            meta = json.loads((folder / 'manifest.json').read_text())
            digest = hashlib.sha256()
            total = 0
            temporary = folder / 'capture.tmp'
            try:
                with temporary.open('wb') as output:
                    for index in range(meta['parts']):
                        with (folder / f'{index:04}.part').open('rb') as source:
                            while chunk := source.read(1024 * 1024):
                                output.write(chunk)
                                digest.update(chunk)
                                total += len(chunk)
                    output.flush()
                    os.fsync(output.fileno())
                if total != meta['size'] or digest.hexdigest() != meta['sha256']:
                    raise ValueError('Complete archive hash mismatch')
                suffix = {'tar.gz':'tar.gz','jsonl':'jsonl','jsonl-gzip':'jsonl.gz','attachment':'bin'}[meta['format']]
                temporary.replace(folder / ('capture.' + suffix))
                result = dict(ok=True, id=uid, bytes=total, sha256=meta['sha256'], received_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
                if meta['format'] == 'attachment':
                    result.update(kind='attachment', filename=meta['filename'])
                receipt.write_text(json.dumps(result))
                (folder/'upload-state.json').unlink(missing_ok=True)
                for index in range(meta['parts']):
                    (folder / f'{index:04}.part').unlink()
                return result
            finally:
                temporary.unlink(missing_ok=True)


class Handler(BaseHTTPRequestHandler):
    store = None
    protocol_version = 'HTTP/1.1'
    web_root = None
    origins = {'https://134.98.158.132:18443', 'http://192.168.4.1'}
    assets = {'kolumbus-logo.svg','esp-remote.js','ble-remote.js','reader-selftest.js','bafang-battery.js','preferences.js','i18n.js','appearance.css','index.html','style.css','can-live.js','can-live.css','spard-can.js','battery-query.js','esp-battery.js','app.js','files.js','adapter.js','spard-probe.js','spard-information.js','spard-battery.js','auto-update.js','remote-console.js','remote-console.css','decoder.js','decoder_reference.json','capture_profiles.json','store.js','transport.js','tuning.js','browser.js','archive-worker.js','sw.js','manifest.webmanifest','icon.svg','flash.html','flash-core.js','monitor.js','metrics.js','support.js','remote-flash.js','flash-page.js','esp-flasher.js','THIRD_PARTY_LICENSES.txt'}

    def log_message(self, *_):
        pass # No credentials, payloads or device identifiers in access logs.

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def allowed_origin(self, origin):
        if origin in self.origins:
            return True
        local = re.fullmatch(r'http://(?:127\.0\.0\.1|localhost):([1-9][0-9]{0,4})', origin or '')
        return bool(local and int(local[1]) <= 65535)

    def answer(self, value, status=200):
        raw = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        if status==429 and type(value.get('retry_after_s')) is int:
            self.send_header('Retry-After',str(value['retry_after_s']))
        origin = self.headers.get('Origin')
        if self.allowed_origin(origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.end_headers()
        self.wfile.write(raw)
        self.close_connection = True

    def do_GET(self):
        path = self.path.split('?',1)[0]
        if path in ('/v1/operator/state','/v1/operator/spard-access'):
            if self.headers.get('Origin') and not self.allowed_origin(self.headers['Origin']):
                return self.answer(dict(ok=False,error='origin_not_allowed'),403)
            try:
                self.store.operator.authorize_http(self.headers.get('Authorization',''),self.client_address[0])
                return self.answer(self.store.operator.spard_access(self.headers.get('Authorization','')) if path.endswith('/spard-access') else self.store.operator.state(self.headers.get('Authorization','')))
            except OperatorError as exc:
                return self.answer(dict(ok=False,error=exc.code,message=exc.message,**({'retry_after_s':exc.retry_after_s} if exc.retry_after_s is not None else {})),exc.status)
        handset=re.fullmatch(r'/v1/handset/([a-f0-9]{32})',path)
        if handset:
            if self.headers.get('Origin') and not self.allowed_origin(self.headers['Origin']):return self.answer(dict(ok=False,error='origin_not_allowed'),403)
            try:return self.answer(self.store.operator.handset_poll(handset[1],self.headers.get('X-Reader-Control','')))
            except OperatorError as exc:return self.answer(dict(ok=False,error=exc.code,message=exc.message),exc.status)
        if path == '/api/state' and self.web_root:
            return self.answer(dict(device={},connection=dict(transport='webserial',connected=False),app=dict(version='0.4.8',web_build='20261028-bms-txtrace1',desktop=False,browser=True)))
        if self.web_root and path in ('/firmware/manifest.json','/firmware/bootloader.bin','/firmware/partitions.bin','/firmware/firmware.bin'):
            target = Path(self.web_root) / path[1:]
            if not target.is_file(): return self.answer(dict(ok=False,error='Firmware not available'),404)
            data=target.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type','application/json' if path.endswith('.json') else 'application/octet-stream')
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-store')
            self.send_header('Connection','close'); self.end_headers(); self.wfile.write(data); self.close_connection=True
            return
        asset = 'index.html' if path == '/' else path[1:]
        if self.web_root and asset in self.assets:
            data = (Path(self.web_root) / asset).read_bytes()
            import mimetypes
            content_type = {'.js':'application/javascript','.webmanifest':'application/manifest+json'}.get(Path(asset).suffix) or mimetypes.guess_type(asset)[0] or 'application/octet-stream'
            self.send_response(200)
            self.send_header('Content-Type',content_type+'; charset=utf-8')
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-cache')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Permissions-Policy','serial=(self), bluetooth=(self)')
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://134.98.158.132:18443; worker-src 'self'; frame-ancestors 'none'")
            self.send_header('Connection','close'); self.end_headers(); self.wfile.write(data); self.close_connection=True
            return
        self.answer(dict(ok=True, service='CityBike capture receiver', protocol=1), 200 if self.path == '/health' else 404)

    def do_OPTIONS(self):
        if not self.allowed_origin(self.headers.get('Origin')): return self.answer(dict(ok=False),403)
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin',self.headers['Origin'])
        self.send_header('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Authorization, Content-Type, X-Content-SHA256, X-Reader-Control')
        self.send_header('Access-Control-Max-Age','600')
        self.send_header('Content-Length','0'); self.end_headers()

    def mutate(self):
        try:
            # Consume a bounded valid HTTP body before any early rejection.
            # Closing a socket with unread request bytes can reset it on Windows
            # and hide the intended 400/403 response from the client.
            length = int(self.headers.get('Content-Length', '-1'))
            if not 0 < length <= (PART_SIZE if self.command == 'PUT' else 32768):
                raise ValueError('Invalid content length')
            data = self.rfile.read(length)
            if len(data) != length:
                raise ValueError('Truncated request')
            if self.headers.get('Origin') and not self.allowed_origin(self.headers['Origin']):
                return self.answer(dict(ok=False,error='Origin not allowed'),403)
            handset=re.fullmatch(r'/v1/handset/([a-f0-9]{32})',self.path)
            if handset and self.command=='POST':
                if length>1024:raise OperatorError('invalid_request','Request too large',400)
                return self.answer(self.store.operator.handset_poll(handset[1],self.headers.get('X-Reader-Control',''),json.loads(data)))
            if self.path == '/v1/operator/handset' and self.command == 'POST':
                self.store.operator.authorize_http(self.headers.get('Authorization',''),self.client_address[0])
                if length>1024:raise OperatorError('invalid_request','Request too large',400)
                return self.answer(self.store.operator.handset_request(self.headers.get('Authorization',''),json.loads(data)))
            if self.path == '/v1/operator/jobs' and self.command == 'POST':
                self.store.operator.authorize_http(self.headers.get('Authorization',''),self.client_address[0])
                if length > 4096:raise OperatorError('invalid_request','Слишком большой запрос',400)
                return self.answer(self.store.operator.enqueue(self.headers.get('Authorization',''),json.loads(data)))
            if self.path.startswith('/v1/monitor/') and self.headers.get('Authorization'):
                self.store.operator.authorize_http(self.headers['Authorization'],self.client_address[0])
            monitor = re.fullmatch(r'/v1/monitor/([a-f0-9]{32})', self.path)
            if monitor and self.command == 'POST':
                if not 0 < length <= 32768:
                    raise ValueError('Invalid monitor length')
                report = json.loads(data)
                result = self.store.monitor(monitor[1], report, control_key=self.headers.get('X-Reader-Control',''), authorization=self.headers.get('Authorization',''), page_origin=self.headers.get('Origin'))
                command = self.store.support(monitor[1], report, self.headers.get('X-Reader-Control', ''))
                if command: result['command'] = command
                return self.answer(result)
            client = self.store.upload_client(self.headers.get('Authorization', ''))
            match = re.fullmatch(r'/v1/uploads/([a-f0-9]{32})(?:/(complete|[0-9]{1,4}))?', self.path)
            if not match:
                raise ValueError('Invalid route')
            uid, operation = match.groups()
            if not 0 < length <= (PART_SIZE if self.command == 'PUT' else 4096):
                raise ValueError('Invalid content length')
            if self.command == 'POST' and operation is None:
                result = self.store.begin(client, uid, json.loads(data))
            elif self.command == 'POST' and operation == 'complete':
                result = self.store.complete(client, uid)
            elif self.command == 'PUT' and operation and operation.isdecimal():
                result = self.store.put(client, uid, int(operation), data, self.headers.get('X-Content-SHA256', ''))
            else:
                raise ValueError('Invalid operation')
            self.answer(result)
        except OperatorError as exc:
            self.answer(dict(ok=False,error=exc.code,message=exc.message,**({'retry_after_s':exc.retry_after_s} if exc.retry_after_s is not None else {})),exc.status)
        except PermissionError as exc:
            self.answer(dict(ok=False, error=str(exc)), 401)
        except (ValueError, KeyError, TypeError, FileNotFoundError) as exc:
            self.answer(dict(ok=False, error='Invalid or incomplete capture'), 400)
        except OSError as exc:
            self.answer(dict(ok=False, error='Storage unavailable or quota reached'), 507)

    do_POST = mutate
    do_PUT = mutate


class Server(ThreadingHTTPServer):
    daemon_threads = True
    slots = threading.BoundedSemaphore(8)

    def __init__(self, address, handler, tls_context=None):
        self.tls_context = tls_context
        super().__init__(address, handler)

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(15)
        if self.tls_context:
            try:
                connection = self.tls_context.wrap_socket(connection, server_side=True, do_handshake_on_connect=False)
            except Exception:
                connection.close()
                raise
        return connection, address

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            if isinstance(request, ssl.SSLSocket):
                try:
                    request.do_handshake()
                except (ssl.SSLError, OSError):
                    self.shutdown_request(request)
                    return
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', required=True)
    parser.add_argument('--clients', required=True)
    parser.add_argument('--port', type=int, default=18841)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--tls-cert')
    parser.add_argument('--tls-key')
    parser.add_argument('--web-root')
    parser.add_argument('--control-policy', help='Explicit remote-action policy; missing/invalid denies all jobs')
    args = parser.parse_args()
    if bool(args.tls_cert) != bool(args.tls_key):
        parser.error('Both TLS certificate and key are required')
    if args.bind not in ('127.0.0.1', '::1') and not args.tls_cert:
        parser.error('Public binding requires TLS')
    context = None
    if args.tls_cert:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(args.tls_cert, args.tls_key)
    Handler.store = Storage(args.data, args.clients, control_policy=args.control_policy)
    Handler.web_root = args.web_root
    with Server((args.bind, args.port), Handler, tls_context=context) as server:
        server.serve_forever()


if __name__ == '__main__':
    main()
