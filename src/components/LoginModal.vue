<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const mode = ref('login') // login | register
const email = ref('')
const password = ref('')
const loading = ref(false)
const err = ref('')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function switchMode(m) {
  mode.value = m
  err.value = ''
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
  loading.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(mail, password.value)
    } else {
      await auth.register(mail, password.value)
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

      <h2 class="modal-title">{{ mode === 'login' ? '登录物理实验平台' : '注册新账号' }}</h2>
      <p class="modal-sub">邮箱 + 密码，学习进度将保存到你的账号</p>

      <form class="modal-form" @submit.prevent="submit">
        <label class="field">
          <span>邮箱</span>
          <input v-model="email" type="email" autocomplete="email" placeholder="you@example.com" />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="current-password" placeholder="至少 6 位" />
        </label>

        <p v-if="err" class="form-error">{{ err }}</p>

        <button class="btn btn-primary btn-block" type="submit" :disabled="loading">
          {{ loading ? '处理中…' : mode === 'login' ? '登录' : '注册并登录' }}
        </button>
      </form>

      <p class="modal-switch">
        <template v-if="mode === 'login'">
          还没有账号？<button class="link" @click="switchMode('register')">去注册</button>
        </template>
        <template v-else>
          已有账号？<button class="link" @click="switchMode('login')">去登录</button>
        </template>
      </p>
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
