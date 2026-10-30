#pragma once
#include "test_sdk.h"
static inline void esp_rom_delay_us(uint32_t us) { fake_clock += us; }
