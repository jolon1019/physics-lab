@echo off
setlocal
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

start "" cmd /c "timeout /t 6 /nobreak >nul & start "" http://localhost:5173"

echo [start] Dev server launching... (Vite :5173 + auth :3001)
echo [start] Logs -> start-local.log   Browser -> http://localhost:5173
echo [start] Press Ctrl+C to stop.
echo.
node scripts/dev.mjs >> start-local.log 2>&1
echo [exit] dev server stopped (code=%errorlevel%). >> start-local.log
notepad start-local.log
pause
