"""Validate passive controller2 -> client3 identity transfer evidence.

Observed start4/one-byte length and sequence5/6 framing, objects6000..6003.
No requests, acknowledgements, stored-bike lookup or hardware access.
"""
import re

MAX_INT = 9007199254740991
OBJECTS = {'6000', '6001', '6002', '6003'}
FRAME_KEYS = {'id', 'extended', 'rtr', 'dlc', 'data', 'seq', 't_us'}


def uint(value, maximum=MAX_INT):
    return type(value) is int and 0 <= value <= maximum


def validate_identity(value):
    if (not isinstance(value, dict) or set(value) != {'object', 'age_ms', 'frames', 'boot', 'epoch'}
            or not isinstance(value.get('boot'),str) or not re.fullmatch('[A-F0-9]{8}',value['boot'])
            or not uint(value.get('epoch'))
            or not isinstance(value.get('object'),str) or value.get('object') not in OBJECTS or not uint(value.get('age_ms'), 86400000)
            or not isinstance(value.get('frames'), list) or not 2 <= len(value['frames']) <= 9):
        return None
    payload = bytearray()
    previous = None
    frames = []
    length = None
    for index, frame in enumerate(value['frames']):
        if (not isinstance(frame, dict) or set(frame) != FRAME_KEYS
                or not isinstance(frame.get('id'), str)
                or not re.fullmatch('[A-F0-9]{8}', frame['id'])
                or frame.get('extended') is not True or frame.get('rtr') is not False
                or not uint(frame.get('dlc'), 8) or frame['dlc'] == 0
                or not isinstance(frame.get('data'), str)
                or not re.fullmatch('(?:[A-F0-9]{2})*', frame['data'])
                or len(frame['data']) != frame['dlc'] * 2
                or not uint(frame.get('seq')) or not uint(frame.get('t_us'))):
            return None
        ident = int(frame['id'], 16)
        if ident >= 1 << 29 or (ident >> 24) & 31 != 2 or (ident >> 19) & 31 != 3:
            return None
        if previous and (frame['seq'] <= previous['seq'] or frame['t_us'] < previous['t_us']):
            return None
        raw = bytes.fromhex(frame['data'])
        op, parameter = (ident >> 16) & 7, ident & 65535
        if index == 0:
            if op != 4 or parameter != int(value['object'], 16) or len(raw) != 1 or not 1 <= raw[0] <= 64:
                return None
            length = raw[0]
        else:
            last = index == len(value['frames']) - 1
            if op != (6 if last else 5) or parameter != index - 1 or (not last and len(raw) != 8):
                return None
            payload.extend(raw)
            if len(payload) > length or (not last and len(payload) >= length):
                return None
        frames.append(dict(frame))
        previous = frame
    if len(payload) != length or frames[-1]['t_us'] - frames[0]['t_us'] > 2000000:
        return None
    return dict(object=value['object'], age_ms=value['age_ms'], frames=frames,boot=value['boot'],epoch=value['epoch'])


def interpret_identity(value):
    checked = validate_identity(value)
    if checked is None:
        return None
    raw = bytes.fromhex(''.join(frame['data'] for frame in checked['frames'][1:]))
    return dict(object=checked['object'], raw_hex=raw.hex().upper(),
                text=raw.decode('ascii') if all(32 <= b <= 126 for b in raw) else None,
                source=2, destination=3,
                reference='Bafang GYE-1--02 V2.5 p25; observed controller framing',
                compatibility='reference_not_vehicle_identification')
