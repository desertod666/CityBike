"""Offline Spard identity encoding; no USB/CAN or live write integration.

Static evidence: supplied PC CheckIntoQueue004143E4 builds opcode31 with a
72-byte frame, two reserved zero bytes and two32-byte slots. SocCalcXor0057D540
XORs bytes0..69. Supplied BMS2.4 handler08006078 copies bytes6..69 and its
080060C0 path calls the persistent writer with destination0800F800.
This establishes a format for this image, not acceptance by a live battery.
"""
from functools import reduce
from hashlib import sha256
from operator import xor

from spard_service import decode


def _slot(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError('Identity must be a nonempty printable ASCII string')
    try:
        raw = value.encode('ascii')
    except UnicodeEncodeError as error:
        raise ValueError('Identity must be printable ASCII') from error
    if not 1 <= len(raw) <= 32 or any(b < 32 or b > 126 for b in raw):
        raise ValueError('Identity must contain 1..32 printable ASCII bytes')
    return raw.ljust(32, b'\0')


def _request(identity):
    assert len(identity) == 64
    body = bytes((0x68, 72, 72 ^ 255, 0x31, 0, 0)) + identity
    return body + bytes((reduce(xor, body, 0), 0x16))


def plan_identity_change(baseline_reply, *, normal_service_context=False,
                         serial_number=None, model=None):
    """Preview a change relative to an independently identified normal30 reply.

    Untouched slots retain all32 original bytes, including unknown encodings.
    A generated packet must never be treated as a successful write or as an
    authorization to transmit. Freshness, target binding, device permissions,
    transport, acknowledgement and readback verification belong to integration.
    """
    decoded = decode(baseline_reply, normal_service_context=normal_service_context,
                     expected_command=0x30)
    if decoded['status'] != 'decoded' or decoded.get('kind') != 'identity':
        raise ValueError('A validated normal-service Identity30 baseline is required')
    raw = bytes(baseline_reply)
    if raw[4:6] != b'\0\0':
        raise ValueError('Unknown reserved identity bytes; do not construct a write')
    before = raw[6:70]
    after = bytearray(before)
    changes = []
    for name, start, value in (('serial_number', 0, serial_number), ('model', 32, model)):
        if value is None:
            continue
        replacement = _slot(value)
        old = before[start:start + 32]
        if replacement == old:
            continue
        after[start:start + 32] = replacement
        changes.append(dict(field=name, before_hex=old.hex().upper(), after_hex=replacement.hex().upper()))
    if not changes:
        raise ValueError('No identity change requested')
    return dict(schema=1, kind='spard_identity_change_plan',
                baseline_sha256=sha256(raw).hexdigest(), baseline_reply_hex=raw.hex().upper(),
                request_hex=_request(bytes(after)).hex().upper(),
                restoration_request_hex=_request(before).hex().upper(), changes=changes,
                transport='none', live_write_verified=False, restoration_verified=False,
                evidence='supplied_PC004143E4_0057D540_and_BMS2.4_08006078_080060C0_static_only')


def compare_identity_readback(baseline_reply, readback_reply, *,
                              normal_service_context=False,
                              serial_number=None, model=None):
    """Compare a normal30 reply with an independently prepared identity change.

    No acknowledgement or write opcode can substitute for this reply. Matching
    bytes establish only the contents of this supplied response, not the sender,
    freshness, a successful write, or persistence after a battery power cycle.
    The caller must establish those properties separately during integration.
    """
    plan = plan_identity_change(
        baseline_reply, normal_service_context=normal_service_context,
        serial_number=serial_number, model=model)
    decoded = decode(readback_reply, normal_service_context=normal_service_context,
                     expected_command=0x30)
    if decoded['status'] != 'decoded' or decoded.get('kind') != 'identity':
        raise ValueError('A validated normal-service Identity30 readback is required')
    observed = bytes(readback_reply)
    if observed[4:6] != b'\0\0':
        raise ValueError('Unknown reserved identity bytes in readback')
    baseline = bytes(baseline_reply)
    expected = bytes.fromhex(plan['request_hex'])
    fields = {}
    changed_fields = {change['field'] for change in plan['changes']}
    for name, start in (('serial_number', 6), ('model', 38)):
        before = baseline[start:start + 32]
        wanted = expected[start:start + 32]
        actual = observed[start:start + 32]
        fields[name] = dict(
            requested_change=name in changed_fields,
            matches_expected=actual == wanted, matches_baseline=actual == before,
            baseline_hex=before.hex().upper(), expected_hex=wanted.hex().upper(),
            observed_hex=actual.hex().upper())
    matches_expected = all(field['matches_expected'] for field in fields.values())
    matches_baseline = all(field['matches_baseline'] for field in fields.values())
    state = ('matches_expected' if matches_expected else
             'matches_baseline' if matches_baseline else 'different_identity')
    return dict(
        schema=1, kind='spard_identity_readback_comparison', state=state,
        matches_expected=matches_expected, matches_baseline=matches_baseline,
        baseline_sha256=plan['baseline_sha256'],
        expected_request_sha256=sha256(expected).hexdigest(),
        readback_sha256=sha256(observed).hexdigest(), fields=fields,
        transport='none', live_write_verified=False,
        persistence_verified=False, restoration_verified=False,
        limitations=['Comparison of supplied packets only; sender and freshness are not established.',
                     'Matching identity does not verify other battery parameters or persistent storage.'])
