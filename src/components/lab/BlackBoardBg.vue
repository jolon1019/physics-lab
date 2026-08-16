<script setup>
// 统一画板背景层：固定、不参与交互（pointer-events:none），所有实验画板继承它，
// 解决各实验背景风格不统一的问题。机器层（SVG/Pinia）与元件外观（PNG/矢量）都画在它之上。
// variant: 'chalk' 绿粉笔板（跟随浅色切换） | 'dark' 深空板（光学，固定）| 'light' 浅色纸面
// grid:   是否显示网格
import { computed } from 'vue'
import { boardTheme } from '../../lib/boardTheme'
const props = defineProps({
  variant: { type: String, default: 'chalk' },
  grid: { type: Boolean, default: true }
})
// 传 'chalk' 时跟随全局浅色切换（chalk/light）；dark 固定深空板
const effVariant = computed(() => (props.variant === 'chalk' ? boardTheme.variant : props.variant))
</script>

<template>
  <div class="bb-bg" :class="[`bb-${effVariant.value}`, { 'bb-grid': props.grid }]" aria-hidden="true">
    <div class="bb-surface"></div>
    <div class="bb-frame"></div>
  </div>
</template>

<style scoped>
.bb-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-radius: var(--radius, 14px);
  overflow: hidden;
}
.bb-surface {
  position: absolute;
  inset: 0;
}
/* 网格：双向细线，统一视觉语言；颜色跟随 --bb-grid（浅色模式自动变为浅褐线） */
.bb-bg.bb-grid::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(0deg, var(--bb-grid) 0 1px, transparent 1px 46px),
    repeating-linear-gradient(90deg, var(--bb-grid) 0 1px, transparent 1px 46px);
}
/* 统一木质边框（两道 box-shadow 模拟木框 + 内暗线） */
.bb-frame {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}

/* ===== 绿粉笔板（电路 / 力学，跟随浅色切换） ===== */
.bb-chalk .bb-surface {
  background: radial-gradient(130% 120% at 50% -10%, #214034 0%, #163025 50%, #0f211a 100%);
}
.bb-chalk .bb-frame {
  box-shadow:
    inset 0 0 0 9px #6f4a28,
    inset 0 0 0 11px #4a3019,
    inset 0 0 30px rgba(0, 0, 0, 0.45);
}

/* ===== 深空板（光学） ===== */
.bb-dark .bb-surface {
  background: radial-gradient(130% 120% at 50% -10%, #14263a 0%, #0c1726 55%, #070d18 100%);
}
.bb-dark.bb-grid::after {
  background-image:
    repeating-linear-gradient(0deg, rgba(150, 190, 230, 0.045) 0 1px, transparent 1px 46px),
    repeating-linear-gradient(90deg, rgba(150, 190, 230, 0.045) 0 1px, transparent 1px 46px);
}
.bb-dark .bb-frame {
  box-shadow:
    inset 0 0 0 9px #2a3340,
    inset 0 0 0 11px #161c26,
    inset 0 0 30px rgba(0, 0, 0, 0.5);
}

/* ===== 浅色纸面（与浅色页面背景一致，可经 boardTheme 自由切换） ===== */
.bb-light .bb-surface {
  background: radial-gradient(130% 120% at 50% -10%, #fbfaf7 0%, #f4f1ea 55%, #ece7da 100%);
}
.bb-light .bb-frame {
  box-shadow:
    inset 0 0 0 9px #c9a87f,
    inset 0 0 0 11px #a9824f,
    inset 0 0 16px rgba(0, 0, 0, 0.06);
}
</style>
