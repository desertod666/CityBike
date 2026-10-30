#pragma once
#include <stdbool.h>
#include <stddef.h>
#include "esp_err.h"
esp_err_t ble_remote_init(void);
bool ble_remote_command(const char *cmd,char *error,size_t capacity);
size_t ble_remote_json(char *buffer,size_t capacity);
bool ble_remote_enabled(void);
