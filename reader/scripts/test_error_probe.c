#include <assert.h>
#include "../src/error_probe.h"

int main(void) {
    error_probe_t p = {0};
    error_probe_add(&p, 1); error_probe_add(&p, 2); error_probe_add(&p, 4);
    error_probe_add(&p, 8); error_probe_add(&p, 0);
    assert(p.total == 5 && p.bit == 1 && p.form == 1 && p.stuff == 1 && p.ack == 1 && p.other == 1);
    for (unsigned i = 0; i < 1000000; i++) error_probe_add(&p, 4);
    assert(p.total == 1000005 && p.stuff == 1000001 && p.last_flags == 4 && !p.saturated);
    p.total = UINT32_MAX; p.ack = UINT32_MAX;
    error_probe_add(&p, 8);
    assert(p.total == UINT32_MAX && p.ack == UINT32_MAX && p.saturated);
    return 0;
}
