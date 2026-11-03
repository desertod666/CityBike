#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <string.h>

#define READER_COMMAND_ID_SIZE 33

// Legacy "COMMAND" remains valid. Optional "@id COMMAND" adds a bounded ASCII ID.
static inline bool reader_command_parse(const char *input, char *id, size_t id_size,
                                        char *command, size_t command_size) {
    if (!input || !id || !command || !id_size || !command_size) return false;
    id[0] = 0; command[0] = 0;
    const char *body = input;
    if (*body == '@') {
        const char *end = strchr(body, ' ');
        if (!end || end == body+1 || (size_t)(end-body-1) >= id_size ||
            (size_t)(end-body-1) >= READER_COMMAND_ID_SIZE) return false;
        for (const char *c=body+1; c<end; c++)
            if (!((*c>='a' && *c<='z') || (*c>='A' && *c<='Z') ||
                  (*c>='0' && *c<='9') || *c=='_' || *c=='-')) return false;
        memcpy(id, body+1, (size_t)(end-body-1)); id[end-body-1] = 0;
        body = end+1;
    }
    size_t length = strlen(body);
    if (!length || length >= command_size) { id[0]=0; return false; }
    memcpy(command, body, length+1);
    return true;
}

static inline bool reader_json_escape(const char *input, char *output, size_t capacity) {
    if (!capacity) return false;
    size_t used=0;
    for (const char *p=input; *p; p++) {
        bool escape = *p=='"' || *p=='\\';
        if ((unsigned char)*p<32 || used+(escape?2U:1U)>=capacity) { output[0]=0; return false; }
        if (escape) output[used++]='\\';
        output[used++]=*p;
    }
    output[used]=0; return true;
}
