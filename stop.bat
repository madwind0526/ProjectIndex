@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem Ports this app owns (see C:\Claude\PORTS.md). Only node.exe windows titled "Project Index" are
rem killed by name, so other node apps (including the projects launched from here) are untouched.
echo Stopping Project Index...

for %%R in (4319 5189) do (
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%%R " ^| findstr "LISTENING"') do (
        echo Stopping process on port %%R ^(PID %%P^)...
        taskkill /F /PID %%P >nul 2>&1
    )
)

taskkill /F /IM node.exe /FI "WINDOWTITLE eq Project Index*" >nul 2>&1

echo Done.
