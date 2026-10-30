/* Peripheral emulation of the owner-captured Citybike Tester. Never transmits CAN. */
#include <stdio.h>
#include <stdlib.h>
#include <inttypes.h>
#include <ctype.h>
#include <string.h>
#include "ble_remote.h"
#include "remote_policy.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "esp_timer.h"
#include "esp_heap_caps.h"
#include "driver/usb_serial_jtag.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

static const ble_uuid128_t service_uuid=BLE_UUID128_INIT(0x60,0xfc,0x06,0x30,0xe5,0xa5,0x93,0xb5,0x2d,0x49,0xe2,0x30,0x00,0x99,0x07,0x70);
static const ble_uuid128_t key_uuid=BLE_UUID128_INIT(0x60,0xfc,0x06,0x30,0xe5,0xa5,0x93,0xb5,0x2d,0x49,0xe2,0x30,0x01,0x99,0x07,0x70);
static remote_policy_t state;
static remote_policy_t published;
static portMUX_TYPE snapshot_lock=portMUX_INITIALIZER_UNLOCKED;
static uint16_t connection=BLE_HS_CONN_HANDLE_NONE,value_handle;
static uint8_t addr_type;
static bool ready,started,advertising;
static bool published_ready,published_advertising;
static int init_error;
static unsigned connect_events,disconnect_events,subscribe_events;
static uint16_t subscribed_connection=BLE_HS_CONN_HANDLE_NONE;
static int last_gap_event=-1,adv_stage;
static size_t init_free,init_largest,failed_allocation;
static void allocation_failed(size_t requested,uint32_t caps,const char *function){failed_allocation=requested;}
static int64_t session_deadline;
extern void reader_remote_notification(unsigned button,unsigned pressed,int error,int64_t t_us);
static struct ble_npl_callout watchdog;
static struct ble_npl_event command_event;
static SemaphoreHandle_t command_mutex,completed;
static char pending[80];
static int command_result;
static int64_t command_expires;
static volatile bool command_pending;
static int gap_event(struct ble_gap_event *event,void *arg);
static void publish(void){portENTER_CRITICAL(&snapshot_lock);published=state;published_ready=ready;published_advertising=advertising;portEXIT_CRITICAL(&snapshot_lock);}
static int send_key(uint8_t button,uint8_t pressed,void *unused){
 if(connection==BLE_HS_CONN_HANDLE_NONE||!state.subscribed)return BLE_HS_ENOTCONN;
 uint8_t bytes[2]={button,pressed};struct os_mbuf *packet=ble_hs_mbuf_from_flat(bytes,2);
 int64_t at=esp_timer_get_time();
 int rc=packet?ble_gatts_notify_custom(connection,value_handle,packet):BLE_HS_ENOMEM;
 reader_remote_notification(button,pressed,rc,at);
 if(rc&&!pressed)ble_gap_terminate(connection,BLE_ERR_REM_USER_CONN_TERM);
 return rc;
}
static void reconcile_link(void){
 if(connection!=BLE_HS_CONN_HANDLE_NONE&&ble_gap_conn_find(connection,NULL)==0){state.connected=true;state.subscribed=subscribed_connection==connection;}
 else{connection=BLE_HS_CONN_HANDLE_NONE;subscribed_connection=BLE_HS_CONN_HANDLE_NONE;state.connected=false;state.subscribed=false;}
}
static void advertise(void){
 reconcile_link();
 if(!ready||!state.enabled||connection!=BLE_HS_CONN_HANDLE_NONE)return;
 struct ble_hs_adv_fields fields={0},response={0};
 fields.flags=BLE_HS_ADV_F_DISC_GEN|BLE_HS_ADV_F_BREDR_UNSUP;
 fields.uuids128=(ble_uuid128_t*)&service_uuid;fields.num_uuids128=1;fields.uuids128_is_complete=1;
 response.name=(uint8_t*)"Citybike Tester";response.name_len=15;response.name_is_complete=1;
 adv_stage=1;int rc=ble_gap_adv_set_fields(&fields);if(!rc){adv_stage=2;rc=ble_gap_adv_rsp_set_fields(&response);}
 struct ble_gap_adv_params params={0};params.conn_mode=BLE_GAP_CONN_MODE_UND;params.disc_mode=BLE_GAP_DISC_MODE_GEN;params.itvl_min=160;params.itvl_max=240;
 if(!rc){adv_stage=3;rc=ble_gap_adv_start(addr_type,NULL,BLE_HS_FOREVER,&params,gap_event,NULL);}if(!rc)adv_stage=0;
 state.last_error=rc;advertising=rc==0;publish();
}
static int gap_event(struct ble_gap_event *event,void *arg){
 last_gap_event=event->type;
 switch(event->type){
 case BLE_GAP_EVENT_CONNECT:
  connect_events++;advertising=false;if(event->connect.status==0){connection=event->connect.conn_handle;subscribed_connection=BLE_HS_CONN_HANDLE_NONE;state.connected=true;state.subscribed=false;if(!state.enabled)ble_gap_terminate(connection,BLE_ERR_REM_USER_CONN_TERM);}else advertise();break;
 case BLE_GAP_EVENT_DISCONNECT:
  disconnect_events++;if(connection==event->disconnect.conn.conn_handle){remote_release(&state,send_key,NULL);connection=BLE_HS_CONN_HANDLE_NONE;subscribed_connection=BLE_HS_CONN_HANDLE_NONE;state.connected=false;state.subscribed=false;}advertise();break;
 case BLE_GAP_EVENT_SUBSCRIBE:
  subscribe_events++;if(event->subscribe.attr_handle==value_handle&&ble_gap_conn_find(event->subscribe.conn_handle,NULL)==0){
   connection=event->subscribe.conn_handle;state.connected=true;
   if(!event->subscribe.cur_notify)remote_release(&state,send_key,NULL);
   subscribed_connection=event->subscribe.cur_notify?connection:BLE_HS_CONN_HANDLE_NONE;state.subscribed=event->subscribe.cur_notify!=0;
   if(!state.enabled){ble_gap_terminate(connection,BLE_ERR_REM_USER_CONN_TERM);break;}
   if(state.subscribed){int rc=send_key(0,0,NULL);state.last_error=rc;if(!rc)state.notifications++;}
  }break;
 case BLE_GAP_EVENT_NOTIFY_TX:
  if(event->notify_tx.conn_handle==connection&&event->notify_tx.status!=0){state.last_error=event->notify_tx.status;remote_release(&state,send_key,NULL);if(connection!=BLE_HS_CONN_HANDLE_NONE)ble_gap_terminate(connection,BLE_ERR_REM_USER_CONN_TERM);}break;
 case BLE_GAP_EVENT_ADV_COMPLETE:advertising=false;advertise();break;
 default:break;
 }
 publish();return 0;
}
static int access_key(uint16_t conn,uint16_t attr,struct ble_gatt_access_ctxt *ctxt,void *arg){return BLE_ATT_ERR_READ_NOT_PERMITTED;}
static const struct ble_gatt_svc_def services[]={
 {.type=BLE_GATT_SVC_TYPE_PRIMARY,.uuid=&service_uuid.u,.characteristics=(struct ble_gatt_chr_def[]){
 {.uuid=&key_uuid.u,.access_cb=access_key,.flags=BLE_GATT_CHR_F_NOTIFY,.val_handle=&value_handle},{0}}},{0}};
static void tick(struct ble_npl_event *event){reconcile_link();int64_t now=esp_timer_get_time();remote_expire(&state,now,send_key,NULL);if(state.enabled&&(now>=session_deadline||!usb_serial_jtag_is_connected())){remote_release(&state,send_key,NULL);state.enabled=false;if(ble_gap_adv_active()){ble_gap_adv_stop();}
  advertising=false;if(connection!=BLE_HS_CONN_HANDLE_NONE)ble_gap_terminate(connection,BLE_ERR_REM_USER_CONN_TERM);}publish();ble_npl_callout_reset(&watchdog,ble_npl_time_ms_to_ticks32(50));}
static bool hex_text(const char *s,size_t len){if(strlen(s)!=len)return false;for(size_t i=0;i<len;i++)if(!isxdigit((unsigned char)s[i]))return false;return true;}
static void execute(struct ble_npl_event *event){
 command_result=-10;
 if(esp_timer_get_time()>command_expires)goto done;
 if(!strcmp(pending,"REMOTE OFF")){
  remote_release(&state,send_key,NULL);state.enabled=false;
  if(ble_gap_adv_active()){ble_gap_adv_stop();}
  advertising=false;
  if(connection!=BLE_HS_CONN_HANDLE_NONE)ble_gap_terminate(connection,BLE_ERR_REM_USER_CONN_TERM);
  command_result=0;goto done;
 }
 char session[17]={0},hold[9]={0},extra;unsigned seq=0,button=0;int n=0;
 if(sscanf(pending,"REMOTE ON %16s %c",session,&extra)==1&&hex_text(session,16)){
  if(state.enabled&&strcmp(state.session,session)){command_result=-11;goto done;}
  session_deadline=esp_timer_get_time()+3000000;
  if(!state.enabled){reconcile_link();bool linked=state.connected,subscribed=state.subscribed;memset(&state,0,sizeof(state));state.connected=linked;state.subscribed=subscribed;state.enabled=true;strcpy(state.session,session);advertise();}
  command_result=state.last_error;goto done;
 }
 if(sscanf(pending,"REMOTE DOWN %16s %8s %u %u %n",session,hold,&seq,&button,&n)==4&&n>0&&!pending[n]){
  if(hex_text(session,16)&&hex_text(hold,8)&&seq>0)command_result=remote_key(&state,session,hold,seq,button,1,esp_timer_get_time(),send_key,NULL);
  goto done;
 }
 n=0;
 if(sscanf(pending,"REMOTE ALIVE %16s %u %n",session,&seq,&n)==2&&n>0&&!pending[n]){if(state.enabled&&!strcmp(state.session,session)&&seq>state.sequence){state.sequence=seq;session_deadline=esp_timer_get_time()+3000000;command_result=0;}goto done;}
 n=0;
 if(sscanf(pending,"REMOTE KEEP %16s %8s %u %n",session,hold,&seq,&n)==3&&n>0&&!pending[n]){
  if(hex_text(session,16)&&hex_text(hold,8)&&seq>0)command_result=remote_key(&state,session,hold,seq,0,2,esp_timer_get_time(),send_key,NULL);
  goto done;
 }
 n=0;
 if(sscanf(pending,"REMOTE UP %16s %8s %u %n",session,hold,&seq,&n)==3&&n>0&&!pending[n]){
  if(hex_text(session,16)&&hex_text(hold,8)&&seq>0)command_result=remote_key(&state,session,hold,seq,0,0,esp_timer_get_time(),send_key,NULL);
 }
 done:publish();command_pending=false;xSemaphoreGive(completed);
}
static void on_sync(void){int rc=ble_hs_util_ensure_addr(0);if(!rc)rc=ble_hs_id_infer_auto(0,&addr_type);state.last_error=rc;ready=rc==0;publish();}
static void on_reset(int reason){ready=false;advertising=false;state.enabled=false;state.button=0;state.connected=false;state.subscribed=false;state.last_error=reason;connection=BLE_HS_CONN_HANDLE_NONE;publish();}
static void host_task(void *arg){nimble_port_run();nimble_port_freertos_deinit();}
esp_err_t ble_remote_init(void){
 command_mutex=xSemaphoreCreateMutex();completed=xSemaphoreCreateBinary();if(!command_mutex||!completed){init_error=ESP_ERR_NO_MEM;return ESP_ERR_NO_MEM;}
 init_free=esp_get_free_heap_size();init_largest=heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT);
 heap_caps_register_failed_alloc_callback(allocation_failed);
 int rc=nimble_port_init();if(rc){init_error=rc;return rc;}
 ble_hs_cfg.sync_cb=on_sync;ble_hs_cfg.reset_cb=on_reset;ble_hs_cfg.sm_bonding=0;ble_hs_cfg.sm_mitm=0;ble_hs_cfg.sm_sc=0;
 ble_svc_gap_init();ble_svc_gatt_init();rc=ble_svc_gap_device_name_set("Citybike Tester");if(!rc)rc=ble_gatts_count_cfg(services);if(!rc)rc=ble_gatts_add_svcs(services);if(rc){init_error=rc;nimble_port_deinit();return ESP_FAIL;}
 ble_npl_event_init(&command_event,execute,NULL);ble_npl_callout_init(&watchdog,nimble_port_get_dflt_eventq(),tick,NULL);ble_npl_callout_reset(&watchdog,ble_npl_time_ms_to_ticks32(50));
 started=true;nimble_port_freertos_init(host_task);return ESP_OK;
}
bool ble_remote_command(const char *cmd,char *error,size_t capacity){
 if(!started||!published_ready){snprintf(error,capacity,"BLE not ready (%d)",init_error);return false;}
 if(xSemaphoreTake(command_mutex,pdMS_TO_TICKS(20))!=pdTRUE){snprintf(error,capacity,"BLE command busy");return false;}
 bool ok=false;
 if(command_pending){snprintf(error,capacity,"Previous BLE command pending");goto done;}
 xSemaphoreTake(completed,0);snprintf(pending,sizeof(pending),"%s",cmd);command_expires=esp_timer_get_time()+500000;command_pending=true;
 ble_npl_eventq_put(nimble_port_get_dflt_eventq(),&command_event);
 if(xSemaphoreTake(completed,pdMS_TO_TICKS(600))!=pdTRUE){snprintf(error,capacity,"BLE command timeout");goto done;}
 ok=command_result==0;if(!ok)snprintf(error,capacity,"BLE command rejected (%d)",command_result);
 done:xSemaphoreGive(command_mutex);return ok;
}
bool ble_remote_enabled(void){portENTER_CRITICAL(&snapshot_lock);bool value=published.enabled;portEXIT_CRITICAL(&snapshot_lock);return value;}
size_t ble_remote_json(char *buffer,size_t capacity){
 portENTER_CRITICAL(&snapshot_lock);remote_policy_t s=published;bool r=published_ready,a=published_advertising;portEXIT_CRITICAL(&snapshot_lock);
 int n=snprintf(buffer,capacity,"{\"ready\":%s,\"enabled\":%s,\"advertising\":%s,\"connected\":%s,\"subscribed\":%s,\"session\":\"%s\",\"button\":%u,\"sequence\":%" PRIu32 ",\"notifications\":%" PRIu32 ",\"releases\":%" PRIu32 ",\"last_error\":%d,\"lease_ms\":1200,\"max_hold_ms\":30000,\"init_heap_free\":%u,\"init_largest_block\":%u,\"failed_allocation\":%u,\"connection_handle\":%u,\"subscribed_handle\":%u,\"connect_events\":%u,\"disconnect_events\":%u,\"subscribe_events\":%u,\"last_gap_event\":%d,\"adv_error_stage\":%d}",r?"true":"false",s.enabled?"true":"false",a?"true":"false",s.connected?"true":"false",s.subscribed?"true":"false",s.session,s.button,s.sequence,s.notifications,s.releases,init_error?init_error:s.last_error,(unsigned)init_free,(unsigned)init_largest,(unsigned)failed_allocation,(unsigned)connection,(unsigned)subscribed_connection,connect_events,disconnect_events,subscribe_events,last_gap_event,adv_stage);
 return n<0?capacity:(size_t)n;
}
