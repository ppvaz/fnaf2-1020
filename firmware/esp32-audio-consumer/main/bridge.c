/*
 * FNaF 2 ESP32 audio bridge.
 *
 * The ESP32 is deliberately a transport appliance: Classic A2DP receives and
 * decodes the phone's SBC stream, then this file timestamps and forwards the
 * resulting stereo s16le PCM over the private Wi-Fi AP. Cue classification,
 * phase tracking and game context live in the phone-side AudioAnalyzer.
 *
 * main.c is retained as the transition fallback, but is not part of the
 * bridge build. No cue assets or semantic names are linked into this image.
 */

#include <fcntl.h>
#include <inttypes.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "nvs_flash.h"

#include "esp_a2dp_api.h"
#include "esp_bt.h"
#include "esp_bt_device.h"
#include "esp_bt_main.h"
#include "esp_coexist.h"
#include "esp_err.h"
#include "esp_gap_bt_api.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "esp_wifi.h"

#include "lwip/inet.h"
#include "lwip/sockets.h"

#define DEVICE_NAME "FNAF2 Audio Consumer"
#define FACT_SOURCE "esp32-audio-consumer"
#define FACT_PROFILE "g56-esp32-a2dp-v0-uncalibrated"
#define WIFI_AP_SSID "FNAF2-AUDIO"
#define WIFI_AP_PASSWORD "fnaf2-audio"
#define FACT_UDP_PORT 49709
#define PCM_UDP_PORT 49710
#define REGISTRATION_UDP_PORT 49711
#define REGISTRATION_MAGIC "F2PCM-REGISTER-v1"
#define PCM_PACKET_MAGIC UINT32_C(0x46325043) /* ASCII F2PC, little-endian */
#define PCM_PACKET_VERSION 1
#define PCM_PACKET_MAX_BYTES 1400
#define PCM_PACKET_MAX_PAYLOAD 1200
#define PCM_FORWARD_QUEUE_LENGTH 16
#define LATENCY_MIN_MS 0
#define LATENCY_MAX_MS 1000

static portMUX_TYPE s_stats_mux = portMUX_INITIALIZER_UNLOCKED;
static bool s_connected;
static bool s_streaming;
static uint32_t s_sequence;
static uint64_t s_sum_squares;
static uint32_t s_sample_count;
static uint16_t s_peak;
static int s_udp_socket = -1;
static struct sockaddr_in s_udp_destination;
static bool s_destination_valid;
static volatile uint32_t s_sample_rate_hz = 44100;
static uint32_t s_pcm_sequence;
static QueueHandle_t s_pcm_forward_queue;
static uint32_t s_pcm_queue_dropped;
static uint32_t s_pcm_send_errors;
static uint32_t s_pcm_sent_packets;
static uint32_t s_pcm_callbacks;
static uint32_t s_pcm_callback_bytes;
static uint32_t s_registration_count;
static uint32_t s_wifi_station_count;
static uint8_t s_a2dp_disconnect_reason;
static TaskHandle_t s_pcm_forward_task;
static TaskHandle_t s_registration_task;

typedef struct {
    uint16_t bytes;
    uint32_t sample_rate_hz;
    uint64_t t_capture_us;
    uint8_t data[PCM_PACKET_MAX_PAYLOAD];
} pcm_forward_block_t;

typedef struct __attribute__((packed)) {
    uint32_t magic;
    uint8_t version;
    uint8_t channels;
    uint8_t sample_format; /* 1 = signed 16-bit little-endian */
    uint8_t reserved;
    uint32_t sample_rate_hz;
    uint32_t sequence;
    uint64_t t_capture_us;
    uint16_t payload_bytes;
    uint16_t reserved2;
} pcm_packet_header_t;

_Static_assert(sizeof(pcm_packet_header_t) == 28,
               "unexpected PCM packet header size");

static int64_t monotonic_ms(void)
{
    return esp_timer_get_time() / 1000;
}

static bool copy_udp_destination(struct sockaddr_in *destination, int port)
{
    if (destination == NULL) return false;
    bool valid;
    portENTER_CRITICAL(&s_stats_mux);
    valid = s_destination_valid;
    if (valid) {
        *destination = s_udp_destination;
        destination->sin_port = htons(port);
    }
    portEXIT_CRITICAL(&s_stats_mux);
    return valid;
}

static void publish_line(const char *line)
{
    printf("%s\n", line);
    fflush(stdout);
    if (s_udp_socket >= 0) {
        struct sockaddr_in destination;
        if (copy_udp_destination(&destination, FACT_UDP_PORT)) {
            sendto(s_udp_socket, line, strlen(line), 0,
                   (const struct sockaddr *)&destination,
                   sizeof(destination));
        }
    }
}

static void emit_observed(const char *type, const char *value_json,
                          float confidence)
{
    char line[640];
    snprintf(line, sizeof(line),
             "{\"schema\":\"fact-message-v1\",\"seq\":%" PRIu32
             ",\"type\":\"%s\",\"state\":\"OBSERVED\","
             "\"confidence\":%.6f,\"source\":\"%s\","
             "\"calibrationProfile\":\"%s\",\"t_received\":%" PRId64
             ",\"latencyMin\":%d,\"latencyMax\":%d,\"value\":%s}",
             s_sequence++, type, confidence, FACT_SOURCE, FACT_PROFILE,
             monotonic_ms(), LATENCY_MIN_MS, LATENCY_MAX_MS, value_json);
    publish_line(line);
}

static void emit_unknown(const char *type, const char *reason)
{
    char line[640];
    snprintf(line, sizeof(line),
             "{\"schema\":\"fact-message-v1\",\"seq\":%" PRIu32
             ",\"type\":\"%s\",\"state\":\"UNKNOWN\","
             "\"confidence\":0.000000,\"source\":\"%s\","
             "\"calibrationProfile\":\"%s\",\"t_received\":%" PRId64
             ",\"latencyMin\":%d,\"latencyMax\":%d,"
             "\"reason\":\"%s\"}",
             s_sequence++, type, FACT_SOURCE, FACT_PROFILE, monotonic_ms(),
             LATENCY_MIN_MS, LATENCY_MAX_MS, reason);
    publish_line(line);
}

static uint32_t sbc_sample_rate(const esp_a2d_mcc_t *mcc)
{
    if (mcc == NULL || mcc->type != ESP_A2D_MCT_SBC) {
        return 0;
    }
    if (mcc->cie.sbc[0] & 0x80) return 16000;
    if (mcc->cie.sbc[0] & 0x40) return 32000;
    if (mcc->cie.sbc[0] & 0x20) return 44100;
    if (mcc->cie.sbc[0] & 0x10) return 48000;
    return 0;
}

static void send_pcm_block(const pcm_forward_block_t *block)
{
    if (s_udp_socket < 0 || block == NULL || block->bytes < 4) {
        return;
    }
    struct sockaddr_in destination;
    if (!copy_udp_destination(&destination, PCM_UDP_PORT)) return;
    const uint32_t sample_rate = block->sample_rate_hz == 0
        ? 44100 : block->sample_rate_hz;
    uint8_t packet[PCM_PACKET_MAX_BYTES];
    pcm_packet_header_t header = {
        .magic = PCM_PACKET_MAGIC,
        .version = PCM_PACKET_VERSION,
        .channels = 2,
        .sample_format = 1,
        .reserved = 0,
        .sample_rate_hz = sample_rate,
        .sequence = s_pcm_sequence,
        .t_capture_us = block->t_capture_us,
        .payload_bytes = block->bytes,
        .reserved2 = 0,
    };
    memcpy(packet, &header, sizeof(header));
    memcpy(packet + sizeof(header), block->data, block->bytes);
    const ssize_t sent = sendto(s_udp_socket, packet,
                                sizeof(header) + block->bytes,
                                MSG_DONTWAIT,
                                (const struct sockaddr *)&destination,
                                sizeof(destination));
    portENTER_CRITICAL(&s_stats_mux);
    if (sent == (ssize_t)(sizeof(header) + block->bytes)) {
        s_pcm_sequence++;
        s_pcm_sent_packets++;
    } else {
        s_pcm_send_errors++;
    }
    portEXIT_CRITICAL(&s_stats_mux);
}

static void pcm_forward_task(void *arg)
{
    (void)arg;
    pcm_forward_block_t block;
    for (;;) {
        if (xQueueReceive(s_pcm_forward_queue, &block, portMAX_DELAY) == pdTRUE) {
            send_pcm_block(&block);
        }
    }
}

static void registration_task(void *arg)
{
    (void)arg;
    uint8_t buffer[sizeof(REGISTRATION_MAGIC) - 1];
    for (;;) {
        struct sockaddr_in source;
        socklen_t source_length = sizeof(source);
        ssize_t received = recvfrom(s_udp_socket, buffer, sizeof(buffer),
                                     MSG_DONTWAIT,
                                     (struct sockaddr *)&source,
                                     &source_length);
        if (received == (ssize_t)sizeof(buffer)
                && memcmp(buffer, REGISTRATION_MAGIC, sizeof(buffer)) == 0
                && source.sin_family == AF_INET) {
            portENTER_CRITICAL(&s_stats_mux);
            s_udp_destination = source;
            s_destination_valid = true;
            s_registration_count++;
            portEXIT_CRITICAL(&s_stats_mux);
        }
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

static void enqueue_pcm(const uint8_t *buf, uint32_t len)
{
    if (s_pcm_forward_queue == NULL || buf == NULL || len < 4) {
        return;
    }
    const uint32_t sample_rate = s_sample_rate_hz == 0 ? 44100 : s_sample_rate_hz;
    const uint64_t callback_us = esp_timer_get_time();
    uint32_t offset = 0;
    while (offset < len) {
        uint32_t payload = len - offset;
        if (payload > PCM_PACKET_MAX_PAYLOAD) payload = PCM_PACKET_MAX_PAYLOAD;
        payload -= payload % 4;
        if (payload == 0) break;

        pcm_forward_block_t block = {
            .bytes = (uint16_t)payload,
            .sample_rate_hz = sample_rate,
            .t_capture_us = (uint64_t)(callback_us +
                (int64_t)((uint64_t)(offset / 4) * 1000000ULL / sample_rate)),
        };
        memcpy(block.data, buf + offset, payload);
        if (xQueueSend(s_pcm_forward_queue, &block, 0) != pdTRUE) {
            /* The bounded queue is the backpressure boundary. Report drops
             * explicitly; sequence gaps are reserved for network loss. */
            portENTER_CRITICAL(&s_stats_mux);
            s_pcm_queue_dropped++;
            portEXIT_CRITICAL(&s_stats_mux);
        }
        offset += payload;
    }
}

static void a2dp_data_callback(const uint8_t *buf, uint32_t len)
{
    if (buf == NULL || len < sizeof(int16_t)) return;
    const uint32_t sample_count = len / sizeof(int16_t);
    const int16_t *samples = (const int16_t *)buf;
    uint64_t sum_squares = 0;
    uint16_t peak = 0;
    for (uint32_t index = 0; index < sample_count; index++) {
        const int32_t sample = samples[index];
        const uint32_t magnitude = (uint32_t)(sample < 0 ? -sample : sample);
        sum_squares += (uint64_t)magnitude * magnitude;
        if (magnitude > peak) peak = magnitude;
    }
    portENTER_CRITICAL(&s_stats_mux);
    s_sum_squares += sum_squares;
    s_sample_count += sample_count;
    if (peak > s_peak) s_peak = peak;
    s_pcm_callbacks++;
    s_pcm_callback_bytes += sample_count * sizeof(int16_t);
    portEXIT_CRITICAL(&s_stats_mux);

    /* The callback owns a transient buffer. Copy into the bounded queue and
     * let the network task perform UDP I/O outside the Bluetooth callback. */
    enqueue_pcm(buf, sample_count * sizeof(int16_t));
}

static void a2dp_callback(esp_a2d_cb_event_t event, esp_a2d_cb_param_t *param)
{
    switch (event) {
    case ESP_A2D_CONNECTION_STATE_EVT:
        portENTER_CRITICAL(&s_stats_mux);
        s_connected = param->conn_stat.state == ESP_A2D_CONNECTION_STATE_CONNECTED;
        if (!s_connected) s_streaming = false;
        s_a2dp_disconnect_reason = s_connected ? 0 : param->conn_stat.disc_rsn;
        portEXIT_CRITICAL(&s_stats_mux);
        break;
    case ESP_A2D_AUDIO_STATE_EVT:
        portENTER_CRITICAL(&s_stats_mux);
        s_streaming = param->audio_stat.state == ESP_A2D_AUDIO_STATE_STARTED;
        portEXIT_CRITICAL(&s_stats_mux);
        break;
    case ESP_A2D_AUDIO_CFG_EVT: {
        const uint32_t rate = sbc_sample_rate(&param->audio_cfg.mcc);
        if (rate != 0) s_sample_rate_hz = rate;
        break;
    }
    default:
        break;
    }
}

static void wifi_event_callback(void *arg, esp_event_base_t event_base,
                                int32_t event_id, void *event_data)
{
    (void)arg;
    (void)event_base;
    (void)event_data;
    portENTER_CRITICAL(&s_stats_mux);
    if (event_id == WIFI_EVENT_AP_STACONNECTED) {
        s_wifi_station_count++;
    } else if (event_id == WIFI_EVENT_AP_STADISCONNECTED
               && s_wifi_station_count > 0) {
        s_wifi_station_count--;
    }
    portEXIT_CRITICAL(&s_stats_mux);
}

static void gap_callback(esp_bt_gap_cb_event_t event, esp_bt_gap_cb_param_t *param)
{
    if (event == ESP_BT_GAP_CFM_REQ_EVT) {
        esp_bt_gap_ssp_confirm_reply(param->cfm_req.bda, true);
    }
}

static void telemetry_task(void *arg)
{
    (void)arg;
    for (;;) {
        uint64_t sum_squares;
        uint32_t sample_count;
        uint16_t peak;
        uint32_t queue_dropped;
        uint32_t send_errors;
        uint32_t sent_packets;
        uint32_t pcm_callbacks;
        uint32_t pcm_callback_bytes;
        uint32_t registration_count;
        uint32_t wifi_station_count;
        uint8_t disconnect_reason;
        bool connected;
        bool streaming;
        bool destination_valid;
        vTaskDelay(pdMS_TO_TICKS(1000));
        portENTER_CRITICAL(&s_stats_mux);
        sum_squares = s_sum_squares;
        sample_count = s_sample_count;
        peak = s_peak;
        queue_dropped = s_pcm_queue_dropped;
        send_errors = s_pcm_send_errors;
        sent_packets = s_pcm_sent_packets;
        pcm_callbacks = s_pcm_callbacks;
        pcm_callback_bytes = s_pcm_callback_bytes;
        registration_count = s_registration_count;
        wifi_station_count = s_wifi_station_count;
        disconnect_reason = s_a2dp_disconnect_reason;
        connected = s_connected;
        streaming = s_streaming;
        destination_valid = s_destination_valid;
        s_sum_squares = 0;
        s_sample_count = 0;
        s_peak = 0;
        portEXIT_CRITICAL(&s_stats_mux);

        if (connected) emit_observed("audio-route", "true", 1.0f);
        else emit_unknown("audio-route", "a2dp-disconnected");
        if (sample_count != 0) {
            char value[32];
            snprintf(value, sizeof(value), "%.6f",
                     sqrtf((float)sum_squares / sample_count) / 32768.0f);
            emit_observed("audio-rms", value, 1.0f);
            snprintf(value, sizeof(value), "%.6f", (float)peak / 32768.0f);
            emit_observed("audio-peak", value, 1.0f);
        } else {
            emit_unknown("audio-rms", streaming ? "no-pcm" : "audio-not-started");
            emit_unknown("audio-peak", streaming ? "no-pcm" : "audio-not-started");
        }
        printf("{\"schema\":\"esp32-pcm-transport-v1\","
               "\"core\":%d,"
               "\"a2dpConnected\":%s,"
               "\"a2dpStreaming\":%s,"
               "\"a2dpDisconnectReason\":%u,"
               "\"wifiStations\":%" PRIu32 ","
               "\"destinationValid\":%s,"
               "\"registrations\":%" PRIu32 ","
               "\"pcmCallbacks\":%" PRIu32 ","
               "\"pcmCallbackBytes\":%" PRIu32 ","
               "\"sentPackets\":%" PRIu32 ","
               "\"queueDropped\":%" PRIu32 ","
               "\"sendErrors\":%" PRIu32 ","
               "\"queueDepth\":%u,"
               "\"freeHeap\":%u,"
               "\"minFreeHeap\":%u,"
               "\"pcmStackFree\":%u,"
               "\"registrationStackFree\":%u}\n",
               xPortGetCoreID(), connected ? "true" : "false",
               streaming ? "true" : "false", disconnect_reason,
               wifi_station_count, destination_valid ? "true" : "false",
               registration_count, pcm_callbacks, pcm_callback_bytes,
               sent_packets, queue_dropped, send_errors,
               (unsigned)uxQueueMessagesWaiting(s_pcm_forward_queue),
               (unsigned)esp_get_free_heap_size(),
               (unsigned)esp_get_minimum_free_heap_size(),
               (unsigned)uxTaskGetStackHighWaterMark(s_pcm_forward_task),
               (unsigned)uxTaskGetStackHighWaterMark(s_registration_task));
        fflush(stdout);
    }
}

static void bluetooth_start(void)
{
    ESP_ERROR_CHECK(esp_bt_controller_mem_release(ESP_BT_MODE_BLE));
    esp_bt_controller_config_t bt_cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_bt_controller_init(&bt_cfg));
    ESP_ERROR_CHECK(esp_bt_controller_enable(ESP_BT_MODE_CLASSIC_BT));
    ESP_ERROR_CHECK(esp_bluedroid_init());
    ESP_ERROR_CHECK(esp_bluedroid_enable());
    ESP_ERROR_CHECK(esp_bt_gap_register_callback(gap_callback));
    ESP_ERROR_CHECK(esp_bt_gap_set_device_name(DEVICE_NAME));
    ESP_ERROR_CHECK(esp_a2d_register_callback(a2dp_callback));
    ESP_ERROR_CHECK(esp_a2d_sink_init());
    ESP_ERROR_CHECK(esp_a2d_sink_register_data_callback(a2dp_data_callback));
    ESP_ERROR_CHECK(esp_bt_gap_set_scan_mode(
        ESP_BT_CONNECTABLE, ESP_BT_GENERAL_DISCOVERABLE));
}

static void wifi_start(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_ap();
    wifi_init_config_t wifi_cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&wifi_cfg));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                               wifi_event_callback, NULL));
    ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
    wifi_config_t ap_cfg = {0};
    memcpy(ap_cfg.ap.ssid, WIFI_AP_SSID, sizeof(WIFI_AP_SSID) - 1);
    memcpy(ap_cfg.ap.password, WIFI_AP_PASSWORD, sizeof(WIFI_AP_PASSWORD) - 1);
    ap_cfg.ap.ssid_len = sizeof(WIFI_AP_SSID) - 1;
    ap_cfg.ap.channel = 1;
    ap_cfg.ap.max_connection = 1;
    ap_cfg.ap.authmode = WIFI_AUTH_WPA2_PSK;
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap_cfg));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_ERROR_CHECK(esp_coex_preference_set(ESP_COEX_PREFER_BALANCE));

    s_udp_socket = socket(AF_INET, SOCK_DGRAM, IPPROTO_IP);
    if (s_udp_socket < 0) return;
    int send_buffer_bytes = 16 * 1024;
    (void)setsockopt(s_udp_socket, SOL_SOCKET, SO_SNDBUF,
                     &send_buffer_bytes, sizeof(send_buffer_bytes));
    struct sockaddr_in registration_address = {0};
    registration_address.sin_family = AF_INET;
    registration_address.sin_port = htons(REGISTRATION_UDP_PORT);
    registration_address.sin_addr.s_addr = htonl(INADDR_ANY);
    if (bind(s_udp_socket, (struct sockaddr *)&registration_address,
             sizeof(registration_address)) < 0) {
        close(s_udp_socket);
        s_udp_socket = -1;
        return;
    }
    memset(&s_udp_destination, 0, sizeof(s_udp_destination));
    s_udp_destination.sin_family = AF_INET;
    s_udp_destination.sin_port = htons(FACT_UDP_PORT);
    /* The phone registers its current AP address on REGISTRATION_UDP_PORT.
     * Do not assume a particular DHCP lease; some Android Wi-Fi stacks/AP
     * drivers filter IPv4 broadcasts from a soft AP. */
    s_udp_destination.sin_addr.s_addr = 0;
    s_destination_valid = false;
    const int flags = fcntl(s_udp_socket, F_GETFL, 0);
    if (flags >= 0) (void)fcntl(s_udp_socket, F_SETFL, flags | O_NONBLOCK);
}

void app_main(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);
    esp_log_level_set("*", ESP_LOG_NONE);
    wifi_start();
    s_pcm_forward_queue = xQueueCreate(PCM_FORWARD_QUEUE_LENGTH,
                                       sizeof(pcm_forward_block_t));
    configASSERT(s_pcm_forward_queue != NULL);
    xTaskCreatePinnedToCore(pcm_forward_task, "pcm-forward", 5120, NULL,
                            6, &s_pcm_forward_task, 1);
    xTaskCreatePinnedToCore(registration_task, "udp-registration", 3072, NULL,
                            5, &s_registration_task, 1);
    bluetooth_start();
    printf("{\"schema\":\"esp32-audio-bridge-v1\",\"source\":\"%s\","
           "\"pcmPort\":%d,\"factPort\":%d,\"detector\":\"phone\","
           "\"cores\":%d,\"appCore\":%d,\"resetReason\":%d,"
           "\"coexistence\":\"balanced\"}\n",
           FACT_SOURCE, PCM_UDP_PORT, FACT_UDP_PORT,
           CONFIG_FREERTOS_NUMBER_OF_CORES, xPortGetCoreID(),
           (int)esp_reset_reason());
    fflush(stdout);
    xTaskCreatePinnedToCore(telemetry_task, "telemetry", 4096, NULL, 5,
                            NULL, 1);
}
