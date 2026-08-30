<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useProgressStore } from './stores/progress'
import { useAuthStore } from './stores/auth'
import { useLayoutStore } from './stores/layout'
import { boardTheme, toggleBoardVariant } from './lib/boardTheme'
import SideNav from './components/SideNav.vue'
import LoginModal from './components/LoginModal.vue'

const route = useRoute()
// 试卷资料库页不展示左侧实验目录（嵌入文档需要整行宽度）
const isResources = computed(() => route.path === '/resources')

const progress = useProgressStore()
const auth = useAuthStore()
const layout = useLayoutStore()

const showChangePwd = ref(false)
const showUserMenu = ref(false)
const pwdOld = ref('')
const pwdNew = ref('')
const pwdConfirm = ref('')
const pwdLoading = ref(false)
const pwdErr = ref('')
const pwdOk = ref(false)

// 管理员用户管理
const showUserMgmt = ref(false)
const userList = ref([])
const userMgmtLoading = ref(false)
const resetEmail = ref('')
const resetPwd = ref('')
const resetErr = ref('')
const resetOk = ref('')

async function openUserMgmt() {
  userMgmtLoading.value = true
  resetErr.value = ''
  resetOk.value = ''
  showUserMgmt.value = true
  try {
    const res = await auth.adminListUsers()
    userList.value = res.users
  } catch (e) {
    resetErr.value = e.message || '加载用户列表失败'
  } finally {
    userMgmtLoading.value = false
  }
}
function closeUserMgmt() { showUserMgmt.value = false }

async function submitAdminReset() {
  resetErr.value = ''
  resetOk.value = ''
  if (!resetEmail.value) { resetErr.value = '请选择用户'; return }
  if (resetPwd.value.length < 6) { resetErr.value = '新密码至少 6 位'; return }
  userMgmtLoading.value = true
  try {
    await auth.adminResetPassword(resetEmail.value, resetPwd.value)
    resetOk.value = `已重置 ${resetEmail.value} 的密码`
    resetPwd.value = ''
  } catch (e) {
    resetErr.value = e.message || '重置失败'
  } finally {
    userMgmtLoading.value = false
  }
}

function openChangePwd() {
  pwdOld.value = ''
  pwdNew.value = ''
  pwdConfirm.value = ''
  pwdErr.value = ''
  pwdOk.value = false
  showChangePwd.value = true
}
function closeChangePwd() { showChangePwd.value = false }

async function submitChangePwd() {
  pwdErr.value = ''
  pwdOk.value = false
  if (!pwdOld.value) { pwdErr.value = '请输入当前密码'; return }
  if (pwdNew.value.length < 6) { pwdErr.value = '新密码至少 6 位'; return }
  if (pwdNew.value !== pwdConfirm.value) { pwdErr.value = '两次输入的新密码不一致'; return }
  pwdLoading.value = true
  try {
    await auth.changePassword(pwdOld.value, pwdNew.value)
    pwdOk.value = true
    pwdOld.value = ''
    pwdNew.value = ''
    pwdConfirm.value = ''
  } catch (e) {
    pwdErr.value = e.message || '修改失败，请重试'
  } finally {
    pwdLoading.value = false
  }
}

// 收起/展开顶栏：切换 store 后，等顶栏高度过渡结束再重测吸顶偏移，
// 否则实验舞台会按旧的 --lab-stick-top 吸顶，与收起后的真实顶距错位。
function onToggleTopbar() {
  layout.toggleTopbar()
  window.requestAnimationFrame(() => syncStickTop())
  setTimeout(syncStickTop, 300)
}

// 实测全局顶栏渲染高度，写入 --lab-stick-top，使各实验动画舞台吸顶时
// 恰好贴在顶栏正下方（顶栏在移动端会换行变高，无法用固定常量）
function syncStickTop() {
  const tb = document.querySelector('.topbar')
  if (tb) document.documentElement.style.setProperty('--lab-stick-top', tb.offsetHeight + 'px')
}
function onResize() { syncStickTop() }

onMounted(() => {
  progress.startSession()
  auth.init()
  auth.loadSettings() // 付费实验名单（公开接口，游客也需要）
  // 移动端首屏默认收起目录（不持久化，避免影响桌面端的展开偏好）
  if (window.matchMedia('(max-width: 1180px)').matches) layout.navCollapsed = true
  // 首帧布局完成后再测量顶栏高度，避免字体未加载导致高度不准
  requestAnimationFrame(syncStickTop)
  window.addEventListener('resize', onResize)
  window.addEventListener('click', onGlobalClick)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('click', onGlobalClick)
})

function onGlobalClick() {
  if (showUserMenu.value) showUserMenu.value = false
}
</script>

<template>
  <div class="app-shell" :class="{ 'nav-collapsed': layout.navCollapsed, 'topbar-hidden': layout.topbarHidden }">
    <header class="topbar">
      <div class="brand-block">
        <div class="brand-mark" aria-hidden="true"></div>
        <div class="brand-text">
          <p class="eyebrow">初中物理 · 数学</p>
          <h1>自主自学实验平台</h1>
        </div>
        <RouterLink to="/record" class="progress-chip">⑤ 已通过 {{ progress.completedCount }} 个实验</RouterLink>
      </div>

      <div class="user-zone">
        <!-- 移动端：展开/收起侧边栏目录抽屉（桌面端隐藏；资料库页无目录） -->
        <button
          v-if="!isResources"
          class="nav-hamburger"
          type="button"
          :title="layout.navCollapsed ? '展开实验目录' : '收起实验目录'"
          :aria-label="layout.navCollapsed ? '展开实验目录' : '收起实验目录'"
          @click="layout.toggleNav()"
        >
          <span class="nav-toggle-icon">{{ layout.navCollapsed ? '☰' : '✕' }}</span>
        </button>
        <!-- 资料库页时此按钮变为返回实验平台入口 -->
        <RouterLink
          :to="isResources ? '/' : '/resources'"
          class="nav-toggle-top"
          :class="{ active: isResources }"
        >{{ isResources ? '实验平台' : '试卷资料库' }}</RouterLink>
        <!-- 管理员后台入口 -->
        <RouterLink v-if="auth.isAdmin" to="/admin" class="nav-toggle-top" :class="{ active: $route.path === '/admin' }">后台</RouterLink>
        <button
          class="nav-toggle-top"
          type="button"
          :aria-expanded="!layout.topbarHidden"
          :title="layout.topbarHidden ? '退出沉浸模式' : '进入沉浸模式（隐藏顶栏与边栏）'"
          @click="onToggleTopbar"
        >
          <span class="nav-toggle-icon">{{ layout.topbarHidden ? '⤢' : '⤡' }}</span>
          <span class="nav-toggle-text">{{ layout.topbarHidden ? '退出沉浸' : '沉浸模式' }}</span>
        </button>
        <button class="board-toggle" type="button" :title="boardTheme.variant === 'light' ? '切回深色黑板背景' : '切换为浅色背景'" @click="toggleBoardVariant">
          {{ boardTheme.variant === 'light' ? '🌑 黑板' : '🟨 浅色' }}
        </button>
        <template v-if="auth.isLoggedIn">
          <div class="user-menu" @click.stop>
            <button class="user-trigger" @click="showUserMenu = !showUserMenu">
              <span class="user-email" :title="auth.user?.email">{{ auth.user?.email }}</span>
            </button>
            <div v-if="showUserMenu" class="user-dropdown" @click.stop>
              <button v-if="auth.isAdmin" class="dropdown-item" @click="openUserMgmt(); showUserMenu = false">
                用户管理
              </button>
              <button class="dropdown-item" @click="openChangePwd(); showUserMenu = false">
                修改密码
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item dropdown-danger" @click="auth.logout(); showUserMenu = false">
                退出登录
              </button>
            </div>
          </div>
        </template>
        <button v-else class="btn btn-sm btn-primary" @click="auth.openLogin()">登录</button>
      </div>
    </header>

    <!-- 沉浸模式下的浮动退出按钮（常驻可点，点回正常布局） -->
    <button
      v-if="layout.topbarHidden"
      class="topbar-restore-fab"
      type="button"
      title="退出沉浸模式"
      aria-label="退出沉浸模式"
      @click="onToggleTopbar"
    >⤢ 退出沉浸</button>

    <div class="workspace">
      <SideNav v-if="!isResources" />
      <main class="main-grid">
        <RouterView />
      </main>
    </div>

    <footer class="app-footer">初中物理同步实验 · 学生自主学习平台</footer>

    <!-- 移动端抽屉遮罩：目录展开时点击收起（资料库页无目录，不渲染） -->
    <div
      class="nav-backdrop"
      v-if="!layout.navCollapsed && !isResources"
      @click="layout.setNav(true)"
      aria-hidden="true"
    ></div>

    <LoginModal v-if="auth.showLogin" />

    <!-- 修改密码弹窗 -->
    <div v-if="showChangePwd" class="modal-mask" @click.self="closeChangePwd">
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="修改密码">
        <button class="modal-close" aria-label="关闭" @click="closeChangePwd">×</button>
        <h2 class="modal-title">修改密码</h2>
        <p class="modal-sub">为了账号安全，请先验证当前密码</p>
        <form class="modal-form" @submit.prevent="submitChangePwd">
          <label class="field">
            <span>当前密码</span>
            <input v-model="pwdOld" type="password" autocomplete="current-password" placeholder="请输入当前密码" />
          </label>
          <label class="field">
            <span>新密码</span>
            <input v-model="pwdNew" type="password" autocomplete="new-password" placeholder="至少 6 位" />
          </label>
          <label class="field">
            <span>确认新密码</span>
            <input v-model="pwdConfirm" type="password" autocomplete="new-password" placeholder="再次输入新密码" />
          </label>
          <p v-if="pwdErr" class="form-error">{{ pwdErr }}</p>
          <p v-if="pwdOk" class="form-ok">密码修改成功！</p>
          <button class="btn btn-primary btn-block" type="submit" :disabled="pwdLoading">
            {{ pwdLoading ? '提交中…' : '确认修改' }}
          </button>
        </form>
      </div>
    </div>

    <!-- 管理员用户管理弹窗 -->
    <div v-if="showUserMgmt" class="modal-mask" @click.self="closeUserMgmt">
      <div class="modal-card modal-card-lg" role="dialog" aria-modal="true" aria-label="用户管理">
        <button class="modal-close" aria-label="关闭" @click="closeUserMgmt">×</button>
        <h2 class="modal-title">用户管理</h2>
        <p class="modal-sub">查看所有用户并直接重置密码</p>

        <div v-if="userMgmtLoading && userList.length === 0" class="mgmt-loading">加载中…</div>

        <div v-else class="user-list">
          <div v-for="u in userList" :key="u.email" class="user-item" :class="{ selected: resetEmail === u.email }" @click="resetEmail = u.email">
            <div class="user-info">
              <span class="user-email-text">{{ u.email }}</span>
              <span class="user-badge" :class="u.role">{{ u.role === 'admin' ? '管理员' : '普通用户' }}</span>
            </div>
            <span v-if="u.createdAt" class="user-created">{{ new Date(u.createdAt).toLocaleDateString() }}</span>
          </div>
        </div>

        <form class="modal-form" @submit.prevent="submitAdminReset">
          <label class="field">
            <span>选择用户</span>
            <select v-model="resetEmail" class="field-select">
              <option value="">-- 请选择要重置密码的用户 --</option>
              <option v-for="u in userList" :key="u.email" :value="u.email">{{ u.email }}</option>
            </select>
          </label>
          <label class="field">
            <span>新密码</span>
            <input v-model="resetPwd" type="password" placeholder="至少 6 位" />
          </label>
          <p v-if="resetErr" class="form-error">{{ resetErr }}</p>
          <p v-if="resetOk" class="form-ok">{{ resetOk }}</p>
          <button class="btn btn-primary btn-block" type="submit" :disabled="userMgmtLoading">
            {{ userMgmtLoading ? '提交中…' : '重置该用户密码' }}
          </button>
        </form>
      </div>
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
.modal-title { font-size: 20px; }
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
.modal-card-lg {
  width: min(520px, 100%);
  max-height: 80vh;
  overflow-y: auto;
}
.mgmt-loading {
  text-align: center;
  padding: 30px;
  color: var(--text-dim);
}
.user-list {
  max-height: 180px;
  overflow-y: auto;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  margin-bottom: 14px;
}
.user-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
  cursor: pointer;
  transition: background 0.15s;
}
.user-item:last-child { border-bottom: none; }
.user-item:hover { background: rgba(0,0,0,0.04); }
.user-item.selected { background: var(--accent-soft); }
.user-info { display: flex; align-items: center; gap: 8px; }
.user-email-text { font-weight: 700; color: var(--text-h); }
.user-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  background: #ddd;
  color: #555;
}
.user-badge.admin { background: #ff6b6b; color: #fff; }
.user-badge.user { background: #e0e0e0; color: #666; }
.user-created { font-size: 12px; color: var(--text-dim); }
.field-select {
  height: 42px;
  padding: 0 12px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text-h);
  outline: none;
}

/* ===== 用户下拉菜单 ===== */
.user-menu {
  position: relative;
  display: inline-block;
}
.user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text-h);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.user-trigger:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.user-email {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 100%;
  padding: 6px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: 4px 4px 0 rgba(0,0,0,0.15);
  z-index: 1000;
}
.dropdown-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 14px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-h);
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;
}
.dropdown-item:hover {
  background: var(--accent-soft);
  color: var(--accent-strong);
}
.dropdown-item.dropdown-danger {
  color: var(--danger);
}
.dropdown-item.dropdown-danger:hover {
  background: var(--danger-bg);
  color: var(--danger);
}
.dropdown-divider {
  height: 1px;
  margin: 4px 8px;
  background: var(--line);
}
</style>
