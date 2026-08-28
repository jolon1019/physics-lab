<script setup>
/**
 * 通用全屏按钮 —— 供所有 .lab-stage 实验使用
 *
 * 三层策略（逐层兜底，保证任何设备上都有效）：
 * ① 模拟全屏：点击立即给 .lab-stage 加 is-fullscreen class（CSS fixed 覆盖层，
 *    布局规则统一在全局 style.css 的 .lab-stage.is-fullscreen 块）——即使浏览器
 *    不支持对 div 的原生全屏（如 iOS Safari），也能获得"动画 + 右侧参数并排"
 *    的满屏体验，修复此前点击无效或页面错位的问题。
 * ② 原生全屏：在支持的环境下再请求 Fullscreen API，隐藏系统状态栏/导航栏。
 * ③ 横屏锁定：原生全屏成功后尝试 screen.orientation.lock('landscape')，
 *    让动画以横向宽幅显示；不支持时静默跳过（模拟全屏本身自适应）。
 *
 * 退出时按相反顺序恢复：解锁方向 → 退原生全屏 → 移除模拟全屏 class。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const btnEl = ref(null)
const isFullscreen = ref(false)

function stage() {
  return btnEl.value?.closest('.lab-stage') || null
}

function fsElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null
}

async function lockLandscape() {
  try {
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      await screen.orientation.lock('landscape')
      return true
    }
  } catch {
    /* 无权限或不支持（iOS）：静默跳过 */
  }
  return false
}

function unlockOrientation() {
  try {
    if (screen.orientation && typeof screen.orientation.unlock === 'function') {
      screen.orientation.unlock()
    }
  } catch {
    /* 忽略 */
  }
}

async function enterFullscreen(el) {
  // ① 先切模拟全屏：无原生 API 也立即可见、不错位
  el.classList.add('is-fullscreen')
  isFullscreen.value = true
  // ② 尝试原生全屏；被拒（无用户手势权限策略等）时保持模拟模式即可
  const p = el.requestFullscreen?.() || el.webkitRequestFullscreen?.()
  if (p && p.catch) p.catch(() => {})
  // ③ 尝试锁横屏（Android 生效；iOS 跳过）
  await lockLandscape()
}

async function exitFullscreen(el) {
  unlockOrientation()
  if (fsElement()) {
    const p = document.exitFullscreen?.() || document.webkitExitFullscreen?.()
    if (p && p.catch) p.catch(() => {})
  }
  el.classList.remove('is-fullscreen')
  isFullscreen.value = false
}

async function toggleFullscreen() {
  const el = stage()
  if (!el) return
  if (!isFullscreen.value && !fsElement()) await enterFullscreen(el)
  else await exitFullscreen(el)
}

// 原生全屏状态变化（含系统手势退出/ESC）时同步 class 与按钮文案
function sync() {
  const fe = fsElement()
  const el = stage()
  const active = !!(fe && fe.closest && fe.closest('.lab-stage'))
  isFullscreen.value = active
  if (el) el.classList.toggle('is-fullscreen', active)
  if (!active) unlockOrientation()
}

onMounted(() => {
  document.addEventListener('fullscreenchange', sync)
  document.addEventListener('webkitfullscreenchange', sync)
})
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', sync)
  document.removeEventListener('webkitfullscreenchange', sync)
  // 组件卸载兜底：避免残留模拟全屏覆盖层卡住页面
  const el = stage()
  if (el) el.classList.remove('is-fullscreen')
})
</script>

<template>
  <button
    ref="btnEl"
    class="btn fs-btn"
    @click="toggleFullscreen"
    :title="isFullscreen ? '退出全屏' : '进入横屏全屏（动画 + 右侧参数面板）'"
  >
    {{ isFullscreen ? '✕ 退出全屏' : '⛶ 全屏' }}
  </button>
</template>
