#pragma once
#include "test_sdk.h"
typedef struct {
    union {
        struct { uint32_t in_sel:5, sig_in_inv:1, sig_in_sel:1, reserved:25; };
        uint32_t val;
    } func_in_sel_cfg[128];
} fake_gpio_t;
extern fake_gpio_t GPIO;
