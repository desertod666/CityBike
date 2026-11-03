"""Run the actual NimBLE command/timeout policy with a fake radio and USB state."""
from pathlib import Path
import subprocess,tempfile,os
root=Path(__file__).resolve().parents[1]
s=(root/'src/ble_remote.c').read_text();actual=s[s.index('static void tick('):s.index('static void on_sync(')]
prefix=r'''
#include <assert.h>
#include <stdio.h>
#include <stdbool.h>
#include <stdint.h>
#include <ctype.h>
#include <string.h>
#include "remote_policy.h"
struct ble_npl_event {int unused;};
static remote_policy_t state;
static bool session_requires_usb=true,pending_requires_usb=true,advertising,command_pending,usb;
static int64_t session_deadline,command_expires,now;
static int command_result,completed,watchdog,connection;
static unsigned sends,usb_reads;
static char pending[80];
#define BLE_HS_CONN_HANDLE_NONE 65535
#define BLE_ERR_REM_USER_CONN_TERM 1
static int64_t esp_timer_get_time(void){return now;}
static bool usb_serial_jtag_is_connected(void){usb_reads++;return usb;}
static void reconcile_link(void){}
static void publish(void){}
static int send_key(uint8_t button,uint8_t pressed,void *ctx){(void)button;(void)pressed;(void)ctx;sends++;return 0;}
static bool ble_gap_adv_active(void){return advertising;}
static void ble_gap_adv_stop(void){advertising=false;}
static void ble_gap_terminate(int conn,int reason){(void)conn;(void)reason;}
static void advertise(void){advertising=true;}
static void ble_npl_callout_reset(int *p,int n){(void)p;(void)n;}
static int ble_npl_time_ms_to_ticks32(int n){return n;}
static void xSemaphoreGive(int p){(void)p;}
'''
suffix=r'''
static int command(const char *text,bool from_usb){strcpy(pending,text);pending_requires_usb=from_usb;command_expires=now+500000;execute(NULL);return command_result;}
int main(void){
 connection=BLE_HS_CONN_HANDLE_NONE;usb=false;
 assert(!command("REMOTE ON 0123456789abcdef",false));tick(NULL);assert(state.enabled&&!session_requires_usb&&!usb_reads);
 state.connected=state.subscribed=true;
 assert(!command("REMOTE DOWN 0123456789abcdef 12345678 1 2",false));assert(state.button==2&&sends==1);
 assert(command("REMOTE OFF",true)==-12);assert(state.enabled&&state.button==2&&sends==1);
 assert(command("REMOTE ON fedcba9876543210",false)==-11);
 now=500000;assert(!command("REMOTE KEEP 0123456789abcdef 12345678 2",false));
 now=1800000;tick(NULL);assert(!state.button&&sends==2&&state.enabled);
 assert(command("REMOTE KEEP 0123456789abcdef 12345678 3",false)<0);assert(!state.button);
 now=3000000;tick(NULL);assert(!state.enabled&&!advertising);
 usb=true;assert(!command("REMOTE ON 0123456789abcdef",true));assert(session_requires_usb);
 assert(command("REMOTE OFF",false)==-12);assert(state.enabled);
 usb=false;tick(NULL);assert(!state.enabled&&usb_reads);
 now=4000000;assert(!command("REMOTE ON fedcba9876543210",false));
 now=7000000;tick(NULL);assert(!state.enabled);
 puts("PASS actual BLE policy: Wi-Fi without USB, origin isolation, release timeout, no replay, USB detach and 3s session expiry");
}
'''
with tempfile.TemporaryDirectory(prefix='reader-wifi-ble-') as d:
 p=Path(d);(p/'test.c').write_text(prefix+actual+suffix)
 subprocess.run([os.environ.get('CC','cc'),'-std=c11','-Wall','-Wextra','-Werror','-Wno-unused-parameter','-I'+str(root/'src'),str(p/'test.c'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
