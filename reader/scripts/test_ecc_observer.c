#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../src/error_probe.c"
#include "../src/ecc_capture_json.h"

#define twai_hal_decode_interrupt reference_decode_interrupt
#define twai_hal_get_events reference_get_events
#include "sdk_event_reference.inc"
#undef twai_hal_decode_interrupt
#undef twai_hal_get_events

static uint32_t cases, expected_errors;
static uint32_t compare(uint32_t interrupts, uint32_t status, uint32_t tec, uint32_t rec, uint32_t flags, uint8_t ecc) {
    twai_test_hw_t actual={.interrupts=interrupts,.status=status,.tec=tec,.rec=rec,.ecc=ecc},reference=actual;
    twai_hal_context_t a={.dev=&actual,.state_flags=flags},b={.dev=&reference,.state_flags=flags};
    uint32_t observed=__wrap_twai_hal_get_events(&a),expected=reference_get_events(&b);
    assert(observed==expected && a.state_flags==b.state_flags);
    assert(a.errors.bit_err==b.errors.bit_err && a.errors.form_err==b.errors.form_err && a.errors.stuff_err==b.errors.stuff_err && a.errors.ack_err==b.errors.ack_err);
    assert(!memcmp(&actual,&reference,sizeof(actual)));
    assert(actual.intr_reads==1);
    assert(actual.ecc_reads==!!(expected&TWAI_HAL_EVENT_BUS_ERR));
    if(expected&TWAI_HAL_EVENT_BUS_ERR){
        expected_errors++;error_ecc_history_t h=reader_error_ecc_history();assert(h.total==expected_errors);
        assert(h.count && h.count<=READER_ECC_HISTORY && h.events[h.count-1].capture==ecc);
    }
    assert(reader_error_probe().total==expected_errors);cases++;return observed;
}
int main(void) {
    assert(!compare(0,0,0,0,0,255));assert(!reader_error_ecc_history().count);
    for(unsigned ecc=0;ecc<256;ecc++)compare(TWAI_LL_INTR_BEI,0,0,0,0,(uint8_t)ecc);
    error_ecc_history_t h=reader_error_ecc_history();assert(h.count==8 && !h.saturated);
    for(unsigned i=0;i<8;i++)assert(h.events[i].capture==248+i && h.events[i].event==249+i);
    char json[1100];assert(reader_ecc_json(h,254,json,sizeof(json)));assert(strstr(json,"\"incomplete\":false") && strstr(json,"\"raw\":255") && !strstr(json,"\"raw\":253"));
    assert(reader_ecc_json(h,0,json,sizeof(json)));assert(strstr(json,"\"incomplete\":true"));
    assert(!reader_ecc_json(h,0,json,2));assert(!reader_ecc_json(h,0,NULL,0));
    h.saturated=true;assert(reader_ecc_json(h,h.total,json,sizeof(json)));assert(strstr(json,"\"incomplete\":true"));
    h=reader_error_ecc_history();assert(reader_ecc_json(h,h.total+1,json,sizeof(json)));assert(strstr(json,"\"incomplete\":true"));
    char latest[256];assert(reader_last_ecc_json((error_ecc_history_t){0},latest,sizeof(latest)));assert(!strcmp(latest,"null"));
    assert(!reader_last_ecc_json(h,NULL,0));assert(!reader_last_ecc_json(h,latest,1));
    error_ecc_history_t invalid={.count=READER_ECC_HISTORY+1};assert(!reader_last_ecc_json(invalid,latest,sizeof(latest)));
    for(unsigned raw=0;raw<256;raw++){
        error_ecc_history_t sample={.count=1,.saturated=true};sample.events[0]=(error_ecc_event_t){.event=UINT32_MAX,.t_us=UINT64_MAX,.capture=(uint8_t)raw};
        assert(reader_last_ecc_json(sample,latest,sizeof(latest)));char expect[80];
        snprintf(expect,sizeof(expect),"\"raw\":%u,\"type\":%u,\"direction\":%u,\"segment\":%u",raw,raw>>6,(raw>>5)&1,raw&31);
        assert(strstr(latest,expect)&&strstr(latest,"\"scope\":\"boot_history\"")&&strstr(latest,"\"saturated\":true"));
    }
    for(unsigned irq=0;irq<256;irq++)for(unsigned status=0;status<256;status++) {
        uint32_t tec=irq&1?128:127,rec=status&1?255:0,flags=(irq^status)&63;
        compare(irq,status,tec,rec,flags,(uint8_t)(irq+status));
    }
    printf("PASS pinned C3 HAL ECC observer: %u differential cases, all256 raw ECC values, identical events/state/read side effects, exactly one ECC read per error, bounded8-event history, explicit incomplete/saturation/JSON bounds\n",cases);
    return 0;
}
