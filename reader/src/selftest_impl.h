/* CAN-owner only. SELFTEST ISOLATED is a physical-disconnection assertion:
 * bike CAN-H/CAN-L must be detached; GPIO10 must have no external wiring.
 * No battery protocol bytes, eight zero bytes are not a battery request; no general transmit endpoint, no automatic run.
 * NO_ACK tolerates a missing ACK only; all bit/driver errors still fail. */
#include "soc/gpio_struct.h"

#define READER_SELFTEST_STAGES 3
#define READER_SELFTEST_FRAME_ID UINT32_C(0x666)
#define READER_SELFTEST_FRAME_DLC 8
#define READER_SELFTEST_STAGE_US UINT64_C(30000)

typedef struct {
    const char *name, *reason;
    unsigned rx_gpio, tx_gpio, attempted;
    bool started, received, passed, status_valid, ctx_restored, driver_retained;
    int install_rc, start_rc, transmit_rc, status_rc, stop_rc, uninstall_rc;
    twai_status_info_t status;
    twai_message_t echo;
    bool echo_observed;
    uint32_t alerts, elapsed_us, tx_out_raw, rx_matrix_raw;
} reader_selftest_stage_t;
static reader_selftest_stage_t reader_selftest_stages[READER_SELFTEST_STAGES];
#include "isolated_gpio_probe.h"
static char reader_selftest_stage3_ecc[360];

/* Additional refusal only: an idle RX pin is NOT evidence of physical isolation.
 * A visible dominant bit means the physical assertion/setup must be rechecked. */
static bool reader_selftest_quiet_rx(void) {
    uint64_t deadline = (uint64_t)esp_timer_get_time() + UINT64_C(25000);
    for (unsigned i = 0; i < 50000; i++) {
        if (!gpio_get_level(GPIO_NUM_5) || battery_cancelled()) return false;
        if ((uint64_t)esp_timer_get_time() >= deadline) return true;
        if (!(i & 1023)) vTaskDelay(1);
    }
    return false;
}

static bool reader_is_selftest(const char *text) {
    const char *fixed[] = {"SELFTEST ISOLATED", "SELFTEST VOLTMETER ISOLATED"};
    if (!text) return false;
    for (unsigned j = 0; j < 2; j++) {
        if (strlen(text) != strlen(fixed[j])) continue;
        bool same = true;
        for (unsigned i = 0; fixed[j][i]; i++)
            if (toupper((unsigned char)text[i]) != fixed[j][i]) { same = false; break; }
        if (same) return true;
    }
    return false;
}

static bool reader_selftest_rx_route(unsigned pin) {
    return GPIO.func_in_sel_cfg[TWAI_RX_IDX].sig_in_sel &&
        GPIO.func_in_sel_cfg[TWAI_RX_IDX].in_sel == pin &&
        !GPIO.func_in_sel_cfg[TWAI_RX_IDX].sig_in_inv;
}

static bool reader_selftest_route(reader_selftest_stage_t *s) {
    s->tx_out_raw = REG_READ(GPIO_FUNC4_OUT_SEL_CFG_REG);
    s->rx_matrix_raw = GPIO.func_in_sel_cfg[TWAI_RX_IDX].val;
    return reader_selftest_rx_route(s->rx_gpio) &&
        (s->tx_gpio == 4 ? battery_tx_route_valid() : reader_ctx_guard().valid);
}

static bool reader_selftest_status(reader_selftest_stage_t *s) {
    s->status_rc = twai_get_status_info(&s->status);
    s->status_valid = s->status_rc == ESP_OK;
    uint32_t alerts = 0;
    if (twai_read_alerts(&alerts, 0) == ESP_OK) s->alerts |= alerts;
    if (!s->status_valid) { s->reason = "status_read_failed"; return false; }
    if (s->status.state != TWAI_STATE_RUNNING || s->status.tx_failed_count ||
        s->status.bus_error_count || s->status.arb_lost_count ||
        s->status.rx_missed_count || s->status.rx_overrun_count ||
        s->status.tx_error_counter || s->status.rx_error_counter) {
        s->reason = "driver_error"; return false;
    }
    return true;
}

/* Never use accept_frame here. Synthetic echoes and any unexpected incoming
 * frames stay out of bicycle counters, preview, archive and dashboard caches. */
static void reader_selftest_cleanup(reader_selftest_stage_t *s) {
    s->ctx_restored = reader_ctx_hold();
    if (installed) {
        s->stop_rc = s->started ? twai_stop() : ESP_OK;
        if (s->stop_rc == ESP_OK) {
            LOCK(); stats.running = false; UNLOCK();
            twai_message_t discarded;
            for (unsigned i = 0; i < 128 && twai_receive(&discarded, 0) == ESP_OK; i++) {}
            s->uninstall_rc = twai_driver_uninstall();
            if (s->uninstall_rc == ESP_OK) {
                installed = false;
                atomic_store(&reader_selftest_driver, false);
                atomic_store(&battery_normal_driver, false);
            }
        }
    }
    s->driver_retained = installed;
    if (!s->ctx_restored || installed) { s->passed = false; s->reason = "cleanup_incomplete"; }
}

static void reader_selftest_stage(reader_selftest_stage_t *s) {
    uint64_t began = (uint64_t)esp_timer_get_time(), deadline = began + READER_SELFTEST_STAGE_US;
    uint32_t ecc_before = reader_error_ecc_history().total;
    twai_timing_config_t timing;
    if (!reader_ctx_hold()) { s->reason = "ctx_hold_failed"; goto done; }
    if (battery_cancelled()) { s->reason = "usb_or_stop_cancelled"; goto done; }
    if (!timing_for(250000, RX_SAMPLE_TRIPLE, &timing)) { s->reason = "timing_unavailable"; goto done; }
    twai_general_config_t g = TWAI_GENERAL_CONFIG_DEFAULT(READER_TWAI_TX_GPIO, s->rx_gpio, TWAI_MODE_NO_ACK);
    g.tx_queue_len = 0; g.rx_queue_len = 8;
    g.alerts_enabled = TWAI_ALERT_TX_SUCCESS | TWAI_ALERT_TX_FAILED | TWAI_ALERT_BUS_ERROR |
        TWAI_ALERT_BUS_OFF | TWAI_ALERT_RX_QUEUE_FULL | TWAI_ALERT_ARB_LOST;
    twai_filter_config_t filter = TWAI_FILTER_CONFIG_ACCEPT_ALL();
    s->install_rc = twai_driver_install(&g, &timing, &filter);
    if (s->install_rc != ESP_OK) { s->reason = "driver_install_failed"; goto done; }
    installed = true;
    atomic_store(&reader_selftest_driver, true);
    atomic_store(&battery_normal_driver, true);
    if (!reader_ctx_guard().valid) { s->reason = "ctx_changed_during_install"; goto done; }
    s->start_rc = twai_start();
    if (s->start_rc != ESP_OK) { s->reason = "driver_start_failed"; goto done; }
    s->started = true;
    LOCK(); stats.running = true; stats.bitrate = 250000;
    stats.timing_hz = timing.quanta_resolution_hz; stats.timing_seg1 = timing.tseg_1;
    stats.timing_seg2 = timing.tseg_2; stats.timing_sjw = timing.sjw; stats.timing_triple = timing.triple_sampling; UNLOCK();
    if (s->tx_gpio == 4)
        esp_rom_gpio_connect_out_signal(GPIO_NUM_4, twai_controller_periph_signals.controllers[0].tx_sig, false, false);
    if (!reader_selftest_route(s)) { s->reason = "gpio_route_invalid"; goto done; }
    if (!reader_selftest_status(s)) goto done;
    if (s->status.msgs_to_rx || s->status.msgs_to_tx) { s->reason = "unexpected_bus_activity"; goto done; }
    if (battery_cancelled() || (uint64_t)esp_timer_get_time() >= deadline) { s->reason = "cancelled_or_deadline"; goto done; }
    twai_message_t frame = {.identifier = READER_SELFTEST_FRAME_ID, .data_length_code = READER_SELFTEST_FRAME_DLC};
    frame.ss = 1; frame.self = 1;
    s->attempted = 1;
    s->transmit_rc = twai_transmit(&frame, 0);
    if (s->transmit_rc != ESP_OK) { s->reason = "transmit_api_rejected"; goto done; }
    while ((uint64_t)esp_timer_get_time() < deadline) {
        if (battery_cancelled()) { s->reason = "usb_or_stop_cancelled"; goto done; }
        if (!reader_selftest_route(s)) { s->reason = "gpio_route_changed"; goto done; }
        if (!reader_selftest_status(s)) goto done;
        if (s->status.msgs_to_rx > 1) { s->reason = "unexpected_bus_activity"; goto done; }
        twai_message_t echo = {0};
        if (twai_receive(&echo, 0) == ESP_OK) {
            s->echo = echo; s->echo_observed = true;
            static const uint8_t zero_data[8] = {0};
            if (s->received || echo.identifier != READER_SELFTEST_FRAME_ID || echo.extd || echo.rtr || echo.data_length_code != READER_SELFTEST_FRAME_DLC ||
                memcmp(echo.data, zero_data, sizeof(zero_data))) {
                s->reason = "unexpected_received_frame"; goto done;
            }
            s->received = true;
        }
        if (s->received && !s->status.msgs_to_tx) { s->passed = true; s->reason = "self_echo_verified"; goto done; }
        vTaskDelay(1);
    }
    s->reason = "self_echo_timeout";
done:
    if (s->rx_gpio == 5) {
        /* Snapshot before inhibition/STOP: their error flags must not replace
         * the original observation. Latest only; not necessarily first error. */
        error_ecc_history_t h = reader_error_ecc_history();
        char last[256] = "null";
        if (h.total > ecc_before) reader_last_ecc_json(h, last, sizeof(last));
        snprintf(reader_selftest_stage3_ecc, sizeof(reader_selftest_stage3_ecc),
            "{\"after_event\":%u,\"captured_before_cleanup\":true,\"last\":%s}", (unsigned)ecc_before, last);
    }
    reader_selftest_cleanup(s);
    s->elapsed_us = (uint32_t)((uint64_t)esp_timer_get_time() - began);
}

static void reader_selftest_result(const command_t *command, bool passed) {
    /* Static scratch belongs to CAN owner, avoiding another large CAN stack frame. */
    static char event[3900];
    int n = snprintf(event, sizeof(event),
        "{\"type\":\"reader_selftest_result\",\"id\":\"%s\",\"boot\":\"%s\",\"epoch\":%u,"
        "\"isolation_asserted\":true,\"bitrate\":250000,\"sampling\":\"TRIPLE\",\"ack_required\":false,\"test_frame_dlc\":8,"
        "\"state\":\"%s\",\"ctx_restored\":%s,\"driver_retained\":%s,"
        "\"gpio_probe\":{\"attempted\":%s,\"passed\":%s,\"ctx_restored\":%s,\"reason\":\"%s\","
        "\"driver_installed\":%s,\"low_hold_us\":%u,\"rx_config_rc\":%d,\"rx_config_valid\":%s,"
        "\"tx\":[%d,%d,%d],\"rx\":[%d,%d,%d],\"low_rc\":%d,\"high_rc\":%d},"
        "\"stage3_ecc\":%s,\"stages\":[",
        command->id, boot_text, (unsigned)stats.epoch, passed ? "complete" : "failed",
        reader_ctx_guard().valid ? "true" : "false", installed ? "true" : "false",
        reader_gpio_probe.attempted ? "true" : "false", reader_gpio_probe.passed ? "true" : "false",
        reader_gpio_probe.ctx_restored ? "true" : "false", reader_gpio_probe.reason,
        reader_gpio_probe.attempted ? "false" : "null",
        (unsigned)reader_gpio_probe.low_hold_us, reader_gpio_probe.rx_config_rc,
        reader_gpio_probe.rx_config_valid ? "true" : "false",
        reader_gpio_probe.tx[0], reader_gpio_probe.tx[1], reader_gpio_probe.tx[2],
        reader_gpio_probe.rx[0], reader_gpio_probe.rx[1], reader_gpio_probe.rx[2],
        reader_gpio_probe.low_rc, reader_gpio_probe.high_rc, reader_selftest_stage3_ecc);
    if (n < 0 || (size_t)n >= sizeof(event)) return;
    size_t used = (size_t)n;
    for (unsigned i = 0; i < READER_SELFTEST_STAGES; i++) {
        reader_selftest_stage_t *s = &reader_selftest_stages[i];
        char echo[180] = "null";
        if (s->echo_observed) {
            char data[17];
            for (unsigned j = 0; j < 8; j++) snprintf(data + j*2, 3, "%02X", s->echo.data[j]);
            snprintf(echo, sizeof(echo), "{\"id\":%u,\"extended\":%s,\"rtr\":%s,\"dlc\":%u,\"data\":\"%s\"}",
                (unsigned)s->echo.identifier, s->echo.extd ? "true" : "false", s->echo.rtr ? "true" : "false", (unsigned)s->echo.data_length_code, data);
        }
        n = snprintf(event + used, sizeof(event) - used,
            "%s{\"name\":\"%s\",\"tx_gpio\":%u,\"rx_gpio\":%u,\"attempted\":%u,\"passed\":%s,"
            "\"echo_received\":%s,\"reason\":\"%s\",\"status_valid\":%s,\"install_rc\":%d,\"start_rc\":%d,"
            "\"transmit_rc\":%d,\"status_rc\":%d,\"stop_rc\":%d,\"uninstall_rc\":%d,\"tx_errors\":%u,"
            "\"rx_errors\":%u,\"failed_tx\":%u,\"bus_errors\":%u,\"arbitration_lost\":%u,\"alerts\":%u,"
            "\"tx_out_raw\":%u,\"rx_matrix_raw\":%u,\"elapsed_us\":%u,\"rx_frame\":%s}",
            i ? "," : "", s->name, s->tx_gpio, s->rx_gpio, s->attempted, s->passed ? "true" : "false",
            s->received ? "true" : "false", s->reason, s->status_valid ? "true" : "false",
            s->install_rc, s->start_rc, s->transmit_rc, s->status_rc, s->stop_rc, s->uninstall_rc,
            (unsigned)s->status.tx_error_counter, (unsigned)s->status.rx_error_counter,
            (unsigned)s->status.tx_failed_count, (unsigned)s->status.bus_error_count, (unsigned)s->status.arb_lost_count,
            (unsigned)s->alerts, (unsigned)s->tx_out_raw, (unsigned)s->rx_matrix_raw, (unsigned)s->elapsed_us, echo);
        if (n < 0 || (size_t)n >= sizeof(event) - used) return;
        used += (size_t)n;
    }
    if (used + 4 >= sizeof(event)) return;
    memcpy(event + used, "]}\n", 4);
    reply(event);
}

static void reader_selftest_run(const command_t *command, command_outcome_t *outcome) {
    if (installed || rx_snapshot().state == RX_RUNNING || atomic_load(&stop_fences) ||
        atomic_load(&battery_query_active) || atomic_load(&battery_query_cancel) || !reader_ctx_guard().valid) {
        command_error_reply(outcome, "STOP and drain CAN/RXCHECK before isolated selftest"); return;
    }
    tx_policy_revoke(&battery_quality, true);
    if (!reader_selftest_quiet_rx()) {
        command_error_reply(outcome, "Selftest refused: RX active, USB lost or STOP; bikeCAN must be physically detached"); return;
    }
    atomic_store(&battery_query_active, true);
    LOCK(); stats.epoch++; UNLOCK();
    memset(reader_selftest_stages, 0, sizeof(reader_selftest_stages));
    reader_gpio_probe_reset();
    reader_gpio_probe.low_hold_us = strlen(command->text) == strlen("SELFTEST VOLTMETER ISOLATED") ? UINT32_C(8000000) : 100;
    strcpy(reader_selftest_stage3_ecc, "null");
    const char *names[] = {"peripheral_pad10", "ctx_pad4", "transceiver_rx5"};
    unsigned rx[] = {10, 4, 5};
    bool passed = true;
    for (unsigned i = 0; i < READER_SELFTEST_STAGES; i++) {
        reader_selftest_stage_t *s = &reader_selftest_stages[i];
        s->name = names[i]; s->rx_gpio = rx[i]; s->tx_gpio = i ? 4 : 10;
        s->reason = "not_run_after_failure";
        s->install_rc = s->start_rc = s->transmit_rc = s->status_rc = s->stop_rc = s->uninstall_rc = ESP_ERR_INVALID_STATE;
        if (passed && i == 2 && !reader_gpio_probe_run(strlen(command->text) == strlen("SELFTEST VOLTMETER ISOLATED"))) { passed = false; s->reason = "gpio_probe_failed"; }
        if (passed) { reader_selftest_stage(s); passed = s->passed; }
    }
    atomic_store(&battery_query_active, false);
    reader_selftest_result(command, passed);
    if (!passed) command_error_reply(outcome, "Isolated selftest failed; see reader_selftest_result");
}
