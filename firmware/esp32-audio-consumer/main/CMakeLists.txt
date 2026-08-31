# The production bridge does not link cue assets or semantic DSP. main.c is
# retained as a transition fallback but is intentionally not part of this
# image; cue model changes therefore do not require an ESP32 flash.
set(FNAF2_AUDIO_SOURCES "bridge.c")

idf_component_register(
    SRCS ${FNAF2_AUDIO_SOURCES}
    REQUIRES bt nvs_flash esp_wifi esp_event esp_netif esp_coex
    INCLUDE_DIRS "."
)
