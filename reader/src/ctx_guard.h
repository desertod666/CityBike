#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "driver/gpio.h"
#include "soc/soc.h"
#include "soc/gpio_reg.h"
#include "soc/io_mux_reg.h"
#include "soc/gpio_sig_map.h"

// Existing CTX wire stays on4. GPIO10 MUST remain physically unconnected.
#define READER_CTX_GPIO GPIO_NUM_4
#define READER_TWAI_TX_GPIO GPIO_NUM_10
_Static_assert(READER_CTX_GPIO != READER_TWAI_TX_GPIO, "CTX must not carry TWAI TX");

typedef struct {
    uint32_t out_sel, mux;
    bool enabled, input_enabled, latch_high, inverted, level, valid;
} ctx_guard_t;

static inline ctx_guard_t reader_ctx_guard(void) {
    ctx_guard_t g = {
        .out_sel = REG_GET_FIELD(GPIO_FUNC4_OUT_SEL_CFG_REG, GPIO_FUNC4_OUT_SEL),
        .mux = REG_GET_FIELD(IO_MUX_GPIO4_REG, MCU_SEL),
        .enabled = !!(REG_READ(GPIO_ENABLE_REG) & BIT(4)),
        .input_enabled = !!(REG_READ(IO_MUX_GPIO4_REG) & FUN_IE),
        .latch_high = !!(REG_READ(GPIO_OUT_REG) & BIT(4)),
        .inverted = !!REG_GET_FIELD(GPIO_FUNC4_OUT_SEL_CFG_REG, GPIO_FUNC4_OUT_INV_SEL),
        .level = gpio_get_level(READER_CTX_GPIO) == 1,
    };
    g.valid = g.out_sel == SIG_GPIO_OUT_IDX && g.mux == PIN_FUNC_GPIO &&
              g.enabled && g.input_enabled && g.latch_high && !g.inverted && g.level;
    return g;
}

static inline esp_err_t reader_ctx_init(void) {
    esp_err_t r = gpio_reset_pin(READER_CTX_GPIO);
    if (r != ESP_OK) return r;
    r = gpio_set_level(READER_CTX_GPIO, 1); // latch HIGH before enabling output
    if (r != ESP_OK) return r;
    // output_enable routes simple GPIO, never TWAI. Input allows pad readback.
    return gpio_set_direction(READER_CTX_GPIO, GPIO_MODE_INPUT_OUTPUT);
}

static inline bool reader_ctx_hold(void) {
    esp_err_t result = reader_ctx_guard().valid ? gpio_set_level(READER_CTX_GPIO, 1) : reader_ctx_init();
    return result == ESP_OK && reader_ctx_guard().valid;
}
