#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <inttypes.h>
#include <ctype.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "driver/gpio.h"
#include "driver/twai.h"
#include "driver/usb_serial_jtag.h"
#include "esp_timer.h"
#include "esp_system.h"
#include "esp_random.h"
#include "freertos/semphr.h"
#include "reader.h"
#include "web_server.h"

#define VERSION "0.2.1"
#define FRAME_QUEUE_LEN 256
#define LINE_SIZE 1400
#ifndef READER_LED_ACTIVE_LEVEL
#define READER_LED_ACTIVE_LEVEL 0
#endif

typedef struct { char text[80]; uint32_t token; } command_t;
typedef struct { char text[LINE_SIZE]; } reply_t;
typedef struct { uint32_t token; char error[120]; } rpc_reply_t;
typedef struct {
    bool running;
    uint32_t bitrate, epoch;
    uint64_t received, queue_drops, usb_drops, control_drops, stop_drops, command_drops;
    uint64_t missed, overruns, bus_errors, arb_lost, tx_failed;
    uint32_t rec, tec, rx_pending, state;
    int64_t last_rx, error_until;
    int led_override;
} stats_t;
static QueueHandle_t frames, commands, replies;
static QueueHandle_t rpc_replies;
static SemaphoreHandle_t rpc_mutex;
static frame_t preview[FRAME_QUEUE_LEN];
static char command_error[120], boot_text[9];
static TaskHandle_t can_handle, usb_handle;
static portMUX_TYPE lock = portMUX_INITIALIZER_UNLOCKED;
static stats_t stats = {.led_override = -1};
static uint32_t boot_id;
static esp_reset_reason_t reset_reason;
static bool installed;
static uint64_t base_missed, base_overruns, base_bus, base_arb, base_failed;
#define LOCK() portENTER_CRITICAL(&lock)
#define UNLOCK() portEXIT_CRITICAL(&lock)

static void fault(void) { stats.error_until = esp_timer_get_time() + 3000000; }

static void queue_reply(const reply_t *r) {
    if (xQueueSend(replies, r, 0) != pdTRUE) {
        LOCK(); stats.control_drops++; fault(); UNLOCK();
    }
}

static void reply(const char *text) {
    reply_t r;
    snprintf(r.text, sizeof(r.text), "%s", text);
    queue_reply(&r);
}

static void sample_driver(void) {
    if (!installed) return;
    twai_status_info_t s;
    if (twai_get_status_info(&s) != ESP_OK) return;
    LOCK();
    uint64_t errors = base_bus + s.bus_error_count;
    uint64_t missed = base_missed + s.rx_missed_count;
    uint64_t over = base_overruns + s.rx_overrun_count;
    if (errors != stats.bus_errors || missed != stats.missed || over != stats.overruns || s.state == TWAI_STATE_BUS_OFF) fault();
    stats.missed = missed; stats.overruns = over; stats.bus_errors = errors;
    stats.arb_lost = base_arb + s.arb_lost_count;
    stats.tx_failed = base_failed + s.tx_failed_count;
    stats.rec = s.rx_error_counter; stats.tec = s.tx_error_counter;
    stats.rx_pending = s.msgs_to_rx; stats.state = s.state;
    UNLOCK();
}

void reader_status_json(char *buffer, size_t capacity) {
    LOCK(); stats_t s = stats; UNLOCK();
    reader_network_t net; web_network_snapshot(&net);
    snprintf(buffer, capacity,
        "{\"type\":\"status\",\"product\":\"BafangReader\",\"protocol\":1,\"version\":\"%s\",\"boot\":\"%08" PRIX32 "\",\"reset_reason\":%d,"
        "\"uptime_us\":%" PRId64 ",\"can\":\"%s\",\"mode\":\"listen_only\",\"bitrate\":%" PRIu32 ",\"epoch\":%" PRIu32 ","
        "\"received\":%" PRIu64 ",\"frame_queue_drops\":%" PRIu64 ",\"usb_frame_drops\":%" PRIu64 ","
        "\"control_drops\":%" PRIu64 ",\"command_drops\":%" PRIu64 ",\"stop_discards\":%" PRIu64 ","
        "\"rx_missed\":%" PRIu64 ",\"rx_overrun\":%" PRIu64 ",\"bus_errors\":%" PRIu64 ","
        "\"arb_lost\":%" PRIu64 ",\"tx_failed\":%" PRIu64 ",\"rec\":%" PRIu32 ",\"tec\":%" PRIu32 ","
        "\"twai_state\":%" PRIu32 ",\"rx_pending\":%" PRIu32 ",\"frame_queue_pending\":%u,"
        "\"usb_connected\":%s,\"tx_gpio\":4,\"rx_gpio\":5,\"led_gpio\":8,\"led_active_level\":%d,\"led_override\":%d,"
        "\"can_stack_free\":%u,\"usb_stack_free\":%u,\"heap_free\":%u,"
        "\"ssid\":\"%s\",\"ip\":\"192.168.4.1\",\"wifi_channel\":%d,\"wifi_clients\":%d,\"wifi_ready\":%s,"
        "\"ap_mac\":\"%s\",\"saved_ssid\":\"%s\",\"saved_wifi_channel\":%d}\n",
        VERSION, boot_id, reset_reason, esp_timer_get_time(), s.running ? "running" : "stopped", s.bitrate, s.epoch,
        s.received, s.queue_drops, s.usb_drops, s.control_drops, s.command_drops, s.stop_drops,
        s.missed, s.overruns, s.bus_errors, s.arb_lost, s.tx_failed, s.rec, s.tec, s.state, s.rx_pending,
        (unsigned)uxQueueMessagesWaiting(frames), usb_serial_jtag_is_connected() ? "true" : "false",
        net.led_level, s.led_override,
        can_handle ? (unsigned)uxTaskGetStackHighWaterMark(can_handle) : 0,
        usb_handle ? (unsigned)uxTaskGetStackHighWaterMark(usb_handle) : 0,
        (unsigned)esp_get_free_heap_size(), net.ssid, net.channel, net.clients, net.ready ? "true" : "false",
        net.mac, net.saved_ssid, net.saved_channel);
}

static void status_reply(void) {
    sample_driver();
    reply_t r;
    reader_status_json(r.text, sizeof(r.text));
    queue_reply(&r);
}

static bool timing_for(unsigned bitrate, twai_timing_config_t *t) {
    switch (bitrate) {
    case 10000: *t = (twai_timing_config_t)TWAI_TIMING_CONFIG_10KBITS(); break;
    case 20000: *t = (twai_timing_config_t)TWAI_TIMING_CONFIG_20KBITS(); break;
    case 50000: *t = (twai_timing_config_t)TWAI_TIMING_CONFIG_50KBITS(); break;
    case 100000: *t = (twai_timing_config_t)TWAI_TIMING_CONFIG_100KBITS(); break;
    case 125000: *t = (twai_timing_config_t)TWAI_TIMING_CONFIG_125KBITS(); break;
    case 250000: *t = (twai_timing_config_t)TWAI_TIMING_CONFIG_250KBITS(); break;
    case 500000: *t = (twai_timing_config_t)TWAI_TIMING_CONFIG_500KBITS(); break;
    case 800000: *t = (twai_timing_config_t)TWAI_TIMING_CONFIG_800KBITS(); break;
    case 1000000: *t = (twai_timing_config_t)TWAI_TIMING_CONFIG_1MBITS(); break;
    default: return false;
    }
    return true;
}

static void error_reply(const char *message) {
    snprintf(command_error, sizeof(command_error), "%s", message);
    char line[200];
    snprintf(line, sizeof(line), "{\"type\":\"error\",\"message\":\"%s\"}\n", message);
    reply(line);
}

// This task is the sole owner of TWAI lifecycle and reception.
static void handle_command(char *cmd) {
    if (!strcmp(cmd, "HELP")) {
        reply("{\"type\":\"help\",\"commands\":[\"HELP\",\"STATUS\",\"START <bitrate>\",\"STOP\",\"LED LOW|HIGH|AUTO\",\"LED ACTIVE LOW|HIGH\",\"WIFI <channel> <ssid>\"],\"bitrates\":[10000,20000,50000,100000,125000,250000,500000,800000,1000000]}\n");
    } else if (!strcmp(cmd, "STATUS")) {
        status_reply();
    } else if (!strncmp(cmd, "START ", 6)) {
        char *end;
        unsigned long bitrate = strtoul(cmd + 6, &end, 10);
        twai_timing_config_t timing;
        if (*end || end == cmd + 6 || bitrate > 1000000 || !timing_for(bitrate, &timing)) {
            error_reply("unsupported bitrate; use HELP"); return;
        }
        if (installed) { error_reply("already running; STOP before START"); return; }
        twai_general_config_t g = TWAI_GENERAL_CONFIG_DEFAULT(GPIO_NUM_4, GPIO_NUM_5, TWAI_MODE_LISTEN_ONLY);
        g.tx_queue_len = 0; g.rx_queue_len = 128;
        g.alerts_enabled = TWAI_ALERT_BUS_ERROR | TWAI_ALERT_RX_QUEUE_FULL | TWAI_ALERT_BUS_OFF | TWAI_ALERT_ERR_PASS;
        twai_filter_config_t f = TWAI_FILTER_CONFIG_ACCEPT_ALL();
        esp_err_t result = twai_driver_install(&g, &timing, &f);
        if (result != ESP_OK) { error_reply("TWAI install failed"); return; }
        result = twai_start();
        if (result != ESP_OK) { twai_driver_uninstall(); error_reply("TWAI start failed"); return; }
        installed = true;
        LOCK(); stats.running = true; stats.bitrate = bitrate; stats.epoch++; UNLOCK();
        status_reply();
    } else if (!strcmp(cmd, "STOP")) {
        if (installed) {
            twai_status_info_t current;
            if (twai_get_status_info(&current) != ESP_OK) { error_reply("TWAI status failed"); return; }
            if (current.state == TWAI_STATE_RUNNING && twai_stop() != ESP_OK) { error_reply("TWAI stop failed"); return; }
            sample_driver();
            LOCK();
            stats.stop_drops += stats.rx_pending;
            base_missed = stats.missed; base_overruns = stats.overruns;
            base_bus = stats.bus_errors; base_arb = stats.arb_lost; base_failed = stats.tx_failed;
            UNLOCK();
            if (twai_driver_uninstall() != ESP_OK) { error_reply("TWAI uninstall failed"); return; }
            installed = false;
            LOCK(); stats.running = false; stats.rx_pending = 0; UNLOCK();
            // Keep CTX recessive while stopped, including before the first START.
            gpio_reset_pin(GPIO_NUM_4); gpio_set_level(GPIO_NUM_4, 1); gpio_set_direction(GPIO_NUM_4, GPIO_MODE_OUTPUT);
        }
        status_reply();
    } else if (!strcmp(cmd, "LED ACTIVE LOW") || !strcmp(cmd, "LED ACTIVE HIGH")) {
        if (installed) { error_reply("STOP CAN before saving settings"); return; }
        if (web_save_led(!strcmp(cmd, "LED ACTIVE HIGH")) != ESP_OK) { error_reply("settings save failed"); return; }
        status_reply();
    } else if (!strncmp(cmd, "WIFI ", 5)) {
        if (installed) { error_reply("STOP CAN before saving settings"); return; }
        char *end; long channel = strtol(cmd + 5, &end, 10);
        if (*end != ' ' || channel < 1 || channel > 11 || !end[1] || strlen(end + 1) > 32) {
            error_reply("WIFI requires channel 1..11 and SSID 1..32 ASCII characters"); return;
        }
        if (web_save_ap(end + 1, channel) != ESP_OK) { error_reply("invalid SSID or settings save failed"); return; }
        status_reply();
    } else if (!strcmp(cmd, "LED LOW") || !strcmp(cmd, "LED HIGH") || !strcmp(cmd, "LED AUTO")) {
        LOCK(); stats.led_override = !strcmp(cmd, "LED AUTO") ? -1 : (!strcmp(cmd, "LED HIGH") ? 1 : 0); UNLOCK();
        status_reply();
    } else { error_reply("unknown command; use HELP"); }
}

static void can_task(void *arg) {
    int64_t next_sample = 0;
    while (true) {
        command_t c;
        if (xQueueReceive(commands, &c, 0) == pdTRUE) {
            command_error[0] = 0;
            handle_command(c.text);
            if (c.token) {
                rpc_reply_t r = {.token = c.token};
                snprintf(r.error, sizeof(r.error), "%s", command_error);
                xQueueOverwrite(rpc_replies, &r);
            }
        }
        if (!installed) { vTaskDelay(pdMS_TO_TICKS(5)); continue; }
        twai_message_t m;
        if (twai_receive(&m, pdMS_TO_TICKS(5)) == ESP_OK) {
            frame_t f = {.us = esp_timer_get_time(), .msg = m};
            LOCK(); f.seq = ++stats.received; f.epoch = stats.epoch; stats.last_rx = f.us;
            preview[(f.seq - 1) % FRAME_QUEUE_LEN] = f; UNLOCK();
            if (xQueueSend(frames, &f, 0) != pdTRUE) { LOCK(); stats.queue_drops++; fault(); UNLOCK(); }
        }
        uint32_t alerts;
        if (twai_read_alerts(&alerts, 0) == ESP_OK && alerts) { LOCK(); fault(); UNLOCK(); }
        int64_t now = esp_timer_get_time();
        if (now >= next_sample) { sample_driver(); next_sample = now + 100000; }
        // Allow idle task/watchdog time even on a saturated bus.
        if ((stats.received & 31) == 0) vTaskDelay(1);
    }
}

static bool write_line(const char *line) {
    size_t size = strlen(line);
    // Driver uses an atomic ring-buffer enqueue, with a bounded zero wait.
    return usb_serial_jtag_write_bytes(line, size, 0) == size;
}

const char *reader_boot(void) { return boot_text; }

size_t reader_frame_json(const frame_t *f, char *line, size_t capacity) {
    char hex[17] = {0};
    if (!f->msg.rtr) for (int j = 0; j < f->msg.data_length_code && j < 8; j++) sprintf(hex + 2*j, "%02X", f->msg.data[j]);
    return snprintf(line, capacity, "{\"type\":\"frame\",\"boot\":\"%s\",\"epoch\":%" PRIu32 ",\"t_us\":%" PRId64 ",\"seq\":%" PRIu64 ",\"id\":\"%08" PRIX32 "\",\"extended\":%s,\"rtr\":%s,\"dlc\":%u,\"data\":\"%s\"}",
        boot_text, f->epoch, f->us, f->seq, f->msg.identifier, f->msg.extd ? "true" : "false", f->msg.rtr ? "true" : "false", f->msg.data_length_code, hex);
}

size_t reader_frames(uint64_t after, frame_t *out, size_t capacity, uint64_t *latest, uint64_t *oldest) {
    LOCK(); *latest = stats.received; UNLOCK();
    *oldest = *latest >= FRAME_QUEUE_LEN ? *latest - FRAME_QUEUE_LEN + 1 : (*latest ? 1 : 0);
    uint64_t start = after < *oldest ? *oldest : after + 1;
    size_t count = 0;
    for (uint64_t i = start; i && i <= *latest && count < capacity; i++) {
        LOCK(); frame_t f = preview[(i - 1) % FRAME_QUEUE_LEN]; UNLOCK();
        if (f.seq == i) out[count++] = f;
    }
    return count;
}

bool reader_command(const char *text, char *error, size_t capacity) {
    static uint32_t token = 0;
    if (capacity) error[0] = 0;
    if (!text || strlen(text) >= sizeof(((command_t *)0)->text)) { snprintf(error, capacity, "command too long"); return false; }
    if (xSemaphoreTake(rpc_mutex, pdMS_TO_TICKS(100)) != pdTRUE) { snprintf(error, capacity, "controller busy"); return false; }
    command_t c = {.token = ++token};
    if (!c.token) c.token = ++token;
    snprintf(c.text, sizeof(c.text), "%s", text);
    bool ok = false;
    if (xQueueSend(commands, &c, 0) != pdTRUE) snprintf(error, capacity, "command queue full");
    else {
        rpc_reply_t r;
        int64_t end = esp_timer_get_time() + 2000000;
        while (esp_timer_get_time() < end) {
            if (xQueueReceive(rpc_replies, &r, pdMS_TO_TICKS(50)) == pdTRUE && r.token == c.token) {
                snprintf(error, capacity, "%s", r.error); ok = !r.error[0]; break;
            }
        }
        if (!ok && !error[0]) snprintf(error, capacity, "command timeout; check STATUS");
    }
    xSemaphoreGive(rpc_mutex);
    return ok;
}

static void usb_task(void *arg) {
    char input[80]; size_t length = 0; bool overflow = false;
    reply_t r;
    while (true) {
        unsigned char bytes[128];
        int n = usb_serial_jtag_read_bytes(bytes, sizeof(bytes), 0);
        for (int i = 0; i < n; i++) {
            unsigned char ch = bytes[i];
            if (ch == '\r' || ch == '\n') {
                if (overflow) error_reply("command too long");
                else if (length) {
                    input[length] = 0;
                    command_t c = {0}; memcpy(c.text, input, length + 1);
                    if (xQueueSend(commands, &c, 0) != pdTRUE) {
                        LOCK(); stats.command_drops++; fault(); UNLOCK();
                        error_reply("command queue full");
                    }
                }
                length = 0; overflow = false;
            } else if (ch >= 32 && ch < 127 && !overflow) {
                if (length < sizeof(input) - 1) input[length++] = toupper(ch);
                else overflow = true;
            }
        }
        // Replies have priority and are retried up to 250ms. CAN RX never waits here.
        if (xQueueReceive(replies, &r, 0) == pdTRUE) {
            int64_t deadline = esp_timer_get_time() + 250000;
            bool ok;
            while (!(ok = write_line(r.text)) && esp_timer_get_time() < deadline) vTaskDelay(1);
            if (!ok) { LOCK(); stats.control_drops++; fault(); UNLOCK(); }
        }
        for (int i = 0; i < 32; i++) {
            frame_t f;
            if (xQueueReceive(frames, &f, 0) != pdTRUE) break;
            char line[320];
            size_t length = reader_frame_json(&f, line, sizeof(line));
            if (length < sizeof(line) - 2) { line[length] = '\n'; line[length+1] = 0; }
            if (!write_line(line)) { LOCK(); stats.usb_drops++; fault(); UNLOCK(); }
        }
        vTaskDelay(1);
    }
}

static void led_task(void *arg) {
    gpio_reset_pin(GPIO_NUM_8); gpio_set_direction(GPIO_NUM_8, GPIO_MODE_OUTPUT);
    while (true) {
        int64_t now = esp_timer_get_time();
        LOCK(); stats_t s = stats; UNLOCK();
        reader_network_t net; web_network_snapshot(&net);
        bool on;
        if (now < s.error_until) { int phase = (now / 1000) % 1500; on = phase < 500 && (phase % 180) < 60; }
        else if (s.running && now - s.last_rx < 200000 && s.last_rx) on = (now % 150000) < 25000;
        else on = (now % 2000000) < 100000;
        gpio_set_level(GPIO_NUM_8, s.led_override >= 0 ? s.led_override : (on ? net.led_level : !net.led_level));
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void app_main(void) {
    boot_id = esp_random(); reset_reason = esp_reset_reason();
    snprintf(boot_text, sizeof(boot_text), "%08" PRIX32, boot_id);
    gpio_reset_pin(GPIO_NUM_4); gpio_set_level(GPIO_NUM_4, 1); gpio_set_direction(GPIO_NUM_4, GPIO_MODE_OUTPUT);
    frames = xQueueCreate(FRAME_QUEUE_LEN, sizeof(frame_t));
    commands = xQueueCreate(8, sizeof(command_t)); replies = xQueueCreate(8, sizeof(reply_t));
    rpc_replies = xQueueCreate(1, sizeof(rpc_reply_t)); rpc_mutex = xSemaphoreCreateMutex();
    assert(frames && commands && replies && rpc_replies && rpc_mutex);
    usb_serial_jtag_driver_config_t usb = {.tx_buffer_size = 8192, .rx_buffer_size = 512};
    ESP_ERROR_CHECK(usb_serial_jtag_driver_install(&usb));
    ESP_ERROR_CHECK(web_config_init());
    esp_err_t network_result = web_start();
    if (network_result != ESP_OK) reply("{\"type\":\"error\",\"message\":\"Wi-Fi unavailable; USB remains available\"}\n");
    reply("{\"type\":\"hello\",\"product\":\"BafangReader\",\"version\":\"" VERSION "\",\"protocol\":1}\n");
    status_reply();
    assert(xTaskCreate(can_task, "can_rx", 8192, NULL, 8, &can_handle) == pdPASS);
    assert(xTaskCreate(usb_task, "usb_io", 8192, NULL, 5, &usb_handle) == pdPASS);
    assert(xTaskCreate(led_task, "led", 3072, NULL, 2, NULL) == pdPASS);
}
