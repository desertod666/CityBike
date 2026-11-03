#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"

typedef struct {
    uint32_t source_hz, brp, tseg1, tseg2, sjw, quanta_hz, bitrate, sample_permill;
    bool triple, listen_only, reset_mode, self_test, exact_division, valid;
} reader_hw_timing_t;

// ESP32-C3 IDF5.5: BTR0 has a 13-bit BRP field and a separate SJW at bits14..15.
// Do not decode it as the original SJA1000's six-bit prescaler.
static inline reader_hw_timing_t reader_hw_decode(uint32_t hz, uint32_t btr0,
                                                 uint32_t btr1, uint32_t mode) {
    reader_hw_timing_t t = {.source_hz = hz, .brp = ((btr0 & 0x1fffU) + 1U) * 2U,
        .sjw = ((btr0 >> 14) & 3U) + 1U, .tseg1 = (btr1 & 15U) + 1U,
        .tseg2 = ((btr1 >> 4) & 7U) + 1U, .triple = !!(btr1 & 128U),
        .listen_only = !!(mode & 2U), .reset_mode = !!(mode & 1U),
        .self_test = !!(mode & 4U)};
    uint32_t total = 1U + t.tseg1 + t.tseg2;
    if (hz) {
        t.quanta_hz = hz / t.brp;
        t.bitrate = (uint32_t)((uint64_t)hz / ((uint64_t)t.brp * total));
        t.exact_division = hz % t.brp == 0 && t.quanta_hz % total == 0;
    }
    t.sample_permill = 1000U * (1U + t.tseg1) / total;
    t.valid = hz && t.exact_division && t.sjw <= t.tseg2;
    return t;
}

enum {
    READER_HW_CLOCK = 1U, READER_HW_UNSTABLE = 2U, READER_HW_TIMING = 4U,
    READER_HW_BITRATE = 8U, READER_HW_MODE = 16U, READER_HW_RX_ROUTE = 32U,
    READER_HW_RX_GPIO = 64U, READER_HW_CTX = 128U, READER_HW_CONFIG_UNKNOWN = 256U,
    READER_HW_TX_GPIO = 512U,
};

typedef struct {
    uint32_t bitrate, quanta_hz, tseg1, tseg2, sjw, epoch;
    bool triple, running, normal_mode;
} reader_hw_expected_t;

typedef struct {
    int64_t captured_us, completed_us;
    uint32_t epoch, mode_raw, btr0_raw, btr1_raw, rx_matrix_raw;
    uint32_t gpio5_mux_raw, gpio5_out_raw, gpio5_mux;
    uint32_t gpio4_mux_raw, gpio4_out_raw, gpio4_pad_raw, output_enable_raw;
    uint32_t mismatch_bits;
    bool driver_installed, running_at_capture, registers_stable, gpio_stable, ctx_valid;
    bool gpio5_input, gpio5_output, gpio5_pullup, gpio5_pulldown, gpio5_level, rx_route_valid;
    bool config_checked, expected_normal_mode;
    esp_err_t clock_error;
    reader_hw_timing_t timing;
} reader_hw_readback_t;

// Call only from the existing CAN owner (or app_main before starting that task).
// driver_installed=false avoids every TWAI register read. No GPIO writes,
// lifecycle calls, ECC/interrupt/ALC/FIFO/acceptance-window reads are performed.
esp_err_t reader_hw_readback(bool driver_installed, const reader_hw_expected_t *expected,
                             reader_hw_readback_t *result);
size_t reader_hw_json(const reader_hw_readback_t *result, char *buffer, size_t capacity);
