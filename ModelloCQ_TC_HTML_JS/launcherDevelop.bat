@echo off
chcp 65001 >nul
title CQ CT HTML - Launcher

:: === CONFIGURAZIONE ===
set PORT=3032
set SERVER=server.js
set BROWSER=msedge.exe

:: === AVVIO SERVER BUN ===
echo Avvio del server RECISTIAMO...
start "" /B bun run %SERVER%

:: === ATTENDI CHE IL SERVER SIA PRONTO ===
timeout /t 2 /nobreak >nul

:: === APRI EDGE ===
echo Apertura browser...
start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\%BROWSER%" http://localhost:%PORT%

echo Server in esecuzione su http://localhost:%PORT%
echo Chiudi questa finestra per arrestare il server.
echo.

:: === TIENI APERTO IL PROCESSO (blocca la finestra) ===
pause >nul