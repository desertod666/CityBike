BafangReader 0.2.2 improves the first Wi-Fi and Windows release.

- Closing the last desktop dashboard tab stops CAN, closes logs and exits the process after a reload grace period. A heartbeat timeout handles browser crashes; firmware writes finish before exit.
- ESP-IDF service logs use bounded typed JSON messages through the single USB writer; they cannot interleave with CAN/STATUS records.
- Capture recovers a valid framed JSON suffix after a truncated legacy service-log prefix while preserving original wire bytes and a resync event.
- Scan lists every COM port without opening devices. One native ESP32 USB candidate is selected automatically; multiple ESP32 devices require a manual choice. Other ports remain informational.
- Capture files and the serial port are closed even if writing a log fails (for example, a full disk).
- Includes the verified DHCP fix for the open ESP32 Wi-Fi access point.
- Adds offline Wi-Fi dashboard, Windows raw USB/CAN capture, action marks, GitHub version checks and SHA256-verified program/ESP32 USB updates.

CAN starts stopped and supports listen-only only. No CAN transmission, Bafang parameter writes or Bafang firmware flashing. Actual bicycle bitrate and SYM compatibility are unconfirmed. Browser preview is bounded, and maximum CAN-load/disconnect testing remains pending.

Unpack BafangReader-Windows-x64.zip and run BafangReader.exe. Capture needs no internet. Downloads/updates need internet. Before updating ESP32 firmware, disconnect CANH/CANL from the bicycle.
