#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <inttypes.h>
#include <ctype.h>
#include <errno.h>
#include <unistd.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_http_server.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "lwip/sockets.h"
#include "lwip/inet.h"
#include "cJSON.h"
#include "reader.h"
#include "web_server.h"

#define REPO "desertod666/CityBike"
#define DOWNLOAD "https://github.com/" REPO "/releases/latest/download/BafangReader-Windows-x64.zip"
#define RELEASE "https://github.com/" REPO "/releases/latest"
static reader_network_t net;
static portMUX_TYPE net_lock = portMUX_INITIALIZER_UNLOCKED;

extern const char index_start[] asm("_binary_index_html_start");
extern const char index_end[] asm("_binary_index_html_end");
extern const char css_start[] asm("_binary_style_css_start");
extern const char css_end[] asm("_binary_style_css_end");
extern const char app_start[] asm("_binary_app_js_start");
extern const char app_end[] asm("_binary_app_js_end");
extern const char decoder_start[] asm("_binary_decoder_js_start");
extern const char decoder_end[] asm("_binary_decoder_js_end");
extern const char reference_start[] asm("_binary_decoder_reference_json_start");
extern const char reference_end[] asm("_binary_decoder_reference_json_end");

void web_network_snapshot(reader_network_t *out) {
    portENTER_CRITICAL(&net_lock); *out = net; portEXIT_CRITICAL(&net_lock);
}

static bool valid_ssid(const char *ssid) {
    if (!ssid || !ssid[0] || strlen(ssid) > 32) return false;
    for (const unsigned char *p = (const unsigned char *)ssid; *p; p++)
        if (!(isalnum(*p) || *p == '-' || *p == '_' || *p == ' ')) return false;
    return true;
}

esp_err_t web_config_init(void) {
    uint8_t mac[6]; ESP_ERROR_CHECK(esp_read_mac(mac, ESP_MAC_WIFI_SOFTAP));
    snprintf(net.mac, sizeof(net.mac), MACSTR, MAC2STR(mac));
    snprintf(net.ssid, sizeof(net.ssid), "BafangReader-%02X%02X", mac[4], mac[5]);
    net.channel = 6; net.led_level = 0;
    esp_err_t result = nvs_flash_init();
    if (result != ESP_OK) return result; // Never erase unrelated NVS automatically.
    nvs_handle_t h;
    if (nvs_open("reader_cfg", NVS_READONLY, &h) == ESP_OK) {
        char ssid[33]; size_t size = sizeof(ssid); int32_t value;
        if (nvs_get_str(h, "ssid", ssid, &size) == ESP_OK && valid_ssid(ssid)) snprintf(net.ssid, sizeof(net.ssid), "%s", ssid);
        if (nvs_get_i32(h, "channel", &value) == ESP_OK && value >= 1 && value <= 11) net.channel = value;
        if (nvs_get_i32(h, "led_level", &value) == ESP_OK && value >= 0 && value <= 1) net.led_level = value;
        nvs_close(h);
    }
    snprintf(net.saved_ssid, sizeof(net.saved_ssid), "%s", net.ssid);
    net.saved_channel = net.channel;
    return ESP_OK;
}

esp_err_t web_save_ap(const char *ssid, int channel) {
    if (!valid_ssid(ssid) || channel < 1 || channel > 11) return ESP_ERR_INVALID_ARG;
    nvs_handle_t h; esp_err_t r = nvs_open("reader_cfg", NVS_READWRITE, &h);
    if (r != ESP_OK) return r;
    if ((r = nvs_set_str(h, "ssid", ssid)) == ESP_OK && (r = nvs_set_i32(h, "channel", channel)) == ESP_OK) r = nvs_commit(h);
    nvs_close(h);
    if (r == ESP_OK) {
        portENTER_CRITICAL(&net_lock);
        snprintf(net.saved_ssid, sizeof(net.saved_ssid), "%s", ssid); net.saved_channel = channel;
        portEXIT_CRITICAL(&net_lock);
    }
    return r;
}

esp_err_t web_save_led(int level) {
    nvs_handle_t h; esp_err_t r = nvs_open("reader_cfg", NVS_READWRITE, &h);
    if (r != ESP_OK) return r;
    if ((r = nvs_set_i32(h, "led_level", level)) == ESP_OK) r = nvs_commit(h);
    nvs_close(h);
    if (r == ESP_OK) { portENTER_CRITICAL(&net_lock); net.led_level = level; portEXIT_CRITICAL(&net_lock); }
    return r;
}

static void wifi_event(void *arg, esp_event_base_t base, int32_t id, void *data) {
    portENTER_CRITICAL(&net_lock);
    if (id == WIFI_EVENT_AP_STACONNECTED) net.clients++;
    if (id == WIFI_EVENT_AP_STADISCONNECTED && net.clients) net.clients--;
    portEXIT_CRITICAL(&net_lock);
}

static esp_err_t json_send(httpd_req_t *req, cJSON *value) {
    char *json = cJSON_PrintUnformatted(value); cJSON_Delete(value);
    if (!json) return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "out of memory");
    httpd_resp_set_type(req, "application/json; charset=utf-8");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    esp_err_t r = httpd_resp_send(req, json, HTTPD_RESP_USE_STRLEN); free(json); return r;
}

static esp_err_t result_send(httpd_req_t *req, bool ok, const char *error) {
    cJSON *result = cJSON_CreateObject();
    cJSON_AddBoolToObject(result, "ok", ok); cJSON_AddStringToObject(result, "error", error ? error : "");
    return json_send(req, result);
}

static esp_err_t state_handler(httpd_req_t *req) {
    char status[1400]; reader_status_json(status, sizeof(status));
    cJSON *root = cJSON_CreateObject(), *device = cJSON_Parse(status);
    if (!device) { cJSON_Delete(root); return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "status unavailable"); }
    cJSON_AddItemToObject(root, "device", device);
    reader_network_t n; web_network_snapshot(&n);
    cJSON *network = cJSON_AddObjectToObject(root, "network");
    cJSON_AddStringToObject(network, "ssid", n.ssid); cJSON_AddStringToObject(network, "ip", "192.168.4.1");
    cJSON_AddStringToObject(network, "mac", n.mac); cJSON_AddStringToObject(network, "saved_ssid", n.saved_ssid);
    cJSON_AddNumberToObject(network, "channel", n.channel); cJSON_AddNumberToObject(network, "saved_channel", n.saved_channel);
    cJSON_AddNumberToObject(network, "clients", n.clients); cJSON_AddBoolToObject(network, "open", true);
    cJSON_AddBoolToObject(network, "internet", false);
    cJSON *connection = cJSON_AddObjectToObject(root, "connection");
    cJSON_AddStringToObject(connection, "transport", "wifi"); cJSON_AddBoolToObject(connection, "connected", true);
    cJSON *app = cJSON_AddObjectToObject(root, "app");
    cJSON_AddStringToObject(app, "version", "0.2.1"); cJSON_AddStringToObject(app, "repository", REPO);
    cJSON_AddStringToObject(app, "download_url", DOWNLOAD); cJSON_AddStringToObject(app, "release_url", RELEASE);
    cJSON_AddBoolToObject(app, "desktop", false);
    return json_send(req, root);
}

static esp_err_t frames_handler(httpd_req_t *req) {
    char query[100] = {0}, value[32] = {0}; uint64_t after = 0;
    if (httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK && httpd_query_key_value(query, "after", value, sizeof(value)) == ESP_OK) {
        char *end; errno = 0; after = strtoull(value, &end, 10);
        if (*end || errno || value[0] == '-') return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "invalid cursor");
    }
    frame_t *buffer = calloc(64, sizeof(frame_t));
    if (!buffer) return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "out of memory");
    uint64_t latest, oldest; size_t count = reader_frames(after, buffer, 64, &latest, &oldest);
    uint64_t missed = oldest && after < oldest - 1 ? oldest - after - 1 : 0;
    char line[340]; snprintf(line, sizeof(line), "{\"boot\":\"%s\",\"latest\":%" PRIu64 ",\"oldest\":%" PRIu64 ",\"missed\":%" PRIu64 ",\"frames\":[", reader_boot(), latest, oldest, missed);
    httpd_resp_set_type(req, "application/json"); httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    esp_err_t r = httpd_resp_send_chunk(req, line, HTTPD_RESP_USE_STRLEN);
    for (size_t i = 0; i < count && r == ESP_OK; i++) {
        if (i) r = httpd_resp_send_chunk(req, ",", 1);
        reader_frame_json(&buffer[i], line, sizeof(line));
        if (r == ESP_OK) r = httpd_resp_send_chunk(req, line, HTTPD_RESP_USE_STRLEN);
    }
    free(buffer);
    if (r == ESP_OK) r = httpd_resp_send_chunk(req, "]}", 2);
    if (r == ESP_OK) r = httpd_resp_send_chunk(req, NULL, 0);
    return r;
}

static cJSON *read_body(httpd_req_t *req) {
    char header[8];
    if (httpd_req_get_hdr_value_str(req, "X-Reader-UI", header, sizeof(header)) != ESP_OK || strcmp(header, "1")) return NULL;
    if (req->content_len <= 0 || req->content_len > 256) return NULL;
    char body[257]; int got = 0;
    while (got < req->content_len) {
        int n = httpd_req_recv(req, body + got, req->content_len - got);
        if (n <= 0) return NULL;
        got += n;
    }
    body[got] = 0;
    return cJSON_Parse(body);
}

static esp_err_t command_handler(httpd_req_t *req) {
    cJSON *body = read_body(req);
    if (!body) return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "invalid request");
    cJSON *command = cJSON_GetObjectItemCaseSensitive(body, "command");
    char error[120] = {0}; bool ok = false;
    if (cJSON_IsString(command) && strlen(command->valuestring) < 80) ok = reader_command(command->valuestring, error, sizeof(error));
    else snprintf(error, sizeof(error), "invalid command");
    cJSON_Delete(body); return result_send(req, ok, error);
}

static esp_err_t mark_handler(httpd_req_t *req) {
    cJSON *body = read_body(req);
    cJSON *action = body ? cJSON_GetObjectItemCaseSensitive(body, "action") : NULL;
    if (!cJSON_IsString(action) || strlen(action->valuestring) > 160) { cJSON_Delete(body); return result_send(req, false, "invalid mark"); }
    cJSON_Delete(body);
    cJSON *r = cJSON_CreateObject(); cJSON_AddBoolToObject(r, "ok", true); cJSON_AddNumberToObject(r, "t_us", esp_timer_get_time());
    return json_send(req, r); // Browser keeps marks alongside its bounded preview export.
}

static esp_err_t asset_handler(httpd_req_t *req) {
    const char *start = index_start, *end = index_end, *type = "text/html; charset=utf-8";
    if (!strcmp(req->uri, "/style.css")) { start = css_start; end = css_end; type = "text/css; charset=utf-8"; }
    else if (!strcmp(req->uri, "/app.js")) { start = app_start; end = app_end; type = "application/javascript; charset=utf-8"; }
    else if (!strcmp(req->uri, "/decoder.js")) { start = decoder_start; end = decoder_end; type = "application/javascript; charset=utf-8"; }
    else if (!strcmp(req->uri, "/decoder_reference.json")) { start = reference_start; end = reference_end; type = "application/json"; }
    httpd_resp_set_type(req, type); httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
    httpd_resp_set_hdr(req, "X-Content-Type-Options", "nosniff");
    return httpd_resp_send(req, start, end - start);
}

static esp_err_t not_found(httpd_req_t *req, httpd_err_code_t error) {
    httpd_resp_set_status(req, "302 Found"); httpd_resp_set_hdr(req, "Location", "http://192.168.4.1/");
    return httpd_resp_send(req, "Open BafangReader", HTTPD_RESP_USE_STRLEN);
}

// Bounded DNS A responder for captive-portal discovery. Never forwards DNS.
static void dns_task(void *arg) {
    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (sock < 0) { vTaskDelete(NULL); return; }
    struct sockaddr_in addr = {.sin_family = AF_INET, .sin_port = htons(53), .sin_addr.s_addr = htonl(INADDR_ANY)};
    if (bind(sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) { close(sock); vTaskDelete(NULL); return; }
    unsigned char packet[512];
    while (true) {
        struct sockaddr_in peer; socklen_t peer_len = sizeof(peer);
        int n = recvfrom(sock, packet, sizeof(packet) - 16, 0, (struct sockaddr *)&peer, &peer_len);
        if (n < 17 || (packet[2] & 0x80) || packet[4] || packet[5] != 1) continue;
        int pos = 12;
        while (pos < n && packet[pos] && packet[pos] <= 63) pos += packet[pos] + 1;
        if (pos + 5 > n || packet[pos] != 0) continue;
        int qtype = (packet[pos+1] << 8) | packet[pos+2];
        int end = pos + 5;
        packet[2] = 0x81; packet[3] = 0x80;
        packet[6] = packet[8] = packet[9] = packet[10] = packet[11] = 0;
        packet[7] = qtype == 1 ? 1 : 0;
        if (qtype == 1) {
            const unsigned char answer[] = {0xc0,0x0c,0,1,0,1,0,0,0,0,0,4,192,168,4,1};
            memcpy(packet + end, answer, sizeof(answer)); end += sizeof(answer);
        }
        sendto(sock, packet, end, 0, (struct sockaddr *)&peer, peer_len);
    }
}

esp_err_t web_start(void) {
    ESP_ERROR_CHECK(esp_netif_init()); ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_t *ap = esp_netif_create_default_wifi_ap();
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_err_t r = esp_wifi_init(&cfg); if (r != ESP_OK) return r;
    ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event, NULL));
    wifi_config_t wifi = {0};
    memcpy(wifi.ap.ssid, net.ssid, strlen(net.ssid)); wifi.ap.ssid_len = strlen(net.ssid);
    wifi.ap.channel = net.channel; wifi.ap.max_connection = 3; wifi.ap.authmode = WIFI_AUTH_OPEN;
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP)); ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi));
    esp_netif_dns_info_t dns = {0}; dns.ip.type = ESP_IPADDR_TYPE_V4; dns.ip.u_addr.ip4.addr = inet_addr("192.168.4.1");
    ESP_ERROR_CHECK(esp_netif_set_dns_info(ap, ESP_NETIF_DNS_MAIN, &dns));
    uint8_t offer = 1; ESP_ERROR_CHECK(esp_netif_dhcps_option(ap, ESP_NETIF_OP_SET, ESP_NETIF_DOMAIN_NAME_SERVER, &offer, sizeof(offer)));
    r = esp_wifi_start(); if (r != ESP_OK) return r;
    r = esp_netif_dhcps_start(ap);
    if (r != ESP_OK && r != ESP_ERR_ESP_NETIF_DHCP_ALREADY_STARTED) return r;
    esp_netif_dhcp_status_t dhcp_status = ESP_NETIF_DHCP_INIT;
    for (int attempt = 0; attempt < 100; attempt++) {
        ESP_ERROR_CHECK(esp_netif_dhcps_get_status(ap, &dhcp_status));
        if (dhcp_status == ESP_NETIF_DHCP_STARTED) break;
        vTaskDelay(pdMS_TO_TICKS(10));
    }
    if (dhcp_status != ESP_NETIF_DHCP_STARTED) return ESP_ERR_TIMEOUT;
    httpd_config_t http = HTTPD_DEFAULT_CONFIG(); http.stack_size = 8192;
    http.max_uri_handlers = 12; http.max_open_sockets = 5; http.lru_purge_enable = true;
    http.recv_wait_timeout = 2; http.send_wait_timeout = 2;
    httpd_handle_t server = NULL; r = httpd_start(&server, &http); if (r != ESP_OK) return r;
    const char *paths[] = {"/", "/style.css", "/app.js", "/decoder.js", "/decoder_reference.json"};
    for (int i = 0; i < 5; i++) {
        httpd_uri_t uri = {.uri = paths[i], .method = HTTP_GET, .handler = asset_handler};
        ESP_ERROR_CHECK(httpd_register_uri_handler(server, &uri));
    }
    httpd_uri_t endpoints[] = {
        {.uri="/api/state", .method=HTTP_GET, .handler=state_handler},
        {.uri="/api/info", .method=HTTP_GET, .handler=state_handler},
        {.uri="/api/frames", .method=HTTP_GET, .handler=frames_handler},
        {.uri="/api/command", .method=HTTP_POST, .handler=command_handler},
        {.uri="/api/mark", .method=HTTP_POST, .handler=mark_handler}
    };
    for (int i = 0; i < sizeof(endpoints)/sizeof(endpoints[0]); i++) ESP_ERROR_CHECK(httpd_register_uri_handler(server, &endpoints[i]));
    ESP_ERROR_CHECK(httpd_register_err_handler(server, HTTPD_404_NOT_FOUND, not_found));
    if (xTaskCreate(dns_task, "portal_dns", 4096, NULL, 2, NULL) != pdPASS) return ESP_ERR_NO_MEM;
    portENTER_CRITICAL(&net_lock); net.ready = 1; portEXIT_CRITICAL(&net_lock);
    return ESP_OK;
}
