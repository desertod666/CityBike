#pragma once
#include <stdint.h>
#include <stdbool.h>

typedef struct {
    uint32_t total, bit, form, stuff, ack, other;
    uint32_t last_flags;
    bool saturated;
} error_probe_t;

static inline __attribute__((always_inline)) void error_probe_add(error_probe_t *p, uint32_t flags) {
    uint32_t *counter = (flags & 1) ? &p->bit : (flags & 2) ? &p->form :
                        (flags & 4) ? &p->stuff : (flags & 8) ? &p->ack : &p->other;
    if (p->total == UINT32_MAX || *counter == UINT32_MAX) p->saturated = true;
    if (p->total != UINT32_MAX) p->total++;
    if (*counter != UINT32_MAX) (*counter)++;
    p->last_flags = flags;
}

error_probe_t reader_error_probe(void);

#define READER_ECC_HISTORY 8
typedef struct { uint64_t t_us; uint32_t event; uint8_t capture; } error_ecc_event_t;
typedef struct {
    uint32_t count, total;
    bool saturated;
    error_ecc_event_t events[READER_ECC_HISTORY];
} error_ecc_history_t;

/* Copy already-read ECC fields; never reads a peripheral register. */
error_ecc_history_t reader_error_ecc_history(void);
