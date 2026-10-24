"""Non-opening upload port guard. Other serial devices must never be probed."""
import sys
from collector import select_port

try:
    p = select_port(sys.argv[1])
    if (p.vid, p.pid) != (0x303A, 0x1001):
        raise ValueError('Only native Espressif USB Serial/JTAG 303A:1001 accepted')
    print(f'Explicit target {p.device}: {p.hwid}')
except (IndexError, ValueError) as e:
    print(e, file=sys.stderr)
    raise SystemExit(1)
