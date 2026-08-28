// 鉴权核心逻辑：本地 HTTP 服务（server/index.mjs）与 Vercel 无服务器
// （api/[...slug].js）共用同一份代码，保证本地测试与线上行为一致。
//
// 两手准备：
//   本地测试  → 用户数据存 server/data/users.json（dotenv 读 .env）
//   Vercel 上 → 配了 BLOB_READ_WRITE_TOKEN 就用 Vercel Blob 持久化（正式使用）；
//               没配则退回 /tmp 文件（仅冒烟测试，冷启动会丢数据）
//
// 无服务器适配要点：
//   - session 改为 HMAC 签名无状态 token（跨实例、冷启动后依然有效）
//   - 重置验证码存进用户记录并持久化（内存 Map 在无服务器下不可靠）
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import nodemailer from 'nodemailer'
import { get, put } from '@vercel/blob'

const __dirname = dirname(fileURLToPath(import.meta.url))

const IS_VERCEL = !!process.env.VERCEL
const TOKEN_TTL = 1000 * 60 * 60 * 24 * 7 // 7 天
// 签名密钥：正式部署务必在 Vercel 环境变量里设置 AUTH_SECRET
const SECRET = process.env.AUTH_SECRET || 'physics-lab-dev-secret'

// ===== SMTP 邮件配置 =====
const SMTP_HOST = process.env.SMTP_HOST || ''
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false'
const SMTP_USER = process.env.SMTP_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || ''
const SMTP_FROM = process.env.SMTP_FROM || ''
const EMAIL_ENABLED = !!(SMTP_HOST && SMTP_USER && SMTP_PASS)

// 发件人：SMTP_FROM 只存纯地址（兼容旧的「名称 <地址>」格式，自动剥出地址），
// 显示名固定英文并由 nodemailer 做 RFC2047 编码——中文名放环境变量里
// 经过 PowerShell/CLI/服务器链路极易变成乱码（如「鐗╃悊瀹為獙骞冲彴」）
const FROM_ADDRESS = (() => {
  const m = String(SMTP_FROM || SMTP_USER || '').match(/<([^>]+)>/)
  return (m ? m[1] : String(SMTP_FROM || SMTP_USER || '')).trim()
})()
const FROM_NAME = 'Physics Lab'

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

async function sendCodeEmail(to, code, purpose) {
  if (!EMAIL_ENABLED) return false
  const scenes = {
    reset: {
      subject: '物理实验平台 - 密码重置验证码',
      intro: '您好，收到此邮件是因为您（或他人）请求了密码重置。'
    },
    register: {
      subject: '物理实验平台 - 注册验证码',
      intro: '您好，感谢注册物理实验平台，您的注册验证码是：'
    }
  }
  const s = scenes[purpose] || scenes.reset
  const mailOptions = {
    from: { name: FROM_NAME, address: FROM_ADDRESS },
    to,
    subject: s.subject,
    text: `${s.intro}${code}，10 分钟内有效。如非本人操作请忽略此邮件。`,
    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 500px; margin: 0 auto;">
      <h2 style="color: #3b6fd4; text-align: center;">物理实验平台</h2>
      <p>${s.intro}</p>
      <p style="text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 8px; color: #3b6fd4; background: #f0f4ff; padding: 20px; border-radius: 8px;">${code}</p>
      <p style="color: #888; font-size: 13px;">验证码 10 分钟内有效，如非本人操作请忽略此邮件。</p>
    </div>`
  }
  await transporter.sendMail(mailOptions)
  return true
}

// ===== 用户存储（Blob 持久化 / 本地文件 两手准备） =====
const BLOB_MODE = !!process.env.BLOB_READ_WRITE_TOKEN
const DATA_DIR = process.env.PHYSICS_LAB_DATA_DIR || (IS_VERCEL ? tmpdir() : join(__dirname, 'data'))
const USERS_FILE = join(DATA_DIR, 'users.json')
if (BLOB_MODE) console.log('[db] 使用 Vercel Blob 持久化存储')
else if (IS_VERCEL) console.log('[db] 未配置 Blob，使用 /tmp 临时存储（冷启动会丢数据）')
else console.log(`[db] 本地文件存储: ${USERS_FILE}`)

function normalizeUsers(arr) {
  if (!Array.isArray(arr)) return []
  let changed = false
  arr.forEach((u, i) => {
    if (!u.role) {
      u.role = i === 0 ? 'admin' : 'user'
      changed = true
    }
  })
  return { arr, changed }
}

export async function loadUsers() {
  let raw = null
  if (BLOB_MODE) {
    try {
      // 私有存储：get() 直接带鉴权读取；useCache:false 保证读-modify-写的一致性
      const res = await get('users.json', { access: 'private', useCache: false })
      if (res) {
        raw = JSON.parse(await new Response(res.stream).text())
      }
    } catch {
      /* Blob 里还没有 users.json */
    }
  } else {
    if (existsSync(USERS_FILE)) {
      try {
        raw = JSON.parse(readFileSync(USERS_FILE, 'utf8'))
      } catch {
        raw = null
      }
    }
  }
  if (!raw) return []
  const { arr, changed } = normalizeUsers(raw)
  if (changed) await saveUsers(arr)
  return arr
}

export async function saveUsers(users) {
  const json = JSON.stringify(users, null, 2)
  if (BLOB_MODE) {
    await put('users.json', json, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json'
    })
    return
  }
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(USERS_FILE, json)
}

// ===== 注册验证码存储（注册时用户尚不存在，独立持久化；读取时自动清理过期项） =====
const PENDING_FILE = join(DATA_DIR, 'pending-codes.json')

async function loadPendingCodes() {
  let raw = null
  if (BLOB_MODE) {
    try {
      const r = await get('pending-codes.json', { access: 'private', useCache: false })
      if (r) raw = JSON.parse(await new Response(r.stream).text())
    } catch {
      /* 还没有 pending-codes.json */
    }
  } else if (existsSync(PENDING_FILE)) {
    try {
      raw = JSON.parse(readFileSync(PENDING_FILE, 'utf8'))
    } catch {
      raw = null
    }
  }
  if (!Array.isArray(raw)) return []
  const now = Date.now()
  return raw.filter((e) => e && e.email && e.code && Number(e.expires) > now)
}

async function savePendingCodes(list) {
  const json = JSON.stringify(list, null, 2)
  if (BLOB_MODE) {
    await put('pending-codes.json', json, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json'
    })
    return
  }
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(PENDING_FILE, json)
}

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

// ===== 无状态签名 token（替代内存 session Map，适配多实例/冷启动） =====
function hmac(payload) {
  return createHmac('sha256', SECRET).update(payload).digest('base64url')
}
function makeToken(email) {
  const payload = `${email}|${Date.now() + TOKEN_TTL}`
  return `${Buffer.from(payload).toString('base64url')}.${hmac(payload)}`
}
function parseToken(token) {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot < 1) return null
  const payload = Buffer.from(token.slice(0, dot), 'base64url').toString()
  if (hmac(payload) !== token.slice(dot + 1)) return null
  const [email, exp] = payload.split('|')
  if (!email || Number(exp) < Date.now()) return null
  return email
}

// 简易限流（实例内尽力而为；无服务器跨实例限流需外部存储，个人站点可接受）
const loginFails = new Map()

// ===== 工具 =====
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}
function send(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS
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
function authUser(req, users) {
  const email = parseToken(getToken(req))
  if (!email) return null
  return users.find((u) => u.email === email) || null
}
// 学习进度的默认结构
function defaultProgress() {
  return { records: {}, sessions: 0, lastVisit: '' }
}

// ===== 接口处理 =====
export async function handleApi(req, res, url) {
  // 跨域预检：204 不允许带响应体，单独处理
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }
  // 发送注册验证码（60 秒限频，10 分钟有效；SMTP 未配置时降级演示模式）
  if (url.pathname === '/api/register-code' && req.method === 'POST') {
    let body
    try {
      body = await readBody(req)
    } catch (e) {
      return send(res, 400, { message: e.message })
    }
    const email = String(body.email || '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return send(res, 400, { message: '请输入有效的邮箱地址' })
    const users = await loadUsers()
    if (users.some((u) => u.email === email)) {
      return send(res, 409, { message: '该邮箱已注册，请直接登录' })
    }
    const pend = await loadPendingCodes()
    const prev = pend.find((p) => p.email === email)
    if (prev && Date.now() - prev.sentAt < 60_000) {
      return send(res, 429, { message: '发送过于频繁，请稍后再试' })
    }
    const code = randomBytes(3).toString('hex').toUpperCase()
    const entry = { email, code, expires: Date.now() + 10 * 60 * 1000, sentAt: Date.now() }
    const idx = pend.findIndex((p) => p.email === email)
    if (idx >= 0) pend[idx] = entry
    else pend.push(entry)
    await savePendingCodes(pend)
    try {
      const sent = await sendCodeEmail(email, code, 'register')
      if (sent) return send(res, 200, { ok: true, mode: 'email' })
      return send(res, 200, { ok: true, mode: 'demo', code })
    } catch (e) {
      console.error('[email] 注册验证码发送失败，降级为演示模式：', e.message)
      return send(res, 200, { ok: true, mode: 'demo', code })
    }
  }

  if (url.pathname === '/api/register' && req.method === 'POST') {
    let body
    try {
      body = await readBody(req)
    } catch (e) {
      return send(res, 400, { message: e.message })
    }
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const code = String(body.code || '').trim().toUpperCase()
    if (!EMAIL_RE.test(email)) return send(res, 400, { message: '请输入有效的邮箱地址' })
    if (password.length < 6) return send(res, 400, { message: '密码至少 6 位' })
    if (!code) return send(res, 400, { message: '请先获取邮箱验证码' })
    const users = await loadUsers()
    if (users.some((u) => u.email === email)) {
      return send(res, 409, { message: '该邮箱已注册，请直接登录' })
    }
    // 校验注册验证码（过期项在 loadPendingCodes 里已被清理）
    const pend = await loadPendingCodes()
    const entry = pend.find((p) => p.email === email)
    if (!entry || entry.code !== code) {
      return send(res, 400, { message: '验证码不正确或已过期，请重新获取' })
    }
    pend.splice(pend.indexOf(entry), 1)
    await savePendingCodes(pend)
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
    await saveUsers(users)
    return send(res, 201, { token: makeToken(email), user: { email, role: isFirst ? 'admin' : 'user' } })
  }

  if (url.pathname === '/api/login' && req.method === 'POST') {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
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
    const users = await loadUsers()
    const user = users.find((u) => u.email === email)
    if (!user || !verifyPassword(password, user.salt, user.hash)) {
      loginFails.set(ip, { count: fail.count + 1, first: Date.now() })
      return send(res, 401, { message: '邮箱或密码不正确' })
    }
    loginFails.delete(ip)
    const role = user.role || 'user'
    return send(res, 200, { token: makeToken(email), user: { email, role } })
  }

  if (url.pathname === '/api/me' && req.method === 'GET') {
    const users = await loadUsers()
    const user = authUser(req, users)
    if (!user) return send(res, 200, { user: null })
    return send(res, 200, { user: { email: user.email, role: user.role || 'user' } })
  }

  // 无状态 token 无需服务端注销：前端删除本地 token 即失效
  if (url.pathname === '/api/logout' && req.method === 'POST') {
    return send(res, 200, { ok: true })
  }

  // 读取当前用户的学习进度（隔离：只返回自己的）
  if (url.pathname === '/api/progress' && req.method === 'GET') {
    const users = await loadUsers()
    const user = authUser(req, users)
    if (!user) return send(res, 200, { progress: defaultProgress() })
    return send(res, 200, { progress: user.progress || defaultProgress() })
  }

  // 保存当前用户的学习进度（隔离：只写自己的）
  if (url.pathname === '/api/progress' && req.method === 'POST') {
    const users = await loadUsers()
    const user = authUser(req, users)
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
    await saveUsers(users)
    return send(res, 200, { progress })
  }

  // 修改密码（需验证当前密码）
  if (url.pathname === '/api/change-password' && req.method === 'POST') {
    const users = await loadUsers()
    const user = authUser(req, users)
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
    await saveUsers(users)
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
    const users = await loadUsers()
    const user = users.find((u) => u.email === email)
    if (!user) return send(res, 404, { message: '该邮箱未注册' })
    const code = randomBytes(3).toString('hex').toUpperCase() // 6 位验证码
    // 验证码写进用户记录持久化（无服务器内存 Map 不可靠）
    user.resetCode = code
    user.resetExpires = Date.now() + 10 * 60 * 1000 // 10 分钟有效
    await saveUsers(users)

    // 尝试发送邮件
    try {
      const sent = await sendCodeEmail(email, code, 'reset')
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
    const users = await loadUsers()
    const user = users.find((u) => u.email === String(email).trim().toLowerCase())
    if (!user || !user.resetCode || user.resetCode !== String(code).toUpperCase()) {
      return send(res, 400, { message: '验证码不正确' })
    }
    if (user.resetExpires < Date.now()) {
      user.resetCode = null
      await saveUsers(users)
      return send(res, 400, { message: '验证码已过期，请重新申请' })
    }
    if (newPassword.length < 6) {
      return send(res, 400, { message: '新密码至少 6 位' })
    }
    const { salt, hash } = hashPassword(newPassword)
    user.salt = salt
    user.hash = hash
    user.resetCode = null
    user.resetExpires = null
    await saveUsers(users)
    return send(res, 200, { ok: true })
  }

  // 管理员：获取用户列表
  if (url.pathname === '/api/admin/users' && req.method === 'GET') {
    const users = await loadUsers()
    const user = authUser(req, users)
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
    const users = await loadUsers()
    const admin = authUser(req, users)
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
    await saveUsers(users)
    return send(res, 200, { ok: true })
  }

  return send(res, 404, { message: '接口不存在' })
}
