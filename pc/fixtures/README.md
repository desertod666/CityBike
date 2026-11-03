These reader selftest fixtures were produced by executing historical firmware
0.5.5 and 0.5.6 against host peripheral stubs. They contain synthetic fixed
boot IDs, counters and echoes, with no device recordings or owner data.
They retain compatibility coverage for old USB reader result schemas.
Current firmware behavior is exercised directly by reader/scripts/test_selftest.c.
