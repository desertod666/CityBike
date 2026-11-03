#pragma once
#include "esp_err.h"
#include <stddef.h>

typedef struct {
    char ssid[33];
    char saved_ssid[33];
    char mac[18];
    int channel, saved_channel, led_level, clients;
    int ready;
} reader_network_t;

esp_err_t web_config_init(void);
esp_err_t web_start(void);
void web_network_snapshot(reader_network_t *out);
esp_err_t web_save_ap(const char *ssid, int channel);
esp_err_t web_save_led(int level);
