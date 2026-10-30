"""Bounded owner-console snapshot of a reader test; never transmits CAN."""
from reader_version import version_at_least
import re


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
    if (raw['state'] == 'complete') != (not failed and raw['ctx_restored'] and not raw['driver_retained']):
        return result
    result['result'] = {k: raw[k] for k in ('type', 'id', 'boot', 'epoch', 'state', 'isolation_asserted', 'bitrate', 'sampling', 'ack_required', 'ctx_restored', 'driver_retained')}
    result['result']['stages'] = stages
    if raw.get('test_frame_dlc') == 8:
        result['result']['test_frame_dlc'] = 8
        for output, source in zip(stages, raw['stages']):
            output['rx_frame'] = dict(source['rx_frame']) if source.get('rx_frame') is not None else None
    return result
