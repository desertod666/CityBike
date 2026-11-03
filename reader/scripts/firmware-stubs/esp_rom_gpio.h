#pragma once
#include "test_sdk.h"
static inline void esp_rom_gpio_connect_out_signal(int gpio,int signal,bool inverted,bool oen){
assert(gpio==4 && !inverted && !oen);
#ifdef READER_TEST_BATTERY_QUERY
fake_query_route(gpio,signal);
#else
fake_reg[2]=(uint32_t)signal;
#endif
}
