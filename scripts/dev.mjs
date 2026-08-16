// 开发编排：一条命令同时启动 前端(Vite) + 鉴权后端(Node)
// 用法：npm run dev  （替代原来只起 Vite 的 vite）
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const node = process.execPath

const procs = []

function start(name, bin, args) {
  const p = spawn(bin, args, {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const tag = `[${name}] `
  const pipe = (stream, out) => {
    let buf = ''
    stream.on('data', (d) => {
      buf += d.toString()
      const parts = buf.split('\n')
      buf = parts.pop()
      for (const line of parts) out.write(tag + line + '\n')
    })
    stream.on('end', () => {
      if (buf) out.write(tag + buf + '\n')
    })
  }
  pipe(p.stdout, process.stdout)
  pipe(p.stderr, process.stderr)
  p.on('exit', (code) => {
    console.log(`\n[${name}] 进程退出，码=${code}`)
    shutdown()
  })
  procs.push(p)
  return p
}

// 后端：server/index.mjs（端口 3001）
start('server', node, [resolve(root, 'server/index.mjs')])
// 前端：vite（端口 5173，/api 代理到 3001）
start('vite', node, [resolve(root, 'node_modules/vite/bin/vite.js')])

function shutdown() {
  for (const p of procs) {
    try { p.kill() } catch {}
  }
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
