<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

const N = ref(10) // 压力 N
const surface = ref('wood') // wood / towel / sand
const speed = ref(2) // 拉动速度 m/s（仅影响运动线密度）
const wide = ref(true) // 接触面积（平放=大 / 侧放=小）

const MU = { wood: 0.4, towel: 0.65, sand: 0.85 }
const SURF_LABEL = { wood: '木板面', towel: '毛巾面', sand: '砂纸面' }
const SURF_TONE = {
  wood: { base: '#caa06a', edge: '#8a5a2b', dark: '#6f4622', grain: 'rgba(120,72,30,0.55)' },
  towel: { base: '#7fb0d8', edge: '#3f6f97', dark: '#33597c', grain: 'rgba(255,255,255,0.55)' },
  sand: { base: '#e7cf9a', edge: '#b89653', dark: '#8f7034', grain: 'rgba(143,112,52,0.6)' }
}

const fNum = computed(() => MU[surface.value] * N.value)
const fText = computed(() => fNum.value.toFixed(2))

let completed = false

// ===== 几何常量（SVG 逻辑坐标，viewBox 0 0 640 520）=====
const VB_W = 640
const VB_H = 520
const GROUND_Y = 384 // 接触面上沿（桌面，固定不可移动）
const BW_WIDE = 150
const BW_NARROW = 64
const BW_H_WIDE = 72
const BW_H_NARROW = 150
const blockW = computed(() => (wide.value ? BW_WIDE : BW_NARROW))
const blockH = computed(() => (wide.value ? BW_H_WIDE : BW_H_NARROW))

// ===== 摆放编辑器（引用 e-melt 方案）=====
const editMode = ref(false)
const selected = ref('block')
const layout = reactive({
  block: { x: 372, baseline: GROUND_Y, w: BW_WIDE },
  dyn:   { x: 78,  baseline: GROUND_Y - BW_H_WIDE / 2, w: 74 },
})
const LS_KEY = 'efriction-layout-v1'
const savedLayout = ref(null)
const hint = ref('拖动物块：当施加的拉力 ≥ 摩擦力 f = μN 时，物块才开始滑动、弹簧才会被拉伸。点击「编辑摆放位置」可调整装置布局。')

function computeDefaults() {
  return {
    block: { x: 372, baseline: GROUND_Y, w: BW_WIDE },
    dyn:   { x: 78,  baseline: GROUND_Y - BW_H_WIDE / 2, w: 74 },
  }
}
function applyDefaults() {
  Object.assign(layout, savedLayout.value || computeDefaults())
}
function loadSaved() {
  try {
    const s = localStorage.getItem(LS_KEY)
    if (!s) return
    const o = JSON.parse(s)
    if (o && o.block && o.dyn) savedLayout.value = o
  } catch (_) {}
}
function saveLayout() {
  try {
    const o = JSON.parse(JSON.stringify(layout))
    localStorage.setItem(LS_KEY, JSON.stringify(o))
    savedLayout.value = o
    hint.value = '已保存当前摆放，刷新后将保持'
  } catch (_) {}
}
function resetLayout() {
  try { localStorage.removeItem(LS_KEY) } catch (_) {}
  savedLayout.value = null
  applyDefaults()
  hint.value = '已恢复为默认布局'
}

// ===== 互动：拖动物块施加拉力（严格物理模型）=====
// 模型：cursor dx = 施加的位移；F = dx*K_FORCE。
//   当 F < f (μN)：物块保持原位，弹簧不拉伸（cursor 可"悬空"在物块前方）。
//   当 F ≥ f：物块开始滑动 slideOffset = dx - f/K_FORCE，弹簧随物块实际位移同步拉伸。
//   松手：cursor 归零 → 弹簧回弹 → 物块回位。
const K_FORCE = 0.16 // px → N
const pullTarget = ref(0) // cursor dx（逻辑 px）
const pullPx = ref(0)     // lerp 到 target（视觉平滑）
const slideOffset = ref(0) // 物块实际位移
const moving = ref(false)  // 物块是否正在滑动
const dragging = ref(false)

const forceThreshold = computed(() => fNum.value / K_FORCE) // 克服摩擦所需的 px
const forceApplied = computed(() => Math.max(0, pullPx.value) * K_FORCE)
// 弹簧仅在物块发生位移后才拉伸；测力计读数：滑动时=f（匀速二力平衡），静止时=0
const springStretch = computed(() => slideOffset.value)
const readout = computed(() => moving.value ? fNum.value : 0)

// ===== 拖动系统（摆放 / 拉动 共用）=====
let dragInfo = null
const svgRef = ref(null)

function toLogical(e) {
  const svg = svgRef.value
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const m = svg.getScreenCTM()
  if (!m) return { x: 0, y: 0 }
  const p = pt.matrixTransform(m.inverse())
  return { x: p.x, y: p.y }
}

function onPiecePointerDown(name, e) {
  const { x, y } = toLogical(e)
  selected.value = name
  if (editMode.value) {
    dragging.value = true
    dragInfo = { mode: 'place', name, lx: x, ly: y, x0: layout[name].x, b0: layout[name].baseline }
  } else {
    // 互动：仅物块可拖动
    if (name !== 'block') return
    dragging.value = true
    dragInfo = { mode: 'pull', lx: x, pull0: pullTarget.value }
    pullTarget.value = 0
    pullPx.value = 0
    slideOffset.value = 0
  }
  window.addEventListener('pointermove', onWinPointerMove)
  window.addEventListener('pointerup', onWinPointerUp, { once: true })
  window.addEventListener('pointercancel', onWinPointerUp, { once: true })
}
function onWinPointerMove(e) {
  if (!dragInfo) return
  const { x, y } = toLogical(e)
  if (dragInfo.mode === 'place') {
    layout[dragInfo.name].x = dragInfo.x0 + (x - dragInfo.lx)
    layout[dragInfo.name].baseline = dragInfo.b0 + (y - dragInfo.ly)
  } else {
    // 拉力模式：cursor dx 即施加位移；向左拖不产生拉力
    const dx = x - dragInfo.lx
    pullTarget.value = Math.max(0, Math.min(300, dragInfo.pull0 + dx))
  }
}
function onWinPointerUp() {
  dragging.value = false
  dragInfo = null
  window.removeEventListener('pointermove', onWinPointerMove)
  if (!editMode.value) pullTarget.value = 0 // 松手回弹
}
function onWheel(e) {
  if (!editMode.value || !selected.value) return
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.06 : 0.94
  layout[selected.value].w = Math.max(20, Math.min(260, layout[selected.value].w * factor))
}
function nudge(dx, dy) {
  if (!selected.value) return
  layout[selected.value].x += dx
  layout[selected.value].baseline += dy
}
function scaleSel(factor) {
  if (!selected.value) return
  layout[selected.value].w = Math.max(20, Math.min(260, layout[selected.value].w * factor))
}
function onKey(e) {
  if (!editMode.value || !selected.value) return
  const step = e.shiftKey ? 10 : 2
  switch (e.key) {
    case 'ArrowLeft': layout[selected.value].x -= step; e.preventDefault(); break
    case 'ArrowRight': layout[selected.value].x += step; e.preventDefault(); break
    case 'ArrowUp': layout[selected.value].baseline -= step; e.preventDefault(); break
    case 'ArrowDown': layout[selected.value].baseline += step; e.preventDefault(); break
    case '+': case '=': scaleSel(1.05); break
    case '-': case '_': scaleSel(0.95); break
  }
}

// ===== 动画循环：物理判定 + 视觉平滑 =====
let raf = null
let lastT = 0
const phase = ref(0)
function tick(now) {
  const dt = Math.min(((now - lastT) || 16) / 1000, 0.05)
  lastT = now
  // 弹簧拉伸/物块位移 lerp 到目标（用于松手回弹）
  pullPx.value += (pullTarget.value - pullPx.value) * Math.min(1, dt * 10)
  // 严格物理：只有当 cursor 施加的力 ≥ f 时，物块才开始滑动
  const effectivePull = Math.max(0, pullPx.value)
  const threshold = Math.max(0.001, forceThreshold.value)
  if (effectivePull > threshold) {
    slideOffset.value = effectivePull - threshold
    moving.value = true
  } else {
    // 物块保持原位、弹簧不拉伸（即使 cursor 还在阈值附近抖动也不会出现"半拉"）
    slideOffset.value = 0
    moving.value = false
  }
  if (moving.value) phase.value += dt * (4 + speed.value * 2)
  else phase.value += dt * 0.6
  raf = requestAnimationFrame(tick)
}

// ===== 派生坐标（供 SVG 模板） =====
const dynBodyX0 = computed(() => layout.dyn.x - 32)
const dynBodyX1 = computed(() => layout.dyn.x + 6)
const dynCY = computed(() => layout.dyn.baseline)
const baseLen = 30
const springLen = computed(() => baseLen + springStretch.value)
const hookX = computed(() => dynBodyX1.value + springLen.value)
const blockLeft = computed(() => layout.block.x - blockW.value / 2 + slideOffset.value)
const blockTop = computed(() => layout.block.baseline - blockH.value)
const blockCenterY = computed(() => blockTop.value + blockH.value / 2)

// 运动线（仅滑动时流动）
const motionLines = computed(() => {
  const out = []
  const count = Math.round(3 + speed.value * 2)
  const off = (phase.value * 26) % 30
  for (let i = 0; i < count; i++) out.push((i * 30 + off) % 150)
  return out
})

function mark() {
  if (!completed) {
    completed = true
    emit('complete')
  }
}
watch([N, surface, speed, wide], mark)

onMounted(() => {
  loadSaved()
  applyDefaults()
  lastT = performance.now()
  raf = requestAnimationFrame(tick)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pointermove', onWinPointerMove)
  window.removeEventListener('pointerup', onWinPointerUp)
  window.removeEventListener('pointercancel', onWinPointerUp)
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel" style="padding: 0; position: relative">
        <svg
          ref="svgRef"
          class="friction-svg"
          viewBox="0 0 640 520"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="滑动摩擦力演示动画"
          style="touch-action: none; height: min(520px, calc(100vh - 380px))"
        >
          <defs>
            <linearGradient id="fr-wood" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#e3b878" />
              <stop offset="0.5" stop-color="#cf9a55" />
              <stop offset="1" stop-color="#b27e3c" />
            </linearGradient>
            <linearGradient id="fr-wood-side" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#a9742f" />
              <stop offset="1" stop-color="#8a5d23" />
            </linearGradient>
            <linearGradient id="fr-dyn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#ffffff" />
              <stop offset="1" stop-color="#eef3f8" />
            </linearGradient>
            <filter id="fr-soft" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.28" />
            </filter>
          </defs>

          <!-- 桌面 / 接触面（固定不可移动） -->
          <rect x="0" :y="GROUND_Y" :width="VB_W" :height="VB_H - GROUND_Y" fill="#1d2a24" />
          <g>
            <template v-if="surface === 'wood'">
              <rect x="0" :y="GROUND_Y - 4" :width="VB_W" height="14" :fill="SURF_TONE.wood.base" />
              <rect x="0" :y="GROUND_Y - 4" :width="VB_W" height="14" fill="none" :stroke="SURF_TONE.wood.edge" stroke-width="2" />
              <g :stroke="SURF_TONE.wood.grain" stroke-width="1.4" opacity="0.8">
                <line v-for="i in 13" :key="'wg' + i" :x1="i * 50" :y1="GROUND_Y - 2" :x2="i * 50" :y2="GROUND_Y + 8" />
                <path d="M0 384 Q200 380 400 384 T640 384" fill="none" />
              </g>
            </template>
            <template v-else-if="surface === 'towel'">
              <rect x="0" :y="GROUND_Y - 4" :width="VB_W" height="14" :fill="SURF_TONE.towel.base" />
              <rect x="0" :y="GROUND_Y - 4" :width="VB_W" height="14" fill="none" :stroke="SURF_TONE.towel.edge" stroke-width="2" />
              <g :stroke="SURF_TONE.towel.grain" stroke-width="1.6">
                <circle v-for="i in 30" :key="'tl' + i" :cx="20 + (i * 21) % 600" :cy="GROUND_Y + 3" r="3.4" fill="none" />
              </g>
            </template>
            <template v-else>
              <rect x="0" :y="GROUND_Y - 4" :width="VB_W" height="14" :fill="SURF_TONE.sand.base" />
              <rect x="0" :y="GROUND_Y - 4" :width="VB_W" height="14" fill="none" :stroke="SURF_TONE.sand.edge" stroke-width="2" />
              <g :fill="SURF_TONE.sand.grain">
                <circle v-for="i in 70" :key="'sd' + i" :cx="14 + ((i * 53) % 612)" :cy="GROUND_Y - 1 + ((i * 31) % 9)" r="1.5" />
              </g>
            </template>
          </g>

          <!-- 弹簧测力计（水平，左侧，可拖动） -->
          <g filter="url(#fr-soft)" :class="{ 'is-sel': editMode && selected === 'dyn' }" @pointerdown="(e) => onPiecePointerDown('dyn', e)">
            <!-- 外壳 -->
            <rect :x="dynBodyX0" :y="dynCY - 15" :width="dynBodyX1 - dynBodyX0" height="30" rx="7" fill="url(#fr-dyn)" stroke="#2b3a4a" stroke-width="2.5" />
            <!-- 刻度窗 -->
            <rect :x="dynBodyX0 + 8" :y="dynCY - 10" :width="(dynBodyX1 - dynBodyX0) - 16" height="20" rx="3" fill="#f4f8fb" stroke="#9fb0c0" stroke-width="1.1" />
            <g stroke="#9fb0c0" stroke-width="1">
              <line v-for="i in 5" :key="'sc' + i" :x1="dynBodyX0 + 12" :y1="dynCY - 8 + i * 3.6" :x2="dynBodyX1 - 12" :y2="dynCY - 8 + i * 3.6" />
            </g>
            <!-- 指针（仅滑动时移动到 f 位置） -->
            <line
              :x1="dynBodyX0 + 10"
              :x2="dynBodyX1 - 10"
              :y1="dynCY - 9 + (readout / 26) * 18"
              :y2="dynCY - 9 + (readout / 26) * 18"
              stroke="#d92135" stroke-width="2.4"
            />
            <!-- 顶部提环 -->
            <circle :cx="dynBodyX0 + 14" :cy="dynCY - 22" r="7" fill="none" stroke="#2b3a4a" stroke-width="3" />
            <!-- 螺旋弹簧：仅物块发生位移后才被拉伸 -->
            <path
              :d="`M ${dynBodyX1} ${dynCY}
                ${Array.from({length:10},(_,i)=>{const xx=dynBodyX1+(springLen/10)*i;const yy=dynCY+(i%2?6:-6);return `L ${xx.toFixed(1)} ${yy.toFixed(1)}`}).join(' ')}
                L ${hookX.toFixed(1)} ${dynCY}`"
              fill="none" :stroke="springStretch > 0 ? '#5b6b7a' : '#7d8a9a'" :stroke-width="springStretch > 0 ? 2.4 : 2"
              :opacity="springStretch > 0 ? 1 : 0.7"
            />
            <!-- 挂钩 -->
            <circle :cx="hookX" :cy="dynCY" r="4.5" fill="none" stroke="#2b3a4a" stroke-width="2.6" />
            <!-- 数字读数 -->
            <text :x="(dynBodyX0 + dynBodyX1) / 2" :y="dynCY + 30" text-anchor="middle" font-size="13" font-weight="800" fill="#1a1a1a">{{ readout.toFixed(2) }}</text>
            <text :x="(dynBodyX0 + dynBodyX1) / 2" :y="dynCY + 44" text-anchor="middle" font-size="9" font-weight="700" fill="#555">N</text>
          </g>

          <!-- 拉杆（挂钩 → 物块左面） -->
          <line :x1="hookX" :y1="dynCY" :x2="blockLeft" :y2="blockCenterY" stroke="#3a6ea5" stroke-width="4" stroke-linecap="round" />

          <!-- 物块（可拖动；不显示内部文字，标注在物块上方） -->
          <g
            :transform="`translate(${blockLeft} ${blockTop})`"
            :class="{ 'is-sel': editMode && selected === 'block', 'is-grab': !editMode }"
            @pointerdown="(e) => onPiecePointerDown('block', e)"
            style="cursor: grab"
          >
            <rect :width="blockW" :height="blockH" rx="6" :fill="wide ? 'url(#fr-wood)' : 'url(#fr-wood-side)'" :stroke="SURF_TONE.wood.edge" stroke-width="2.5" />
            <rect :width="blockW" height="10" rx="6" fill="rgba(255,255,255,0.28)" />
            <g v-if="wide" :stroke="SURF_TONE.wood.grain" stroke-width="1.2" opacity="0.6">
              <line :x1="14" y1="22" :x2="blockW - 14" y2="22" />
              <line :x1="14" y1="44" :x2="blockW - 14" y2="44" />
            </g>
            <g v-else :stroke="SURF_TONE.wood.grain" stroke-width="1.2" opacity="0.6">
              <line x1="20" :y1="14" :x2="20" :y2="blockH - 14" />
              <line x1="44" :y1="14" :x2="44" :y2="blockH - 14" />
            </g>
          </g>

          <!-- 物块上方的标注（始终显示在物块上方） -->
          <text :x="blockLeft + blockW / 2" :y="blockTop - 10" text-anchor="middle" font-size="14" font-weight="800" fill="var(--bb-fg)" stroke="#0b0b0b" stroke-width="0.6" paint-order="stroke">物块</text>

          <!-- 施加拉力指示器（弹簧上方，拖动时显示） -->
          <g v-if="dragging && !editMode">
            <!-- 背景条 -->
            <rect :x="dynBodyX0" :y="dynCY - 58" width="210" height="10" rx="5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.3)" stroke-width="1" />
            <!-- 施加力条（按 forceApplied/forceThreshold 比例） -->
            <rect
              :x="dynBodyX0"
              :y="dynCY - 58"
              :width="Math.min(210, forceApplied * 210 / Math.max(0.01, fNum))"
              height="10"
              rx="5"
              :fill="moving ? 'var(--bb-red)' : 'var(--bb-amber)'"
            />
            <!-- 摩擦力阈值线（条右端） -->
            <line :x1="dynBodyX0 + 210" :y1="dynCY - 64" :x2="dynBodyX0 + 210" :y2="dynCY - 42" stroke="var(--bb-red)" stroke-width="2" />
            <!-- 标签 -->
            <text :x="dynBodyX0" :y="dynCY - 70" font-size="10" fill="var(--bb-fg-dim)">施加拉力 F</text>
            <text :x="dynBodyX0 + 210" :y="dynCY - 70" text-anchor="end" font-size="10" fill="var(--bb-red)">摩擦力 f</text>
            <!-- 数值 -->
            <text :x="dynBodyX0 + 105" :y="dynCY - 42" text-anchor="middle" font-size="11" font-weight="800" :fill="moving ? 'var(--bb-red)' : 'var(--bb-amber)'">F = {{ forceApplied.toFixed(2) }} N</text>
            <!-- 状态提示 -->
            <text :x="dynBodyX0 + 105" :y="dynCY + 76" text-anchor="middle" font-size="11" font-weight="700" :fill="moving ? 'var(--bb-red)' : 'var(--bb-amber)'">
              {{ moving ? '✓ 已克服摩擦，物块滑动' : (forceApplied > 0 ? '⚠ 拉力不足，物块保持原位' : '请向右拖动物块') }}
            </text>
          </g>

          <!-- 拉力方向箭头（向右，滑动时显示） -->
          <g v-if="moving">
            <line :x1="blockLeft + blockW + 6" :y1="blockCenterY - 30" :x2="blockLeft + blockW + 58" :y2="blockCenterY - 30" stroke="var(--bb-red)" stroke-width="4" stroke-linecap="round" />
            <path :d="`M ${blockLeft + blockW + 58} ${blockCenterY - 30} l-12 -7 l0 14 z`" fill="var(--bb-red)" />
          </g>

          <!-- 运动线（仅滑动时流动） -->
          <g stroke="var(--bb-blue)" stroke-width="2" :opacity="moving ? 0.45 : 0.15" stroke-linecap="round">
            <line
              v-for="(d, i) in motionLines"
              :key="'ml' + i"
              :x1="blockLeft + blockW + 10 + d"
              :y1="blockCenterY + 22"
              :x2="blockLeft + blockW + 10 + d + 14"
              :y2="blockCenterY + 22"
            />
          </g>

          <!-- 标注 -->
          <g font-family="system-ui, sans-serif" font-weight="700">
            <text x="20" y="30" font-size="14" fill="var(--bb-fg)">接触面：{{ SURF_LABEL[surface] }}（μ = {{ MU[surface] }}）</text>
            <text x="20" y="52" font-size="12.5" fill="var(--bb-fg-dim)">
              压力 N = {{ N }} N ・ 接触面积：{{ wide ? '大（平放）' : '小（侧放）' }}
            </text>
            <text x="20" y="504" font-size="14" font-weight="800" fill="var(--bb-red)">
              拖动物块：当施加拉力 F ≥ 摩擦力 f = μ・N = {{ fText }} N 时，物块才开始滑动、弹簧才会被拉伸
            </text>
          </g>
        </svg>

        <!-- 摆放编辑器浮层（引用 e-melt 方案） -->
        <div v-if="editMode" class="pos-editor">
          <div class="pe-head">
            <strong>摆放编辑器</strong>
            <span class="pe-tip">拖动元件移动 · 滚轮缩放</span>
          </div>
          <div class="pe-row">
            <label>元件</label>
            <select v-model="selected" class="pe-select">
              <option value="block">物块</option>
              <option value="dyn">弹簧测力计</option>
            </select>
          </div>
          <div class="pe-row pe-arrows">
            <button class="pe-btn" title="左移" @click="nudge(-2, 0)">←</button>
            <button class="pe-btn" title="上移" @click="nudge(0, -2)">↑</button>
            <button class="pe-btn" title="下移" @click="nudge(0, 2)">↓</button>
            <button class="pe-btn" title="右移" @click="nudge(2, 0)">→</button>
          </div>
          <div class="pe-row">
            <button class="pe-btn" @click="scaleSel(0.95)">缩小 −</button>
            <button class="pe-btn" @click="scaleSel(1.05)">放大 +</button>
          </div>
          <div class="pe-row pe-vals">
            x={{ Math.round(layout[selected]?.x || 0) }} ·
            y={{ Math.round(layout[selected]?.baseline || 0) }} ·
            w={{ Math.round(layout[selected]?.w || 0) }}
          </div>
          <div class="pe-row">
            <button class="pe-btn pe-save" @click="saveLayout">保存</button>
            <button class="pe-btn" @click="resetLayout">重置</button>
          </div>
        </div>
      </div>

      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': surface === 'wood' }" @click="surface = 'wood'">木板面</button>
        <button class="btn" :class="{ 'btn-primary': surface === 'towel' }" @click="surface = 'towel'">毛巾面</button>
        <button class="btn" :class="{ 'btn-primary': surface === 'sand' }" @click="surface = 'sand'">砂纸面</button>
        <button class="btn" :class="{ 'btn-primary': wide }" @click="wide = true">接触面积大</button>
        <button class="btn" :class="{ 'btn-primary': !wide }" @click="wide = false">接触面积小</button>
        <button class="btn" :class="{ 'btn-primary': editMode }" @click="editMode = !editMode">{{ editMode ? '完成摆放' : '编辑摆放位置' }}</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>探究摩擦力</span></div>
        <ParamSlider v-model="N" :min="2" :max="30" :step="1" :precision="0" label="压力 N（接触面正压力）" unit=" N" />
        <ParamSlider v-model="speed" :min="1" :max="6" :step="1" :precision="0" label="运动线速度 v" unit=" m/s" hint="仅影响运动线密度，不影响物理" />
        <p style="padding:4px 12px;font-size:12px;color:var(--text-dim)">接触面积（按钮切换）不影响滑动摩擦力大小。拖动右侧物块可手动施加拉力。</p>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实时数据</strong><span>{{ dragging ? '拖动中' : '待操作' }}</span></div>
        <div class="lab-readout">
          <div class="lab-stat">
            <span>施加拉力 F</span>
            <strong>{{ forceApplied.toFixed(2) }} N</strong>
          </div>
          <div class="lab-stat">
            <span>测力计读数</span>
            <strong>{{ readout.toFixed(2) }} N</strong>
          </div>
          <div class="lab-stat accent">
            <span>滑动摩擦力 f</span>
            <strong>{{ fText }} N</strong>
          </div>
          <div class="lab-stat" :class="{ success: moving }">
            <span>状态</span>
            <strong>{{ moving ? '滑动中' : (dragging ? '静止（拉力未达 f）' : '静止') }}</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="滑动摩擦力"
        formula="f = μ · N"
        :rows="[
          { label: '接触面 μ', value: MU[surface] },
          { label: '压力 N', value: N + ' N' }
        ]"
        :result="[{ label: '摩擦力 f = μN', value: fText + ' N' }]"
        verify="用弹簧测力计水平拉动物块：施加拉力 F < f 时，物块保持原位、弹簧不拉伸；F ≥ f 时物块开始滑动、弹簧随物块位移同步拉伸；滑动后测力计读数 = f（二力平衡）。f 只与接触面粗糙程度 μ 和压力 N 有关，与接触面积无关。"
      />
    </aside>
  </div>
</template>

<style scoped>
.friction-svg {
  display: block;
  width: 100%;
  height: 520px;
  background: transparent;
  border-radius: 8px;
}
.is-sel { outline: 2px dashed #ffd24d; outline-offset: 4px; }
.is-grab { cursor: grab; }
.is-grab:active { cursor: grabbing; }

.pos-editor {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 196px;
  background: #fffef5;
  border: 2px solid #111;
  border-radius: 8px;
  box-shadow: 4px 4px 0 #111;
  padding: 10px;
  font-size: 12px;
  color: #111;
  z-index: 6;
}
.pe-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
.pe-head strong { font-size: 13px; font-weight: 800; }
.pe-tip { font-size: 10px; color: #666; }
.pe-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.pe-row label { font-weight: 700; }
.pe-select { flex: 1; border: 2px solid #111; border-radius: 6px; padding: 3px 4px; font-size: 12px; background: #fff; }
.pe-arrows { justify-content: space-between; }
.pe-btn {
  border: 2px solid #111; border-radius: 6px; background: #ffe14d;
  font-weight: 700; font-size: 12px; padding: 4px 8px; cursor: pointer;
  box-shadow: 2px 2px 0 #111;
}
.pe-btn:active { transform: translate(2px, 2px); box-shadow: 0 0 0 #111; }
.pe-save { background: #ffd24d; }
.pe-vals {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
  background: #f3f1e3; border: 1px dashed #999; border-radius: 5px; padding: 4px 6px;
}
</style>