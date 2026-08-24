<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

// ===== 教材实验参数 =====
// 木块自重 G块 = 2 N；每个钩码 G码 = 4 N；压力 N = 2 + 钩码数 × 4
const BLOCK_G = 2
const HOOK_G = 4
const weights = ref(0) // 钩码数 0~3
const surface = ref('wood') // wood / towel / sand
const wide = ref(true) // 接触面积（平放=大 / 侧放=小）

const N = computed(() => BLOCK_G + weights.value * HOOK_G) // 压力（木块自重 + 钩码重）

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

// ===== 实验记录表（教材：自己设计表格记录数据）=====
const records = ref([]) // { id, surface, N, f }
function recordRow() {
  records.value.push({
    id: records.value.length + 1,
    surface: SURF_LABEL[surface.value],
    surfaceKey: surface.value,
    N: N.value,
    f: fNum.value.toFixed(2),
  })
  hint.value = `已记录第 ${records.value.length} 组：${SURF_LABEL[surface.value]}、压力 ${N.value} N、f = ${fNum.value.toFixed(2)} N`
  mark()
}
function clearRecords() {
  records.value = []
  hint.value = '已清空记录，重新开始实验'
}

// 自动归纳结论
const conclusion = computed(() => {
  const tips = []
  // 同一接触面，不同压力
  const bySurface = {}
  records.value.forEach((r) => {
    ;(bySurface[r.surfaceKey] = bySurface[r.surfaceKey] || []).push(r)
  })
  for (const [sk, rows] of Object.entries(bySurface)) {
    const ns = new Set(rows.map((r) => r.N))
    if (ns.size >= 2 && rows.length >= 2) {
      rows.sort((a, b) => a.N - b.N)
      const f1 = parseFloat(rows[0].f)
      const f2 = parseFloat(rows[rows.length - 1].f)
      if (f2 > f1) {
        tips.push(`${SURF_LABEL[sk]}上：压力越大，滑动摩擦力越大`)
        break
      }
    }
  }
  // 同一压力，不同接触面
  const byN = {}
  records.value.forEach((r) => {
    ;(byN[r.N] = byN[r.N] || []).push(r)
  })
  for (const [n, rows] of Object.entries(byN)) {
    if (rows.length >= 2) {
      const muOrder = { wood: 0, towel: 1, sand: 2 }
      rows.sort((a, b) => muOrder[a.surfaceKey] - muOrder[b.surfaceKey])
      const f0 = parseFloat(rows[0].f)
      const f1 = parseFloat(rows[rows.length - 1].f)
      if (f1 > f0) {
        tips.push(`压力 ${n} N 不变：接触面越粗糙，滑动摩擦力越大`)
        break
      }
    }
  }
  if (tips.length === 0 && records.value.length > 0) {
    tips.push('继续记录更多数据：可固定压力换接触面，或固定接触面加钩码')
  }
  return tips
})

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
  block: { x: 548, baseline: GROUND_Y, w: BW_WIDE },
  dyn:   { x: 300, baseline: GROUND_Y - BW_H_WIDE / 2, w: 74 },
})
const LS_KEY = 'efriction-layout-v2'
const savedLayout = ref(null)
const hint = ref('按教材步骤实验：先选接触面 → 放钩码改变压力 → 向左拉动弹簧测力计（测力计在左侧），示数达到 f 后物块向左平移 → 拖动中按 Enter / R 记录数据。')

function computeDefaults() {
  return {
    block: { x: 548, baseline: GROUND_Y, w: BW_WIDE },
    dyn:   { x: 300, baseline: GROUND_Y - BW_H_WIDE / 2, w: 74 },
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

// ===== 互动：拖动测力计施加拉力（物理正确的匀速拉动模型）=====
// 物理模型（教材实验）：手拉着弹簧测力计匀速水平拉动木块。
//  ① 静摩擦阶段：拉力 F 从 0 增到 f（最大静摩擦 ≈ 动摩擦），木块不动，弹簧被拉长（读数 0→f）
//  ② 滑动阶段：F = f（动摩擦），木块与手同步匀速左移，弹簧保持恒定伸长（读数恒 = f）
const STATIC_STROKE = 44         // 静摩擦阶段弹簧拉伸行程(px)：dragDx 0→44 内读数 0→f，木块不动
const SLIDE_BOUND_X = 20         // 物块/测力计左端允许到达的最小 x（画布左边界留白）
const dragDx = ref(0)            // 手向左拖动的累计距离(px)
const motionState = ref('idle')  // idle 未拉 | static 静摩擦(木块不动) | uniform 匀速滑动
const dragging = ref(false)

// 画布边界限制（测力计左端 / 物块左面均不越过 x=SLIDE_BOUND_X）
const maxDynShift = computed(() => layout.dyn.x - DYN_W / 2 - SLIDE_BOUND_X)
const maxBlockShift = computed(() => layout.block.x - blockW.value / 2 - SLIDE_BOUND_X)
const maxDragDx = computed(() => Math.min(maxDynShift.value, maxBlockShift.value + STATIC_STROKE))

// 派生量：全部由 dragDx 驱动，三者严格自洽（不再各算各的）
const dynShift = computed(() => dragDx.value)                                              // 测力计跟随手 1:1 左移
const blockShift = computed(() => Math.max(0, dragDx.value - STATIC_STROKE))               // 木块滑动量（过阈值才动）
const springStretch = computed(() => Math.min(dragDx.value, STATIC_STROKE))                // 弹簧伸长（仅静摩擦阶段增长，之后恒定）
const readout = computed(() => (springStretch.value / STATIC_STROKE) * fNum.value)         // 读数 0→f，滑动后恒 = f
const forceApplied = computed(() => readout.value)                                         // 拉力 = 测力计读数
// 摩擦力：静止时静摩擦 = 拉力（随 F 增大到 f）；滑动时动摩擦恒 = f
const frictionForce = computed(() => moving.value ? fNum.value : readout.value)
const moving = computed(() => motionState.value === 'uniform')                             // 匀速滑动中流动
// 力箭头长度映射（N → px）
const FORCE_ARROW_SCALE = 18 // 每 N 对应 px

// 重置实验互动状态：拉力/位移/读数归零，物块回到原位（不影响已记录的数据表）
function resetExperiment() {
  dragDx.value = 0
  dragging.value = false
  dragInfo = null
  motionState.value = 'idle'
  dispReadout.value = 0
  hint.value = '已重置：物块归位，可重新向左拉动测力计'
}

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
    if (name !== 'block' && name !== 'dyn') return
    dragging.value = true
    dragInfo = { mode: 'pull', lx: x, dx0: dragDx.value }
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
    const dx = x - dragInfo.lx
    // 仅允许向左拖动产生拉力：向左位移(-dx>0)增加拉力；向右拖动无效（拉力保持不变）
    const leftPull = Math.max(0, -dx)
    // 总行程受画布左边界限制，不设固定终点
    dragDx.value = Math.min(maxDragDx.value, dragInfo.dx0 + leftPull)
  }
}
function onWinPointerUp() {
  dragging.value = false
  dragInfo = null
  window.removeEventListener('pointermove', onWinPointerMove)
  // 松手自动重置：物块/拉力/读数归位，回到初始状态
  resetExperiment()
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
  if (editMode.value) {
    if (!selected.value) return
    const step = e.shiftKey ? 10 : 2
    switch (e.key) {
      case 'ArrowLeft': layout[selected.value].x -= step; e.preventDefault(); break
      case 'ArrowRight': layout[selected.value].x += step; e.preventDefault(); break
      case 'ArrowUp': layout[selected.value].baseline -= step; e.preventDefault(); break
      case 'ArrowDown': layout[selected.value].baseline += step; e.preventDefault(); break
      case '+': case '=': scaleSel( 1.05); break
      case '-': case '_': scaleSel(0.95); break
    }
    return
  }
  // 非编辑模式：拖动时无法点按钮，用快捷键记录数据
  if (e.key === 'Enter' || e.key === 'r' || e.key === 'R') {
    e.preventDefault()
    recordRow()
  }
}

// ===== 动画循环：物理判定 + 视觉平滑 =====
let raf = null
let lastT = 0
const phase = ref(0)
// 视觉动画状态（不参与物理计算，仅用于动画表现）
const dispReadout = ref(0) // 指针平滑显示读数（物理读数仍用 readout，指针动画用这个平滑逼近）
function tick(now) {
  const dt = Math.min(((now - lastT) || 16) / 1000, 0.05)
  lastT = now
  // 状态由 dragDx 直接推导：未拉 idle → 静摩擦 static（木块不动）→ 滑动 uniform（匀速）
  if (dragDx.value <= 0.001) motionState.value = 'idle'
  else if (dragDx.value <= STATIC_STROKE) motionState.value = 'static'
  else motionState.value = 'uniform'
  // 指针平滑动画：平滑逼近真实读数（猛拖时指针不会瞬跳）
  dispReadout.value += (readout.value - dispReadout.value) * Math.min(1, dt * 12)
  if (moving.value) phase.value += dt * 6
  else phase.value += dt * 0.6
  raf = requestAnimationFrame(tick)
}

// ===== 派生坐标（供 SVG 模板） =====
const DYN_W = 96          // 测力计外壳长度
const DYN_H = 34          // 测力计外壳高度
const dynBodyX0 = computed(() => layout.dyn.x - DYN_W / 2)
const dynBodyX1 = computed(() => layout.dyn.x + DYN_W / 2)
const blockLeft = computed(() => layout.block.x - blockW.value / 2 - blockShift.value) // 物块左面，随滑动左移
const blockTop = computed(() => layout.block.baseline - blockH.value)
const blockCenterY = computed(() => blockTop.value + blockH.value / 2)
// 测力计中心跟随物块中心：wide 平放=348 不变；narrow 侧放时物块中心上移(309)，
// 测力计随之上移到弹簧所在高度，测力计/弹簧/物块三者同一水平线
const dynCY = computed(() => blockCenterY.value)
// 测力计整体随拖动 1:1 左移（dynShift = dragDx）；弹簧连接测力计与物块
const dynDrawX0 = computed(() => dynBodyX0.value - dynShift.value) // 左端（挂钩端）
const dynDrawX1 = computed(() => dynBodyX1.value - dynShift.value) // 右端（提环端）
const hookX = computed(() => dynDrawX1.value) // 测力计在左，挂钩（连物块）在右端
// 弹簧水平线：测力计中心与物块中心同线（dynCY = blockCenterY），弹簧位于其中
const springY = computed(() => (dynCY.value + blockCenterY.value) / 2)

// 钩码：平底砝码，平铺叠放在物块顶部（不再悬浮），自下而上堆叠
const HOOK_W = 64   // 砝码宽
const HOOK_H = 20   // 单个砝码高（扁平）
const hookPositions = computed(() => {
  const out = []
  const n = weights.value
  const startY = -HOOK_H // 第一个砝码紧贴物块上沿（blockTop 已是上沿）
  for (let i = 0; i < n; i++) {
    out.push({ y: startY - i * HOOK_H })
  }
  return out
})
// 「物块 + 钩码」标注随钩码堆顶上移
const blockLabelY = computed(() => blockTop.value - 14 - weights.value * HOOK_H)

// 运动线
const motionLines = computed(() => {
  const out = []
  const count = 8
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
watch([weights, surface, wide], mark)

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
            <linearGradient id="fr-hook" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#ffe08a" />
              <stop offset="0.5" stop-color="#ffd166" />
              <stop offset="1" stop-color="#c9972e" />
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

          <!-- 弹簧测力计（水平，右侧，可拖动） -->
          <g filter="url(#fr-soft)" :class="{ 'is-sel': editMode && selected === 'dyn' }" @pointerdown="(e) => onPiecePointerDown('dyn', e)">
            <!-- 右侧提环（人手向左拉） -->
            <circle :cx="dynDrawX1 + 9" :cy="dynCY" r="9" fill="none" stroke="#2b3a4a" stroke-width="3.5" />
            <!-- 外壳（圆筒） -->
            <rect :x="dynDrawX0" :y="dynCY - DYN_H / 2" :width="DYN_W" :height="DYN_H" rx="9" fill="url(#fr-dyn)" stroke="#2b3a4a" stroke-width="2.5" />
            <!-- 左端盖（挂钩端 / 连物块） -->
            <rect :x="dynDrawX0" :y="dynCY - DYN_H / 2" width="14" :height="DYN_H" rx="6" fill="#2b3a4a" />
            <!-- 右端盖（提环端） -->
            <rect :x="dynDrawX1 - 12" :y="dynCY - DYN_H / 2" width="12" :height="DYN_H" rx="5" fill="#1f2c39" />
            <!-- 顶部刻度窗 -->
            <rect :x="dynDrawX0 + 18" :y="dynCY - 11" :width="DYN_W - 36" height="22" rx="3" fill="#f6fafd" stroke="#9fb0c0" stroke-width="1.2" />
            <!-- 刻度线（0~5N，5 大格）：已读到的刻度线变红加粗，读数增长时红色推进（刻度动画） -->
            <g stroke="#5b6b7a" stroke-width="1">
              <line
                v-for="i in 11"
                :key="'tk' + i"
                :x1="dynDrawX0 + 20 + (i - 1) * ((DYN_W - 40) / 10)"
                :y1="dynCY - 9"
                :x2="dynDrawX0 + 20 + (i - 1) * ((DYN_W - 40) / 10)"
                :y2="dynCY - 3"
                :stroke="dispReadout > 0.01 && i - 1 <= Math.round(dispReadout / 5 * 10) ? '#d92135' : '#5b6b7a'"
                :stroke-width="dispReadout > 0.01 && i - 1 <= Math.round(dispReadout / 5 * 10) ? 2.2 : (i % 2 === 0 ? 1.6 : 0.8)"
              />
            </g>
            <!-- 指针（平滑动画跟随 dispReadout 在 0~5N 间移动，不瞬跳） -->
            <line
              :x1="dynDrawX0 + 20 + Math.min(1, dispReadout / 5) * (DYN_W - 40)"
              :x2="dynDrawX0 + 20 + Math.min(1, dispReadout / 5) * (DYN_W - 40)"
              :y1="dynCY - 10"
              :y2="dynCY + 10"
              stroke="#d92135" stroke-width="2.4"
            />
            <!-- 刻度端点文字 -->
            <text :x="dynDrawX0 + 20" :y="dynCY + 21" font-size="8" fill="#5b6b7a">0</text>
            <text :x="dynDrawX0 + DYN_W - 20" :y="dynCY + 21" text-anchor="end" font-size="8" fill="#5b6b7a">5N</text>
            <!-- 左端挂钩（连物块） -->
            <circle :cx="hookX" :cy="dynCY" r="4.5" fill="none" stroke="#2b3a4a" stroke-width="2.6" />
            <!-- 数值读数 -->
            <text :x="(dynDrawX0 + dynDrawX1) / 2" :y="dynCY + DYN_H / 2 + 16" text-anchor="middle" font-size="13" font-weight="800" fill="#1a1a1a">{{ readout.toFixed(2) }}</text>
            <text :x="(dynDrawX0 + dynDrawX1) / 2" :y="dynCY + DYN_H / 2 + 29" text-anchor="middle" font-size="9" font-weight="700" fill="#555">N</text>
          </g>

          <!-- 连接弹簧（测力计挂钩 → 物块左面）：位于两者中心高度，向上居中对齐。
               弹簧总长 = 挂钩端到物块左面距离：静摩擦阶段被拉长（读数 0→f），滑动阶段恒定。
               动画 = 纯水平伸缩（锯齿形状固定，不上下颤抖）。 -->
          <g>
            <!-- 挂钩垂线（测力计挂钩 → 弹簧起点） -->
            <line :x1="hookX" :y1="dynCY" :x2="hookX" :y2="springY" stroke="#3a6ea5" stroke-width="2.5" stroke-linecap="round" />
            <!-- 弹簧锯齿（水平，14 段，长度随测力计与物块间距伸缩） -->
            <path
              :d="`M ${hookX} ${springY}
                ${Array.from({length:14},(_,i)=>{const xx=hookX+(blockLeft-hookX)*(i+0.5)/14;const yy=springY+(i%2?6:-6);return `L ${xx.toFixed(1)} ${yy.toFixed(1)}`}).join(' ')}
                L ${blockLeft} ${springY}`"
              fill="none" :stroke="springStretch > 0 ? '#3a6ea5' : '#7d8a9a'" :stroke-width="springStretch > 0 ? 2.6 : 2"
              :opacity="springStretch > 0 ? 1 : 0.7"
              stroke-linecap="round"
            />
            <!-- 连接物块的小挂钩 -->
            <circle :cx="blockLeft" :cy="springY" r="4" fill="none" stroke="#3a6ea5" stroke-width="2.4" />
          </g>

          <!-- 物块（可拖动）+ 钩码（平底平铺） -->
          <g
            :transform="`translate(${blockLeft} ${blockTop})`"
            :class="{ 'is-sel': editMode && selected === 'block', 'is-grab': !editMode }"
            @pointerdown="(e) => onPiecePointerDown('block', e)"
            style="cursor: grab"
          >
            <!-- 钩码（砝码，平铺叠放在物块顶部，平底贴合物块上沿） -->
            <g v-for="(h, i) in hookPositions" :key="'hk' + i" :transform="`translate(${blockW / 2} ${h.y})`">
              <!-- 砝码主体：扁平圆柱（平底） -->
              <rect :x="-HOOK_W / 2" :y="0" :width="HOOK_W" :height="HOOK_H" rx="4" fill="url(#fr-hook)" stroke="#8a5d1a" stroke-width="1.6" />
              <!-- 顶部凹槽环 -->
              <rect :x="-HOOK_W / 2 + 8" y="2.5" :width="HOOK_W - 16" height="4" rx="2" fill="none" stroke="#8a5d1a" stroke-width="1.1" opacity="0.7" />
              <!-- 中部刻痕 -->
              <line :x1="-HOOK_W / 2 + 7" :y1="HOOK_H / 2" :x2="HOOK_W / 2 - 7" :y2="HOOK_H / 2" stroke="#8a5d1a" stroke-width="1" opacity="0.5" />
              <!-- 高光 -->
              <rect :x="-HOOK_W / 2 + 4" y="3" :width="HOOK_W - 8" height="3" rx="1.5" fill="rgba(255,255,255,0.55)" />
              <!-- 数值 -->
              <text :x="0" :y="HOOK_H / 2 + 4" text-anchor="middle" font-size="11" font-weight="800" fill="#ffffff" stroke="#5a3d12" stroke-width="0.9" paint-order="stroke">{{ HOOK_G }}</text>
            </g>

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

            <!-- ===== 物块受力方向箭头（物理可视化）===== -->
            <g v-if="forceApplied > 0.001" :transform="`translate(${blockW / 2} ${blockH / 2})`">
              <!-- 拉力 F：向左（红），起点中心，长度 ∝ forceApplied -->
              <g :transform="`translate(0 -10)`">
                <line x1="0" y1="0" :x2="-Math.min(blockW / 2 - 4, forceApplied * FORCE_ARROW_SCALE)" y2="0" stroke="var(--bb-red)" stroke-width="3.5" stroke-linecap="round" />
                <path :d="`M ${-Math.min(blockW / 2 - 4, forceApplied * FORCE_ARROW_SCALE)} 0 l9 -5 l0 10 z`" fill="var(--bb-red)" />
                <text :x="-Math.min(blockW / 2 - 4, forceApplied * FORCE_ARROW_SCALE) / 2" y="-16" text-anchor="middle" font-size="10" font-weight="800" fill="#ffffff" stroke="#7a1020" stroke-width="0.9" paint-order="stroke">F拉={{ forceApplied.toFixed(1) }}N</text>
              </g>
              <!-- 摩擦力 f：向右（蓝，阻碍向左运动），起点中心，长度 ∝ frictionForce -->
              <g :transform="`translate(0 12)`">
                <line x1="0" y1="0" :x2="Math.min(blockW / 2 - 4, frictionForce * FORCE_ARROW_SCALE)" y2="0" stroke="var(--bb-blue)" stroke-width="3.5" stroke-linecap="round" />
                <path :d="`M ${Math.min(blockW / 2 - 4, frictionForce * FORCE_ARROW_SCALE)} 0 l-9 -5 l0 10 z`" fill="var(--bb-blue)" />
                <text :x="Math.min(blockW / 2 - 4, frictionForce * FORCE_ARROW_SCALE) / 2" y="16" text-anchor="middle" font-size="10" font-weight="800" fill="#ffffff" stroke="#0c3a7a" stroke-width="0.9" paint-order="stroke">f摩={{ frictionForce.toFixed(1) }}N</text>
              </g>
            </g>
          </g>

          <!-- 物块上方的标注（随钩码上移） -->
          <text :x="blockLeft + blockW / 2" :y="blockLabelY" text-anchor="middle" font-size="14" font-weight="800" fill="var(--bb-fg)" stroke="#0b0b0b" stroke-width="0.6" paint-order="stroke">
            {{ weights > 0 ? `物块 + ${weights} 个钩码` : '物块' }}
          </text>

          <!-- 施加拉力指示器（拖动时显示在测力计上方，避免与拉力数字重叠） -->
          <g v-if="dragging && !editMode">
            <!-- 标题行（进度条上方） -->
            <text :x="dynDrawX0" :y="dynCY - 86" font-size="10" fill="var(--bb-fg-dim)">施加拉力 F</text>
            <text :x="dynDrawX0 + 170" :y="dynCY - 86" text-anchor="end" font-size="10" fill="var(--bb-red)">摩擦力 f</text>
            <!-- 进度条 -->
            <rect :x="dynDrawX0" :y="dynCY - 78" width="170" height="9" rx="4.5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.3)" stroke-width="1" />
            <rect
              :x="dynDrawX0"
              :y="dynCY - 78"
              :width="Math.min(170, forceApplied * 170 / Math.max(0.01, fNum))"
              height="9"
              rx="4.5"
              :fill="moving ? 'var(--bb-red)' : 'var(--bb-amber)'"
            />
            <line :x1="dynDrawX0 + 170" :y1="dynCY - 83" :x2="dynDrawX0 + 170" :y2="dynCY - 64" stroke="var(--bb-red)" stroke-width="2" />
            <!-- 读数（进度条下方，隔开距离避免重叠） -->
            <text :x="dynDrawX0 + 85" :y="dynCY - 60" text-anchor="middle" font-size="11" font-weight="800" :fill="moving ? 'var(--bb-red)' : 'var(--bb-amber)'">F = {{ forceApplied.toFixed(2) }} N</text>
          </g>

          <!-- 拉力方向箭头（物块受拉向左，滑动时显示在物块左侧） -->
          <g v-if="moving">
            <line :x1="blockLeft - 6" :y1="blockCenterY - 30" :x2="blockLeft - 58" :y2="blockCenterY - 30" stroke="var(--bb-red)" stroke-width="4" stroke-linecap="round" />
            <path :d="`M ${blockLeft - 58} ${blockCenterY - 30} l12 -7 l0 14 z`" fill="var(--bb-red)" />
          </g>

          <!-- 运动线（仅滑动时流动，位于物块左侧并向左流动） -->
          <g stroke="var(--bb-blue)" stroke-width="2" :opacity="moving ? 0.45 : 0.15" stroke-linecap="round">
            <line
              v-for="(d, i) in motionLines"
              :key="'ml' + i"
              :x1="blockLeft - 24 - d - 14"
              :y1="blockCenterY + 22"
              :x2="blockLeft - 24 - d"
              :y2="blockCenterY + 22"
            />
          </g>

          <!-- 标注 -->
          <g font-family="system-ui, sans-serif" font-weight="700">
            <text x="20" y="30" font-size="14" fill="var(--bb-fg)">接触面：{{ SURF_LABEL[surface] }}（μ = {{ MU[surface] }}）</text>
            <text x="20" y="52" font-size="12.5" fill="var(--bb-fg-dim)">
              压力 N = {{ N }} N（木块自重 {{ BLOCK_G }} N{{ weights > 0 ? ` + ${weights} 个钩码 × ${HOOK_G} N` : '' }}）・ 接触面积：{{ wide ? '大（平放）' : '小（侧放）' }}
            </text>
            <text x="20" y="76" font-size="13" font-weight="800" fill="var(--bb-red)">
              受力与运动：F &lt; f → 静止（二力平衡）；F = f → 匀速；F &gt; f → 向左加速（滑动后 F 恒 = f）
            </text>
            <text x="20" y="500" font-size="14" font-weight="800" fill="var(--bb-red)">
              匀速拉动时：测力计示数 = 滑动摩擦力 f = μ・N = {{ fText }} N
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
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实验步骤</strong><span>教材 8.3-4</span></div>
        <div class="lab-steps">
          <ol>
            <li>选接触面（木板/毛巾/ 砂纸）</li>
            <li>在木块上放钩码改变压力（N = {{ N }} N）</li>
            <li>向左拉动弹簧测力计（测力计在左侧），示数达到 f 后物块匀速向左滑动</li>
            <li>拖动中按 Enter / R 记录当前数据</li>
          </ol>
        </div>
        <div class="lab-params" style="padding: 8px 12px">
          <div class="param-group">
            <span>钩码数量（改变压力）</span>
            <div class="hook-btns">
              <button v-for="n in [0, 1, 2, 3]" :key="n" class="btn btn-sm" :class="{ 'btn-primary': weights === n }" @click="weights = n">
                {{ n }} 个
              </button>
            </div>
            <p style="font-size: 11px; color: var(--text-dim)">每个钩码重 {{ HOOK_G }} N，压力 N = {{ BLOCK_G }} + {{ weights }}×{{ HOOK_G }} = <b>{{ N }} N</b></p>
          </div>
        </div>
      </div>

      <!-- 实验记录表（教材：自己设计表格记录数据） -->
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实验记录表</strong>
          <span>{{ records.length }} 组</span>
        </div>
        <div class="record-actions">
          <button class="btn btn-sm btn-primary" @click="recordRow" title="快捷键：Enter / R">＋ 记录本次数据<span class="kbd">Enter/R</span></button>
          <button class="btn btn-sm" @click="clearRecords" :disabled="records.length === 0">清空</button>
        </div>
        <table class="record-table" v-if="records.length">
          <thead>
            <tr><th>#</th><th>接触面</th><th>压力 N (N)</th><th>摩擦力 f (N)</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in records" :key="r.id" :class="{ 'row-current': r.surfaceKey === surface && r.N === N }">
              <td>{{ r.id }}</td>
              <td>{{ r.surface }}</td>
              <td>{{ r.N }}</td>
              <td>{{ r.f }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="record-empty">尚无数据 — 按左侧步骤实验后点「记录本次数据」</div>
        <!-- 结论 -->
        <div class="record-concl" v-if="conclusion.length">
          <div class="concl-title">📌 初步结论</div>
          <p v-for="(c, i) in conclusion" :key="i">{{ c }}</p>
        </div>
      </div>

      <FormulaPanel
        title="滑动摩擦力"
        formula="f = μ · N"
        :rows="[
          { label: '接触面 μ', value: MU[surface] },
          { label: '压力 N（木块+钩码）', value: N + ' N' }
        ]"
        :result="[{ label: '摩擦力 f = μN', value: fText + ' N' }]"
        :verify="[
          '控制变量：保持接触面不变，改变木块上的钩码数量，从而改变压力 N',
          '记录每组压力 N 与对应测力计示数 f，发现 N 越大、f 越大 → f 与压力成正比',
          '控制变量：保持压力不变，更换接触面（木板 / 毛巾 / 砂纸），f 随粗糙程度增大而增大',
          '对比不同接触面积或拉动速度：在同样压力下 f 不变 → 与接触面积、运动速度无关',
          '由此归纳：滑动摩擦力 f = μN，μ 为接触面间的动摩擦因数',
          '受力与运动状态：① F≤f_max 时二力平衡，物体静止；② 滑动后维持 F=f 则合力为 0，匀速；③ F>f 则合力向左，向左加速'
        ]"
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

/* 实验步骤 */
.lab-steps ol {
  margin: 0;
  padding: 10px 12px 10px 32px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--text);
}
.lab-steps li::marker {
  color: var(--accent-strong);
  font-weight: 800;
}

/* 钩码按钮 */
.hook-btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

/* 实验记录表 */
.record-actions {
  display: flex;
  gap: 8px;
  padding: 10px 12px 4px;
}
.kbd {
  margin-left: 6px;
  font-size: 10px;
  font-family: ui-monospace, Menlo, monospace;
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0 5px;
  background: var(--surface-3);
  color: var(--text-dim);
}
.record-table {
  width: 100%;
  margin-top: 6px;
  border-collapse: collapse;
  font-size: 12px;
}
.record-table th,
.record-table td {
  padding: 6px 8px;
  border: 1px solid var(--line);
  text-align: center;
}
.record-table th {
  background: var(--surface-3);
  font-weight: 800;
}
.record-table tr.row-current {
  background: var(--accent-bg);
}
.record-empty {
  padding: 14px 12px;
  font-size: 12px;
  color: var(--text-dim);
  text-align: center;
}
.record-concl {
  margin: 10px 12px 12px;
  padding: 10px 12px;
  border: 2px dashed var(--success);
  border-radius: var(--radius-sm);
  background: var(--success-bg);
  font-size: 12px;
  color: var(--text-h);
}
.concl-title {
  font-weight: 800;
  margin-bottom: 4px;
}
.record-concl p {
  line-height: 1.7;
}

/* 摆放编辑器 */
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
