#pragma once
#include "twai_hal.h"
#define TWAI_LL_STATUS_RBS      (0x1 << 0)      //Receive Buffer Status
#define TWAI_LL_STATUS_DOS      (0x1 << 1)      //Data Overrun Status
#define TWAI_LL_STATUS_TBS      (0x1 << 2)      //Transmit Buffer Status
#define TWAI_LL_STATUS_TCS      (0x1 << 3)      //Transmission Complete Status
#define TWAI_LL_STATUS_RS       (0x1 << 4)      //Receive Status
#define TWAI_LL_STATUS_TS       (0x1 << 5)      //Transmit Status
#define TWAI_LL_STATUS_ES       (0x1 << 6)      //Error Status
#define TWAI_LL_STATUS_BS       (0x1 << 7)      //Bus Status
#define TWAI_LL_STATUS_MS       (0x1 << 8)      //Miss Status
#define TWAI_LL_INTR_RI         (0x1 << 0)      //Receive Interrupt
#define TWAI_LL_INTR_TI         (0x1 << 1)      //Transmit Interrupt
#define TWAI_LL_INTR_EI         (0x1 << 2)      //Error Interrupt
#define TWAI_LL_INTR_EPI        (0x1 << 5)      //Error Passive Interrupt
#define TWAI_LL_INTR_ALI        (0x1 << 6)      //Arbitration Lost Interrupt
#define TWAI_LL_INTR_BEI        (0x1 << 7)      //Bus Error Interrupt
typedef enum {
    TWAI_LL_ERR_BIT = 0,
    TWAI_LL_ERR_FORM,
    TWAI_LL_ERR_STUFF,
    TWAI_LL_ERR_OTHER,
    TWAI_LL_ERR_MAX,
} twai_ll_err_type_t;
typedef enum {
    TWAI_LL_ERR_DIR_TX = 0,
    TWAI_LL_ERR_DIR_RX,
    TWAI_LL_ERR_DIR_MAX,
} twai_ll_err_dir_t;
typedef enum {
    TWAI_LL_ERR_SEG_SOF = 3,
    TWAI_LL_ERR_SEG_ID_28_21 = 2,
    TWAI_LL_ERR_SEG_SRTR = 4,
    TWAI_LL_ERR_SEG_IDE = 5,
    TWAI_LL_ERR_SEG_ID_20_18 = 6,
    TWAI_LL_ERR_SEG_ID_17_13 = 7,
    TWAI_LL_ERR_SEG_CRC_SEQ = 8,
    TWAI_LL_ERR_SEG_R0 = 9,
    TWAI_LL_ERR_SEG_DATA = 10,
    TWAI_LL_ERR_SEG_DLC = 11,
    TWAI_LL_ERR_SEG_RTR = 12,
    TWAI_LL_ERR_SEG_R1 = 13,
    TWAI_LL_ERR_SEG_ID_4_0 = 14,
    TWAI_LL_ERR_SEG_ID_12_5 = 15,
    TWAI_LL_ERR_SEG_ACT_FLAG = 17,
    TWAI_LL_ERR_SEG_INTER = 18,
    TWAI_LL_ERR_SEG_SUPERPOS = 19,
    TWAI_LL_ERR_SEG_PASS_FLAG = 22,
    TWAI_LL_ERR_SEG_ERR_DELIM = 23,
    TWAI_LL_ERR_SEG_CRC_DELIM = 24,
    TWAI_LL_ERR_SEG_ACK_SLOT = 25,
    TWAI_LL_ERR_SEG_EOF = 26,
    TWAI_LL_ERR_SEG_ACK_DELIM = 27,
    TWAI_LL_ERR_SEG_OVRLD_FLAG = 28,
    TWAI_LL_ERR_SEG_MAX = 29,
} twai_ll_err_seg_t;
static inline uint32_t twai_ll_get_and_clear_intrs(twai_test_hw_t *hw){hw->intr_reads++;uint32_t r=hw->interrupts;hw->interrupts=0;return r;}
static inline uint32_t twai_ll_get_status(twai_test_hw_t *hw){return hw->status;}
static inline uint32_t twai_ll_get_tec(twai_test_hw_t *hw){return hw->tec;}
static inline uint32_t twai_ll_get_rec(twai_test_hw_t *hw){return hw->rec;}
static inline void twai_ll_clear_arb_lost_cap(twai_test_hw_t *hw){hw->alc_reads++;}
static inline void twai_ll_parse_err_code_cap(twai_test_hw_t *hw,twai_ll_err_type_t *t,twai_ll_err_dir_t *d,twai_ll_err_seg_t *s){hw->ecc_reads++;*t=(hw->ecc>>6)&3;*d=(hw->ecc>>5)&1;*s=hw->ecc&31;}
