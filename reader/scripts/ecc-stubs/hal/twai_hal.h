#pragma once
#include <stdint.h>
#include <stdbool.h>
#define CONFIG_IDF_TARGET_ESP32C3 1
#define TWAI_ERR_PASS_THRESH 128
#define TWAI_HAL_SET_BITS(var, flag)            ((var) |= (flag))
#define TWAI_HAL_CLEAR_BITS(var, flag)          ((var) &= ~(flag))
#define TWAI_HAL_STATE_FLAG_RUNNING             (1 << 0)    //Controller is active (not in reset mode)
#define TWAI_HAL_STATE_FLAG_RECOVERING          (1 << 1)    //Bus is undergoing bus recovery
#define TWAI_HAL_STATE_FLAG_ERR_WARN            (1 << 2)    //TEC or REC is >= error warning limit
#define TWAI_HAL_STATE_FLAG_ERR_PASSIVE         (1 << 3)    //TEC or REC is >= 128
#define TWAI_HAL_STATE_FLAG_BUS_OFF             (1 << 4)    //Bus-off due to TEC >= 256
#define TWAI_HAL_STATE_FLAG_TX_BUFF_OCCUPIED    (1 << 5)    //Transmit buffer is occupied
#define TWAI_HAL_STATE_FLAG_TX_NEED_RETRY       (1 << 7)    //TX needs to be restarted due to errata workarounds
#define TWAI_HAL_EVENT_BUS_OFF                  (1 << 0)
#define TWAI_HAL_EVENT_BUS_RECOV_CPLT           (1 << 1)
#define TWAI_HAL_EVENT_BUS_RECOV_PROGRESS       (1 << 2)
#define TWAI_HAL_EVENT_ERROR_WARNING            (1 << 3)
#define TWAI_HAL_EVENT_BELOW_EWL                (1 << 4)
#define TWAI_HAL_EVENT_ERROR_PASSIVE            (1 << 5)
#define TWAI_HAL_EVENT_ERROR_ACTIVE             (1 << 6)
#define TWAI_HAL_EVENT_BUS_ERR                  (1 << 7)
#define TWAI_HAL_EVENT_ARB_LOST                 (1 << 8)
#define TWAI_HAL_EVENT_RX_BUFF_FRAME            (1 << 9)
#define TWAI_HAL_EVENT_TX_BUFF_FREE             (1 << 10)
#define TWAI_HAL_EVENT_NEED_PERIPH_RESET        (1 << 11)
#define TWAI_HAL_EVENT_TX_SUCCESS               (1 << 12)
typedef struct {uint32_t interrupts,status,tec,rec,ecc,intr_reads,ecc_reads,alc_reads;} twai_test_hw_t;
typedef struct {unsigned bit_err:1,form_err:1,stuff_err:1,ack_err:1;} twai_error_flags_t;
typedef struct {twai_test_hw_t *dev;uint32_t state_flags;twai_error_flags_t errors;} twai_hal_context_t;
