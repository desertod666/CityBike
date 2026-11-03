#pragma once
#include "test_sdk.h"
typedef struct {
    struct { uint32_t val; } mode_reg, bus_timing_0_reg, bus_timing_1_reg;
} fake_twai_t;
extern fake_twai_t fake_twai_regs;
extern bool fake_twai_access_allowed;
extern unsigned fake_twai_reads;
static inline fake_twai_t *fake_twai_access(void) {
    assert(fake_twai_access_allowed); fake_twai_reads++; return &fake_twai_regs;
}
#define TWAI (*fake_twai_access())
