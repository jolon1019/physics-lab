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

// ---- 派生物理量 ----
const G = computed(() => RHO_MAT[material.value] * G_CONST * vol.value * 1e-3)
const Vrow = computed(() => kAnim.value * vol.value)
const Fb = computed(() => RHO_LIQ[liquid.value] * G_CONST * Vrow.value * 1e-3)
const Fpull = computed(() => Math.max(0, G.value - Fb.value))
const willRise = computed(() => Fb.value > G.value + 1e-9)

// ---- 装置几何 ----
const VB_W = 480
const VB_H = 560
const TANK_X = 70
const TANK_W = 300
const TANK_TOP = 168
const TANK_BOT = 512
const LIQ_BASE = TANK_TOP + 32
const cx = TANK_X + TANK_W / 2
const H_block = computed(() => (vol.value === 25 ? 84 : 122))
const yTop0 = computed(() => LIQ_BASE - 36 - H_block.value)
const yTop1 = computed(() => LIQ_BASE + 10)
const yTop = computed(() => yTop0.value + kAnim.value * (yTop1.value - yTop0.value))
const blockX = computed(() => cx - H_block.value / 2)
const liquidY = computed(() => LIQ_BASE - kAnim.value * 10)
const subTop = computed(() => Math.max(yTop.value, liquidY.value))
const subH = computed(() => Math.max(0, yTop.value + H_block.value - subTop.value))
const blockColor = computed(() => ({ al: '#aeb6c2', iron: '#6c727c', copper: '#c9824e' }[material.value]))
const liqColor = computed(
  () => ({ alcohol: 'rgba(243,226,176,0.55)', water: 'rgba(142,201,238,0.5)', brine: 'rgba(191,224,232,0.55)' }[liquid.value])
)

// ---- 弹簧秤 ----
const fixedY = 46
const cordTopY = computed(() => fixedY + 26)
const cordPath = computed(() => {
  const top = cordTopY.value
  const bottom = yTop.value
  const coils = 6
  const span = bottom - top
  let d = `M ${cx} ${top.toFixed(1)}`
  for (let i = 1; i <= coils; i++) {
    const y = top + (span * i) / coils
    const x = cx + (i % 2 === 0 ? 7 : -7)
    d += ` L ${x} ${y.toFixed(1)}`
  }
  return d
})

// ---- 受力箭头 ----
const gLen = computed(() => 26 + G.value * 15)
const fbLen = computed(() => 26 + Fb.value * 15)
const fpLen = computed(() => 26 + Fpull.value * 15)
const blockMidY = computed(() => yTop.value + H_block.value / 2)
const blockBotY = computed(() => yTop.value + H_block.value)

function arrowHead(x, y, dir) {
  const s = 6
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
  const k = (loc.y - yTop0.value) / (yTop1.value - yTop0.value)
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
const CH_PAD = 20
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
const fpPath = computed(() => linePath((k) => Math.max(0, G.value - RHO_LIQ[liquid.value] * G_CONST * (k * vol.value) * 1e-3)))
const curX = computed(() => CH_PAD + kAnim.value * (CH_W - 2 * CH_PAD))
const curFbY = computed(() => CH_H - CH_PAD - (Fb.value / Fmax.value) * (CH_H - 2 * CH_PAD))
const curFpY = computed(() => CH_H - CH_PAD - (Fpull.value / Fmax.value) * (CH_H - 2 * CH_PAD))

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
          <rect x="0" y="0" :width="VB_W" :height="VB_H" fill="#fbfaf7" />
          <!-- 水槽 -->
          <rect
            :x="TANK_X"
            :y="TANK_TOP"
            :width="TANK_W"
            :height="TANK_BOT - TANK_TOP"
            fill="rgba(255,255,255,0.35)"
            stroke="#0b0b0b"
            stroke-width="3"
          />
          <!-- 液体 -->
          <rect :x="TANK_X + 3" :y="liquidY" :width="TANK_W - 6" :height="TANK_BOT - liquidY - 3" :fill="liqColor" />
          <line :x1="TANK_X + 3" :x2="TANK_X + TANK_W - 3" :y1="liquidY" :y2="liquidY" stroke="rgba(40,90,140,0.9)" stroke-width="2" />
          <!-- 物块（可拖拽） -->
          <g style="cursor: grab" @pointerdown="onBlockDown">
            <rect :x="blockX" :y="yTop" :width="H_block" :height="H_block" :fill="blockColor" stroke="#0b0b0b" stroke-width="2.4" />
            <rect v-if="subH > 0" :x="blockX" :y="subTop" :width="H_block" :height="subH" fill="rgba(40,90,140,0.35)" />
            <text :x="cx" :y="blockMidY" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="800" fill="#0b0b0b">{{ MAT_LABEL[material] }}</text>
          </g>
          <!-- 弹簧秤 -->
          <line :x1="cx" :y1="fixedY" :x2="cx" :y2="fixedY + 10" stroke="#0b0b0b" stroke-width="3" />
          <path :d="cordPath" fill="none" stroke="#0b0b0b" stroke-width="2" />
          <circle :cx="cx" :cy="fixedY + 22" r="16" fill="#fffef9" stroke="#0b0b0b" stroke-width="2.4" />
          <text :x="cx" :y="fixedY + 22" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="800" fill="#0b0b0b">{{ Fpull.toFixed(2) }}</text>
          <!-- 重力 G 向下 -->
          <line :x1="cx" :y1="blockMidY" :x2="cx" :y2="blockMidY + gLen" stroke="#d92135" stroke-width="3" />
          <polygon :points="arrowHead(cx, blockMidY + gLen, 'down')" fill="#d92135" />
          <text :x="cx + 12" :y="blockMidY + gLen / 2" font-size="12" font-weight="800" fill="#d92135">G</text>
          <!-- 浮力 F浮 向上 -->
          <line :x1="cx" :y1="blockBotY" :x2="cx" :y2="blockBotY - fbLen" stroke="#0d9b61" stroke-width="3" />
          <polygon :points="arrowHead(cx, blockBotY - fbLen, 'up')" fill="#0d9b61" />
          <text :x="cx + 12" :y="blockBotY - fbLen / 2" font-size="12" font-weight="800" fill="#0d9b61">F浮</text>
          <!-- 拉力 F拉 向上（块右侧） -->
          <line :x1="cx + H_block / 2 + 18" :y1="yTop" :x2="cx + H_block / 2 + 18" :y2="yTop - fpLen" stroke="#145fd2" stroke-width="3" />
          <polygon :points="arrowHead(cx + H_block / 2 + 18, yTop - fpLen, 'up')" fill="#145fd2" />
          <text :x="cx + H_block / 2 + 28" :y="yTop - fpLen / 2" font-size="12" font-weight="800" fill="#145fd2">F拉</text>
          <!-- 上浮提示 -->
          <text v-if="willRise" :x="cx" :y="TANK_BOT - 14" text-anchor="middle" font-size="13" font-weight="800" fill="#d92135">浮力 > 重力，物体将上浮（F拉 = 0）</text>
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
          <div class="lab-stat"><span>物重 G</span><strong>{{ G.toFixed(2) }} N</strong></div>
          <div class="lab-stat accent"><span>测力计 F拉</span><strong>{{ Fpull.toFixed(2) }} N</strong></div>
          <div class="lab-stat success"><span>浮力 F浮</span><strong>{{ Fb.toFixed(2) }} N</strong></div>
          <div class="lab-stat"><span>排开 V排</span><strong>{{ Vrow.toFixed(0) }} cm³</strong></div>
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
          <div class="arch-row">
            <span class="arch-label">G排</span>
            <div class="bar bar-gp" :style="{ width: archPct + '%' }"></div>
            <b>{{ Fb.toFixed(2) }} N</b>
          </div>
          <p class="arch-note">两条永远一样长 ✓</p>
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
        <div class="lab-panel-head"><strong>F–浸入 关系</strong><span>蓝 F浮 / 橙 F拉</span></div>
        <svg class="chart-svg" :viewBox="`0 0 ${CH_W} ${CH_H}`" preserveAspectRatio="xMidYMid meet">
          <line :x1="CH_PAD" :y1="CH_H - CH_PAD" :x2="CH_W - CH_PAD" :y2="CH_H - CH_PAD" stroke="#0b0b0b" stroke-width="1.5" />
          <line :x1="CH_PAD" :y1="CH_PAD" :x2="CH_PAD" :y2="CH_H - CH_PAD" stroke="#0b0b0b" stroke-width="1.5" />
          <path :d="fbPath" fill="none" stroke="#0d9b61" stroke-width="2.6" stroke-linejoin="round" />
          <path :d="fpPath" fill="none" stroke="#d92135" stroke-width="2.6" stroke-linejoin="round" />
          <circle :cx="curX" :cy="curFbY" r="4.5" fill="#0d9b61" stroke="#0b0b0b" stroke-width="1.5" />
          <circle :cx="curX" :cy="curFpY" r="4.5" fill="#d92135" stroke="#0b0b0b" stroke-width="1.5" />
          <text :x="CH_W - CH_PAD" :y="CH_H - CH_PAD + 14" text-anchor="end" font-size="10" fill="#777067">浸入 k →</text>
        </svg>
      </div>

      <!-- 分步演示 -->
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>分步演示</strong></div>
        <div class="lab-params">
          <button class="btn" @click="demo(0)">① 空气中称重</button>
          <button class="btn" @click="demo(1)">② 部分浸入</button>
          <button class="btn" @click="demo(2)">③ 接近全浸</button>
          <button class="btn" @click="demo(3)">④ 完全浸没</button>
          <button class="btn" @click="demo(4)">⑤ 换盐水</button>
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
  min-height: 420px;
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
  padding: 10px 12px;
}
.arch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
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
.bar {
  height: 16px;
  border: 2px solid var(--line);
  border-radius: 4px;
  transition: width 0.12s ease;
}
.bar-fb {
  background: var(--success);
}
.bar-gp {
  background: var(--blue);
}
.arch-note {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 800;
  color: var(--success);
}
</style>
