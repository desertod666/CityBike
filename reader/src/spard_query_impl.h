/* Included by main.c: only the existing CAN-owner task may call this code.
 * One exact Information00 request. Never a general CAN transmit API. */
#define BATTERY_QUERY_LIMIT_US UINT64_C(1000000)
#define BATTERY_TX_LIMIT_US UINT64_C(20000)
#include "ecc_capture_json.h"

typedef struct {uint8_t bytes[90];unsigned used;int64_t last_us;} battery_packet_t;
static bool battery_cancelled(void);
static struct {
    twai_status_info_t before,last;
    bool before_valid,last_valid;
    int status_rc,transmit_rc;
    unsigned frame_index, self_echo_frames;
    uint32_t alerts;
    const char *reason;
    error_probe_t probe_before;
    tx_trace_t trace;
    reader_hw_readback_t normal_hw;
    bool normal_hw_captured;
} battery_diag;
static bool battery_tx_refuse(const char *reason){battery_diag.reason=reason;return false;}
static void battery_trace_first_frame(uint64_t deadline){
    uint64_t start=(uint64_t)esp_timer_get_time(),end=start+1500;if(end>deadline)end=deadline;
    for(unsigned i=0;i<4096;i++){
        uint64_t now=(uint64_t)esp_timer_get_time();if(now>=end)break;
        uint32_t pins=REG_READ(GPIO_IN_REG);
        tx_trace_observe(&battery_diag.trace,(uint32_t)(now-start),!!(pins&BIT(4)),!!(pins&BIT(5)));
        if((i&63)==0 && battery_cancelled())break;
    }
}
static void battery_tx_diagnostic(void){
    if(battery_diag.normal_hw_captured){
        static char check[2100];
        reader_hw_readback_t *h=&battery_diag.normal_hw;
        int prefix=snprintf(check,sizeof(check),"{\"type\":\"battery_hardware_check\",\"boot\":\"%s\",\"epoch\":%" PRIu32 ",\"hardware\":",boot_text,stats.epoch);
        if(prefix>0 && (size_t)prefix<sizeof(check)){
            size_t used=(size_t)prefix, hardware_size=reader_hw_json(h,check+used,sizeof(check)-used);
            if(hardware_size<sizeof(check)-used){
                used+=hardware_size;
                int tail=snprintf(check+used,sizeof(check)-used,",\"expected_mode\":\"normal\",\"gpio4\":{\"mux_raw\":%u,\"out_raw\":%u,\"pad_raw\":%u,\"enable_raw\":%u,\"drive\":%u,\"open_drain\":%s,\"oen_source\":\"%s\",\"oen_inverted\":%s}}\n",(unsigned)h->gpio4_mux_raw,(unsigned)h->gpio4_out_raw,(unsigned)h->gpio4_pad_raw,(unsigned)h->output_enable_raw,(unsigned)((h->gpio4_mux_raw & FUN_DRV_M)>>FUN_DRV_S),(h->gpio4_pad_raw & GPIO_PIN4_PAD_DRIVER)?"true":"false",(h->gpio4_out_raw & BIT(9))?"GPIO_ENABLE":"peripheral",(h->gpio4_out_raw & GPIO_FUNC4_OEN_INV_SEL)?"true":"false");
                if(tail>0 && (size_t)tail<sizeof(check)-used)reply(check);
            }
        }
    }
    static char ecc[1100], detail[1450];
    if (!reader_ecc_json(reader_error_ecc_history(), battery_diag.probe_before.total, ecc, sizeof(ecc))) strcpy(ecc,"{\"encoding_truncated\":true}");
    int detail_size=snprintf(detail,sizeof(detail),"{\"type\":\"battery_bus_error_detail\",\"boot\":\"%s\",\"epoch\":%" PRIu32 ",\"frame_index\":%u,\"capture\":%s}\n",boot_text,stats.epoch,battery_diag.frame_index,ecc);
    if(detail_size>0 && (size_t)detail_size<sizeof(detail))reply(detail);
    static char trace[1100],rmt[2300],event[4000];
    if(!reader_rmt_json(rmt,sizeof(rmt)))strcpy(rmt,"{\"encoding_truncated\":true}");
    if(!tx_trace_json(&battery_diag.trace,trace,sizeof(trace)))strcpy(trace,"{\"encoding_truncated\":true}");
    error_probe_t errors=reader_error_probe();
    int n=snprintf(event,sizeof(event),"{\"type\":\"battery_tx_diagnostic\",\"boot\":\"%s\",\"epoch\":%" PRIu32 ",\"frame_index\":%u,\"reason\":\"%s\",\"status_rc\":%d,\"transmit_rc\":%d,\"alerts\":%u,\"usb_connected\":%s,\"cancelled\":%s,\"status_valid\":%s,\"before_tec\":%u,\"before_rec\":%u,\"after_tec\":%u,\"after_rec\":%u,\"driver_state\":%u,\"pending_tx\":%u,\"failed_tx\":%u,\"arbitration_lost\":%u,\"bus_errors\":%u,\"error_flag_before\":%u,\"error_flag_after\":%u,\"error_events_delta\":%u,\"twai_mode\":\"normal\",\"tx_self_reception\":true,\"ack_required\":true,\"self_echo_frames\":%u,\"gpio_trace\":%s,\"rmt_trace\":%s}\n",
        boot_text,stats.epoch,battery_diag.frame_index,battery_diag.reason?battery_diag.reason:"none",battery_diag.status_rc,battery_diag.transmit_rc,(unsigned)battery_diag.alerts,
        usb_serial_jtag_is_connected()?"true":"false",atomic_load(&battery_query_cancel)?"true":"false",battery_diag.last_valid?"true":"false",
        (unsigned)battery_diag.before.tx_error_counter,(unsigned)battery_diag.before.rx_error_counter,(unsigned)battery_diag.last.tx_error_counter,(unsigned)battery_diag.last.rx_error_counter,
        (unsigned)battery_diag.last.state,(unsigned)battery_diag.last.msgs_to_tx,(unsigned)battery_diag.last.tx_failed_count,(unsigned)battery_diag.last.arb_lost_count,(unsigned)battery_diag.last.bus_error_count,
        (unsigned)battery_diag.probe_before.last_flags,(unsigned)errors.last_flags,(unsigned)(errors.total-battery_diag.probe_before.total),battery_diag.self_echo_frames,trace,rmt);
    if(n>0 && (size_t)n<sizeof(event))reply(event);
}
static bool battery_is_stop(const char *text) {
    return text && strlen(text)==4 && toupper((unsigned char)text[0])=='S' &&
        toupper((unsigned char)text[1])=='T' && toupper((unsigned char)text[2])=='O' &&
        toupper((unsigned char)text[3])=='P';
}
static bool battery_is_info(const char *text) {
    const char *fixed="SPARD INFO";
    if(!text || strlen(text)!=strlen(fixed))return false;
    for(unsigned i=0;fixed[i];i++)if(toupper((unsigned char)text[i])!=fixed[i])return false;
    return true;
}
static bool battery_is_quiet_info(const char *text) {
    const char *fixed="SPARD QUIET INFO";
    if(!text || strlen(text)!=strlen(fixed))return false;
    for(unsigned i=0;fixed[i];i++)if(toupper((unsigned char)text[i])!=fixed[i])return false;
    return true;
}
static tx_snapshot_t battery_tx_snapshot(void) {
    LOCK();stats_t s=stats;UNLOCK();
    tx_snapshot_t v={.now_us=(uint64_t)esp_timer_get_time(),.received=s.received,
        .bus_errors=s.bus_errors,.epoch=s.epoch,.bitrate=s.bitrate,.sampling=s.sampling,
        .ctx_valid=reader_ctx_guard().valid,
        .drops={s.queue_drops,s.usb_drops,s.missed,s.overruns,s.control_drops,s.stop_drops}};
    return v;
}
static bool battery_packet_feed(battery_packet_t *p,const twai_message_t *m,int64_t now) {
    if(m->identifier!=0x666 || m->extd || m->rtr || !m->data_length_code || m->data_length_code>8)return false;
    if(p->used && (now<p->last_us || now-p->last_us>100000))p->used=0;
    unsigned n=m->data_length_code;
    if(p->used+n>sizeof(p->bytes))p->used=0;
    if(!p->used && (n<4 || m->data[0]!=0x68 || m->data[1]!=90 || m->data[2]!=0xA5 || m->data[3]!=0))return false;
    memcpy(p->bytes+p->used,m->data,n);p->used+=n;p->last_us=now;
    if(p->used!=90)return false;
    uint8_t checksum=0;for(unsigned i=0;i<88;i++)checksum^=p->bytes[i];
    bool ok=checksum==p->bytes[88] && p->bytes[89]==0x16 && p->bytes[71]>=1 && p->bytes[71]<=16;
    p->used=0;return ok;
}
static bool battery_tx_route_valid(void) {
    ctx_guard_t g=reader_ctx_guard();
    return g.out_sel==twai_controller_periph_signals.controllers[0].tx_sig &&
        g.mux==PIN_FUNC_GPIO && g.enabled && g.input_enabled && g.latch_high && !g.inverted;
}
static bool battery_cancelled(void) {
    return atomic_load(&battery_query_cancel) || !usb_serial_jtag_is_connected();
}
static bool battery_driver_clean(twai_status_info_t *s) {
    battery_diag.status_rc=twai_get_status_info(s);
    if(battery_diag.status_rc!=ESP_OK){battery_diag.last_valid=false;return battery_tx_refuse("status_read_failed");}
    battery_diag.last=*s;battery_diag.last_valid=true;
    uint32_t alerts=0;if(twai_read_alerts(&alerts,0)==ESP_OK)battery_diag.alerts|=alerts;
    if(s->state!=TWAI_STATE_RUNNING)return battery_tx_refuse("driver_not_running");
    if(s->tx_failed_count)return battery_tx_refuse(s->arb_lost_count?"tx_arbitration_lost":"tx_driver_failed");
    if(s->bus_error_count)return battery_tx_refuse("driver_bus_error");
    if(s->rx_missed_count || s->rx_overrun_count)return battery_tx_refuse("driver_receive_loss");
    return true;
}
static bool battery_tx_one(const spard_read_frame_t *f,unsigned index,uint64_t deadline) {
    battery_diag.frame_index=index;
    if(!spard_information_read_frame_matches(index,f))return battery_tx_refuse("fixed_frame_mismatch");
    if(!battery_tx_route_valid())return battery_tx_refuse("tx_route_changed");
    if(battery_cancelled())return battery_tx_refuse("usb_or_stop_cancelled");
    twai_status_info_t s;
    if(!battery_driver_clean(&s))return false;
    if(s.msgs_to_tx)return battery_tx_refuse("tx_busy_before_request");
    if(!index){battery_diag.before=s;battery_diag.before_valid=true;}
    twai_message_t m={.identifier=f->id,.data_length_code=f->dlc};
    /* Normal mode still requires another node to ACK. Self reception changes
     * only the hardware transmit command and supplies a local wire echo. */
    m.ss=1;m.self=1;memcpy(m.data,f->data,f->dlc);
    if(!index && !reader_rmt_arm())return battery_tx_refuse("rmt_arm_failed");
    if(!index){
        reader_hw_expected_t expected={.bitrate=250000,.quanta_hz=4000000,.tseg1=11,.tseg2=4,.sjw=2,.epoch=stats.epoch,.running=true,.triple=true,.normal_mode=true};
        battery_diag.normal_hw_captured=reader_hw_readback(installed,&expected,&battery_diag.normal_hw)==ESP_OK;
        if(!battery_diag.normal_hw_captured || battery_diag.normal_hw.mismatch_bits)return battery_tx_refuse("normal_hardware_mismatch");
        if(reader_rmt_any_done())return battery_tx_refuse("rmt_completed_before_tx");
        if(!battery_driver_clean(&s))return false;
    }
    if(!battery_tx_route_valid())return battery_tx_refuse("tx_route_changed");
    battery_tx_attempted++;
    if(!index)reader_rmt_tx_call_us=(uint64_t)esp_timer_get_time();
    battery_diag.transmit_rc=twai_transmit(&m,0);
    if(!index)reader_rmt_tx_return_us=(uint64_t)esp_timer_get_time();
    if(battery_diag.transmit_rc!=ESP_OK)return battery_tx_refuse("transmit_api_rejected");
    uint64_t end=(uint64_t)esp_timer_get_time()+BATTERY_TX_LIMIT_US;if(end>deadline)end=deadline;
    if(!index)battery_trace_first_frame(end);
    do {
        if(battery_cancelled())return battery_tx_refuse("usb_or_stop_cancelled");
        if(!battery_tx_route_valid())return battery_tx_refuse("tx_route_changed");
        if(!battery_driver_clean(&s))return false;
        if(!s.msgs_to_tx){battery_tx_acknowledged++;battery_diag.reason="transmit_completed";return true;}
        vTaskDelay(1);
    } while((uint64_t)esp_timer_get_time()<end);
    return battery_tx_refuse("transmit_deadline");
}
static void battery_information_query_mode(command_outcome_t *outcome, bool quiet) {
    if(installed || rx_snapshot().state==RX_RUNNING || atomic_load(&stop_fences) ||
       atomic_load(&battery_query_active) || atomic_load(&battery_query_cancel) || !reader_ctx_guard().valid) {
        command_error_reply(outcome,"STOP and drain CAN/RXCHECK before SPARD INFO");return;
    }
    tx_snapshot_t actual=battery_tx_snapshot();
    if(!tx_policy_arm_mode(&battery_quality,battery_quality.challenge,actual,true,true,quiet) ||
       !tx_policy_consume_mode(&battery_quality,actual,esp_random(),true,true,quiet)) {
        command_error_reply(outcome,quiet?"SPARD QUIET INFO requires fresh5s passive250kTRIPLE capture withzeroerrors/loss, thenSTOP":"SPARD INFO requires fresh bounded-error passive250k capture (30s/100frames,max1event/100frames,max10events), then STOP");return;
    }
    memset(&battery_diag,0,sizeof(battery_diag));battery_diag.reason="preparing";battery_diag.probe_before=reader_error_probe();
    atomic_store(&battery_query_active,true);
    battery_tx_attempted=battery_tx_acknowledged=0;battery_response_valid=false;battery_query_phase="preparing";
    uint64_t deadline=0;
    const char *failure=NULL;
    twai_timing_config_t timing;
    twai_status_info_t status;
    if(!reader_rmt_prepare()){failure="query hardware capture preparation failed";goto cleanup;}
    deadline=(uint64_t)esp_timer_get_time()+BATTERY_QUERY_LIMIT_US;
    if(!timing_for(250000,actual.sampling,&timing)){failure="query timing unavailable";goto cleanup;}
    // Install/start on the unconnected GPIO10 first. GPIO4 remains held HIGH
    // until a running, clean normal-mode peripheral has been checked.
    twai_general_config_t g=TWAI_GENERAL_CONFIG_DEFAULT(READER_TWAI_TX_GPIO,GPIO_NUM_5,TWAI_MODE_NORMAL);
    g.tx_queue_len=0;g.rx_queue_len=128;
    g.alerts_enabled=TWAI_ALERT_BUS_ERROR|TWAI_ALERT_RX_QUEUE_FULL|TWAI_ALERT_BUS_OFF|TWAI_ALERT_ERR_PASS|TWAI_ALERT_TX_SUCCESS|TWAI_ALERT_TX_FAILED|TWAI_ALERT_ARB_LOST;
    twai_filter_config_t filter=TWAI_FILTER_CONFIG_ACCEPT_ALL();
    if(twai_driver_install(&g,&timing,&filter)!=ESP_OK){failure="query driver install failed";goto cleanup;}
    installed=true;atomic_store(&battery_normal_driver,true);
    if(!reader_ctx_guard().valid){failure="CTX changed while installing query";goto cleanup;}
    if(twai_start()!=ESP_OK){failure="query driver start failed";goto cleanup;}
    LOCK();stats.running=true;stats.bitrate=250000;stats.epoch++;
    stats.timing_hz=timing.quanta_resolution_hz;stats.timing_seg1=timing.tseg_1;
    stats.timing_seg2=timing.tseg_2;stats.timing_sjw=timing.sjw;stats.timing_triple=timing.triple_sampling;UNLOCK();
    if(battery_cancelled() || (uint64_t)esp_timer_get_time()>=deadline || !battery_driver_clean(&status) || status.msgs_to_tx) {
        failure="query cancelled or peripheral not clean before TX";goto cleanup;
    }
    esp_rom_gpio_connect_out_signal(GPIO_NUM_4,twai_controller_periph_signals.controllers[0].tx_sig,false,false);
    if(!battery_tx_route_valid()){failure="query GPIO4 route invalid";goto cleanup;}
    battery_query_phase="request";
    spard_read_frame_t request[2];spard_information_read_frames(request);
    for(unsigned i=0;i<2;i++){
        if(!battery_tx_one(&request[i],i,deadline)){failure="query frame not acknowledged or cancelled; no retry";goto cleanup;}
        if(!i)vTaskDelay(1);
    }
    battery_query_phase="response";
    battery_packet_t packet={0};bool echo_seen[2]={false,false};
    while((uint64_t)esp_timer_get_time()<deadline){
        if(battery_cancelled() || !battery_tx_route_valid() || !battery_driver_clean(&status)) {
            failure="query cancelled or CAN receive error";goto cleanup;
        }
        twai_message_t m;
        if(twai_receive(&m,pdMS_TO_TICKS(2))==ESP_OK){
            accept_frame(&m);
            for(unsigned j=0;j<2;j++)if(!echo_seen[j] && !m.extd && !m.rtr && m.identifier==request[j].id && m.data_length_code==request[j].dlc && !memcmp(m.data,request[j].data,request[j].dlc)){echo_seen[j]=true;battery_diag.self_echo_frames++;}
            if(battery_packet_feed(&packet,&m,esp_timer_get_time())){battery_response_valid=true;break;}
        }
        vTaskDelay(1);
    }
    if(!battery_response_valid)failure="query timeout; no complete valid90-byte reply";
    LOCK();bool lost=stats.queue_drops!=actual.drops[0] || stats.usb_drops!=actual.drops[1] || stats.control_drops!=actual.drops[4];UNLOCK();
    if(lost)failure="query raw-frame delivery loss";
cleanup:;
    // Restore the physical inhibit before any driver stop/uninstall call.
    reader_rmt_hold_us=(uint64_t)esp_timer_get_time();
    bool held=reader_ctx_hold();
    if(!held)failure="query CTX restore failed";
    char stop[]="STOP";handle_command(stop,outcome);
    if(!reader_rmt_cleanup())failure="query hardware capture cleanup failed";
    atomic_store(&battery_query_active,false);
    if(!failure && (outcome->error[0] || installed || !reader_ctx_guard().valid))failure="query cleanup incomplete";
    battery_query_phase=failure?"failed":"complete";
    if(failure && !outcome->error[0])command_error_reply(outcome,failure);
    battery_tx_diagnostic();
    char event[560];
    snprintf(event,sizeof(event),"{\"type\":\"battery_query_result\",\"boot\":\"%s\",\"epoch\":%" PRIu32 ",\"request\":\"information00\",\"read_mode\":\"%s\",\"state\":\"%s\",\"tx_attempted\":%u,\"tx_acknowledged\":%u,\"response_valid\":%s,\"ctx_restored\":%s,\"driver_retained\":%s}\n",
        boot_text,stats.epoch,quiet?"quiet":"normal",battery_query_phase,battery_tx_attempted,battery_tx_acknowledged,
        battery_response_valid?"true":"false",reader_ctx_guard().valid?"true":"false",installed?"true":"false");
    reply(event);
}

static void battery_information_query(command_outcome_t *outcome){battery_information_query_mode(outcome,false);}
