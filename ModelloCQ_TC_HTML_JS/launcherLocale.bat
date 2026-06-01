@echo off
title TC QC Server - Bun Launcher
color 0A

REM =========================================================
REM  TC QC Launcher
REM  Avvio automatico server Bun + apertura Edge
REM  Ottimizzato per PC lenti / rete lenta
REM =========================================================

cd /d "%~dp0"

echo.
echo ============================================
echo      TC QC SERVER - AVVIO IN CORSO
echo ============================================
echo.

REM ---------------------------------------------------------
REM Controllo presenza bun.exe
REM ---------------------------------------------------------
if not exist "bun.exe" (
    echo [ERRORE] bun.exe non trovato nella cartella corrente.
    echo.
    pause
    exit /b
)

REM ---------------------------------------------------------
REM Controllo presenza server.js
REM ---------------------------------------------------------
if not exist "server.js" (
    echo [ERRORE] server.js non trovato.
    echo.
    pause
    exit /b
)

REM ---------------------------------------------------------
REM Avvio server Bun in nuova finestra
REM ---------------------------------------------------------
echo [INFO] Avvio server Bun...
start "TC QC SERVER" /MIN cmd /c bun.exe run server.js

echo.
echo [INFO] Attendo che localhost:3131 sia pronta...
echo.

REM ---------------------------------------------------------
REM WAIT LOOP
REM Aspetta fino a quando il server risponde
REM ---------------------------------------------------------

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

echo [WAIT] Server non ancora pronto... tentativo %COUNT%/%MAXTRIES%

if %COUNT% GEQ %MAXTRIES% (
    echo.
    echo [ERRORE] Timeout avvio server.
    echo Controllare la console Bun.
    echo.
    pause
    exit /b
)

timeout /t 2 /nobreak >nul
goto WAITLOOP

:READY

echo.
echo [OK] Server pronto!
echo [INFO] Apertura Microsoft Edge...
echo.

REM ---------------------------------------------------------
REM Apertura Edge
REM ---------------------------------------------------------

start msedge "%URL%"

echo.
echo ============================================
echo       TC QC SERVER AVVIATO
echo ============================================
echo.

exit