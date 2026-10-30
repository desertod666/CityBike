#pragma once
#include <stdint.h>
typedef int gpio_num_t; typedef int esp_err_t; typedef int gpio_mode_t;
#define GPIO_NUM_4 4
#define GPIO_NUM_10 10
#define GPIO_MODE_INPUT_OUTPUT 3
#define ESP_OK 0
esp_err_t gpio_reset_pin(gpio_num_t);esp_err_t gpio_set_level(gpio_num_t,int);esp_err_t gpio_set_direction(gpio_num_t,gpio_mode_t);int gpio_get_level(gpio_num_t);
