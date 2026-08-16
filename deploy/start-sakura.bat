@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "SAKURA_TOKEN="
set "SAKURA_TUNNEL_ID="
if exist "%~dp0sakura.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%~dp0sakura.env") do (
    if not "%%A"=="" if not "%%B"=="" set "%%A=%%B"
  )
)

if not defined SAKURA_TOKEN goto :needconfig
if not defined SAKURA_TUNNEL_ID goto :needconfig
if "%SAKURA_TOKEN%"=="__your_access_token__" goto :needconfig
if "%SAKURA_TUNNEL_ID%"=="__your_tunnel_id__" goto :needconfig

title physics-lab launcher
echo ============================================================
echo   physics-lab launcher (SakuraFrp)
echo ============================================================

echo [1/3] building frontend (vite build)...
call npm run build
if errorlevel 1 (
  echo.
  echo [ERROR] frontend build failed, aborted.
  pause
  exit /b 1
)

echo [2/3] starting Node backend (:3001, auto-restart)...
if exist "%~dp0node.log" del /f "%~dp0node.log" >nul 2>&1
start "physics-lab-node" "%~dp0run-node.bat"

echo waiting for backend on 127.0.0.1:3001 ...
set "READY=0"
for /l %%i in (1,1,40) do (
  powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',3001); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 (
    set "READY=1"
    goto :nodeup
  )
  timeout /t 1 /nobreak >nul
)
:nodeup
if "%READY%"=="0" (
  echo.
  echo [ERROR] backend did not start within 40s.
  echo Open this file and send me its content:
  echo   %~dp0node.log
  pause
  exit /b 1
)
echo backend is up (HTTP 200 on :3001).

echo [3/3] starting SakuraFrp tunnel...
echo (frpc running. Press Ctrl+C to stop; then run stop.bat to kill backend)
echo.
frpc.exe -f %SAKURA_TOKEN%:%SAKURA_TUNNEL_ID%
goto :eof

:needconfig
echo.
echo ============================================================
echo   SakuraFrp credentials not configured. Cannot start.
echo.
echo   Edit this file and fill in two lines, then save:
echo     %~dp0sakura.env
echo.
echo     SAKURA_TOKEN=your_access_token
echo     SAKURA_TUNNEL_ID=your_tunnel_id
echo.
echo   After filling, double-click this script again.
echo ============================================================
if not exist "%~dp0sakura.env" (
  echo SAKURA_TOKEN=__your_access_token__> "%~dp0sakura.env"
  echo SAKURA_TUNNEL_ID=__your_tunnel_id__>> "%~dp0sakura.env"
)
notepad "%~dp0sakura.env"
pause
