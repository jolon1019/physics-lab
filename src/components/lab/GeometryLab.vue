<script setup>
import { computed, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ===== 画布坐标系：viewBox 900×520，原点在中心，1 单位 = 30px ===== */
const VW = 900, VH = 520, OX = 450, OY = 260, U = 30
const toSvg = (p) => ({ x: OX + p.x * U, y: OY - p.y * U })
const toMath = (sx, sy) => ({ x: (sx - OX) / U, y: (OY - sy) / U })
const fmt = (n) => (Math.round(n * 10) / 10).toString()
const snap = (v, s = 1) => Math.round(v / s) * s
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

/* ===== 状态 ===== */
const mode = ref('translate') // translate | rotate | reflect
const hint = ref('拖动 A、B、C 改变原三角形；按住红色像三角形拖动可平移它')

// 原三角形（数学坐标，第二/三象限，保证三种变换后都落在格内）
const tri = ref([
  { x: -6, y: -1 },
  { x: -2, y: -1 },
  { x: -4, y: 3 }
])

// 平移向量
const tx = ref(5)
const ty = ref(3)
// 旋转：中心 + 角度（逆时针为正）
const cx = ref(0)
const cy = ref(0)
const angle = ref(90)
// 轴对称：axis = 'y' 竖直线 x=k | 'x' 水平线 y=k
const axis = ref('y')
const axisK = ref(0)

/* ===== 变换 ===== */
function applyT(p) {
  if (mode.value === 'translate') return { x: p.x + tx.value, y: p.y + ty.value }
  if (mode.value === 'rotate') {
    const r = (angle.value * Math.PI) / 180
    const dx = p.x - cx.value, dy = p.y - cy.value
    return {
      x: cx.value + dx * Math.cos(r) - dy * Math.sin(r),
      y: cy.value + dx * Math.sin(r) + dy * Math.cos(r)
    }
  }
  return axis.value === 'y'
    ? { x: 2 * axisK.value - p.x, y: p.y }
    : { x: p.x, y: 2 * axisK.value - p.y }
}

const img = computed(() => tri.value.map(applyT))
const polySrc = computed(() => tri.value.map(toSvg).map((p) => `${p.x},${p.y}`).join(' '))
const polyDst = computed(() => img.value.map(toSvg).map((p) => `${p.x},${p.y}`).join(' '))

/* ===== 边长（验证变换保距 → 全等）===== */
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y)
const sides = computed(() => {
  const s = tri.value, d = img.value
  return [
    { name: 'AB', src: dist(s[0], s[1]), dst: dist(d[0], d[1]) },
    { name: 'BC', src: dist(s[1], s[2]), dst: dist(d[1], d[2]) },
    { name: 'CA', src: dist(s[2], s[0]), dst: dist(d[2], d[0]) }
  ]
})

/* ===== 网格与坐标轴 ===== */
const vLines = computed(() => {
  const a = []
  for (let x = 0; x <= VW; x += U) a.push(x)
  return a
})
const hLines = computed(() => {
  const a = []
  for (let y = 0; y <= VH; y += U) a.push(y)
  return a
})
const ticks = computed(() => {
  const a = []
  for (let i = -14; i <= 14; i++) if (i !== 0 && i % 2 === 0) a.push({ v: i, p: toSvg({ x: i, y: 0 }) })
  for (let j = -8; j <= 8; j++) if (j !== 0 && j % 2 === 0) a.push({ v: j, p: toSvg({ x: 0, y: j }) })
  return a
})

/* ===== 对称轴端点（画到画布边缘）===== */
const axisLine = computed(() => {
  if (axis.value === 'y') {
    const p = toSvg({ x: axisK.value, y: 0 })
    return { x1: p.x, y1: 0, x2: p.x, y2: VH }
  }
  const p = toSvg({ x: 0, y: axisK.value })
  return { x1: 0, y1: p.y, x2: VW, y2: p.y }
})

/* ===== 旋转弧：从原顶点 A 到像顶点 A′，绕中心 ===== */
const rotArc = computed(() => {
  if (mode.value !== 'rotate') return null
  const c = { x: cx.value, y: cy.value }
  const r = dist(tri.value[0], c)
  if (r < 0.2) return null
  const a0 = Math.atan2(tri.value[0].y - c.y, tri.value[0].x - c.x)
  const sweep = (angle.value * Math.PI) / 180
  const a1 = a0 + sweep
  const p0 = toSvg({ x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) })
  const p1 = toSvg({ x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) })
  const large = Math.abs(sweep) > Math.PI ? 1 : 0
  const d = `M ${p0.x} ${p0.y} A ${r * U} ${r * U} 0 ${large} ${sweep >= 0 ? 0 : 1} ${p1.x} ${p1.y}`
  return { d, deg: ((angle.value % 360) + 360) % 360 }
})

/* 角度拖拽手柄：位于弧的终点（像顶点 A′ 方向、半径同 A） */
const angleHandle = computed(() => {
  if (mode.value !== 'rotate') return null
  const c = { x: cx.value, y: cy.value }
  const r = dist(tri.value[0], c)
  const a0 = Math.atan2(tri.value[0].y - c.y, tri.value[0].x - c.x)
  const a1 = a0 + (angle.value * Math.PI) / 180
  return toSvg({ x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) })
})

/* ===== 拖拽 ===== */
const svgRef = ref(null)
let drag = null

function svgPoint(e) {
  const r = svgRef.value.getBoundingClientRect()
  const s = Math.min(r.width / VW, r.height / VH)
  const ox = (r.width - VW * s) / 2
  const oy = (r.height - VH * s) / 2
  return toMath((e.clientX - r.left - ox) / s, (e.clientY - r.top - oy) / s)
}

function startDrag(e, spec) {
  e.preventDefault()
  e.stopPropagation()
  const p = svgPoint(e)
  drag = { ...spec, start: p, snap0: snapshot() }
  try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
}
function snapshot() {
  return {
    tx: tx.value, ty: ty.value,
    cx: cx.value, cy: cy.value, angle: angle.value,
    axisK: axisK.value,
    tri: tri.value.map((p) => ({ ...p }))
  }
}
function onMove(e) {
  if (!drag) return
  const p = svgPoint(e)
  const dx = p.x - drag.start.x, dy = p.y - drag.start.y
  if (drag.type === 'vertex') {
    const i = drag.i
    const o = drag.snap0.tri[i]
    const nx = clamp(snap(o.x + dx), -14, 14)
    const ny = clamp(snap(o.y + dy), -8, 8)
    const t = tri.value.slice()
    t[i] = { x: nx, y: ny }
    tri.value = t
  } else if (drag.type === 'image') {
    tx.value = clamp(snap(drag.snap0.tx + dx), -13, 13)
    ty.value = clamp(snap(drag.snap0.ty + dy), -8, 8)
    tried.add('translate')
  } else if (drag.type === 'center') {
    cx.value = clamp(snap(drag.snap0.cx + dx), -12, 12)
    cy.value = clamp(snap(drag.snap0.cy + dy), -7, 7)
  } else if (drag.type === 'axis') {
    axisK.value = clamp(snap(axis.value === 'y' ? drag.snap0.axisK + dx : drag.snap0.axisK + dy), -13, 13)
  } else if (drag.type === 'angle') {
    const c = { x: cx.value, y: cy.value }
    const a0 = Math.atan2(tri.value[0].y - c.y, tri.value[0].x - c.x)
    const a1 = Math.atan2(p.y - c.y, p.x - c.x)
    let deg = ((a1 - a0) * 180) / Math.PI
    deg = snap(deg, 5)
    angle.value = clamp(deg, -360, 360)
  }
  changed = true
  checkDone()
}
function onUp() { drag = null }

/* ===== 完成条件：三种变换都亲手操作过 ===== */
const tried = new Set()
let changed = false
let done = false
function pick(m) {
  mode.value = m
  tried.add(m)
  hint.value = m === 'translate'
    ? '拖动 A、B、C 改变原三角形；按住红色像三角形拖动可平移它'
    : m === 'rotate'
      ? '拖动黄色旋转中心改变位置；拖动弧端点或滑块改变角度'
      : '拖动绿色对称轴平移它；也可切换 x / y 方向，观察像与物关于轴对称'
  checkDone()
}
function checkDone() {
  if (done) return
  if (changed && tried.has('translate') && tried.has('rotate') && tried.has('reflect')) {
    done = true
    emit('complete')
  }
}

function resetAll() {
  tri.value = [{ x: -6, y: -1 }, { x: -2, y: -1 }, { x: -4, y: 3 }]
  tx.value = 5; ty.value = 3
  cx.value = 0; cy.value = 0; angle.value = 90
  axis.value = 'y'; axisK.value = 0
  hint.value = '已复原。三种变换各动手试一次就算完成本实验'
}

/* ===== 右侧读数 ===== */
const readRows = computed(() => {
  if (mode.value === 'translate')
    return [
      { label: '平移向量 (a, b)', value: `(${tx.value}, ${ty.value})` },
      { label: '对应点连线', value: '平行且相等' }
    ]
  if (mode.value === 'rotate')
    return [
      { label: '旋转中心', value: `(${fmt(cx.value)}, ${fmt(cy.value)})` },
      { label: '旋转角', value: `${fmt(angle.value)}°` },
      { label: '对应点到中心', value: '距离相等' }
    ]
  return [
    { label: '对称轴', value: axis.value === 'y' ? `x = ${fmt(axisK.value)}` : `y = ${fmt(axisK.value)}` },
    { label: '对应点连线', value: '被轴垂直平分' }
  ]
})
const readResult = computed(() => [
  { label: '形状大小', value: '不变（全等）' },
  ...sides.value.map((s) => ({ label: `${s.name} → ${s.name}′`, value: `${s.src.toFixed(2)} → ${s.dst.toFixed(2)}` }))
])
const formula = computed(() =>
  mode.value === 'translate'
    ? '(x, y) → (x + a, y + b)'
    : mode.value === 'rotate'
      ? '(x, y) → (x cosθ − y sinθ, x sinθ + y cosθ)'
      : axis.value === 'y'
        ? '(x, y) → (2k − x, y)'
        : '(x, y) → (x, 2k − y)'
)
const VLBL = ['A', 'B', 'C']
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel geo-panel" style="padding: 0">
        <svg
          ref="svgRef"
          class="geo-svg"
          :viewBox="`0 0 ${VW} ${VH}`"
          preserveAspectRatio="xMidYMid meet"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointerleave="onUp"
          role="img"
          aria-label="几何变换演示：平移、旋转、轴对称"
        >
          <!-- 方格纸 -->
          <g class="grid">
            <line v-for="x in vLines" :key="'v' + x" :x1="x" y1="0" :x2="x" :y2="VH" />
            <line v-for="y in hLines" :key="'h' + y" x1="0" :y1="y" :x2="VW" :y2="y" />
          </g>
          <!-- 坐标轴 -->
          <g class="axis">
            <line :x1="0" :y1="OY" :x2="VW" :y2="OY" />
            <line :x1="OX" :y1="0" :x2="OX" :y2="VH" />
            <text :x="VW - 14" :y="OY - 10">x</text>
            <text :x="OX + 10" y="16">y</text>
            <text :x="OX + 6" :y="OY + 16">O</text>
            <g v-for="t in ticks" :key="'t' + t.v + t.p.x">
              <text v-if="t.p.y === OY" :x="t.p.x" :y="OY + 15">{{ t.v }}</text>
              <text v-else :x="OX - 8" :y="t.p.y + 4" text-anchor="end">{{ t.v }}</text>
            </g>
          </g>

          <!-- 对称轴 -->
          <line v-if="mode === 'reflect'" class="mirror" v-bind="axisLine"
            @pointerdown="(e) => startDrag(e, { type: 'axis' })" />
          <text v-if="mode === 'reflect'" class="mirror-lbl"
            :x="axis === 'y' ? axisLine.x1 + 8 : 10"
            :y="axis === 'y' ? 20 : toSvg({ x: 0, y: axisK }).y - 8">
            对称轴 {{ axis === 'y' ? 'x = ' + fmt(axisK) : 'y = ' + fmt(axisK) }}（拖动我）
          </text>

          <!-- 对应点连线 -->
          <g class="link">
            <template v-for="(p, i) in tri" :key="'l' + i">
              <line :x1="toSvg(p).x" :y1="toSvg(p).y" :x2="toSvg(img[i]).x" :y2="toSvg(img[i]).y" />
            </template>
          </g>

          <!-- 旋转：中心 + 弧 -->
          <template v-if="mode === 'rotate'">
            <path v-if="rotArc" class="arc" :d="rotArc.d" />
            <circle class="pivot" :cx="toSvg({ x: cx, y: cy }).x" :cy="toSvg({ x: cx, y: cy }).y" r="9"
              @pointerdown="(e) => startDrag(e, { type: 'center' })" />
            <text class="pivot-lbl" :x="toSvg({ x: cx, y: cy }).x + 13" :y="toSvg({ x: cx, y: cy }).y - 11">
              中心 ({{ fmt(cx) }}, {{ fmt(cy) }})
            </text>
            <circle v-if="angleHandle" class="angle-h" :cx="angleHandle.x" :cy="angleHandle.y" r="10"
              @pointerdown="(e) => startDrag(e, { type: 'angle' })" />
            <text v-if="rotArc" class="arc-lbl" :x="angleHandle ? angleHandle.x + 12 : OX" :y="angleHandle ? angleHandle.y + 18 : 40">
              {{ fmt(angle) }}°
            </text>
          </template>

          <!-- 平移：箭头 -->
          <g v-if="mode === 'translate'" class="arrow">
            <defs>
              <marker id="geo-arw" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 z" />
              </marker>
            </defs>
            <line v-for="(p, i) in tri" :key="'a' + i"
              :x1="toSvg(p).x" :y1="toSvg(p).y" :x2="toSvg(img[i]).x" :y2="toSvg(img[i]).y"
              marker-end="url(#geo-arw)" />
          </g>

          <!-- 原三角形 -->
          <polygon class="src-poly" :points="polySrc" />
          <!-- 像三角形（平移模式下可整体拖动） -->
          <polygon class="dst-poly" :class="{ draggable: mode === 'translate' }" :points="polyDst"
            @pointerdown="(e) => mode === 'translate' && startDrag(e, { type: 'image' })" />

          <!-- 顶点 -->
          <g v-for="(p, i) in tri" :key="'sv' + i">
            <circle class="vtx-src" :cx="toSvg(p).x" :cy="toSvg(p).y" r="9"
              @pointerdown="(e) => startDrag(e, { type: 'vertex', i })" />
            <text class="lbl" :x="toSvg(p).x - 14" :y="toSvg(p).y - 12">{{ VLBL[i] }}</text>
          </g>
          <g v-for="(p, i) in img" :key="'dv' + i">
            <circle class="vtx-dst" :cx="toSvg(p).x" :cy="toSvg(p).y" r="7" />
            <text class="lbl dst" :x="toSvg(p).x + 11" :y="toSvg(p).y - 10">{{ VLBL[i] }}′</text>
          </g>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': mode === 'translate' }" @click="pick('translate')">平移</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'rotate' }" @click="pick('rotate')">旋转</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'reflect' }" @click="pick('reflect')">轴对称</button>
        <button class="btn" @click="resetAll">复原</button>
        <span class="feedback no">{{ hint }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div v-if="mode === 'translate'" class="lab-panel">
        <div class="lab-panel-head"><strong>平移向量</strong><span>a 左右 · b 上下</span></div>
        <ParamSlider v-model="tx" :min="-13" :max="13" :step="1" label="a（沿 x 轴）" unit="" />
        <ParamSlider v-model="ty" :min="-8" :max="8" :step="1" label="b（沿 y 轴）" unit="" />
      </div>

      <div v-else-if="mode === 'rotate'" class="lab-panel">
        <div class="lab-panel-head"><strong>旋转角</strong><span>逆时针为正</span></div>
        <ParamSlider v-model="angle" :min="-360" :max="360" :step="5" label="旋转角 θ" unit="°" />
        <ParamSlider v-model="cx" :min="-12" :max="12" :step="1" label="中心横坐标" unit="" />
        <ParamSlider v-model="cy" :min="-7" :max="7" :step="1" label="中心纵坐标" unit="" />
      </div>

      <div v-else class="lab-panel">
        <div class="lab-panel-head"><strong>对称轴</strong><span>拖动轴或点按钮</span></div>
        <div style="display:flex;gap:8px;padding:8px 12px">
          <button class="btn btn-sm" :class="{ 'btn-primary': axis === 'y' }" @click="axis = 'y'">竖轴 x = k</button>
          <button class="btn btn-sm" :class="{ 'btn-primary': axis === 'x' }" @click="axis = 'x'">横轴 y = k</button>
        </div>
        <ParamSlider v-model="axisK" :min="-13" :max="13" :step="1" label="k（轴的位置）" unit="" />
      </div>

      <FormulaPanel :title="'坐标规律 · ' + (mode === 'translate' ? '平移' : mode === 'rotate' ? '旋转' : '轴对称')"
        :formula="formula" :rows="readRows" :result="readResult"
        :verify="['三条边长度都不变 → 像与物全等', '对应点连线平行（或在同一直线上）且相等', '图形的形状和大小都不改变']" />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>八年级下册·平移与旋转</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          三种变换都<b>只改变位置、不改变形状和大小</b>，所以变换前后的图形<b>全等</b>——这正是判定全等三角形的思想基础。<br />
          · <b>平移</b>：沿某方向移动固定距离，对应点连线平行且相等。<br />
          · <b>旋转</b>：绕中心转固定角度，对应点到中心等距，转过的角都相同。<br />
          · <b>轴对称</b>：沿轴翻折，对称轴<b>垂直平分</b>对应点的连线。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.geo-panel {
  background: transparent;
}
.geo-svg {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 900 / 520;
  touch-action: pan-y;
  user-select: none;
}
/* 方格纸与坐标轴 */
.grid line { stroke: var(--bb-grid); stroke-width: 1; }
.axis line { stroke: var(--bb-fg-dim); stroke-width: 1.6; }
.axis text { fill: var(--bb-fg-dim); font-size: 12px; font-family: var(--mono); }

/* 原像 / 像 */
.src-poly { fill: rgba(20, 95, 210, 0.16); stroke: var(--bb-blue); stroke-width: 3; }
.dst-poly { fill: rgba(217, 33, 53, 0.16); stroke: var(--bb-red); stroke-width: 3; }
.dst-poly.draggable { cursor: grab; touch-action: none; }
.link line { stroke: var(--bb-purple); stroke-width: 1.4; stroke-dasharray: 5 4; opacity: 0.75; }
.arrow line { stroke: var(--bb-amber); stroke-width: 2.2; }
.arrow marker path { fill: var(--bb-amber); }

.vtx-src { fill: var(--bb-blue); stroke: var(--bb-fg); stroke-width: 2; cursor: grab; touch-action: none; }
.vtx-dst { fill: var(--bb-red); stroke: var(--bb-fg); stroke-width: 2; }
.lbl { fill: var(--bb-fg); font-size: 15px; font-weight: 800; font-family: var(--mono); pointer-events: none; }
.lbl.dst { fill: var(--bb-red); }

.mirror { stroke: var(--bb-green); stroke-width: 3; stroke-dasharray: 10 6; cursor: grab; touch-action: none; }
.mirror-lbl { fill: var(--bb-green); font-size: 13px; font-weight: 700; pointer-events: none; }

.pivot { fill: var(--bb-amber); stroke: var(--bb-fg); stroke-width: 2; cursor: move; touch-action: none; }
.pivot-lbl { fill: var(--bb-amber); font-size: 13px; font-weight: 700; pointer-events: none; }
.arc { fill: none; stroke: var(--bb-amber); stroke-width: 2.4; stroke-dasharray: 6 4; }
.arc-lbl { fill: var(--bb-amber); font-size: 15px; font-weight: 800; font-family: var(--mono); pointer-events: none; }
.angle-h { fill: var(--bb-amber); stroke: var(--bb-fg); stroke-width: 2; cursor: grab; touch-action: none; }
</style>
