// 注册验证码流程接口回环测试（演示模式降级路径）
const BASE = 'http://localhost:3099/api'
const EMAIL = 'probe-reg@test.invalid' // 假域名 → SMTP 发送失败 → 自动降级演示模式
let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name}  ${extra}`) }
}
async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

// 1. 发送注册验证码（假域名邮箱 → 演示模式返回 code）
const r1 = await post('/register-code', { email: EMAIL })
check('register-code 返回 200', r1.status === 200, JSON.stringify(r1))
check('register-code 演示模式返回验证码', r1.data?.mode === 'demo' && /^[0-9A-F]{6}$/.test(r1.data?.code || ''), JSON.stringify(r1.data))
const code = r1.data?.code

// 2. 60 秒内重复发送 → 429
const r2 = await post('/register-code', { email: EMAIL })
check('60s 内重复发送被限频 429', r2.status === 429, JSON.stringify(r2))

// 3. 缺验证码注册 → 400
const r3 = await post('/register', { email: EMAIL, password: 'probe123456' })
check('缺验证码注册被拒 400', r3.status === 400, JSON.stringify(r3))

// 4. 错误验证码 → 400
const r4 = await post('/register', { email: EMAIL, password: 'probe123456', code: '000000' })
check('错误验证码被拒 400', r4.status === 400, JSON.stringify(r4))

// 5. 正确验证码 → 201 并返回 token
const r5 = await post('/register', { email: EMAIL, password: 'probe123456', code })
check('正确验证码注册成功 201', r5.status === 201, JSON.stringify(r5))
check('注册返回 token 与 user', !!r5.data?.token && r5.data?.user?.email === EMAIL, JSON.stringify(r5.data))

// 6. 验证码一次性：用同一验证码再注册 → 400（验证码已消费）
const r6 = await post('/register', { email: 'probe-reg2@test.invalid', password: 'probe123456', code })
check('验证码一次性消费 400', r6.status === 400, JSON.stringify(r6))

// 7. 新用户登录
const r7 = await post('/login', { email: EMAIL, password: 'probe123456' })
check('注册后登录成功', r7.status === 200, JSON.stringify(r7))

// 8. 忘记密码流程不受影响（冒烟）
const r8 = await post('/request-reset', { email: EMAIL })
check('忘记密码流程正常', r8.status === 200 && (r8.data?.mode === 'demo' || r8.data?.mode === 'email'), JSON.stringify(r8.data))

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
