#pragma once
#include "test_sdk.h"
#define SOC_MOD_CLK_APB 1
#define ESP_CLK_TREE_SRC_FREQ_PRECISION_CACHED 0
extern unsigned fake_clock_reads;
extern uint32_t fake_apb_hz;
extern int fake_clock_error;
extern void fake_during_clock_read(void);
static inline esp_err_t esp_clk_tree_src_get_freq_hz(int source, int precision, uint32_t *hz) {
    assert(source == SOC_MOD_CLK_APB && precision == ESP_CLK_TREE_SRC_FREQ_PRECISION_CACHED);
    fake_clock_reads++; fake_during_clock_read(); *hz = fake_apb_hz; return fake_clock_error;
}
