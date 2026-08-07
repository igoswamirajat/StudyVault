@echo off
setlocal

cd /d "%~dp0"
title StudyVault Launcher

echo.
echo [1/3] Stopping existing app on port 8080...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8080 .*LISTENING"') do (
  taskkill /PID %%P /F /T >nul 2>&1
)

echo [2/3] Building StudyVault...
set "NITRO_PRESET=node-server"
call npm run build
set "NITRO_PRESET="
if errorlevel 1 (
  echo.
  echo Build failed. App was not started.
  pause
  exit /b 1
)

if not exist ".output\server\index.mjs" (
  echo.
  echo Build completed, but production server was not found.
  pause
  exit /b 1
)

echo [3/3] Starting built app on http://localhost:8080...
start "StudyVault Server" /D "%~dp0" cmd /k "set PORT=8080&& set HOST=0.0.0.0&& node .output\server\index.mjs"
timeout /t 5 /nobreak >nul
start "" "http://localhost:8080"

echo StudyVault is running.
endlocal
