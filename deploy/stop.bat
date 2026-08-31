@echo off
echo Stopping physics-lab...
taskkill /f /fi "WINDOWTITLE eq physics-lab-node*" 2>nul
taskkill /f /im frpc.exe 2>nul
echo Stopped. If node still lingers, end node.exe in Task Manager.
REM 传入 -q（被其他脚本调用）时跳过按键等待
if /i not "%~1"=="-q" pause
