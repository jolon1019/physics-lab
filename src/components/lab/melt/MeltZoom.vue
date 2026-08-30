<script setup>
/*
 * MeltZoom —— 试管内部物质变化的放大视图（约 2.2× 于主装置）。
 * 与 MeltFlask 共用同一套连续量语义：meltFrac（0..1 已熔化比例）驱动
 * 液池从管底渐涨、固体堆渐消；海波为颗粒堆、石蜡为软化蜡块。
 */
import { computed } from 'vue'

const props = defineProps({
  meltFrac: { type: Number, default: 0 },
  material: { type: String, default: 'sea' },
  hot: Boolean,
})

const VW = 150, VH = 210
const CENTER = 75
const TUBE_BOT = 160   // 试管内底（放大坐标）
const POOL_H = 57      // 26 × 2.2
const PILE_H = 66      // 30 × 2.2

// 与 MeltFlask 同种子的颗粒散布（观感一致）
const GRAINS = (() => {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const arr = []
  for (let layer = 0; layer < 6; layer++) {
    const n = 3 + layer * 2
    for (let i = 0; i < n; i++) {
      arr.push({
        fx: (i + 0.5 + (rnd() - 0.5) * 0.55) / n,
        fy: Math.min(layer / 6 + rnd() * 0.13, 0.96),
        r: 2.6 + rnd() * 1.5,
      })
    }
  }
  return arr
})()

const f = computed(() => Math.max(0, Math.min(1, props.meltFrac || 0)))
const isSea = computed(() => props.material === 'sea')
const yL = computed(() => TUBE_BOT - POOL_H * f.value)
const pileH = computed(() => PILE_H * (1 - f.value))
const hasPool = computed(() => f.value > 0.03)
const hasPile = computed(() => pileH.value > 3)

function grainOpacity(g) {
  return Math.max(0, Math.min(1, (g.fy - f.value) * 4 + 0.15))
}
const poolFill = computed(() => (isSea.value ? 'url(#mz-seaLiq)' : 'url(#mz-waxLiq)'))
const poolSurface = computed(() => (isSea.value ? '#e9f6fd' : '#f4d79a'))
</script>

<template>
  <svg :viewBox="`0 0 ${VW} ${VH}`" width="100%" xmlns="http://www.w3.org/2000/svg" aria-label="试管内部放大视图">
    <defs>
      <radialGradient id="mz-grain" cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" stop-color="#f8f9f4" />
        <stop offset="1" stop-color="#d5dacd" />
      </radialGradient>
      <linearGradient id="mz-seaLiq" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d8eefb" stop-opacity="0.92" />
        <stop offset="1" stop-color="#b7ddf1" stop-opacity="0.95" />
      </linearGradient>
      <linearGradient id="mz-waxLiq" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f0c979" stop-opacity="0.9" />
        <stop offset="1" stop-color="#dfa94f" stop-opacity="0.94" />
      </linearGradient>
      <clipPath id="mz-tube">
        <path d="M42 -2 L42 140 Q42 160 75 160 Q108 160 108 140 L108 -2 Z" />
      </clipPath>
    </defs>

    <!-- 试管壁（上端裁出画布，突出内容区） -->
    <path
      d="M35 -2 L35 140 Q35 172 75 172 Q115 172 115 140 L115 -2"
      fill="rgba(240,247,252,0.45)"
    />

    <!-- 内容物 -->
    <g clip-path="url(#mz-tube)">
      <!-- 液池 -->
      <g v-if="hasPool">
        <rect x="40" :y="yL" width="70" :height="TUBE_BOT - yL + 6" :fill="poolFill" />
        <ellipse :cx="CENTER" :cy="yL" rx="33" ry="5" :fill="poolSurface" opacity="0.95" />
      </g>
      <!-- 海波颗粒堆 -->
      <g v-if="isSea && hasPile" class="mz-grains" :class="{ 'is-hot': hot }">
        <circle
          v-for="(g, i) in GRAINS" :key="i"
          :cx="CENTER + (g.fx - 0.5) * 58"
          :cy="yL - pileH + g.fy * pileH"
          :r="g.r * 2.2"
          :opacity="grainOpacity(g)"
          fill="url(#mz-grain)" stroke="#a8b0a2" stroke-width="1"
        />
      </g>
      <!-- 石蜡块（软化塌陷） -->
      <g v-if="!isSea && hasPile">
        <rect
          :x="CENTER - 26.4 - 4.4 * f" :y="yL - pileH" :width="52.8 + 8.8 * f" :height="pileH"
          :rx="6.6 + 19.8 * f"
          :fill="`rgba(244,227,196,${(1 - f * 0.72).toFixed(3)})`"
          stroke="#d9bd8d" stroke-width="1.5"
        />
        <rect
          :x="CENTER - 26.4 - 4.4 * f" :y="yL - pileH" :width="52.8 + 8.8 * f" :height="pileH"
          :rx="6.6 + 19.8 * f"
          fill="#ecc573" :opacity="(f * 0.75).toFixed(3)"
        />
      </g>
    </g>

    <!-- 管壁描边 + 高光 -->
    <path
      d="M35 -2 L35 140 Q35 172 75 172 Q115 172 115 140 L115 -2"
      fill="none" stroke="#5f7588" stroke-width="3" stroke-linecap="round"
    />
    <line x1="43" y1="6" x2="43" y2="120" stroke="#fff" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.mz-grains { transform-box: fill-box; transform-origin: 50% 100%; }
.mz-grains.is-hot { animation: wfJiggle 0.55s linear infinite; }
</style>
