BafangReader 0.2.0 adds an offline Wi-Fi dashboard and a portable Windows USB capture application.

- ESP32-C3 open access point, captive-portal discovery and local dashboard at http://192.168.4.1.
- Live device state, bounded raw-frame preview, five unconfirmed SYM decoders, action marks and reader settings.
- Windows capture preserves every USB byte read, all raw frames including unknown IDs/RTR, JSONL, CSV and action marks.
- Public GitHub version checks, SHA256-verified program downloads and ESP32-C3 firmware updates over USB.
- CAN starts stopped and only supports listen-only. No CAN transmission, Bafang parameter writes or Bafang firmware flashing.

Actual bus bitrate and compatibility with a specific Bafang controller remain unconfirmed. Bounded browser preview is not a complete CAN archive. Full-load CAN/USB/Wi-Fi and physical disconnect tests are still required.

Download and unpack BafangReader-Windows-x64.zip, then run BafangReader.exe. The application opens a local browser dashboard. Capture works without internet; downloads and version checks require internet. Before updating ESP32 firmware, disconnect CANH/CANL from the bicycle.
