@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem Ports are allocated centrally in C:\Claude\PORTS.md (Project Index: API 4319, UI 5189).
rem Vite runs with --strictPort, so a port clash fails loudly instead of sliding to another port.
set "API_PORT=4319"
set "WEB_PORT=5189"

echo Checking for an existing Project Index server on ports %API_PORT%/%WEB_PORT%...

for %%R in (%API_PORT% %WEB_PORT%) do (
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%%R " ^| findstr "LISTENING"') do (
        echo Found existing process on port %%R ^(PID %%P^) - stopping it...
        taskkill /F /PID %%P >nul 2>&1
    )
)

rem concurrently re-parents the two npm children, so they can outlive the cmd window they were
rem started from; match them by the window title this app's start.bat gives them.
taskkill /F /IM node.exe /FI "WINDOWTITLE eq Project Index*" >nul 2>&1

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo Starting Project Index ^(API :%API_PORT%, UI :%WEB_PORT%^)...
start "Project Index" cmd /c "npm run dev"
start "" /min C:\Claude\open-url.bat http://127.0.0.1:%WEB_PORT%
echo Done. Open http://127.0.0.1:%WEB_PORT%
