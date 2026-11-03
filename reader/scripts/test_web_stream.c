#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <inttypes.h>
#include "../src/web_stream_payload.h"

static char assembled[64 * 340 + 256];
static size_t used, calls, maximum_fragment;
static int fail_call = -1;
static bool finished, bad_formatter;

size_t reader_frame_json(const frame_t *frame, char *buffer, size_t capacity) {
    if (bad_formatter) return capacity;
    int n = snprintf(buffer, capacity, "{\"seq\":%" PRIu64 ",\"t_us\":%" PRId64 ",\"id\":\"1FFFFFFF\",\"data\":\"FFFFFFFFFFFFFFFF\"}",
                     frame->seq, frame->us);
    assert(n > 0);
    return (size_t)n;
}

static int send_fragment(void *context, const char *data, size_t length, bool first, bool final) {
    assert(context == (void *)assembled);
    assert(first == (calls == 0));
    assert(!finished);
    if ((int)calls++ == fail_call) return 77;
    assert(length <= 340);
    if (length > maximum_fragment) maximum_fragment = length;
    assert(used + length < sizeof(assembled));
    memcpy(assembled + used, data, length); used += length; assembled[used] = 0;
    finished = final;
    return 0;
}

static void reset(void) {
    used = calls = maximum_fragment = 0; finished = bad_formatter = false;
    fail_call = -1; assembled[0] = 0;
}

int main(void) {
    frame_t frames[64] = {0};
    const char *header = "{\"boot\":\"12345678\",\"latest\":64,\"oldest\":1,\"missed\":0,\"frames\":[";
    for (size_t i = 0; i < 64; i++) { frames[i].seq = i + 1; frames[i].us = INT64_MAX; }
    reset();
    assert(!reader_web_stream_frames(send_fragment, assembled, header, strlen(header), frames, 0));
    assert(finished && calls == 2 && strstr(assembled, "\"frames\":[]}"));
    reset();
    assert(!reader_web_stream_frames(send_fragment, assembled, header, strlen(header), frames, 64));
    assert(finished && calls == 66 && maximum_fragment <= 340);
    puts(assembled);
    for (int failure = 0; failure < 66; failure++) {
        reset(); fail_call = failure;
        assert(reader_web_stream_frames(send_fragment, assembled, header, strlen(header), frames, 64) == 77);
        assert(calls == (size_t)failure + 1 && !finished);
    }
    reset(); bad_formatter = true;
    assert(reader_web_stream_frames(send_fragment, assembled, header, strlen(header), frames, 1) == -1);
    assert(calls == 1 && !finished);
    puts("PASS web stream: 64 frames in one bounded fragmented message; all send failures terminate");
}
