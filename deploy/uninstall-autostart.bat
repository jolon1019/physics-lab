@echo off
rem Cancel physics-lab autostart. Double-click to run.
schtasks /delete /tn "physics-lab-autostart" /f 2>nul
if errorlevel 1 (
  echo No autostart task found (maybe never registered).
) else (
  echo Autostart cancelled.
)
pause
