@echo off
setlocal

if not exist "%~dp0index.html" (
    echo Could not find index.html next to run.bat.
    pause
    exit /b 1
)

start "" "%~dp0index.html"
exit /b 0
