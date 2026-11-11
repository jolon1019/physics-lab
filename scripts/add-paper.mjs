// 试卷上架脚本：把试卷条目写入线上 /api/admin-papers（Blob 持久化），无需改代码重新部署
//
// 用法：
//   node scripts/add-paper.mjs <paper.json>     # JSON 文件：单个条目对象或 { papers: [...] }
//   node scripts/add-paper.mjs --delete p-161   # 从数据库删除某条目
//
// 鉴权（二选一，.env 配置）：
//   ADMIN_EMAIL / ADMIN_PASSWORD  管理员账号，脚本自动登录换 token（推荐）
//   PAPERS_TOKEN                  直接给 token（登录网站后 localStorage 的 physics-lab-token）
//
// 条目字段：id(必填,p-递增) title(必填) category(g7/g8/g9/free) subject grade term
//           tone(red/blue/purple/green/amber/dark) downloadUrl passcode cover section brand
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BASE = (process.env.PAPERS_BASE_URL || 'https://www.zzzx.xyz').replace(/\/$/, '')

// 解析 .env（不覆盖已有环境变量）
const envFile = join(ROOT, '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim()
  }
}

async function api(path, options = {}, token = '') {
  const res = await fetch(BASE + path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  let data = null
  try {
    data = await res.json()
  } catch {}
  if (!res.ok) throw new Error(data?.message || `请求失败 (${res.status})`)
  return data
}

async function getToken() {
  if (process.env.PAPERS_TOKEN) return process.env.PAPERS_TOKEN
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error('请在 .env 配置 ADMIN_EMAIL / ADMIN_PASSWORD（或 PAPERS_TOKEN）')
  }
  const { token } = await api('/api/login', { method: 'POST', body: { email, password } })
  return token
}

const [cmd, arg] = process.argv.slice(2)
if (cmd === '--delete') {
  if (!arg) throw new Error('用法：node scripts/add-paper.mjs --delete <id>')
  const token = await getToken()
  const r = await api(`/api/admin-papers?id=${encodeURIComponent(arg)}`, { method: 'DELETE' }, token)
  console.log(`已删除 ${arg}，数据库剩余 ${r.total} 条`)
} else {
  const file = cmd
  if (!file || !existsSync(file)) throw new Error('用法：node scripts/add-paper.mjs <paper.json>')
  const payload = JSON.parse(readFileSync(file, 'utf8'))
  const token = await getToken()
  const r = await api('/api/admin-papers', { method: 'POST', body: payload }, token)
  console.log(`已上架 ${r.upserted} 条，数据库共 ${r.total} 条`)
}
