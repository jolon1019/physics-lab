@echo off
rem Register "start physics-lab when user logs on" via Windows Task Scheduler.
rem Usage: right-click this file -> Run as administrator.
rem Prereq: deploy/sakura.env filled, and frpc.exe in PATH.
rem Undo: run uninstall-autostart.bat
setlocal
set "BAT=%~dp0start-sakura.bat"
schtasks /create /tn "physics-lab-autostart" /tr "\"%BAT%\"" /sc onlogon /rl limited /f
if errorlevel 1 (
  echo.
  echo [FAILED] May need administrator rights. Right-click -> Run as administrator.
  pause
  exit /b 1
)
echo.
echo [DONE] Created autostart task "physics-lab-autostart".
echo Next login will auto-start backend + tunnel (two windows pop up).
echo To cancel, run deploy\uninstall-autostart.bat.
pause
