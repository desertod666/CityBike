#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <limits.h>
_Static_assert(sizeof(unsigned)>=sizeof(uint32_t),"JSON counter width");
#include <stdio.h>
#include <string.h>

/* Passive software observations, not a calibrated logic analyzer.
 * levels: bit1 = physical GPIO4/TX input, bit0 = GPIO5/RX input.
 * Interruption gaps and the bounded edge buffer are reported explicitly. */
#define TX_TRACE_EDGES 64
typedef struct {
    uint32_t t[TX_TRACE_EDGES];
    uint8_t levels[TX_TRACE_EDGES];
    uint32_t samples, edges, elapsed_us, max_gap_us, tx_low, mismatch;
    uint32_t mismatch_since, max_mismatch_us, last_us;
    uint8_t last_levels;
    bool started, mismatching, overflow, time_regressed;
} tx_trace_t;
static inline void tx_trace_observe(tx_trace_t *s,uint32_t us,bool tx,bool rx) {
    if(s->started && us<s->last_us){s->time_regressed=true;return;}
    uint8_t levels=(tx?2:0)|(rx?1:0);
    uint32_t gap=s->started?us-s->last_us:0;
    if(gap>s->max_gap_us)s->max_gap_us=gap;
    s->samples++;if(!tx)s->tx_low++;
    if(!tx && rx){s->mismatch++;if(!s->mismatching)s->mismatch_since=us;s->mismatching=true;}
    if(s->mismatching){uint32_t span=us-s->mismatch_since;if(span>s->max_mismatch_us)s->max_mismatch_us=span;}
    if(tx || !rx)s->mismatching=false;
    if(!s->started || levels!=s->last_levels){
        if(s->edges<TX_TRACE_EDGES){s->t[s->edges]=us;s->levels[s->edges++]=levels;}else s->overflow=true;
    }
    s->last_us=s->elapsed_us=us;s->last_levels=levels;s->started=true;
}
static inline size_t tx_trace_json(const tx_trace_t *s,char *out,size_t size){
    int n=snprintf(out,size,"{\"window_us\":%u,\"samples\":%u,\"max_gap_us\":%u,\"tx_low_samples\":%u,\"tx_low_rx_high_samples\":%u,\"max_observed_mismatch_us\":%u,\"edges_truncated\":%s,\"time_regressed\":%s,\"edges\":[",
        (unsigned)s->elapsed_us,(unsigned)s->samples,(unsigned)s->max_gap_us,(unsigned)s->tx_low,(unsigned)s->mismatch,(unsigned)s->max_mismatch_us,
        s->overflow?"true":"false",s->time_regressed?"true":"false");
    if(n<0 || (size_t)n>=size)return 0;
    size_t used=(size_t)n;
    for(uint32_t i=0;i<s->edges;i++){
        n=snprintf(out+used,size-used,"%s[%u,%u]",i?",":"",(unsigned)s->t[i],(unsigned)s->levels[i]);
        if(n<0 || (size_t)n>=size-used)return 0;
        used+=(size_t)n;
    }
    n=snprintf(out+used,size-used,"]}");if(n<0 || (size_t)n>=size-used)return 0;
    return used+(size_t)n;
}
