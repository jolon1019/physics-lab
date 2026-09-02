<script setup>
/*
 * TempThermo —— e-temp 温度计（纯内联 SVG），画风对齐 BoilBeaker 的挂式温度计：
 * 玻璃管 + 球泡 + 红色液柱（顶端平移实现升降，CSS transition，与 rAF 无关）+ 左侧刻度 + 数字显示。
 * 坐标约定：viewBox 0 0 200 280；管身 x 70..88 / y 20..210（-20℃..110℃），球泡 cy 230。
 * 放置：top 固定 156 → 球泡中心 design y=386（水面 362 之下、不碰杯底），left 随所选水杯滑动。
 */
import { computed } from 'vue'

const props = defineProps({
  temp: { type: Number, default: 20 }, // 当前测量温度
  x: { type: Number, default: 110 },   // 所选水杯中心（设计层坐标）
})

const VBW = 200, VBH = 280
const T_MIN = -20, T_MAX = 110
const Y_TOP = 20, Y_BOT = 210
const lv = (T) => Y_BOT - (Y_BOT - Y_TOP) * ((T - T_MIN) / (T_MAX - T_MIN))

const ticks = computed(() => {
  const arr = []
  for (let t = T_MIN; t <= T_MAX; t += 2) arr.push({ t, y: lv(t), major: t % 10 === 0 })
  return arr
})
const majors = computed(() => ticks.value.filter((k) => k.major))
const hgStyle = computed(() => ({ transform: `translateY(${lv(props.temp) - Y_TOP}px)` }))
const posStyle = computed(() => ({ left: props.x - 79 + 'px', top: '156px' }))
</script>

<template>
  <div class="tp-piece tp-thermo" :style="posStyle">
    <svg :viewBox="`0 0 ${VBW} ${VBH}`" :width="VBW" :height="VBH" xmlns="http://www.w3.org/2000/svg" aria-label="温度计">
      <defs>
        <clipPath id="tp-tubeClip">
          <rect x="71" y="20" width="16" height="206" rx="8" />
          <circle cx="79" cy="228" r="14" />
        </clipPath>
        <radialGradient id="tp-bulbHg" cx="0.42" cy="0.3" r="0.8">
          <stop offset="0" stop-color="#ff9078" />
          <stop offset="0.55" stop-color="#ef5f50" />
          <stop offset="1" stop-color="#d04034" />
        </radialGradient>
        <linearGradient id="tp-colHg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#e14b3e" />
          <stop offset="0.5" stop-color="#f4705f" />
          <stop offset="1" stop-color="#d94a3d" />
        </linearGradient>
      </defs>

      <!-- 汞柱：顶端圆头=液面；裁剪放在无 transform 的外层组上（裁剪区不能跟着液柱平移），
           底端延伸进球泡被球体覆盖。球泡汞体 r14 盖住管柱接口，衔接无缝 -->
      <g clip-path="url(#tp-tubeClip)">
        <g class="tp-hg" :style="hgStyle">
          <rect x="74.5" y="20" width="9" height="224" rx="4.5" fill="url(#tp-colHg)" />
        </g>
      </g>
      <!-- 球泡：汞液满充，径向渐变体现玻璃球体积感 -->
      <circle cx="79" cy="228" r="14" fill="url(#tp-bulbHg)" />

      <!-- 玻璃管与球泡壳 -->
      <rect x="70" y="20" width="18" height="196" rx="9" fill="rgba(255,255,255,0.35)" stroke="rgba(70,82,102,0.75)" stroke-width="1.4" />
      <circle cx="79" cy="228" r="14.6" fill="none" stroke="rgba(70,82,102,0.75)" stroke-width="1.4" />
      <!-- 管身与球泡高光 -->
      <rect x="73" y="26" width="3" height="182" rx="1.5" fill="#fff" opacity="0.7" />
      <circle cx="73.8" cy="222.5" r="2.8" fill="#fff" opacity="0.75" />
      <path d="M 69.5 234 A 14.6 14.6 0 0 0 84 241.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.45" />

      <!-- 刻度（每 2℃ 一短线，每 10℃ 标注） -->
      <g stroke="rgba(120,130,145,0.9)">
        <line v-for="tk in ticks" :key="tk.t" x1="66" :y1="tk.y" :x2="tk.major ? 50 : 57" :y2="tk.y" :stroke-width="tk.major ? 1.6 : 1" />
      </g>
      <text v-for="tk in majors" :key="'lb' + tk.t" x="46" :y="tk.y + 4" text-anchor="end" font-size="10.5" font-weight="600" style="fill: var(--bb-fg-dim, #c7d0c8)" font-family="system-ui, sans-serif">{{ tk.t }}</text>
      <text x="46" y="14" text-anchor="end" font-size="12" font-weight="700" style="fill: var(--bb-fg-dim, #c7d0c8)" font-family="system-ui, sans-serif">℃</text>

      <!-- 数字显示 -->
      <rect x="100" y="2" width="96" height="32" rx="8" fill="rgba(18,22,32,0.88)" stroke="rgba(255,255,255,0.14)" />
      <text x="148" y="24" text-anchor="middle" font-size="16" font-weight="800" fill="#ff5a48" font-family="ui-monospace, Menlo, Consolas, monospace">{{ temp.toFixed(1) }} ℃</text>
    </svg>
  </div>
</template>
