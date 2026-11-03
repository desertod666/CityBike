idf_component_register(SRCS "main.c" "web_server.c" "error_probe.c" "rx_readback.c" "ble_remote.c" INCLUDE_DIRS "."
    REQUIRES driver hal esp_hw_support esp_driver_usb_serial_jtag esp_driver_gpio esp_driver_rmt esp_timer esp_system esp_app_format
    esp_wifi esp_event esp_netif esp_http_server nvs_flash json lwip bt
    EMBED_FILES "../web/offline-index.html" "../web/offline.css" "../web/offline.js" "../web/offline-i18n.js" "../web/preferences.js" "../web/decoder.js" "../web/decoder_reference.json" "../web/bafang-battery.js" "../web/can-live.js" "../web/can-live.css" "../web/spard-can.js" "../web/spard-information.js" "../web/kolumbus-logo.svg" "../web/icon.svg")

target_link_options(${COMPONENT_LIB} INTERFACE "-Wl,--wrap=twai_hal_get_events")

# Fail closed if the private HAL used by the event observer differs from the tested SDK.
file(SHA256 "${IDF_PATH}/components/hal/twai_hal_sja1000.c" READER_HAL_SHA)
if(NOT READER_HAL_SHA STREQUAL "49c4115cf8bf8bdd041135da703ec48cdc3c12392f63ecf6169381e01f59c344")
    message(FATAL_ERROR "Reader ECC observer requires the verified pinned IDF HAL")
endif()
