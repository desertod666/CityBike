/* Actual native fixed query under separate zero-error, no-minimum-traffic
 * admission. A quiet interval must NEVER grant normal noisy-bus admission. */
#define READER_BATTERY_TEST_HELPERS_ONLY
#include "test_battery_query.c"

static void quiet_setup(unsigned errors) {
    init_query();
    installed=true;fake_driver_installed=true;fake_driver_state=TWAI_STATE_RUNNING;stats.running=true;
    stats.received=stats.bus_errors=0;stats.epoch++;
    tx_policy_init(&battery_quality,55);
    tx_policy_begin(&battery_quality,battery_tx_snapshot());
    fake_clock+=TX_QUIET_QUALIFY_US+10000;stats.bus_errors=errors;base_bus=errors;
    command_t stop={.text="STOP",.id="quiet-qualify"};execute_command(&stop);flush_replies();
    assert(!installed&&!battery_quality.qualified);
    assert(battery_quality.quiet_qualified==(errors==0));
}
int main(void) {
    quiet_setup(0);
    tx_policy_t normal=battery_quality;
    assert(!tx_policy_arm(&normal,normal.challenge,battery_tx_snapshot(),true,true));
    command_t quiet={.text="SPARD QUIET INFO",.id="quiet-info"};
    execute_command(&quiet);flush_replies();
    assert(tx_calls==2&&battery_tx_acknowledged==2&&battery_response_valid);
    assert(!installed&&!stats.running&&reader_ctx_guard().valid&&stats.received==12);
    assert(strstr(fake_wire,"\"read_mode\":\"quiet\"")&&strstr(fake_wire,"\"state\":\"complete\""));
    unsigned before=tx_calls;execute_command(&quiet);assert(tx_calls==before); /* One use. */
    quiet_setup(1);execute_command(&quiet);assert(!tx_calls&&!route_calls);
    quiet_setup(0);stats.usb_drops++;execute_command(&quiet);assert(!tx_calls);
    quiet_setup(0);stats.epoch++;execute_command(&quiet);assert(!tx_calls);
    quiet_setup(0);fake_clock+=TX_QUALITY_FRESH_US+1;execute_command(&quiet);assert(!tx_calls);
    quiet_setup(0);command_t rpc={.text="SPARD QUIET INFO",.id="rpc",.token=1};execute_command(&rpc);assert(!tx_calls);
    quiet_setup(0);command_t legacy={.text="SPARD QUIET INFO"};execute_command(&legacy);assert(!tx_calls);
    quiet_setup(0);ack_fail_at=1;execute_command(&quiet);assert(tx_calls==1&&!battery_tx_acknowledged&&!battery_response_valid&&!installed&&reader_ctx_guard().valid);
    quiet_setup(0);corrupt=1;execute_command(&quiet);assert(tx_calls==2&&!battery_response_valid&&!installed&&reader_ctx_guard().valid);
    /* Exact five-second boundary, no inferred session state or traffic quota. */
    for(unsigned i=0;i<3;i++) {
        tx_policy_t p;tx_policy_init(&p,5);
        tx_snapshot_t a={.now_us=100,.bitrate=250000,.sampling=2,.epoch=1,.ctx_valid=true},b=a;
        tx_policy_begin(&p,a);b.now_us+=TX_QUIET_QUALIFY_US-1+i;
        assert(!tx_policy_finish(&p,b));assert(p.quiet_qualified==(i>=1));assert(!p.qualified);
    }
    puts("PASS actual quiet query: 5s/zero-traffic accepted only for explicit USB quiet command, normal30s100frames unchanged, strict zeroerrors/loss/scope/freshness/oneuse/ACK/full90Breply guards");
    return 0;
}
