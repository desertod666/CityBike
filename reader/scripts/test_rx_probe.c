#include <assert.h>
#include <stdio.h>
#include "../src/rx_probe.h"

int main(void) {
    rx_check_t r={0};
    assert(!rx_probe_edge(&r));
    assert(!rx_probe_due(&r, 100000000));
    rx_probe_begin(&r, 5000, 1);
    assert(r.state==RX_RUNNING && r.id==1 && r.edges==0 && r.initial_level==1);
    assert(!rx_probe_due(&r, 10004999));
    assert(rx_probe_due(&r, 10005000));
    rx_probe_finish(&r, RX_COMPLETE, 10005000, 1);
    assert(r.state==RX_COMPLETE && !r.capped && r.edges==0);
    assert(!rx_probe_edge(&r));
    rx_probe_begin(&r, 20000000, 0);
    for (unsigned i=1;i<RX_CHECK_EDGE_LIMIT;i++) assert(!rx_probe_edge(&r));
    assert(rx_probe_edge(&r));
    for (unsigned i=0;i<1000000;i++) assert(!rx_probe_edge(&r));
    assert(r.edges==RX_CHECK_EDGE_LIMIT && r.capped && rx_probe_due(&r,20000001));
    rx_probe_finish(&r,RX_COMPLETE,20000010,1);
    assert(r.id==2 && r.final_level==1);
    rx_probe_begin(&r,30000000,1);
    assert(r.id==3 && !r.capped && r.edges==0);
    rx_probe_edge(&r); rx_probe_finish(&r,RX_CANCELLED,30000005,0);
    assert(r.state==RX_CANCELLED && r.edges==1 && !rx_probe_due(&r,50000000));
    rx_probe_finish(&r,RX_COMPLETE,90000000,1);
    assert(r.state==RX_CANCELLED && r.ended_us==30000005 && r.final_level==0);
    puts("PASS: actual RX probe logic: idle, timeout, edge cap, saturation, cancel, restart");
    return 0;
}
