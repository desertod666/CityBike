@echo off
setlocal
if not exist "%~dp0.packaging\Scripts\python.exe" (
  "%USERPROFILE%\.platformio\penv\Scripts\python.exe" -m venv "%~dp0.packaging"
  if errorlevel 1 exit /b 1
)
"%~dp0.packaging\Scripts\python.exe" -m pip install -r "%~dp0pc\requirements-build.txt"
if errorlevel 1 exit /b 1
"%~dp0.packaging\Scripts\python.exe" "%~dp0scripts\package_release.py" --exe-only
exit /b %errorlevel%
