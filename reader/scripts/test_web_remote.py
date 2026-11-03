"""Execute the actual HTTP BLE handler with controlled JSON fields and fake radio."""
from pathlib import Path
import subprocess,tempfile,os
root=Path(__file__).resolve().parents[1];s=(root/'src/web_server.c').read_text()
actual=s[s.index('static bool remote_hex('):s.index('static esp_err_t lease_handler(')]
prefix=r'''
#include <assert.h>
#include <stdio.h>
#include <stdint.h>
#include <inttypes.h>
#include <stdbool.h>
#include <string.h>
#include <stdlib.h>
typedef int esp_err_t;
#define ESP_FAIL -1
#define portENTER_CRITICAL(x) ((void)(x))
#define portEXIT_CRITICAL(x) ((void)(x))
typedef struct cJSON {int type;const char *valuestring;double valuedouble;} cJSON;
typedef struct {const char *token,*identity;} httpd_req_t;
static cJSON fields[7];static int net_lock;
static struct {char mac[18];}net={"01:23:45:67:89:ab"};
static char remote_owner[33],response[512],sent[80];static int64_t remote_until,now;static bool running=true;static unsigned calls;
static struct {char token[33];uint32_t sequence;}remote_fences[8];static unsigned remote_fence_next;
static const char *reader_boot(void){return "12345678";}
static int64_t esp_timer_get_time(void){return now;}
static bool reader_can_running(void){return running;}
static cJSON *read_body(httpd_req_t *r){(void)r;return fields;}
static cJSON *cJSON_GetObjectItemCaseSensitive(cJSON *b,const char *k){(void)b;const char *names[]={"action","boot","seq","hold","button","confirmed"};for(int i=0;i<6;i++)if(!strcmp(k,names[i]))return fields+i;return NULL;}
static bool cJSON_IsString(cJSON *v){return v&&v->type==1;}
static bool cJSON_IsNumber(cJSON *v){return v&&v->type==2;}
static bool cJSON_IsTrue(cJSON *v){return v&&v->type==3;}
static void cJSON_Delete(cJSON *b){(void)b;}
static int httpd_req_get_hdr_value_str(httpd_req_t *r,const char *name,char *out,size_t size){snprintf(out,size,"%s",strstr(name,"Session")?r->token:r->identity);return 0;}
static bool ble_remote_wifi_command(const char *cmd,char *error,size_t cap){(void)error;(void)cap;calls++;strcpy(sent,cmd);return true;}
static void httpd_resp_set_type(httpd_req_t *r,const char *v){(void)r;(void)v;}
static void httpd_resp_set_hdr(httpd_req_t *r,const char *k,const char *v){(void)r;(void)k;(void)v;}
static int httpd_resp_send(httpd_req_t *r,const char *data,int len){(void)r;assert(len<512);memcpy(response,data,len);response[len]=0;return 0;}
'''
suffix=r'''
static httpd_req_t request={"0123456789abcdef0123456789abcdef","01:23:45:67:89:ab"};
static bool run(const char *action,unsigned seq){fields[0]=(cJSON){1,action,0};fields[1]=(cJSON){1,"12345678",0};fields[2]=(cJSON){2,NULL,seq};remote_handler(&request);return strstr(response,"\"ok\":true")!=NULL;}
int main(void){
 assert(run("on",1));assert(!strcmp(sent,"REMOTE ON 0123456789abcdef"));assert(calls==1);
 request.token="abcdef0123456789abcdef0123456789";assert(!run("off",2));assert(calls==1);request.token="0123456789abcdef0123456789abcdef";
 fields[3]=(cJSON){1,"12345678",0};fields[4]=(cJSON){2,NULL,2};assert(run("down",2));assert(strstr(sent," 12345678 2 2"));
 fields[4].valuedouble=3;assert(!run("down",3));assert(calls==2);fields[5].type=3;assert(run("down",3));assert(calls==3);
 assert(!run("keep",3));assert(calls==3);assert(run("up",4));assert(run("off",5));assert(!remote_owner[0]);
 now=4000000;assert(!run("on",1));assert(calls==5);assert(run("on",6));
 request.identity="aa:bb:cc:dd:ee:ff";assert(!run("down",7));request.identity=net.mac;
 fields[3].valuestring="bad hold";assert(!run("down",7));fields[3].valuestring="12345678";
 running=false;assert(!run("down",7));assert(!run("on",7));running=true;
 assert(!run("SEND 666",7));assert(run("alive",7));
 fields[0].valuestring="down";fields[1].valuestring="87654321";fields[2].valuedouble=8;unsigned before=calls;remote_handler(&request);assert(calls==before);
 remote_sequence_save(request.token,100);assert(!run("on",9));assert(!run("down",10));
 fields[1].valuestring="12345678";fields[2].valuedouble=8.5;remote_handler(&request);assert(calls==before);
 puts("PASS actual HTTP remote: owner/MAC/boot binding, CAN prerequisite, power confirmation, hold validation, origin-only actions and delayed ON replay fence");
}
'''
with tempfile.TemporaryDirectory(prefix='reader-http-remote-') as d:
 p=Path(d);(p/'test.c').write_text(prefix+actual+suffix)
 subprocess.run([os.environ.get('CC','cc'),'-std=c11','-Wall','-Wextra','-Werror',str(p/'test.c'),'-o',str(p/'test')],check=True);subprocess.run([str(p/'test')],check=True)
