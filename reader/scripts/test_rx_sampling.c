#include <assert.h>
#include <stdio.h>
#include "../src/rx_sampling.h"

int main(void) {
    const char *names[]={"DEFAULT","LATE","TRIPLE","LATE_TRIPLE","SP625","SP625_TRIPLE","SP6875","SP6875_TRIPLE","MID","MID_TRIPLE"};
    const unsigned seg1[]={11,13,11,13,9,9,10,10,12,12};
    const bool triple[]={false,false,true,true,false,true,false,true,false,true};
    for (unsigned p=0;p<RX_SAMPLE_COUNT;p++) {
        rx_sampling_t parsed=RX_SAMPLE_COUNT;
        assert(reader_sampling_parse(names[p],&parsed) && parsed==p);
        twai_timing_config_t t=TWAI_TIMING_CONFIG_250KBITS();
        assert(reader_sampling_apply(p,250000,&t));
        assert(t.quanta_resolution_hz/(1+t.tseg_1+t.tseg_2)==250000);
        assert(t.sjw<=t.tseg_2 && t.brp==0 && t.prop_seg==0 && t.ssp_offset==0);
        assert(t.tseg_1==seg1[p] && t.tseg_2==15-seg1[p] && t.sjw==2);
        assert(t.triple_sampling==triple[p]);
        assert(strcmp(reader_sampling_name(p),names[p])==0);
        twai_timing_config_t other=t;
        assert(reader_sampling_apply(p,125000,&other));
        assert(memcmp(&t,&other,sizeof(t))==0);
    }
    rx_sampling_t untouched=RX_SAMPLE_DEFAULT;
    assert(!reader_sampling_parse("LATE;START 1",&untouched));
    assert(!reader_sampling_parse("",&untouched));
    assert(untouched==RX_SAMPLE_DEFAULT);
    twai_timing_config_t t=TWAI_TIMING_CONFIG_250KBITS();
    assert(!reader_sampling_apply(RX_SAMPLE_COUNT,250000,&t));
    t.quanta_resolution_hz=8000000;
    assert(!reader_sampling_apply(RX_SAMPLE_DEFAULT,250000,&t));
    t=(twai_timing_config_t)TWAI_TIMING_CONFIG_250KBITS();t.tseg_1=10;
    assert(!reader_sampling_apply(RX_SAMPLE_LATE,250000,&t));
    puts("PASS ten timing profiles preserve250k and SJW2, bounds, single/triple, other rates untouched, invalid/drifted configs rejected");
}
