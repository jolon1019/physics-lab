// 本地鉴权 + 静态服务入口（开发/自托管用）。
// 核心逻辑全部在 server/core.mjs，Vercel 无服务器入口在 api/[...slug].js。
// 用法：node server/index.mjs   （或 npm run dev 自动拉起）
import 'dotenv/config'
import http from 'node:http'
import { existsSync, statSync } from 'node:fs'
import { createReadStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, normalize } from 'node:path'
import { handleApi, CORS } from './core.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const DIST_DIR = join(root, 'dist')
const PORT = Number(process.env.PORT) || 3001

// AUTH_SECRET 未设置时给出显式提醒（本地可忽略，正式部署必须设置）
if (!process.env.AUTH_SECRET) {
  console.log('[auth] 提醒：未设置 AUTH_SECRET，正在使用内置开发密钥（正式部署请在环境变量中设置）')
}

// ===== 静态资源（生产：托管 dist）=====
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
}
function serveStatic(req, res, url) {
  if (!existsSync(DIST_DIR)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('未找到构建产物 dist/，请先执行 vite build，或访问开发服务器。')
    return
  }
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') pathname = '/index.html'
  const filePath = normalize(join(DIST_DIR, pathname))
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const ext = extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    readFileStream(filePath, res)
    return
  }
  // SPA 回退
  const indexPath = join(DIST_DIR, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME['.html'] })
  readFileStream(indexPath, res)
}
function readFileStream(p, res) {
  const s = createReadStream(p)
  s.on('error', () => {
    res.writeHead(500)
    res.end('读取文件失败')
  })
  s.pipe(res)
}

// ===== 服务器 =====
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ message: e.message || '服务器错误' }))
    })
    return
  }
  serveStatic(req, res, url)
})

server.listen(PORT, () => {
  console.log(`[auth] 鉴权服务已启动: http://localhost:${PORT}`)
  console.log(`[auth] 接口前缀: /api  (register/login/me/logout)`)
})
