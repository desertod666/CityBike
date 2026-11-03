#define READER_TEST_BATTERY_QUERY 1
#define main passive_regression_main
#include "test_firmware_lifecycle.c"
#undef main
#include "spard_reply_fixture.h"
static unsigned tx_calls,route_calls;
static bool query_echo;
static int tx_fail_at,ack_fail_at,pending_at,cancel_after,disconnect_after,rx_error,route_fail,corrupt,omit_at,restore_fail;
static unsigned preflight_fault;
static twai_message_t transmitted[2];
void fake_query_install_config(const twai_general_config_t *g,const twai_timing_config_t *t){
    fake_twai_regs.mode_reg.val=g->mode==TWAI_MODE_NORMAL?0:g->mode==TWAI_MODE_NO_ACK?4:2;
    fake_twai_regs.bus_timing_0_reg.val=((fake_apb_hz/t->quanta_resolution_hz)/2-1)|((t->sjw-1)<<14);
    fake_twai_regs.bus_timing_1_reg.val=(t->tseg_1-1)|((t->tseg_2-1)<<4)|(t->triple_sampling?128:0);
    if(preflight_fault==1)fake_twai_regs.bus_timing_1_reg.val^=1;
    if(preflight_fault==2)fake_twai_regs.mode_reg.val=2;
    if(preflight_fault==3)GPIO.func_in_sel_cfg[TWAI_RX_IDX].sig_in_inv=1;
    if(preflight_fault==4)fake_reg[GPIO_PIN4_REG]=GPIO_PIN4_PAD_DRIVER;
    if(preflight_fault==5)fake_clock_error=ESP_FAIL;
    if(preflight_fault==6)fake_reg[GPIO_ENABLE_REG]|=BIT(5);
}
void fake_query_route(int gpio,int signal){assert(gpio==4 && signal==74);route_calls++;if(!route_fail)fake_reg[2]=(unsigned)signal;}
void fake_query_stopping(void){if(!fake_gpio_fail)assert(reader_ctx_guard().valid);}
void fake_query_received(void){if(restore_fail && tx_calls==2 && !fake_rx->count)fake_gpio_fail=1;}
bool fake_query_connected(void){return !disconnect_after || tx_calls<(unsigned)disconnect_after;}
void fake_query_delay(unsigned ticks){(void)ticks;if(cancel_after && tx_calls>=(unsigned)cancel_after)atomic_store(&battery_query_cancel,true);}
void fake_query_status(twai_status_info_t *s){
    if(ack_fail_at && tx_calls>=(unsigned)ack_fail_at)s->tx_failed_count=1;
    if(pending_at && tx_calls>=(unsigned)pending_at)s->msgs_to_tx=1;
    if(rx_error && tx_calls==2)s->bus_error_count=1;
    if(restore_fail && tx_calls==2 && fake_rx->count==0)fake_gpio_fail=1;
}
int fake_query_transmit(const twai_message_t *m){
    assert(atomic_load(&battery_query_active)&&atomic_load(&battery_normal_driver));
    assert(battery_tx_route_valid()&&m->identifier==0x666&&!m->extd&&!m->rtr&&m->ss&&m->self);
    assert(tx_calls<2);transmitted[tx_calls++]=*m;
    if(tx_fail_at && tx_calls==(unsigned)tx_fail_at)return ESP_FAIL;
    if(tx_calls==2){
        if(query_echo){for(unsigned j=0;j<2;j++)assert(xQueueSend(fake_rx,&transmitted[j],0));}
        for(unsigned i=0,index=0;i<90;i+=8,index++){
            if(omit_at && index+1==(unsigned)omit_at)continue;
            twai_message_t f={.identifier=0x666,.data_length_code=(90-i<8?90-i:8)};
            memcpy(f.data,fixture_reply+i,f.data_length_code);
            if(corrupt && !i)f.data[4]^=1;
            assert(xQueueSend(fake_rx,&f,0));
        }
    }
    return ESP_OK;
}
static void init_query_noise(unsigned events){
    reset_test();tx_calls=route_calls=0;query_echo=false;
    tx_fail_at=ack_fail_at=pending_at=cancel_after=disconnect_after=rx_error=route_fail=corrupt=omit_at=restore_fail=0;
    preflight_fault=0;
    atomic_store(&battery_query_active,false);atomic_store(&battery_normal_driver,false);atomic_store(&battery_query_cancel,false);
    tx_policy_init(&battery_quality,55);
    tx_policy_begin(&battery_quality,battery_tx_snapshot());
    fake_clock+=TX_QUALIFY_US+1000000;stats.received+=120;stats.bus_errors+=events;
    command_t stop={.text="STOP",.id="qualify"};execute_command(&stop);flush_replies();
    assert(!installed && battery_quality.qualified && !atomic_load(&stop_fences));
}
static void init_query(void){init_query_noise(0);}
static command_outcome_t query(void){command_outcome_t out={0};char cmd[]="SPARD INFO";handle_command(cmd,&out);return out;}
static void safe_end(command_outcome_t o,bool success){
    assert(!atomic_load(&battery_query_active));
    assert(reader_ctx_guard().valid);
    assert(!installed && !stats.running && !atomic_load(&battery_normal_driver));
    assert(o.stop_fence);
    assert(success?!o.error[0]:!!o.error[0]);
}
#ifndef READER_BATTERY_TEST_HELPERS_ONLY
int main(void){
    command_outcome_t o;
    for(unsigned fault=1;fault<=6;fault++){
        init_query();preflight_fault=fault;o=query();safe_end(o,false);
        assert(!tx_calls && !battery_tx_attempted && battery_diag.normal_hw_captured && battery_diag.normal_hw.mismatch_bits);
        assert(!strcmp(battery_diag.reason,"normal_hardware_mismatch"));
    }
    init_query();query_echo=true;o=query();safe_end(o,true);assert(battery_diag.self_echo_frames==2&&stats.received==134);
    init_query();query_echo=true;corrupt=1;o=query();safe_end(o,false);assert(battery_diag.self_echo_frames==2&&!battery_response_valid);
    init_query_noise(1);o=query();safe_end(o,true);assert(tx_calls==2&&battery_response_valid);
    init_query();o=query();safe_end(o,true);
    assert(tx_calls==2 && route_calls==1 && battery_response_valid);
    spard_read_frame_t expected[2];spard_information_read_frames(expected);
    for(unsigned i=0;i<2;i++){assert(transmitted[i].data_length_code==expected[i].dlc);assert(!memcmp(transmitted[i].data,expected[i].data,expected[i].dlc));}
    assert(stats.received==132 && frames->count==12);
    flush_replies();char *diagnostic=strstr(fake_wire,"{\"type\":\"battery_tx_diagnostic\"");assert(diagnostic);
    char *check=strstr(fake_wire,"{\"type\":\"battery_hardware_check\"");assert(check);
    char *check_end=strchr(check,'\n');assert(check_end);char check_saved=*check_end;*check_end=0;
    assert(strlen(check)<2048 && strstr(check,"\"mismatch_bits\":0"));
    if(getenv("READER_TEST_WIRE"))puts(check);
    *check_end=check_saved;
    char *diagnostic_end=strchr(diagnostic,'\n');assert(diagnostic_end);assert((size_t)(diagnostic_end-diagnostic)<4000);
    char saved=*diagnostic_end;*diagnostic_end=0;assert(strstr(diagnostic,"\"reason\":\"transmit_completed\"")&&strstr(diagnostic,"\"gpio_trace\":"));
    if(getenv("READER_TEST_WIRE"))puts(diagnostic);
    *diagnostic_end=saved;

    unsigned previous=tx_calls;o=query();assert(o.error[0] && tx_calls==previous); // qualification consumed
    init_query();battery_quality.qualified=false;o=query();assert(o.error[0]&&!tx_calls&&!route_calls);
    init_query();fake_clock+=TX_QUALITY_FRESH_US+1;o=query();assert(o.error[0]&&!tx_calls&&!route_calls);
    init_query();stats.bus_errors++;o=query();assert(o.error[0]&&!tx_calls&&!route_calls);
    init_query();stats.usb_drops++;o=query();assert(o.error[0]&&!tx_calls&&!route_calls);
    init_query();stats.epoch++;o=query();assert(o.error[0]&&!tx_calls&&!route_calls);
    init_query();stats.sampling++;o=query();assert(o.error[0]&&!tx_calls&&!route_calls);
    init_query();atomic_store(&stop_fences,1);o=query();assert(o.error[0]&&!tx_calls&&!route_calls);
    init_query();atomic_store(&battery_query_cancel,true);o=query();assert(o.error[0]&&!tx_calls&&!route_calls); // STOP queued before INFO starts
    assert(battery_is_stop("stop")&&battery_is_stop("StOp")&&!battery_is_stop("STOP ")&&!battery_is_stop("STOPx"));
    init_query();fake_status_fail_on=fake_status_calls+1;o=query();safe_end(o,false);assert(!tx_calls&&!route_calls);
    init_query();fake_status_fail_on=fake_status_calls+3;o=query();safe_end(o,false);assert(!tx_calls);
    init_query();fake_status_fail_on=fake_status_calls+4;o=query();safe_end(o,false);assert(tx_calls==1);
    init_query();fake_install_fail=1;o=query();safe_end(o,false);assert(!tx_calls&&!route_calls);
    init_query();fake_start_fail=1;o=query();safe_end(o,false);assert(!tx_calls&&!route_calls);
    init_query();route_fail=1;o=query();safe_end(o,false);assert(!tx_calls&&route_calls==1);
    init_query();tx_fail_at=1;o=query();safe_end(o,false);assert(tx_calls==1&&!battery_tx_acknowledged);
    init_query();tx_fail_at=2;o=query();safe_end(o,false);assert(tx_calls==2&&battery_tx_acknowledged==1);
    init_query();ack_fail_at=1;o=query();safe_end(o,false);assert(tx_calls==1&&!battery_tx_acknowledged);
    init_query();pending_at=1;uint64_t began=fake_clock;o=query();safe_end(o,false);assert(tx_calls==1&&fake_clock-began>=BATTERY_TX_LIMIT_US&&fake_clock-began<BATTERY_QUERY_LIMIT_US);
    init_query();cancel_after=1;o=query();safe_end(o,false);assert(tx_calls==1);
    init_query();disconnect_after=1;o=query();safe_end(o,false);assert(tx_calls==1);
    init_query();rx_error=1;o=query();safe_end(o,false);assert(tx_calls==2&&!battery_response_valid);
    init_query();corrupt=1;began=fake_clock;o=query();safe_end(o,false);assert(tx_calls==2&&!battery_response_valid&&fake_clock-began>=BATTERY_QUERY_LIMIT_US);
    for(int missing=1;missing<=12;missing++){
        init_query();omit_at=missing;o=query();safe_end(o,false);assert(!battery_response_valid);
    }
    init_query();for(unsigned i=0;i<FRAME_QUEUE_LEN;i++){frame_t f={0};assert(xQueueSend(frames,&f,0));}o=query();safe_end(o,false);assert(stats.queue_drops==12);
    init_query();fake_stop_fail=1;o=query();assert(o.error[0]&&reader_ctx_guard().valid&&installed&&atomic_load(&battery_normal_driver)&&!atomic_load(&battery_query_active));assert(!o.stop_fence);previous=tx_calls;o=query();assert(o.error[0]&&tx_calls==previous);
    fake_stop_fail=0;char stop[]="STOP";o=(command_outcome_t){0};handle_command(stop,&o);safe_end(o,true);
    init_query();fake_uninstall_fail=1;o=query();assert(o.error[0]&&reader_ctx_guard().valid&&installed&&!stats.running&&atomic_load(&battery_normal_driver)&&!o.stop_fence);fake_uninstall_fail=0;strcpy(stop,"STOP");o=(command_outcome_t){0};handle_command(stop,&o);safe_end(o,true);
    init_query();restore_fail=1;o=query();assert(o.error[0]&&!reader_ctx_guard().valid&&!installed&&!atomic_load(&battery_query_active));
    init_query();command_t denied={.text="spard info",.token=9};strcpy(denied.id,"http-query");execute_command(&denied);assert(!tx_calls&&!route_calls&&!installed);flush_replies();assert(strstr(fake_wire,"requires correlated USB"));
    init_query();command_t legacy={.text="SPARD INFO"};execute_command(&legacy);assert(!tx_calls&&!route_calls&&!installed);
    init_query();command_t accepted={.text="SPARD INFO"};strcpy(accepted.id,"usb-query");execute_command(&accepted);assert(tx_calls==2&&!installed&&reader_ctx_guard().valid&&battery_response_valid);flush_replies();assert(strstr(fake_wire,"battery_query_result")&&strstr(fake_wire,"information00"));
    puts("PASS actual candidate firmware SPARD INFO: exact2single-shotframes, genuine90Breply, clean-capture admission/one-use/expiry,12missing-fragment cases, corruption/timeout/cancel/USB/ACK/route/install/start/status/cleanup/delivery failures, physical inhibit before cleanup, retained driver blocks further reads");
    return 0;
}

#endif
