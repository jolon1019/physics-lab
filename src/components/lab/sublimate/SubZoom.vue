<script setup>
/*
 * SubZoom —— e-sublimate 放大观察内容（纯内联 SVG），结构对齐 MeltZoom：
 * 碘锤内部放大视图：底部固态碘晶体堆（随 subFrac 渐消）、
 * 紫色蒸气上升（CSS 动画）、直火液态碘层、管顶凝华沉积。
 * viewBox 120×170：管内壁 x 38..82，内底 152，顶 14。
 */
import { computed } from 'vue'

const props = defineProps({
  mode: { type: String, default: 'bath' },
  subFrac: { type: Number, default: 1 },
  liquidFrac: { type: Number, default: 0 },
  vapor: Boolean,
  condensed: Boolean,
})

const TUBE_BOT = 152
const PILE_H = 30

const GRAINS = (() => {
  let seed = 23
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const arr = []
  for (let layer = 0; layer < 4; layer++) {
    const n = 3 + layer * 2
    for (let i = 0; i < n; i++) {
      arr.push({
        fx: (i + 0.5 + (rnd() - 0.5) * 0.5) / n,
        fy: Math.min(layer / 4 + rnd() * 0.14, 0.95),
        r: 2.6 + rnd() * 1.6,
      })
    }
  }
  return arr
})()

const f = computed(() => Math.max(0, Math.min(1, 1 - (props.subFrac || 0))))
const pileH = computed(() => PILE_H * (1 - f.value))
const liqH = computed(() => 26 * Math.max(0, Math.min(1, props.liquidFrac || 0)))

function grainOpacity(g) {
  return Math.max(0, Math.min(1, (g.fy - f.value) * 4 + 0.15))
}
</script>

<template>
  <svg viewBox="0 0 120 170" width="120" height="170" xmlns="http://www.w3.org/2000/svg" aria-label="碘锤内部放大">
    <defs>
      <radialGradient id="sz-grain" cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" stop-color="#9a6ad0" />
        <stop offset="1" stop-color="#5b2f8a" />
      </radialGradient>
      <radialGradient id="sz-vapor" cx="0.4" cy="0.35" r="0.9">
        <stop offset="0" stop-color="rgba(200,150,240,0.95)" />
        <stop offset="1" stop-color="rgba(120,60,170,0.25)" />
      </radialGradient>
      <clipPath id="sz-tubeClip">
        <path d="M34 14 L34 138 Q34 152 60 152 Q86 152 86 138 L86 14 Z" />
      </clipPath>
    </defs>

    <!-- 管内背景（淡玻璃色） -->
    <rect x="30" y="8" width="60" height="154" rx="10" fill="rgba(240,247,252,0.4)" />

    <g clip-path="url(#sz-tubeClip)">
      <!-- 固态碘晶体堆 -->
      <g v-if="pileH > 1.5" class="sv-grains is-hot">
        <rect
          v-for="(g, i) in GRAINS" :key="'g' + i"
          :x="60 + (g.fx - 0.5) * 36 - g.r" :y="(TUBE_BOT - pileH + g.fy * pileH) - g.r"
          :width="g.r * 2" :height="g.r * 2"
          :opacity="grainOpacity(g)"
          fill="url(#sz-grain)"
          :transform="`rotate(45 ${60 + (g.fx - 0.5) * 36} ${TUBE_BOT - pileH + g.fy * pileH})`"
        />
      </g>
      <!-- 直火液态碘 -->
      <g v-if="mode !== 'bath' && liqH > 1">
        <rect x="35" :y="TUBE_BOT - liqH" width="50" :height="liqH + 4" fill="rgba(150,60,160,0.85)" />
        <path d="M40 151.5 L80 151.5" stroke="rgba(255,255,255,0.4)" stroke-width="1.4" />
      </g>
      <!-- 紫色蒸气上升 -->
      <g v-if="vapor">
        <circle class="sv-vapor v1" cx="50" cy="140" r="3.4" fill="url(#sz-vapor)" />
        <circle class="sv-vapor v2" cx="68" cy="146" r="2.8" fill="url(#sz-vapor)" />
        <circle class="sv-vapor v3" cx="58" cy="136" r="3.8" fill="url(#sz-vapor)" />
        <circle class="sv-vapor v4" cx="72" cy="142" r="3" fill="url(#sz-vapor)" />
        <circle class="sv-vapor v5" cx="46" cy="144" r="2.6" fill="url(#sz-vapor)" />
        <circle class="sv-vapor v6" cx="62" cy="148" r="3.3" fill="url(#sz-vapor)" />
      </g>
      <!-- 管顶凝华沉积 -->
      <g v-if="condensed">
        <rect x="34" y="16" width="52" height="12" fill="rgba(107,63,160,0.92)" />
        <rect
          v-for="i in 7" :key="'c' + i"
          :x="40 + (i - 1) * 6.6 - 2.4" :y="31 - 2.4" width="4.8" height="4.8"
          fill="url(#sz-grain)" :transform="`rotate(45 ${40 + (i - 1) * 6.6} 31)`"
        />
      </g>
    </g>

    <!-- 管壁轮廓 + 高光 -->
    <path
      d="M34 14 L34 138 Q34 152 60 152 Q86 152 86 138 L86 14"
      fill="none" stroke="#5f7588" stroke-width="2" stroke-linecap="round"
    />
    <path d="M40 22 L40 132" stroke="#fff" stroke-opacity="0.55" stroke-width="2" fill="none" stroke-linecap="round" />
  </svg>
</template>
