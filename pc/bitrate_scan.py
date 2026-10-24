"""Finite listen-only bitrate search. Silence is never a successful detection."""
import time

SCAN_RATES = (250000, 500000, 125000, 1000000, 100000, 50000, 20000, 10000, 800000)


def scan(command, cancelled, progress, wait=time.sleep, sample_seconds=1.5):
    results = []
    try:
        command('STOP')
        for rate in SCAN_RATES:
            if cancelled():
                break
            progress(dict(active=True, bitrate=rate, results=list(results), selected=None))
            initial = command('START ' + str(rate))
            # Receive and CRC validation are performed by the CAN controller.
            for _ in range(max(1, int(sample_seconds / .1))):
                if cancelled():
                    break
                wait(.1)
            final = command('STATUS')
            received = max(0, final['received'] - initial['received'])
            errors = sum(max(0, final.get(k, 0) - initial.get(k, 0)) for k in ('bus_errors', 'rx_missed', 'rx_overrun'))
            results.append(dict(bitrate=rate, frames=received, errors=errors, candidate=received >= 5 and errors == 0))
            command('STOP')
        candidates = [row['bitrate'] for row in results if row['candidate']]
        selected = candidates[0] if len(candidates) == 1 and not cancelled() else None
        result = dict(active=False, results=results, selected=selected, cancelled=cancelled(),
                      message='Найдена скорость по корректным кадрам; проверьте устойчивость приёма' if selected else
                      'Поиск отменён' if cancelled() else 'Надёжно определить скорость не удалось: проверьте активность шины и проводку')
        progress(result)
        return result
    finally:
        command('STOP')
