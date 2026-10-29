#pragma once
/* Input-only hardware capture of physical GPIO4/5, armed BEFORE the one fixed
 * Information00 transmit. No RMT transmitter and no additional CAN messages.
 * The two starts are sequential: their before/after timestamps bound skew;
 * APB-derived ticks are not an independent calibrated oscilloscope clock. */
#include <inttypes.h>
#include "driver/rmt_rx.h"
#include "soc/soc_caps.h"

#define READER_RMT_SYMBOLS 64
#define READER_RMT_HZ 2000000

typedef struct {
    rmt_channel_handle_t channel;
    rmt_symbol_word_t symbols[READER_RMT_SYMBOLS];
    unsigned gpio, count;
    size_t reported_count;
    int create_rc, callback_rc, enable_rc, receive_rc, disable_rc, delete_rc;
    uint64_t arm_before_us, arm_after_us, done_us;
    bool enabled, done, final, pointer_valid, original_pullup;
} reader_rmt_line_t;
static reader_rmt_line_t reader_rmt_lines[2];
static portMUX_TYPE reader_rmt_mux = portMUX_INITIALIZER_UNLOCKED;
static uint64_t reader_rmt_tx_call_us, reader_rmt_tx_return_us, reader_rmt_hold_us;
static bool reader_rmt_prepared, reader_rmt_armed, reader_rmt_clean, reader_rmt_current;

static bool reader_rmt_done(rmt_channel_handle_t channel,
                            const rmt_rx_done_event_data_t *event, void *context) {
    reader_rmt_line_t *line = context;
    portENTER_CRITICAL_ISR(&reader_rmt_mux);
    line->pointer_valid = channel == line->channel && event->received_symbols == line->symbols && event->num_symbols <= READER_RMT_SYMBOLS;
    line->reported_count = event->num_symbols;
    line->count = event->num_symbols > READER_RMT_SYMBOLS ? READER_RMT_SYMBOLS : event->num_symbols;
    line->final = event->flags.is_last;
    line->done_us = (uint64_t)esp_timer_get_time();
    line->done = true;
    portEXIT_CRITICAL_ISR(&reader_rmt_mux);
    return false;
}

static bool reader_rmt_any_done(void) {
    portENTER_CRITICAL(&reader_rmt_mux);
    bool done = reader_rmt_lines[0].done || reader_rmt_lines[1].done;
    portEXIT_CRITICAL(&reader_rmt_mux);
    return done;
}

static bool reader_rmt_cleanup(void) {
    bool ok = true;
    for (unsigned i = 0; i < 2; i++) {
        reader_rmt_line_t *line = &reader_rmt_lines[i];
        if (!line->channel) continue;
        if (line->enabled) {
            line->disable_rc = rmt_disable(line->channel);
            if (line->disable_rc != ESP_OK) { ok = false; continue; }
            line->enabled = false;
        }
        line->delete_rc = rmt_del_channel(line->channel);
        if (line->delete_rc != ESP_OK) { ok = false; continue; }
        line->channel = NULL;
        /* RMT enables an input pull-up during creation. Restore the previous
         * electrical setting; never use gpio_set_direction/output_enable. */
        int rc = line->original_pullup ? gpio_pullup_en(line->gpio) : gpio_pullup_dis(line->gpio);
        if (rc != ESP_OK) ok = false;
    }
    reader_rmt_prepared = false;
    reader_rmt_clean = ok && reader_ctx_guard().valid && !(REG_READ(GPIO_ENABLE_REG) & BIT(5));
    return reader_rmt_clean;
}

static bool reader_rmt_prepare(void) {
    reader_rmt_current = false;
    if (reader_rmt_lines[0].channel || reader_rmt_lines[1].channel ||
        !reader_ctx_guard().valid || (REG_READ(GPIO_ENABLE_REG) & BIT(5))) return false;
    memset(reader_rmt_lines, 0, sizeof(reader_rmt_lines));
    reader_rmt_current = true;
    reader_rmt_tx_call_us = reader_rmt_tx_return_us = reader_rmt_hold_us = 0;
    reader_rmt_armed = reader_rmt_prepared = reader_rmt_clean = false;
    for (unsigned i = 0; i < 2; i++) {
        reader_rmt_line_t *line = &reader_rmt_lines[i];
        line->gpio = i ? GPIO_NUM_5 : GPIO_NUM_4;
        line->original_pullup = !!(REG_READ(i ? IO_MUX_GPIO5_REG : IO_MUX_GPIO4_REG) & FUN_PU);
        line->create_rc = line->callback_rc = line->enable_rc = line->receive_rc =
            line->disable_rc = line->delete_rc = ESP_ERR_INVALID_STATE;
        rmt_rx_channel_config_t config = {
            .gpio_num = line->gpio, .clk_src = RMT_CLK_SRC_DEFAULT,
            .resolution_hz = READER_RMT_HZ,
            .mem_block_symbols = SOC_RMT_MEM_WORDS_PER_CHANNEL,
            .flags.io_loop_back = !i,
        };
        line->create_rc = rmt_new_rx_channel(&config, &line->channel);
        if (line->create_rc != ESP_OK) goto fail;
        /* Restore pull-ups immediately, before attaching the TWAI output. */
        if ((line->original_pullup ? gpio_pullup_en(line->gpio) : gpio_pullup_dis(line->gpio)) != ESP_OK) goto fail;
        rmt_rx_event_callbacks_t callbacks = {.on_recv_done = reader_rmt_done};
        line->callback_rc = rmt_rx_register_event_callbacks(line->channel, &callbacks, line);
        if (line->callback_rc != ESP_OK) goto fail;
        line->enable_rc = rmt_enable(line->channel);
        if (line->enable_rc != ESP_OK) goto fail;
        line->enabled = true;
        if (!reader_ctx_guard().valid || (REG_READ(GPIO_ENABLE_REG) & BIT(5))) goto fail;
    }
    reader_rmt_prepared = true;
    return true;
fail:
    reader_rmt_cleanup();
    return false;
}

static bool reader_rmt_arm(void) {
    if (!reader_rmt_prepared || reader_rmt_armed) return false;
    rmt_receive_config_t config = {.signal_range_min_ns = 0, .signal_range_max_ns = 1000000};
    for (unsigned i = 0; i < 2; i++) {
        reader_rmt_line_t *line = &reader_rmt_lines[i];
        line->arm_before_us = (uint64_t)esp_timer_get_time();
        line->receive_rc = rmt_receive(line->channel, line->symbols, sizeof(line->symbols), &config);
        line->arm_after_us = (uint64_t)esp_timer_get_time();
        if (line->receive_rc != ESP_OK) return false;
    }
    if (reader_rmt_any_done()) return false; /* Timed out before the fixed TX. */
    reader_rmt_armed = true;
    return true;
}

static bool reader_rmt_json(char *output, size_t capacity) {
    /* Do not inspect callback-owned fields if a receiver could still run. */
    if(!reader_rmt_clean || !reader_rmt_current){
        int n=snprintf(output,capacity,"{\"cleanup_ok\":%s,\"capture_unavailable\":true}", reader_rmt_clean?"true":"false");
        return n>0 && (size_t)n<capacity;
    }
    static char words[2][READER_RMT_SYMBOLS * 8 + 1];
    for (unsigned i = 0; i < 2; i++) {
        reader_rmt_line_t *line = &reader_rmt_lines[i];
        unsigned count = reader_rmt_clean && !line->channel && line->done && line->pointer_valid ? line->count : 0;
        words[i][0] = 0;
        for (unsigned j = 0; j < count; j++)
            snprintf(words[i] + j * 8, 9, "%08X", (unsigned)line->symbols[j].val);
    }
    int n = snprintf(output, capacity,
        "{\"encoding\":\"uint32_hex\",\"resolution_hz\":2000000,\"capacity_symbols\":64,"
        "\"starts_sequential\":true,\"armed\":%s,\"cleanup_ok\":%s,\"tx_call_us\":%" PRIu64 ",\"tx_return_us\":%" PRIu64 ",\"hold_us\":%" PRIu64 ",\"channels\":[",
        reader_rmt_armed ? "true" : "false", reader_rmt_clean ? "true" : "false",
        reader_rmt_tx_call_us, reader_rmt_tx_return_us, reader_rmt_hold_us);
    if (n < 0 || (size_t)n >= capacity) return false;
    size_t used = (size_t)n;
    for (unsigned i = 0; i < 2; i++) {
        reader_rmt_line_t *line = &reader_rmt_lines[i];
        n = snprintf(output + used, capacity - used,
            "%s{\"gpio\":%u,\"create_rc\":%d,\"callback_rc\":%d,\"enable_rc\":%d,\"receive_rc\":%d,\"disable_rc\":%d,\"delete_rc\":%d,"
            "\"arm_before_us\":%" PRIu64 ",\"arm_after_us\":%" PRIu64 ",\"done_us\":%" PRIu64 ","
            "\"done\":%s,\"final\":%s,\"pointer_valid\":%s,\"capacity_reached\":%s,\"num_symbols\":%u,\"symbols_hex\":\"%s\"}",
            i ? "," : "", line->gpio, line->create_rc, line->callback_rc, line->enable_rc, line->receive_rc, line->disable_rc, line->delete_rc,
            line->arm_before_us, line->arm_after_us, line->done_us, line->done ? "true" : "false",
            line->final ? "true" : "false", line->pointer_valid ? "true" : "false",
            line->count >= READER_RMT_SYMBOLS ? "true" : "false", line->count, words[i]);
        if (n < 0 || (size_t)n >= capacity - used) return false;
        used += (size_t)n;
    }
    if (used + 3 >= capacity) return false;
    memcpy(output + used, "]}", 3);
    return true;
}
