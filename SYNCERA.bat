@echo off
title SYNCERA Launcher
cd /d "%~dp0"
echo.
echo  ========================================
echo    SYNCERA - AI Messenger
echo  ========================================
echo.

set PACKAGED_EXE=%~dp0dist-electron\win-unpacked\SYNCERA.exe

REM If SYNCERA is already running, just bring its window forward — don't relaunch
tasklist /FI "IMAGENAME eq SYNCERA.exe" 2>nul | find /I "SYNCERA.exe" >nul
if %errorlevel%==0 (
    echo SYNCERA already running. Bringing to front...
    powershell -NoProfile -Command "(Get-Process SYNCERA -ErrorAction SilentlyContinue | Select-Object -First 1) | ForEach-Object { (New-Object -ComObject WScript.Shell).AppActivate($_.Id) }"
    exit
)

REM Daily launcher uses the built dist app, not the Vite dev server.
REM This prevents blank windows caused by stale localhost/Vite processes.
if not exist "dist\index.html" (
    echo Building SYNCERA UI...
    call npm run vite:build
    if errorlevel 1 (
        echo ERROR: Build failed.
        pause
        exit /b 1
    )
)

echo Launching SYNCERA...
if exist "%PACKAGED_EXE%" (
    start "" "%PACKAGED_EXE%"
) else (
    set SYNCERA_USE_DIST=1
    start "" "node_modules\electron\dist\electron.exe" .
)
exit
