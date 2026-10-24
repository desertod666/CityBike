BafangReader 0.3.0 adds marked recording and bitrate search to the Windows application.

- Default recording starts with Add mark and stops CAN after 30/60 seconds or manual Stop. A new mark resets the timer; continuous recording remains selectable.
- Persistent opt-in checkbox queues completed captures for automatic private HTTPS upload. Offline/restart resume, SHA-256, 2 MiB chunks, original local logs retained. Upload credentials and a permanent server endpoint must be provisioned separately; no shared secret ships in the executable.
- Finite listen-only bitrate search shows frames/errors per speed, selects only one qualifying candidate and leaves CAN stopped. Silence produces no detection.
- Includes a separate bounded private receiver for a Linux server; it exposes no log-reading endpoint.
- Fixes desktop log information layout and keeps recording controls near the action marker.

Builds and synthetic tests pass; COM9 stand tests verify 30-second auto-stop, manual stop and no false detection on a disconnected bus. Real bicycle bitrate, reception under load and SYM compatibility remain unconfirmed. Automatic recording/upload features are Windows-only; the embedded Wi-Fi panel remains a bounded manual preview. No CAN transmission or Bafang settings/flashing.
