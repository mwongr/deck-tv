@echo off
title Deck TV
echo ========================================
echo         Starting Deck TV...
echo ========================================
echo.

cd /d "%~dp0"

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting development server...
echo.
echo Once started, open your browser to:
echo   Local:   http://localhost:38472

:: Get Local IP (Prioritize 192., 10., 172.)
for /f "usebackq tokens=*" %%a in (`powershell -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(192\.168|10\.|172\.)' } | Select-Object -ExpandProperty IPAddress | Select-Object -First 1"`) do set LOCAL_IP=%%a

if not defined LOCAL_IP (
    for /f "usebackq tokens=*" %%a in (`powershell -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.InterfaceAlias -notlike '*vEthernet*' } | Select-Object -ExpandProperty IPAddress | Select-Object -First 1"`) do set LOCAL_IP=%%a
)

if defined LOCAL_IP (
    echo   Network: http://%LOCAL_IP%:38472
)
echo.
echo Press Ctrl+C to stop the server.
echo ========================================
echo.

call npm run dev
pause
