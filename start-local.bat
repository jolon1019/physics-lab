@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d D:\project\physics-lab

echo [log] start-local.bat running at %TIME% > start-local.log
echo [log] cwd = %CD% >> start-local.log

where node >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
  if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
  if exist "%APPDATA%\nvm\node.exe" set "PATH=%APPDATA%\nvm;%PATH%"
)
where node >> start-local.log 2>&1
if errorlevel 1 (
  echo [ERROR] node.exe not found on PATH. Install Node.js from https://nodejs.org then retry. >> start-local.log
  notepad start-local.log
  pause
  exit /b 1
)

if not exist node_modules (
  echo [log] node_modules missing, running npm install... >> start-local.log
  call npm install >> start-local.log 2>&1
  if errorlevel 1 ( echo [ERROR] npm install failed. >> start-local.log & notepad start-local.log & pause & exit /b 1 )
)

REM ===== 0. Cleanup: old frpc tunnel + process holding port 3001 =====
echo [clean] stop old frpc + node backend ... >> start-local.log
if exist "deploy\stop.bat" call "deploy\stop.bat" -q >> start-local.log 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":3001 .*LISTENING"') do (
  echo [clean] killing PID %%P holding :3001 >> start-local.log
  taskkill /f /pid %%P >> start-local.log 2>&1
)

REM ===== 1. Ask which mode (dialog text lives in scripts\ask-mode.ps1, UTF-8 BOM) =====
echo [menu] ask user which mode >> start-local.log
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\ask-mode.ps1" >nul 2>&1
if errorlevel 1 goto :local_mode

REM ================= FRP mode =================
REM start-sakura.bat: build dist -> backend :3001 -> frpc tunnel
if not exist "deploy\start-sakura.bat" (
  echo [frp] deploy\start-sakura.bat missing >> start-local.log
  echo [warn] start-sakura.bat not found, falling back to local test.
  timeout /t 3 /nobreak >nul
  goto :local_mode
)
set "FRPC="
if exist "deploy\frpc.exe" (
  set "FRPC=D:\project\physics-lab\deploy\frpc.exe"
  set "PATH=D:\project\physics-lab\deploy;%PATH%"
)
if not defined FRPC (
  for /f "delims=" %%F in ('where frpc.exe 2^>nul') do if not defined FRPC set "FRPC=%%F"
)
if not defined FRPC (
  echo [frp] frpc.exe not found >> start-local.log
  echo [warn] frpc.exe not found (see deploy\README.md), falling back to local test.
  timeout /t 4 /nobreak >nul
  goto :local_mode
)
echo [frp] launching deploy\start-sakura.bat (build + backend + tunnel) ...
start "physics-lab-sakura" cmd /c "D:\project\physics-lab\deploy\start-sakura.bat"
exit /b 0

REM ================= Local test mode =================
:local_mode
echo [start] dev server (Vite :5173 + backend :3001) >> start-local.log
start "" cmd /c "timeout /t 6 /nobreak >nul & start "" http://localhost:5173"
echo [start] local test, browser will open http://localhost:5173
echo [start] close this window to stop.
node scripts/dev.mjs >> start-local.log 2>&1
echo [exit] dev server stopped (code=%errorlevel%). >> start-local.log
notepad start-local.log
pause
