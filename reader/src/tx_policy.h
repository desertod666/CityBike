#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

// Only an explicit one-shot diagnostic request is planned. No write/replay,
// session control, walk-assist or firmware-update payloads in this policy.
#define TX_QUALIFY_US UINT64_C(30000000)
#define TX_QUIET_QUALIFY_US UINT64_C(5000000)
#define TX_QUALIFY_FRAMES UINT64_C(100)
/* Admission metric: error events per valid frame, not packet-loss percent.
 * Single errors are tolerated only before the fixed read request. */
#define TX_QUALIFY_MAX_ERRORS UINT64_C(10)
#define TX_QUALIFY_FRAMES_PER_ERROR UINT64_C(100)
#define TX_QUALITY_FRESH_US UINT64_C(20000000)
#define TX_ARM_US UINT64_C(5000000)
#define TX_ACTIVE_LIMIT_US UINT64_C(50000)
#define TX_PROBE_ID UINT32_C(0x05113201)
#define TX_PROBE_REPLY_ID UINT32_C(0x022A3201)

typedef struct {
    uint64_t now_us, received, bus_errors;
    uint64_t drops[6]; // CAN queue, USB, RX missed, RX overrun, reply, stop discard
    uint32_t epoch, bitrate, sampling;
    bool ctx_valid;
} tx_snapshot_t;

typedef struct {
    tx_snapshot_t baseline, quality, armed_snapshot;
    uint64_t quality_ended_us, armed_until_us;
    uint32_t challenge, sampling;
    bool observing, qualified, quiet_qualified, armed;
    const char *reason;
} tx_policy_t;

static inline void tx_policy_init(tx_policy_t *p, uint32_t challenge) {
    memset(p,0,sizeof(*p));p->challenge=challenge;p->reason="no_clean_capture";
}

static inline void tx_policy_revoke(tx_policy_t *p, bool invalidate_quality) {
    p->armed=false;p->armed_until_us=0;
    if(invalidate_quality){p->observing=false;p->qualified=false;p->quiet_qualified=false;p->reason="quality_invalidated";}
}

static inline void tx_policy_begin(tx_policy_t *p, tx_snapshot_t s) {
    tx_policy_revoke(p,true);p->baseline=s;p->observing=true;p->reason="collecting_quality";
}

static inline bool tx_policy_finish(tx_policy_t *p, tx_snapshot_t s) {
    tx_policy_revoke(p,false);p->qualified=false;p->quiet_qualified=false;
    if(!p->observing){p->reason="no_clean_capture";return false;}
    p->observing=false;
    const tx_snapshot_t *b=&p->baseline;
    if(s.now_us<b->now_us || s.epoch!=b->epoch || s.bitrate!=250000 || b->bitrate!=250000 || s.sampling!=b->sampling){p->reason="capture_changed";return false;}
    if(!s.ctx_valid || !b->ctx_valid){p->reason="ctx_guard_invalid";return false;}
    if(s.received<b->received || s.bus_errors<b->bus_errors){p->reason="counter_reset";return false;}
    uint64_t events=s.bus_errors-b->bus_errors,frames=s.received-b->received;
    if(events>TX_QUALIFY_MAX_ERRORS || events>frames/TX_QUALIFY_FRAMES_PER_ERROR){p->reason="can_receive_error_budget";return false;}
    for(unsigned i=0;i<6;i++)if(s.drops[i]!=b->drops[i]){p->reason="delivery_counter_changed";return false;}
    // Quiet admission never grants normal traffic admission: no minimum frame
    // count, but five seconds with ZERO errors and unchanged loss/scope guards.
    p->quiet_qualified=events==0 && s.now_us-b->now_us>=TX_QUIET_QUALIFY_US;
    if(p->quiet_qualified){p->quality=s;p->sampling=s.sampling;p->quality_ended_us=s.now_us;}
    if(s.now_us-b->now_us<TX_QUALIFY_US || s.received-b->received<TX_QUALIFY_FRAMES){p->reason="insufficient_clean_traffic";return false;}
    p->quality=s;p->sampling=s.sampling;p->quality_ended_us=s.now_us;p->qualified=true;p->reason="clean_capture_ready";return true;
}

static inline bool tx_policy_ready_mode(const tx_policy_t *p, uint64_t now_us, bool quiet) {
    return (quiet?p->quiet_qualified:p->qualified) && now_us>=p->quality_ended_us && now_us-p->quality_ended_us<=TX_QUALITY_FRESH_US;
}

static inline bool tx_policy_ready(const tx_policy_t *p, uint64_t now_us) {
    return tx_policy_ready_mode(p,now_us,false);
}

// The caller must supply the actual current counters/scope, not just a past qualification.
static inline bool tx_policy_snapshot_matches(const tx_snapshot_t *now, const tx_snapshot_t *prior) {
    if (!now->ctx_valid || now->now_us < prior->now_us || now->epoch != prior->epoch ||
        now->bitrate != 250000 || now->bitrate != prior->bitrate || now->sampling != prior->sampling ||
        now->received < prior->received || now->bus_errors != prior->bus_errors) return false;
    for (unsigned i=0;i<6;i++) if (now->drops[i] != prior->drops[i]) return false;
    return true;
}

static inline bool tx_policy_arm_mode(tx_policy_t *p, uint32_t challenge, tx_snapshot_t actual,
                                 bool stopped, bool identity_verified, bool quiet) {
    tx_policy_revoke(p,false);
    if (!stopped || !identity_verified || challenge!=p->challenge ||
        !tx_policy_ready_mode(p,actual.now_us,quiet) || !tx_policy_snapshot_matches(&actual,&p->quality)) {
        tx_policy_revoke(p,true);return false;
    }
    p->armed_snapshot=actual;p->armed=true;p->armed_until_us=actual.now_us+TX_ARM_US;return true;
}

static inline bool tx_policy_consume_mode(tx_policy_t *p, tx_snapshot_t actual, uint32_t next_challenge,
                                     bool stopped, bool identity_verified, bool quiet) {
    bool allow=p->armed && stopped && identity_verified && actual.now_us<=p->armed_until_us &&
        tx_policy_ready_mode(p,actual.now_us,quiet) && tx_policy_snapshot_matches(&actual,&p->armed_snapshot) &&
        tx_policy_snapshot_matches(&actual,&p->quality);
    tx_policy_revoke(p,true);p->challenge=next_challenge;
    return allow;
}

static inline bool tx_policy_arm(tx_policy_t *p,uint32_t challenge,tx_snapshot_t actual,bool stopped,bool identity_verified){
    return tx_policy_arm_mode(p,challenge,actual,stopped,identity_verified,false);
}
static inline bool tx_policy_consume(tx_policy_t *p,tx_snapshot_t actual,uint32_t next_challenge,bool stopped,bool identity_verified){
    return tx_policy_consume_mode(p,actual,next_challenge,stopped,identity_verified,false);
}
