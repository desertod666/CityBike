#pragma once
#include <stdbool.h>
#include <stdint.h>

#define RX_CHECK_MS 10000
#define RX_CHECK_EDGE_LIMIT 4096
typedef enum { RX_IDLE, RX_RUNNING, RX_COMPLETE, RX_CANCELLED } rx_state_t;
typedef struct {
    rx_state_t state;
    uint32_t id, edges;
    bool capped;
    int initial_level, final_level;
    int64_t started_us, ended_us;
} rx_check_t;

static inline void rx_probe_begin(rx_check_t *r, int64_t now, int level) {
    uint32_t id = r->id + 1;
    *r = (rx_check_t){.state=RX_RUNNING, .id=id, .initial_level=level,
        .final_level=level, .started_us=now};
}

static inline bool rx_probe_edge(rx_check_t *r) {
    if (r->state != RX_RUNNING || r->edges >= RX_CHECK_EDGE_LIMIT) return false;
    r->edges++;
    r->capped = r->edges == RX_CHECK_EDGE_LIMIT;
    return r->capped;
}

static inline bool rx_probe_due(const rx_check_t *r, int64_t now) {
    return r->state == RX_RUNNING && (r->capped || now-r->started_us >= RX_CHECK_MS*1000LL);
}

static inline void rx_probe_finish(rx_check_t *r, rx_state_t state, int64_t now, int level) {
    if (r->state != RX_RUNNING) return;
    r->state=state; r->ended_us=now; r->final_level=level;
}
