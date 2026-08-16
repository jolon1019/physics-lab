// 零依赖 Node 鉴权后端：邮箱 + 密码 注册/登录
// 运行：node server/index.mjs  （端口可用 PORT 环境变量覆盖，默认 3001）
// 依赖：仅 Node 内置模块
import http from 'node:http'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, normalize } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const USERS_FILE = join(DATA_DIR, 'users.json')
const DIST_DIR = join(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT) || 3001
const TOKEN_TTL = 1000 * 60 * 60 * 24 * 7 // 7 天

// token -> { email, expires }
const sessions = new Map()
// 简易限流：IP -> { count, first }
const loginFails = new Map()

// ===== 用户存储 =====
function loadUsers() {
  if (!existsSync(USERS_FILE)) return []
  try {
    const arr = JSON.parse(readFileSync(USERS_FILE, 'utf8'))
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
function saveUsers(users) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
}
let users = loadUsers()

// ===== 密码哈希（scrypt）=====
function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { salt, hash }
}
function verifyPassword(password, salt, hash) {
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}
function makeToken() {
  return randomBytes(32).toString('hex')
}

// ===== 工具 =====
function send(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  })
  res.end(body)
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 1e6) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      data += chunk
    })
    req.on('end', () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}
function getToken(req) {
  const auth = req.headers['authorization'] || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : ''
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 从请求中取出已登录用户对象；未登录/过期返回 null
function authUser(req) {
  const token = getToken(req)
  const sess = sessions.get(token)
  if (!sess || sess.expires < Date.now()) {
    if (sess) sessions.delete(token)
    return null
  }
  return users.find((u) => u.email === sess.email) || null
}
// 学习进度的默认结构
function defaultProgress() {
  return { records: {}, sessions: 0, lastVisit: '' }
}

// ===== 接口处理 =====
async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  if (url.pathname === '/api/register' && req.method === 'POST') {
    let body
    try {
      body = await readBody(req)
    } catch (e) {
      return send(res, 400, { message: e.message })
    }
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (!EMAIL_RE.test(email)) return send(res, 400, { message: '请输入有效的邮箱地址' })
    if (password.length < 6) return send(res, 400, { message: '密码至少 6 位' })
    if (users.some((u) => u.email === email)) {
      return send(res, 409, { message: '该邮箱已注册，请直接登录' })
    }
    const { salt, hash } = hashPassword(password)
    users.push({
      email,
      salt,
      hash,
      createdAt: new Date().toISOString(),
      progress: defaultProgress()
    })
    saveUsers(users)
    const token = makeToken()
    sessions.set(token, { email, expires: Date.now() + TOKEN_TTL })
    return send(res, 201, { token, user: { email } })
  }

  if (url.pathname === '/api/login' && req.method === 'POST') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
    const fail = loginFails.get(ip) || { count: 0, first: Date.now() }
    if (fail.count >= 8 && Date.now() - fail.first < 60000) {
      return send(res, 429, { message: '尝试过于频繁，请稍后再试' })
    }
    let body
    try {
      body = await readBody(req)
    } catch (e) {
      return send(res, 400, { message: e.message })
    }
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const user = users.find((u) => u.email === email)
    if (!user || !verifyPassword(password, user.salt, user.hash)) {
      loginFails.set(ip, { count: fail.count + 1, first: Date.now() })
      return send(res, 401, { message: '邮箱或密码不正确' })
    }
    loginFails.delete(ip)
    const token = makeToken()
    sessions.set(token, { email, expires: Date.now() + TOKEN_TTL })
    return send(res, 200, { token, user: { email } })
  }

  if (url.pathname === '/api/me' && req.method === 'GET') {
    const token = getToken(req)
    const sess = token ? sessions.get(token) : null
    if (!sess || sess.expires < Date.now()) {
      if (sess) sessions.delete(token)
      // 无效/过期 token 一律视为「未登录」，返回 200 + user:null，避免前端首屏 401 噪声
      return send(res, 200, { user: null })
    }
    return send(res, 200, { user: { email: sess.email } })
  }

  if (url.pathname === '/api/logout' && req.method === 'POST') {
    const token = getToken(req)
    if (token) sessions.delete(token)
    return send(res, 200, { ok: true })
  }

  // 读取当前用户的学习进度（隔离：只返回自己的）
  if (url.pathname === '/api/progress' && req.method === 'GET') {
    const user = authUser(req)
    if (!user) return send(res, 200, { progress: defaultProgress() })
    return send(res, 200, { progress: user.progress || defaultProgress() })
  }

  // 保存当前用户的学习进度（隔离：只写自己的）
  if (url.pathname === '/api/progress' && req.method === 'POST') {
    const user = authUser(req)
    if (!user) return send(res, 401, { message: '未登录或登录已过期' })
    let body
    try {
      body = await readBody(req)
    } catch (e) {
      return send(res, 400, { message: e.message })
    }
    const p = (body && body.progress) || {}
    const progress = {
      records: p.records && typeof p.records === 'object' ? p.records : {},
      sessions: Number.isFinite(p.sessions) ? p.sessions : 0,
      lastVisit: typeof p.lastVisit === 'string' ? p.lastVisit : ''
    }
    user.progress = progress
    saveUsers(users)
    return send(res, 200, { progress })
  }

  return send(res, 404, { message: '接口不存在' })
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
import { createReadStream } from 'node:fs'
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
    handleApi(req, res, url).catch((e) => send(res, 500, { message: e.message || '服务器错误' }))
    return
  }
  serveStatic(req, res, url)
})

server.listen(PORT, () => {
  console.log(`[auth] 鉴权服务已启动: http://localhost:${PORT}`)
  console.log(`[auth] 接口前缀: /api  (register/login/me/logout)`)
})
