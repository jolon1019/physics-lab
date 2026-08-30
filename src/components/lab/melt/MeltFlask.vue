<script setup>
/*
 * MeltFlask —— e-melt 装置主体（纯内联 SVG，零网络请求）：
 * 三脚架 + 石棉网 + 烧杯（水浴）+ 试管 + 内容物（海波颗粒 / 石蜡块）。
 * 比例参照真实器材：三脚架（至石棉网）≈ 13cm、烧杯 ≈ 9.5cm、试管露出 ≈ 4cm，
 * 酒精灯 + 火焰恰好舔到网底（见 MeltingLab.computeDefaults 的配对公式）。
 * 视觉状态由连续量 meltFrac（0..1 已熔化比例）驱动：液池从管底渐涨、
 * 固体堆渐消渐沉，替代旧版三张 PNG 硬切换；加热时水浴对流气泡 + 颗粒微颤。
 * 坐标约定与编辑器一致：w = 内容宽（映射 viewBox 200），baseline = 底部 y（脚架落地点）。
 */
import { computed, ref } from 'vue'

const props = defineProps({
  x: Number,
  baseline: Number,
  w: Number,
  hot: Boolean,                              // 加热中（对流气泡 / 微颤）
  meltFrac: { type: Number, default: 0 },    // 0..1 已熔化比例
  material: { type: String, default: 'sea' },// sea 海波晶体 | wax 石蜡非晶体
  steam: Boolean,                            // 杯口白汽
  selected: Boolean,
  editMode: Boolean,
})
const emit = defineEmits(['pointerdown'])
const hover = ref(false)

const VBW = 200, VBH = 420
// 试管内几何（viewBox 单位）：内底 191，内半宽 15
const TUBE_BOT = 191
const POOL_H = 26   // 全熔后液池高
const PILE_H = 30   // 固体堆原始高

// 海波颗粒：种子随机的固定散布（模块级生成一次，渲染稳定）
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

const size = computed(() => {
  const w = props.w
  return { w, h: w * (VBH / VBW) }
})
const posStyle = computed(() => ({
  left: (props.x - size.value.w / 2) + 'px',
  top: (props.baseline - size.value.h) + 'px',
  width: size.value.w + 'px',
  height: size.value.h + 'px',
}))

const f = computed(() => Math.max(0, Math.min(1, props.meltFrac || 0)))
const isSea = computed(() => props.material === 'sea')
const yL = computed(() => TUBE_BOT - POOL_H * f.value)      // 液面 y
const pileH = computed(() => PILE_H * (1 - f.value))        // 固体堆高
const hasPool = computed(() => f.value > 0.03)
const hasPile = computed(() => pileH.value > 1.5)

// 颗粒按 fy（0=堆顶）从上往下逐渐熔消失
function grainOpacity(g) {
  return Math.max(0, Math.min(1, (g.fy - f.value) * 4 + 0.15))
}
const poolFill = computed(() => (isSea.value ? 'url(#mf-seaLiq)' : 'url(#mf-waxLiq)'))
const poolSurface = computed(() => (isSea.value ? '#e9f6fd' : '#f4d79a'))

function onDown(e) { emit('pointerdown', e) }
</script>

<template>
  <div
    class="melt-piece melt-flask"
    :class="{ 'is-hover': hover && editMode, 'is-selected': selected }"
    :style="posStyle"
    :data-edit-mode="editMode ? 'true' : 'false'"
    @pointerenter="hover = true"
    @pointerleave="hover = false"
    @pointerdown="onDown"
  >
    <svg :viewBox="`0 0 ${VBW} ${VBH}`" :width="size.w" :height="size.h" xmlns="http://www.w3.org/2000/svg" aria-label="烧杯试管装置">
      <defs>
        <linearGradient id="mf-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(255,255,255,0.50)" />
          <stop offset="1" stop-color="rgba(222,235,244,0.14)" />
        </linearGradient>
        <linearGradient id="mf-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#c8e9fb" stop-opacity="0.94" />
          <stop offset="1" stop-color="#8cc7ea" stop-opacity="0.96" />
        </linearGradient>
        <radialGradient id="mf-grain" cx="0.35" cy="0.3" r="0.9">
          <stop offset="0" stop-color="#f8f9f4" />
          <stop offset="1" stop-color="#d5dacd" />
        </radialGradient>
        <linearGradient id="mf-seaLiq" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#d8eefb" stop-opacity="0.92" />
          <stop offset="1" stop-color="#b7ddf1" stop-opacity="0.95" />
        </linearGradient>
        <linearGradient id="mf-waxLiq" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f0c979" stop-opacity="0.9" />
          <stop offset="1" stop-color="#dfa94f" stop-opacity="0.94" />
        </linearGradient>
        <linearGradient id="mf-iron" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#4d5560" />
          <stop offset="1" stop-color="#2b313a" />
        </linearGradient>
        <clipPath id="mf-bath">
          <path d="M52 88 L57 208 Q58 221 70 222 L130 222 Q142 221 143 208 L148 88 Z" />
        </clipPath>
        <clipPath id="mf-tube">
          <path d="M85 39 L85 176 Q85 191 100 191 Q115 191 115 176 L115 39 Z" />
        </clipPath>
      </defs>

      <!-- 地面软阴影 -->
      <ellipse cx="100" cy="415" rx="88" ry="6" fill="#000" opacity="0.10" />

      <!-- 三脚架（铁）+ 石棉网 -->
      <g>
        <rect x="97.2" y="234" width="5.6" height="176" rx="2" fill="#333a44" />
        <polygon points="62,232 68,232 54,410 47,410" fill="url(#mf-iron)" />
        <polygon points="132,232 138,232 153,410 146,410" fill="url(#mf-iron)" />
        <ellipse cx="100" cy="228" rx="61" ry="8" fill="none" stroke="#3d444e" stroke-width="4.5" />
        <rect x="40" y="222" width="120" height="7.5" rx="3" fill="#97a1ad" stroke="#7c8794" stroke-width="0.8" />
        <g stroke="#7c8794" stroke-width="0.7" opacity="0.8">
          <line x1="58" y1="222" x2="58" y2="229.5" />
          <line x1="70" y1="222" x2="70" y2="229.5" />
          <line x1="130" y1="222" x2="130" y2="229.5" />
          <line x1="142" y1="222" x2="142" y2="229.5" />
        </g>
        <rect x="82" y="221" width="36" height="9.5" rx="1.5" fill="#dde3e7" stroke="#9aa4ae" stroke-width="0.9" />
        <rect x="43" y="410" width="13" height="6" rx="2" fill="#22262c" />
        <rect x="93.5" y="410" width="13" height="6" rx="2" fill="#22262c" />
        <rect x="144" y="410" width="13" height="6" rx="2" fill="#22262c" />
      </g>

      <!-- 烧杯杯体（含左侧倾倒嘴） -->
      <path
        d="M30 76 Q40 79 45 85 L51 209 Q52 223 66 225 L134 225 Q148 223 149 209 L155 85 A 55 8 0 0 1 45 85 Z"
        fill="url(#mf-glass)"
      />
      <path
        d="M30 76 Q40 79 45 85 L51 209 Q52 223 66 225 L134 225 Q148 223 149 209 L155 85"
        fill="none" stroke="#5f7588" stroke-width="2" stroke-linecap="round"
      />

      <!-- 水浴 -->
      <g clip-path="url(#mf-bath)">
        <rect x="44" y="134" width="112" height="88" fill="url(#mf-water)" />
        <ellipse cx="100" cy="134" rx="52" ry="6.5" fill="#dcf1fc" opacity="0.9" />
        <path d="M52 133 Q100 126 148 133" fill="none" stroke="#f2fbff" stroke-width="1.6" opacity="0.9" />
        <ellipse cx="100" cy="219" rx="42" ry="5" fill="#7fb8dc" opacity="0.4" />
        <!-- 加热对流气泡（在试管后方升起） -->
        <g v-if="hot">
          <circle class="wf-bubble b1" cx="60"  cy="218" r="2.6" fill="#fff" opacity="0.85" />
          <circle class="wf-bubble b2" cx="70"  cy="220" r="1.9" fill="#fff" opacity="0.85" />
          <circle class="wf-bubble b3" cx="131" cy="217" r="2.9" fill="#fff" opacity="0.85" />
          <circle class="wf-bubble b4" cx="141" cy="219" r="2.1" fill="#fff" opacity="0.85" />
          <circle class="wf-bubble b5" cx="65"  cy="221" r="1.5" fill="#fff" opacity="0.8" />
          <circle class="wf-bubble b6" cx="136" cy="221" r="1.6" fill="#fff" opacity="0.8" />
        </g>
      </g>

      <!-- 试管（玻璃 + 内容物） -->
      <path
        d="M82 35 L82 176 Q82 194 100 194 Q118 194 118 176 L118 35"
        fill="rgba(240,247,252,0.38)"
      />
      <g clip-path="url(#mf-tube)">
        <g v-if="hasPool">
          <rect x="83" :y="yL" width="34" :height="TUBE_BOT - yL + 4" :fill="poolFill" />
          <ellipse cx="100" :cy="yL" rx="15" ry="2.4" :fill="poolSurface" opacity="0.95" />
        </g>
        <g v-if="isSea && hasPile" class="grain-grp" :class="{ 'is-hot': hot }">
          <circle
            v-for="(g, i) in GRAINS" :key="i"
            :cx="100 + (g.fx - 0.5) * 26"
            :cy="yL - pileH + g.fy * pileH"
            :r="g.r"
            :opacity="grainOpacity(g)"
            fill="url(#mf-grain)" stroke="#a8b0a2" stroke-width="0.5"
          />
        </g>
        <g v-if="!isSea && hasPile">
          <rect
            :x="100 - 12 - 2 * f" :y="yL - pileH" :width="24 + 4 * f" :height="pileH"
            :rx="3 + 9 * f"
            :fill="`rgba(244,227,196,${(1 - f * 0.72).toFixed(3)})`"
            stroke="#d9bd8d" stroke-width="0.8"
          />
          <rect
            :x="100 - 12 - 2 * f" :y="yL - pileH" :width="24 + 4 * f" :height="pileH"
            :rx="3 + 9 * f"
            fill="#ecc573" :opacity="(f * 0.75).toFixed(3)"
          />
        </g>
      </g>
      <path
        d="M82 35 L82 176 Q82 194 100 194 Q118 194 118 176 L118 35"
        fill="none" stroke="#5f7588" stroke-width="1.8" stroke-linecap="round"
      />
      <ellipse cx="100" cy="35" rx="18" ry="4.5" fill="rgba(255,255,255,0.45)" stroke="#5f7588" stroke-width="1.8" />
      <ellipse cx="100" cy="35" rx="14.5" ry="3.2" fill="none" stroke="#8ba1b3" stroke-width="1" />

      <!-- 杯口 + 壁面高光 -->
      <ellipse cx="100" cy="85" rx="55" ry="8" fill="rgba(255,255,255,0.35)" stroke="#5f7588" stroke-width="2" />
      <ellipse cx="100" cy="85" rx="49" ry="6.2" fill="none" stroke="#8ba1b3" stroke-width="1" />
      <path d="M56 102 Q54 160 61 204" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" opacity="0.5" />
      <path d="M145 102 Q147 156 142 194" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.3" />
      <path d="M88 42 L88 168" stroke="#fff" stroke-opacity="0.5" stroke-width="1.8" fill="none" stroke-linecap="round" />

      <!-- 白汽 -->
      <g v-if="steam" stroke="#aab8c4" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.85">
        <path class="wf-steam d1" d="M64 79 q 5 -7 0 -13 q -5 -6 0 -13" />
        <path class="wf-steam d2" d="M136 79 q 5 -7 0 -13 q -5 -6 0 -13" />
        <path class="wf-steam d3" d="M100 29 q 4 -6 0 -12 q -4 -6 0 -12" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.melt-flask { outline: none; }
.melt-flask svg { display: block; pointer-events: none; user-select: none; }
.melt-flask.is-hover svg { filter: drop-shadow(0 0 2px rgba(255, 207, 51, 0.9)); }
</style>
