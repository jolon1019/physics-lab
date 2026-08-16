@echo off
rem Node backend runner with auto-restart loop. ASCII only.
rem All output is appended to deploy\node.log for troubleshooting.
setlocal
cd /d "%~dp0.."
:loop
echo [%date% %time%] starting node... >> "%~dp0node.log"
node "%~dp0..\server\index.mjs" >> "%~dp0node.log" 2>&1
echo [%date% %time%] node exited, restart in 3s... >> "%~dp0node.log"
timeout /t 3 /nobreak >nul
goto :loop
