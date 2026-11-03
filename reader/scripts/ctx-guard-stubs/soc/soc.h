#pragma once
#include <stdint.h>
extern uint32_t fake_reg[4];
#define BIT(n) (1U<<(n))
#define REG_READ(r) fake_reg[r]
#define REG_GET_FIELD(r,f) ((fake_reg[r]&f##_M)>>f##_S)
