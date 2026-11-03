#define READER_TEST_RMT 1
#define READER_BATTERY_TEST_HELPERS_ONLY 1
#include "test_battery_query.c"
static unsigned rmt_tx_checks;
void fake_rmt_on_transmit(void){
    if(tx_calls)return;
    assert(reader_rmt_armed && fake_rmt_arm_calls==2 && reader_rmt_tx_call_us);
    assert(battery_tx_route_valid());
    for(unsigned i=0;i<2;i++){
        struct fake_rmt*p=&fake_rmt_channels[i];assert(p->armed&&p->enabled);
        p->buffer[0].val=0x00108008;p->buffer[1].val=0x00008008;
        rmt_rx_done_event_data_t e={.received_symbols=p->buffer,.num_symbols=2,.flags.is_last=true};
        p->callbacks.on_recv_done(p,&e,p->context);
    }
    rmt_tx_checks++;
}
static void init_rmt_query(void){
    assert(!reader_rmt_lines[0].channel&&!reader_rmt_lines[1].channel);
    fake_rmt_create_calls=fake_rmt_arm_calls=0;
    fake_rmt_create_fail=fake_rmt_arm_fail=fake_rmt_disable_fail=fake_rmt_delete_fail=0;
    fake_rmt_early_done=false;init_query();
}
int main(void){
    init_rmt_query();fake_reg[4]|=FUN_PU;command_outcome_t o=query();safe_end(o,false);
    assert(!tx_calls && (battery_diag.normal_hw.mismatch_bits & READER_HW_RX_GPIO));
    assert((fake_reg[4]&FUN_PU) && reader_rmt_clean);
    init_rmt_query();o=query();safe_end(o,true);
    assert(rmt_tx_checks==1 && tx_calls==2 && reader_rmt_clean);
    assert(!(fake_reg[3]&FUN_PU) && !(fake_reg[4]&FUN_PU));
    static char json[2300];assert(reader_rmt_json(json,sizeof(json)));
    assert(strstr(json,"0010800800008008")&&strstr(json,"\"armed\":true"));
    assert(reader_rmt_lines[0].arm_after_us<reader_rmt_tx_call_us && reader_rmt_lines[1].arm_after_us<reader_rmt_tx_call_us);
    assert(reader_rmt_tx_call_us<reader_rmt_tx_return_us && reader_rmt_tx_return_us<reader_rmt_hold_us);
    // Full-capacity waveform plus worst bounded software trace fits a USB record.
    for(unsigned i=0;i<2;i++){reader_rmt_lines[i].count=64;for(unsigned j=0;j<64;j++)reader_rmt_lines[i].symbols[j].val=UINT32_MAX;}
    assert(reader_rmt_json(json,sizeof(json)));assert(!reader_rmt_json(json,100));
    for(unsigned i=0;i<64;i++)tx_trace_observe(&battery_diag.trace,1000000+i,!!(i&1),!!(i&1));
    battery_tx_diagnostic();flush_replies();assert(!strstr(fake_wire,"encoding_truncated"));
    if(getenv("READER_TEST_WIRE")){
        char*cur=fake_wire;while((cur=strstr(cur,"{\"type\":\"battery_tx_diagnostic\""))){char*end=strchr(cur,'\n');assert(end);char saved=*end;*end=0;puts(cur);*end=saved;cur=end+1;}
    }
    // Invalid callback pointer or excessive reported count cannot expose stale data.
    rmt_rx_done_event_data_t bad={.received_symbols=NULL,.num_symbols=100,.flags.is_last=true};
    reader_rmt_done(NULL,&bad,&reader_rmt_lines[0]);assert(!reader_rmt_lines[0].pointer_valid);
    assert(reader_rmt_json(json,sizeof(json))&&strstr(json,"\"symbols_hex\":\"\""));
    for(int i=1;i<=2;i++){
        init_rmt_query();fake_rmt_create_fail=i;o=query();safe_end(o,false);assert(!tx_calls && reader_rmt_clean);
        init_rmt_query();fake_rmt_arm_fail=i;o=query();safe_end(o,false);assert(!tx_calls && reader_rmt_clean);
    }
    init_rmt_query();fake_rmt_early_done=true;o=query();safe_end(o,false);assert(!tx_calls && reader_rmt_clean);
    init_rmt_query();ack_fail_at=1;o=query();safe_end(o,false);assert(tx_calls==1&&reader_rmt_clean&&!battery_tx_acknowledged);
    init_rmt_query();fake_rmt_disable_fail=4;o=query();safe_end(o,false);assert(reader_rmt_lines[0].channel&&!reader_rmt_clean);
    assert(reader_rmt_json(json,sizeof(json))&&strstr(json,"capture_unavailable"));
    unsigned previous=tx_calls;o=query();assert(o.error[0]&&tx_calls==previous);
    assert(!reader_rmt_prepare()&&!reader_rmt_current);
    fake_rmt_disable_fail=0;assert(reader_rmt_cleanup());
    assert(reader_rmt_json(json,sizeof(json))&&strstr(json,"capture_unavailable"));
    init_rmt_query();fake_rmt_delete_fail=5;o=query();safe_end(o,false);assert(reader_rmt_lines[1].channel&&!reader_rmt_clean);
    fake_rmt_delete_fail=0;assert(reader_rmt_cleanup());
    puts("PASS RMT: two input receivers armed before fixed TX, preserved route/pullups, bounded waveform JSON, pointer/count faults, setup/arm/early-completion block TX, inhibit-first cleanup and retained-channel refusal");
}
