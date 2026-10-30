"""Bounded owner-console snapshot of a reader test; never transmits CAN."""
from reader_version import version_at_least
import re


def valid_gpio_probe(p):
    if (not isinstance(p, dict) or any(type(p.get(k)) is not bool for k in ('attempted', 'passed', 'ctx_restored'))
            or p.get('driver_installed') is not (False if p['attempted'] else None)
            or type(p.get('low_hold_us')) is not int or p['low_hold_us'] not in (100, 8000000)
            or not isinstance(p.get('reason'), str) or not re.fullmatch(r'[a-z_]{1,64}', p['reason'])):
        return False
    for key in ('tx', 'rx'):
        if not isinstance(p.get(key), list) or len(p[key]) != 3 or any(type(v) is not int or v not in (-1, 0, 1) for v in p[key]):
            return False
    if any(type(p.get(k)) is not int or not -2147483648 <= p[k] <= 2147483647 for k in ('low_rc', 'high_rc')):
        return False
    if not p['attempted'] and (p['passed'] or p['tx'] != [-1]*3 or p['rx'] != [-1]*3):
        return False
    if 'rx_config_rc' in p or 'rx_config_valid' in p:
        if (type(p.get('rx_config_rc')) is not int or not -2147483648 <= p['rx_config_rc'] <= 2147483647
                or type(p.get('rx_config_valid')) is not bool or p['rx_config_valid'] and p['rx_config_rc'] != 0
                or p['attempted'] and not p['rx_config_valid']):
            return False
    return not p['passed'] or (p['attempted'] and p['ctx_restored'] and p['tx'] == p['rx'] == [1, 0, 1]
                              and p['low_rc'] == p['high_rc'] == 0 and p['reason'] == 'gpio_loopback_verified')


def valid_stage_ecc(e):
    if e is None:
        return True
    if (not isinstance(e, dict) or e.get('captured_before_cleanup') is not True
            or type(e.get('after_event')) is not int or not 0 <= e['after_event'] <= 0xffffffff):
        return False
    v = e.get('last')
    return v is None or (isinstance(v, dict) and v.get('source') == 'single_HAL_ECC_read' and v.get('scope') == 'boot_history'
        and type(v.get('event')) is int and e['after_event'] < v['event'] <= 0xffffffff
        and type(v.get('t_us')) is int and 0 <= v['t_us'] <= 0xffffffffffffffff
        and type(v.get('raw')) is int and 0 <= v['raw'] <= 255
        and all(type(v.get(k)) is int for k in ('type', 'direction', 'segment'))
        and (v['type'], v['direction'], v['segment']) == (v['raw'] >> 6, (v['raw'] >> 5) & 1, v['raw'] & 31)
        and type(v.get('saturated')) is bool)


def sanitize_selftest(value, device):
    if not isinstance(value, dict) or value.get('phase') not in ('idle', 'preparing', 'running', 'complete', 'failed'):
        return None
    result = dict(phase=value['phase'], error=value.get('error', '')[:160] if isinstance(value.get('error'), str) else None, result=None)
    raw = value.get('result')
    if not isinstance(raw, dict) or not isinstance(device, dict):
        return result
    if (device.get('product') != 'BafangReader' or raw.get('type') != 'reader_selftest_result'
            or raw.get('boot') != device.get('boot') or type(raw.get('epoch')) is not int
            or type(device.get('epoch')) is not int or not 0 <= raw['epoch'] <= device['epoch']
            or raw.get('state') not in ('complete', 'failed') or raw.get('isolation_asserted') is not True
            or raw.get('bitrate') != 250000 or raw.get('sampling') != 'TRIPLE' or raw.get('ack_required') is not False
            or type(raw.get('ctx_restored')) is not bool or type(raw.get('driver_retained')) is not bool
            or not isinstance(raw.get('id'), str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,40}', raw['id'])
            or not isinstance(raw.get('stages'), list) or len(raw['stages']) != 3):
        return result
    stages = []
    failed = False
    for s, (name, tx, rx) in zip(raw['stages'], [('peripheral_pad10', 10, 10), ('ctx_pad4', 4, 4), ('transceiver_rx5', 4, 5)]):
        if (not isinstance(s, dict) or s.get('name') != name or s.get('tx_gpio') != tx or s.get('rx_gpio') != rx
                or type(s.get('attempted')) is not int or s['attempted'] not in (0, 1)
                or type(s.get('passed')) is not bool or type(s.get('echo_received')) is not bool
                or type(s.get('status_valid')) is not bool or not isinstance(s.get('reason'), str)
                or not re.fullmatch(r'[a-z_]{1,64}', s['reason'])):
            return result
        unsigned = ('tx_errors', 'rx_errors', 'failed_tx', 'bus_errors', 'arbitration_lost', 'alerts', 'elapsed_us', 'tx_out_raw', 'rx_matrix_raw')
        signed = ('install_rc', 'start_rc', 'transmit_rc', 'status_rc', 'stop_rc', 'uninstall_rc')
        if any(type(s.get(k)) is not int or not 0 <= s[k] <= 0xffffffff for k in unsigned):
            return result
        if any(type(s.get(k)) is not int or not -2147483648 <= s[k] <= 2147483647 for k in signed):
            return result
        if failed and (s['attempted'] or s['passed']):
            return result
        if s['passed'] and (not s['attempted'] or not s['echo_received'] or not s['status_valid'] or s['reason'] != 'self_echo_verified'
                            or any(s[k] for k in signed + ('tx_errors', 'rx_errors', 'failed_tx', 'bus_errors', 'arbitration_lost'))):
            return result
        if raw.get('test_frame_dlc') == 8:
            frame = s.get('rx_frame')
            if frame is not None and (not isinstance(frame, dict) or set(frame) != {'id','extended','rtr','dlc','data'}
                    or type(frame.get('id')) is not int or not 0 <= frame['id'] <= 0x1fffffff
                    or type(frame.get('extended')) is not bool or type(frame.get('rtr')) is not bool
                    or type(frame.get('dlc')) is not int or not 0 <= frame['dlc'] <= 15
                    or not isinstance(frame.get('data'), str) or not re.fullmatch(r'[A-F0-9]{16}', frame['data'])):
                return result
            if s['passed'] and (frame is None or frame['id'] != 0x666 or frame['extended'] or frame['rtr'] or frame['dlc'] != 8 or frame['data'] != '0000000000000000'):
                return result
        failed |= not s['passed']
        stages.append({k: s[k] for k in ('name', 'tx_gpio', 'rx_gpio', 'attempted', 'passed', 'echo_received', 'status_valid', 'reason') + unsigned + signed})
    if version_at_least(device.get('version'),'0.5.6') and raw.get('test_frame_dlc') != 8:
        return result
    if version_at_least(device.get('version'), '0.6.7') or 'gpio_probe' in raw:
        p = raw.get('gpio_probe')
        if (not valid_gpio_probe(p) or not valid_stage_ecc(raw.get('stage3_ecc'))
                or stages[2]['attempted'] and (not p['passed'] or raw.get('stage3_ecc') is None)
                or not stages[2]['attempted'] and raw.get('stage3_ecc') is not None
                or p['attempted'] and not all(s['passed'] for s in stages[:2])):
            return result
        if (p['low_hold_us'] == 8000000 and (not version_at_least(device.get('version'), '0.6.8')
                or 'isolated_gpio_voltmeter_v1' not in device.get('capabilities', []))
                or version_at_least(device.get('version'), '0.6.8') and 'rx_config_rc' not in p):
            return result
    if (raw['state'] == 'complete') != (not failed and raw['ctx_restored'] and not raw['driver_retained']):
        return result
    result['result'] = {k: raw[k] for k in ('type', 'id', 'boot', 'epoch', 'state', 'isolation_asserted', 'bitrate', 'sampling', 'ack_required', 'ctx_restored', 'driver_retained')}
    result['result']['stages'] = stages
    if 'gpio_probe' in raw:
        p = raw['gpio_probe']
        result['result']['gpio_probe'] = {k: p[k] for k in ('attempted', 'passed', 'ctx_restored', 'reason', 'driver_installed', 'low_hold_us', 'tx', 'rx', 'low_rc', 'high_rc')}
        if 'rx_config_rc' in p:
            result['result']['gpio_probe'].update(rx_config_rc=p['rx_config_rc'],rx_config_valid=p['rx_config_valid'])
        e = raw.get('stage3_ecc')
        result['result']['stage3_ecc'] = None if e is None else dict(after_event=e['after_event'], captured_before_cleanup=True,
            last={k: e['last'][k] for k in ('source','scope','event','t_us','raw','type','direction','segment','saturated')} if e.get('last') is not None else None)
    if raw.get('test_frame_dlc') == 8:
        result['result']['test_frame_dlc'] = 8
        for output, source in zip(stages, raw['stages']):
            output['rx_frame'] = dict(source['rx_frame']) if source.get('rx_frame') is not None else None
    return result
