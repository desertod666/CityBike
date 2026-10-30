"""Run offline C firmware tests using a host C compiler; never opens USB or CAN."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
compiler = os.environ.get("CC") or next((x for x in ("cc", "gcc", "clang") if shutil.which(x)), None)
if not compiler:
    raise SystemExit("A host C compiler is required for offline firmware tests.")

with tempfile.TemporaryDirectory(prefix="reader-native-") as temporary:
    for name in ("remote_policy", "ecc_observer", "command_protocol", "tx_trace", "tx_policy", "ctx_guard", "rx_readback", "firmware_lifecycle", "fixed_receive", "battery_query", "selftest", "quiet_query", "rmt_trace"):
        output = Path(temporary) / (name + (".exe" if os.name == "nt" else ""))
        args = [compiler, "-std=c11", "-Wall", "-Wextra", "-Werror"]
        if name == "ecc_observer":
            args += ["-I" + str(ROOT / "scripts/ecc-stubs")]
        if name == "ctx_guard":
            args += ["-I" + str(ROOT / "scripts/ctx-guard-stubs")]
        if name in ("rx_readback", "firmware_lifecycle", "fixed_receive", "battery_query", "selftest", "quiet_query", "rmt_trace"):
            args += ["-Wno-unused-function", "-Wno-unused-parameter", "-Wno-sign-compare", "-I" + str(ROOT / "scripts/firmware-stubs")]
        if name in ("firmware_lifecycle", "fixed_receive", "battery_query", "selftest", "quiet_query", "rmt_trace"):
            args += [str(ROOT / "scripts" / "host_ble_stub.c")]
        subprocess.run(args + [str(ROOT / "scripts" / ("test_" + name + ".c")), "-o", str(output)], check=True)
        environment = dict(os.environ, READER_TEST_WIRE="1")
        result = subprocess.run([str(output)], check=True, text=True, capture_output=True, env=environment)
        for line in result.stdout.splitlines():
            if line.startswith("{"):
                message = json.loads(line)
                if message["type"] == "stream_end":
                    assert message["final_seq"] == message["status"]["received"] == 3
                    assert message["status"]["can"] == "stopped"
                if message["type"] == "command_result":
                    assert isinstance(message["status"], dict)
                if message["type"] == "reader_selftest_result":
                    assert len(line)<3900 and message["state"]=="complete"
                    assert message['gpio_probe']['passed']
                    assert message['gpio_probe']['tx']==message['gpio_probe']['rx']==[1,0,1]
                    assert message["ctx_restored"] and not message["driver_retained"]
                    assert [(x["tx_gpio"],x["rx_gpio"]) for x in message["stages"]]==[(10,10),(4,4),(4,5)]
                    assert all(x["passed"] and x["attempted"]==1 for x in message["stages"])
                if message["type"] == "battery_tx_diagnostic":
                    assert len(line)<4000 and message['status_valid'] is True
                    assert message['reason']=='transmit_completed'
                    assert len(message['gpio_trace']['edges'])<=64
                    assert message['gpio_trace']['samples']<=4096
                if message["type"] == "battery_bus_error_detail":
                    assert len(line)<1450
                    assert message['capture']['source']=='single_HAL_ECC_read'
                    assert len(message['capture']['events'])<=8
                if message["type"] == "battery_hardware_check":
                    assert len(line)<2048
                    assert message['expected_mode']=='normal'
                    assert message['hardware']['mismatch_bits']==0
                if message["type"] == "readback_test":
                    hw = message["hardware_readback"]
                    assert hw["source"] == "can_owner_snapshot"
                    if message["case"] == "nominal":
                        assert hw["mismatch_bits"] == 0 and hw["bitrate"] == 250000
                    if message["case"] == "clock_mismatch":
                        assert hw["mismatch_bits"] == 12 and hw["bitrate"] == 125000
                    if message["case"] == "unstable":
                        assert not hw["registers_stable"] and hw["mismatch_bits"] & 2
                    if message["case"] == "not_installed":
                        assert not hw["registers_read"] and not hw["config_checked"]
            elif line:
                print(line)
print("PASS firmware native suite: all emitted sample JSON parses, STOP status and final_seq agree")
