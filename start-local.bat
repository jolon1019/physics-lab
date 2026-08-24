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

REM ===== 是否同步新实验到 GitHub（对话框询问）=====
echo [sync] ask user whether to push new experiments >> start-local.log
powershell -NoProfile -ExecutionPolicy Bypass -Command "$r=[System.Windows.Forms.MessageBox]::Show('是否将新实验同步上传到 GitHub 仓库？' + [char]10 + '(选“是”将执行推送，需要 GitHub Token)', '同步新实验到 GitHub', 4, 64); if($r -eq 'Yes'){ exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 goto :no_sync

echo [sync] user chose YES -> start-local.log
if defined GH_TOKEN goto :push_use_env

REM 无 GH_TOKEN 环境变量：弹输入框输入 Token（仅内存传递，不写入磁盘）
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; Add-Type -AssemblyName Microsoft.VisualBasic;" ^
  "$t=[Microsoft.VisualBasic.Interaction]::InputBox('请输入 GitHub 经典 Token（repo 权限）：' + [char]10 + '用于同步到 jolon1019/physics-lab', 'GitHub Token', '', -1, -1);" ^
  "if($t -and $t.Trim().Length -gt 0){ $env:GH_TOKEN=$t.Trim(); $env:NODE_TLS_REJECT_UNAUTHORIZED='0'; node 'C:\Users\Administrator\.workbuddy\skills\github-push-via-api\scripts\push_via_api.mjs' --owner jolon1019 --repo physics-lab --branch master --root 'D:\project\physics-lab' --commit-msg 'sync: push via start-local' 2>&1 | Out-File -FilePath start-local.log -Append; exit $LASTEXITCODE } else { exit 0 }"
set "PUSH_OK=%errorlevel%"
goto :after_push

:push_use_env
set "NODE_TLS_REJECT_UNAUTHORIZED=0"
node "C:\Users\Administrator\.workbuddy\skills\github-push-via-api\scripts\push_via_api.mjs" --owner jolon1019 --repo physics-lab --branch master --root D:\project\physics-lab --commit-msg "sync: push via start-local" >> start-local.log 2>&1
set "PUSH_OK=%errorlevel%"
goto :after_push

:after_push
if "%PUSH_OK%"=="0" (
  echo [sync] OK: new experiments pushed to GitHub. >> start-local.log
) else (
  echo [sync] skipped or failed (code=%PUSH_OK%). >> start-local.log
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
