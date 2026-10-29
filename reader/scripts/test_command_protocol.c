#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../src/command_protocol.h"
int main(void) {
    char id[READER_COMMAND_ID_SIZE], command[80], escaped[160];
    assert(reader_command_parse("STOP",id,sizeof(id),command,sizeof(command)) && !id[0] && !strcmp(command,"STOP"));
    assert(reader_command_parse("@cmd_1-A START 250000",id,sizeof(id),command,sizeof(command)) && !strcmp(id,"cmd_1-A") && !strcmp(command,"START 250000"));
    assert(reader_command_parse("@12345678901234567890123456789012 STATUS",id,sizeof(id),command,sizeof(command)));
    const char *invalid[]={"", "@ STOP", "@bad.id STOP", "@id", "@id ", "@123456789012345678901234567890123 STOP", "@\" STOP", "@a\\ STOP"};
    for(unsigned i=0;i<sizeof(invalid)/sizeof(*invalid);i++) assert(!reader_command_parse(invalid[i],id,sizeof(id),command,sizeof(command)));
    char long_command[120]; memset(long_command,'A',sizeof(long_command)-1); long_command[sizeof(long_command)-1]=0;
    assert(!reader_command_parse(long_command,id,sizeof(id),command,sizeof(command)));
    assert(reader_json_escape("WIFI 6 a\"b\\c",escaped,sizeof(escaped)) && !strcmp(escaped,"WIFI 6 a\\\"b\\\\c"));
    assert(!reader_json_escape("\n",escaped,sizeof(escaped)));
    assert(!reader_json_escape("123",escaped,3));
    puts("PASS command protocol: legacy input, bounded IDs, invalid envelopes and JSON escaping");
}
