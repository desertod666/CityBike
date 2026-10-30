/* Execute actual firmware, including USB dispatch and cleanup, with injected
 * peripheral/pad/transceiver failures. No physical USB/CAN access. */
#define READER_TEST_BATTERY_QUERY
#define READER_TEST_SELFTEST
#define main lifecycle_regression_main
#include "test_firmware_lifecycle.c"
#undef main

static unsigned stage_number, sent, fail_stage, installs;
static enum { PROBE_OK, RX_STUCK_HIGH, TX_STUCK_HIGH, LOW_SET_FAIL,
    HIGH_SET_FAIL, CANCEL_WHILE_LOW, USB_LOST_WHILE_LOW, IDLE_LOW,
    RX_CONFIG_FAIL, RX_CONFIG_WRONG_MUX, RX_CONFIG_OUTPUT, RX_CONFIG_PULLUP } probe_fault;
static unsigned probe_lows, probe_delivered, probe_high_failed;
static bool probe_usb_lost;
static unsigned low_wait_ticks, cancel_after_ticks, usb_loss_after_ticks;
static uint64_t probe_low_at, probe_high_at;
int fake_probe_config(const gpio_config_t *c) {
    assert(!installed && !fake_driver_installed && atomic_load(&battery_query_active));
    assert(c->pin_bit_mask == BIT(5) && c->mode == GPIO_MODE_INPUT && !c->pull_up_en && !c->pull_down_en && !c->intr_type);
    if (probe_fault == RX_CONFIG_FAIL) return ESP_FAIL;
    fake_reg[4] = FUN_IE | (PIN_FUNC_GPIO << MCU_SEL_S); fake_reg[0] &= ~BIT(5);
    if (probe_fault == RX_CONFIG_WRONG_MUX) fake_reg[4] &= ~MCU_SEL_M;
    if (probe_fault == RX_CONFIG_OUTPUT) fake_reg[0] |= BIT(5);
    if (probe_fault == RX_CONFIG_PULLUP) fake_reg[4] |= FUN_PU;
    return ESP_OK;
}
int fake_probe_set(int pin, int level) {
    if (pin != 4) return ESP_OK;
    if (!level) {
        assert(!installed && !fake_driver_installed && atomic_load(&battery_query_active));
        assert(installs == 2 && sent == 2 && fake_pad == 1);
        assert((fake_reg[4] & MCU_SEL_M) == (PIN_FUNC_GPIO << MCU_SEL_S) && !(fake_reg[0] & BIT(5)));
        probe_low_at = fake_clock;
        probe_lows++;
        if (probe_fault == LOW_SET_FAIL) return ESP_FAIL;
        fake_reg[1] &= ~BIT(4); fake_pad = probe_fault == TX_STUCK_HIGH ? 1 : 0;
        if (probe_fault == CANCEL_WHILE_LOW) atomic_store(&battery_query_cancel, true);
        if (probe_fault == USB_LOST_WHILE_LOW) probe_usb_lost = true;
        probe_delivered++;
    } else {
        if (probe_delivered) probe_high_at = fake_clock;
        if (probe_fault == HIGH_SET_FAIL && probe_delivered && !probe_high_failed++) return ESP_FAIL;
        fake_reg[1] |= BIT(4); fake_pad = 1;
    }
    return ESP_OK;
}
int fake_probe_get(int pin) {
    if (pin == 4) return fake_pad;
    if (pin != 5) return 1;
    if (probe_fault == IDLE_LOW && installs == 2 && !fake_driver_installed) return 0;
    return !fake_pad && probe_fault != RX_STUCK_HIGH ? 0 : 1;
}
static enum { NOMINAL, BIT_ERROR, NO_ECHO, WRONG_ECHO, USB_DROP, STOP_CANCEL,
    BAD_RX_ROUTE, STATUS_FAIL, INSTALL_FAIL, START_FAIL, STOP_FAIL, UNINSTALL_FAIL,
    TRANSMIT_FAIL, ROUTE_CHANGED, RX_OVERFLOW, WRONG_DLC, WRONG_DATA } injected;

void fake_selftest_install(const twai_general_config_t *g, const twai_timing_config_t *t) {
    assert(reader_ctx_guard().valid); /* Every install must begin inhibited. */
    assert(g->mode == TWAI_MODE_NO_ACK && g->tx_io == 10 && !g->tx_queue_len && g->rx_queue_len == 8);
    assert(t->quanta_resolution_hz == 4000000 && t->triple_sampling);
    stage_number = ++installs;
    assert((stage_number <= 3 && g->rx_io == (int[]){10, 4, 5}[stage_number - 1]));
    GPIO.func_in_sel_cfg[TWAI_RX_IDX].in_sel = g->rx_io;
    GPIO.func_in_sel_cfg[TWAI_RX_IDX].sig_in_sel = 1;
    GPIO.func_in_sel_cfg[TWAI_RX_IDX].sig_in_inv = 0;
    if (stage_number == fail_stage) {
        if (injected == BAD_RX_ROUTE) GPIO.func_in_sel_cfg[TWAI_RX_IDX].in_sel = 0;
        if (injected == INSTALL_FAIL) fake_install_fail = 1;
        if (injected == START_FAIL) fake_start_fail = 1;
        if (injected == STATUS_FAIL) fake_status_fail = 1;
        if (injected == STOP_FAIL) fake_stop_fail = 1;
        if (injected == UNINSTALL_FAIL) fake_uninstall_fail = 1;
    }
}
void fake_query_status(twai_status_info_t *s) {
    if (stage_number == fail_stage && injected == BIT_ERROR && sent == stage_number) {
        s->tx_failed_count = s->bus_error_count = 1; s->tx_error_counter = 8;
        fake_ecc.count = 1; fake_ecc.total = 1;
        fake_ecc.events[0] = (error_ecc_event_t){.event = 1, .t_us = fake_clock, .capture = 129};
    }
    if (stage_number == fail_stage && injected == RX_OVERFLOW && sent == stage_number) s->rx_missed_count = 1;
}
int fake_query_transmit(const twai_message_t *m) {
    assert(atomic_load(&reader_selftest_driver) && atomic_load(&battery_query_active));
    assert(m->identifier == READER_SELFTEST_FRAME_ID && m->data_length_code == 8 && !m->extd && !m->rtr && m->ss && m->self);
    assert(stage_number == sent + 1); /* At most one frame per stage, no retry. */
    sent++;
    if (stage_number == fail_stage) {
        if (injected == TRANSMIT_FAIL) return ESP_FAIL;
        if (injected == STOP_CANCEL) atomic_store(&battery_query_cancel, true);
        if (injected == ROUTE_CHANGED) fake_reg[2] = SIG_GPIO_OUT_IDX;
    }
    if (stage_number != fail_stage || injected != NO_ECHO) {
        twai_message_t echo = *m;
        if (stage_number == fail_stage && injected == WRONG_ECHO) echo.identifier++;
        if (stage_number == fail_stage && injected == WRONG_DLC) echo.data_length_code = 0;
        if (stage_number == fail_stage && injected == WRONG_DATA) echo.data[7] = 1;
        assert(xQueueSend(fake_rx, &echo, 0));
    }
    return ESP_OK;
}
bool fake_query_connected(void) {
    return !probe_usb_lost && !(stage_number == fail_stage && injected == USB_DROP && sent == stage_number);
}
void fake_query_route(int gpio, int signal) { assert(gpio == 4); fake_reg[2] = signal; }
void fake_query_received(void) {}
void fake_query_delay(unsigned ticks) {
    if (probe_delivered && !fake_pad) {
        low_wait_ticks += ticks;
        if (cancel_after_ticks && low_wait_ticks >= cancel_after_ticks) atomic_store(&battery_query_cancel, true);
        if (usb_loss_after_ticks && low_wait_ticks >= usb_loss_after_ticks) probe_usb_lost = true;
    }
}
void fake_query_stopping(void) {
    assert(reader_ctx_guard().valid);
    if (stage_number == 3 && injected == BIT_ERROR) {
        fake_ecc.total = 2; fake_ecc.events[0].event = 2; fake_ecc.events[0].capture = 17;
    }
}

static void setup(void) {
    reset_test();
    atomic_store(&battery_query_active, false); atomic_store(&battery_query_cancel, false);
    atomic_store(&battery_normal_driver, false); atomic_store(&reader_selftest_driver, false);
    installed = false; fake_driver_installed = false; stats.running = false;
    stage_number = sent = fail_stage = installs = 0; injected = NOMINAL;
    probe_fault = PROBE_OK; probe_lows = probe_delivered = probe_high_failed = 0; probe_usb_lost = false;
    probe_low_at = probe_high_at = 0; fake_reg[4] = FUN_IE; /* Boot/JTAG mux must be configured by actual probe. */
    low_wait_ticks = cancel_after_ticks = usb_loss_after_ticks = 0;
    stats.received = 37; /* Existing real frames must stay untouched. */
}
static void run(void) {
    command_t c = {.text = "SELFTEST ISOLATED", .id = "selftest-fixture"};
    execute_command(&c); flush_replies();
    assert(stats.received == 37 && !frames->count && !fake_rx->count);
    assert(reader_ctx_guard().valid && !atomic_load(&battery_query_active));
    assert(strstr(fake_wire, "\"type\":\"reader_selftest_result\""));
    assert(!strstr(fake_wire, "\"type\":\"frame\"") && !strstr(fake_wire, "battery_query_result"));
}
int main(void) {
    setup(); run(); assert(sent == 3 && installs == 3 && !installed && !atomic_load(&reader_selftest_driver));
    for (unsigned i = 0; i < 3; i++) assert(reader_selftest_stages[i].passed && reader_selftest_stages[i].attempted == 1);
    assert(strstr(fake_wire, "\"state\":\"complete\"") && strstr(fake_wire, "\"ok\":true"));
    assert(reader_gpio_probe.passed && probe_lows == 1 && probe_delivered == 1);
    if (getenv("READER_TEST_WIRE")) puts(fake_wire);
    for (unsigned stage = 1; stage <= 3; stage++) {
        for (unsigned error = BIT_ERROR; error <= WRONG_DATA; error++) {
            if (error == ROUTE_CHANGED && stage == 1) continue;
            setup(); fail_stage = stage; injected = error; run();
            assert(installs == stage && !reader_selftest_stages[stage - 1].passed);
            if (stage == 3 && error == BIT_ERROR) {
                assert(strstr(reader_selftest_stage3_ecc, "\"raw\":129"));
                assert(fake_ecc.total == 2 && fake_ecc.events[0].capture == 17);
                assert(!strstr(reader_selftest_stage3_ecc, "\"raw\":17"));
            }
            assert(strstr(fake_wire, "\"state\":\"failed\"") && strstr(fake_wire, "\"ok\":false"));
            if (getenv("READER_SELFTEST_FAILURE_FIXTURE") && stage == 2 && (error == BIT_ERROR || error == UNINSTALL_FAIL)) puts(fake_wire);
            for (unsigned i = stage; i < 3; i++) assert(!reader_selftest_stages[i].attempted);
            if (error == STOP_FAIL || error == UNINSTALL_FAIL) {
                assert(installed && atomic_load(&reader_selftest_driver));
                /* A subsequent normal STOP must also discard synthetic frames. */
                twai_message_t echo = {.identifier = READER_SELFTEST_FRAME_ID}; xQueueSend(fake_rx, &echo, 0);
                fake_stop_fail = fake_uninstall_fail = 0;
                command_t stop = {.text = "STOP", .id = "cleanup"}; execute_command(&stop); flush_replies();
                assert(!installed && !atomic_load(&reader_selftest_driver) && stats.received == 37);
            } else assert(!installed && !atomic_load(&reader_selftest_driver));
        }
    }
    for (unsigned fault = RX_STUCK_HIGH; fault <= RX_CONFIG_PULLUP; fault++) {
        setup(); probe_fault = fault; run();
        assert(installs == 2 && sent == 2 && !installed && !fake_driver_installed);
        assert(!reader_gpio_probe.passed && reader_gpio_probe.ctx_restored && !reader_selftest_stages[2].attempted);
        assert(!strcmp(reader_selftest_stages[2].reason, "gpio_probe_failed"));
        assert(strstr(fake_wire, "\"state\":\"failed\""));
        assert(probe_lows == (fault >= IDLE_LOW ? 0 : 1));
    }
    setup(); command_t meter = {.text="SELFTEST VOLTMETER ISOLATED", .id="meter-fixture"};
    execute_command(&meter); flush_replies();
    assert(reader_gpio_probe.passed && reader_gpio_probe.rx_config_valid && installs == 3 && probe_lows == 1);
    assert(probe_high_at - probe_low_at >= 8000000 && probe_high_at - probe_low_at < 8010000);
    assert(reader_ctx_guard().valid && !installed && !atomic_load(&battery_query_active));
    for (unsigned fault = CANCEL_WHILE_LOW; fault <= USB_LOST_WHILE_LOW; fault++) {
        setup(); probe_fault = fault; execute_command(&meter); flush_replies();
        assert(!reader_gpio_probe.passed && reader_ctx_guard().valid && installs == 2 && !installed);
        assert(probe_high_at - probe_low_at < 10000);
    }
    for (unsigned usb = 0; usb < 2; usb++) {
        setup(); if (usb) usb_loss_after_ticks = 100; else cancel_after_ticks = 100;
        execute_command(&meter); flush_replies();
        assert(!reader_gpio_probe.passed && reader_ctx_guard().valid && installs == 2 && !installed);
        assert(probe_high_at - probe_low_at >= 100000 && probe_high_at - probe_low_at < 1000000);
    }
    setup(); command_t meter_rpc = {.text="SELFTEST VOLTMETER ISOLATED", .id="meter-rpc", .token=1};
    execute_command(&meter_rpc); flush_replies(); assert(!installs && !probe_lows);
    setup(); command_t meter_legacy = {.text="SELFTEST VOLTMETER ISOLATED"};
    execute_command(&meter_legacy); flush_replies(); assert(!installs && !probe_lows);
    setup(); command_t uncorrelated = {.text = "SELFTEST ISOLATED"}; execute_command(&uncorrelated); flush_replies(); assert(!installs);
    setup(); command_t rpc = {.text = "SELFTEST ISOLATED", .id = "rpc", .token = 1}; execute_command(&rpc); flush_replies(); assert(!installs);
    setup(); installed = true; fake_driver_installed = true;
    command_t busy = {.text = "SELFTEST ISOLATED", .id = "busy"}; execute_command(&busy); flush_replies(); assert(!installs);
    setup(); atomic_store(&stop_fences, 1); execute_command(&busy); flush_replies(); assert(!installs);
    setup(); rx_check.state = RX_RUNNING; execute_command(&busy); flush_replies(); assert(!installs);
    setup(); atomic_store(&battery_query_cancel, true); execute_command(&busy); flush_replies(); assert(!installs);
    puts("PASS isolated selftest: single GPIO pulse with driver absent, stuck TX/RX, set/restore failure, cancel/USB loss and idle fault; fixed single-shot CAN echoes and inhibit-first cleanup; zero synthetic bike frames");
    return 0;
}
