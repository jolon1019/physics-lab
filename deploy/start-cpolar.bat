@echo off
rem ============================================================
rem physics-lab 一键启动 (Windows) — 使用 cpolar 国内穿透
rem 顺序: vite build -> 后台启动 Node(3001) -> 启动 cpolar 隧道
rem 前置: 已在 cpolar.cn 注册并执行过 cpolar authtoken <token>
rem 停止: 关闭 cpolar 窗口后, 再运行 stop.bat
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

echo [3/3] 启动 cpolar 隧道 (Ctrl+C 停止)...
cpolar http 3001
