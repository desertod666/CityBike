"""Read-only SYM reference parser. No CAN command/payload generation."""
import csv
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FIRST_IDS = {0x02F83201, 0x04F83401, 0x01F83100, 0x04F83400, 0x03106300}


def parse_source(path=ROOT / 'SYSTEM TESTING_BAFANG SYSTEM_V1.sym'):
    # Original PEAK file uses Windows-1252, including the degree sign.
    source = path.read_bytes()
    text = source.decode('cp1252')
    enums = {}
    for name, body in re.findall(r'enum\s+(\w+)\((.*?)\)', text, re.S):
        enums[name] = [{'value': int(v), 'label': label}
                       for v, label in re.findall(r'(-?\d+)="([^"]*)"', body)]
    messages, section, current = [], None, None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith('{'):
            section, current = line.strip('{}'), None
        elif line.startswith('['):
            current = {'name': line[1:-1].strip('"'), 'section': section, 'signals': []}
            messages.append(current)
        elif current is not None:
            if line.startswith('ID='):
                current['id'] = f"0x{int(line[3:-1], 16):08X}"
                current['extended_required'] = int(line[3:-1], 16) > 0x7ff
            elif line.startswith('Picture='):
                picture = line[8:].split()
                if any(len(b) != 8 for b in picture):
                    raise ValueError('Invalid Picture')
                current['picture'] = ' '.join(picture)
                current['picture_bytes'] = len(picture)
            elif re.match(r'^[a-z]=', line):
                match = re.fullmatch(r'([a-z])=("[^"]*"|\S+)\s+(unsigned|signed|char)\s*(.*)', line)
                if not match:
                    raise ValueError(line)
                symbol, name, typ, attrs = match.groups()
                bits = sorted(i * 8 + 7 - j for i, byte in enumerate(current['picture'].split())
                              for j, ch in enumerate(byte) if ch == symbol)
                def attr(key, default=None):
                    m = re.search(r'/' + key + r':("[^"]*"|\S+)', attrs)
                    return m[1].strip('"') if m else default
                current['signals'].append(dict(
                    symbol=symbol, name=name.strip('"'), type=typ, bits_lsb0=bits,
                    bit_length=len(bits), byte_indices=sorted({b // 8 for b in bits}),
                    byte_order='big_endian' if '-m' in attrs.split() else 'little_endian',
                    factor=float(attr('f', '1')), offset=float(attr('o', '0')),
                    unit=attr('u', ''), enum=attr('e'), source_attributes=attrs,
                    source_line=line))
    return {'sha256': hashlib.sha256(source).hexdigest(), 'messages': messages, 'enums': enums}


def verify_tables(root=ROOT):
    """Compare every derived JSON field and every CSV row against the original."""
    parsed = parse_source(root / 'SYSTEM TESTING_BAFANG SYSTEM_V1.sym')
    derived = json.loads((root / 'sym_messages.json').read_text(encoding='utf-8'))
    for key in ('sha256', 'messages', 'enums'):
        if parsed[key] != derived[key]:
            raise ValueError(f'Derived JSON mismatch: {key}')
    with (root / 'sym_signals.csv').open(encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    expected = []
    for m in parsed['messages']:
        for s in m['signals']:
            expected.append(dict(ID=m['id'], Message=m['name'], Section=m['section'],
                Picture_bytes=str(m['picture_bytes']), Signal=s['name'],
                Byte_indices_zero_based=','.join(map(str, s['byte_indices'])),
                Bits_LSB0=','.join(map(str, s['bits_lsb0'])), Type=s['type'],
                Byte_order=s['byte_order'], Factor=str(s['factor']), Offset=str(s['offset']),
                Unit=s['unit'] or '', Enum=s['enum'] or '', Source_attributes=s['source_attributes']))
    if rows != expected:
        raise ValueError('Derived CSV mismatch')
    return parsed


class Decoder:
    def __init__(self):
        if (ROOT / 'SYSTEM TESTING_BAFANG SYSTEM_V1.sym').exists():
            source = verify_tables()
        else:
            source = json.loads(Path(__file__).with_name('decoder_reference.json').read_text(encoding='utf-8'))
            if {int(m['id'], 16) for m in source['messages']} != FIRST_IDS:
                raise ValueError('Invalid bundled decoder reference')
        self.messages = {int(m['id'], 16): m for m in source['messages'] if int(m['id'], 16) in FIRST_IDS}
        self.sha256 = source['sha256']

    def decode(self, frame):
        try:
            ident = int(frame['id'], 16)
            data = bytes.fromhex(frame['data'])
            dlc = frame['dlc']
            if type(frame['extended']) is not bool or type(frame['rtr']) is not bool:
                raise ValueError('flags must be boolean')
            if type(dlc) is not int or not 0 <= dlc <= 8:
                raise ValueError('not a classic CAN DLC')
            if not 0 <= ident <= (0x1fffffff if frame['extended'] else 0x7ff):
                raise ValueError('ID/extended mismatch')
            if len(data) != (0 if frame['rtr'] else dlc):
                raise ValueError('payload length mismatch')
            if frame['rtr']:
                return {'status': 'rtr'}
            m = self.messages.get(ident)
            if m is None:
                return {'status': 'unknown'}
            if not frame['extended'] or dlc != m['picture_bytes']:
                raise ValueError('SYM flags/length mismatch')
            fields = {}
            for s in m['signals']:
                raw = sum(((data[b // 8] >> (b % 8)) & 1) << i for i, b in enumerate(s['bits_lsb0']))
                if s['type'] == 'signed' and raw & (1 << (s['bit_length'] - 1)):
                    raw -= 1 << s['bit_length']
                fields[s['name']] = {'raw': raw, 'value': raw * s['factor'] + s['offset'], 'unit': s['unit']}
            return {'status': 'decoded_unconfirmed', 'message': m['name'], 'fields': fields}
        except (KeyError, TypeError, ValueError) as e:
            return {'status': 'invalid', 'reason': str(e)}


if __name__ == '__main__':
    result = verify_tables()
    print(f"Verified {len(result['messages'])} messages, {sum(len(m['signals']) for m in result['messages'])} signals; SHA256 {result['sha256']}")
