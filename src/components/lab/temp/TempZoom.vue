<script setup>
/*
 * TempZoom —— e-temp 放大读数窗：液柱顶部区域放大，
 * 26℃ 视窗自动跟随当前温度垂直居中（上下留白均等），
 * 1℃ 细刻线 + 5℃ 中刻线 + 10℃ 标注，视线标线与液柱上表面严格相平。
 * 放大倍数 = 140px/26℃ ÷ 主温度计 190px/130℃ ≈ ×3.7
 */
import { computed } from 'vue'

const props = defineProps({
  temp: { type: Number, default: 20 },
})

const SPAN = 26 // 视窗温度跨度（℃）
const PLOT_TOP = 12
const PLOT_H = 140
const lo = computed(() => Math.max(-20, Math.min(props.temp - SPAN / 2, 110 - SPAN)))
const hi = computed(() => lo.value + SPAN)
const yFor = (T) => PLOT_TOP + ((hi.value - T) / SPAN) * PLOT_H
const yT = computed(() => yFor(props.temp))

// 1℃ 细刻线（含 5℃ 中刻线与 10℃ 标注）
const ticks = computed(() => {
  const arr = []
  for (let t = Math.ceil(lo.value); t <= hi.value; t++) {
    if (t < lo.value || t > hi.value) continue
    arr.push({ t, y: yFor(t), level: t % 10 === 0 ? 2 : t % 5 === 0 ? 1 : 0 })
  }
  return arr
})
const labels = computed(() => ticks.value.filter((k) => k.level === 2))
const labels5 = computed(() => ticks.value.filter((k) => k.level === 1))
</script>

<template>
  <svg viewBox="0 0 210 170" width="100%" xmlns="http://www.w3.org/2000/svg" aria-label="温度计读数放大">
    <!-- 玻璃管 -->
    <rect x="52" y="8" width="22" height="154" rx="11" fill="rgba(255,255,255,0.4)" stroke="rgba(70,82,102,0.75)" stroke-width="1.4" />
    <!-- 汞柱 + 球泡（顶部与视线线严格相平） -->
    <rect x="57.5" :y="yT" width="11" :height="Math.max(6, 160 - yT)" rx="5.5" fill="#e0584f" />
    <!-- 液面弯月面高光 -->
    <ellipse cx="63" :cy="yT + 1.2" rx="5" ry="1.6" fill="#ff8a72" />
    <circle cx="63" cy="158" r="9" fill="#e0584f" />
    <!-- 玻璃描边压在最上 -->
    <circle cx="63" cy="158" r="9" fill="none" stroke="rgba(70,82,102,0.75)" stroke-width="1.2" />
    <rect x="52" y="8" width="22" height="154" rx="11" fill="none" stroke="rgba(70,82,102,0.75)" stroke-width="1.4" />

    <!-- 刻度：1℃ 细线 / 5℃ 中线 / 10℃ 标注（估读到 0.1℃） -->
    <line v-for="tk in ticks" :key="tk.t" x1="74" :y1="tk.y" :x2="tk.level === 2 ? 98 : tk.level === 1 ? 90 : 84" :y2="tk.y" stroke="rgba(120,130,145,0.9)" :stroke-width="tk.level === 2 ? 1.6 : tk.level === 1 ? 1.2 : 0.8" :opacity="tk.level === 0 ? 0.65 : 1" />
    <text v-for="tk in labels" :key="'lb' + tk.t" x="103" :y="tk.y + 4" font-size="12" font-weight="700" style="fill: var(--bb-fg-dim, #c7d0c8)" font-family="system-ui, sans-serif">{{ tk.t }}</text>
    <text v-for="tk in labels5" :key="'lb5' + tk.t" x="95" :y="tk.y + 3.5" font-size="9.5" font-weight="600" opacity="0.75" style="fill: var(--bb-fg-dim, #c7d0c8)" font-family="system-ui, sans-serif">{{ tk.t }}</text>

    <!-- 视线标线（与液柱上表面相平） -->
    <line x1="20" :y1="yT" x2="146" :y2="yT" stroke="#6ea8ff" stroke-width="1.6" stroke-dasharray="5 4" />
    <path :d="`M 154 ${yT - 5} L 146 ${yT} L 154 ${yT + 5} Z`" fill="#6ea8ff" />
    <text x="150" :y="yT - 7" font-size="11" font-weight="700" fill="#6ea8ff" font-family="system-ui, sans-serif">视线相平</text>
  </svg>
</template>
