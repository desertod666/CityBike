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
#include "esp_heap_caps.h"
#include "esp_app_desc.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "lwip/sockets.h"
#include "lwip/inet.h"
#include "cJSON.h"
#include "reader.h"
#include "web_server.h"
#include "web_stream_payload.h"

#define REPO "desertod666/CityBike"
#define DOWNLOAD "https://github.com/" REPO "/releases/latest/download/BafangReader-Windows-x64.zip"
#define RELEASE "https://github.com/" REPO "/releases/latest"
static reader_network_t net;
static portMUX_TYPE net_lock = portMUX_INITIALIZER_UNLOCKED;
static char control_owner[33];
static int64_t control_until;

#define PORTAL_ASSETS(X) \
    X("/", offline_index_html, "text/html; charset=utf-8") \
    X("/offline.css", offline_css, "text/css; charset=utf-8") \
    X("/offline.js", offline_js, "application/javascript; charset=utf-8") \
    X("/offline-i18n.js", offline_i18n_js, "application/javascript; charset=utf-8") \
    X("/preferences.js", preferences_js, "application/javascript; charset=utf-8") \
    X("/decoder.js", decoder_js, "application/javascript; charset=utf-8") \
    X("/decoder_reference.json", decoder_reference_json, "application/json") \
    X("/bafang-battery.js", bafang_battery_js, "application/javascript; charset=utf-8") \
    X("/can-live.js", can_live_js, "application/javascript; charset=utf-8") \
    X("/can-live.css", can_live_css, "text/css; charset=utf-8") \
    X("/spard-can.js", spard_can_js, "application/javascript; charset=utf-8") \
    X("/spard-information.js", spard_information_js, "application/javascript; charset=utf-8") \
    X("/kolumbus-logo.svg", kolumbus_logo_svg, "image/svg+xml") \
    X("/icon.svg", icon_svg, "image/svg+xml")
#define DECLARE_ASSET(path, symbol, mime) \
    extern const char symbol##_start[] asm("_binary_" #symbol "_start"); \
    extern const char symbol##_end[] asm("_binary_" #symbol "_end");
PORTAL_ASSETS(DECLARE_ASSET)
#undef DECLARE_ASSET

typedef struct {const char *path, *start, *end, *type;} portal_asset_t;
#define ASSET_ENTRY(path, symbol, mime) {path, symbol##_start, symbol##_end, mime},
static const portal_asset_t portal_assets[] = {PORTAL_ASSETS(ASSET_ENTRY)};
#undef ASSET_ENTRY

void web_network_snapshot(reader_network_t *out) {
    portENTER_CRITICAL(&net_lock); *out = net; portEXIT_CRITICAL(&net_lock);
}

static bool valid_ssid(const char *ssid) {
    if (!ssid || !ssid[0] || strlen(ssid) > 32) return false;
    for (const unsigned char *p = (const unsigned char *)ssid; *p; p++)
        if (!(isalnum(*p) || *p == '-' || *p == '_' || *p == ' ' || *p == '.')) return false;
    return true;
}

esp_err_t web_config_init(void) {
    uint8_t mac[6]; ESP_ERROR_CHECK(esp_read_mac(mac, ESP_MAC_WIFI_SOFTAP));
    snprintf(net.mac, sizeof(net.mac), MACSTR, MAC2STR(mac));
    snprintf(net.ssid, sizeof(net.ssid), "%s", "BySykkel-Reader0.2");
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
    /* STATUS is already JSON. Parsing and printing it again used many
       small heap allocations while Wi-Fi and BLE were competing for memory. */
    char status[READER_STATUS_SIZE] = {0}; reader_status_json(status, sizeof(status));
    size_t length = strnlen(status, sizeof(status));
    while (length && isspace((unsigned char)status[length - 1])) length--;
    if (!length || status[0] != '{' || status[length - 1] != '}')
        return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "status unavailable");
    reader_network_t n; web_network_snapshot(&n);
    httpd_resp_set_type(req, "application/json; charset=utf-8");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    esp_err_t result = httpd_resp_send_chunk(req, "{\"device\":", 10);
    if (result == ESP_OK) result = httpd_resp_send_chunk(req, status, length);
    if (result != ESP_OK) return result;
    /* SSIDs are restricted by valid_ssid(); MAC/version/URLs are generated by us. */
    /* send_chunk has consumed STATUS; reuse its buffer rather than grow the stack. */
    char *metadata = status;
    const size_t metadata_capacity = 1024;
    int used = snprintf(metadata, metadata_capacity,
        ",\"network\":{\"ssid\":\"%s\",\"ip\":\"192.168.4.1\",\"mac\":\"%s\","
        "\"saved_ssid\":\"%s\",\"channel\":%d,\"saved_channel\":%d,\"clients\":%d,\"open\":true,\"internet\":false},"
        "\"connection\":{\"transport\":\"wifi\",\"connected\":true},"
        "\"app\":{\"version\":\"%s\",\"repository\":\"" REPO "\","
        "\"download_url\":\"" DOWNLOAD "\",\"release_url\":\"" RELEASE "\",\"desktop\":false}}",
        n.ssid, n.mac, n.saved_ssid, n.channel, n.saved_channel, n.clients,
        esp_app_get_description()->version);
    /* Headers are already sent: close an incomplete response on a bounds failure. */
    if (used < 0 || (size_t)used >= metadata_capacity) return ESP_FAIL;
    result = httpd_resp_send_chunk(req, metadata, used);
    if (result == ESP_OK) result = httpd_resp_send_chunk(req, NULL, 0);
    return result;
}

static esp_err_t health_handler(httpd_req_t *req) {
    /* Small allocation-free endpoint also works if the full UI fails to load. */
    reader_network_t n; web_network_snapshot(&n);
    char json[384];
    int used = snprintf(json, sizeof(json),
        "{\"product\":\"BafangReader\",\"version\":\"%s\",\"boot\":\"%s\","
        "\"ip\":\"192.168.4.1\",\"ssid\":\"%s\",\"ap_mac\":\"%s\",\"wifi_ready\":%s,\"wifi_clients\":%d,"
        "\"heap_free\":%u,\"heap_minimum\":%u,\"heap_largest\":%u}",
        esp_app_get_description()->version, reader_boot(), n.ssid, n.mac, n.ready ? "true" : "false", n.clients,
        (unsigned)esp_get_free_heap_size(), (unsigned)esp_get_minimum_free_heap_size(),
        (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
    if (used < 0 || (size_t)used >= sizeof(json)) return ESP_FAIL;
    httpd_resp_set_type(req, "application/json; charset=utf-8");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    return httpd_resp_send(req, json, used);
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
    char token[33] = {0};
    httpd_req_get_hdr_value_str(req, "X-Reader-Session", token, sizeof(token));
    char identity[18] = {0};
    if (httpd_req_get_hdr_value_str(req, "X-Reader-Identity", identity, sizeof(identity)) == ESP_OK && strcmp(identity, net.mac)) {
        cJSON_Delete(body); return result_send(req, false, "reader identity changed");
    }
    bool changing = cJSON_IsString(command) && (!strncmp(command->valuestring, "START ", 6) || !strcmp(command->valuestring, "STOP"));
    portENTER_CRITICAL(&net_lock);
    bool busy = control_owner[0] && strcmp(control_owner, token);
    portEXIT_CRITICAL(&net_lock);
    if (changing && busy) snprintf(error, sizeof(error), "CAN is owned by another browser session");
    else if (cJSON_IsString(command) && strlen(command->valuestring) < 80) {
        bool starting = !strncmp(command->valuestring, "START ", 6);
        if (starting && strlen(token) != 32) snprintf(error, sizeof(error), "browser session token required");
        else {
            ok = reader_command(command->valuestring, error, sizeof(error));
            if (ok && changing) {
                if (starting) { char guard_error[120]; reader_command("GUARD OFF", guard_error, sizeof(guard_error)); }
                portENTER_CRITICAL(&net_lock);
                snprintf(control_owner, sizeof(control_owner), "%s", starting ? token : "");
                control_until = esp_timer_get_time() + 10000000;
                portEXIT_CRITICAL(&net_lock);
            }
        }
    }
    else snprintf(error, sizeof(error), "invalid command");
    cJSON_Delete(body); return result_send(req, ok, error);
}

static esp_err_t lease_handler(httpd_req_t *req) {
    cJSON *body = read_body(req);
    cJSON *token = body ? cJSON_GetObjectItem(body, "token") : NULL;
    bool valid = false;
    if (cJSON_IsString(token)) {
        portENTER_CRITICAL(&net_lock);
        valid = control_owner[0] && !strcmp(control_owner, token->valuestring);
        if (valid) control_until = esp_timer_get_time() + 10000000;
        portEXIT_CRITICAL(&net_lock);
    }
    cJSON_Delete(body);
    return result_send(req, valid, valid ? "" : "not the capture owner");
}

static esp_err_t release_handler(httpd_req_t *req) {
    if (req->content_len <= 0 || req->content_len > 100) return result_send(req, false, "invalid release");
    char data[101]; int got = 0;
    while (got < req->content_len) { int n = httpd_req_recv(req, data + got, req->content_len - got); if (n <= 0) return ESP_FAIL; got += n; }
    data[got] = 0;
    cJSON *body = cJSON_Parse(data), *token = body ? cJSON_GetObjectItem(body, "token") : NULL;
    bool own = false;
    if (cJSON_IsString(token)) { portENTER_CRITICAL(&net_lock); own = control_owner[0] && !strcmp(control_owner, token->valuestring); if (own) control_owner[0] = 0; portEXIT_CRITICAL(&net_lock); }
    cJSON_Delete(body); char error[120] = {0};
    if (own) reader_command("STOP", error, sizeof(error));
    return result_send(req, own, own ? error : "not the capture owner");
}

static void lease_guard_task(void *arg) {
    while (true) {
        portENTER_CRITICAL(&net_lock);
        bool expired = control_owner[0] && esp_timer_get_time() > control_until;
        if (expired) control_owner[0] = 0;
        portEXIT_CRITICAL(&net_lock);
        if (expired) { char error[120]; reader_command("STOP", error, sizeof(error)); }
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

static int stream_fragment(void *context, const char *data, size_t length, bool first, bool final) {
    httpd_ws_frame_t frame = {.type = first ? HTTPD_WS_TYPE_TEXT : HTTPD_WS_TYPE_CONTINUE,
        .payload = (uint8_t *)data, .len = length, .fragmented = true, .final = final};
    return httpd_ws_send_frame(context, &frame);
}

static esp_err_t stream_handler(httpd_req_t *req) {
    if (req->method == HTTP_GET) return ESP_OK;
    char input[97] = {0}; httpd_ws_frame_t packet = {0};
    esp_err_t r = httpd_ws_recv_frame(req, &packet, 0);
    if (r != ESP_OK || packet.len > 96 || packet.type != HTTPD_WS_TYPE_TEXT) return ESP_FAIL;
    packet.payload = (uint8_t *)input;
    if (httpd_ws_recv_frame(req, &packet, packet.len) != ESP_OK) return ESP_FAIL;
    cJSON *body = cJSON_Parse(input), *after_json = body ? cJSON_GetObjectItem(body, "after") : NULL;
    if (!cJSON_IsNumber(after_json) || after_json->valuedouble < 0 || after_json->valuedouble > 9007199254740991.0) { cJSON_Delete(body); return ESP_FAIL; }
    uint64_t after = (uint64_t)after_json->valuedouble; cJSON_Delete(body);
    frame_t *frames = calloc(64, sizeof(frame_t));
    if (!frames) return ESP_ERR_NO_MEM;
    uint64_t latest, oldest; size_t count = reader_frames(after, frames, 64, &latest, &oldest);
    uint64_t missed = oldest && after < oldest - 1 ? oldest - after - 1 : 0;
    char header[256];
    int used = snprintf(header, sizeof(header), "{\"boot\":\"%s\",\"latest\":%" PRIu64 ",\"oldest\":%" PRIu64 ",\"missed\":%" PRIu64 ",\"frames\":[", reader_boot(), latest, oldest, missed);
    if (used < 0 || (size_t)used >= sizeof(header)) { free(frames); return ESP_FAIL; }
    r = reader_web_stream_frames(stream_fragment, req, header, used, frames, count);
    free(frames); return r;
}

static esp_err_t mark_handler(httpd_req_t *req) {
    cJSON *body = read_body(req);
    cJSON *action = body ? cJSON_GetObjectItemCaseSensitive(body, "action") : NULL;
    if (!cJSON_IsString(action) || strlen(action->valuestring) > 160) { cJSON_Delete(body); return result_send(req, false, "invalid mark"); }
    cJSON_Delete(body);
    cJSON *r = cJSON_CreateObject(); cJSON_AddBoolToObject(r, "ok", true); cJSON_AddNumberToObject(r, "t_us", esp_timer_get_time());
    return json_send(req, r); // Browser keeps marks alongside its bounded preview export.
}

extern const char kolumbus_logo_start[] asm("_binary_kolumbus_logo_svg_start");
extern const char kolumbus_logo_end[] asm("_binary_kolumbus_logo_svg_end");
static esp_err_t asset_handler(httpd_req_t *req) {
    for (size_t i = 0; i < sizeof(portal_assets)/sizeof(portal_assets[0]); i++) {
        const portal_asset_t *asset = &portal_assets[i];
        if (strcmp(req->uri, asset->path)) continue;
        httpd_resp_set_type(req, asset->type);
        httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
        httpd_resp_set_hdr(req, "X-Content-Type-Options", "nosniff");
        return httpd_resp_send(req, asset->start, asset->end - asset->start);
    }
    return httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "asset not found");
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
    http.max_uri_handlers = 52; http.max_open_sockets = 5; http.lru_purge_enable = true;
    http.recv_wait_timeout = 2; http.send_wait_timeout = 2;
    httpd_handle_t server = NULL; r = httpd_start(&server, &http); if (r != ESP_OK) return r;
    for (size_t i = 0; i < sizeof(portal_assets)/sizeof(portal_assets[0]); i++) {
        httpd_uri_t uri = {.uri = portal_assets[i].path, .method = HTTP_GET, .handler = asset_handler};
        ESP_ERROR_CHECK(httpd_register_uri_handler(server, &uri));
    }
    httpd_uri_t endpoints[] = {
        {.uri="/api/health", .method=HTTP_GET, .handler=health_handler},
        {.uri="/api/state", .method=HTTP_GET, .handler=state_handler},
        {.uri="/api/info", .method=HTTP_GET, .handler=state_handler},
        {.uri="/api/frames", .method=HTTP_GET, .handler=frames_handler},
        {.uri="/api/command", .method=HTTP_POST, .handler=command_handler},
        {.uri="/api/mark", .method=HTTP_POST, .handler=mark_handler}
    };
    for (int i = 0; i < sizeof(endpoints)/sizeof(endpoints[0]); i++) ESP_ERROR_CHECK(httpd_register_uri_handler(server, &endpoints[i]));
    const httpd_uri_t stream = {.uri="/api/stream",.method=HTTP_GET,.handler=stream_handler,.is_websocket=true};
    const httpd_uri_t lease = {.uri="/api/lease",.method=HTTP_POST,.handler=lease_handler};
    const httpd_uri_t release = {.uri="/api/release",.method=HTTP_POST,.handler=release_handler};
    ESP_ERROR_CHECK(httpd_register_uri_handler(server, &stream));
    ESP_ERROR_CHECK(httpd_register_uri_handler(server, &lease));
    ESP_ERROR_CHECK(httpd_register_uri_handler(server, &release));
    ESP_ERROR_CHECK(httpd_register_err_handler(server, HTTPD_404_NOT_FOUND, not_found));
    if (xTaskCreate(dns_task, "portal_dns", 4096, NULL, 2, NULL) != pdPASS) return ESP_ERR_NO_MEM;
    if (xTaskCreate(lease_guard_task, "wifi_guard", 4096, NULL, 2, NULL) != pdPASS) return ESP_ERR_NO_MEM;
    portENTER_CRITICAL(&net_lock); net.ready = 1; portEXIT_CRITICAL(&net_lock);
    return ESP_OK;
}
