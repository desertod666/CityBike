"""Device-free site/server regressions. No production or owner files required."""
import argparse,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
JS=('esp_remote','monitor','capture_context','cell_freshness','auto_update_hold','update_resume','service_worker_update','capture_lifecycle','fixed_receive','support_permissions','can_live','web','reader_selftest','spard_probe','spard_probe_lifecycle','spard_service','spard_service_reads','stock_bridge')
PY=('handset','remote_operator','remote_operator_http','can_live','battery_information','ble_status','operator_rate_limit','can_error_detail','reader_selftest','spard_service','spard_identity_plan','spard_identity_parity','stock_bridge')
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--browser',action='store_true');args=parser.parse_args()
    for name in JS:subprocess.run(['node',str(ROOT/'scripts'/('test_'+name+'.cjs'))],cwd=ROOT,check=True)
    subprocess.run([sys.executable,'-m','unittest',*('pc.test_'+name for name in PY)],cwd=ROOT,check=True)
    subprocess.run([sys.executable,'scripts/sync_reader_web.py','--check'],cwd=ROOT,check=True)
    subprocess.run([sys.executable,'reader/scripts/verify_ci.py','--source-only'],cwd=ROOT,check=True)
    if args.browser:
        for name in ('auto_update','spard_service'):
            subprocess.run(['node',f'scripts/test_{name}_browser.cjs'],cwd=ROOT,check=True)
if __name__=='__main__':main()
