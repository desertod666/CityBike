"""Execute the real HTTP STATUS handler with mocked I/O and no heap allocation."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
source = (root / 'src/web_server.c').read_text()
handler = source.split('static esp_err_t state_handler(', 1)[1].split(
    'static esp_err_t health_handler(', 1)[0]
handler = 'static esp_err_t state_handler(' + handler
prefix = r'''
#include <assert.h>
#include <ctype.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
typedef int esp_err_t;
typedef struct { int unused; } httpd_req_t;
typedef struct { char ssid[33],saved_ssid[33],mac[18]; int channel,saved_channel,clients; } reader_network_t;
#define ESP_OK 0
#define ESP_FAIL -1
#define HTTPD_500_INTERNAL_SERVER_ERROR 500
#define READER_STATUS_SIZE 4096
#define HTTPD_RESP_USE_STRLEN -1
#define REPO "desertod666/CityBike"
#define DOWNLOAD "https://github.com/desertod666/CityBike/releases/latest/download/BafangReader-Windows-x64.zip"
#define RELEASE "https://github.com/desertod666/CityBike/releases/latest"
static char output[8192];
static size_t output_length;
static int calls,fail_call=-1,status_code;
static const char *status_value="{\"boot\":\"12345678\",\"heap_free\":4000,\"nested\":{\"value\":true}}\n";
static struct { const char *version; } description={"0.6.9"};
static void reader_status_json(char *out,size_t size){snprintf(out,size,"%s",status_value);}
static void web_network_snapshot(reader_network_t *n){
 memset(n,0,sizeof(*n));memset(n->ssid,'A',32);memset(n->saved_ssid,'B',32);
 strcpy(n->mac,"01:23:45:67:89:ab");n->channel=11;n->saved_channel=6;n->clients=3;
}
static const void *unused;
static typeof(description) *esp_app_get_description(void){return &description;}
static int httpd_resp_send_err(httpd_req_t *r,int status,const char *text){status_code=status;return -1;}
static int httpd_resp_set_type(httpd_req_t *r,const char *type){assert(strstr(type,"application/json"));return 0;}
static int httpd_resp_set_hdr(httpd_req_t *r,const char *key,const char *value){assert(!strcmp(key,"Cache-Control")&&!strcmp(value,"no-store"));return 0;}
static int httpd_resp_send_chunk(httpd_req_t *r,const char *data,int length){
 if(calls++==fail_call)return 77;
 if(!data){assert(length==0);return 0;}
 if(length==HTTPD_RESP_USE_STRLEN)length=strlen(data);
 assert(length>=0&&output_length+(size_t)length<sizeof(output));
 memcpy(output+output_length,data,length);output_length+=length;output[output_length]=0;return 0;
}
'''
suffix = r'''
int main(int argc,char **argv){
 httpd_req_t request={0};int mode=argc>1?atoi(argv[1]):0;
 if(mode>=1&&mode<=4)fail_call=mode-1;
 if(mode==5)status_value="{\"broken\":";
 char version[1500];if(mode==6){memset(version,'V',1499);version[1499]=0;description.version=version;}
 int result=state_handler(&request);
 if(mode==0){assert(!result&&calls==4&&!status_code);puts(output);}
 else if(mode<=4){assert(result==77&&calls==mode);}
 else if(mode==5){assert(result==-1&&status_code==500&&calls==0);}
 else {assert(result==-1&&!status_code&&calls==2);}
}
'''
compiler = os.environ.get('CC') or shutil.which('cc')
assert compiler
with tempfile.TemporaryDirectory(prefix='reader-status-') as temporary:
    path = Path(temporary)
    (path / 'status.c').write_text(prefix + handler + suffix)
    subprocess.run([compiler, '-std=gnu11', '-Wall', '-Wextra', '-Werror',
                    '-Wno-unused-parameter', '-Wno-unused-variable',
                    str(path / 'status.c'), '-o', str(path / 'status')], check=True)
    for mode in range(7):
        result = subprocess.run([str(path / 'status'), str(mode)],
                                capture_output=True, text=True, check=True)
        if mode == 0:
            data = json.loads(result.stdout)
            assert data['device']['nested'] == {'value': True}
            assert data['network']['ssid'] == 'A' * 32
            assert data['network']['saved_ssid'] == 'B' * 32
            assert data['network']['clients'] == 3
            assert data['connection'] == {'transport': 'wifi', 'connected': True}
            assert data['app']['version'] == '0.6.9'
            assert data['app']['desktop'] is False
print('PASS real HTTP state handler: JSON parity, 32-byte SSIDs, send failures, invalid status and metadata overflow')
