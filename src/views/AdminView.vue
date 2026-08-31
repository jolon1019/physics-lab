<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { GRADES } from '../data/experiments'

const auth = useAuthStore()

const tab = ref('users')
const users = ref([])
const loading = ref(false)
const errMsg = ref('')
const okMsg = ref('')

// 重置密码的行内编辑状态
const resetFor = ref('') // 正在重置密码的用户邮箱
const resetPwd = ref('')

// 付费实验设置
const paidSet = ref(new Set())
const settingsDirty = ref(false)
const savingSettings = ref(false)

function flashOk(msg) {
  okMsg.value = msg
  errMsg.value = ''
  setTimeout(() => { okMsg.value = '' }, 2500)
}
function flashErr(msg) {
  errMsg.value = msg
  okMsg.value = ''
  setTimeout(() => { errMsg.value = '' }, 3000)
}

async function loadUsers() {
  loading.value = true
  errMsg.value = ''
  try {
    const res = await auth.adminListUsers()
    users.value = res.users
  } catch (e) {
    errMsg.value = e.message || '加载用户失败'
  } finally {
    loading.value = false
  }
}

async function loadSettings() {
  try {
    const s = await auth.adminGetSettings()
    paidSet.value = new Set(s.paidExperiments || [])
    settingsDirty.value = false
  } catch (e) {
    errMsg.value = e.message || '加载设置失败'
  }
}

onMounted(() => {
  if (auth.isAdmin) {
    loadUsers()
    loadSettings()
  }
})

async function setRole(u, role) {
  try {
    await auth.adminSetRole(u.email, role)
    u.role = role
    flashOk(`已将 ${u.email} 设为${role === 'admin' ? '管理员' : '普通用户'}`)
  } catch (e) {
    flashErr(e.message || '操作失败')
  }
}

async function setMembership(u, plan) {
  try {
    await auth.adminSetMembership(u.email, plan)
    // 乐观更新前端状态
    const now = new Date()
    let expiresAt = null
    if (plan === 'monthly') expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    else if (plan === 'yearly') expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString()
    u.membership = { plan, expiresAt, isMember: plan !== 'free' }
    const labels = { free: '免费', monthly: '月卡', yearly: '年卡', permanent: '买断' }
    flashOk(`已将 ${u.email} 设为${labels[plan] || plan}`)
  } catch (e) {
    flashErr(e.message || '操作失败')
  }
}

async function doReset(u) {
  if (resetPwd.value.length < 6) {
    flashErr('新密码至少 6 位')
    return
  }
  try {
    await auth.adminResetPassword(u.email, resetPwd.value)
    flashOk(`已重置 ${u.email} 的密码`)
    resetFor.value = ''
    resetPwd.value = ''
  } catch (e) {
    flashErr(e.message || '重置失败')
  }
}

function togglePaid(expId) {
  if (paidSet.value.has(expId)) paidSet.value.delete(expId)
  else paidSet.value.add(expId)
  settingsDirty.value = true
}

async function savePaid() {
  savingSettings.value = true
  try {
    await auth.adminSaveSettings([...paidSet.value])
    // 同步到本地门禁（立即生效，不用刷新）
    auth.paidExperiments = [...paidSet.value]
    settingsDirty.value = false
    flashOk('实验权限已保存并立即生效')
  } catch (e) {
    flashErr(e.message || '保存失败')
  } finally {
    savingSettings.value = false
  }
}

const paidCount = computed(() => paidSet.value.size)
const memberCount = computed(() => users.value.filter((u) => u.membership && u.membership.plan !== 'free').length)

function planLabel(m) {
  if (!m || !m.plan || m.plan === 'free') return '免费'
  const labels = { monthly: '月卡', yearly: '年卡', permanent: '买断' }
  let label = labels[m.plan] || m.plan
  if (m.expiresAt) label += ' · ' + new Date(m.expiresAt).toLocaleDateString()
  return label
}
</script>

<template>
  <div v-if="!auth.isAdmin" class="panel" style="padding: 30px; text-align: center">
    <p style="font-weight: 800">仅管理员可访问此页面</p>
    <p style="color: var(--text-dim); font-size: 13px; margin-top: 6px">请使用管理员账号登录后再试</p>
  </div>

  <div v-else>
    <h2 class="page-title">管理后台</h2>
    <p class="page-sub">用户 · 会员 · 实验权限一览</p>

    <div class="admin-tabs">
      <button class="btn" :class="{ 'btn-primary': tab === 'users' }" @click="tab = 'users'">用户管理</button>
      <button class="btn" :class="{ 'btn-primary': tab === 'experiments' }" @click="tab = 'experiments'">实验权限</button>
      <span v-if="okMsg" class="flash ok">{{ okMsg }}</span>
      <span v-if="errMsg" class="flash no">{{ errMsg }}</span>
    </div>

    <!-- ===== 用户管理 ===== -->
    <section v-if="tab === 'users'" class="panel">
      <div class="tbl-head">
        <span>共 {{ users.length }} 个用户 · 会员 {{ memberCount }} 个</span>
        <button class="btn btn-sm" @click="loadUsers">刷新</button>
      </div>
      <table class="admin-table">
        <thead>
          <tr><th>邮箱</th><th>角色</th><th>会员</th><th>注册时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.email">
            <td class="email">{{ u.email }}</td>
            <td>
              <select class="cell-select" :value="u.role" :disabled="u.email === auth.user?.email" @change="setRole(u, $event.target.value)">
                <option value="user">用户</option>
                <option value="admin">管理员</option>
              </select>
            </td>
            <td>
              <select class="cell-select" :value="u.membership && u.membership.plan" @change="setMembership(u, $event.target.value)">
                <option value="free">免费</option>
                <option value="monthly">月卡</option>
                <option value="yearly">年卡</option>
                <option value="permanent">买断</option>
              </select>
              <span v-if="u.membership && u.membership.plan !== 'free'" class="plan-expiry">{{ planLabel(u.membership) }}</span>
            </td>
            <td class="muted">{{ u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—' }}</td>
            <td>
              <button class="btn btn-sm" @click="resetFor = resetFor === u.email ? '' : u.email">重置密码</button>
              <span v-if="resetFor === u.email" class="reset-box">
                <input v-model="resetPwd" type="text" placeholder="新密码（≥6位）" />
                <button class="btn btn-sm btn-primary" @click="doReset(u)">确定</button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- ===== 实验权限 ===== -->
    <section v-if="tab === 'experiments'" class="panel">
      <div class="tbl-head">
        <span>勾选的实验为<b>会员专享</b>，未勾选对所有人免费；保存后立即生效</span>
        <button class="btn btn-primary btn-sm" :disabled="!settingsDirty || savingSettings" @click="savePaid">
          {{ savingSettings ? '保存中…' : '保存设置' }}
        </button>
      </div>
      <p class="paid-summary">当前会员专享实验：{{ paidCount }} 个</p>
      <div v-for="g in GRADES" :key="g.grade" class="grade-block">
        <p class="grade-name">{{ g.label }}<span class="grade-tag">{{ g.subject === 'math' ? '数学' : '物理' }}</span></p>
        <label v-for="e in g.experiments" :key="e.id" class="exp-row">
          <input type="checkbox" :checked="paidSet.has(e.id)" @change="togglePaid(e.id)" />
          <span class="exp-title">{{ e.title }}</span>
          <span class="exp-state" :class="{ paid: paidSet.has(e.id) }">{{ paidSet.has(e.id) ? '会员专享' : '免费' }}</span>
        </label>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0;
}
.flash {
  font-size: 13px;
  font-weight: 800;
}
.flash.ok { color: #27ae60; }
.flash.no { color: var(--danger, #d33); }
.tbl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-2);
}
.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}
.admin-table th,
.admin-table td {
  text-align: left;
  padding: 9px 10px;
  border-bottom: 1px solid var(--line);
}
.admin-table th {
  font-size: 12px;
  color: var(--text-dim);
}
.admin-table .email { font-weight: 700; }
.admin-table .muted { color: var(--text-dim); }
.cell-select {
  height: 30px;
  padding: 0 6px;
  border: 1.5px solid var(--line);
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
}
.plan-expiry {
  display: inline-block;
  margin-left: 6px;
  font-size: 11px;
  color: var(--text-dim);
}
.reset-box {
  display: inline-flex;
  gap: 6px;
  margin-left: 8px;
}
.reset-box input {
  height: 30px;
  width: 150px;
  padding: 0 8px;
  border: 1.5px solid var(--line);
  border-radius: 6px;
  outline: none;
}
.paid-summary {
  font-size: 13px;
  font-weight: 800;
  color: var(--accent-strong, #b8860b);
  margin: 0 0 12px;
}
.grade-block { margin-bottom: 18px; }
.grade-name {
  font-weight: 900;
  font-size: 14.5px;
  margin: 0 0 8px;
}
.grade-tag {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 800;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--accent-soft, #ffe9a8);
  color: var(--accent-strong, #b8860b);
}
.exp-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.exp-row:hover { background: rgba(0, 0, 0, 0.04); }
.exp-row input { accent-color: var(--accent, #e0584f); }
.exp-title { font-size: 13.5px; flex: 1; }
.exp-state {
  font-size: 11.5px;
  font-weight: 800;
  padding: 2px 10px;
  border-radius: 10px;
  background: #e8f8ef;
  color: #27ae60;
}
.exp-state.paid {
  background: var(--accent-soft, #ffe9a8);
  color: var(--accent-strong, #b8860b);
}
</style>
