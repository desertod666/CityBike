@echo off
setlocal
set "READER_PY=%~dp0.venv\Scripts\python.exe"
if not exist "%READER_PY%" set "READER_PY=%USERPROFILE%\.platformio\penv\Scripts\python.exe"
"%READER_PY%" "%~dp0pc\desktop.py" %*
exit /b %errorlevel%
