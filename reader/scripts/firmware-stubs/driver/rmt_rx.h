#pragma once
#include "../test_sdk.h"
#define RMT_CLK_SRC_DEFAULT 0
typedef union {uint32_t val;struct {uint32_t duration0:15,level0:1,duration1:15,level1:1;};}rmt_symbol_word_t;
typedef struct fake_rmt *rmt_channel_handle_t;
typedef struct {rmt_symbol_word_t *received_symbols;size_t num_symbols;struct {unsigned is_last:1;}flags;}rmt_rx_done_event_data_t;
typedef struct {bool(*on_recv_done)(rmt_channel_handle_t,const rmt_rx_done_event_data_t*,void*);}rmt_rx_event_callbacks_t;
typedef struct {int gpio_num,clk_src;uint32_t resolution_hz;size_t mem_block_symbols;struct{unsigned io_loop_back:1;}flags;}rmt_rx_channel_config_t;
typedef struct {uint32_t signal_range_min_ns,signal_range_max_ns;}rmt_receive_config_t;
struct fake_rmt {int gpio;bool enabled,armed;rmt_rx_event_callbacks_t callbacks;void*context;rmt_symbol_word_t*buffer;size_t size;};
static struct fake_rmt fake_rmt_channels[2];
static unsigned fake_rmt_create_calls,fake_rmt_arm_calls;
static int fake_rmt_create_fail,fake_rmt_arm_fail,fake_rmt_disable_fail,fake_rmt_delete_fail;
static bool fake_rmt_early_done;
static inline int rmt_new_rx_channel(const rmt_rx_channel_config_t*c,rmt_channel_handle_t*out){
    assert(c->gpio_num==4||c->gpio_num==5);assert(c->resolution_hz==2000000&&c->mem_block_symbols==48);
    fake_rmt_create_calls++;if(fake_rmt_create_fail==(int)fake_rmt_create_calls)return ESP_FAIL;
    struct fake_rmt *p=&fake_rmt_channels[c->gpio_num==4?0:1];memset(p,0,sizeof(*p));p->gpio=c->gpio_num;
    gpio_pullup_en(p->gpio);if(c->flags.io_loop_back)fake_reg[0]|=BIT(p->gpio);*out=p;return ESP_OK;
}
static inline int rmt_rx_register_event_callbacks(rmt_channel_handle_t p,const rmt_rx_event_callbacks_t*c,void*ctx){p->callbacks=*c;p->context=ctx;return ESP_OK;}
static inline int rmt_enable(rmt_channel_handle_t p){p->enabled=true;return ESP_OK;}
static inline int rmt_receive(rmt_channel_handle_t p,void*b,size_t size,const rmt_receive_config_t*c){
    assert(p->enabled&&size==256&&c->signal_range_min_ns==0&&c->signal_range_max_ns==1000000);
    fake_rmt_arm_calls++;if(fake_rmt_arm_fail==(int)fake_rmt_arm_calls)return ESP_FAIL;
    p->armed=true;p->buffer=b;p->size=size;
    if(fake_rmt_early_done){rmt_rx_done_event_data_t e={.received_symbols=b,.num_symbols=0,.flags.is_last=true};p->callbacks.on_recv_done(p,&e,p->context);}
    return ESP_OK;
}
static inline int rmt_disable(rmt_channel_handle_t p){if(fake_rmt_disable_fail==p->gpio)return ESP_FAIL;p->enabled=p->armed=false;return ESP_OK;}
static inline int rmt_del_channel(rmt_channel_handle_t p){assert(!p->enabled);if(fake_rmt_delete_fail==p->gpio)return ESP_FAIL;return ESP_OK;}
