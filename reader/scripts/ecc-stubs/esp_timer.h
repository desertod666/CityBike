#pragma once
#include <stdint.h>
static int64_t test_ecc_clock;
static inline int64_t esp_timer_get_time(void) { return ++test_ecc_clock; }
