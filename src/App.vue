<script setup>
import { onMounted } from 'vue'
import { useProgressStore } from './stores/progress'
import { useAuthStore } from './stores/auth'
import { useLayoutStore } from './stores/layout'
import { boardTheme, toggleBoardVariant } from './lib/boardTheme'
import SideNav from './components/SideNav.vue'
import LoginModal from './components/LoginModal.vue'

const progress = useProgressStore()
const auth = useAuthStore()
const layout = useLayoutStore()
onMounted(() => {
  progress.startSession()
  auth.init()
  // 移动端首屏默认收起目录（不持久化，避免影响桌面端的展开偏好）
  if (window.matchMedia('(max-width: 1180px)').matches) layout.navCollapsed = true
})
</script>

<template>
  <div class="app-shell" :class="{ 'nav-collapsed': layout.navCollapsed }">
    <header class="topbar">
      <div class="brand-block">
        <div class="brand-mark" aria-hidden="true"></div>
        <div class="brand-text">
          <p class="eyebrow">初中物理</p>
          <h1>物理实验平台</h1>
        </div>
        <RouterLink to="/record" class="progress-chip">⑤ 已通过 {{ progress.completedCount }} 个实验</RouterLink>
      </div>

      <div class="user-zone">
        <button class="board-toggle" type="button" :title="boardTheme.variant === 'light' ? '切回深色黑板背景' : '切换为浅色背景'" @click="toggleBoardVariant">
          {{ boardTheme.variant === 'light' ? '🌑 黑板' : '🟨 浅色' }}
        </button>
        <template v-if="auth.isLoggedIn">
          <span class="user-email" :title="auth.user?.email">{{ auth.user?.email }}</span>
          <button class="btn btn-sm" @click="auth.logout()">退出</button>
        </template>
        <button v-else class="btn btn-sm btn-primary" @click="auth.openLogin()">登录</button>
      </div>
    </header>

    <div class="workspace">
      <SideNav />
      <main class="main-grid">
        <RouterView />
      </main>
    </div>

    <footer class="app-footer">初中物理同步实验 · 学生自主学习平台</footer>

    <!-- 移动端抽屉遮罩：目录展开时点击收起 -->
    <div
      class="nav-backdrop"
      v-if="!layout.navCollapsed"
      @click="layout.setNav(true)"
      aria-hidden="true"
    ></div>

    <!-- 移动端悬浮按钮：目录收起时一键打开 -->
    <button
      class="nav-fab"
      v-if="layout.navCollapsed"
      @click="layout.setNav(false)"
      aria-label="打开实验目录"
    >≡</button>

    <LoginModal v-if="auth.showLogin" />
  </div>
</template>
