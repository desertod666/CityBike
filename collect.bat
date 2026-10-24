@echo off
setlocal
set "READER_PY=%~dp0.venv\Scripts\python.exe"
if not exist "%READER_PY%" set "READER_PY=%USERPROFILE%\.platformio\penv\Scripts\python.exe"
if not exist "%READER_PY%" (
  echo Run setup_pc.bat first.
  exit /b 2
)
"%READER_PY%" "%~dp0pc\collector.py" %*
exit /b %errorlevel%
