#include <inttypes.h>
#include <stdio.h>
#include <string.h>
#include "esp_clk_tree.h"
#include "esp_timer.h"
#include "driver/gpio.h"
#include "soc/gpio_struct.h"
#include "soc/gpio_sig_map.h"
#include "soc/io_mux_reg.h"
#include "soc/twai_struct.h"
#include "ctx_guard.h"
#include "rx_readback.h"

#if !CONFIG_IDF_TARGET_ESP32C3
#error "Hardware timing readback is pinned to the ESP32-C3 IDF5.5 register layout"
#endif
_Static_assert(READER_CTX_GPIO == GPIO_NUM_4 && READER_TWAI_TX_GPIO == GPIO_NUM_10,
               "Readback must preserve the fixed-recessive CTX policy");

static bool readback_ctx_valid(bool normal) {
    ctx_guard_t g=reader_ctx_guard();
    return normal ? g.out_sel==TWAI_TX_IDX && g.mux==PIN_FUNC_GPIO && g.enabled &&
                    g.input_enabled && g.latch_high && !g.inverted : g.valid;
}

esp_err_t reader_hw_readback(bool installed, const reader_hw_expected_t *e,
                             reader_hw_readback_t *r) {
    if (!r || !e) return ESP_ERR_INVALID_ARG;
    memset(r, 0, sizeof(*r));
    r->captured_us = esp_timer_get_time();
    r->driver_installed = installed; r->running_at_capture = e->running; r->epoch = e->epoch;
    r->expected_normal_mode = e->normal_mode;
    r->ctx_valid = readback_ctx_valid(e->normal_mode);
    r->gpio4_mux_raw = REG_READ(IO_MUX_GPIO4_REG);
    r->gpio4_out_raw = REG_READ(GPIO_FUNC4_OUT_SEL_CFG_REG);
    r->gpio4_pad_raw = REG_READ(GPIO_PIN4_REG);
    r->output_enable_raw = REG_READ(GPIO_ENABLE_REG);
    r->gpio5_mux_raw = REG_READ(IO_MUX_GPIO5_REG);
    r->gpio5_out_raw = REG_READ(GPIO_ENABLE_REG);
    r->gpio5_mux = (r->gpio5_mux_raw & MCU_SEL_M) >> MCU_SEL_S;
    r->gpio5_input = !!(r->gpio5_mux_raw & FUN_IE);
    r->gpio5_output = !!(r->gpio5_out_raw & BIT(5));
    r->gpio5_pullup = !!(r->gpio5_mux_raw & FUN_PU);
    r->gpio5_pulldown = !!(r->gpio5_mux_raw & FUN_PD);
    r->gpio5_level = gpio_get_level(GPIO_NUM_5) == 1;
    r->rx_matrix_raw = GPIO.func_in_sel_cfg[TWAI_RX_IDX].val;
    r->rx_route_valid = GPIO.func_in_sel_cfg[TWAI_RX_IDX].sig_in_sel &&
        GPIO.func_in_sel_cfg[TWAI_RX_IDX].in_sel == GPIO_NUM_5 &&
        !GPIO.func_in_sel_cfg[TWAI_RX_IDX].sig_in_inv;
    if (installed) {
        r->mode_raw = TWAI.mode_reg.val;
        r->btr0_raw = TWAI.bus_timing_0_reg.val;
        r->btr1_raw = TWAI.bus_timing_1_reg.val;
        uint32_t hz = 0;
        // C3 LL accepts only APB. CDR controls CLKOUT, not the CAN bit-clock divider.
        // Clock-tree reporting is not an independent physical frequency measurement.
        r->clock_error = esp_clk_tree_src_get_freq_hz(SOC_MOD_CLK_APB,
            ESP_CLK_TREE_SRC_FREQ_PRECISION_CACHED, &hz);
        r->timing = reader_hw_decode(r->clock_error == ESP_OK ? hz : 0,
                                     r->btr0_raw, r->btr1_raw, r->mode_raw);
        r->registers_stable = r->mode_raw == TWAI.mode_reg.val &&
            r->btr0_raw == TWAI.bus_timing_0_reg.val && r->btr1_raw == TWAI.bus_timing_1_reg.val;
    } else r->clock_error = ESP_ERR_INVALID_STATE;
    r->gpio_stable = r->gpio5_mux_raw == REG_READ(IO_MUX_GPIO5_REG) &&
        ((r->gpio5_out_raw ^ REG_READ(GPIO_ENABLE_REG)) & BIT(5)) == 0 &&
        r->rx_matrix_raw == GPIO.func_in_sel_cfg[TWAI_RX_IDX].val;
    r->gpio_stable = r->gpio_stable && r->gpio4_mux_raw==REG_READ(IO_MUX_GPIO4_REG) &&
        r->gpio4_out_raw==REG_READ(GPIO_FUNC4_OUT_SEL_CFG_REG) && r->gpio4_pad_raw==REG_READ(GPIO_PIN4_REG) &&
        ((r->output_enable_raw ^ REG_READ(GPIO_ENABLE_REG)) & BIT(4))==0;
    r->ctx_valid = r->ctx_valid && readback_ctx_valid(e->normal_mode);
    if (!r->ctx_valid) r->mismatch_bits |= READER_HW_CTX;
    if (installed) {
        if (r->clock_error != ESP_OK || !r->timing.source_hz) r->mismatch_bits |= READER_HW_CLOCK;
        if (!r->registers_stable || !r->gpio_stable) r->mismatch_bits |= READER_HW_UNSTABLE;
        if (!r->rx_route_valid) r->mismatch_bits |= READER_HW_RX_ROUTE;
        if (r->gpio5_mux != PIN_FUNC_GPIO || !r->gpio5_input || r->gpio5_output ||
            r->gpio5_pullup || r->gpio5_pulldown) r->mismatch_bits |= READER_HW_RX_GPIO;
        if (r->timing.listen_only == e->normal_mode || r->timing.self_test ||
            r->timing.reset_mode == e->running) r->mismatch_bits |= READER_HW_MODE;
        if(e->normal_mode && ((r->gpio4_pad_raw & GPIO_PIN4_PAD_DRIVER) ||
                            (r->gpio4_out_raw & GPIO_FUNC4_OEN_INV_SEL))) r->mismatch_bits |= READER_HW_TX_GPIO;
        r->config_checked = e->bitrate && e->quanta_hz && e->tseg1 && e->tseg2 && e->sjw;
        if (!r->config_checked) r->mismatch_bits |= READER_HW_CONFIG_UNKNOWN;
        else {
            if (!r->timing.valid || r->timing.quanta_hz != e->quanta_hz ||
                r->timing.tseg1 != e->tseg1 || r->timing.tseg2 != e->tseg2 ||
                r->timing.sjw != e->sjw || r->timing.triple != e->triple)
                r->mismatch_bits |= READER_HW_TIMING;
            if (r->timing.bitrate != e->bitrate) r->mismatch_bits |= READER_HW_BITRATE;
        }
    }
    r->completed_us = esp_timer_get_time();
    return ESP_OK;
}

size_t reader_hw_json(const reader_hw_readback_t *r, char *buffer, size_t capacity) {
    return snprintf(buffer, capacity,
        "{\"source\":\"can_owner_snapshot\",\"captured_us\":%" PRId64 ",\"span_us\":%" PRId64 ",\"epoch\":%" PRIu32 ","
        "\"driver_installed\":%s,\"running_at_capture\":%s,\"registers_read\":%s,\"registers_stable\":%s,\"gpio_stable\":%s,"
        "\"clock_source\":\"APB_reported\",\"clock_error\":%d,\"source_hz\":%" PRIu32 ","
        "\"mode_raw\":%" PRIu32 ",\"btr0_raw\":%" PRIu32 ",\"btr1_raw\":%" PRIu32 ","
        "\"brp\":%" PRIu32 ",\"quanta_hz\":%" PRIu32 ",\"bitrate\":%" PRIu32 ",\"tseg1\":%" PRIu32 ",\"tseg2\":%" PRIu32 ",\"sjw\":%" PRIu32 ","
        "\"triple_sampling\":%s,\"sample_permill\":%" PRIu32 ",\"exact_division\":%s,\"timing_valid\":%s,"
        "\"config_checked\":%s,\"mismatch_bits\":%" PRIu32 ",\"ctx_valid\":%s,"
        "\"gpio5\":{\"mux_raw\":%" PRIu32 ",\"mux\":%" PRIu32 ",\"input\":%s,\"output\":%s,\"pullup\":%s,\"pulldown\":%s,\"level\":%s,"
        "\"rx_matrix_raw\":%" PRIu32 ",\"rx_route_valid\":%s}}",
        r->captured_us, r->completed_us - r->captured_us, r->epoch,
        r->driver_installed ? "true" : "false", r->running_at_capture ? "true" : "false",
        r->driver_installed ? "true" : "false", r->registers_stable ? "true" : "false", r->gpio_stable ? "true" : "false",
        r->clock_error, r->timing.source_hz, r->mode_raw, r->btr0_raw, r->btr1_raw,
        r->timing.brp, r->timing.quanta_hz, r->timing.bitrate, r->timing.tseg1, r->timing.tseg2, r->timing.sjw,
        r->timing.triple ? "true" : "false", r->timing.sample_permill, r->timing.exact_division ? "true" : "false",
        r->timing.valid ? "true" : "false", r->config_checked ? "true" : "false", r->mismatch_bits, r->ctx_valid ? "true" : "false",
        r->gpio5_mux_raw, r->gpio5_mux, r->gpio5_input ? "true" : "false", r->gpio5_output ? "true" : "false",
        r->gpio5_pullup ? "true" : "false", r->gpio5_pulldown ? "true" : "false", r->gpio5_level ? "true" : "false",
        r->rx_matrix_raw, r->rx_route_valid ? "true" : "false");
}
