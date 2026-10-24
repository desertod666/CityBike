"""Bench test ONLY with bicycle CAN disconnected. Explicit port required."""
import argparse
from datetime import datetime
import json
from pathlib import Path
import time
from collector import Capture, select_port, open_port, send, wait_status


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port', required=True)
    p.add_argument('--exercise-can', action='store_true', help='only when CAN disconnected; start/stop TWAI at 125000')
    args = p.parse_args()
    port = select_port(args.port)
    if (port.vid, port.pid) != (0x303A, 0x1001):
        raise ValueError('Only native Espressif USB permitted')
    folder = Path(__file__).resolve().parents[1] / 'logs' / ('usb-smoke-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
    cap = Capture(folder)
    s = open_port(port.device)
    identified = False
    try:
        cap.new_session(reason='usb_smoke', port=port.device, hwid=port.hwid)
        send(s, cap, 'STATUS')
        initial = wait_status(s, cap)
        identified = True
        assert initial['can'] == 'stopped', initial
        assert initial['mode'] == 'listen_only'
        assert initial['bitrate'] == 0
        boot = initial['boot']
        print('Initial STATUS:', json.dumps(initial))
        send(s, cap, 'HELP')
        deadline = time.monotonic() + 1
        got_help = False
        while time.monotonic() < deadline:
            for msg in cap.feed(s.read(max(1, s.in_waiting))):
                if msg and msg.get('type') == 'help':
                    got_help = True
        assert got_help
        send(s, cap, 'START 123456')
        deadline = time.monotonic() + 1
        rejected = False
        while time.monotonic() < deadline:
            for msg in cap.feed(s.read(max(1, s.in_waiting))):
                if msg and msg.get('type') == 'error':
                    rejected = True
        assert rejected
        send(s, cap, 'STATUS')
        assert wait_status(s, cap)['can'] == 'stopped'
        if args.exercise_can:
            cap.event('mark', action='Bench only, bicycle disconnected, TWAI lifecycle 125000; not a bus bitrate finding')
            send(s, cap, 'START 125000')
            running = wait_status(s, cap)
            assert running['can'] == 'running' and running['mode'] == 'listen_only' and running['bitrate'] == 125000
            time.sleep(0.5)
            send(s, cap, 'STOP')
            assert wait_status(s, cap, stopped=True)['can'] == 'stopped'
        # Fill reply queues/TX while intentionally not reading. No CAN traffic is generated.
        for _ in range(8):
            s.write(b'STATUS\n' * 8)
            time.sleep(0.1)
        time.sleep(1)
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            cap.feed(s.read(max(1, min(s.in_waiting, 8192))))
        send(s, cap, 'STATUS')
        resumed = wait_status(s, cap)
        assert resumed['boot'] == boot, 'Unexpected reset during stalled USB reader'
        assert resumed['uptime_us'] > initial['uptime_us']
        assert resumed['can'] == 'stopped'
        print('After slow-reader test:', json.dumps(resumed))
        s.close()
        cap.event('serial_closed', reason='logical COM close only, not physical USB removal')
        time.sleep(1)
        s = open_port(port.device)
        cap.new_session(reason='logical_serial_reopen', port=port.device)
        send(s, cap, 'STATUS')
        reopened = wait_status(s, cap)
        assert reopened['boot'] == boot
        assert reopened['can'] == 'stopped'
        cap.event('smoke_pass', initial=initial, after_slow_reader=resumed, after_reopen=reopened)
        print('PASS; evidence:', folder)
    finally:
        if s.is_open and identified:
            send(s, cap, 'STOP')
            wait_status(s, cap, stopped=True)
        s.close()
        cap.close()


if __name__ == '__main__':
    main()
