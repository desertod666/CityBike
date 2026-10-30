#include <assert.h>
#include <stdio.h>
#include "../src/spard_identity_codec.h"

static void baseline(uint8_t raw[72]) {
    memset(raw, 0, 72); raw[0]=0x68; raw[1]=72; raw[2]=0xb7; raw[3]=0x30; raw[71]=0x16;
    memcpy(raw+6,"ORIGINAL-TEST-SN",16); memcpy(raw+38,"ORIGINAL-TEST-MODEL",19);
    raw[70]=spard_identity_xor(raw);
}
static void cleared(const spard_identity_plan_t *p) {
    const uint8_t *bytes=(const uint8_t *)p;
    for(size_t i=0;i<sizeof(*p);i++)assert(!bytes[i]);
}
int main(void) {
    uint8_t raw[72],copy[72];baseline(raw);memcpy(copy,raw,72);
    struct {uint32_t before;spard_identity_plan_t plan;uint32_t after;} guard={.before=0x12345678,.after=0xabcdef01};
    spard_identity_plan_t *p=&guard.plan;
    assert(spard_identity_encode(p,raw,72,true,(const uint8_t *)"NEW-TEST-SN",11,NULL,0)==SPARD_IDENTITY_OK);
    assert(p->valid && p->changed_slots==1 && p->request[3]==0x31 && p->restoration_request[3]==0x31);
    assert(!memcmp(p->request+6,"NEW-TEST-SN",11) && !p->request[17]);
    assert(!memcmp(p->request+38,raw+38,32) && !memcmp(p->restoration_request+6,raw+6,64));
    assert(p->request[70]==spard_identity_xor(p->request) && p->restoration_request[70]==spard_identity_xor(p->restoration_request));
    assert(!memcmp(copy,raw,72) && guard.before==0x12345678 && guard.after==0xabcdef01);
    for(unsigned i=0;i<72;i++)for(unsigned bit=0;bit<8;bit++){
        uint8_t bad[72];memcpy(bad,raw,72);bad[i]^=1U<<bit;memset(p,0xa5,sizeof(*p));
        assert(spard_identity_encode(p,bad,72,true,(const uint8_t *)"NEW",3,NULL,0)==SPARD_IDENTITY_BAD_BASELINE);cleared(p);
    }
    for(unsigned byte=0;byte<256;byte++){
        uint8_t value=(uint8_t)byte;
        spard_identity_result_t r=spard_identity_encode(p,raw,72,true,&value,1,NULL,0);
        assert((r==SPARD_IDENTITY_OK)==(byte>=33 && byte<=126));
        if(r!=SPARD_IDENTITY_OK)cleared(p);
    }
    for(size_t n=0;n<42;n++){
        uint8_t value[42];memset(value,'X',sizeof(value));
        spard_identity_result_t r=spard_identity_encode(p,raw,72,true,value,n,NULL,0);
        assert((r==SPARD_IDENTITY_OK)==(n>=1 && n<=32));
    }
    assert(spard_identity_encode(p,raw,72,false,(const uint8_t *)"NEW",3,NULL,0)==SPARD_IDENTITY_CONTEXT_REQUIRED);cleared(p);
    assert(spard_identity_encode(p,NULL,72,true,(const uint8_t *)"NEW",3,NULL,0)==SPARD_IDENTITY_BAD_BASELINE);cleared(p);
    assert(spard_identity_encode(p,raw,SIZE_MAX,true,(const uint8_t *)"NEW",3,NULL,0)==SPARD_IDENTITY_BAD_BASELINE);cleared(p);
    assert(spard_identity_encode(p,raw,72,true,NULL,1,NULL,0)==SPARD_IDENTITY_BAD_SLOT);cleared(p);
    assert(spard_identity_encode(p,raw,72,true,NULL,0,NULL,0)==SPARD_IDENTITY_UNCHANGED);cleared(p);
    assert(spard_identity_encode(p,raw,72,true,(const uint8_t *)"ORIGINAL-TEST-SN",16,NULL,0)==SPARD_IDENTITY_UNCHANGED);cleared(p);
    assert(spard_identity_encode(NULL,raw,72,true,NULL,0,NULL,0)==SPARD_IDENTITY_BAD_ARGUMENT);
    for(unsigned i=0;i<32;i++)raw[6+i]=(uint8_t)(128+i);
    raw[70]=spard_identity_xor(raw);
    assert(spard_identity_encode(p,raw,72,true,NULL,0,(const uint8_t *)"NEW",3)==SPARD_IDENTITY_OK);
    assert(p->changed_slots==2 && !memcmp(p->request+6,raw+6,32));
    /* An old output may supply the new baseline and an unchanged slot. */
    memcpy(p->restoration_request,raw,72);
    assert(spard_identity_encode(p,p->restoration_request,72,true,(const uint8_t *)"ALIAS",5,p->request+38,3)==SPARD_IDENTITY_OK);
    assert(p->valid && !memcmp(p->request+6,"ALIAS",5));
    puts("PASS offline embedded identity codec: exact layout/XOR/restoration, preserved raw slots, bounded ASCII, 576 corruptions, cleared failures, canaries and aliased inputs; no device I/O");
    return 0;
}
