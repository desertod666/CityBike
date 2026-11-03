"""Reject the archived root firmware before any old application can compile."""
raise RuntimeError('Use the current reader/ project: python -m platformio run -d reader -e esp32c3, or build.bat')
