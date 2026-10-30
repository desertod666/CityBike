#pragma once
#include "esp_rom_sys.h"

/* Called only by the USB, physically isolated selftest owner, with TWAI absent.
 * This is a level loopback test, not CAN traffic or a battery command. No task
 * delay, cancellation branch or peripheral cleanup can strand CTX dominant. */
typedef struct {
    bool attempted, passed, ctx_restored, rx_config_valid;
    const char *reason;
    int tx[3], rx[3], low_rc, high_rc, rx_config_rc;
    uint32_t low_hold_us;
} reader_gpio_probe_t;
static reader_gpio_probe_t reader_gpio_probe;
static portMUX_TYPE reader_gpio_probe_lock = portMUX_INITIALIZER_UNLOCKED;

static void reader_gpio_probe_reset(void) {
    reader_gpio_probe = (reader_gpio_probe_t){.reason = "not_run_after_failure",
        .tx = {-1, -1, -1}, .rx = {-1, -1, -1},
        .low_rc = ESP_ERR_INVALID_STATE, .high_rc = ESP_ERR_INVALID_STATE,
        .rx_config_rc = ESP_ERR_INVALID_STATE, .low_hold_us = 100};
}

static bool reader_gpio_probe_run(bool voltmeter) {
    reader_gpio_probe_t *p = &reader_gpio_probe;
    p->low_hold_us = voltmeter ? UINT32_C(8000000) : 100;
    if (installed || battery_cancelled() || !reader_ctx_hold()) {
        p->reason = "gpio_probe_precondition_failed";
        p->ctx_restored = reader_ctx_hold();
        return false;
    }
    gpio_config_t config = {.pin_bit_mask = 1ULL << GPIO_NUM_5, .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE, .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE};
    p->rx_config_rc = gpio_config(&config);
    uint32_t mux = REG_READ(IO_MUX_GPIO5_REG);
    p->rx_config_valid = p->rx_config_rc == ESP_OK &&
        ((mux & MCU_SEL_M) >> MCU_SEL_S) == PIN_FUNC_GPIO &&
        (mux & FUN_IE) && !(mux & (FUN_PU | FUN_PD)) && !(REG_READ(GPIO_ENABLE_REG) & BIT(5));
    if (!p->rx_config_valid) {
        p->reason = "gpio_probe_rx_config_failed";
        p->ctx_restored = reader_ctx_hold();
        return false;
    }
    if (battery_cancelled()) {
        p->reason = "usb_or_stop_cancelled"; p->ctx_restored = reader_ctx_hold(); return false;
    }
    p->attempted = true;
    esp_rom_delay_us(20);
    p->tx[0] = gpio_get_level(GPIO_NUM_4);
    p->rx[0] = gpio_get_level(GPIO_NUM_5);
    if (p->tx[0] != 1 || p->rx[0] != 1) {
        p->reason = "gpio_probe_idle_not_high";
        p->ctx_restored = reader_ctx_hold();
        return false;
    }
    bool cancelled = false;
    if (!voltmeter) portENTER_CRITICAL(&reader_gpio_probe_lock);
    p->low_rc = gpio_set_level(GPIO_NUM_4, 0);
    if (voltmeter && p->low_rc == ESP_OK) {
        /* Fixed eight-second multimeter window, USB-only + detached CAN.
         * Yield while holding the latch, and honour STOP/USB loss every tick.
         * Bounded iteration count also restores HIGH if the clock stalls. */
        uint64_t deadline = (uint64_t)esp_timer_get_time() + p->low_hold_us;
        for (unsigned i = 0; i < 10000; i++) {
            if (battery_cancelled()) { cancelled = true; break; }
            if ((uint64_t)esp_timer_get_time() >= deadline) break;
            vTaskDelay(1);
        }
    } else esp_rom_delay_us(100);
    p->tx[1] = gpio_get_level(GPIO_NUM_4);
    p->rx[1] = gpio_get_level(GPIO_NUM_5);
    p->high_rc = gpio_set_level(GPIO_NUM_4, 1);
    if (!voltmeter) portEXIT_CRITICAL(&reader_gpio_probe_lock);
    p->ctx_restored = reader_ctx_hold();
    esp_rom_delay_us(20);
    p->tx[2] = gpio_get_level(GPIO_NUM_4);
    p->rx[2] = gpio_get_level(GPIO_NUM_5);
    p->passed = p->low_rc == ESP_OK && p->high_rc == ESP_OK && p->ctx_restored &&
        p->tx[1] == 0 && p->rx[1] == 0 && p->tx[2] == 1 && p->rx[2] == 1;
    p->reason = p->passed ? "gpio_loopback_verified" : !p->ctx_restored ? "gpio_probe_restore_failed" :
        p->low_rc != ESP_OK || p->high_rc != ESP_OK ? "gpio_probe_set_failed" :
        p->tx[1] != 0 || p->tx[2] != 1 ? "gpio_probe_tx_mismatch" : "gpio_probe_rx_mismatch";
    if (cancelled || battery_cancelled()) { p->passed = false; p->reason = "usb_or_stop_cancelled"; }
    return p->passed;
}
