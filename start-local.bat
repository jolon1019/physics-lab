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

echo [sync] user chose YES, rebuilding dist... >> start-local.log
call npm run build >> start-local.log 2>&1
set "BUILD_OK=%errorlevel%"
if not "%BUILD_OK%"=="0" (
  echo [sync] build failed (code=%BUILD_OK%). FRP not updated. >> start-local.log
  goto :no_sync
)
echo [sync] OK: dist rebuilt. >> start-local.log

REM ---- 读取 SakuraFrp 凭据 ----
set "SAKURA_TOKEN="
set "SAKURA_TUNNEL_ID="
if exist "deploy\sakura.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("deploy\sakura.env") do (
    if not "%%A"=="" if not "%%B"=="" set "%%A=%%B"
  )
)

REM ---- 确保 Node 后端 :3001 在线（离线则后台启动并等待）----
powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',3001); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto :node_already_up
echo [sync] backend :3001 down, starting it... >> start-local.log
start "physics-lab-node" "deploy\run-node.bat"
set "READY=0"
for /l %%i in (1,1,40) do (
  powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',3001); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 ( set "READY=1" & goto :nodeup )
  timeout /t 1 /nobreak >nul
)
:nodeup
if "%READY%"=="1" goto :node_ready
echo [sync] backend did not start within 40s. See deploy\node.log >> start-local.log
goto :no_sync
:node_already_up
echo [sync] backend :3001 already running. >> start-local.log
:node_ready

REM ---- 启动 frpc 隧道（凭据已配置且 frpc 可用时）----
if not defined SAKURA_TOKEN goto :no_frpc
if not defined SAKURA_TUNNEL_ID goto :no_frpc
if "%SAKURA_TOKEN%"=="__your_access_token__" goto :no_frpc
if "%SAKURA_TUNNEL_ID%"=="__your_tunnel_id__" goto :no_frpc
where frpc.exe >nul 2>nul
if errorlevel 1 goto :no_frpc_bin
echo [sync] starting frpc tunnel... >> start-local.log
start "physics-lab-frpc" /min cmd /c "frpc.exe -f %SAKURA_TOKEN%:%SAKURA_TUNNEL_ID%"
echo [sync] frpc started - refresh the FRP URL on your phone. >> start-local.log
goto :after_frpc
:no_frpc_bin
echo [sync] frpc.exe not found on PATH - download SakuraFrp frpc.exe and add it per deploy\README.md. >> start-local.log
goto :after_frpc
:no_frpc
echo [sync] FRP credentials missing - fill deploy\sakura.env to enable the tunnel. >> start-local.log
:after_frpc
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
