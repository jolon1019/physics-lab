// 零依赖 Node 鉴权后端：邮箱 + 密码 注册/登录
// 运行：node server/index.mjs  （端口可用 PORT 环境变量覆盖，默认 3001）
// 依赖：Node 内置模块 + nodemailer（可选，用于发送邮件）
import dotenv from 'dotenv'
dotenv.config()

import http from 'node:http'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, normalize } from 'node:path'
import nodemailer from 'nodemailer'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const USERS_FILE = join(DATA_DIR, 'users.json')
const DIST_DIR = join(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT) || 3001
const TOKEN_TTL = 1000 * 60 * 60 * 24 * 7 // 7 天

// ===== SMTP 邮件配置 =====
const SMTP_HOST = process.env.SMTP_HOST || ''
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false'
const SMTP_USER = process.env.SMTP_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || ''
const SMTP_FROM = process.env.SMTP_FROM || ''
const EMAIL_ENABLED = !!(SMTP_HOST && SMTP_USER && SMTP_PASS)

let transporter = null
if (EMAIL_ENABLED) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  })
  console.log('[email] SMTP 邮件服务已启用')
} else {
  console.log('[email] SMTP 未配置，使用演示模式（验证码直接显示在页面）')
}

async function sendResetEmail(to, code) {
  if (!EMAIL_ENABLED) return false
  const mailOptions = {
    from: SMTP_FROM || SMTP_USER,
    to,
    subject: '物理实验平台 - 密码重置验证码',
    text: `您的密码重置验证码是：${code}，10 分钟内有效。如非本人操作请忽略此邮件。`,
    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 500px; margin: 0 auto;">
      <h2 style="color: #3b6fd4; text-align: center;">物理实验平台</h2>
      <p>您好，收到此邮件是因为您（或他人）请求了密码重置。</p>
      <p style="text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 8px; color: #3b6fd4; background: #f0f4ff; padding: 20px; border-radius: 8px;">${code}</p>
      <p style="color: #888; font-size: 13px;">验证码 10 分钟内有效，如非本人操作请忽略此邮件。</p>
    </div>`
  }
  await transporter.sendMail(mailOptions)
  return true
}

// token -> { email, expires }
const sessions = new Map()
// 简易限流：IP -> { count, first }
const loginFails = new Map()
// 重置密码 token -> { email, expires }
const resetTokens = new Map()

// ===== 用户存储 =====
function loadUsers() {
  if (!existsSync(USERS_FILE)) return []
  try {
    const arr = JSON.parse(readFileSync(USERS_FILE, 'utf8'))
    if (!Array.isArray(arr)) return []
    let changed = false
    arr.forEach((u, i) => {
      if (!u.role) {
        u.role = i === 0 ? 'admin' : 'user'
        changed = true
      }
    })
    if (changed) saveUsers(arr)
    return arr
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
    const isFirst = users.length === 0
    users.push({
      email,
      salt,
      hash,
      role: isFirst ? 'admin' : 'user',
      createdAt: new Date().toISOString(),
      progress: defaultProgress()
    })
    saveUsers(users)
    const token = makeToken()
    sessions.set(token, { email, expires: Date.now() + TOKEN_TTL })
    return send(res, 201, { token, user: { email, role: isFirst ? 'admin' : 'user' } })
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
    const role = user.role || 'user'
    return send(res, 200, { token, user: { email, role } })
  }

  if (url.pathname === '/api/me' && req.method === 'GET') {
    const token = getToken(req)
    const sess = token ? sessions.get(token) : null
    if (!sess || sess.expires < Date.now()) {
      if (sess) sessions.delete(token)
      return send(res, 200, { user: null })
    }
    const user = users.find((u) => u.email === sess.email)
    const role = user?.role || 'user'
    return send(res, 200, { user: { email: sess.email, role } })
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

  // 修改密码（需验证当前密码）
  if (url.pathname === '/api/change-password' && req.method === 'POST') {
    const user = authUser(req)
    if (!user) return send(res, 401, { message: '未登录或登录已过期' })
    let body
    try {
      body = await readBody(req)
    } catch (e) {
      return send(res, 400, { message: e.message })
    }
    const { oldPassword, newPassword } = body || {}
    if (!oldPassword || !newPassword) {
      return send(res, 400, { message: '请填写当前密码和新密码' })
    }
    if (!verifyPassword(oldPassword, user.salt, user.hash)) {
      return send(res, 401, { message: '当前密码不正确' })
    }
    if (newPassword.length < 6) {
      return send(res, 400, { message: '新密码至少 6 位' })
    }
    const { salt, hash } = hashPassword(newPassword)
    user.salt = salt
    user.hash = hash
    saveUsers(users)
    return send(res, 200, { ok: true })
  }

  // 请求重置密码（忘记密码流程第一步：输入邮箱，发送验证码邮件）
  if (url.pathname === '/api/request-reset' && req.method === 'POST') {
    let body
    try {
      body = await readBody(req)
    } catch (e) {
      return send(res, 400, { message: e.message })
    }
    const email = String(body.email || '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return send(res, 400, { message: '请输入有效的邮箱地址' })
    const user = users.find((u) => u.email === email)
    if (!user) return send(res, 404, { message: '该邮箱未注册' })
    const code = randomBytes(3).toString('hex').toUpperCase() // 6 位验证码
    const expires = Date.now() + 10 * 60 * 1000 // 10 分钟有效
    resetTokens.set(code, { email, expires })

    // 尝试发送邮件
    try {
      const sent = await sendResetEmail(email, code)
      if (sent) {
        return send(res, 200, { ok: true, mode: 'email' })
      } else {
        // 演示模式：返回验证码
        return send(res, 200, { ok: true, mode: 'demo', code })
      }
    } catch (e) {
      // 邮件发送失败，降级为演示模式
      console.error('[email] 发送邮件失败，降级为演示模式：', e.message)
      return send(res, 200, { ok: true, mode: 'demo', code })
    }
  }

  // 重置密码（忘记密码流程第二步：输入验证码 + 新密码）
  if (url.pathname === '/api/reset-password' && req.method === 'POST') {
    let body
    try {
      body = await readBody(req)
    } catch (e) {
      return send(res, 400, { message: e.message })
    }
    const { code, email, newPassword } = body || {}
    if (!code || !email || !newPassword) {
      return send(res, 400, { message: '请填写邮箱、验证码和新密码' })
    }
    const entry = resetTokens.get(String(code).toUpperCase())
    if (!entry || entry.email !== email) {
      return send(res, 400, { message: '验证码不正确' })
    }
    if (entry.expires < Date.now()) {
      resetTokens.delete(String(code).toUpperCase())
      return send(res, 400, { message: '验证码已过期，请重新申请' })
    }
    if (newPassword.length < 6) {
      return send(res, 400, { message: '新密码至少 6 位' })
    }
    const user = users.find((u) => u.email === email)
    if (!user) return send(res, 404, { message: '用户不存在' })
    const { salt, hash } = hashPassword(newPassword)
    user.salt = salt
    user.hash = hash
    resetTokens.delete(String(code).toUpperCase())
    saveUsers(users)
    return send(res, 200, { ok: true })
  }

  // 管理员：获取用户列表
  if (url.pathname === '/api/admin/users' && req.method === 'GET') {
    const user = authUser(req)
    if (!user) return send(res, 401, { message: '未登录或登录已过期' })
    if (user.role !== 'admin') return send(res, 403, { message: '仅管理员可访问' })
    const list = users.map((u) => ({
      email: u.email,
      role: u.role || 'user',
      createdAt: u.createdAt || null
    }))
    return send(res, 200, { users: list })
  }

  // 管理员：直接重置某用户密码
  if (url.pathname === '/api/admin/reset-password' && req.method === 'POST') {
    const admin = authUser(req)
    if (!admin) return send(res, 401, { message: '未登录或登录已过期' })
    if (admin.role !== 'admin') return send(res, 403, { message: '仅管理员可操作' })
    let body
    try {
      body = await readBody(req)
    } catch (e) {
      return send(res, 400, { message: e.message })
    }
    const { email, newPassword } = body || {}
    if (!email || !newPassword) {
      return send(res, 400, { message: '请填写用户邮箱和新密码' })
    }
    const target = users.find((u) => u.email === String(email).trim().toLowerCase())
    if (!target) return send(res, 404, { message: '用户不存在' })
    if (newPassword.length < 6) {
      return send(res, 400, { message: '新密码至少 6 位' })
    }
    const { salt, hash } = hashPassword(newPassword)
    target.salt = salt
    target.hash = hash
    saveUsers(users)
    return send(res, 200, { ok: true })
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
