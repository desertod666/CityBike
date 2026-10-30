"""Offline Bafang battery diagnostic correlation; never opens USB or sends CAN.

Address fields follow the supplied Bafang V2.5 reference. A source address is
not physical sender identification. Temporal pairing is evidence of a matching
exchange, not proof of causality or complete reception of the physical bus.
"""
from collections import Counter

CELL_OBJECTS = range(0x6402, 0x640A)
OBJECTS = frozenset((0x6400, 0x6401, *CELL_OBJECTS, 0x6415, 0x6416, 0x6417))
MAX_REPLY_US = 100_000

# V2.5 revision history p3 and dictionary p29 reverse these two assignments.
# Preserve both as raw bytes until a device-specific source resolves the conflict.
LAYOUT_CONFLICT = {
    'objects': ['6416', '6417'],
    'revision_history_p3': {'6416': 'recent_error_codes', '6417': 'production_date'},
    'dictionary_p29': {'6416': 'production_date', '6417': 'recent_error_codes'},
    'interpretation': 'raw_only; supplied V2.5 reference contradicts itself',
}


def address(identifier):
    return ((identifier >> 24) & 31, (identifier >> 19) & 31,
            (identifier >> 16) & 7, identifier & 65535)


def valid_frame(frame):
    try:
        return (frame.get('type') == 'frame' and isinstance(frame['boot'], str)
                and len(frame['boot']) == 8 and all(c in '0123456789abcdefABCDEF' for c in frame['boot'])
                and all(type(frame[k]) is int and frame[k] >= 0
                        for k in ('epoch', 'seq', 't_us', 'dlc'))
                and frame['dlc'] <= 8 and type(frame['extended']) is bool
                and type(frame['rtr']) is bool and isinstance(frame['id'], str)
                and 1 <= len(frame['id']) <= 8 and all(c in '0123456789abcdefABCDEF' for c in frame['id']) and 0 <= int(frame['id'], 16) < 0x20000000
                and isinstance(frame['data'], str)
                and len(frame['data']) == 2 * frame['dlc']
                and len(bytes.fromhex(frame['data'])) == frame['dlc'])
    except (KeyError, TypeError, ValueError):
        return False


def correlate(records):
    """Pair observed zero-payload requests with reverse-addressed responses.

    Every frame, including unrelated traffic, participates in continuity checks.
    Gaps, invalid records, resets and scope changes prevent cross-boundary pairs.
    Repeated unanswered requests are ambiguous: never choose one silently.
    """
    pending = {}; previous = None; segment = 0
    transactions = []; error_transactions = []; requests = []; orphan_replies = []; rejected = Counter()
    request_counts = Counter(); response_counts = Counter(); error_response_counts = Counter()

    def boundary(reason):
        nonlocal segment
        for item in pending.values():
            item.setdefault('unmatched_reason', reason)
        pending.clear(); segment += 1

    def evidence(f):
        return {k: f[k] for k in ('boot', 'epoch', 'seq', 't_us', 'id', 'dlc', 'data')}

    for record in records:
        f = record.get('device', record) if isinstance(record, dict) else None
        if not isinstance(f, dict) or f.get('type') != 'frame':
            if isinstance(record, dict) and record.get('type') in ('gap', 'decode_error'):
                boundary(record['type']); previous = None
            continue
        if not valid_frame(f):
            rejected['invalid_frame'] += 1; boundary('invalid_frame'); previous = None; continue
        if previous is not None:
            if (f['boot'], f['epoch']) != (previous['boot'], previous['epoch']):
                boundary('scope_changed')
            elif f['seq'] != previous['seq'] + 1 or f['t_us'] < previous['t_us']:
                boundary('sequence_or_clock_discontinuity')
        previous = f
        if not f['extended'] or f['rtr']:
            continue
        src, dst, operation, obj = address(int(f['id'], 16))
        if obj not in OBJECTS:
            continue
        if dst == 4 and operation == 1 and src != 4:
            if f['dlc'] != 0:
                rejected['nonempty_request'] += 1; continue
            item = {'segment': segment, 'source': src, 'target': dst,
                    'object': f'{obj:04X}', 'request': evidence(f)}
            requests.append(item); request_counts[f['id']] += 1
            key = (src, obj)
            prior = pending.get(key)
            if prior is not None:
                lag = f['t_us'] - prior['request']['t_us']
                if lag <= MAX_REPLY_US:
                    prior.setdefault('unmatched_reason', 'ambiguous_repeated_request')
                    item['unmatched_reason'] = 'ambiguous_repeated_request'
                else:
                    prior.setdefault('unmatched_reason', 'no_reply_within_window')
            pending[key] = item
        elif src == 4 and operation in (2, 3):
            is_error = operation == 3
            (error_response_counts if is_error else response_counts)[f['id']] += 1
            expected = 4 if obj == 0x6400 else 6 if obj == 0x6401 else None
            if not is_error and (expected is not None and f['dlc'] != expected
                    or obj in CELL_OBJECTS and (f['dlc'] < 2 or f['dlc'] % 2)):
                rejected['invalid_reply_length'] += 1; continue
            item = pending.pop((dst, obj), None)
            reason = ('no_observed_request' if item is None else
                      item.get('unmatched_reason') or
                      ('no_reply_within_window' if f['t_us'] - item['request']['t_us'] > MAX_REPLY_US else None))
            if reason:
                orphan_replies.append({'segment': segment, 'reply': evidence(f), 'reason': reason,
                                       'response_type': 'error_reply' if is_error else 'normal_reply'})
                if item is not None:item.setdefault('unmatched_reason', reason)
            else:
                item['matched'] = True
                item['outcome'] = 'error_reply' if is_error else 'normal_reply'
                tx = {**item, 'reply': evidence(f),
                      'reply_delay_us': f['t_us'] - item['request']['t_us']}
                if is_error:
                    # Stop codes are independent of controller/battery fault flags.
                    # No guessed byte order or causal interpretation is applied.
                    tx['abort_data_hex'] = f['data'].upper()
                    tx['abort_code_length_valid'] = f['dlc'] == 4
                    error_transactions.append(tx)
                else:
                    if obj in (0x6416, 0x6417):
                        tx['layout_status'] = 'ambiguous_reference_assignment_raw_only'
                    transactions.append(tx)
    boundary('end_of_capture')
    for item in requests:
        if not item.get('matched'):item.setdefault('unmatched_reason', 'no_observed_reply')
    return {'requests': requests, 'transactions': transactions,
            'error_transactions': error_transactions,
            'orphan_replies': orphan_replies, 'request_counts': dict(request_counts),
            'response_counts': dict(response_counts), 'error_response_counts': dict(error_response_counts),
            'layout_conflicts': [LAYOUT_CONFLICT], 'rejected': dict(rejected),
            'coherent_cell_reads': coherent_cells(transactions)}


def coherent_cells(transactions):
    """Use a declared count and a <=100ms cohort, excluding padded slots."""
    cohorts = {}; result = []
    for tx in transactions:
        key = (tx['segment'], tx['source'], tx['request']['boot'], tx['request']['epoch'])
        obj = int(tx['object'], 16); raw = bytes.fromhex(tx['reply']['data'])
        if obj == 0x6400:
            count = raw[0]
            cohorts[key] = {'design': tx, 'count': count, 'groups': {}} if 1 <= count <= 32 else None
            continue
        c = cohorts.get(key)
        if not c or not 0x6402 <= obj <= 0x6409:
            continue
        span = tx['reply']['t_us'] - c['design']['reply']['t_us']
        if not 0 <= span <= MAX_REPLY_US:
            cohorts[key] = None; continue
        c['groups'][obj] = tx
        cells = []
        for index in range(c['count']):
            group = c['groups'].get(0x6402 + index // 4)
            data = bytes.fromhex(group['reply']['data']) if group else b''
            offset = (index % 4) * 2
            if len(data) < offset + 2:break
            cells.append(int.from_bytes(data[offset:offset + 2], 'little'))
        if len(cells) == c['count']:
            good = all(0 < v < 65535 for v in cells)
            result.append({'segment': key[0], 'requester_address': key[1],
                           'boot': key[2], 'epoch': key[3],
                           'first_seq': c['design']['request']['seq'],
                           'last_seq': tx['reply']['seq'], 'reply_span_us': span,
                           'cells_mv': cells, 'sum_mv': sum(cells) if good else None,
                           'delta_mv': max(cells) - min(cells) if good else None,
                           'design': c['design'], 'groups': list(c['groups'].values())})
            cohorts[key] = None
    return result


def main():
    import argparse, gzip, hashlib, json
    from pathlib import Path
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('captures', nargs='+', type=Path, help='Existing JSONL or gzip JSONL captures; never modified')
    args = parser.parse_args(); captures = []
    for path in args.captures:
        digest = hashlib.sha256()
        with path.open('rb') as source:
            for block in iter(lambda: source.read(65536), b''):digest.update(block)
        errors = 0
        def records():
            nonlocal errors
            with path.open('rb') as raw:
                is_gzip = raw.read(2) == b'\x1f\x8b'; raw.seek(0)
                import io
                with io.TextIOWrapper(gzip.GzipFile(fileobj=raw) if is_gzip else raw, encoding='utf-8') as stream:
                    for line in stream:
                        try:yield json.loads(line)
                        except ValueError:
                            errors += 1; yield {'type': 'decode_error'}
        result = correlate(records())
        captures.append({'input_sha256': digest.hexdigest(), 'parse_errors': errors,
                         'integrity': 'input hash only; archive receipt and wire parity not checked by this CLI', **result})
    print(json.dumps({'read_only': True, 'captures': captures,
                     'limits': ['No USB/CAN I/O. No physical transmitter attribution or physical-bus completeness claim.',
                                'Request/reply time differences use software capture timestamps, not wire timing.',
                                'Requests and responses never pair across capture files.']}, indent=2))


if __name__ == '__main__':main()
