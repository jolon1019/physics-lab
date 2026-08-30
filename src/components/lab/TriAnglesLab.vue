<script setup>
import { computed, reactive, ref } from 'vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'
import { svgPoint } from '../../lib/svgCoord'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560。可拖动三角形 + 拼角验证 ===== */
const VW = 900, VH = 560

const pts = reactive({ A: { x: 330, y: 110 }, B: { x: 140, y: 400 }, C: { x: 620, y: 400 } })

const ang = (P, Q, R) => {
  // 顶点 P 处的角（PQ 与 PR 夹角），度
  const v1 = { x: Q.x - P.x, y: Q.y - P.y }
  const v2 = { x: R.x - P.x, y: R.y - P.y }
  const d = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y))
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI
}

const angles = computed(() => ({
  A: ang(pts.A, pts.B, pts.C),
  B: ang(pts.B, pts.C, pts.A),
  C: ang(pts.C, pts.A, pts.B)
}))
const sum = computed(() => angles.value.A + angles.value.B + angles.value.C)

/* 拼角验证：三个角扇形搬到下方直线上依次拼开 */
const showPatch = ref(false)
const PY = 500
const RAD = 44

let touched = false, done = false
function touch() {
  touched = true
  check()
}
function togglePatch() {
  showPatch.value = !showPatch.value
  check()
}
function check() {
  if (!done && touched && showPatch.value) {
    done = true
    emit('complete')
  }
}

/* 拖动顶点 */
let dragging = null
function onDown(name, e) {
  e.preventDefault()
  dragging = name
  touch()
  const svg = e.currentTarget.closest('svg')
  const move = (ev) => {
    if (!dragging) return
    const p = svgPoint(svg, ev.clientX, ev.clientY)
    pts[dragging].x = Math.max(60, Math.min(VW - 60, Math.round(p.x)))
    pts[dragging].y = Math.max(70, Math.min(PY - 80, Math.round(p.y)))
  }
  const up = () => {
    dragging = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

const handles = [
  { name: 'A', p: () => pts.A },
  { name: 'B', p: () => pts.B },
  { name: 'C', p: () => pts.C }
]

/* 角弧路径（三角形内部） */
function innerArc(vertex, p1, p2, r, deg) {
  const a1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x)
  const a2 = Math.atan2(p2.y - vertex.y, p2.x - vertex.x)
  // 从 a1 朝 a2 方向转 deg（取内部方向：分别试两个方向取扫过角接近 deg 的）
  const steps = 14
  let ptsArr = []
  for (let i = 0; i <= steps; i++) {
    // 在 a1→a2 的几何夹角内插值
    let d = a2 - a1
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    const a = a1 + (d * i) / steps
    ptsArr.push(`${(vertex.x + r * Math.cos(a)).toFixed(1)},${(vertex.y + r * Math.sin(a)).toFixed(1)}`)
  }
  void deg
  return `M ${vertex.x} ${vertex.y} L ${ptsArr[0]} ` + ptsArr.slice(1).map((p) => `L ${p}`).join(' ') + ' Z'
}

const arcs = computed(() => [
  { v: pts.A, p1: pts.B, p2: pts.C, deg: angles.value.A, cls: 'arc-a', label: `A = ${angles.value.A.toFixed(0)}°`, lc: pts.A, off: 26 },
  { v: pts.B, p1: pts.C, p2: pts.A, deg: angles.value.B, cls: 'arc-b', label: `B = ${angles.value.B.toFixed(0)}°`, lc: pts.B, off: 26 },
  { v: pts.C, p1: pts.A, p2: pts.B, deg: angles.value.C, cls: 'arc-c', label: `C = ${angles.value.C.toFixed(0)}°`, lc: pts.C, off: 26 }
])

/* 拼角扇形：三色扇形共享圆心，从 0° 到 180° 依次铺满半圆（平角） */
const patchSectors = computed(() => {
  const colors = ['arc-a', 'arc-b', 'arc-c']
  const each = angles.value
  const list = [each.A, each.B, each.C]
  const cx = VW / 2
  let cur = 0
  return list.map((deg, i) => {
    const a1 = cur
    const a2 = cur + deg
    cur = a2
    const steps = 16
    let d = `M ${cx} ${PY} `
    for (let k2 = 0; k2 <= steps; k2++) {
      const a = ((a1 + ((a2 - a1) * k2) / steps) * Math.PI) / 180
      d += `L ${(cx + RAD * Math.cos(a)).toFixed(1)} ${(PY - RAD * Math.sin(a)).toFixed(1)} `
    }
    d += 'Z'
    return { d, cls: colors[i], label: `角${'ABC'[i]} = ${deg.toFixed(0)}°`, lx: cx + (RAD + 18) * Math.cos((((a1 + a2) / 2) * Math.PI) / 180), ly: PY - (RAD + 18) * Math.sin((((a1 + a2) / 2) * Math.PI) / 180) }
  })
})

const rows = computed(() => [
  { label: '∠A', value: angles.value.A.toFixed(1) + '°' },
  { label: '∠B', value: angles.value.B.toFixed(1) + '°' },
  { label: '∠C', value: angles.value.C.toFixed(1) + '°' },
  { label: '内角和 Σ', value: sum.value.toFixed(1) + '°（恒为 180°）' },
  { label: '拼角验证', value: showPatch.value ? '三扇形恰好铺满平角 ✓' : '点「拼角验证」看撕角拼合' }
])
const results = computed(() => [
  { label: '结论', value: '任意三角形内角和 = 180°' },
  { label: '推论 1', value: '直角三角形两锐角互余（和 90°）' },
  { label: '推论 2', value: '外角 = 不相邻两内角之和' }
])
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel ta-panel" style="padding: 0">
        <svg class="ta-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="三角形内角和：拼角验证">
          <!-- 拼角直线 -->
          <line v-if="showPatch" class="flatline" x1="120" :y1="PY" :x2="VW - 120" :y2="PY" />
          <g v-if="showPatch">
            <path v-for="(s, i) in patchSectors" :key="'p'+i" :class="['sector', s.cls]" :d="s.d" />
            <text v-for="(s, i) in patchSectors" :key="'pt'+i" class="sector-t" :x="s.lx" :y="s.ly" text-anchor="middle">{{ s.label }}</text>
          </g>

          <!-- 三角形 -->
          <polygon class="tri" :points="`${pts.A.x},${pts.A.y} ${pts.B.x},${pts.B.y} ${pts.C.x},${pts.C.y}`" />
          <!-- 三个内角弧 -->
          <path v-for="(a, i) in arcs" :key="'a'+i" :class="['iarc', a.cls]" :d="innerArc(a.v, a.p1, a.p2, 42, a.deg)" />
          <!-- 角标签 -->
          <text v-for="(a, i) in arcs" :key="'at'+i" :class="['albl', a.cls]"
            :x="a.lc.x + (i === 1 ? -40 : i === 2 ? 40 : 0)"
            :y="a.lc.y + (i === 0 ? -16 : 24)">{{ a.label }}</text>

          <!-- 顶点手柄 -->
          <g v-for="h in handles" :key="h.name">
            <circle class="handle" :cx="h.p().x" :cy="h.p().y" r="11" @pointerdown.prevent="onDown(h.name, $event)" />
            <text class="hname" :x="h.p().x" :y="h.p().y + 4" text-anchor="middle" style="pointer-events:none">{{ h.name }}</text>
          </g>

          <text class="hint" x="40" y="40">拖动 A / B / C 改变形状 · 内角和始终是 {{ sum.toFixed(1) }}°</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn btn-primary" @click="togglePatch">{{ showPatch ? '收起拼角' : '拼角验证（撕下三角拼直线）' }}</button>
        <button class="btn" @click="pts.A = { x: 330, y: 110 }; pts.B = { x: 140, y: 400 }; pts.C = { x: 620, y: 400 }; touch()">复位</button>
        <span class="feedback no">拼成一条直线 = 平角 180°，这就是内角和的由来</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实时数据</strong><span>拖动联动</span></div>
        <div class="lab-readout">
          <div class="lab-stat"><span>∠A / ∠B / ∠C</span><strong style="font-size:13px">{{ angles.A.toFixed(0) }}° / {{ angles.B.toFixed(0) }}° / {{ angles.C.toFixed(0) }}°</strong></div>
          <div class="lab-stat accent"><span>内角和</span><strong>{{ sum.toFixed(1) }}°</strong></div>
          <div class="lab-stat success"><span>拼角状态</span><strong style="font-size:13px">{{ showPatch ? '已拼成平角 ✓' : '待拼角' }}</strong></div>
        </div>
      </div>

      <FormulaPanel
        title="三角形内角和"
        formula="∠A + ∠B + ∠C = 180°"
        desc="任意三角形的三个内角和恒为 180°，与形状无关。证明思路：撕下三个角拼成平角，或过一顶点作对边平行线，用内错角相等把三个角集中到一处。"
        :rows="rows"
        :result="results"
        :verify="[
          '拼角法：三角之和恰好铺满一条直线（平角）',
          '平行线法：过 A 作 BC 的平行线，内错角相等 → 三角拼成平角',
          '直角三角形两锐角互余：180° − 90° = 90°',
          '外角定理：外角 = 不相邻两内角之和'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>八年级·三角形</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          内角和定理是三角形一切角度计算的基础。<br />
          · 多边形内角和 = (n−2)×180°：从每个顶点引对角线分成三角形。<br />
          · 三角形至少有两个锐角；最多一个直角或钝角。<br />
          · 燕尾形、8 字型等角度模型都由内角和推出。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.ta-panel { background: transparent; }
.ta-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.tri { fill: rgba(184, 121, 21, 0.20); stroke: var(--bb-amber); stroke-width: 3.5; stroke-linejoin: round; }
.iarc { opacity: 0.75; stroke-width: 1.5; }
.arc-a { fill: rgba(70, 168, 232, 0.35); stroke: var(--bb-blue); }
.arc-b { fill: rgba(13, 155, 97, 0.30); stroke: var(--bb-green); }
.arc-c { fill: rgba(217, 33, 53, 0.25); stroke: var(--bb-red); }
.albl { font-size: 16px; font-weight: 900; font-family: var(--mono); pointer-events: none; }
.albl.arc-a { fill: var(--bb-blue); }
.albl.arc-b { fill: var(--bb-green); }
.albl.arc-c { fill: var(--bb-red); }
.handle { fill: var(--bb-fg); stroke: #fff; stroke-width: 2.5; cursor: grab; }
.hname { fill: #fff; font-size: 12px; font-weight: 900; font-family: var(--mono); }
.flatline { stroke: var(--bb-fg); stroke-width: 3; }
.sector { opacity: 0.8; stroke-width: 1.5; }
.sector-t { fill: var(--bb-fg); font-size: 14px; font-weight: 800; font-family: var(--mono); }
.hint { fill: var(--bb-fg-dim); font-size: 14px; }
</style>
