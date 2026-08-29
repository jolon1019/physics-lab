<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import * as api from '../lib/api'

const auth = useAuthStore()
const router = useRouter()

const mode = ref('login') // login | register | forgot
const email = ref('')
const password = ref('')
const loading = ref(false)
const err = ref('')

// 注册验证码流程
const regCode = ref('')
const regCodeSending = ref(false)
const regCountdown = ref(0)
const regIsEmailMode = ref(false) // true=邮件已发送  false=演示模式
const regReceivedCode = ref('')
let regTimer = null

function startRegCountdown() {
  regCountdown.value = 60
  if (regTimer) clearInterval(regTimer)
  regTimer = setInterval(() => {
    regCountdown.value--
    if (regCountdown.value <= 0) clearInterval(regTimer)
  }, 1000)
}

function resetRegState() {
  regCode.value = ''
  regCodeSending.value = false
  regCountdown.value = 0
  regIsEmailMode.value = false
  regReceivedCode.value = ''
  if (regTimer) {
    clearInterval(regTimer)
    regTimer = null
  }
}

onBeforeUnmount(() => regTimer && clearInterval(regTimer))

// 忘记密码流程
const forgotStep = ref(1) // 1:输入邮箱  2:输入验证码+新密码
const forgotEmail = ref('')
const forgotCode = ref('')
const forgotNewPwd = ref('')
const forgotConfirm = ref('')
const forgotLoading = ref(false)
const forgotErr = ref('')
const forgotOk = ref('')
const receivedCode = ref('')
const isEmailMode = ref(false) // true=邮件已发送  false=演示模式

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function switchMode(m) {
  mode.value = m
  err.value = ''
  resetRegState()
  if (m !== 'forgot') {
    forgotStep.value = 1
    forgotEmail.value = ''
    forgotCode.value = ''
    forgotNewPwd.value = ''
    forgotConfirm.value = ''
    forgotErr.value = ''
    forgotOk.value = ''
    receivedCode.value = ''
    isEmailMode.value = false
  }
}

async function requestRegCode() {
  err.value = ''
  const mail = email.value.trim().toLowerCase()
  if (!EMAIL_RE.test(mail)) {
    err.value = '请先输入有效的邮箱地址'
    return
  }
  regCodeSending.value = true
  try {
    const res = await api.requestRegisterCode(mail)
    if (res.mode === 'email') {
      regIsEmailMode.value = true
      regReceivedCode.value = ''
    } else {
      regIsEmailMode.value = false
      regReceivedCode.value = res.code || ''
    }
    startRegCountdown()
  } catch (e) {
    err.value = e.message || '发送验证码失败'
  } finally {
    regCodeSending.value = false
  }
}

async function submit() {
  err.value = ''
  const mail = email.value.trim().toLowerCase()
  if (!EMAIL_RE.test(mail)) {
    err.value = '请输入有效的邮箱地址'
    return
  }
  if (password.value.length < 6) {
    err.value = '密码至少 6 位'
    return
  }
  if (mode.value === 'register' && !regCode.value.trim()) {
    err.value = '请先获取并输入邮箱验证码'
    return
  }
  loading.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(mail, password.value)
    } else {
      await auth.register(mail, password.value, regCode.value.trim().toUpperCase())
    }
    password.value = ''
    // 登录成功且存在待跳转页面时，跳转过去
    if (auth.pendingRoute) {
      const target = auth.pendingRoute
      auth.pendingRoute = null
      router.push(target)
    }
  } catch (e) {
    err.value = e.message || '操作失败，请重试'
  } finally {
    loading.value = false
  }
}

async function requestForgotCode() {
  forgotErr.value = ''
  forgotOk.value = ''
  const mail = forgotEmail.value.trim().toLowerCase()
  if (!EMAIL_RE.test(mail)) {
    forgotErr.value = '请输入有效的邮箱地址'
    return
  }
  forgotLoading.value = true
  try {
    const res = await api.requestReset(mail)
    if (res.mode === 'email') {
      isEmailMode.value = true
      receivedCode.value = ''
    } else {
      isEmailMode.value = false
      receivedCode.value = res.code || ''
    }
    forgotStep.value = 2
  } catch (e) {
    forgotErr.value = e.message || '申请验证码失败'
  } finally {
    forgotLoading.value = false
  }
}

async function submitForgotReset() {
  forgotErr.value = ''
  forgotOk.value = ''
  if (!forgotCode.value) {
    forgotErr.value = '请输入验证码'
    return
  }
  if (forgotNewPwd.value.length < 6) {
    forgotErr.value = '新密码至少 6 位'
    return
  }
  if (forgotNewPwd.value !== forgotConfirm.value) {
    forgotErr.value = '两次输入的密码不一致'
    return
  }
  forgotLoading.value = true
  try {
    await api.resetPassword(forgotCode.value, forgotEmail.value.trim().toLowerCase(), forgotNewPwd.value)
    forgotOk.value = '密码已重置！请用新密码登录'
    forgotStep.value = 3
  } catch (e) {
    forgotErr.value = e.message || '重置失败'
  } finally {
    forgotLoading.value = false
  }
}

function close() {
  auth.closeLogin()
}
</script>

<template>
  <div class="modal-mask" @click.self="close">
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="登录或注册">
      <button class="modal-close" aria-label="关闭" @click="close">×</button>

      <div class="modal-tabs">
        <button :class="['tab', { active: mode === 'login' }]" @click="switchMode('login')">登录</button>
        <button :class="['tab', { active: mode === 'register' }]" @click="switchMode('register')">注册</button>
      </div>

      <!-- 登录 / 注册 -->
      <template v-if="mode !== 'forgot'">
        <h2 class="modal-title">{{ mode === 'login' ? '登录自主自学实验平台' : '注册新账号' }}</h2>
        <p class="modal-sub">{{ mode === 'login' ? '邮箱 + 密码，学习进度将保存到你的账号' : '邮箱验证码 + 密码注册，学习进度保存到你的账号' }}</p>

        <form class="modal-form" @submit.prevent="submit">
          <label class="field">
            <span>邮箱</span>
            <input v-model="email" type="email" autocomplete="email" placeholder="you@example.com" />
          </label>

          <template v-if="mode === 'register'">
            <div v-if="regIsEmailMode" class="form-hint">
              ✓ 验证码已发送到 <u>{{ email }}</u>，请查收邮件
            </div>
            <div v-else-if="regReceivedCode" class="form-hint">
              验证码：<strong>{{ regReceivedCode }}</strong>（演示模式，请复制后在下方输入）
            </div>
            <label class="field">
              <span>验证码</span>
              <div class="code-row">
                <input v-model="regCode" type="text" maxlength="6" placeholder="6 位验证码" />
                <button
                  class="btn code-btn"
                  type="button"
                  :disabled="regCodeSending || regCountdown > 0"
                  @click="requestRegCode"
                >
                  {{ regCountdown > 0 ? `${regCountdown}s 后重发` : regCodeSending ? '发送中…' : '发送验证码' }}
                </button>
              </div>
            </label>
          </template>

          <label class="field">
            <span>密码</span>
            <input v-model="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" placeholder="至少 6 位" />
          </label>

          <p v-if="err" class="form-error">{{ err }}</p>

          <button class="btn btn-primary btn-block" type="submit" :disabled="loading">
            {{ loading ? '处理中…' : mode === 'login' ? '登录' : '注册并登录' }}
          </button>
        </form>

        <p class="modal-switch">
          <template v-if="mode === 'login'">
            还没有账号？<button class="link" @click="switchMode('register')">去注册</button>
            ·<button class="link" @click="switchMode('forgot')">忘记密码？</button>
          </template>
          <template v-else>
            已有账号？<button class="link" @click="switchMode('login')">去登录</button>
          </template>
        </p>
      </template>

      <!-- 忘记密码 -->
      <template v-else>
        <h2 class="modal-title">找回密码</h2>
        <p class="modal-sub">输入注册邮箱，获取验证码重置密码</p>

        <!-- 步骤 1：输入邮箱 -->
        <form v-if="forgotStep === 1" class="modal-form" @submit.prevent="requestForgotCode">
          <label class="field">
            <span>注册邮箱</span>
            <input v-model="forgotEmail" type="email" autocomplete="email" placeholder="you@example.com" />
          </label>
          <p v-if="forgotErr" class="form-error">{{ forgotErr }}</p>
          <button class="btn btn-primary btn-block" type="submit" :disabled="forgotLoading">
            {{ forgotLoading ? '发送中…' : '获取验证码' }}
          </button>
        </form>

        <!-- 步骤 2：验证码 + 新密码 -->
        <form v-else-if="forgotStep === 2" class="modal-form" @submit.prevent="submitForgotReset">
          <div v-if="isEmailMode" class="form-hint">
            ✓ 验证码已发送到 <strong>{{ forgotEmail }}</strong>，请查收邮件并输入验证码
          </div>
          <div v-else-if="receivedCode" class="form-hint">
            验证码：<strong>{{ receivedCode }}</strong>（请复制后在下方输入框中粘贴）
          </div>
          <label class="field">
            <span>验证码</span>
            <input v-model="forgotCode" type="text" maxlength="6" placeholder="请输入 6 位验证码" />
          </label>
          <label class="field">
            <span>新密码</span>
            <input v-model="forgotNewPwd" type="password" placeholder="至少 6 位" />
          </label>
          <label class="field">
            <span>确认新密码</span>
            <input v-model="forgotConfirm" type="password" placeholder="再次输入新密码" />
          </label>
          <p v-if="forgotErr" class="form-error">{{ forgotErr }}</p>
          <button class="btn btn-primary btn-block" type="submit" :disabled="forgotLoading">
            {{ forgotLoading ? '提交中…' : '重置密码' }}
          </button>
        </form>

        <!-- 步骤 3：重置成功 -->
        <div v-else class="modal-form">
          <p class="form-ok">✓ {{ forgotOk }}</p>
          <button class="btn btn-primary btn-block" @click="switchMode('login')">返回登录</button>
        </div>

        <p class="modal-switch">
          <button class="link" @click="switchMode('login')">返回登录</button>
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(5, 5, 5, 0.45);
  backdrop-filter: blur(3px);
}

.modal-card {
  position: relative;
  width: min(420px, 100%);
  padding: 26px 26px 22px;
  border: 2px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.modal-close {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 32px;
  height: 32px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text-h);
  font-size: 18px;
  line-height: 1;
}
.modal-close:hover {
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.modal-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.tab {
  flex: 1;
  min-height: 38px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text);
  font-weight: 800;
}
.tab.active {
  background: #050505;
  color: #fff;
  border-color: #050505;
}

.modal-title {
  font-size: 20px;
}
.modal-sub {
  margin: 6px 0 18px;
  color: var(--text-dim);
  font-size: 13px;
}

.modal-form {
  display: grid;
  gap: 14px;
}
.field {
  display: grid;
  gap: 6px;
}
.field span {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-h);
}
.field input {
  height: 42px;
  padding: 0 12px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text-h);
  outline: none;
}
.field input:focus {
  border-color: var(--accent);
  box-shadow: 3px 3px 0 var(--accent);
}

/* 验证码输入行：输入框 + 发送按钮 同行 */
.code-row {
  display: flex;
  gap: 8px;
}
.code-row input {
  flex: 1;
  min-width: 0;
}
.code-btn {
  flex: 0 0 auto;
  height: 42px;
  padding: 0 14px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text-h);
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}
.code-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.code-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent-strong);
}
.form-hint u {
  text-underline-offset: 3px;
}

.form-error {
  margin: 0;
  padding: 10px 12px;
  border: 2px solid var(--danger);
  border-radius: var(--radius-sm);
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 13px;
  font-weight: 700;
}

.form-hint {
  margin: 0;
  padding: 10px 12px;
  border: 2px solid #3b6fd4;
  border-radius: var(--radius-sm);
  background: #e8f0fe;
  color: #2a4a8a;
  font-size: 13px;
}
.form-hint strong {
  font-size: 18px;
  letter-spacing: 4px;
  color: #3b6fd4;
}

.form-ok {
  margin: 0;
  padding: 10px 12px;
  border: 2px solid #2ecc71;
  border-radius: var(--radius-sm);
  background: #e8f8ef;
  color: #27ae60;
  font-size: 13px;
  font-weight: 700;
}

.modal-switch {
  margin: 16px 0 0;
  text-align: center;
  color: var(--text-dim);
  font-size: 13px;
}
.link {
  border: 0;
  background: none;
  padding: 0;
  color: var(--accent-strong);
  font-weight: 800;
  text-decoration: underline;
  cursor: pointer;
}
</style>
