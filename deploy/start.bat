@echo off
rem ============================================================
rem physics-lab 一键启动 (Windows)
rem 顺序: vite build -> 后台启动 Node(3001) -> 启动 CF Tunnel
rem 停止: 关闭 Cloudflare 窗口后, 再运行 stop.bat
rem ============================================================
setlocal
cd /d "%~dp0.."

echo [1/3] 构建前端 (vite build)...
call npm run build
if errorlevel 1 (
  echo 构建失败, 已中止.
  pause
  exit /b 1
)

echo [2/3] 后台启动 Node 鉴权服务 (:3001)...
start "physics-lab-node" /min cmd /c "node server/index.mjs ^& pause"

echo [3/3] 启动 Cloudflare Tunnel (Ctrl+C 停止)...
cloudflared tunnel run physics-lab
