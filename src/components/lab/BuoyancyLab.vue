<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

const G_CONST = 10
const RHO_MAT = { al: 2.7, iron: 7.9, copper: 8.9 }
const MAT_LABEL = { al: '铝', iron: '铁', copper: '铜' }
const RHO_LIQ = { alcohol: 0.8, water: 1.0, brine: 1.1 }
const LIQ_LABEL = { alcohol: '酒精', water: '水', brine: '盐水' }

const material = ref('al')
const vol = ref(50)
const liquid = ref('water')
const kTarget = ref(0) // 用户设定的浸没比例 0..1
const kAnim = ref(0) // 动画插值后的实际值
const phase = ref(0) // 波纹 / 气泡动画相位

// ---- 派生物理量 ----
const G = computed(() => RHO_MAT[material.value] * G_CONST * vol.value * 1e-3)
const Vrow = computed(() => kAnim.value * vol.value)
const Fb = computed(() => RHO_LIQ[liquid.value] * G_CONST * Vrow.value * 1e-3)
const Fpull = computed(() => Math.max(0, G.value - Fb.value))
const willRise = computed(() => Fb.value > G.value + 1e-9)

// ---- 装置几何 ----
const VB_W = 480
const VB_H = 560
const TANK_X = 64
const TANK_W = 312
const cx = TANK_X + TANK_W / 2
const TANK_TOP = 168
const TANK_BOT = 520
const LIQ_BASE = TANK_TOP + 34
const H_block = computed(() => (vol.value === 25 ? 64 : 96))
const yTop0 = 84
const yTop1 = LIQ_BASE + 8
const yTop = computed(() => yTop0 + kAnim.value * (yTop1 - yTop0))
const blockX = computed(() => cx - H_block.value / 2)
const liquidY = computed(() => LIQ_BASE - kAnim.value * 10)
const subTop = computed(() => Math.max(yTop.value, liquidY.value))
const subH = computed(() => Math.max(0, yTop.value + H_block.value - subTop.value))
const blockMidY = computed(() => yTop.value + H_block.value / 2)
const blockBotY = computed(() => yTop.value + H_block.value)
const waterTopColor = computed(
  () => ({ alcohol: '#f3e6b4', water: '#bfe2f6', brine: '#cfe9ef' }[liquid.value])
)
const waterBotColor = computed(
  () => ({ alcohol: '#e7cf7e', water: '#5fb0e0', brine: '#8fc6d4' }[liquid.value])
)

// ---- 弹簧秤 ----
const housingTop = 18
const housingH = 22
const springTopY = 40
const springLen = computed(() => 14 + Fpull.value * 6)
const hookY = computed(() => springTopY + springLen.value)
const springPathD = computed(() => {
  const top = springTopY
  const bot = hookY.value
  const coils = 8
  const x0 = cx - 8
  const x1 = cx + 8
  const segs = coils * 2
  let d = `M ${cx} ${top}`
  for (let i = 1; i <= segs; i++) {
    const y = top + ((bot - top) * i) / segs
    const x = i % 2 ? x1 : x0
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
  }
  d += ` L ${cx} ${bot}`
  return d
})
const cordPathD = computed(() => `M ${cx} ${hookY.value} L ${cx} ${yTop.value}`)

// ---- 玻璃烧杯（圆底）路径 ----
function tankPathInset(inset) {
  const x = TANK_X + inset
  const w = TANK_W - inset * 2
  const top = TANK_TOP + inset
  const bot = TANK_BOT - inset
  const r = 26
  return (
    `M ${x} ${top} ` +
    `L ${x} ${bot - r} ` +
    `Q ${x} ${bot} ${x + r} ${bot} ` +
    `L ${x + w - r} ${bot} ` +
    `Q ${x + w} ${bot} ${x + w} ${bot - r} ` +
    `L ${x + w} ${top} Z`
  )
}
const tankClipPath = tankPathInset(5)
const tankGlassPath = tankPathInset(4)

// ---- 水体（动态波纹表面）----
function waveTop(level, amp, ph) {
  const x0 = TANK_X + 6
  const x1 = TANK_X + TANK_W - 6
  const n = 30
  let d = `M ${x0} ${level.toFixed(1)}`
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    const y = level + Math.sin((i / n) * Math.PI * 3 + ph) * amp
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return d
}
const waterPath = computed(() => {
  const x0 = TANK_X + 6
  const x1 = TANK_X + TANK_W - 6
  return waveTop(liquidY.value, 3.2, phase.value * 1.6) + ` L ${x1} ${TANK_BOT - 5} L ${x0} ${TANK_BOT - 5} Z`
})
const waterSurfLine = computed(() => waveTop(liquidY.value, 3.2, phase.value * 1.6))

// ---- 气泡 ----
const bubbleSeeds = Array.from({ length: 9 }, (_, i) => ({
  dx: ((i * 37) % 70) - 35,
  r: 1.5 + (i % 3) * 0.9,
  sp: 0.5 + (i % 4) * 0.16,
  ph: (i * 0.6) % 1,
}))
const bubbles = computed(() => {
  if (subH.value <= 0) return []
  const top = liquidY.value
  const bot = blockBotY.value
  const range = Math.max(1, bot - top)
  return bubbleSeeds.map((s) => {
    const p = (phase.value * s.sp + s.ph) % 1
    const cy = top + p * range
    const op = Math.max(0, 0.55 * (1 - Math.abs(p - 0.5) * 1.3))
    return { cx: cx + s.dx * 0.5, cy, r: s.r, op }
  })
})

// ---- 刻度尺（左侧浸入深度）----
const depthTicks = [0, 0.25, 0.5, 0.75, 1].map((k) => yTop0 + k * (yTop1 - yTop0))

// ---- 受力箭头 ----
const gLen = computed(() => 24 + G.value * 14)
const fbLen = computed(() => 24 + Fb.value * 14)
const fpLen = computed(() => 24 + Fpull.value * 14)
function arrowHead(x, y, dir) {
  const s = 7
  if (dir === 'down') return `${x - s},${y - s} ${x + s},${y - s} ${x},${y}`
  if (dir === 'up') return `${x - s},${y + s} ${x + s},${y + s} ${x},${y}`
  return `${x - s},${y - s} ${x + s},${y - s} ${x},${y}`
}

// ---- 动画循环 ----
let raf = null
function tick() {
  const d = kTarget.value - kAnim.value
  if (Math.abs(d) < 0.002) kAnim.value = kTarget.value
  else kAnim.value += d * 0.18
  phase.value += 0.012
  raf = requestAnimationFrame(tick)
}
onMounted(() => {
  raf = requestAnimationFrame(tick)
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})

// ---- 拖拽物块改 k ----
const svgRef = ref(null)
let dragging = false
function clientToK(e) {
  const svg = svgRef.value
  if (!svg || !svg.getScreenCTM) return kTarget.value
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const loc = pt.matrixTransform(svg.getScreenCTM().inverse())
  const k = (loc.y - yTop0) / (yTop1 - yTop0)
  return Math.min(1, Math.max(0, k))
}
function onBlockMove(e) {
  if (dragging) kTarget.value = clientToK(e)
}
function onBlockUp() {
  dragging = false
  window.removeEventListener('pointermove', onBlockMove)
  window.removeEventListener('pointerup', onBlockUp)
}
function onBlockDown(e) {
  dragging = true
  window.addEventListener('pointermove', onBlockMove)
  window.addEventListener('pointerup', onBlockUp)
  e.preventDefault()
}

// ---- F–浸入 曲线 ----
const CH_W = 300
const CH_H = 168
const CH_PAD = 22
const Fmax = computed(() => {
  const f = Math.max(G.value, RHO_LIQ[liquid.value] * G_CONST * vol.value * 1e-3) * 1.12
  return f > 0 ? f : 1
})
function linePath(fn) {
  const pts = []
  for (let i = 0; i <= 20; i++) {
    const k = i / 20
    const f = fn(k)
    const x = CH_PAD + k * (CH_W - 2 * CH_PAD)
    const y = CH_H - CH_PAD - (f / Fmax.value) * (CH_H - 2 * CH_PAD)
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return 'M' + pts.join(' L')
}
const fbPath = computed(() => linePath((k) => RHO_LIQ[liquid.value] * G_CONST * (k * vol.value) * 1e-3))
const fpPath = computed(() =>
  linePath((k) => Math.max(0, G.value - RHO_LIQ[liquid.value] * G_CONST * (k * vol.value) * 1e-3))
)
const fbArea = computed(() => fbPath.value + ` L ${CH_W - CH_PAD} ${CH_H - CH_PAD} L ${CH_PAD} ${CH_H - CH_PAD} Z`)
const curX = computed(() => CH_PAD + kAnim.value * (CH_W - 2 * CH_PAD))
const curFbY = computed(() => CH_H - CH_PAD - (Fb.value / Fmax.value) * (CH_H - 2 * CH_PAD))
const curFpY = computed(() => CH_H - CH_PAD - (Fpull.value / Fmax.value) * (CH_H - 2 * CH_PAD))
const gridV = [0.25, 0.5, 0.75].map((k) => CH_PAD + k * (CH_W - 2 * CH_PAD))
const gridH = [0.25, 0.5, 0.75].map((f) => CH_H - CH_PAD - f * (CH_H - 2 * CH_PAD))

// ---- 阿基米德验证条 ----
const archPct = computed(() => Math.min(100, (Fb.value / Fmax.value) * 100))

// ---- 分步演示 ----
function demo(step) {
  if (step === 0) kTarget.value = 0
  else if (step === 1) kTarget.value = 0.4
  else if (step === 2) kTarget.value = 0.85
  else if (step === 3) kTarget.value = 1
  else if (step === 4) {
    liquid.value = 'brine'
    kTarget.value = 1
  }
}
function reset() {
  kTarget.value = 0
}

// 首次交互即标记完成
let completed = false
watch([kAnim], () => {
  if (!completed && kAnim.value > 0.05) {
    completed = true
    emit('complete')
  }
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>浮力探究装置</strong>
          <span>拖动物块 / 滑块改变浸没深度</span>
        </div>
        <svg
          ref="svgRef"
          class="buoy-svg"
          :viewBox="`0 0 ${VB_W} ${VB_H}`"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" :stop-color="waterTopColor" />
              <stop offset="1" :stop-color="waterBotColor" />
            </linearGradient>
            <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="rgba(255,255,255,0)" />
              <stop offset="0.45" stop-color="rgba(255,255,255,0.45)" />
              <stop offset="1" stop-color="rgba(255,255,255,0.05)" />
            </linearGradient>
            <linearGradient id="blockal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#cdd4df" />
              <stop offset="1" stop-color="#8b94a4" />
            </linearGradient>
            <linearGradient id="blockiron" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#9aa1ac" />
              <stop offset="1" stop-color="#565c66" />
            </linearGradient>
            <linearGradient id="blockcopper" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#e0a878" />
              <stop offset="1" stop-color="#b06b3c" />
            </linearGradient>
            <linearGradient id="arrowG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#ff6270" />
              <stop offset="1" stop-color="#d92135" />
            </linearGradient>
            <linearGradient id="arrowFb" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#37d894" />
              <stop offset="1" stop-color="#0d9b61" />
            </linearGradient>
            <linearGradient id="arrowFp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#5b97f2" />
              <stop offset="1" stop-color="#145fd2" />
            </linearGradient>
            <linearGradient id="fbAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="rgba(13,155,97,0.28)" />
              <stop offset="1" stop-color="rgba(13,155,97,0.02)" />
            </linearGradient>
            <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="rgba(0,0,0,0.22)" />
            </filter>
            <clipPath id="tankClip">
              <path :d="tankClipPath" />
            </clipPath>
          </defs>

          <rect x="0" y="0" :width="VB_W" :height="VB_H" fill="#fbfaf7" />

          <!-- 玻璃烧杯 -->
          <path :d="tankGlassPath" fill="rgba(255,255,255,0.5)" stroke="#0b0b0b" stroke-width="3" filter="url(#soft)" />
          <!-- 水体（裁剪在烧杯内） -->
          <g clip-path="url(#tankClip)">
            <path :d="waterPath" fill="url(#waterGrad)" opacity="0.92" />
            <path :d="waterSurfLine" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2.4" stroke-linecap="round" />
            <path :d="waterSurfLine" fill="none" stroke="rgba(40,110,160,0.5)" stroke-width="1" stroke-dasharray="2 5" transform="translate(0,3)" />
            <!-- 气泡 -->
            <circle v-for="(b, i) in bubbles" :key="i" :cx="b.cx" :cy="b.cy" :r="b.r" fill="rgba(255,255,255,0.8)" :opacity="b.op" />
          </g>
          <!-- 玻璃高光 -->
          <path :d="tankGlassPath" fill="url(#glassGrad)" opacity="0.7" />
          <rect :x="TANK_X + 14" :y="TANK_TOP + 18" width="14" :height="TANK_BOT - TANK_TOP - 60" rx="7" fill="rgba(255,255,255,0.5)" />

          <!-- 刻度尺（左侧浸入深度） -->
          <g class="ruler">
            <line :x1="TANK_X - 24" :y1="yTop0" :x2="TANK_X - 24" :y2="yTop1" stroke="#0b0b0b" stroke-width="2" />
            <g v-for="(ty, i) in depthTicks" :key="i">
              <line :x1="TANK_X - 24" :y1="ty" :x2="TANK_X - 18" :y2="ty" stroke="#0b0b0b" stroke-width="1.6" />
            </g>
            <polygon
              :points="`${TANK_X - 14},${yTop - 6} ${TANK_X - 14},${yTop + 6} ${TANK_X - 4},${yTop}`"
              fill="#d92135"
              stroke="#0b0b0b"
              stroke-width="1"
            />
            <text :x="TANK_X - 30" :y="yTop + 4" text-anchor="end" font-size="12" font-weight="800" fill="#d92135">
              {{ (kAnim * 100).toFixed(0) }}%
            </text>
          </g>

          <!-- 物块（可拖拽） -->
          <g style="cursor: grab" @pointerdown="onBlockDown" filter="url(#soft)">
            <rect
              :x="blockX"
              :y="yTop"
              :width="H_block"
              :height="H_block"
              rx="9"
              :fill="`url(#block${material})`"
              stroke="#0b0b0b"
              stroke-width="2.4"
            />
            <rect :x="blockX" :y="yTop" :width="H_block" :height="Math.min(13, H_block * 0.2)" rx="9" fill="rgba(255,255,255,0.32)" />
            <rect v-if="subH > 0" :x="blockX" :y="subTop" :width="H_block" :height="subH" fill="rgba(20,70,120,0.26)" />
            <line
              v-if="subH > 0 && subH < H_block"
              :x1="blockX"
              :x2="blockX + H_block"
              :y1="liquidY"
              :y2="liquidY"
              stroke="rgba(255,255,255,0.7)"
              stroke-width="1.6"
              stroke-dasharray="5 3"
            />
            <text
              :x="cx"
              :y="blockMidY - 6"
              text-anchor="middle"
              dominant-baseline="central"
              font-size="14"
              font-weight="800"
              fill="#0b0b0b"
            >
              {{ MAT_LABEL[material] }}
            </text>
            <text
              :x="cx"
              :y="blockMidY + 12"
              text-anchor="middle"
              dominant-baseline="central"
              font-size="10.5"
              font-weight="700"
              fill="#2b2b2b"
            >
              ρ={{ RHO_MAT[material] }}
            </text>
          </g>

          <!-- 弹簧秤 -->
          <line :x1="cx" :y1="8" :x2="cx" :y2="housingTop" stroke="#0b0b0b" stroke-width="3" />
          <rect :x="cx - 26" :y="housingTop" width="52" :height="housingH" rx="7" fill="#fffef9" stroke="#0b0b0b" stroke-width="2.4" filter="url(#soft)" />
          <rect :x="cx - 19" :y="housingTop + 4" width="38" :height="housingH - 8" rx="4" fill="#0d1330" />
          <text :x="cx" :y="housingTop + housingH / 2" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="800" fill="#7ff0c0">
            {{ Fpull.toFixed(2) }}N
          </text>
          <path :d="springPathD" fill="none" stroke="#0b0b0b" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
          <path :d="cordPathD" fill="none" stroke="#0b0b0b" stroke-width="2" />
          <circle :cx="cx" :cy="hookY" r="3" fill="#0b0b0b" />

          <!-- 受力箭头 -->
          <!-- 重力 G 向下（块中心） -->
          <line :x1="cx" :y1="blockMidY" :x2="cx" :y2="blockMidY + gLen" stroke="url(#arrowG)" stroke-width="4" stroke-linecap="round" filter="url(#soft)" />
          <polygon :points="arrowHead(cx, blockMidY + gLen, 'down')" fill="#d92135" />
          <text :x="cx - 14" :y="blockMidY + gLen / 2" text-anchor="end" font-size="12" font-weight="800" fill="#d92135" paint-order="stroke" stroke="#fffef9" stroke-width="3">
            G={{ G.toFixed(2) }}
          </text>
          <!-- 浮力 F浮 向上（块底） -->
          <line :x1="cx" :y1="blockBotY" :x2="cx" :y2="blockBotY - fbLen" stroke="url(#arrowFb)" stroke-width="4" stroke-linecap="round" filter="url(#soft)" />
          <polygon :points="arrowHead(cx, blockBotY - fbLen, 'up')" fill="#0d9b61" />
          <text :x="cx - 14" :y="blockBotY - fbLen / 2" text-anchor="end" font-size="12" font-weight="800" fill="#0d9b61" paint-order="stroke" stroke="#fffef9" stroke-width="3">
            F浮={{ Fb.toFixed(2) }}
          </text>
          <!-- 拉力 F拉 向上（块右侧） -->
          <line :x1="cx + H_block / 2 + 20" :y1="yTop" :x2="cx + H_block / 2 + 20" :y2="yTop - fpLen" stroke="url(#arrowFp)" stroke-width="4" stroke-linecap="round" filter="url(#soft)" />
          <polygon :points="arrowHead(cx + H_block / 2 + 20, yTop - fpLen, 'up')" fill="#145fd2" />
          <text :x="cx + H_block / 2 + 28" :y="yTop - fpLen / 2" font-size="12" font-weight="800" fill="#145fd2" paint-order="stroke" stroke="#fffef9" stroke-width="3">
            F拉={{ Fpull.toFixed(2) }}
          </text>

          <!-- 上浮提示 -->
          <text v-if="willRise" :x="cx" :y="TANK_BOT - 14" text-anchor="middle" font-size="13" font-weight="800" fill="#d92135">
            浮力 &gt; 重力，物体将上浮（F拉 = 0）
          </text>
          <text :x="cx" :y="TANK_BOT + 22" text-anchor="middle" font-size="12" font-weight="700" fill="#5a6b78">
            {{ LIQ_LABEL[liquid] }}　ρ液 = {{ RHO_LIQ[liquid] }} g/cm³
          </text>
        </svg>
      </div>
      <div class="lab-actions">
        <button class="btn" @click="reset">重置</button>
        <span class="feedback ok">浮力只与 ρ液、V排 有关；完全浸没后 F浮 不再变化</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <!-- 实时读数 -->
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实时读数</strong><span>称重法</span></div>
        <div class="lab-readout">
          <div class="lab-stat"><span class="dot dot-g"></span><span class="lab-stat-label">物重 G</span><strong>{{ G.toFixed(2) }}<i>N</i></strong></div>
          <div class="lab-stat accent"><span class="dot dot-fp"></span><span class="lab-stat-label">测力计 F拉</span><strong>{{ Fpull.toFixed(2) }}<i>N</i></strong></div>
          <div class="lab-stat success"><span class="dot dot-fb"></span><span class="lab-stat-label">浮力 F浮</span><strong>{{ Fb.toFixed(2) }}<i>N</i></strong></div>
          <div class="lab-stat"><span class="dot dot-v"></span><span class="lab-stat-label">排开 V排</span><strong>{{ Vrow.toFixed(0) }}<i>cm³</i></strong></div>
        </div>
      </div>

      <!-- 阿基米德原理验证 -->
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>阿基米德原理验证</strong><span>F浮 = G排</span></div>
        <div class="arch">
          <div class="arch-row">
            <span class="arch-label">F浮</span>
            <div class="bar bar-fb" :style="{ width: archPct + '%' }"></div>
            <b>{{ Fb.toFixed(2) }} N</b>
          </div>
          <div class="arch-eq">=</div>
          <div class="arch-row">
            <span class="arch-label">G排</span>
            <div class="bar bar-gp" :style="{ width: archPct + '%' }"></div>
            <b>{{ Fb.toFixed(2) }} N</b>
          </div>
          <p class="arch-note">两条永远一样长 ✓　F浮 = G排 = ρ液·g·V排</p>
        </div>
      </div>

      <!-- 可调变量 -->
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong></div>
        <div class="lab-params">
          <ParamSlider v-model="kTarget" :min="0" :max="1" :step="0.01" :precision="2" label="浸没比例 k" :hint="(kAnim * 100).toFixed(0) + '%'" />
          <div class="param-group">
            <span>材料</span>
            <button v-for="m in ['al', 'iron', 'copper']" :key="m" class="btn" :class="{ 'btn-primary': material === m }" @click="material = m">{{ MAT_LABEL[m] }} ρ={{ RHO_MAT[m] }}</button>
          </div>
          <div class="param-group">
            <span>体积</span>
            <button v-for="v in [25, 50]" :key="v" class="btn" :class="{ 'btn-primary': vol === v }" @click="vol = v">{{ v }} cm³</button>
          </div>
          <div class="param-group">
            <span>液体</span>
            <button v-for="l in ['alcohol', 'water', 'brine']" :key="l" class="btn" :class="{ 'btn-primary': liquid === l }" @click="liquid = l">{{ LIQ_LABEL[l] }} ρ={{ RHO_LIQ[l] }}</button>
          </div>
        </div>
      </div>

      <!-- F–浸入 曲线 -->
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>F–浸入 关系</strong><span>称重法 / 排水法</span></div>
        <svg class="chart-svg" :viewBox="`0 0 ${CH_W} ${CH_H}`" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="fbAreaGrad2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="rgba(13,155,97,0.3)" />
              <stop offset="1" stop-color="rgba(13,155,97,0.02)" />
            </linearGradient>
          </defs>
          <line :x1="CH_PAD" :y1="CH_H - CH_PAD" :x2="CH_W - CH_PAD" :y2="CH_H - CH_PAD" stroke="#0b0b0b" stroke-width="1.5" />
          <line :x1="CH_PAD" :y1="CH_PAD" :x2="CH_PAD" :y2="CH_H - CH_PAD" stroke="#0b0b0b" stroke-width="1.5" />
          <line v-for="(x, i) in gridV" :key="'v' + i" :x1="x" :y1="CH_PAD" :x2="x" :y2="CH_H - CH_PAD" stroke="rgba(0,0,0,0.07)" stroke-width="1" />
          <line v-for="(y, i) in gridH" :key="'h' + i" :x1="CH_PAD" :y1="y" :x2="CH_W - CH_PAD" :y2="y" stroke="rgba(0,0,0,0.07)" stroke-width="1" />
          <path :d="fbArea" fill="url(#fbAreaGrad2)" />
          <path :d="fbPath" fill="none" stroke="#0d9b61" stroke-width="2.8" stroke-linejoin="round" />
          <path :d="fpPath" fill="none" stroke="#d92135" stroke-width="2.8" stroke-linejoin="round" />
          <circle :cx="curX" :cy="curFbY" r="5.5" fill="#0d9b61" stroke="#0b0b0b" stroke-width="1.5">
            <animate attributeName="r" values="5.5;7.5;5.5" dur="1.4s" repeatCount="indefinite" />
          </circle>
          <circle :cx="curX" :cy="curFpY" r="5.5" fill="#d92135" stroke="#0b0b0b" stroke-width="1.5">
            <animate attributeName="r" values="5.5;7.5;5.5" dur="1.4s" repeatCount="indefinite" />
          </circle>
          <text :x="CH_PAD" :y="CH_H - CH_PAD + 14" font-size="10" fill="#777067">0</text>
          <text :x="CH_W - CH_PAD" :y="CH_H - CH_PAD + 14" text-anchor="end" font-size="10" fill="#777067">浸入 k →</text>
          <text :x="CH_PAD - 6" :y="CH_PAD + 4" text-anchor="end" font-size="10" fill="#777067">F</text>
          <g class="chart-legend">
            <rect :x="CH_W - 96" y="6" width="11" height="4" rx="2" fill="#0d9b61" />
            <text :x="CH_W - 80" y="11" font-size="10" font-weight="700" fill="#0d9b61">F浮</text>
            <rect :x="CH_W - 50" y="6" width="11" height="4" rx="2" fill="#d92135" />
            <text :x="CH_W - 34" y="11" font-size="10" font-weight="700" fill="#d92135">F拉</text>
          </g>
        </svg>
      </div>

      <!-- 分步演示 -->
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>分步演示</strong></div>
        <div class="lab-steps">
          <button class="step" @click="demo(0)"><i>①</i>空气中称重</button>
          <button class="step" @click="demo(1)"><i>②</i>部分浸入</button>
          <button class="step" @click="demo(2)"><i>③</i>接近全浸</button>
          <button class="step" @click="demo(3)"><i>④</i>完全浸没</button>
          <button class="step" @click="demo(4)"><i>⑤</i>换盐水</button>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.buoy-svg {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 440px;
}
.chart-svg {
  display: block;
  width: 100%;
  height: auto;
  padding: 6px;
}
.param-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-top: 1px dashed var(--line);
}
.param-group > span {
  font-size: 12px;
  font-weight: 800;
  min-width: 32px;
  color: var(--muted-2);
}
.param-group .btn {
  min-height: 34px;
  padding: 0 10px;
  font-size: 12px;
}
.arch {
  padding: 12px;
}
.arch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.arch-label {
  width: 34px;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-h);
}
.arch-row b {
  font-family: var(--mono);
  font-size: 13px;
  min-width: 56px;
  text-align: right;
}
.arch-eq {
  text-align: center;
  font-size: 16px;
  font-weight: 900;
  color: var(--muted-2);
  margin: 2px 0 6px 42px;
}
.bar {
  height: 18px;
  border: 2px solid var(--line);
  border-radius: 5px;
  transition: width 0.12s ease;
}
.bar-fb {
  background: linear-gradient(90deg, #37d894, #0d9b61);
}
.bar-gp {
  background: linear-gradient(90deg, #5b97f2, #145fd2);
}
.arch-note {
  margin: 8px 0 0;
  font-size: 12.5px;
  font-weight: 800;
  color: var(--success);
}
/* 读数卡 */
.lab-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  border-left: 5px solid var(--muted-2);
  background: #fff;
}
.lab-stat.accent {
  border-left-color: var(--blue);
}
.lab-stat.success {
  border-left-color: var(--success);
}
.lab-stat .lab-stat-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--muted-2);
  flex: 1;
}
.lab-stat strong {
  font-family: var(--mono);
  font-size: 19px;
  font-weight: 800;
  color: var(--text-h);
}
.lab-stat strong i {
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  color: var(--muted-2);
  margin-left: 2px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--line);
  flex: none;
}
.dot-g {
  background: #d92135;
}
.dot-fp {
  background: #145fd2;
}
.dot-fb {
  background: #0d9b61;
}
.dot-v {
  background: #145fd2;
  opacity: 0.55;
}
/* 分步步进器 */
.lab-steps {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 12px;
}
.step {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-start;
  padding: 9px 10px;
  border: 2px solid var(--line);
  border-radius: 8px;
  background: #fff;
  font-weight: 800;
  font-size: 12.5px;
  cursor: pointer;
  box-shadow: 3px 3px 0 var(--line);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
.step i {
  font-style: normal;
  font-size: 15px;
  color: var(--accent);
}
.step:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--line);
}
.step:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--line);
}
</style>
