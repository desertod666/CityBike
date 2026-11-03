#pragma once
#include "reader.h"

/* One browser message, sent as bounded RFC6455 fragments. No large output copy. */
typedef int (*reader_web_fragment_fn)(void *context, const char *data, size_t length,
                                      bool first, bool final);
static int reader_web_stream_frames(reader_web_fragment_fn send, void *context,
                                    const char *header, size_t header_length,
                                    const frame_t *frames, size_t count) {
    int result = send(context, header, header_length, true, false);
    for (size_t i = 0; i < count && !result; i++) {
        char line[340];
        size_t prefix = i ? 1 : 0;
        if (prefix) line[0] = ',';
        size_t length = reader_frame_json(&frames[i], line + prefix, sizeof(line) - prefix);
        if (!length || length >= sizeof(line) - prefix) return -1;
        result = send(context, line, length + prefix, false, false);
    }
    if (!result) result = send(context, "]}", 2, false, true);
    return result;
}
