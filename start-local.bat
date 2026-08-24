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
powershell -NoProfile -ExecutionPolicy Bypass -Command "$r=[System.Windows.Forms.MessageBox]::Show('是否将实验更改同步到 FRP（移动端访问网址）？' + [char]10 + '(选“是”将重新构建 dist，刷新 FRP 网址即可看到最新实验)', '同步实验到 FRP', 4, 64); if($r -eq 'Yes'){ exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 goto :no_sync

echo [sync] user chose YES, rebuilding dist... >> start-local.log
call npm run build >> start-local.log 2>&1
set "BUILD_OK=%errorlevel%"
if "%BUILD_OK%"=="0" (
  echo [sync] OK: dist rebuilt; FRP URL now serves the latest experiments. >> start-local.log
  powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',3001); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 (
    echo [sync] backend :3001 running - refresh your FRP URL to see updates. >> start-local.log
  ) else (
    echo [sync] backend :3001 NOT running - run deploy\start-sakura.bat to bring FRP online. >> start-local.log
  )
) else (
  echo [sync] build failed (code=%BUILD_OK%). >> start-local.log
)
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
