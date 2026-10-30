#pragma once
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <stdio.h>
typedef int esp_err_t; typedef int esp_reset_reason_t; typedef int gpio_num_t; typedef int gpio_mode_t;
#define ESP_OK 0
#define ESP_FAIL -1
#define ESP_ERR_INVALID_STATE -2
#define ESP_ERR_INVALID_ARG -3
#define CONFIG_IDF_TARGET_ESP32C3 1
#define ESP_ERROR_CHECK(x) assert((x)==ESP_OK)
#define GPIO_NUM_4 4
#define GPIO_NUM_5 5
#define GPIO_NUM_8 8
#define GPIO_NUM_10 10
#define GPIO_MODE_INPUT_OUTPUT 3
#define GPIO_MODE_INPUT 1
#define GPIO_MODE_OUTPUT 2
#define GPIO_PULLUP_DISABLE 0
#define GPIO_PULLDOWN_DISABLE 0
#define GPIO_INTR_DISABLE 0
#define GPIO_INTR_ANYEDGE 3
typedef struct {uint64_t pin_bit_mask;int mode,pull_up_en,pull_down_en,intr_type;} gpio_config_t;
extern uint32_t fake_reg[7];extern int fake_pad,fake_gpio_fail;extern int fake_status_fail,fake_stop_fail,fake_uninstall_fail,fake_install_fail,fake_start_fail;
extern int fake_driver_installed,fake_driver_state,fake_status_calls,fake_status_fail_on;extern uint64_t fake_clock, fake_usb_fail_until;extern bool fake_usb_always_fail;extern char fake_wire[200000];extern size_t fake_wire_size;
#define BIT(n) (1U<<(n))
#define REG_READ(r) fake_reg[r]
#define REG_GET_FIELD(r,f) ((fake_reg[r]&f##_M)>>f##_S)
#define GPIO_IN_REG 5
#define GPIO_PIN4_REG 6
#define GPIO_PIN4_PAD_DRIVER BIT(2)
#define GPIO_FUNC4_OEN_INV_SEL BIT(10)
#define TWAI_TX_IDX 74
#define FUN_DRV_S 10
#define FUN_DRV_M (3U<<FUN_DRV_S)
#define GPIO_ENABLE_REG 0
#define GPIO_OUT_REG 1
#define GPIO_FUNC4_OUT_SEL_CFG_REG 2
#define GPIO_FUNC4_OUT_SEL_M 255
#define GPIO_FUNC4_OUT_SEL_S 0
#define GPIO_FUNC4_OUT_INV_SEL_M (1U<<8)
#define GPIO_FUNC4_OUT_INV_SEL_S 8
#define IO_MUX_GPIO4_REG 3
#define IO_MUX_GPIO5_REG 4
#define MCU_SEL_M (7U<<12)
#define MCU_SEL_S 12
#define FUN_IE (1U<<9)
#define FUN_PU (1U<<8)
#define FUN_PD (1U<<7)
#define TWAI_RX_IDX 74
#define SIG_GPIO_OUT_IDX 128
#define PIN_FUNC_GPIO 1
static inline esp_err_t gpio_reset_pin(int pin){if(fake_gpio_fail)return ESP_FAIL;if(pin==4)fake_reg[0]=0;return 0;}
#ifdef READER_TEST_SELFTEST
int fake_probe_set(int pin,int level);
int fake_probe_get(int pin);
#endif
static inline esp_err_t gpio_set_level(int pin,int level){if(fake_gpio_fail)return ESP_FAIL;
#ifdef READER_TEST_SELFTEST
return fake_probe_set(pin,level);
#else
if(pin==4){assert(level==1);fake_reg[1]|=BIT(4);fake_pad=1;}return 0;
#endif
}
static inline esp_err_t gpio_set_direction(int pin,int mode){if(fake_gpio_fail)return ESP_FAIL;if(pin==4){assert(mode==3 && (fake_reg[1]&BIT(4)));fake_reg[0]|=BIT(4);fake_reg[2]=128;fake_reg[3]=FUN_IE|(1<<12);}return 0;}
static inline int gpio_pullup_en(int pin){fake_reg[pin==4?3:4]|=FUN_PU;return ESP_OK;}
static inline int gpio_pullup_dis(int pin){fake_reg[pin==4?3:4]&=~FUN_PU;return ESP_OK;}
static inline int gpio_get_level(int pin){
#ifdef READER_TEST_SELFTEST
return fake_probe_get(pin);
#else
return pin==4?fake_pad:1;
#endif
}
static inline int gpio_config(const gpio_config_t *c){(void)c;return 0;}
static inline int gpio_intr_disable(int p){(void)p;return 0;}
static inline int gpio_intr_enable(int p){(void)p;return 0;}
static inline int gpio_set_intr_type(int p,int t){(void)p;(void)t;return 0;}
static inline int gpio_install_isr_service(int f){(void)f;return 0;}
static inline int gpio_isr_handler_add(int p,void(*f)(void*),void*a){(void)p;(void)f;(void)a;return 0;}
static inline void gpio_uninstall_isr_service(void){}
typedef int portMUX_TYPE;
#define portMUX_INITIALIZER_UNLOCKED 0
#define portENTER_CRITICAL(x) ((void)(x))
#define portEXIT_CRITICAL(x) ((void)(x))
#define portENTER_CRITICAL_ISR(x) ((void)(x))
#define portEXIT_CRITICAL_ISR(x) ((void)(x))
typedef unsigned TickType_t;typedef void *TaskHandle_t;typedef void *SemaphoreHandle_t;
#define pdTRUE 1
#define pdPASS 1
#define pdMS_TO_TICKS(x) (x)
typedef struct fake_queue {unsigned capacity,size,count,start; unsigned char *data;} *QueueHandle_t;
static inline QueueHandle_t xQueueCreate(unsigned cap,unsigned size){QueueHandle_t q=calloc(1,sizeof(*q));q->capacity=cap;q->size=size;q->data=calloc(cap,size);return q;}
static inline int xQueueSend(QueueHandle_t q,const void*p,unsigned wait){(void)wait;if(q->count==q->capacity)return 0;memcpy(q->data+((q->start+q->count)%q->capacity)*q->size,p,q->size);q->count++;return 1;}
static inline int xQueueReceive(QueueHandle_t q,void*p,unsigned wait){(void)wait;if(!q->count)return 0;memcpy(p,q->data+q->start*q->size,q->size);q->start=(q->start+1)%q->capacity;q->count--;return 1;}
static inline int xQueuePeek(QueueHandle_t q,void*p,unsigned wait){(void)wait;if(!q->count)return 0;memcpy(p,q->data+q->start*q->size,q->size);return 1;}
static inline int xQueueOverwrite(QueueHandle_t q,const void*p){q->start=q->count=0;return xQueueSend(q,p,0);}
static inline unsigned uxQueueMessagesWaiting(QueueHandle_t q){return q->count;}
static inline void fake_queue_free(QueueHandle_t q){if(q){free(q->data);free(q);}}
#ifdef READER_TEST_BATTERY_QUERY
void fake_query_delay(unsigned ticks);
#endif
static inline void vTaskDelay(unsigned ticks){fake_clock+=ticks*1000;
#ifdef READER_TEST_BATTERY_QUERY
fake_query_delay(ticks);
#endif
}
static inline unsigned uxTaskGetStackHighWaterMark(TaskHandle_t t){(void)t;return 1000;}
static inline int xTaskCreate(void(*f)(void*),const char*n,unsigned stack,void*a,int priority,TaskHandle_t*h){(void)f;(void)n;(void)stack;(void)a;(void)priority;*h=(void*)1;return 1;}
static inline SemaphoreHandle_t xSemaphoreCreateMutex(void){return (void*)1;}
static inline int xSemaphoreTake(SemaphoreHandle_t s,unsigned ticks){(void)s;(void)ticks;return 1;}
static inline void xSemaphoreGive(SemaphoreHandle_t s){(void)s;}
static inline int64_t esp_timer_get_time(void){fake_clock+=1000;return fake_clock;}
static inline int esp_reset_reason(void){return 0;}
static inline uint32_t esp_random(void){return 1;}
static inline unsigned esp_get_free_heap_size(void){return 100000;}
static inline void esp_log_set_vprintf(int(*f)(const char*,va_list)){(void)f;}
typedef struct {uint32_t identifier;uint8_t data_length_code;uint8_t data[8];bool rtr,extd,ss,self;} twai_message_t;
typedef struct {uint32_t quanta_resolution_hz,tseg_1,tseg_2,sjw;bool triple_sampling;} twai_timing_config_t;
#define TEST_TIMING {4000000,11,4,2,false}
#define TWAI_TIMING_CONFIG_10KBITS() TEST_TIMING
#define TWAI_TIMING_CONFIG_20KBITS() TEST_TIMING
#define TWAI_TIMING_CONFIG_50KBITS() TEST_TIMING
#define TWAI_TIMING_CONFIG_100KBITS() TEST_TIMING
#define TWAI_TIMING_CONFIG_125KBITS() TEST_TIMING
#define TWAI_TIMING_CONFIG_250KBITS() TEST_TIMING
#define TWAI_TIMING_CONFIG_500KBITS() TEST_TIMING
#define TWAI_TIMING_CONFIG_800KBITS() TEST_TIMING
#define TWAI_TIMING_CONFIG_1MBITS() TEST_TIMING
#define TWAI_MODE_LISTEN_ONLY 2
#define TWAI_MODE_NORMAL 0
#define TWAI_MODE_NO_ACK 1
#define TWAI_STATE_RUNNING 1
#define TWAI_STATE_BUS_OFF 3
#define TWAI_ALERT_BUS_ERROR 1
#define TWAI_ALERT_RX_QUEUE_FULL 2
#define TWAI_ALERT_BUS_OFF 4
#define TWAI_ALERT_ERR_PASS 8
#define TWAI_ALERT_TX_SUCCESS 16
#define TWAI_ALERT_TX_FAILED 32
#define TWAI_ALERT_ARB_LOST 64
typedef struct {unsigned tx_queue_len,rx_queue_len,alerts_enabled;int tx_io,rx_io,mode;}twai_general_config_t;
#define TWAI_GENERAL_CONFIG_DEFAULT(tx,rx,m) {0,0,0,tx,rx,m}
typedef struct {int unused;}twai_filter_config_t;
#define TWAI_FILTER_CONFIG_ACCEPT_ALL() {0}
typedef struct {uint32_t rx_missed_count,rx_overrun_count,bus_error_count,arb_lost_count,tx_failed_count,rx_error_counter,tx_error_counter,msgs_to_rx,msgs_to_tx,state;}twai_status_info_t;
extern QueueHandle_t fake_rx;
#ifdef READER_TEST_BATTERY_QUERY
void fake_query_status(twai_status_info_t*s);
int fake_query_transmit(const twai_message_t*m);
bool fake_query_connected(void);
void fake_query_route(int gpio,int signal);
void fake_query_received(void);
void fake_query_stopping(void);
#endif
static inline int twai_get_status_info(twai_status_info_t*s){fake_status_calls++;if(fake_status_fail || fake_status_calls==fake_status_fail_on)return ESP_FAIL;memset(s,0,sizeof(*s));s->state=fake_driver_state;s->msgs_to_rx=fake_rx->count;
#ifdef READER_TEST_BATTERY_QUERY
fake_query_status(s);
#endif
return 0;}
#ifdef READER_TEST_SELFTEST
void fake_selftest_install(const twai_general_config_t*g,const twai_timing_config_t*t);
#endif
static inline int twai_driver_install(const twai_general_config_t*g,const twai_timing_config_t*t,const twai_filter_config_t*f){(void)t;(void)f;assert(g->tx_io==10 && (g->mode==2 || g->mode==0 || g->mode==1) && g->tx_queue_len==0);
#ifdef READER_TEST_SELFTEST
fake_selftest_install(g,t);
#endif
if(fake_install_fail) { return ESP_FAIL; }
#if defined(READER_TEST_BATTERY_QUERY) && !defined(READER_TEST_SELFTEST)
void fake_query_install_config(const twai_general_config_t*,const twai_timing_config_t*);fake_query_install_config(g,t);
#endif
fake_driver_installed=1;return 0;}
static inline int twai_driver_uninstall(void){if(fake_uninstall_fail)return ESP_FAIL;fake_driver_installed=0;return 0;}
static inline int twai_start(void){if(fake_start_fail)return ESP_FAIL;fake_driver_state=TWAI_STATE_RUNNING;return 0;}
static inline int twai_stop(void){
#ifdef READER_TEST_BATTERY_QUERY
fake_query_stopping();
#endif
if(fake_stop_fail){return ESP_FAIL;}
fake_driver_state=0;return 0;}
static inline int twai_receive(twai_message_t*m,unsigned wait){bool ok=xQueueReceive(fake_rx,m,wait);
#ifdef READER_TEST_BATTERY_QUERY
if(ok)fake_query_received();
#endif
return ok?ESP_OK:ESP_FAIL;}
static inline int twai_transmit(const twai_message_t*m,unsigned wait){assert(wait==0);
#ifdef READER_TEST_BATTERY_QUERY
#ifdef READER_TEST_RMT
void fake_rmt_on_transmit(void);fake_rmt_on_transmit();
#endif
return fake_query_transmit(m);
#else
(void)m;return ESP_FAIL;
#endif
}
static inline int twai_read_alerts(uint32_t *a,unsigned wait){(void)wait;*a=0;return ESP_FAIL;}
typedef struct {unsigned tx_buffer_size,rx_buffer_size;}usb_serial_jtag_driver_config_t;
static inline int usb_serial_jtag_driver_install(const usb_serial_jtag_driver_config_t*c){(void)c;return 0;}
static inline bool usb_serial_jtag_is_connected(void){
#ifdef READER_TEST_BATTERY_QUERY
return fake_query_connected();
#else
return true;
#endif
}
static inline int usb_serial_jtag_write_bytes(const void*p,size_t n,unsigned wait){(void)wait;if(fake_usb_always_fail || fake_clock<fake_usb_fail_until)return 0;assert(fake_wire_size+n<sizeof(fake_wire));memcpy(fake_wire+fake_wire_size,p,n);fake_wire_size+=n;fake_wire[fake_wire_size]=0;return n;}
static inline int usb_serial_jtag_read_bytes(void*p,unsigned n,unsigned wait){(void)p;(void)n;(void)wait;return 0;}
