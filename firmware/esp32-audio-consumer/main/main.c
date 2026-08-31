/*
 * FNaF 2 external audio consumer, bench firmware.
 *
 * The ESP32 is an A2DP Classic sink.  The Bluetooth stack decodes SBC to
 * signed 16-bit PCM and calls a small callback for each decoded buffer.  We
 * reduce that stream to bounded health facts and run numeric cue detectors for
 * the embedded assets. The phase detector is shadow-only: it reports a
 * timestamped numeric cue and fitted 500 ms clock, but never drives controls.
 *
 * Semantic cue names stay on the host. The wire event carries only cueId=33;
 * an independent latency/calibration run is still required before an audio
 * observation can influence a controller.
 */

#include <inttypes.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <fcntl.h>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
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

#include "cue_assets.h"

#define DEVICE_NAME "FNAF2 Audio Consumer"
#define FACT_SOURCE "esp32-audio-consumer"
#define FACT_PROFILE "g56-esp32-a2dp-v0-uncalibrated"
#define WIFI_AP_SSID "FNAF2-AUDIO"
#define WIFI_AP_PASSWORD "fnaf2-audio"
#define FACT_UDP_PORT 49709
#define PCM_UDP_PORT 49710
#define PCM_PACKET_MAGIC UINT32_C(0x46325043) /* ASCII F2PC, little-endian */
#define PCM_PACKET_VERSION 1
#define PCM_PACKET_MAX_BYTES 1400
#define PCM_PACKET_MAX_PAYLOAD 1200

/* Numeric asset 33 is the sourced 500 ms winding-clock cue. */
#define PHASE_CUE_ID 33
#define PHASE_RATE_HZ 4000U
#define PHASE_HOP_SAMPLES 16U
#define PHASE_TICK_PERIOD_US UINT64_C(500000)
#define PHASE_HISTORY 12U
#define PHASE_REFRACTORY_US UINT64_C(250000)
#define PHASE_MATCH_THRESHOLD 0.78
#define PHASE_MAX_TEMPLATE_SAMPLES 1600U
#define PHASE_INPUT_BUFFER 64U
#define PHASE_RESAMPLE_FRACTION_BITS 20U
#define BANG_CUE_ID 17
#define BANG_MATCH_THRESHOLD 0.78
#define BANG_REFRACTORY_US UINT64_C(250000)
#define LOCAL_MATCH_THRESHOLD 0.78
#define LOCAL_MATCH_REFRACTORY_US UINT64_C(300000)
#define LOCAL_MATCH_HOP_SAMPLES 16U
#define LOCAL_MATCH_MAX_ASSETS 16U
#define LOCAL_MATCH_BLOCK_SAMPLES 64U
#define LOCAL_MATCH_QUEUE_LENGTH 8U

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
static volatile uint32_t s_sample_rate_hz = 44100;
static uint32_t s_pcm_sequence;
static QueueHandle_t s_phase_event_queue;

typedef struct {
    uint16_t cue_id;
    uint64_t t_capture_us;
    uint32_t tick_index;
    uint16_t score_milli;
    uint32_t period_ms;
    uint32_t phase_modulo_ms;
    uint32_t uncertainty_ms;
    uint8_t state; /* 0=UNLOCKED, 1=ACQUIRING, 2=LOCKED */
} phase_event_t;

static const int16_t *s_phase_template;
static uint16_t s_phase_template_count;
static int16_t s_phase_ring[PHASE_MAX_TEMPLATE_SAMPLES];
static uint16_t s_phase_ring_write;
static uint32_t s_phase_ring_count;
static uint32_t s_phase_sample_count;
static uint32_t s_phase_resample_rate;
static int16_t s_phase_input_buffer[PHASE_INPUT_BUFFER];
static uint32_t s_phase_input_read;
static uint32_t s_phase_input_write;
static uint32_t s_phase_input_count;
static uint64_t s_phase_resample_position;
static uint64_t s_phase_resample_step;
static uint64_t s_phase_last_tick_us;
static uint32_t s_phase_next_index;
static uint64_t s_phase_times[PHASE_HISTORY];
static uint32_t s_phase_indices[PHASE_HISTORY];
static uint32_t s_phase_history_count;
static const int16_t *s_bang_template;
static uint16_t s_bang_template_count;
static int16_t s_bang_ring[PHASE_MAX_TEMPLATE_SAMPLES];
static uint16_t s_bang_ring_write;
static uint32_t s_bang_ring_count;
static uint32_t s_bang_sample_count;
static uint64_t s_bang_last_us;

typedef struct {
    uint16_t cue_id;
    const int16_t *template;
    uint16_t template_count;
    uint64_t last_us;
} local_matcher_t;

static local_matcher_t s_local_matchers[LOCAL_MATCH_MAX_ASSETS];
static uint16_t s_local_matcher_count;
static int16_t s_local_ring[PHASE_MAX_TEMPLATE_SAMPLES];
static uint16_t s_local_ring_write;
static uint32_t s_local_ring_count;
static uint32_t s_local_sample_count;
static QueueHandle_t s_local_sample_queue;
static uint32_t s_local_generation;
static uint32_t s_local_task_generation;
static volatile uint32_t s_local_dropped_blocks;

typedef struct {
    uint16_t count;
    uint32_t generation;
    uint64_t first_capture_us;
    int16_t samples[LOCAL_MATCH_BLOCK_SAMPLES];
} local_sample_block_t;

static local_sample_block_t s_local_pending_block;

/* The wire format is little-endian, matching the ESP32 and the host parser. */
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

static const char *phase_state_name(uint8_t state)
{
    switch (state) {
    case 2:
        return "LOCKED";
    case 1:
        return "ACQUIRING";
    default:
        return "UNLOCKED";
    }
}

static void emit_phase_event(const phase_event_t *event)
{
    char line[640];
    if (event->cue_id != PHASE_CUE_ID) {
        snprintf(line, sizeof(line),
                 "{\"schema\":\"esp32-cue-detection-v1\","
                 "\"seq\":%" PRIu32 ",\"cueId\":%u,"
                 "\"confidence\":%.6f,\"source\":\"%s\","
                 "\"calibrationProfile\":\"%s\","
                 "\"t_capture_us\":%" PRIu64 ",\"sampleRateHz\":%u}",
                 s_sequence++, event->cue_id, event->score_milli / 1000.0,
                 FACT_SOURCE, FACT_PROFILE, event->t_capture_us,
                 PHASE_RATE_HZ);
        publish_line(line);
        return;
    }
    snprintf(line, sizeof(line),
             "{\"schema\":\"esp32-phase-clock-v1\","
             "\"seq\":%" PRIu32 ",\"cueId\":%d,"
             "\"state\":\"%s\",\"source\":\"%s\","
             "\"calibrationProfile\":\"%s\","
             "\"confidence\":%.6f,\"t_capture_us\":%" PRIu64
             ",\"tickIndex\":%" PRIu32 ",\"periodMs\":%" PRIu32
             ",\"phaseModuloMs\":%" PRIu32 ",\"uncertaintyMs\":%" PRIu32
             ",\"sampleRateHz\":%u}",
             s_sequence++, event->cue_id, phase_state_name(event->state),
             FACT_SOURCE, FACT_PROFILE, event->score_milli / 1000.0,
             event->t_capture_us,
             event->tick_index, event->period_ms, event->phase_modulo_ms,
             event->uncertainty_ms, PHASE_RATE_HZ);
    publish_line(line);
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
    if (mcc->cie.sbc[0] & 0x80) {
        return 16000;
    }
    if (mcc->cie.sbc[0] & 0x40) {
        return 32000;
    }
    if (mcc->cie.sbc[0] & 0x20) {
        return 44100;
    }
    if (mcc->cie.sbc[0] & 0x10) {
        return 48000;
    }
    return 0;
}

static void send_pcm(const uint8_t *buf, uint32_t len)
{
    if (s_udp_socket < 0 || buf == NULL || len < 4) {
        return;
    }

    struct sockaddr_in destination = s_udp_destination;
    destination.sin_port = htons(PCM_UDP_PORT);
    const uint32_t sample_rate = s_sample_rate_hz == 0 ? 44100 : s_sample_rate_hz;
    const int64_t callback_us = esp_timer_get_time();
    uint32_t offset = 0;

    while (offset < len) {
        uint32_t payload = len - offset;
        if (payload > PCM_PACKET_MAX_PAYLOAD) {
            payload = PCM_PACKET_MAX_PAYLOAD;
        }
        /* Preserve complete stereo int16 frames in every datagram. */
        payload -= payload % 4;
        if (payload == 0) {
            break;
        }

        uint8_t packet[PCM_PACKET_MAX_BYTES];
        pcm_packet_header_t header = {
            .magic = PCM_PACKET_MAGIC,
            .version = PCM_PACKET_VERSION,
            .channels = 2,
            .sample_format = 1,
            .reserved = 0,
            .sample_rate_hz = sample_rate,
            .sequence = s_pcm_sequence++,
            .t_capture_us = (uint64_t)(callback_us +
                (int64_t)((uint64_t)(offset / 4) * 1000000ULL / sample_rate)),
            .payload_bytes = (uint16_t)payload,
            .reserved2 = 0,
        };
        memcpy(packet, &header, sizeof(header));
        memcpy(packet + sizeof(header), buf + offset, payload);
        (void)sendto(s_udp_socket, packet, sizeof(header) + payload,
                     MSG_DONTWAIT, (const struct sockaddr *)&destination,
                     sizeof(destination));
        offset += payload;
    }
}

static int16_t cue_ring_at(const int16_t *ring, uint16_t ring_capacity,
                           uint16_t ring_write, uint16_t template_count,
                           uint32_t offset)
{
    /* ring_write points at the next slot. The matching window is the most
     * recent template_count samples, even when several templates share the
     * common max-sized ring. */
    const uint32_t first = (ring_write + ring_capacity - template_count) %
                           ring_capacity;
    const uint32_t index = (first + offset) % ring_capacity;
    return ring[index];
}

static double cue_match_score(const int16_t *ring, uint16_t ring_write,
                              const int16_t *template, uint16_t template_count)
{
    const uint32_t count = template_count;
    int64_t window_sum = 0;
    int64_t template_sum = 0;

    for (uint32_t index = 0; index < count; index++) {
        window_sum += cue_ring_at(ring, template_count, ring_write,
                                  template_count, index);
        template_sum += template[index];
    }

    const double window_mean = (double)window_sum / (double)count;
    const double template_mean = (double)template_sum / (double)count;
    double dot = 0.0;
    double window_energy = 0.0;
    double template_energy = 0.0;
    for (uint32_t index = 0; index < count; index++) {
        const double left = (double)cue_ring_at(
            ring, template_count, ring_write, template_count, index) -
            window_mean;
        const double right = (double)template[index] - template_mean;
        dot += left * right;
        window_energy += left * left;
        template_energy += right * right;
    }
    if (window_energy <= 0.0 || template_energy <= 0.0) {
        return 0.0;
    }
    return dot / sqrt(window_energy * template_energy);
}

static double local_match_score(const local_matcher_t *matcher)
{
    return cue_match_score(s_local_ring, s_local_ring_write,
                           matcher->template, matcher->template_count);
}

static void local_observe(uint64_t t_capture_us,
                          local_matcher_t *matcher, double score)
{
    if (score < LOCAL_MATCH_THRESHOLD ||
        (matcher->last_us != 0 &&
         t_capture_us - matcher->last_us < LOCAL_MATCH_REFRACTORY_US)) {
        return;
    }

    /* This is deliberately a numeric event. Semantic role/context belongs to
     * the APK, which can reject a generic sample such as menu BGM using its
     * visual state. */
    const uint16_t score_milli = (uint16_t)(score >= 1.0
        ? 1000 : score * 1000.0);
    phase_event_t event = {
        .cue_id = matcher->cue_id,
        .t_capture_us = t_capture_us,
        .tick_index = 0,
        .score_milli = score_milli,
        .period_ms = 0,
        .phase_modulo_ms = 0,
        .uncertainty_ms = 0,
        .state = 0,
    };
    matcher->last_us = t_capture_us;
    if (s_phase_event_queue != NULL) {
        (void)xQueueSend(s_phase_event_queue, &event, 0);
    }
}

/* The A2DP callback only copies a bounded 4 kHz block. Full matching runs in
 * its own FreeRTOS task so a burst of 14 generic templates cannot stall SBC
 * delivery or the two low-latency filters. */
static void local_queue_sample(int16_t sample, uint64_t t_capture_us)
{
    if (s_local_sample_queue == NULL) {
        return;
    }
    if (s_local_pending_block.count == 0) {
        s_local_pending_block.first_capture_us = t_capture_us;
        s_local_pending_block.generation = s_local_generation;
    }
    s_local_pending_block.samples[s_local_pending_block.count++] = sample;
    if (s_local_pending_block.count < LOCAL_MATCH_BLOCK_SAMPLES) {
        return;
    }
    if (xQueueSend(s_local_sample_queue, &s_local_pending_block, 0) != pdTRUE) {
        s_local_dropped_blocks++;
    }
    s_local_pending_block.count = 0;
}

static void local_feed_sample(int16_t sample, uint64_t t_capture_us)
{
    if (s_local_matcher_count == 0) {
        return;
    }
    s_local_ring[s_local_ring_write] = sample;
    s_local_ring_write = (s_local_ring_write + 1) % PHASE_MAX_TEMPLATE_SAMPLES;
    if (s_local_ring_count < PHASE_MAX_TEMPLATE_SAMPLES) {
        s_local_ring_count++;
    }
    s_local_sample_count++;
    if (s_local_sample_count % LOCAL_MATCH_HOP_SAMPLES != 0) {
        return;
    }
    for (uint16_t index = 0; index < s_local_matcher_count; index++) {
        local_matcher_t *matcher = &s_local_matchers[index];
        if (s_local_ring_count < matcher->template_count) {
            continue;
        }
        local_observe(t_capture_us -
                      (uint64_t)(matcher->template_count - 1) *
                      1000000ULL / PHASE_RATE_HZ,
                      matcher, local_match_score(matcher));
    }
}

static void local_match_reset(uint32_t generation)
{
    s_local_ring_write = 0;
    s_local_ring_count = 0;
    s_local_sample_count = 0;
    s_local_task_generation = generation;
    for (uint16_t index = 0; index < s_local_matcher_count; index++) {
        s_local_matchers[index].last_us = 0;
    }
}

static void local_match_task(void *arg)
{
    (void)arg;
    local_sample_block_t block;
    local_match_reset(s_local_generation);
    for (;;) {
        if (xQueueReceive(s_local_sample_queue, &block, portMAX_DELAY) != pdTRUE) {
            continue;
        }
        if (block.generation != s_local_task_generation) {
            local_match_reset(block.generation);
        }
        for (uint16_t index = 0; index < block.count; index++) {
            local_feed_sample(block.samples[index],
                              block.first_capture_us +
                              (uint64_t)index * 1000000ULL / PHASE_RATE_HZ);
        }
    }
}

static void phase_observe(uint64_t t_capture_us, double score)
{
    if (score < PHASE_MATCH_THRESHOLD ||
        (s_phase_last_tick_us != 0 &&
         t_capture_us - s_phase_last_tick_us < PHASE_REFRACTORY_US)) {
        return;
    }

    uint32_t index = s_phase_next_index;
    if (s_phase_history_count != 0) {
        const uint64_t gap = t_capture_us -
                             s_phase_times[s_phase_history_count - 1];
        uint32_t skipped = (uint32_t)((gap + PHASE_TICK_PERIOD_US / 2) /
                                      PHASE_TICK_PERIOD_US);
        if (skipped == 0) {
            skipped = 1;
        }
        index = s_phase_next_index + skipped;
    }
    s_phase_next_index = index;
    s_phase_last_tick_us = t_capture_us;

    if (s_phase_history_count == PHASE_HISTORY) {
        memmove(s_phase_times, s_phase_times + 1,
                (PHASE_HISTORY - 1) * sizeof(s_phase_times[0]));
        memmove(s_phase_indices, s_phase_indices + 1,
                (PHASE_HISTORY - 1) * sizeof(s_phase_indices[0]));
        s_phase_history_count--;
    }
    s_phase_times[s_phase_history_count] = t_capture_us;
    s_phase_indices[s_phase_history_count] = index;
    s_phase_history_count++;

    double period_us = 0.0;
    double intercept_us = (double)t_capture_us;
    double rms_us = 0.0;
    if (s_phase_history_count >= 2) {
        double mean_x = 0.0;
        double mean_y = 0.0;
        for (uint32_t i = 0; i < s_phase_history_count; i++) {
            mean_x += s_phase_indices[i];
            mean_y += (double)s_phase_times[i];
        }
        mean_x /= s_phase_history_count;
        mean_y /= s_phase_history_count;
        double xx = 0.0;
        double xy = 0.0;
        for (uint32_t i = 0; i < s_phase_history_count; i++) {
            const double x = (double)s_phase_indices[i] - mean_x;
            const double y = (double)s_phase_times[i] - mean_y;
            xx += x * x;
            xy += x * y;
        }
        if (xx > 0.0) {
            period_us = xy / xx;
            intercept_us = mean_y - period_us * mean_x;
            double square_error = 0.0;
            for (uint32_t i = 0; i < s_phase_history_count; i++) {
                const double expected = intercept_us +
                    period_us * s_phase_indices[i];
                const double residual = (double)s_phase_times[i] - expected;
                square_error += residual * residual;
            }
            rms_us = sqrt(square_error / s_phase_history_count);
        }
    }

    phase_event_t event = {
        .cue_id = PHASE_CUE_ID,
        .t_capture_us = t_capture_us,
        .tick_index = index,
        .score_milli = (uint16_t)(score >= 1.0 ? 1000 : score * 1000.0),
        .period_ms = period_us > 0.0 ? (uint32_t)(period_us / 1000.0 + 0.5) : 0,
        .phase_modulo_ms = 0,
        .uncertainty_ms = (uint32_t)(rms_us / 1000.0 + 0.5),
        .state = 1,
    };
    if (period_us > 0.0) {
        double modulo = fmod(intercept_us, period_us);
        if (modulo < 0.0) {
            modulo += period_us;
        }
        event.phase_modulo_ms = (uint32_t)(modulo / 1000.0 + 0.5);
    }
    if (s_phase_history_count >= 6 &&
        fabs(period_us - (double)PHASE_TICK_PERIOD_US) <= 100000.0 &&
        rms_us <= 100000.0) {
        event.state = 2;
    }
    if (s_phase_event_queue != NULL) {
        (void)xQueueSend(s_phase_event_queue, &event, 0);
    }
}

static void bang_observe(uint64_t t_capture_us, double score)
{
    if (score < BANG_MATCH_THRESHOLD ||
        (s_bang_last_us != 0 &&
         t_capture_us - s_bang_last_us < BANG_REFRACTORY_US)) {
        return;
    }
    s_bang_last_us = t_capture_us;
    phase_event_t event = {
        .cue_id = BANG_CUE_ID,
        .t_capture_us = t_capture_us,
        .tick_index = 0,
        .score_milli = (uint16_t)(score >= 1.0 ? 1000 : score * 1000.0),
        .period_ms = 0,
        .phase_modulo_ms = 0,
        .uncertainty_ms = 0,
        .state = 0,
    };
    if (s_phase_event_queue != NULL) {
        (void)xQueueSend(s_phase_event_queue, &event, 0);
    }
}

static void bang_feed_sample(int16_t sample, uint64_t t_capture_us);

static void phase_feed_sample(int16_t sample, uint64_t t_capture_us)
{
    if (s_phase_template == NULL || s_phase_template_count == 0) {
        return;
    }
    s_phase_ring[s_phase_ring_write] = sample;
    s_phase_ring_write = (s_phase_ring_write + 1) % s_phase_template_count;
    if (s_phase_ring_count < s_phase_template_count) {
        s_phase_ring_count++;
    }
    s_phase_sample_count++;
    if (s_phase_ring_count == s_phase_template_count &&
        s_phase_sample_count % PHASE_HOP_SAMPLES == 0) {
        phase_observe(t_capture_us -
                      (uint64_t)(s_phase_template_count - 1) *
                      1000000ULL / PHASE_RATE_HZ,
                      cue_match_score(s_phase_ring, s_phase_ring_write,
                                      s_phase_template,
                                      s_phase_template_count));
    }
}

static void bang_feed_sample(int16_t sample, uint64_t t_capture_us)
{
    if (s_bang_template == NULL || s_bang_template_count == 0) {
        return;
    }
    s_bang_ring[s_bang_ring_write] = sample;
    s_bang_ring_write = (s_bang_ring_write + 1) % s_bang_template_count;
    if (s_bang_ring_count < s_bang_template_count) {
        s_bang_ring_count++;
    }
    s_bang_sample_count++;
    if (s_bang_ring_count == s_bang_template_count &&
        s_bang_sample_count % PHASE_HOP_SAMPLES == 0) {
        bang_observe(t_capture_us -
                     (uint64_t)(s_bang_template_count - 1) *
                     1000000ULL / PHASE_RATE_HZ,
                     cue_match_score(s_bang_ring, s_bang_ring_write,
                                     s_bang_template, s_bang_template_count));
    }
}

static void phase_feed_input(int16_t sample, uint64_t t_capture_us,
                             uint32_t sample_rate_hz)
{
    if (sample_rate_hz == 0) {
        sample_rate_hz = 44100;
    }
    if (s_phase_resample_rate != sample_rate_hz) {
        s_phase_resample_rate = sample_rate_hz;
        s_phase_input_read = 0;
        s_phase_input_write = 0;
        s_phase_input_count = 0;
        s_phase_resample_position = 0;
        s_phase_resample_step = ((uint64_t)sample_rate_hz <<
                                 PHASE_RESAMPLE_FRACTION_BITS) /
                                PHASE_RATE_HZ;
        s_phase_ring_write = 0;
        s_phase_ring_count = 0;
        s_phase_sample_count = 0;
        s_phase_last_tick_us = 0;
        s_phase_next_index = 0;
        s_phase_history_count = 0;
        s_bang_ring_write = 0;
        s_bang_ring_count = 0;
        s_bang_sample_count = 0;
        s_bang_last_us = 0;
        s_local_generation++;
        s_local_pending_block.count = 0;
    }

    if (s_phase_input_count == PHASE_INPUT_BUFFER) {
        /* A stalled callback must not corrupt the detector's ring. */
        s_phase_input_read = (s_phase_input_read + 1) % PHASE_INPUT_BUFFER;
        s_phase_input_count--;
    }
    s_phase_input_buffer[s_phase_input_write] = sample;
    s_phase_input_write = (s_phase_input_write + 1) % PHASE_INPUT_BUFFER;
    s_phase_input_count++;

    while (s_phase_input_count >=
           (s_phase_resample_position >> PHASE_RESAMPLE_FRACTION_BITS) + 2) {
        const uint32_t index = s_phase_resample_position >>
                               PHASE_RESAMPLE_FRACTION_BITS;
        const uint32_t fraction = s_phase_resample_position &
                                  ((1U << PHASE_RESAMPLE_FRACTION_BITS) - 1U);
        const uint32_t left_index = (s_phase_input_read + index) %
                                    PHASE_INPUT_BUFFER;
        const uint32_t right_index = (left_index + 1) % PHASE_INPUT_BUFFER;
        const int32_t left = s_phase_input_buffer[left_index];
        const int32_t right = s_phase_input_buffer[right_index];
        const int32_t interpolated = left + (int32_t)((
            (int64_t)(right - left) * fraction) >>
            PHASE_RESAMPLE_FRACTION_BITS);
        const uint32_t samples_after_left = s_phase_input_count - 1 - index;
        const uint64_t left_us = t_capture_us -
            (uint64_t)samples_after_left * 1000000ULL / sample_rate_hz;
        phase_feed_sample((int16_t)interpolated, left_us);
        bang_feed_sample((int16_t)interpolated, left_us);
        local_queue_sample((int16_t)interpolated, left_us);

        const uint32_t consumed = s_phase_resample_position >>
                                  PHASE_RESAMPLE_FRACTION_BITS;
        if (consumed != 0) {
            s_phase_input_read = (s_phase_input_read + consumed) %
                                 PHASE_INPUT_BUFFER;
            s_phase_input_count -= consumed;
            s_phase_resample_position &=
                (1ULL << PHASE_RESAMPLE_FRACTION_BITS) - 1ULL;
        }
        s_phase_resample_position += s_phase_resample_step;
    }
}

static void phase_detector_init(void)
{
    for (size_t index = 0; index < fnaf2_cue_asset_count; index++) {
        if (fnaf2_cue_assets[index].handle == PHASE_CUE_ID &&
            fnaf2_cue_assets[index].sample_count <= PHASE_MAX_TEMPLATE_SAMPLES) {
            s_phase_template = fnaf2_cue_assets[index].pcm;
            s_phase_template_count = fnaf2_cue_assets[index].sample_count;
        }
        if (fnaf2_cue_assets[index].handle == BANG_CUE_ID &&
            fnaf2_cue_assets[index].sample_count <= PHASE_MAX_TEMPLATE_SAMPLES) {
            s_bang_template = fnaf2_cue_assets[index].pcm;
            s_bang_template_count = fnaf2_cue_assets[index].sample_count;
        }
        if (fnaf2_cue_assets[index].handle != PHASE_CUE_ID &&
            fnaf2_cue_assets[index].handle != BANG_CUE_ID &&
            fnaf2_cue_assets[index].sample_count > 0 &&
            fnaf2_cue_assets[index].sample_count <= PHASE_MAX_TEMPLATE_SAMPLES &&
            s_local_matcher_count < LOCAL_MATCH_MAX_ASSETS) {
            local_matcher_t *matcher = &s_local_matchers[s_local_matcher_count++];
            matcher->cue_id = fnaf2_cue_assets[index].handle;
            matcher->template = fnaf2_cue_assets[index].pcm;
            matcher->template_count = fnaf2_cue_assets[index].sample_count;
            matcher->last_us = 0;
        }
    }
}

static void phase_event_task(void *arg)
{
    (void)arg;
    phase_event_t event;
    for (;;) {
        if (xQueueReceive(s_phase_event_queue, &event, portMAX_DELAY) == pdTRUE) {
            emit_phase_event(&event);
        }
    }
}

static void emit_asset_manifest(void)
{
    printf("{\"schema\":\"esp32-cue-assets-v1\",\"count\":%u,\"ids\":[",
           (unsigned)fnaf2_cue_asset_count);
    for (size_t index = 0; index < fnaf2_cue_asset_count; index++) {
        if (index != 0) {
            putchar(',');
        }
        printf("%u", (unsigned)fnaf2_cue_asset_handles[index]);
    }
    printf("],\"manifestSha256\":\"%s\"}\n",
           fnaf2_cue_asset_manifest_sha256);
    fflush(stdout);
}

static void a2dp_data_callback(const uint8_t *buf, uint32_t len)
{
    if (buf == NULL || len < sizeof(int16_t)) {
        return;
    }

    const uint32_t sample_count = len / sizeof(int16_t);
    const int16_t *samples = (const int16_t *)buf;
    const uint32_t sample_rate = s_sample_rate_hz == 0 ? 44100 : s_sample_rate_hz;
    const uint32_t frame_count = sample_count / 2;
    const uint64_t callback_us = esp_timer_get_time();
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

    for (uint32_t frame = 0; frame < frame_count; frame++) {
        const int32_t left = samples[frame * 2];
        const int32_t right = samples[frame * 2 + 1];
        const int16_t mono = (int16_t)((left + right) / 2);
        const uint64_t sample_us = callback_us +
            (uint64_t)frame * 1000000ULL / sample_rate;
        phase_feed_input(mono, sample_us, sample_rate);
    }

    /* The callback owns a transient buffer; send before it can be reused. */
    send_pcm(buf, sample_count * sizeof(int16_t));
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

    case ESP_A2D_AUDIO_CFG_EVT: {
        const uint32_t sample_rate = sbc_sample_rate(&param->audio_cfg.mcc);
        if (sample_rate != 0) {
            s_sample_rate_hz = sample_rate;
        }
        break;
    }

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
    /* Keep one slot for the phone's health-fact listener and one for the
     * host PCM authority.  A2DP remains independent of these Wi-Fi clients. */
    ap_cfg.ap.max_connection = 2;
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

    const int flags = fcntl(s_udp_socket, F_GETFL, 0);
    if (flags >= 0) {
        (void)fcntl(s_udp_socket, F_SETFL, flags | O_NONBLOCK);
    }
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
    phase_detector_init();
    /* Several numeric candidates may share one PCM window; keep the UART/Wi-Fi
     * publisher out of the A2DP callback without dropping a burst. */
    s_phase_event_queue = xQueueCreate(32, sizeof(phase_event_t));
    configASSERT(s_phase_event_queue != NULL);
    s_local_sample_queue = xQueueCreate(LOCAL_MATCH_QUEUE_LENGTH,
                                        sizeof(local_sample_block_t));
    configASSERT(s_local_sample_queue != NULL);
    xTaskCreate(phase_event_task, "phase-events", 4096, NULL, 5, NULL);
    xTaskCreate(local_match_task, "local-match", 8192, NULL, 4, NULL);
    wifi_start();
    bluetooth_start();
    emit_asset_manifest();
    xTaskCreate(telemetry_task, "telemetry", 4096, NULL, 5, NULL);
}
