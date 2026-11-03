#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../src/tx_trace.h"
int main(void){
    tx_trace_t s={0};char json[1200];
    assert(tx_trace_json(&s,json,sizeof(json)));assert(strstr(json,"\"samples\":0"));
    for(unsigned i=0;i<200;i++)tx_trace_observe(&s,i,(i/4)%2,(i/4)%2);
    assert(s.samples==200&&s.mismatch==0&&s.max_mismatch_us==0&&s.max_gap_us==1);
    assert(s.tx_low==100&&!s.overflow&&s.edges==50);
    memset(&s,0,sizeof(s));
    for(unsigned i=0;i<40;i++)tx_trace_observe(&s,i,false,true);
    assert(s.mismatch==40&&s.max_mismatch_us==39&&s.tx_low==40);
    tx_trace_observe(&s,100,true,true);assert(s.max_gap_us==61&&s.max_mismatch_us==100);
    tx_trace_observe(&s,99,false,true);assert(s.time_regressed&&s.samples==41);
    memset(&s,0,sizeof(s));
    for(unsigned i=0;i<1000;i++)tx_trace_observe(&s,i,i%2,(i/2)%2);
    assert(s.overflow&&s.edges==TX_TRACE_EDGES&&s.samples==1000);
    assert(tx_trace_json(&s,json,sizeof(json)));assert(strstr(json,"\"edges_truncated\":true"));
    struct {char data[8];unsigned marker;} small={{0},0x12345678};
    assert(!tx_trace_json(&s,small.data,sizeof(small.data))&&small.marker==0x12345678);
    puts("PASS bounded TX/RX trace: matched lines, observed dominant mismatch, interruption gaps, clock regression, bounded edges and samples, JSON capacity; no GPIO writes or device I/O");
}
