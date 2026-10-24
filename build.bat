@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\pio_windows.ps1" -Action build
exit /b %errorlevel%
