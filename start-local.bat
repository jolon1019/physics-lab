@echo off
setlocal
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

REM ===== 是否同步实验更改到 FRP（移动端访问网址）=====
echo [sync] ask user whether to sync experiments to FRP >> start-local.log
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $r=[System.Windows.Forms.MessageBox]::Show('是否将实验更改同步到 FRP（移动端访问网址）？' + [char]10 + '(选“是”将重新构建并启动 FRP 服务，手机刷新网址即可访问最新实验)', '同步实验到 FRP', 4, 64); if($r -eq 'Yes'){ exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 goto :no_sync

echo [sync] user chose YES, launching deploy\start-sakura.bat (build -> Node3001 -> frpc)... >> start-local.log
if not exist "deploy\start-sakura.bat" goto :no_launcher
where frpc.exe >nul 2>nul
if errorlevel 1 goto :no_frpc_bin
start "physics-lab-sakura" cmd /c "deploy\start-sakura.bat"
echo [sync] start-sakura.bat launched - refresh the FRP URL on your phone. >> start-local.log
goto :no_sync
:no_launcher
echo [sync] deploy\start-sakura.bat missing. >> start-local.log
goto :no_sync
:no_frpc_bin
echo [sync] frpc.exe not found on PATH - download SakuraFrp frpc.exe and add it per deploy\README.md. >> start-local.log
:no_sync

start "" cmd /c "timeout /t 6 /nobreak >nul & start "" http://localhost:5173"

echo [start] Dev server launching... (Vite :5173 + auth :3001)
echo [start] Logs -> start-local.log   Browser -> http://localhost:5173
echo [start] Press Ctrl+C to stop.
echo.
node scripts/dev.mjs >> start-local.log 2>&1
echo [exit] dev server stopped (code=%errorlevel%). >> start-local.log
notepad start-local.log
pause
