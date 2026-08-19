<script setup>
/**
 * 通用全屏按钮 —— 供所有 .lab-stage 实验使用（手机端：动画 + 右侧参数并排）
 *
 * 自包含设计：点击切换 Fullscreen API；同步给所属 .lab-stage 加/去 is-fullscreen class。
 * 布局规则统一维护在全局 src/style.css 的 .lab-stage.is-fullscreen 块（各实验共用一份），
 * 因此每个实验接入只需两步：import 本组件 + 在 .lab-actions 里放 <FullscreenBtn />。
 *
 * 不用模板 class 绑定的原因：按钮是子组件，父组件拿不到子组件的 isFullscreen ref；
 * 直接对 .lab-stage 元素做 classList.toggle，父组件无需任何 :class 绑定。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const btnEl = ref(null)
const isFullscreen = ref(false)

function stage() {
  return btnEl.value?.closest('.lab-stage') || null
}

function toggleFullscreen() {
  const el = stage()
  if (!el) return
  const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement)
  if (!inFs) {
    // 兼容 Safari 前缀；requestFullscreen 返回 Promise，被拒（如无权限）时静默
    const p = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.()
    if (p && p.catch) p.catch(() => {})
  } else if (document.exitFullscreen) {
    const p = document.exitFullscreen()
    if (p && p.catch) p.catch(() => {})
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen()
  }
}

function sync() {
  const fe = document.fullscreenElement || document.webkitFullscreenElement
  // 仅当全屏元素确实是某个实验台时才置位（避免其它元素全屏时误加 class）
  isFullscreen.value = !!(fe && fe.closest && fe.closest('.lab-stage'))
  const el = stage()
  if (el) el.classList.toggle('is-fullscreen', isFullscreen.value)
}

onMounted(() => {
  document.addEventListener('fullscreenchange', sync)
  document.addEventListener('webkitfullscreenchange', sync)
})
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', sync)
  document.removeEventListener('webkitfullscreenchange', sync)
})
</script>

<template>
  <button
    ref="btnEl"
    class="btn fs-btn"
    @click="toggleFullscreen"
    :title="isFullscreen ? '退出全屏' : '进入全屏（动画 + 参数并排）'"
  >
    {{ isFullscreen ? '✕ 退出全屏' : '⛶ 全屏' }}
  </button>
</template>
