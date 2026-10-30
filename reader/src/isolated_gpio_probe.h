#pragma once
#include "esp_rom_sys.h"

/* Called only by the USB, physically isolated selftest owner, with TWAI absent.
 * This is a level loopback test, not CAN traffic or a battery command. No task
 * delay, cancellation branch or peripheral cleanup can strand CTX dominant. */
typedef struct {
    bool attempted, passed, ctx_restored;
    const char *reason;
    int tx[3], rx[3], low_rc, high_rc;
} reader_gpio_probe_t;
static reader_gpio_probe_t reader_gpio_probe;
static portMUX_TYPE reader_gpio_probe_lock = portMUX_INITIALIZER_UNLOCKED;

static void reader_gpio_probe_reset(void) {
    reader_gpio_probe = (reader_gpio_probe_t){.reason = "not_run_after_failure",
        .tx = {-1, -1, -1}, .rx = {-1, -1, -1},
        .low_rc = ESP_ERR_INVALID_STATE, .high_rc = ESP_ERR_INVALID_STATE};
}

static bool reader_gpio_probe_run(void) {
    reader_gpio_probe_t *p = &reader_gpio_probe;
    if (installed || battery_cancelled() || !reader_ctx_hold()) {
        p->reason = "gpio_probe_precondition_failed";
        p->ctx_restored = reader_ctx_hold();
        return false;
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
    /* One 100 us settling hold. Critical section prevents task preemption while
     * LOW. Always restore HIGH before leaving it, including a set-level error. */
    portENTER_CRITICAL(&reader_gpio_probe_lock);
    p->low_rc = gpio_set_level(GPIO_NUM_4, 0);
    esp_rom_delay_us(100);
    p->tx[1] = gpio_get_level(GPIO_NUM_4);
    p->rx[1] = gpio_get_level(GPIO_NUM_5);
    p->high_rc = gpio_set_level(GPIO_NUM_4, 1);
    portEXIT_CRITICAL(&reader_gpio_probe_lock);
    p->ctx_restored = reader_ctx_hold();
    esp_rom_delay_us(20);
    p->tx[2] = gpio_get_level(GPIO_NUM_4);
    p->rx[2] = gpio_get_level(GPIO_NUM_5);
    p->passed = p->low_rc == ESP_OK && p->high_rc == ESP_OK && p->ctx_restored &&
        p->tx[1] == 0 && p->rx[1] == 0 && p->tx[2] == 1 && p->rx[2] == 1;
    p->reason = p->passed ? "gpio_loopback_verified" : !p->ctx_restored ? "gpio_probe_restore_failed" :
        p->low_rc != ESP_OK || p->high_rc != ESP_OK ? "gpio_probe_set_failed" :
        p->tx[1] != 0 || p->tx[2] != 1 ? "gpio_probe_tx_mismatch" : "gpio_probe_rx_mismatch";
    if (battery_cancelled()) { p->passed = false; p->reason = "usb_or_stop_cancelled"; }
    return p->passed;
}
