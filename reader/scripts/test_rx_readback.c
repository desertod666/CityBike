// Executes the actual read-only hardware unit against instrumented peripheral stubs.
#include "../src/rx_readback.c"
#include <assert.h>
#include <stdlib.h>

uint32_t fake_reg[7]; int fake_pad = 1, fake_gpio_fail; uint64_t fake_clock;
fake_gpio_t GPIO; fake_twai_t fake_twai_regs;
bool fake_twai_access_allowed; unsigned fake_twai_reads, fake_clock_reads;
uint32_t fake_apb_hz; int fake_clock_error, mutation;
void fake_during_clock_read(void) {
    if (mutation == 1) fake_twai_regs.bus_timing_1_reg.val ^= 1;
    if (mutation == 2) GPIO.func_in_sel_cfg[TWAI_RX_IDX].sig_in_inv = 1;
    if (mutation == 3) fake_reg[GPIO_OUT_REG] &= ~BIT(4);
}
static reader_hw_expected_t nominal(void) {
    return (reader_hw_expected_t){.bitrate = 250000, .quanta_hz = 4000000,
        .tseg1 = 11, .tseg2 = 4, .sjw = 2, .epoch = 7, .running = true};
}
static void reset_test(void) {
    memset(fake_reg, 0, sizeof(fake_reg)); memset(&GPIO, 0, sizeof(GPIO));
    memset(&fake_twai_regs, 0, sizeof(fake_twai_regs)); fake_pad = 1;
    fake_clock = fake_twai_reads = fake_clock_reads = fake_clock_error = mutation = 0;
    fake_apb_hz = 80000000; fake_twai_access_allowed = true;
    assert(reader_ctx_init() == ESP_OK);
    fake_reg[IO_MUX_GPIO5_REG] = FUN_IE | (PIN_FUNC_GPIO << MCU_SEL_S);
    GPIO.func_in_sel_cfg[TWAI_RX_IDX].in_sel = 5;
    GPIO.func_in_sel_cfg[TWAI_RX_IDX].sig_in_sel = 1;
    fake_twai_regs.mode_reg.val = 2;
    fake_twai_regs.bus_timing_0_reg.val = 0x4009;
    fake_twai_regs.bus_timing_1_reg.val = 0x3a;
}
static void evidence(const char *name, const reader_hw_readback_t *r) {
    char json[1800]; size_t n = reader_hw_json(r, json, sizeof(json));
    assert(n < sizeof(json));
    if (getenv("READER_TEST_WIRE"))
        printf("{\"type\":\"readback_test\",\"case\":\"%s\",\"hardware_readback\":%s}\n", name, json);
}
int main(void) {
    reader_hw_expected_t e = nominal(); reader_hw_readback_t r;
    // Extended BRP bits must remain separate from SJW and the reserved bit13.
    const uint32_t raw[] = {0, 0x3f, 0x40, 0xff, 0x100, 0x1fff};
    const uint32_t brp[] = {2, 128, 130, 512, 514, 16384};
    for (unsigned i = 0; i < sizeof(raw)/sizeof(raw[0]); i++) {
        reader_hw_timing_t t = reader_hw_decode(80000000, raw[i] | 0x6000, 0x3a, 2);
        assert(t.brp == brp[i] && t.sjw == 2);
    }
    reset_test();
    e.normal_mode=true;fake_reg[GPIO_FUNC4_OUT_SEL_CFG_REG]=TWAI_TX_IDX;
    fake_twai_regs.mode_reg.val=0;fake_twai_regs.bus_timing_1_reg.val=0xba;e.triple=true;
    assert(reader_hw_readback(true,&e,&r)==ESP_OK && !r.mismatch_bits);
    fake_reg[GPIO_PIN4_REG]=GPIO_PIN4_PAD_DRIVER;reader_hw_readback(true,&e,&r);assert(r.mismatch_bits==READER_HW_TX_GPIO);
    fake_reg[GPIO_PIN4_REG]=0;fake_reg[GPIO_FUNC4_OUT_SEL_CFG_REG]|=GPIO_FUNC4_OEN_INV_SEL;reader_hw_readback(true,&e,&r);assert(r.mismatch_bits==READER_HW_TX_GPIO);
    fake_reg[GPIO_FUNC4_OUT_SEL_CFG_REG]=TWAI_TX_IDX;fake_twai_regs.mode_reg.val=2;reader_hw_readback(true,&e,&r);assert(r.mismatch_bits==READER_HW_MODE);
    e=nominal();reset_test();
    uint32_t registers[7]; memcpy(registers, fake_reg, sizeof(registers));
    fake_twai_t before_twai = fake_twai_regs; fake_gpio_t before_gpio = GPIO;
    assert(reader_hw_readback(true, &e, &r) == ESP_OK);
    assert(!r.mismatch_bits && r.config_checked && r.driver_installed && r.registers_stable && r.gpio_stable);
    assert(r.timing.brp == 20 && r.timing.quanta_hz == 4000000 && r.timing.bitrate == 250000 && r.timing.sample_permill == 750);
    assert(r.captured_us <= r.completed_us && r.epoch == 7 && fake_clock_reads == 1 && fake_twai_reads == 6);
    assert(!memcmp(registers, fake_reg, sizeof(registers)) && !memcmp(&before_twai, &fake_twai_regs, sizeof(before_twai)) && !memcmp(&before_gpio, &GPIO, sizeof(GPIO)));
    evidence("nominal", &r);
    reset_test(); fake_twai_regs.bus_timing_1_reg.val = 0x1c; e.tseg1 = 13; e.tseg2 = 2;
    reader_hw_readback(true, &e, &r); assert(!r.mismatch_bits && r.timing.sample_permill == 875);
    e = nominal(); reader_hw_readback(true, &e, &r);
    assert(r.mismatch_bits == READER_HW_TIMING); // Same nominal bitrate, wrong sample point.
    reset_test(); fake_apb_hz = 40000000; reader_hw_readback(true, &e, &r);
    assert(r.timing.bitrate == 125000 && r.mismatch_bits == (READER_HW_TIMING | READER_HW_BITRATE));
    evidence("clock_mismatch", &r);
    reset_test(); fake_clock_error = ESP_FAIL; reader_hw_readback(true, &e, &r);
    assert(!r.timing.valid && !r.timing.source_hz && (r.mismatch_bits & READER_HW_CLOCK));
    reset_test(); mutation = 1; reader_hw_readback(true, &e, &r);
    assert(!r.registers_stable && r.mismatch_bits == READER_HW_UNSTABLE); evidence("unstable", &r);
    reset_test(); mutation = 2; reader_hw_readback(true, &e, &r); assert(!r.gpio_stable && (r.mismatch_bits & READER_HW_UNSTABLE));
    reset_test(); GPIO.func_in_sel_cfg[TWAI_RX_IDX].sig_in_inv = 1;
    reader_hw_readback(true, &e, &r); assert(r.mismatch_bits == READER_HW_RX_ROUTE);
    reset_test(); fake_reg[GPIO_ENABLE_REG] |= BIT(5);
    reader_hw_readback(true, &e, &r); assert(r.mismatch_bits == READER_HW_RX_GPIO);
    reset_test(); fake_reg[IO_MUX_GPIO5_REG] |= FUN_PU;
    reader_hw_readback(true, &e, &r); assert(r.mismatch_bits == READER_HW_RX_GPIO);
    reset_test(); fake_twai_regs.mode_reg.val = 0;
    reader_hw_readback(true, &e, &r); assert(r.mismatch_bits == READER_HW_MODE);
    reset_test(); fake_twai_regs.mode_reg.val = 3;
    reader_hw_readback(true, &e, &r); assert(r.mismatch_bits == READER_HW_MODE);
    e.running = false; reader_hw_readback(true, &e, &r); assert(!r.mismatch_bits);
    reset_test(); mutation = 3; reader_hw_readback(true, &e, &r); assert(!r.ctx_valid && (r.mismatch_bits & READER_HW_CTX));
    reset_test(); e = nominal(); e.quanta_hz = 0;
    reader_hw_readback(true, &e, &r); assert(!r.config_checked && (r.mismatch_bits & READER_HW_CONFIG_UNKNOWN));
    reset_test(); fake_twai_access_allowed = false; e.running = false;
    reader_hw_readback(false, &e, &r);
    assert(!r.driver_installed && !r.config_checked && !r.registers_stable && !r.timing.valid && r.clock_error == ESP_ERR_INVALID_STATE);
    assert(fake_twai_reads == 0 && fake_clock_reads == 0 && !r.mismatch_bits); evidence("not_installed", &r);
    assert(reader_hw_readback(false, NULL, &r) == ESP_ERR_INVALID_ARG);
    assert(reader_hw_readback(false, &e, NULL) == ESP_ERR_INVALID_ARG);
    puts("PASS actual readback: extended C3 BRP, nominal/LATE, injected clock/timing/mode/route/GPIO/CTX faults, repeated-read changes, no peripheral writes, no TWAI reads when uninstalled");
}
