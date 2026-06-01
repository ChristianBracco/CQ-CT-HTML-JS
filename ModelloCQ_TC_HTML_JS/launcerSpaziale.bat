```bat
@echo off
chcp 65001 >nul
title 🚀 TC QC SERVER - CHRISTIAN BRACCO EDITION 🚀
color 0A

REM =========================================================
REM   ████████╗ ██████╗      ██████╗  ██████╗
REM   ╚══██╔══╝██╔════╝     ██╔═══██╗██╔════╝
REM      ██║   ██║          ██║   ██║██║
REM      ██║   ██║          ██║▄▄ ██║██║
REM      ██║   ╚██████╗     ╚██████╔╝╚██████╗
REM      ╚═╝    ╚═════╝      ╚══▀▀═╝  ╚═════╝
REM
REM      QUALITY CONTROL SERVER LAUNCHER
REM =========================================================

pushd "%~dp0"

cls

echo.
echo [96m═══════════════════════════════════════════════════════════════[0m
echo [95m               🚀 TC QC SERVER LAUNCHER 🚀[0m
echo [96m═══════════════════════════════════════════════════════════════[0m
echo.
echo [93m   ░█▀▀░█░█░░░█▀▀░▀█▀░░░█▀▀░█▀█░█▀▄░█░█░█▀▀░█▀▄[0m
echo [93m   ░█░░░█▀█░░░█░░░░█░░░░█░░░█░█░█▀▄░█▀█░█▀▀░█▀▄[0m
echo [93m   ░▀▀▀░▀░▀░░░▀▀▀░▀▀▀░░░▀▀▀░▀▀▀░▀░▀░▀░▀░▀▀▀░▀░▀[0m
echo.
echo [92m                 Developed by Christian Bracco[0m
echo.
echo [94m   🏥 Sistema Controlli Qualita TC[0m
echo [94m   ⚡ Powered by Bun + SQLite + HTML5[0m
echo [94m   🌐 Auto Edge Launcher Enabled[0m
echo.
echo [96m═══════════════════════════════════════════════════════════════[0m
echo.

REM =========================================================
REM CHECK FILES
REM =========================================================

echo [93m[CHECK] Verifica componenti sistema...[0m
timeout /t 1 >nul

if not exist "bun.exe" (
    echo.
    echo [91m❌ ERRORE: bun.exe non trovato![0m
    echo.
    pause
    popd
    exit /b
)

echo [92m✔ bun.exe trovato[0m

if not exist "server.js" (
    echo.
    echo [91m❌ ERRORE: server.js non trovato![0m
    echo.
    pause
    popd
    exit /b
)

echo [92m✔ server.js trovato[0m

if not exist "index.html" (
    echo.
    echo [91m❌ ERRORE: index.html non trovato![0m
    echo.
    pause
    popd
    exit /b
)

echo [92m✔ index.html trovato[0m

echo.
echo [96m═══════════════════════════════════════════════════════════════[0m
echo.

REM =========================================================
REM START SERVER
REM =========================================================

echo [95m🚀 Avvio motore Bun...[0m
echo.

start "🏥 TC QC SERVER" /MIN cmd /k ^
"color 0B && title 🏥 TC QC SERVER && bun.exe run server.js"

timeout /t 2 >nul

REM =========================================================
REM WAIT SERVER READY
REM =========================================================

set URL=http://127.0.0.1:3131
set MAXTRIES=90
set /a COUNT=0

echo [93m⏳ Attendo inizializzazione localhost...[0m
echo.

:WAITLOOP

powershell -Command ^
"try { ^
  $r = Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2; ^
  if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } ^
} catch { exit 1 }"

if %ERRORLEVEL%==0 goto READY

set /a COUNT+=1

<nul set /p=[96m█[0m

if %COUNT% GEQ %MAXTRIES% (
    echo.
    echo.
    echo [91m❌ Timeout avvio server[0m
    echo.
    pause
    popd
    exit /b
)

timeout /t 1 /nobreak >nul
goto WAITLOOP

REM =========================================================
REM READY
REM =========================================================

:READY

echo.
echo.
echo [92m═══════════════════════════════════════════════════════════════[0m
echo [92m                    ✔ SERVER ONLINE ✔[0m
echo [92m═══════════════════════════════════════════════════════════════[0m
echo.

echo [96m🌐 Apertura Microsoft Edge...[0m
echo.

start msedge "%URL%"

timeout /t 1 >nul

cls

echo.
echo [92m██████████████████████████████████████████████████████████████[0m
echo [92m█                                                            █[0m
echo [92m█                🚀 TC QC SERVER ATTIVO 🚀                  █[0m
echo [92m█                                                            █[0m
echo [92m█               🌐 http://127.0.0.1:3131                    █[0m
echo [92m█                                                            █[0m
echo [92m█              🏥 Sistema pronto all'uso                    █[0m
echo [92m█                                                            █[0m
echo [92m██████████████████████████████████████████████████████████████[0m
echo.

echo [93m💡 Chiudere questa finestra NON arresta il server[0m
echo.

popd
exit
```
