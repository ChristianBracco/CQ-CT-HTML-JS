@echo off
title TC QC Server - Bun Launcher
color 0A

REM =========================================================
REM  SUPPORTO PERCORSI RETE (UNC)
REM =========================================================

pushd "%~dp0"

echo.
echo ============================================
echo      TC QC SERVER - AVVIO IN CORSO
echo ============================================
echo.

REM ---------------------------------------------------------
REM Controllo file necessari
REM ---------------------------------------------------------

if not exist "bun.exe" (
    echo [ERRORE] bun.exe non trovato.
    echo.
    pause
    popd
    exit /b
)

if not exist "server.js" (
    echo [ERRORE] server.js non trovato.
    echo.
    pause
    popd
    exit /b
)

REM ---------------------------------------------------------
REM Avvio server
REM ---------------------------------------------------------

echo [INFO] Avvio server Bun...

start "TC QC SERVER" /MIN cmd /c bun.exe run server.js

echo.
echo [INFO] Attendo che localhost:3131 sia pronta...
echo.

set URL=http://127.0.0.1:3131
set MAXTRIES=60
set /a COUNT=0

:WAITLOOP

powershell -Command ^
"try { ^
  $r = Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2; ^
  if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } ^
} catch { exit 1 }"

if %ERRORLEVEL%==0 goto READY

set /a COUNT+=1

echo [WAIT] Tentativo %COUNT%/%MAXTRIES%

if %COUNT% GEQ %MAXTRIES% (
    echo.
    echo [ERRORE] Timeout avvio server.
    echo.
    pause
    popd
    exit /b
)

timeout /t 2 /nobreak >nul
goto WAITLOOP

:READY

echo.
echo [OK] Server pronto
echo [INFO] Apertura Edge...
echo.

start msedge "%URL%"

echo.
echo ============================================
echo         SERVER AVVIATO
echo ============================================
echo.

popd
exit