/*
 * FNaF 2 external audio consumer, bench firmware.
 *
 * The ESP32 is an A2DP Classic sink.  The Bluetooth stack decodes SBC to
 * signed 16-bit PCM and calls a small callback for each decoded buffer.  We
 * reduce that stream to bounded health facts and print only fact-message-v1
 * JSON lines on UART0.
 *
 * This firmware intentionally does not emit cue-* facts.  The ESP32 transport
 * and detector still need an independent latency/calibration run before an
 * audio observation can influence a controller.
 */

#include <inttypes.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"

#include "esp_a2dp_api.h"
#include "esp_bt.h"
#include "esp_bt_device.h"
#include "esp_bt_main.h"
#include "esp_err.h"
#include "esp_gap_bt_api.h"
#include "esp_log.h"
#include "esp_event.h"
#include "esp_netif.h"
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

/* Until a receiver-specific trace exists, keep observations broad. */
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

static int64_t monotonic_ms(void)
{
    return esp_timer_get_time() / 1000;
}

static void publish_line(const char *line)
{
    printf("%s\n", line);
    fflush(stdout);

    if (s_udp_socket >= 0) {
        sendto(s_udp_socket, line, strlen(line), 0,
               (const struct sockaddr *)&s_udp_destination,
               sizeof(s_udp_destination));
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

static void a2dp_data_callback(const uint8_t *buf, uint32_t len)
{
    if (buf == NULL || len < sizeof(int16_t)) {
        return;
    }

    const uint32_t sample_count = len / sizeof(int16_t);
    const int16_t *samples = (const int16_t *)buf;
    uint64_t sum_squares = 0;
    uint16_t peak = 0;

    for (uint32_t i = 0; i < sample_count; i++) {
        const int32_t sample = samples[i];
        const uint32_t magnitude = (uint32_t)(sample < 0 ? -sample : sample);
        sum_squares += (uint64_t)magnitude * (uint64_t)magnitude;
        if (magnitude > peak) {
            peak = magnitude;
        }
    }

    portENTER_CRITICAL(&s_stats_mux);
    s_sum_squares += sum_squares;
    s_sample_count += sample_count;
    if (peak > s_peak) {
        s_peak = peak;
    }
    portEXIT_CRITICAL(&s_stats_mux);
}

static void a2dp_callback(esp_a2d_cb_event_t event, esp_a2d_cb_param_t *param)
{
    switch (event) {
    case ESP_A2D_CONNECTION_STATE_EVT:
        portENTER_CRITICAL(&s_stats_mux);
        s_connected = param->conn_stat.state == ESP_A2D_CONNECTION_STATE_CONNECTED;
        if (!s_connected) {
            s_streaming = false;
        }
        portEXIT_CRITICAL(&s_stats_mux);
        break;

    case ESP_A2D_AUDIO_STATE_EVT:
        portENTER_CRITICAL(&s_stats_mux);
        s_streaming = param->audio_stat.state == ESP_A2D_AUDIO_STATE_STARTED;
        portEXIT_CRITICAL(&s_stats_mux);
        break;

    default:
        break;
    }
}

static void gap_callback(esp_bt_gap_cb_event_t event, esp_bt_gap_cb_param_t *param)
{
    switch (event) {
    case ESP_BT_GAP_CFM_REQ_EVT:
        /* Headless bench receiver: accept SSP confirmation automatically. */
        esp_bt_gap_ssp_confirm_reply(param->cfm_req.bda, true);
        break;
    default:
        break;
    }
}

static void telemetry_task(void *arg)
{
    (void)arg;

    for (;;) {
        uint64_t sum_squares;
        uint32_t sample_count;
        uint16_t peak;
        bool connected;
        bool streaming;

        vTaskDelay(pdMS_TO_TICKS(1000));

        portENTER_CRITICAL(&s_stats_mux);
        sum_squares = s_sum_squares;
        sample_count = s_sample_count;
        peak = s_peak;
        connected = s_connected;
        streaming = s_streaming;
        s_sum_squares = 0;
        s_sample_count = 0;
        s_peak = 0;
        portEXIT_CRITICAL(&s_stats_mux);

        if (connected) {
            emit_observed("audio-route", "true", 1.0f);
        } else {
            emit_unknown("audio-route", "a2dp-disconnected");
        }

        if (sample_count != 0) {
            const float rms = sqrtf((float)sum_squares / (float)sample_count) / 32768.0f;
            const float peak_value = (float)peak / 32768.0f;
            char value[32];
            snprintf(value, sizeof(value), "%.6f", rms);
            emit_observed("audio-rms", value, 1.0f);
            snprintf(value, sizeof(value), "%.6f", peak_value);
            emit_observed("audio-peak", value, 1.0f);
        } else {
            emit_unknown("audio-rms", streaming ? "no-pcm" : "audio-not-started");
            emit_unknown("audio-peak", streaming ? "no-pcm" : "audio-not-started");
        }
    }
}

static void bluetooth_start(void)
{
    esp_err_t err = esp_bt_controller_mem_release(ESP_BT_MODE_BLE);
    ESP_ERROR_CHECK(err);

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

    s_udp_socket = socket(AF_INET, SOCK_DGRAM, IPPROTO_IP);
    if (s_udp_socket < 0) {
        return;
    }
    int broadcast = 1;
    setsockopt(s_udp_socket, SOL_SOCKET, SO_BROADCAST,
               &broadcast, sizeof(broadcast));
    memset(&s_udp_destination, 0, sizeof(s_udp_destination));
    s_udp_destination.sin_family = AF_INET;
    s_udp_destination.sin_port = htons(FACT_UDP_PORT);
    s_udp_destination.sin_addr.s_addr = inet_addr("192.168.4.255");
}

void app_main(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    /* Keep UART output machine-readable; the facts are the diagnostic stream. */
    esp_log_level_set("*", ESP_LOG_NONE);
    wifi_start();
    bluetooth_start();
    xTaskCreate(telemetry_task, "telemetry", 4096, NULL, 5, NULL);
}
