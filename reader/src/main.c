#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <inttypes.h>
#include <ctype.h>
#include <stdarg.h>
#include <stdatomic.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "driver/gpio.h"
#include "driver/twai.h"
#include "driver/usb_serial_jtag.h"
#include "esp_timer.h"
#include "esp_system.h"
#include "esp_random.h"
#include "esp_log.h"
#include "freertos/semphr.h"
#include "reader.h"
#include "rx_probe.h"
#include "error_probe.h"
#include "ctx_guard.h"
#include "rx_sampling.h"
#include "rx_readback.h"
#include "command_protocol.h"
#include "tx_policy.h"
#include "spard_read_request.h"
#include "tx_trace.h"
#include "esp_rom_gpio.h"
#include "soc/twai_periph.h"
#include "web_server.h"
#include "ble_remote.h"

#define VERSION "0.6.3"
#define FRAME_QUEUE_LEN 256
#define PREVIEW_LEN 128
#define LINE_SIZE (READER_STATUS_SIZE + 768)
#ifndef READER_LED_ACTIVE_LEVEL
#define READER_LED_ACTIVE_LEVEL 0
#endif

typedef struct { char text[80], id[READER_COMMAND_ID_SIZE]; uint32_t token; } command_t;
typedef struct { char error[120]; bool stop_fence; uint64_t final_seq; uint32_t epoch; } command_outcome_t;
typedef struct { char text[LINE_SIZE]; bool fence; uint64_t final_seq; uint32_t epoch;
    char command_id[READER_COMMAND_ID_SIZE], command_text[80]; } reply_t;
typedef struct { char text[192]; bool truncated; } log_line_t;
typedef struct { uint32_t token; char error[120]; } rpc_reply_t;
typedef struct {
    bool running;
    uint32_t bitrate, epoch;
    uint32_t sampling, timing_hz, timing_seg1, timing_seg2, timing_sjw;
    bool timing_triple;
    uint64_t received, queue_drops, usb_drops, control_drops, stop_drops, command_drops;
    uint64_t missed, overruns, bus_errors, arb_lost, tx_failed;
    uint32_t rec, tec, rx_pending, state;
    int64_t last_rx, error_until;
    int led_override;
} stats_t;
static QueueHandle_t frames, commands, replies, completion_failures;
static atomic_uint stop_fences;
typedef struct {unsigned button,pressed;int error;int64_t t_us;} remote_event_t;
static QueueHandle_t remote_events;
static QueueHandle_t sdk_logs;
static atomic_uint sdk_log_drops, sdk_log_truncated;
static QueueHandle_t rpc_replies;
static SemaphoreHandle_t rpc_mutex;
static frame_t preview[PREVIEW_LEN];
static bool command_guard;
static int64_t command_guard_until;
static char boot_text[9];
static TaskHandle_t can_handle, usb_handle;
static portMUX_TYPE lock = portMUX_INITIALIZER_UNLOCKED;
static stats_t stats = {.led_override = -1, .sampling = RX_SAMPLE_TRIPLE};
static reader_hw_readback_t hardware_readback;
static uint32_t boot_id;
static esp_reset_reason_t reset_reason;
static bool installed;
static atomic_bool battery_query_active, battery_normal_driver, battery_query_cancel;
static atomic_bool reader_selftest_driver;
static bool battery_tx_route_valid(void);
static tx_policy_t battery_quality;
static unsigned battery_tx_attempted, battery_tx_acknowledged;
static bool battery_response_valid;
static const char *battery_query_phase = "idle";
static portMUX_TYPE rx_lock = portMUX_INITIALIZER_UNLOCKED;
static rx_check_t rx_check;
static bool rx_isr_ready;
static uint64_t base_missed, base_overruns, base_bus, base_arb, base_failed;
#define LOCK() portENTER_CRITICAL(&lock)
#define UNLOCK() portEXIT_CRITICAL(&lock)

static void fault(void) { stats.error_until = esp_timer_get_time() + 3000000; }

static rx_check_t rx_snapshot(void) {
    portENTER_CRITICAL(&rx_lock);
    rx_check_t result = rx_check;
    portEXIT_CRITICAL(&rx_lock);
    return result;
}

// No allocations, USB writes or CAN operations in this bounded input-only ISR.
static void rx_edge(void *arg) {
    bool disable = false;
    portENTER_CRITICAL_ISR(&rx_lock);
    disable = rx_probe_edge(&rx_check);
    portEXIT_CRITICAL_ISR(&rx_lock);
    if (disable) gpio_intr_disable(GPIO_NUM_5);
}

static void rx_finish(rx_state_t result) {
    if (rx_snapshot().state != RX_RUNNING) return;
    gpio_intr_disable(GPIO_NUM_5);
    int level = gpio_get_level(GPIO_NUM_5);
    int64_t now = esp_timer_get_time();
    portENTER_CRITICAL(&rx_lock);
    rx_probe_finish(&rx_check, result, now, level);
    portEXIT_CRITICAL(&rx_lock);
}

static esp_err_t rx_begin(void) {
    // TWAI must be uninstalled; GPIO5 is never driven or pulled by this test.
    if (installed || rx_snapshot().state == RX_RUNNING) return ESP_ERR_INVALID_STATE;
    gpio_config_t config = {.pin_bit_mask = 1ULL << GPIO_NUM_5, .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE, .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE};
    esp_err_t result = gpio_config(&config);
    if (result != ESP_OK) return result;
    if (!rx_isr_ready) {
        result = gpio_install_isr_service(0);
        if (result != ESP_OK) return result;
        result = gpio_isr_handler_add(GPIO_NUM_5, rx_edge, NULL);
        if (result != ESP_OK) { gpio_uninstall_isr_service(); return result; }
        rx_isr_ready = true;
    }
    int level = gpio_get_level(GPIO_NUM_5);
    int64_t now = esp_timer_get_time();
    portENTER_CRITICAL(&rx_lock);
    rx_probe_begin(&rx_check, now, level);
    portEXIT_CRITICAL(&rx_lock);
    result = gpio_set_intr_type(GPIO_NUM_5, GPIO_INTR_ANYEDGE);
    if (result == ESP_OK) result = gpio_intr_enable(GPIO_NUM_5);
    if (result != ESP_OK) rx_finish(RX_CANCELLED);
    return result;
}

static void rx_poll(void) {
    rx_check_t r = rx_snapshot();
    if (rx_probe_due(&r, esp_timer_get_time()))
        rx_finish(RX_COMPLETE);
}

// ESP-IDF must never write directly to USB alongside the framed data writer.
static int serial_sdk_log(const char *format, va_list arguments) {
    log_line_t line;
    int length = vsnprintf(line.text, sizeof(line.text), format, arguments);
    line.truncated = length >= (int)sizeof(line.text);
    if (line.truncated) atomic_fetch_add(&sdk_log_truncated, 1);
    if (xQueueSend(sdk_logs, &line, 0) != pdTRUE) atomic_fetch_add(&sdk_log_drops, 1);
    return length;
}

static void sdk_log_json(const log_line_t *line, char *output, size_t capacity) {
    const char *prefix = "{\"type\":\"log\",\"message\":\"";
    size_t used = strlen(prefix);
    memcpy(output, prefix, used);
    for (const unsigned char *p = (const unsigned char *)line->text; *p && used + 48 < capacity; p++) {
        if (*p == '"' || *p == '\\') { output[used++] = '\\'; output[used++] = *p; }
        else if (*p < 32) { used += snprintf(output + used, capacity - used, "\\u%04x", *p); }
        else output[used++] = *p;
    }
    snprintf(output + used, capacity - used, "\",\"truncated\":%s}\n", line->truncated ? "true" : "false");
}

static bool queue_reply(const reply_t *r) {
    if (xQueueSend(replies, r, 0) != pdTRUE) {
        LOCK(); stats.control_drops++; fault(); UNLOCK();
        return false;
    }
    return true;
}

static void reply(const char *text) {
    reply_t r = {0};
    snprintf(r.text, sizeof(r.text), "%s", text);
    queue_reply(&r);
}

static bool sample_driver(void) {
    if (!installed) return false;
    twai_status_info_t s;
    if (twai_get_status_info(&s) != ESP_OK) return false;
    LOCK();
    uint64_t errors = base_bus + s.bus_error_count;
    uint64_t missed = base_missed + s.rx_missed_count;
    uint64_t over = base_overruns + s.rx_overrun_count;
    if (errors != stats.bus_errors || missed != stats.missed || over != stats.overruns || s.state == TWAI_STATE_BUS_OFF) fault();
    stats.missed = missed; stats.overruns = over; stats.bus_errors = errors;
    stats.arb_lost = base_arb + s.arb_lost_count;
    stats.tx_failed = base_failed + s.tx_failed_count;
    stats.rec = s.rx_error_counter; stats.tec = s.tx_error_counter;
    stats.rx_pending = s.msgs_to_rx; stats.state = s.state;
    UNLOCK();
    return true;
}

// Only CAN owner/app_main calls this. HTTP and USB serialize this cached copy;
// they never touch a potentially uninstalled or clock-gated TWAI peripheral.
static void refresh_hardware_readback(void) {
    LOCK(); stats_t s = stats; UNLOCK();
    reader_hw_expected_t expected = {.bitrate = s.bitrate, .quanta_hz = s.timing_hz,
        .tseg1 = s.timing_seg1, .tseg2 = s.timing_seg2, .sjw = s.timing_sjw,
        .triple = s.timing_triple, .running = s.running, .epoch = s.epoch};
    reader_hw_readback_t snapshot;
    reader_hw_readback(installed, &expected, &snapshot);
    LOCK(); hardware_readback = snapshot; UNLOCK();
}

void reader_status_json(char *buffer, size_t capacity) {
    LOCK(); stats_t s = stats; reader_hw_readback_t hw = hardware_readback; UNLOCK();
    reader_network_t net; web_network_snapshot(&net);
    rx_check_t rx = rx_snapshot();
    error_probe_t errors = reader_error_probe();
    ctx_guard_t ctx = reader_ctx_guard();
    const char *query_mode = atomic_load(&battery_normal_driver) ? (atomic_load(&battery_query_active) ? "battery_information_query" : "diagnostic_driver_retained") : "listen_only";
    bool routed_query = atomic_load(&battery_query_active) && atomic_load(&battery_normal_driver) && battery_tx_route_valid();
    const char *ctx_policy = routed_query ? "spard_information_only" : "fixed_recessive";
    bool ctx_valid = routed_query ? true : ctx.valid;
    const char *counter_reason = atomic_load(&battery_normal_driver) ? "diagnostic_snapshot_not_continuous" : "listen_only";
    const char *rx_state = rx.state == RX_RUNNING ? "running" : rx.state == RX_COMPLETE ? "complete" : rx.state == RX_CANCELLED ? "cancelled" : "idle";
    int64_t elapsed_ms = rx.state == RX_IDLE ? 0 : ((rx.state == RX_RUNNING ? esp_timer_get_time() : rx.ended_us) - rx.started_us) / 1000;
    int length = snprintf(buffer, capacity,
        "{\"type\":\"status\",\"product\":\"BafangReader\",\"protocol\":1,\"version\":\"%s\",\"boot\":\"%08" PRIX32 "\",\"reset_reason\":%d,"
        "\"capabilities\":[\"command_ids\",\"stream_end\",\"twai_hardware_readback\",\"spard_information_query\",\"spard_query_quality_v1\",\"spard_tx_trace_v1\",\"isolated_twai_selftest_v1\",\"isolated_twai_selftest_v2\",\"spard_quiet_query_v1\",\"spard_rmt_trace_v1\",\"spard_tx_echo_v1\",\"spard_ecc_capture_v1\",\"spard_tx_hardware_check_v1\",\"ble_remote_v1\"],\"received_semantics\":\"application_dequeued\",\"error_counters_valid\":false,\"error_counters_reason\":\"%s\",\"uptime_us\":%" PRId64 ",\"can\":\"%s\",\"mode\":\"%s\",\"bitrate\":%" PRIu32 ",\"epoch\":%" PRIu32 ","
        "\"received\":%" PRIu64 ",\"frame_queue_drops\":%" PRIu64 ",\"usb_frame_drops\":%" PRIu64 ","
        "\"control_drops\":%" PRIu64 ",\"command_drops\":%" PRIu64 ",\"stop_discards\":%" PRIu64 ","
        "\"rx_missed\":%" PRIu64 ",\"rx_overrun\":%" PRIu64 ",\"bus_errors\":%" PRIu64 ","
        "\"bus_error_types\":{\"total\":%" PRIu32 ",\"bit\":%" PRIu32 ",\"form\":%" PRIu32 ",\"stuff\":%" PRIu32 ",\"ack\":%" PRIu32 ",\"other\":%" PRIu32 ",\"last_flags\":%" PRIu32 ",\"saturated\":%s},"
        "\"arb_lost\":%" PRIu64 ",\"tx_failed\":%" PRIu64 ",\"rec\":%" PRIu32 ",\"tec\":%" PRIu32 ","
        "\"twai_state\":%" PRIu32 ",\"rx_pending\":%" PRIu32 ",\"frame_queue_pending\":%u,"
        "\"usb_connected\":%s,\"tx_gpio\":4,\"rx_gpio\":5,\"led_gpio\":8,\"led_active_level\":%d,\"led_override\":%d,"
        "\"twai_tx_gpio\":%d,\"ctx_guard\":{\"policy\":\"%s\",\"valid\":%s,\"level\":%d,\"out_sel\":%u,\"mux\":%u,\"enabled\":%s,\"input_enabled\":%s,\"latch_high\":%s,\"inverted\":%s},"
        "\"sampling_profiles\":" READER_SAMPLING_PROFILES_JSON ",\"rx_sampling_250k\":\"%s\",\"configured_timing\":{\"quanta_hz\":%u,\"tseg1\":%u,\"tseg2\":%u,\"sjw\":%u,\"triple_sampling\":%s,\"sample_permill\":%u},"
        "\"can_stack_free\":%u,\"usb_stack_free\":%u,\"heap_free\":%u,"
        "\"ssid\":\"%s\",\"ip\":\"192.168.4.1\",\"wifi_channel\":%d,\"wifi_clients\":%d,\"wifi_ready\":%s,"
        "\"ap_mac\":\"%s\",\"saved_ssid\":\"%s\",\"saved_wifi_channel\":%d,"
        "\"sdk_log_drops\":%u,\"sdk_log_truncated\":%u,"
        "\"rx_check\":{\"id\":%" PRIu32 ",\"state\":\"%s\",\"edges\":%" PRIu32 ",\"limit_reached\":%s,"
        "\"initial_level\":%d,\"level\":%d,\"elapsed_ms\":%" PRId64 ",\"window_ms\":%d},\"hardware_readback\":",
        VERSION, boot_id, reset_reason, counter_reason, esp_timer_get_time(), s.running ? "running" : "stopped", query_mode, s.bitrate, s.epoch,
        s.received, s.queue_drops, s.usb_drops, s.control_drops, s.command_drops, s.stop_drops,
        s.missed, s.overruns, s.bus_errors,
        errors.total, errors.bit, errors.form, errors.stuff, errors.ack, errors.other, errors.last_flags, errors.saturated ? "true" : "false",
        s.arb_lost, s.tx_failed, s.rec, s.tec, s.state, s.rx_pending,
        (unsigned)uxQueueMessagesWaiting(frames), usb_serial_jtag_is_connected() ? "true" : "false",
        net.led_level, s.led_override,
        routed_query ? 4 : 10, ctx_policy, ctx_valid ? "true" : "false", ctx.level, (unsigned)ctx.out_sel, (unsigned)ctx.mux,
        ctx.enabled ? "true" : "false", ctx.input_enabled ? "true" : "false",
        ctx.latch_high ? "true" : "false", ctx.inverted ? "true" : "false",
        reader_sampling_name(s.sampling), (unsigned)s.timing_hz, (unsigned)s.timing_seg1,
        (unsigned)s.timing_seg2, (unsigned)s.timing_sjw, s.timing_triple ? "true" : "false",
        s.timing_hz ? (unsigned)(1000*(1+s.timing_seg1)/(1+s.timing_seg1+s.timing_seg2)) : 0,
        can_handle ? (unsigned)uxTaskGetStackHighWaterMark(can_handle) : 0,
        usb_handle ? (unsigned)uxTaskGetStackHighWaterMark(usb_handle) : 0,
        (unsigned)esp_get_free_heap_size(), net.ssid, net.channel, net.clients, net.ready ? "true" : "false",
        net.mac, net.saved_ssid, net.saved_channel,
        (unsigned)atomic_load(&sdk_log_drops), (unsigned)atomic_load(&sdk_log_truncated),
        rx.id, rx_state, rx.edges, rx.capped ? "true" : "false", rx.initial_level,
        rx.state == RX_RUNNING ? gpio_get_level(GPIO_NUM_5) : rx.final_level, elapsed_ms, RX_CHECK_MS);
    if (length < 0 || (size_t)length >= capacity) return;
    size_t used = (size_t)length;
    size_t added = reader_hw_json(&hw, buffer + used, capacity - used);
    if (added >= capacity - used) return;
    used += added;
    snprintf(buffer + used, capacity - used, ",\"ble_remote\":");
    used += strlen(buffer + used);
    added = ble_remote_json(buffer + used, capacity - used);
    if (added >= capacity - used) return;
    used += added;
    snprintf(buffer + used, capacity - used, "}\n");
}

void reader_remote_notification(unsigned button,unsigned pressed,int error,int64_t t_us) {
    remote_event_t event={button,pressed,error,t_us};
    if(!remote_events||xQueueSend(remote_events,&event,0)!=pdTRUE){LOCK();stats.control_drops++;UNLOCK();}
}

static void status_reply(void) {
    sample_driver();
    refresh_hardware_readback();
    reply_t r = {0};
    reader_status_json(r.text, sizeof(r.text));
    queue_reply(&r);
}

static bool timing_for(unsigned bitrate, unsigned sampling, twai_timing_config_t *t) {
    if (bitrate != 250000 || sampling != RX_SAMPLE_TRIPLE) return false;
    *t = (twai_timing_config_t)TWAI_TIMING_CONFIG_250KBITS();
    return reader_sampling_apply(sampling,bitrate,t);
}

static void error_reply(const char *message) {
    char line[200];
    snprintf(line, sizeof(line), "{\"type\":\"error\",\"message\":\"%s\"}\n", message);
    reply(line);
}

static void command_error_reply(command_outcome_t *outcome, const char *message) {
    tx_policy_revoke(&battery_quality, true);
    snprintf(outcome->error, sizeof(outcome->error), "%s", message);
    error_reply(message);
}

static void accept_frame(const twai_message_t *message) {
    frame_t f = {.us = esp_timer_get_time(), .msg = *message};
    LOCK(); f.seq = ++stats.received; f.epoch = stats.epoch; stats.last_rx = f.us;
    preview[(f.seq - 1) % PREVIEW_LEN] = f; UNLOCK();
    if (xQueueSend(frames, &f, 0) != pdTRUE) { LOCK(); stats.queue_drops++; fault(); UNLOCK(); }
}

static void handle_command(char *cmd, command_outcome_t *outcome);
#include "rmt_trace.h"
#include "spard_query_impl.h"
#include "selftest_impl.h"

// This task is the sole owner of TWAI lifecycle and reception.
static void handle_command(char *cmd, command_outcome_t *outcome) {
    if (command_guard) command_guard_until = esp_timer_get_time() + 10000000;
    // Commands are case-insensitive; the SSID following WIFI keeps its exact case.
    for (char *p = cmd; *p && *p != ' '; ++p) *p = toupper((unsigned char)*p);
    if (strncmp(cmd, "WIFI ", 5))
        for (char *p = cmd; *p; ++p) *p = toupper((unsigned char)*p);
    if (!strcmp(cmd, "GUARD ON") || !strcmp(cmd, "GUARD OFF")) {
        command_guard = !strcmp(cmd, "GUARD ON");
        command_guard_until = esp_timer_get_time() + 10000000;
        status_reply();
    } else if (!strcmp(cmd, "HELP")) {
        reply("{\"type\":\"help\",\"commands\":[\"HELP\",\"STATUS\",\"RXCHECK\",\"SAMPLE TRIPLE\",\"START 250000\",\"STOP\",\"LED LOW|HIGH|AUTO\",\"LED ACTIVE LOW|HIGH\",\"WIFI <channel> <ssid>\"],\"bitrates\":[250000]}\n");
    } else if (!strcmp(cmd, "STATUS")) {
        status_reply();
    } else if (!strncmp(cmd, "SAMPLE ", 7)) {
        if (installed || rx_snapshot().state==RX_RUNNING) { command_error_reply(outcome, "STOP CAN and RXCHECK before SAMPLE"); return; }
        rx_sampling_t profile;
        if (!reader_sampling_parse(cmd+7,&profile)) { command_error_reply(outcome, "Unknown SAMPLE profile; see STATUS sampling_profiles;250000 only"); return; }
        LOCK(); stats.sampling=profile; UNLOCK(); status_reply();
    } else if (!strcmp(cmd, "SPARD QUIET INFO")) {
        battery_information_query_mode(outcome,true);
    } else if (!strcmp(cmd, "SPARD INFO")) {
        battery_information_query(outcome);
    } else if (!strcmp(cmd, "RXCHECK")) {
        if (installed) { command_error_reply(outcome, "STOP CAN before RXCHECK"); return; }
        if (rx_snapshot().state == RX_RUNNING) { command_error_reply(outcome, "RXCHECK already running"); return; }
        if (rx_begin() != ESP_OK) { command_error_reply(outcome, "RXCHECK input setup failed"); return; }
        status_reply();
    } else if (!strncmp(cmd, "START ", 6)) {
        if (!reader_ctx_guard().valid) {
            bool restored = reader_ctx_hold();
            command_error_reply(outcome, restored ? "CTX guard failed; restored; START blocked" : "CTX guard failed; restore failed; START blocked"); return;
        }
        if (rx_snapshot().state == RX_RUNNING) { command_error_reply(outcome, "STOP or finish RXCHECK before START"); return; }
        char *end;
        unsigned long bitrate = strtoul(cmd + 6, &end, 10);
        twai_timing_config_t timing;
        LOCK(); unsigned sampling=stats.sampling; UNLOCK();
        if (*end || end == cmd + 6 || bitrate > 1000000 || !timing_for(bitrate, sampling, &timing)) {
            command_error_reply(outcome, "unsupported bitrate; use HELP"); return;
        }
        if (installed) { command_error_reply(outcome, "already running; STOP before START"); return; }
        if (atomic_load(&stop_fences)) { command_error_reply(outcome, "STOP stream still draining; retry START"); return; }
        twai_general_config_t g = TWAI_GENERAL_CONFIG_DEFAULT(READER_TWAI_TX_GPIO, GPIO_NUM_5, TWAI_MODE_LISTEN_ONLY);
        g.tx_queue_len = 0; g.rx_queue_len = 128;
        g.alerts_enabled = TWAI_ALERT_BUS_ERROR | TWAI_ALERT_RX_QUEUE_FULL | TWAI_ALERT_BUS_OFF | TWAI_ALERT_ERR_PASS;
        twai_filter_config_t f = TWAI_FILTER_CONFIG_ACCEPT_ALL();
        esp_err_t result = twai_driver_install(&g, &timing, &f);
        if (result != ESP_OK) {
            bool restored = reader_ctx_hold();
            command_error_reply(outcome, restored ? "TWAI install failed; CTX held" : "TWAI install failed; CTX restore failed"); return;
        }
        if (!reader_ctx_guard().valid) {
            bool restored = reader_ctx_hold();
            esp_err_t removed = twai_driver_uninstall();
            installed = removed != ESP_OK;
            command_error_reply(outcome, !restored ? "CTX changed during install; restore failed" : removed != ESP_OK ? "CTX restored; TWAI uninstall failed" : "CTX changed during install; restored; START blocked"); return;
        }
        result = twai_start();
        if (result != ESP_OK) {
            bool restored = reader_ctx_hold();
            esp_err_t removed = twai_driver_uninstall();
            installed = removed != ESP_OK;
            command_error_reply(outcome, !restored ? "TWAI start failed; CTX restore failed" : removed != ESP_OK ? "TWAI start failed; uninstall failed" : "TWAI start failed; CTX held"); return;
        }
        installed = true;
        LOCK(); stats.running = true; stats.bitrate = bitrate; stats.epoch++;
        stats.timing_hz=timing.quanta_resolution_hz;stats.timing_seg1=timing.tseg_1;
        stats.timing_seg2=timing.tseg_2;stats.timing_sjw=timing.sjw;stats.timing_triple=timing.triple_sampling;
        UNLOCK();
        tx_policy_begin(&battery_quality, battery_tx_snapshot());
        status_reply();
    } else if (!strcmp(cmd, "STOP")) {
        // Physical inhibition always comes first, including every driver failure path.
        bool ctx_held = reader_ctx_hold();
        rx_finish(RX_CANCELLED);
        if (installed) {
            twai_status_info_t current;
            if (twai_get_status_info(&current) != ESP_OK) {
                // Try to stop even if status reporting failed. Never claim success.
                esp_err_t stopped = twai_stop();
                if (stopped == ESP_OK) { LOCK(); stats.running = false; UNLOCK(); }
                command_error_reply(outcome, ctx_held ? "TWAI status failed; CTX held; STOP incomplete" : "TWAI status failed; CTX restore failed"); return;
            }
            if (current.state == TWAI_STATE_RUNNING && twai_stop() != ESP_OK) {
                command_error_reply(outcome, ctx_held ? "TWAI stop failed; CTX held" : "TWAI stop failed; CTX restore failed"); return;
            }
            LOCK(); stats.running = false; UNLOCK();
            // IDF preserves its RX queue on STOP. Save every queued raw frame before uninstall.
            twai_message_t pending;
            for (unsigned i = 0; i < 128 && twai_receive(&pending, 0) == ESP_OK; i++)
                if (!atomic_load(&reader_selftest_driver)) accept_frame(&pending);
            if (!atomic_load(&reader_selftest_driver) && !sample_driver()) {
                command_error_reply(outcome, ctx_held ? "Final TWAI status failed; CAN stopped; driver retained" : "Final TWAI status failed; CTX restore failed"); return;
            }
            if (twai_driver_uninstall() != ESP_OK) {
                command_error_reply(outcome, ctx_held ? "TWAI uninstall failed; CAN stopped; CTX held" : "TWAI uninstall failed; CTX restore failed"); return;
            }
            installed = false;
            atomic_store(&reader_selftest_driver, false);
            atomic_store(&battery_normal_driver, false);
            LOCK();
            stats.stop_drops += stats.rx_pending;
            base_missed = stats.missed; base_overruns = stats.overruns;
            base_bus = stats.bus_errors; base_arb = stats.arb_lost; base_failed = stats.tx_failed;
            stats.rx_pending = 0;
            UNLOCK();
        }
        if (!ctx_held || !reader_ctx_guard().valid) {
            command_error_reply(outcome, "CAN stopped; CTX restore failed"); return;
        }
        if (!atomic_load(&battery_query_active) && battery_quality.observing)
            tx_policy_finish(&battery_quality, battery_tx_snapshot());
        LOCK(); outcome->final_seq = stats.received; outcome->epoch = stats.epoch; UNLOCK();
        outcome->stop_fence = true;
        if (!atomic_load(&battery_query_active)) atomic_store(&battery_query_cancel, false);
        status_reply();
    } else if (!strcmp(cmd, "LED ACTIVE LOW") || !strcmp(cmd, "LED ACTIVE HIGH")) {
        if (installed || rx_snapshot().state == RX_RUNNING) { command_error_reply(outcome, "STOP CAN and RXCHECK before saving settings"); return; }
        if (web_save_led(!strcmp(cmd, "LED ACTIVE HIGH")) != ESP_OK) { command_error_reply(outcome, "settings save failed"); return; }
        status_reply();
    } else if (!strncmp(cmd, "WIFI ", 5)) {
        if (installed || rx_snapshot().state == RX_RUNNING) { command_error_reply(outcome, "STOP CAN and RXCHECK before saving settings"); return; }
        char *end; long channel = strtol(cmd + 5, &end, 10);
        if (*end != ' ' || channel < 1 || channel > 11 || !end[1] || strlen(end + 1) > 32) {
            command_error_reply(outcome, "WIFI requires channel 1..11 and SSID 1..32 ASCII characters"); return;
        }
        if (web_save_ap(end + 1, channel) != ESP_OK) { command_error_reply(outcome, "invalid SSID or settings save failed"); return; }
        status_reply();
    } else if (!strcmp(cmd, "LED LOW") || !strcmp(cmd, "LED HIGH") || !strcmp(cmd, "LED AUTO")) {
        LOCK(); stats.led_override = !strcmp(cmd, "LED AUTO") ? -1 : (!strcmp(cmd, "LED HIGH") ? 1 : 0); UNLOCK();
        status_reply();
    } else { command_error_reply(outcome, "unknown command; use HELP"); }
}


static void result_prefix(reply_t *r, const command_t *c, const char *error) {
    char escaped_command[161], escaped_error[241];
    reader_json_escape(c->text, escaped_command, sizeof(escaped_command));
    reader_json_escape(error, escaped_error, sizeof(escaped_error));
    snprintf(r->text, sizeof(r->text),
        "{\"type\":\"command_result\",\"id\":\"%s\",\"command\":\"%s\",\"ok\":%s,\"error\":\"%s\",\"boot\":\"%s\",\"final_seq\":%" PRIu64 ",\"status\":",
        c->id, escaped_command, error[0] ? "false" : "true", escaped_error, boot_text, r->final_seq);
}

static void append_result_status(reply_t *r) {
    size_t used = strlen(r->text);
    reader_status_json(r->text + used, sizeof(r->text) - used);
    used = strlen(r->text);
    if (used && r->text[used-1] == '\n') used--;
    snprintf(r->text + used, sizeof(r->text) - used, "}\n");
}

static bool publish_completion(const command_t *c, const command_outcome_t *outcome) {
    if (!c->id[0] && !outcome->stop_fence) return true;
    reply_t r = {.fence = outcome->stop_fence, .final_seq = outcome->final_seq, .epoch = outcome->epoch};
    if (!r.fence) { LOCK(); r.final_seq = stats.received; UNLOCK(); }
    if (c->id[0]) {
        snprintf(r.command_id, sizeof(r.command_id), "%s", c->id);
        snprintf(r.command_text, sizeof(r.command_text), "%s", c->text);
        result_prefix(&r, c, outcome->error);
        if (!r.fence) append_result_status(&r); // Snapshot bound to this command, before another can run.
    }
    if (r.fence) atomic_fetch_add(&stop_fences, 1);
    if (queue_reply(&r)) return true;
    if (r.fence) atomic_fetch_sub(&stop_fences, 1);
    // Reserved bounded queue: failure must never look like a successful STOP fence.
    if (c->id[0]) {
        r.fence = false;
        result_prefix(&r, c, "completion queue full; stream end unconfirmed");
        append_result_status(&r);
        if (xQueueSend(completion_failures, &r, 0) != pdTRUE) {
            LOCK(); stats.control_drops++; fault(); UNLOCK();
        }
    }
    return false;
}

static void execute_command(const command_t *c) {
    command_outcome_t outcome = {0};
    char command[sizeof(c->text)];
    snprintf(command, sizeof(command), "%s", c->text);
    if (!strncmp(command,"REMOTE ",7)) {
        if(c->token||!c->id[0])command_error_reply(&outcome,"Remote requires correlated USB");
        else if(!ble_remote_command(command,outcome.error,sizeof(outcome.error))&&!outcome.error[0])command_error_reply(&outcome,"Remote failed");
    } else if ((battery_is_info(command) || battery_is_quiet_info(command) || reader_is_selftest(command)) && ble_remote_enabled())
        command_error_reply(&outcome,"Turn off BLE remote before active diagnostics");
    else if ((battery_is_info(command) || battery_is_quiet_info(command)) && (c->token || !c->id[0]))
        command_error_reply(&outcome,"SPARD INFO requires correlated USB; Wi-Fi/RPC and legacy commands denied");
    else if (reader_is_selftest(command)) {
        if (c->token || !c->id[0]) command_error_reply(&outcome, "Isolated selftest requires correlated USB; Wi-Fi/RPC and legacy commands denied");
        else reader_selftest_run(c, &outcome);
    } else handle_command(command, &outcome);
    // Also snapshot early failure paths, which deliberately do not send STATUS.
    refresh_hardware_readback();
    if (!publish_completion(c, &outcome) && !outcome.error[0])
        snprintf(outcome.error, sizeof(outcome.error), "completion queue full; stream end unconfirmed");
    if (c->token) {
        rpc_reply_t r = {.token = c->token};
        snprintf(r.error, sizeof(r.error), "%s", outcome.error);
        xQueueOverwrite(rpc_replies, &r);
    }
}

static void can_task(void *arg) {
    int64_t next_sample = 0;
    while (true) {
        command_t c;
        if (xQueueReceive(commands, &c, 0) == pdTRUE) {
            execute_command(&c);
        }
        if (command_guard && installed && esp_timer_get_time() > command_guard_until) {
            command_t stop = {.text = "STOP"}; execute_command(&stop); command_guard = false;
        }
        rx_poll();
        if (!installed) { vTaskDelay(pdMS_TO_TICKS(5)); continue; }
        if (atomic_load(&battery_normal_driver)) { vTaskDelay(pdMS_TO_TICKS(5)); continue; }
        if (!reader_ctx_guard().valid) {
            tx_policy_revoke(&battery_quality, true);
            command_t stop = {.text = "STOP"}; execute_command(&stop);
            error_reply(reader_ctx_guard().valid ? "CTX guard failed; CTX restored; check STATUS for CAN state" : "CTX guard failed; restore failed; check STATUS"); continue;
        }
        twai_message_t m;
        if (twai_receive(&m, pdMS_TO_TICKS(5)) == ESP_OK) {
            accept_frame(&m);
        }
        uint32_t alerts;
        if (twai_read_alerts(&alerts, 0) == ESP_OK && alerts) { LOCK(); fault(); UNLOCK(); }
        int64_t now = esp_timer_get_time();
        if (now >= next_sample) { sample_driver(); next_sample = now + 100000; }
        // Allow idle task/watchdog time even on a saturated bus.
        if ((stats.received & 31) == 0) vTaskDelay(1);
    }
}

static bool write_line(const char *line) {
    size_t size = strlen(line);
    // Driver uses an atomic ring-buffer enqueue, with a bounded zero wait.
    return usb_serial_jtag_write_bytes(line, size, 0) == size;
}

const char *reader_boot(void) { return boot_text; }

size_t reader_frame_json(const frame_t *f, char *line, size_t capacity) {
    char hex[17] = {0};
    if (!f->msg.rtr) for (int j = 0; j < f->msg.data_length_code && j < 8; j++) sprintf(hex + 2*j, "%02X", f->msg.data[j]);
    return snprintf(line, capacity, "{\"type\":\"frame\",\"boot\":\"%s\",\"epoch\":%" PRIu32 ",\"t_us\":%" PRId64 ",\"seq\":%" PRIu64 ",\"id\":\"%08" PRIX32 "\",\"extended\":%s,\"rtr\":%s,\"dlc\":%u,\"data\":\"%s\"}",
        boot_text, f->epoch, f->us, f->seq, f->msg.identifier, f->msg.extd ? "true" : "false", f->msg.rtr ? "true" : "false", f->msg.data_length_code, hex);
}

size_t reader_frames(uint64_t after, frame_t *out, size_t capacity, uint64_t *latest, uint64_t *oldest) {
    LOCK(); *latest = stats.received; UNLOCK();
    *oldest = *latest >= PREVIEW_LEN ? *latest - PREVIEW_LEN + 1 : (*latest ? 1 : 0);
    uint64_t start = after < *oldest ? *oldest : after + 1;
    size_t count = 0;
    for (uint64_t i = start; i && i <= *latest && count < capacity; i++) {
        LOCK(); frame_t f = preview[(i - 1) % PREVIEW_LEN]; UNLOCK();
        if (f.seq == i) out[count++] = f;
    }
    return count;
}

bool reader_command(const char *text, char *error, size_t capacity) {
    static uint32_t token = 0;
    if (capacity) error[0] = 0;
    if (!text || strlen(text) >= sizeof(((command_t *)0)->text)) { snprintf(error, capacity, "command too long"); return false; }
    if (xSemaphoreTake(rpc_mutex, pdMS_TO_TICKS(100)) != pdTRUE) { snprintf(error, capacity, "controller busy"); return false; }
    command_t c = {.token = ++token};
    if (!c.token) c.token = ++token;
    snprintf(c.text, sizeof(c.text), "%s", text);
    bool ok = false;
    if (battery_is_stop(c.text)) atomic_store(&battery_query_cancel, true);
    if (xQueueSend(commands, &c, 0) != pdTRUE) snprintf(error, capacity, "command queue full");
    else {
        rpc_reply_t r;
        int64_t end = esp_timer_get_time() + 2000000;
        while (esp_timer_get_time() < end) {
            if (xQueueReceive(rpc_replies, &r, pdMS_TO_TICKS(50)) == pdTRUE && r.token == c.token) {
                snprintf(error, capacity, "%s", r.error); ok = !r.error[0]; break;
            }
        }
        if (!ok && !error[0]) snprintf(error, capacity, "command timeout; check STATUS");
    }
    xSemaphoreGive(rpc_mutex);
    return ok;
}


static void write_frame(const frame_t *frame) {
    char line[320];
    size_t length = reader_frame_json(frame, line, sizeof(line));
    if (length >= sizeof(line)-2) { LOCK(); stats.usb_drops++; fault(); UNLOCK(); return; }
    line[length] = '\n'; line[length+1] = 0;
    if (!write_line(line)) { LOCK(); stats.usb_drops++; fault(); UNLOCK(); }
}

static bool write_reply_bounded(const char *text) {
    int64_t deadline = esp_timer_get_time() + 250000;
    do {
        if (write_line(text)) return true;
        vTaskDelay(1);
    } while (esp_timer_get_time() < deadline);
    LOCK(); stats.control_drops++; fault(); UNLOCK();
    return false;
}

static void write_completion(reply_t *r) {
    if (r->fence) {
        frame_t frame;
        // No new START is allowed while a STOP fence is pending. The bound is the queue capacity.
        for (unsigned i=0; i<FRAME_QUEUE_LEN && xQueuePeek(frames, &frame, 0)==pdTRUE && frame.seq<=r->final_seq; i++) {
            if (xQueueReceive(frames, &frame, 0)==pdTRUE) write_frame(&frame);
        }
        // Existing frames precede this fence in the atomic USB ring-buffer writer.
        reply_t end = {0};
        snprintf(end.text, sizeof(end.text), "{\"type\":\"stream_end\",\"boot\":\"%s\",\"epoch\":%" PRIu32 ",\"final_seq\":%" PRIu64 ",\"reason\":\"stop\",\"status\":", boot_text, r->epoch, r->final_seq);
        append_result_status(&end);
        bool stream_written = write_reply_bounded(end.text);
        if (r->text[0]) {
            if (!stream_written) {
                command_t failed = {0};
                snprintf(failed.id, sizeof(failed.id), "%s", r->command_id);
                snprintf(failed.text, sizeof(failed.text), "%s", r->command_text);
                result_prefix(r, &failed, "stream end delivery failed");
            }
            append_result_status(r);
            write_reply_bounded(r->text);
        }
        atomic_fetch_sub(&stop_fences, 1);
    } else write_reply_bounded(r->text);
}

static void usb_task(void *arg) {
    char input[80 + READER_COMMAND_ID_SIZE + 2]; size_t length = 0; bool overflow = false;
    reply_t r;
    while (true) {
        unsigned char bytes[128];
        int n = usb_serial_jtag_read_bytes(bytes, sizeof(bytes), 0);
        for (int i = 0; i < n; i++) {
            unsigned char ch = bytes[i];
            if (ch == '\r' || ch == '\n') {
                if (overflow) error_reply("command too long");
                else if (length) {
                    input[length] = 0;
                    command_t c = {0};
                    if (!reader_command_parse(input, c.id, sizeof(c.id), c.text, sizeof(c.text))) {
                        error_reply("invalid command ID envelope");
                        length = 0; overflow = false; continue;
                    }
                    if (battery_is_stop(c.text)) atomic_store(&battery_query_cancel, true);
                    if (xQueueSend(commands, &c, 0) != pdTRUE) {
                        LOCK(); stats.command_drops++; fault(); UNLOCK();
                        error_reply("command queue full");
                        command_outcome_t failed = {0};
                        snprintf(failed.error, sizeof(failed.error), "command queue full");
                        publish_completion(&c, &failed);
                    }
                }
                length = 0; overflow = false;
            } else if (ch >= 32 && ch < 127 && !overflow) {
                if (length < sizeof(input) - 1) input[length++] = ch;
                else overflow = true;
            }
        }
        // Replies have priority and are retried up to 250ms. CAN RX never waits here.
        if (xQueueReceive(completion_failures, &r, 0) == pdTRUE) write_completion(&r);
        if (xQueueReceive(replies, &r, 0) == pdTRUE) write_completion(&r);
        remote_event_t remote_event;
        if(xQueueReceive(remote_events,&remote_event,0)==pdTRUE){
            snprintf(r.text,sizeof(r.text),"{\"type\":\"ble_remote_notification\",\"boot\":\"%s\",\"t_us\":%" PRId64 ",\"button\":%u,\"pressed\":%u,\"error\":%d,\"timestamp_semantics\":\"ESP_notify_enqueue_not_peer_execution\"}\n",boot_text,remote_event.t_us,remote_event.button,remote_event.pressed,remote_event.error);
            write_reply_bounded(r.text);
        }
        log_line_t log;
        if (xQueueReceive(sdk_logs, &log, 0) == pdTRUE) {
            sdk_log_json(&log, r.text, sizeof(r.text));
            if (!write_line(r.text)) atomic_fetch_add(&sdk_log_drops, 1);
        }
        for (int i = 0; i < 32; i++) {
            frame_t f;
            if (xQueueReceive(frames, &f, 0) != pdTRUE) break;
            write_frame(&f);
        }
        vTaskDelay(1);
    }
}

static void led_task(void *arg) {
    gpio_reset_pin(GPIO_NUM_8); gpio_set_direction(GPIO_NUM_8, GPIO_MODE_OUTPUT);
    while (true) {
        int64_t now = esp_timer_get_time();
        LOCK(); stats_t s = stats; UNLOCK();
        reader_network_t net; web_network_snapshot(&net);
        bool on;
        if (now < s.error_until) { int phase = (now / 1000) % 1500; on = phase < 500 && (phase % 180) < 60; }
        else if (s.running && now - s.last_rx < 200000 && s.last_rx) on = (now % 150000) < 25000;
        else on = (now % 2000000) < 100000;
        gpio_set_level(GPIO_NUM_8, s.led_override >= 0 ? s.led_override : (on ? net.led_level : !net.led_level));
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void app_main(void) {
    boot_id = esp_random(); reset_reason = esp_reset_reason();
    snprintf(boot_text, sizeof(boot_text), "%08" PRIX32, boot_id);
    ESP_ERROR_CHECK(reader_ctx_init());
    frames = xQueueCreate(FRAME_QUEUE_LEN, sizeof(frame_t));
    commands = xQueueCreate(8, sizeof(command_t)); replies = xQueueCreate(4, sizeof(reply_t));
    completion_failures = xQueueCreate(2, sizeof(reply_t));
    sdk_logs = xQueueCreate(8, sizeof(log_line_t));
    remote_events=xQueueCreate(16,sizeof(remote_event_t));
    rpc_replies = xQueueCreate(1, sizeof(rpc_reply_t)); rpc_mutex = xSemaphoreCreateMutex();
    assert(remote_events && frames && commands && replies && completion_failures && rpc_replies && rpc_mutex && sdk_logs);
    usb_serial_jtag_driver_config_t usb = {.tx_buffer_size = 8192, .rx_buffer_size = 512};
    ESP_ERROR_CHECK(usb_serial_jtag_driver_install(&usb));
    usb_serial_jtag_write_bytes("\n", 1, 0); // Terminate any partial ROM boot line.
    esp_log_set_vprintf(serial_sdk_log);
    ESP_ERROR_CHECK(web_config_init());
    esp_err_t network_result = web_start();
    if (network_result != ESP_OK) reply("{\"type\":\"error\",\"message\":\"Wi-Fi unavailable; USB remains available\"}\n");
    reply("{\"type\":\"hello\",\"product\":\"BafangReader\",\"version\":\"" VERSION "\",\"protocol\":1}\n");
    status_reply();
    assert(xTaskCreate(can_task, "can_rx", 12288, NULL, 8, &can_handle) == pdPASS);
    assert(xTaskCreate(usb_task, "usb_io", 16384, NULL, 5, &usb_handle) == pdPASS);
    assert(xTaskCreate(led_task, "led", 3072, NULL, 2, NULL) == pdPASS);
    ble_remote_init(); // Nonfatal: USB status exposes whether BLE initialized.
}
