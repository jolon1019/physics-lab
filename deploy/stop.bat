@echo off
echo Stopping physics-lab...
taskkill /f /fi "WINDOWTITLE eq physics-lab-node*" 2>nul
taskkill /f /im frpc.exe 2>nul
echo Stopped. If node still lingers, end node.exe in Task Manager.
pause
