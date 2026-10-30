#pragma once
#include <stdio.h>
#include <inttypes.h>
#include "error_probe.h"

/* Latest already-observed event from this boot. It is not an epoch snapshot:
 * callers compare t_us with their capture bounds before attributing it. */
static inline bool reader_last_ecc_json(error_ecc_history_t h, char *out, size_t capacity) {
    if (!out || !capacity || h.count > READER_ECC_HISTORY) return false;
    int n;
    if (!h.count) n = snprintf(out, capacity, "null");
    else {
        error_ecc_event_t e = h.events[h.count - 1];
        n = snprintf(out, capacity,
            "{\"source\":\"single_HAL_ECC_read\",\"scope\":\"boot_history\",\"event\":%" PRIu32 ",\"t_us\":%" PRIu64 ",\"raw\":%u,\"type\":%u,\"direction\":%u,\"segment\":%u,\"saturated\":%s}",
            e.event, e.t_us, e.capture, e.capture >> 6, (e.capture >> 5) & 1, e.capture & 31, h.saturated ? "true" : "false");
    }
    return n >= 0 && (size_t)n < capacity;
}

/* Raw ECC fields only. Numeric segments are interpreted off-device against the
 * actual pinned C3 LL definitions. Saturation/missing history stays explicit. */
static inline bool reader_ecc_json(error_ecc_history_t h, uint32_t after, char *out, size_t capacity) {
    if (!out || !capacity || h.count > READER_ECC_HISTORY) return false;
    bool incomplete = h.saturated || h.total < after || h.total - after > h.count;
    int n = snprintf(out, capacity, "{\"source\":\"single_HAL_ECC_read\",\"after_event\":%" PRIu32 ",\"total\":%" PRIu32 ",\"incomplete\":%s,\"events\":[", after, h.total, incomplete ? "true" : "false");
    if (n < 0 || (size_t)n >= capacity) return false;
    size_t used = (size_t)n; unsigned emitted = 0;
    for (unsigned i = 0; i < h.count; i++) {
        error_ecc_event_t e = h.events[i];
        if (e.event <= after) continue;
        n = snprintf(out + used, capacity - used, "%s{\"event\":%" PRIu32 ",\"t_us\":%" PRIu64 ",\"raw\":%u,\"type\":%u,\"direction\":%u,\"segment\":%u}", emitted++ ? "," : "", e.event, e.t_us, e.capture, e.capture >> 6, (e.capture >> 5) & 1, e.capture & 31);
        if (n < 0 || (size_t)n >= capacity - used) return false;
        used += (size_t)n;
    }
    n = snprintf(out + used, capacity - used, "]}");
    return n >= 0 && (size_t)n < capacity - used;
}
