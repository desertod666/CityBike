#include <assert.h>
#include <stdio.h>
#include "../src/tx_policy.h"

static tx_policy_t ready(void){
    tx_policy_t p;tx_policy_init(&p,123);
    tx_snapshot_t s={.now_us=100,.epoch=2,.bitrate=250000,.sampling=1,.ctx_valid=true};
    tx_policy_begin(&p,s);s.now_us+=TX_QUALIFY_US;s.received=200;
    assert(tx_policy_finish(&p,s));return p;
}
static tx_snapshot_t drift(tx_snapshot_t s,unsigned n){
    if(n==0)s.epoch++;
    if(n==1)s.sampling++;
    if(n==2)s.bitrate=125000;
    if(n==3)s.bus_errors++;
    if(n==4)s.received=0;
    if(n==5)s.ctx_valid=false;
    if(n==6)s.now_us--;
    if(n>=7)s.drops[n-7]++;
    return s;
}
int main(void){
    tx_policy_t p=ready();tx_snapshot_t s=p.quality;
    assert(tx_policy_arm(&p,123,s,true,true));s.now_us+=1000;
    assert(tx_policy_consume(&p,s,456,true,true));assert(!tx_policy_consume(&p,s,789,true,true));
    assert(!p.armed && !p.qualified && p.challenge==789);
    for(unsigned n=0;n<4;n++){
        p=ready();s=p.quality;if(n==1)s.now_us+=TX_QUALITY_FRESH_US+1;
        assert(!tx_policy_arm(&p,n==0?124:123,s,n!=2,n!=3));
        assert(!p.qualified);
    }
    p=ready();s=p.quality;assert(tx_policy_arm(&p,123,s,true,true));s.now_us+=TX_ARM_US+1;
    assert(!tx_policy_consume(&p,s,321,true,true));
    for(unsigned n=0;n<13;n++){
        p=ready();s=drift(p.quality,n);
        assert(!tx_policy_arm(&p,123,s,true,true));
        p=ready();s=p.quality;assert(tx_policy_arm(&p,123,s,true,true));
        s=drift(s,n);assert(!tx_policy_consume(&p,s,456,true,true));
        assert(!p.armed&&!p.qualified&&p.challenge==456);
    }
    for(unsigned n=0;n<2;n++){
        p=ready();s=p.quality;assert(tx_policy_arm(&p,123,s,true,true));
        assert(!tx_policy_consume(&p,s,456,n!=0,n!=1));
    }
    for(unsigned n=0;n<12;n++){
        tx_policy_init(&p,1);tx_snapshot_t b={.now_us=100,.received=5,.bus_errors=5,.epoch=2,.bitrate=250000,.ctx_valid=true};
        tx_policy_begin(&p,b);tx_snapshot_t end=b;end.now_us+=TX_QUALIFY_US;end.received+=200;
        if(n==0)end.bus_errors+=3;
        if(n==1)end.received=0;
        if(n==2)end.now_us--;
        if(n==3)end.epoch++;
        if(n==4)end.ctx_valid=false;
        if(n==5)end.bitrate=125000;
        if(n>=6)end.drops[n-6]++;
        assert(!tx_policy_finish(&p,end));assert(!tx_policy_arm(&p,1,end,true,true));
    }
    // Boundary matrix: exact1event/100frames; absolute10event cap;
    // 30s minimum and counter regressions remain hard failures.
    for(unsigned frames=99;frames<=1101;frames++){
        for(unsigned events=0;events<=11;events++){
            tx_policy_init(&p,1);tx_snapshot_t b={.now_us=100,.received=500,.bus_errors=50,.epoch=2,.bitrate=250000,.sampling=1,.ctx_valid=true};
            tx_policy_begin(&p,b);tx_snapshot_t end=b;end.now_us+=TX_QUALIFY_US;end.received+=frames;end.bus_errors+=events;
            bool expected=frames>=100 && events<=10 && events<=frames/100;
            assert(tx_policy_finish(&p,end)==expected);
        }
    }
    tx_policy_init(&p,1);tx_snapshot_t b={.now_us=100,.received=500,.bus_errors=50,.epoch=2,.bitrate=250000,.ctx_valid=true};
    tx_policy_begin(&p,b);s=b;s.now_us+=TX_QUALIFY_US-1;s.received+=1000;assert(!tx_policy_finish(&p,s));
    tx_policy_begin(&p,b);s=b;s.now_us+=TX_QUALIFY_US;s.received+=1000;s.bus_errors--;assert(!tx_policy_finish(&p,s));
    p=ready();tx_policy_revoke(&p,true);assert(!p.qualified&&!p.armed);
    assert(TX_PROBE_ID==((5U<<24)|(2U<<19)|(1U<<16)|(0x32U<<8)|1U));
    assert(TX_PROBE_REPLY_ID==((2U<<24)|(5U<<19)|(2U<<16)|(0x32U<<8)|1U));
    puts("PASS TX policy: live snapshots at arm/consume reject errors, drops, scope changes, reset, bad identity/state, expiry and repeated use");
}
