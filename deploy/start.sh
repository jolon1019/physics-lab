#!/usr/bin/env bash
# ============================================================
# physics-lab 一键启动 (Linux / macOS)
# 顺序: vite build -> 后台启动 Node(3001) -> 启动 CF Tunnel
# 停止: Ctrl+C (会自动结束 Node 子进程)
# ============================================================
set -e
cd "$(dirname "$0")/.."

echo "[1/3] 构建前端 (vite build)..."
npm run build

echo "[2/3] 后台启动 Node 鉴权服务 (:3001)..."
node server/index.mjs &
NODE_PID=$!

echo "[3/3] 启动 Cloudflare Tunnel (Ctrl+C 停止)..."
trap 'echo; echo "正在停止 Node 进程..."; kill "$NODE_PID" 2>/dev/null' EXIT INT TERM
cloudflared tunnel run physics-lab
