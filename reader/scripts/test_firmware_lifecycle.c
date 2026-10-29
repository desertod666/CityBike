// Host fault-injection test includes the actual firmware command and USB writer implementation.
#include "../src/main.c"
#include "../src/rx_readback.c"
uint32_t fake_reg[7];int fake_pad,fake_gpio_fail,fake_status_fail,fake_stop_fail,fake_uninstall_fail,fake_install_fail,fake_start_fail;
fake_gpio_t GPIO;fake_twai_t fake_twai_regs;bool fake_twai_access_allowed=true;unsigned fake_twai_reads,fake_clock_reads;uint32_t fake_apb_hz=80000000;int fake_clock_error;
void fake_during_clock_read(void){}
int fake_driver_installed,fake_driver_state,fake_status_calls,fake_status_fail_on;uint64_t fake_clock,fake_usb_fail_until;bool fake_usb_always_fail;char fake_wire[200000];size_t fake_wire_size;QueueHandle_t fake_rx;
error_probe_t reader_error_probe(void){return (error_probe_t){0};}
error_ecc_history_t reader_error_ecc_history(void){return (error_ecc_history_t){0};}
int web_config_init(void){return 0;}int web_start(void){return 0;}int web_save_ap(const char*s,int c){(void)s;(void)c;return 0;}int web_save_led(int l){(void)l;return 0;}
void web_network_snapshot(reader_network_t*out){memset(out,0,sizeof(*out));strcpy(out->ssid,"Reader");strcpy(out->mac,"e0:72:a1:72:25:0d");}
static void reset_test(void){
    fake_queue_free(frames);fake_queue_free(replies);fake_queue_free(commands);fake_queue_free(completion_failures);fake_queue_free(rpc_replies);fake_queue_free(fake_rx);
    frames=xQueueCreate(FRAME_QUEUE_LEN,sizeof(frame_t));replies=xQueueCreate(8,sizeof(reply_t));commands=xQueueCreate(8,sizeof(command_t));completion_failures=xQueueCreate(2,sizeof(reply_t));rpc_replies=xQueueCreate(1,sizeof(rpc_reply_t));fake_rx=xQueueCreate(128,sizeof(twai_message_t));
    memset(&stats,0,sizeof(stats));stats.sampling=RX_SAMPLE_TRIPLE;memset(&rx_check,0,sizeof(rx_check));memset(fake_reg,0,sizeof(fake_reg));
    memset(&hardware_readback,0,sizeof(hardware_readback));memset(&GPIO,0,sizeof(GPIO));memset(&fake_twai_regs,0,sizeof(fake_twai_regs));
    fake_twai_reads=fake_clock_reads=0;fake_clock_error=0;fake_apb_hz=80000000;
    fake_twai_regs.mode_reg.val=2;fake_twai_regs.bus_timing_0_reg.val=0x4009;fake_twai_regs.bus_timing_1_reg.val=0x3a;
    fake_reg[4]=FUN_IE|(PIN_FUNC_GPIO<<MCU_SEL_S);GPIO.func_in_sel_cfg[TWAI_RX_IDX].in_sel=5;GPIO.func_in_sel_cfg[TWAI_RX_IDX].sig_in_sel=1;
    fake_gpio_fail=fake_status_fail=fake_stop_fail=fake_uninstall_fail=fake_install_fail=fake_start_fail=0;fake_status_calls=fake_status_fail_on=0;
    fake_pad=1;fake_clock=100;fake_usb_fail_until=0;fake_usb_always_fail=false;fake_wire_size=0;fake_wire[0]=0;
    base_missed=base_overruns=base_bus=base_arb=base_failed=0;atomic_store(&stop_fences,0);command_guard=false;
    installed=true;fake_driver_installed=true;stats.running=true;stats.bitrate=250000;stats.epoch=7;fake_driver_state=TWAI_STATE_RUNNING;
    stats.timing_hz=4000000;stats.timing_seg1=11;stats.timing_seg2=4;stats.timing_sjw=2;
    assert(reader_ctx_init()==ESP_OK);strcpy(boot_text,"12345678");
}
static void queued_rx(unsigned n){for(unsigned i=0;i<n;i++){twai_message_t m={.identifier=0x02f83201+i,.extd=true,.data_length_code=8,.data={1,2,3,4,5,6,7,8}};if(i==1){m.rtr=true;m.data_length_code=2;}assert(xQueueSend(fake_rx,&m,0));}}
static void flush_replies(void){reply_t r;while(xQueueReceive(completion_failures,&r,0))write_completion(&r);while(xQueueReceive(replies,&r,0))write_completion(&r);}
int main(void){
    command_t stop={.text="STOP",.id="stop-1"};command_outcome_t o;
    reset_test();queued_rx(3);execute_command(&stop);
    assert(!installed&&!stats.running&&stats.received==3&&stats.stop_drops==0&&fake_rx->count==0&&frames->count==3&&atomic_load(&stop_fences)==1);
    command_t start={.text="START 250000",.id="start-early"};execute_command(&start);assert(!installed);
    flush_replies();assert(atomic_load(&stop_fences)==0);
    char *last=strstr(fake_wire,"\"seq\":3"),*end=strstr(fake_wire,"\"type\":\"stream_end\""),*result=strstr(fake_wire,"\"type\":\"command_result\"");
    assert(last&&end&&result&&last<end&&end<result&&strstr(end,"\"final_seq\":3")&&strstr(result,"\"ok\":true"));
    assert(strstr(fake_wire,"\"rtr\":true,\"dlc\":2,\"data\":\"\""));
    assert(strstr(fake_wire,"\"received_semantics\":\"application_dequeued\"")&&strstr(fake_wire,"\"error_counters_valid\":false"));
    assert(strstr(fake_wire,"\"hardware_readback\":")&&strstr(fake_wire,"\"registers_read\":false"));
    if(getenv("READER_TEST_WIRE")) puts(fake_wire);
    reset_test();fake_reg[1]=0;fake_pad=0;fake_status_fail=1;memset(&o,0,sizeof(o));char cmd1[]="STOP";handle_command(cmd1,&o);
    assert(reader_ctx_guard().valid&&o.error[0]&&!o.stop_fence&&!stats.running&&installed);
    reset_test();queued_rx(2);fake_status_fail_on=2;memset(&o,0,sizeof(o));char cmd_status[]="STOP";handle_command(cmd_status,&o);
    assert(o.error[0]&&!o.stop_fence&&!stats.running&&installed&&stats.received==2);
    reset_test();fake_reg[1]=0;fake_pad=0;fake_stop_fail=1;memset(&o,0,sizeof(o));char cmd2[]="STOP";handle_command(cmd2,&o);
    assert(reader_ctx_guard().valid&&o.error[0]&&!o.stop_fence&&stats.running&&installed);
    reset_test();queued_rx(3);fake_uninstall_fail=1;memset(&o,0,sizeof(o));char cmd3[]="STOP";handle_command(cmd3,&o);
    assert(reader_ctx_guard().valid&&o.error[0]&&!o.stop_fence&&!stats.running&&installed&&frames->count==3);
    reset_test();fake_reg[1]=0;fake_pad=0;fake_gpio_fail=1;memset(&o,0,sizeof(o));char cmd4[]="STOP";handle_command(cmd4,&o);
    assert(!reader_ctx_guard().valid&&o.error[0]&&!o.stop_fence&&!stats.running&&!installed);
    reset_test();twai_message_t m={0};for(unsigned i=0;i<FRAME_QUEUE_LEN;i++)accept_frame(&m);queued_rx(3);execute_command(&stop);assert(stats.queue_drops==3&&stats.received==259);flush_replies();assert(strstr(fake_wire,"\"final_seq\":259")&&strstr(fake_wire,"\"frame_queue_drops\":3"));
    reset_test();reply_t filler={.text="{}\n"};for(unsigned i=0;i<8;i++)assert(queue_reply(&filler));execute_command(&stop);assert(atomic_load(&stop_fences)==0&&completion_failures->count==1);flush_replies();assert(strstr(fake_wire,"\"ok\":false")&&strstr(fake_wire,"completion queue full")&&!strstr(fake_wire,"\"type\":\"stream_end\""));
    reset_test();execute_command(&stop);reply_t r;assert(xQueueReceive(replies,&r,0));write_completion(&r);assert(xQueueReceive(replies,&r,0)&&r.fence);fake_usb_fail_until=fake_clock+260000;write_completion(&r);assert(strstr(fake_wire,"\"ok\":false")&&strstr(fake_wire,"stream end delivery failed")&&atomic_load(&stop_fences)==0);
    reset_test();installed=false;stats.running=false;fake_reg[1]=0;fake_pad=0;memset(&o,0,sizeof(o));char cmd5[]="START invalid";handle_command(cmd5,&o);assert(reader_ctx_guard().valid&&o.error[0]&&!installed);
    reset_test();installed=false;stats.running=false;fake_start_fail=fake_uninstall_fail=1;memset(&o,0,sizeof(o));char cmd6[]="START 250000";handle_command(cmd6,&o);assert(reader_ctx_guard().valid&&o.error[0]&&installed&&!stats.running);
    reset_test();memset(&o,0,sizeof(o));command_error_reply(&o,"this command failed");error_reply("unrelated USB input error");assert(!strcmp(o.error,"this command failed"));
    // STATUS reads registers in the CAN owner; web/USB serialization only reads its cache.
    reset_test();command_t status={.text="STATUS",.id="hardware-status"};execute_command(&status);
    assert(hardware_readback.driver_installed&&!hardware_readback.mismatch_bits);
    unsigned reads=fake_twai_reads;fake_twai_access_allowed=false;
    struct {char text[READER_STATUS_SIZE];unsigned char canary[8];} bounded;
    memset(&bounded,0xa5,sizeof(bounded));reader_status_json(bounded.text,sizeof(bounded.text));
    assert(fake_twai_reads==reads&&strstr(bounded.text,"\"btr0_raw\":16393")&&bounded.text[strlen(bounded.text)-1]=='\n');
    for(unsigned i=0;i<sizeof(bounded.canary);i++)assert(bounded.canary[i]==0xa5);
    fake_twai_access_allowed=true;
    // Long-lived counters and fully escaped envelopes must fit both STATUS and USB records.
    stats.received=stats.queue_drops=stats.usb_drops=stats.control_drops=stats.stop_drops=stats.command_drops=UINT64_MAX;
    stats.missed=stats.overruns=stats.bus_errors=stats.arb_lost=stats.tx_failed=UINT64_MAX;
    stats.rec=stats.tec=stats.rx_pending=stats.state=stats.epoch=UINT32_MAX;fake_clock=1234567890123456;
    refresh_hardware_readback();reader_status_json(bounded.text,sizeof(bounded.text));
    assert(strlen(bounded.text)<READER_STATUS_SIZE-1&&bounded.text[strlen(bounded.text)-1]=='\n');
    for(unsigned i=0;i<sizeof(bounded.canary);i++)assert(bounded.canary[i]==0xa5);
    command_t longest={0};memset(longest.id,'a',sizeof(longest.id)-1);memset(longest.text,'"',sizeof(longest.text)-1);
    char long_error[120];memset(long_error,'"',sizeof(long_error)-1);long_error[sizeof(long_error)-1]=0;
    reply_t worst={.final_seq=UINT64_MAX};result_prefix(&worst,&longest,long_error);append_result_status(&worst);
    assert(strlen(worst.text)<4096&&worst.text[strlen(worst.text)-1]=='\n');
    if(getenv("READER_TEST_WIRE"))puts(worst.text);
    printf("PASS bounded STATUS/command_result: %zu/%zu bytes; USB record remains below4096, cache serialization does not read TWAI\n",strlen(bounded.text),strlen(worst.text));
    reset_test();fake_queue_free(frames);fake_queue_free(replies);fake_queue_free(commands);fake_queue_free(completion_failures);fake_queue_free(rpc_replies);fake_queue_free(fake_rx);
    puts("PASS actual firmware: fail-safe START/STOP, driver failures, raw RX drain, RTR, sequence fence ordering, saturation/fence failures and local outcomes");
    return 0;
}
