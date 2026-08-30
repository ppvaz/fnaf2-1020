idf_component_register(
    SRCS "main.c"
    REQUIRES bt nvs_flash esp_wifi esp_event esp_netif
    INCLUDE_DIRS "."
)
