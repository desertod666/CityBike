/* Pinned IDF5.5 event decoder with one observer after its existing ECC read.
 * Direction/segment must be copied there: the public HAL only retains flags.
 * No second ECC read, mode/timing change, register write or transmit command.
 */
#include "error_probe.h"
#include "esp_attr.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "hal/twai_hal.h"
#include "hal/twai_ll.h"

#if !CONFIG_IDF_TARGET_ESP32C3
#error "The pinned ECC observer is verified for ESP32-C3 only"
#endif

static portMUX_TYPE error_mux = portMUX_INITIALIZER_UNLOCKED;
static error_probe_t counters;
static error_ecc_event_t ecc_ring[READER_ECC_HISTORY];
static unsigned ecc_next, ecc_count;

static void IRAM_ATTR reader_ecc_record(uint8_t type, uint8_t direction, uint8_t segment) {
    uint64_t now = (uint64_t)esp_timer_get_time();
    uint32_t mask = type == TWAI_LL_ERR_BIT ? 1 : type == TWAI_LL_ERR_FORM ? 2 :
                    type == TWAI_LL_ERR_STUFF ? 4 : segment == TWAI_LL_ERR_SEG_ACK_SLOT ? 8 : 0;
    portENTER_CRITICAL_ISR(&error_mux);
    error_probe_add(&counters, mask);
    ecc_ring[ecc_next].t_us = now;
    ecc_ring[ecc_next].event = counters.total;
    ecc_ring[ecc_next].capture = (uint8_t)((type << 6) | (direction << 5) | segment);
    ecc_next = (ecc_next + 1) % READER_ECC_HISTORY;
    if (ecc_count < READER_ECC_HISTORY) ecc_count++;
    portEXIT_CRITICAL_ISR(&error_mux);
}

#include "twai_event_observer.inc"

uint32_t IRAM_ATTR __wrap_twai_hal_get_events(twai_hal_context_t *hal) {
    return reader_observed_hal_get_events(hal);
}

error_probe_t reader_error_probe(void) {
    portENTER_CRITICAL(&error_mux);
    error_probe_t result = counters;
    portEXIT_CRITICAL(&error_mux);
    return result;
}

error_ecc_history_t reader_error_ecc_history(void) {
    error_ecc_history_t result = {0};
    portENTER_CRITICAL(&error_mux);
    result.count = ecc_count;
    result.total = counters.total;
    result.saturated = counters.saturated;
    unsigned first = (ecc_next + READER_ECC_HISTORY - ecc_count) % READER_ECC_HISTORY;
    for (unsigned i = 0; i < ecc_count; i++) result.events[i] = ecc_ring[(first + i) % READER_ECC_HISTORY];
    portEXIT_CRITICAL(&error_mux);
    return result;
}
