// 清理本地测试残留：probe 用户 + pending 验证码
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'server', 'data')

const usersPath = join(dataDir, 'users.json')
if (existsSync(usersPath)) {
  const users = JSON.parse(readFileSync(usersPath, 'utf8'))
  const cleaned = users.filter((u) => !String(u.email).endsWith('@test.invalid'))
  writeFileSync(usersPath, JSON.stringify(cleaned, null, 2))
  console.log(`users.json: ${users.length} -> ${cleaned.length}`)
}

const pendingPath = join(dataDir, 'pending-codes.json')
if (existsSync(pendingPath)) {
  unlinkSync(pendingPath)
  console.log('pending-codes.json: 已删除')
}
