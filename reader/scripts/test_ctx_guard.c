#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include "../src/ctx_guard.h"

uint32_t fake_reg[4];
int fake_pad = 1, high_written = 0;
int fail_reset, fail_level, fail_direction;
esp_err_t gpio_reset_pin(gpio_num_t pin) { assert(pin == 4); if(fail_reset)return -1; fake_reg[0]=0; high_written=0; return 0; }
esp_err_t gpio_set_level(gpio_num_t pin, int value) { assert(pin==4 && value==1); if(fail_level)return -1; fake_reg[1] |= BIT(4); high_written=1; return 0; }
esp_err_t gpio_set_direction(gpio_num_t pin, gpio_mode_t mode) { assert(pin==4 && mode==GPIO_MODE_INPUT_OUTPUT && high_written); if(fail_direction)return -1; fake_reg[0]|=BIT(4);fake_reg[2]=128;fake_reg[3]=FUN_IE|(1<<12);return 0; }
int gpio_get_level(gpio_num_t pin) { assert(pin==4); return fake_pad; }

int main(void) {
    assert(READER_TWAI_TX_GPIO==10 && READER_CTX_GPIO==4);
    assert(!reader_ctx_guard().valid);
    assert(reader_ctx_init()==0 && reader_ctx_guard().valid);
    const uint32_t good[4]={fake_reg[0],fake_reg[1],fake_reg[2],fake_reg[3]};
    struct {int reg;uint32_t value;} faults[]={
        {0,0},{1,0},{2,45},{2,128|BIT(8)},{3,FUN_IE},{3,1<<12}
    };
    for(unsigned i=0;i<sizeof(faults)/sizeof(faults[0]);i++){
        fake_reg[faults[i].reg]=faults[i].value;
        assert(!reader_ctx_guard().valid);
        for(int j=0;j<4;j++)fake_reg[j]=good[j];
    }
    fake_pad=0;assert(!reader_ctx_guard().valid);fake_pad=1;
    assert(reader_ctx_hold() && reader_ctx_guard().valid);
    fake_reg[3]=FUN_IE;assert(reader_ctx_hold() && reader_ctx_guard().valid);
    for(unsigned i=0;i<3;i++) {
        fake_reg[1]=0; fail_reset=i==0;fail_level=i==1;fail_direction=i==2;
        assert(!reader_ctx_hold());
        fail_reset=fail_level=fail_direction=0;assert(reader_ctx_hold());
    }
    fake_pad=0;assert(!reader_ctx_hold());fake_pad=1;assert(reader_ctx_hold());
    puts("PASS actual ctx_guard header: rejects wrong route/mux/enable/input/latch/inversion/pad; HIGH latch precedes output enable; hold never writes LOW");
}
