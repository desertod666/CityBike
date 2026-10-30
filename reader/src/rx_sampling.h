#pragma once
#include <stdbool.h>
#include <string.h>
#include "driver/twai.h"

typedef enum { RX_SAMPLE_DEFAULT, RX_SAMPLE_LATE, RX_SAMPLE_TRIPLE,
               RX_SAMPLE_LATE_TRIPLE, RX_SAMPLE_SP625, RX_SAMPLE_SP625_TRIPLE,
               RX_SAMPLE_SP6875, RX_SAMPLE_SP6875_TRIPLE,
               RX_SAMPLE_MID, RX_SAMPLE_MID_TRIPLE, RX_SAMPLE_COUNT } rx_sampling_t;

#define READER_SAMPLING_PROFILES_JSON "[\"TRIPLE\"]"

static inline const char *reader_sampling_name(unsigned profile) {
    switch (profile) {
    case RX_SAMPLE_DEFAULT: return "DEFAULT";
    case RX_SAMPLE_LATE: return "LATE";
    case RX_SAMPLE_TRIPLE: return "TRIPLE";
    case RX_SAMPLE_LATE_TRIPLE: return "LATE_TRIPLE";
    case RX_SAMPLE_SP625: return "SP625";
    case RX_SAMPLE_SP625_TRIPLE: return "SP625_TRIPLE";
    case RX_SAMPLE_SP6875: return "SP6875";
    case RX_SAMPLE_SP6875_TRIPLE: return "SP6875_TRIPLE";
    case RX_SAMPLE_MID: return "MID";
    case RX_SAMPLE_MID_TRIPLE: return "MID_TRIPLE";
    default: return "INVALID";
    }
}

static inline bool reader_sampling_parse(const char *name, rx_sampling_t *profile) {
    if (strcmp(name,"TRIPLE")) return false;
    *profile=RX_SAMPLE_TRIPLE;
    return true;
}

// Applied to the existing pinned-IDF250k config only. The16TQ bit and4MHz TQ
// clock are preserved: 4MHz/(1+11+4) == 4MHz/(1+13+2) ==250000.
static inline bool reader_sampling_apply(unsigned profile, unsigned bitrate,
                                         twai_timing_config_t *timing) {
    if (profile!=RX_SAMPLE_TRIPLE || bitrate!=250000) return false;
    if (timing->quanta_resolution_hz!=4000000 || timing->tseg_1!=11 || timing->tseg_2!=4) return false;
    timing->triple_sampling=true;
    return true;
}
