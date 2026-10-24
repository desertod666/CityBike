idf_component_register(SRCS "main.c" "web_server.c" INCLUDE_DIRS "."
    REQUIRES driver esp_driver_usb_serial_jtag esp_driver_gpio esp_timer esp_system
    esp_wifi esp_event esp_netif esp_http_server nvs_flash json lwip
    EMBED_FILES "../web/index.html" "../web/style.css" "../web/app.js" "../web/decoder.js" "../web/decoder_reference.json")
