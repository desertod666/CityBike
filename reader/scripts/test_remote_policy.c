#include <assert.h>
#include <stdio.h>
#include "../src/remote_policy.h"
static unsigned count;static uint8_t last_button,last_state;static int fail;
static int send(uint8_t b,uint8_t p,void *c){(void)c;count++;last_button=b;last_state=p;return fail;}
int main(void){
 remote_policy_t s={0};strcpy(s.session,"0123456789abcdef");
 assert(remote_key(&s,s.session,"12345678",1,2,1,0,send,0)<0);assert(count==0);
 s.enabled=s.connected=s.subscribed=true;
 assert(!remote_key(&s,s.session,"12345678",2,2,1,0,send,0));assert(count==1&&last_button==2&&last_state==1);
 assert(!remote_key(&s,s.session,"12345678",3,0,2,500000,send,0));assert(count==1);
 remote_expire(&s,1700000,send,0);assert(!s.button&&count==2&&last_state==0);
 assert(remote_key(&s,s.session,"12345678",4,0,2,1700010,send,0)<0);assert(remote_key(&s,s.session,"12345678",5,2,1,1700020,send,0)<0);assert(count==2);
 assert(!remote_key(&s,s.session,"23456789",6,1,1,2000000,send,0));assert(s.button==1);
 assert(!remote_key(&s,s.session,"12345678",7,0,0,2000010,send,0));assert(s.button==1);
 assert(!remote_key(&s,s.session,"23456789",8,0,0,2000020,send,0));assert(!s.button&&last_state==0);
 assert(remote_key(&s,s.session,"45678901",7,3,1,2000030,send,0)<0);
 fail=9;assert(remote_key(&s,s.session,"45678901",9,3,1,2000040,send,0)==9);assert(!s.button);fail=0;
 assert(!remote_key(&s,s.session,"56789012",10,2,1,3000000,send,0));
 for(uint32_t seq=11;seq<40;seq++)assert(!remote_key(&s,s.session,"56789012",seq,0,2,3000000+(seq-10)*1000000LL,send,0));
 remote_expire(&s,33000000,send,0);assert(!s.button&&last_state==0);
 puts("PASS native remote lease, release, stale sequence, late keep cannot rearm, separate holds, queue failure and max hold");
}
