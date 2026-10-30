/* Host-only boundary for CAN/USB tests. BLE policy has its own native test. */
#include <stdio.h>
#include "../src/ble_remote.h"
esp_err_t ble_remote_init(void){return ESP_OK;}
bool ble_remote_enabled(void){return false;}
bool ble_remote_command(const char *cmd,char *error,size_t capacity){(void)cmd;if(capacity)snprintf(error,capacity,"BLE not emulated by CAN host tests");return false;}
size_t ble_remote_json(char *buffer,size_t capacity){int n=snprintf(buffer,capacity,"{\"ready\":false,\"enabled\":false,\"button\":0}");return n<0?capacity:(size_t)n;}
