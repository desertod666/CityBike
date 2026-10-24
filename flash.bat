@echo off
if "%~1"=="" (
  echo Usage: flash.bat COM9
  echo Target ESP32-C3 must be disconnected from bicycle CAN.
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\pio_windows.ps1" -Action upload -Port "%~1"
exit /b %errorlevel%
