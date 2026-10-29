#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>
/* Exact observed Information00 request only. No device I/O, mode switch,
 * generic packet builder, opcodes, adapter configuration or write parameters. */
typedef struct {
    uint32_t id;
    uint8_t dlc;
    bool extended, rtr, single_shot;
    uint8_t data[8];
} spard_read_frame_t;
static inline size_t spard_information_read_frames(spard_read_frame_t out[2]) {
    if (!out) return 0;
    const spard_read_frame_t fixed[2] = {
        {.id=0x666,.dlc=8,.extended=false,.rtr=false,.single_shot=true,
         .data={0x68,0x0C,0xF3,0x00,0x00,0x00,0x00,0x00}},
        {.id=0x666,.dlc=4,.extended=false,.rtr=false,.single_shot=true,
         .data={0x00,0x00,0x97,0x16,0x00,0x00,0x00,0x00}}
    };
    memcpy(out,fixed,sizeof(fixed));
    return 2;
}
static inline bool spard_information_read_frame_matches(unsigned index, const spard_read_frame_t *f) {
    spard_read_frame_t fixed[2];
    if (!f || index>=spard_information_read_frames(fixed)) return false;
    const spard_read_frame_t *e=&fixed[index];
    return f->id==e->id && f->dlc==e->dlc && f->extended==e->extended &&
           f->rtr==e->rtr && f->single_shot==e->single_shot &&
           memcmp(f->data,e->data,sizeof(e->data))==0;
}
