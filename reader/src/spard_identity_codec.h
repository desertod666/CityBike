#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

/* Offline encoding only; deliberately not included by main.c and no transport.
 * Static layout: PC004143E4, checksum0057D540, supplied BMS2.4 handler08006078.
 * Device acceptance, target binding, freshness, permissions and persistent
 * readback/restore must be established before any future write integration. */
#define SPARD_IDENTITY_BYTES 72
#define SPARD_IDENTITY_SLOT_BYTES 32
typedef enum {
    SPARD_IDENTITY_OK, SPARD_IDENTITY_BAD_ARGUMENT, SPARD_IDENTITY_CONTEXT_REQUIRED,
    SPARD_IDENTITY_BAD_BASELINE, SPARD_IDENTITY_BAD_SLOT, SPARD_IDENTITY_UNCHANGED
} spard_identity_result_t;
typedef struct {
    uint8_t request[SPARD_IDENTITY_BYTES], restoration_request[SPARD_IDENTITY_BYTES];
    uint8_t changed_slots; /* bit0 serial number, bit1 model */
    bool valid;
} spard_identity_plan_t;

static inline uint8_t spard_identity_xor(const uint8_t *bytes) {
    uint8_t value = 0;
    for (unsigned i = 0; i < SPARD_IDENTITY_BYTES - 2; i++) value ^= bytes[i];
    return value;
}

/* NULL with length0 preserves all original bytes; a replacement is strict ASCII.
 * This is byte encoding, not a claim that a slot identifies a particular pack. */
static inline bool spard_identity_replace(uint8_t *slot, const uint8_t *value, size_t length) {
    if (!value) return length == 0;
    if (!length || length > SPARD_IDENTITY_SLOT_BYTES) return false;
    bool nonblank = false;
    for (size_t i = 0; i < length; i++) {
        if (value[i] < 32 || value[i] > 126) return false;
        if (value[i] != ' ') nonblank = true;
    }
    if (!nonblank) return false;
    memset(slot, 0, SPARD_IDENTITY_SLOT_BYTES);
    memcpy(slot, value, length);
    return true;
}

static inline spard_identity_result_t spard_identity_encode(
    spard_identity_plan_t *out, const uint8_t *baseline, size_t baseline_length,
    bool normal_service_context, const uint8_t *serial, size_t serial_length,
    const uint8_t *model, size_t model_length) {
    if (!out) return SPARD_IDENTITY_BAD_ARGUMENT;
    spard_identity_result_t result = SPARD_IDENTITY_BAD_BASELINE;
    uint8_t before[SPARD_IDENTITY_BYTES], after[64];
    if (!normal_service_context) { result = SPARD_IDENTITY_CONTEXT_REQUIRED; goto failed; }
    if (!baseline || baseline_length != sizeof(before)) goto failed;
    memcpy(before, baseline, sizeof(before));
    if (before[0] != 0x68 || before[1] != 72 || before[2] != (72 ^ 255) ||
        before[3] != 0x30 || before[4] || before[5] || before[71] != 0x16 ||
        before[70] != spard_identity_xor(before)) goto failed;
    memcpy(after, before + 6, sizeof(after));
    if (!spard_identity_replace(after, serial, serial_length) ||
        !spard_identity_replace(after + 32, model, model_length)) {
        result = SPARD_IDENTITY_BAD_SLOT; goto failed;
    }
    uint8_t changes = (memcmp(before + 6, after, 32) ? 1 : 0) |
                      (memcmp(before + 38, after + 32, 32) ? 2 : 0);
    if (!changes) { result = SPARD_IDENTITY_UNCHANGED; goto failed; }
    /* Snapshot all inputs first, so buffers inside an old output may be reused.
     * Failed plans are cleared and can never leave a previous valid request. */
    memset(out, 0, sizeof(*out));
    memcpy(out->restoration_request, before, sizeof(before));
    out->restoration_request[3] = 0x31;
    out->restoration_request[70] = spard_identity_xor(out->restoration_request);
    memcpy(out->request, out->restoration_request, sizeof(out->request));
    memcpy(out->request + 6, after, sizeof(after));
    out->request[70] = spard_identity_xor(out->request);
    out->changed_slots = changes;
    out->valid = true;
    return SPARD_IDENTITY_OK;
failed:
    memset(out, 0, sizeof(*out));
    return result;
}
