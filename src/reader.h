#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "driver/twai.h"

typedef struct {
    uint64_t seq;
    int64_t us;
    uint32_t epoch;
    twai_message_t msg;
} frame_t;

void reader_status_json(char *buffer, size_t capacity);
bool reader_command(const char *command, char *error, size_t capacity);
size_t reader_frames(uint64_t after, frame_t *out, size_t capacity, uint64_t *latest, uint64_t *oldest);
size_t reader_frame_json(const frame_t *frame, char *buffer, size_t capacity);
const char *reader_boot(void);
