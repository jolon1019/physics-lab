// 临时验证脚本：用 Vercel handler 直接起 http 服务，模拟无服务器环境跑核心流程
import http from 'node:http'
import { tmpdir } from 'node:os'
process.env.VERCEL = '1'
process.env.PHYSICS_LAB_DATA_DIR = process.env.PHYSICS_LAB_DATA_DIR || tmpdir() + '/plab-test-' + Date.now()

const { default: handler } = await import('../api/[...slug].js')

const server = http.createServer(handler)
await new Promise((r) => server.listen(3101, r))

async function req(method, path, body, headers = {}) {
  const r = await fetch('http://localhost:3101' + path, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...headers }
  })
  let j = null
  try { j = await r.json() } catch {}
  return { status: r.status, j }
}

const results = []
function check(name, ok, detail) {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

// 1. OPTIONS 预检
const o = await fetch('http://localhost:3101/api/login', { method: 'OPTIONS' })
check('OPTIONS 204 + CORS', o.status === 204 && o.headers.get('access-control-allow-origin') === '*')

// 2. 注册
const reg = await req('POST', '/api/register', { email: 'test@a.com', password: 'abc123456' })
check('注册 201 + token + 首个用户 admin', reg.status === 201 && !!reg.j.token && reg.j.user.role === 'admin', JSON.stringify(reg.j?.user))

// 3. 重复注册 409
const dup = await req('POST', '/api/register', { email: 'test@a.com', password: 'abc123456' })
check('重复注册 409', dup.status === 409)

// 4. 登录（含错误密码）
const bad = await req('POST', '/api/login', { email: 'test@a.com', password: 'wrong' })
check('错误密码 401', bad.status === 401)
const login = await req('POST', '/api/login', { email: 'test@a.com', password: 'abc123456' })
check('登录 200 + token', login.status === 200 && !!login.j.token)
const token = login.j.token

// 5. token 跨“实例”有效（无状态签名）+ /api/me
const me = await req('GET', '/api/me', null, { Authorization: 'Bearer ' + token })
check('/api/me 返回用户', me.status === 200 && me.j.user?.email === 'test@a.com')
const meAnon = await req('GET', '/api/me')
check('/api/me 未登录返回 null', meAnon.status === 200 && meAnon.j.user === null)
const meFake = await req('GET', '/api/me', null, { Authorization: 'Bearer ' + token.slice(0, -4) + 'zzzz' })
check('篡改 token 被拒', meFake.status === 200 && meFake.j.user === null)

// 6. 学习进度读写
const prog = await req('POST', '/api/progress', { progress: { records: { 'e-test': { done: true } }, sessions: 3, lastVisit: '2026-08-28' } }, { Authorization: 'Bearer ' + token })
check('保存进度 200', prog.status === 200 && prog.j.progress.sessions === 3)
const progGet = await req('GET', '/api/progress', null, { Authorization: 'Bearer ' + token })
check('读取进度一致', progGet.j.progress.sessions === 3 && progGet.j.progress.records['e-test'].done === true)

// 7. 修改密码
const cp = await req('POST', '/api/change-password', { oldPassword: 'abc123456', newPassword: 'xyz789012' }, { Authorization: 'Bearer ' + token })
check('修改密码 200', cp.status === 200)
const relogin = await req('POST', '/api/login', { email: 'test@a.com', password: 'xyz789012' })
check('新密码可登录', relogin.status === 200)

// 8. 忘记密码全流程（演示模式）
const rr = await req('POST', '/api/request-reset', { email: 'test@a.com' })
check('request-reset 演示模式返回 code', rr.status === 200 && rr.j.mode === 'demo' && !!rr.j.code, 'mode=' + rr.j?.mode)
const rsp = await req('POST', '/api/reset-password', { email: 'test@a.com', code: rr.j.code, newPassword: 'final123456' })
check('reset-password 200', rsp.status === 200)
const fin = await req('POST', '/api/login', { email: 'test@a.com', password: 'final123456' })
check('重置后密码可登录', fin.status === 200)

// 9. 管理员接口
const usersList = await req('GET', '/api/admin-users', null, { Authorization: 'Bearer ' + token })
check('admin-users 返回列表', usersList.status === 200 && Array.isArray(usersList.j.users) && usersList.j.users.length === 1)

// 10. 未知接口 404
const nf = await req('GET', '/api/nope')
check('未知接口 404', nf.status === 404)

server.close()
console.log(results.join('\n'))
const fails = results.filter((r) => r.startsWith('FAIL'))
console.log(`\n${results.length - fails.length}/${results.length} 通过`)
process.exit(fails.length ? 1 : 0)
