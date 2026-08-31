// 轻量 fetch 封装：统一拼接 /api、自动附带 Bearer token、规范化错误
// API 基址两手准备：
//   本地测试 → 默认 '/api'（Vite dev 代理转发到 localhost:3001；生产由后端直接托管 dist 时同样走 /api）
//   正式部署 → 构建时设 VITE_API_BASE=https://你的后端域名/api（Vercel 项目环境变量里配置）
const BASE = import.meta.env.VITE_API_BASE || '/api'

async function request(path, options = {}) {
  const token = localStorage.getItem('physics-lab-token') || ''
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* 无响应体 */
  }
  if (!res.ok) {
    const message = (data && data.message) || `请求失败 (${res.status})`
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return data
}

export function login(email, password) {
  return request('/login', { method: 'POST', body: { email, password } })
}
export function requestRegisterCode(email) {
  return request('/register-code', { method: 'POST', body: { email } })
}
export function register(email, password, code) {
  return request('/register', { method: 'POST', body: { email, password, code } })
}
export function getMe() {
  return request('/me', { method: 'GET' })
}
export function logout() {
  return request('/logout', { method: 'POST' })
}
export function changePassword(oldPassword, newPassword) {
  return request('/change-password', { method: 'POST', body: { oldPassword, newPassword } })
}
export function requestReset(email) {
  return request('/request-reset', { method: 'POST', body: { email } })
}
export function resetPassword(code, email, newPassword) {
  return request('/reset-password', { method: 'POST', body: { code, email, newPassword } })
}
export function adminListUsers() {
  return request('/admin-users', { method: 'GET' })
}
export function adminResetPassword(email, newPassword) {
  return request('/admin-reset-password', { method: 'POST', body: { email, newPassword } })
}
export function adminSetRole(email, role) {
  return request('/admin-user-role', { method: 'POST', body: { email, role } })
}
export function adminSetMembership(email, plan) {
  return request('/admin-user-membership', { method: 'POST', body: { email, plan } })
}
export function getPublicSettings() {
  return request('/settings', { method: 'GET' })
}
export function adminGetSettings() {
  return request('/admin-settings', { method: 'GET' })
}
export function adminSaveSettings(paidExperiments) {
  return request('/admin-settings', { method: 'POST', body: { paidExperiments } })
}

// 读取/保存当前登录用户的学习进度（服务端隔离，按用户保存）
export function getProgress() {
  return request('/progress', { method: 'GET' })
}
export function saveProgress(progress) {
  return request('/progress', { method: 'POST', body: { progress } })
}
