#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#define REMOTE_LEASE_US 1200000LL
#define REMOTE_MAX_HOLD_US 30000000LL
typedef int (*remote_send_fn)(uint8_t,uint8_t,void*);
typedef struct {
 bool enabled,connected,subscribed;
 char session[17],hold[9],last_hold[9];
 uint32_t sequence,notifications,releases;
 uint8_t button;
 int64_t deadline,max_deadline;
 int last_error;
} remote_policy_t;
static inline int remote_release(remote_policy_t *s,remote_send_fn send,void *ctx) {
 int rc=0;
 if(s->button){uint8_t b=s->button;s->button=0;s->releases++;if(s->connected&&s->subscribed){rc=send(b,0,ctx);if(!rc)s->notifications++;}else rc=-4;}
 s->deadline=0;s->max_deadline=0;s->last_error=rc;return rc;
}
static inline void remote_expire(remote_policy_t *s,int64_t now,remote_send_fn send,void *ctx) {
 if(s->button&&(now>=s->deadline||now>=s->max_deadline))remote_release(s,send,ctx);
}
static inline int remote_key(remote_policy_t *s,const char *session,const char *hold,uint32_t seq,unsigned button,int kind,int64_t now,remote_send_fn send,void *ctx) {
 remote_expire(s,now,send,ctx);
 if(!s->enabled||strcmp(s->session,session)||seq<=s->sequence)return -1;
 s->sequence=seq;
 if(kind==0){if(!strcmp(s->hold,hold))return remote_release(s,send,ctx);return 0;}
 if(kind==2){if(!s->button||strcmp(s->hold,hold))return -2;s->deadline=now+REMOTE_LEASE_US;return 0;}
 if(kind!=1||button<1||button>3||s->button||!s->connected||!s->subscribed||!strcmp(s->last_hold,hold))return -3;
 strcpy(s->last_hold,hold);int rc=send((uint8_t)button,1,ctx);s->last_error=rc;if(rc)return rc;
 strcpy(s->hold,hold);s->button=(uint8_t)button;s->deadline=now+REMOTE_LEASE_US;s->max_deadline=now+REMOTE_MAX_HOLD_US;s->notifications++;return 0;
}
