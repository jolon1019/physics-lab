// 轻量 fetch 封装：统一拼接 /api、自动附带 Bearer token、规范化错误
const BASE = '/api'

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
export function register(email, password) {
  return request('/register', { method: 'POST', body: { email, password } })
}
export function getMe() {
  return request('/me', { method: 'GET' })
}
export function logout() {
  return request('/logout', { method: 'POST' })
}

// 读取/保存当前登录用户的学习进度（服务端隔离，按用户保存）
export function getProgress() {
  return request('/progress', { method: 'GET' })
}
export function saveProgress(progress) {
  return request('/progress', { method: 'POST', body: { progress } })
}
