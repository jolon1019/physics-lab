@echo off
setlocal
cd /d "%~dp0.."

if "%VERCEL_TOKEN%"=="" (
  if exist ".vercel-token" (
    set /p VERCEL_TOKEN=<.vercel-token
  ) else (
    echo [!] 未找到 Vercel Token。
    echo     方法一：把 token 写进本目录的 .vercel-token 文件（已加入 .gitignore，不会被提交）
    echo     方法二：setx VERCEL_TOKEN vcp_xxxxxxxx 之后重开命令行
    pause
    exit /b 2
  )
)

python tools\deploy-vercel.py %*
echo.
pause
