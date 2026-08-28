// 清理 Blob 中的测试 probe 账号，恢复为空库（容忍本地网络波动，以 get() 读回结果为准）
import { loadUsers, saveUsers } from '../server/core.mjs'

const PROBE = 'blob-roundtrip@probe.test'

async function attempt() {
  const users = await loadUsers()
  const others = users.filter((u) => u.email !== PROBE)
  console.log(`当前 ${users.length} 个用户，其中 probe ${users.length - others.length} 个`)
  if (others.length !== users.length) {
    await saveUsers(others) // 本地 put 可能报错，但上传通常已生效
  }
  const verify = await loadUsers()
  const left = verify.filter((u) => u.email === PROBE).length
  console.log(`验证：probe 剩余 ${left} 个，共 ${verify.length} 个用户`)
  return left === 0
}

for (let i = 1; i <= 3; i++) {
  try {
    if (await attempt()) {
      console.log('DONE：Blob 已清理干净')
      process.exit(0)
    }
  } catch (e) {
    console.log(`attempt ${i} 网络波动: ${e.message}`)
  }
}
console.error('FAIL：清理未确认成功')
process.exit(1)
