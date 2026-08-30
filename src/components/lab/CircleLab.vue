<script setup>
import { computed, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560，圆心 O、半径 R ===== */
const VW = 900, VH = 560
const O = { x: 400, y: 300 }
const R = 170

const mode = ref('perp')          // perp 垂径定理 | inscribed 圆周角
const d = ref(90)                 // 弦心距（垂径模式）
const phi = ref(30)               // 弦的方位角（度）
const angA = ref(40)              // 圆周角模式：点 A 的圆上角度（度，0..360）

let touched = ref(false)
let seenBoth = new Set()
let done = false
function touch() {
  touched.value = true
  seenBoth.add(mode.value)
  if (!done && seenBoth.has('perp') && seenBoth.has('inscribed')) {
    done = true
    emit('complete')
  }
}
function pick(m) { mode.value = m; touch() }

const pt = (deg, r = R) => {
  const s = (deg * Math.PI) / 180
  return { x: O.x + r * Math.cos(s), y: O.y - r * Math.sin(s) }
}
const fdist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y)

/* ===== 垂径定理模式 ===== */
const perp = computed(() => {
  const s = (phi.value * Math.PI) / 180
  const u = { x: Math.cos(s), y: -Math.sin(s) }      // O → M 方向
  const t = { x: -u.y, y: u.x }                      // 弦方向（垂直于 OM）
  const M = { x: O.x + d.value * u.x, y: O.y + d.value * u.y }
  const h = Math.sqrt(Math.max(R * R - d.value * d.value, 0))
  const A = { x: M.x - h * t.x, y: M.y - h * t.y }
  const B = { x: M.x + h * t.x, y: M.y + h * t.y }
  // 直角标记（M 处小方块）
  const q = 13
  const right = `${M.x + u.x * q},${M.y + u.y * q} ${M.x + (u.x + t.x) * q},${M.y + (u.y + t.y) * q} ${M.x + t.x * q},${M.y + t.y * q}`
  const central = 2 * ((Math.asin(Math.min(d.value / R, 1)) * 180) / Math.PI)
  return { M, A, B, h, right, central, chord: 2 * h }
})

/* ===== 圆周角模式 ===== */
const insc = computed(() => {
  const B = pt(140), C = pt(20), A = pt(angA.value)
  const A2 = pt(angA.value + 180)
  const angleAt = (P, Q, S) => {
    const v1 = { x: Q.x - P.x, y: Q.y - P.y }, v2 = { x: S.x - P.x, y: S.y - P.y }
    const dot = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y))
    return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
  }
  const central = angleAt(O, B, C)
  const ins = angleAt(A, B, C)
  const ins2 = angleAt(A2, B, C)
  return { B, C, A, A2, central, ins, ins2 }
})

/* 扇形（圆心角 ∠BOC 高亮） */
const centralSector = computed(() => {
  const { B, C } = insc.value
  const a1 = (Math.atan2(-(B.y - O.y), B.x - O.x) * 180) / Math.PI
  const a2 = (Math.atan2(-(C.y - O.y), C.x - O.x) * 180) / Math.PI
  const steps = 20, r = R * 0.42
  let dd = a2 - a1
  while (dd > 180) dd -= 360
  while (dd < -180) dd += 360
  let dPath = `M ${O.x} ${O.y} `
  for (let i = 0; i <= steps; i++) {
    const a = ((a1 + (dd * i) / steps) * Math.PI) / 180
    dPath += `L ${(O.x + r * Math.cos(a)).toFixed(1)} ${(O.y - r * Math.sin(a)).toFixed(1)} `
  }
  return dPath + 'Z'
})

/* 圆周角弧（点 A 处） */
const insArc = computed(() => {
  const { A, B, C } = insc.value
  const a1 = Math.atan2(B.y - A.y, B.x - A.x)
  let dd = Math.atan2(C.y - A.y, C.x - A.x) - a1
  while (dd > Math.PI) dd -= 2 * Math.PI
  while (dd < -Math.PI) dd += 2 * Math.PI
  const steps = 14, r = 34
  let dPath = `M ${A.x} ${A.y} `
  for (let i = 0; i <= steps; i++) {
    const a = a1 + (dd * i) / steps
    dPath += `L ${(A.x + r * Math.cos(a)).toFixed(1)} ${(A.y + r * Math.sin(a)).toFixed(1)} `
  }
  return dPath + 'Z'
})

const rows = computed(() => {
  if (mode.value === 'perp') {
    const p = perp.value
    return [
      { label: '半径 R', value: `${R}` },
      { label: '弦心距 OM = d', value: `${d.value}` },
      { label: '半弦 AP = PB', value: p.h.toFixed(1) },
      { label: '弦长 AB', value: p.chord.toFixed(1) },
      { label: '勾股检验', value: `d² + 半弦² = ${(d.value * d.value + p.h * p.h).toFixed(0)} = R² = ${R * R}` },
      { label: '圆心角 ∠AOB', value: `${p.central.toFixed(0)}°` }
    ]
  }
  const q = insc.value
  return [
    { label: '圆心角 ∠BOC', value: `${q.central.toFixed(1)}°` },
    { label: '圆周角 ∠BAC', value: `${q.ins.toFixed(1)}°` },
    { label: '倍数关系', value: `∠BOC = 2∠BAC ✓` },
    { label: '另一侧 ∠BA′C', value: `${q.ins2.toFixed(1)}°（与 ∠BAC 互补）` },
    { label: '点 A 位置', value: `${angA.value}°` }
  ]
})
const results = computed(() => mode.value === 'perp'
  ? [
      { label: '垂径定理', value: 'OM ⊥ AB ⇒ AM = MB（且平分两条弧）' },
      { label: '勾股关系', value: 'R² = d² + 半弦²' }
    ]
  : [
      { label: '圆周角定理', value: '同弧圆周角 = 圆心角的一半' },
      { label: '直径推论', value: '直径所对圆周角 = 90°' }
    ]
)
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel cr-panel" style="padding: 0">
        <svg class="cr-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="圆的性质：垂径定理与圆周角">
          <!-- 圆与圆心 -->
          <circle class="circle" :cx="O.x" :cy="O.y" :r="R" />
          <circle class="opoint" :cx="O.x" :cy="O.y" r="5" />
          <text class="olbl" :x="O.x - 20" :y="O.y + 18">O</text>

          <!-- ===== 垂径定理模式 ===== -->
          <g v-if="mode === 'perp'">
            <line class="radius" :x1="O.x" :y1="O.y" :x2="perp.A.x" :y2="perp.A.y" />
            <line class="radius" :x1="O.x" :y1="O.y" :x2="perp.B.x" :y2="perp.B.y" />
            <line class="chord" :x1="perp.A.x" :y1="perp.A.y" :x2="perp.B.x" :y2="perp.B.y" />
            <line class="om" :x1="O.x" :y1="O.y" :x2="perp.M.x" :y2="perp.M.y" />
            <polygon class="right" :points="perp.right" />
            <circle class="mpoint" :cx="perp.M.x" :cy="perp.M.y" r="5" />
            <circle class="apoint" :cx="perp.A.x" :cy="perp.A.y" r="6" />
            <circle class="apoint" :cx="perp.B.x" :cy="perp.B.y" r="6" />
            <text class="lbl" :x="perp.A.x - 20" :y="perp.A.y + 4">A</text>
            <text class="lbl" :x="perp.B.x + 12" :y="perp.B.y + 4">B</text>
            <text class="lbl" :x="perp.M.x + 10" :y="perp.M.y + 20">M</text>
            <text class="om-t" :x="(O.x + perp.M.x) / 2 + 12" :y="(O.y + perp.M.y) / 2">d = {{ d }}</text>
          </g>

          <!-- ===== 圆周角模式 ===== -->
          <g v-else>
            <path class="csector" :d="centralSector" />
            <line class="chord thin" :x1="insc.B.x" :y1="insc.B.y" :x2="insc.C.x" :y2="insc.C.y" />
            <line class="cray" :x1="O.x" :y1="O.y" :x2="insc.B.x" :y2="insc.B.y" />
            <line class="cray" :x1="O.x" :y1="O.y" :x2="insc.C.x" :y2="insc.C.y" />
            <line class="chord" :x1="insc.A.x" :y1="insc.A.y" :x2="insc.B.x" :y2="insc.B.y" />
            <line class="chord" :x1="insc.A.x" :y1="insc.A.y" :x2="insc.C.x" :y2="insc.C.y" />
            <!-- 第二个圆周点 A′（虚线，验证同弧圆周角相等 / 对弧互补） -->
            <line class="chord ghost" :x1="insc.A2.x" :y1="insc.A2.y" :x2="insc.B.x" :y2="insc.B.y" />
            <line class="chord ghost" :x1="insc.A2.x" :y1="insc.A2.y" :x2="insc.C.x" :y2="insc.C.y" />
            <path class="iarc" :d="insArc" />
            <circle class="apoint" :cx="insc.A.x" :cy="insc.A.y" r="8" />
            <circle class="gpoint" :cx="insc.A2.x" :cy="insc.A2.y" r="6" />
            <circle class="bpoint" :cx="insc.B.x" :cy="insc.B.y" r="6" />
            <circle class="bpoint" :cx="insc.C.x" :cy="insc.C.y" r="6" />
            <text class="lbl" :x="insc.A.x + 12" :y="insc.A.y - 8">A</text>
            <text class="lbl" :x="insc.A2.x + 12" :y="insc.A2.y + 16">A′</text>
            <text class="lbl" :x="insc.B.x - 26" :y="insc.B.y - 6">B</text>
            <text class="lbl" :x="insc.C.x + 12" :y="insc.C.y - 6">C</text>
            <text class="sector-t" :x="O.x + 46" :y="O.y - 30" text-anchor="middle">∠BOC = {{ insc.central.toFixed(0) }}°</text>
            <text class="iarc-t" :x="insc.A.x + 40 * Math.cos(0.2)" :y="insc.A.y + 26" text-anchor="middle">∠A = {{ insc.ins.toFixed(0) }}°</text>
          </g>

          <!-- 说明 -->
          <text class="hint" x="40" y="40">{{ mode === 'perp' ? 'OM ⊥ AB 于 M ⇒ AM = MB，且 d² + 半弦² = R²' : '同弧上：∠BAC = ∠AB′C = 圆心角的一半；A 转到另一段弧则与原角互补' }}</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': mode === 'perp' }" @click="pick('perp')">垂径定理</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'inscribed' }" @click="pick('inscribed')">圆周角定理</button>
        <button class="btn" @click="d = 0; touch()">d = 0（弦变直径）</button>
        <span class="feedback no">{{ mode === 'perp' ? 'd=0 时弦变成直径，AM=MB 平凡成立' : '试试把 A 拖过 B、C 之间的短弧' }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>实时联动</span></div>
        <div class="lab-params">
          <template v-if="mode === 'perp'">
            <ParamSlider v-model="d" :min="0" :max="165" :step="5" label="弦心距 d" @update:model-value="touch" />
            <ParamSlider v-model="phi" :min="0" :max="180" :step="5" label="弦的方位角" unit="°" @update:model-value="touch" />
          </template>
          <ParamSlider v-else v-model="angA" :min="0" :max="359" :step="2" label="点 A 位置" unit="°" @update:model-value="touch" />
        </div>
      </div>

      <FormulaPanel
        :title="mode === 'perp' ? '垂径定理' : '圆周角定理'"
        :formula="mode === 'perp' ? 'r² = d² + 半弦²' : '圆周角 = 同弧圆心角的一半'"
        :desc="mode === 'perp'
          ? '垂直于弦的直径平分弦，并且平分弦所对的两条弧。半径、弦心距、半弦构成直角三角形：r² = d² + (AB/2)²。'
          : '同弧所对圆周角等于圆心角的一半；同弧上的圆周角彼此相等；直径所对圆周角为 90°。圆内接四边形对角互补。'"
        :rows="rows"
        :result="results"
        :verify="[
          '垂径定理 + 勾股定理是求弦长/弦心距的标准组合',
          '圆周角定理反用：圆周角相等 ⇒ 同弧（判定四点共圆的思想）',
          '同弧圆周角相等；异弧（对弧）圆周角与原角互补',
          '半圆（直径）上的圆周角 = 90°，反之 90° 圆周角所对弦是直径'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>九年级上·圆</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          圆是<b>到定点距离等于定长</b>的点的集合，性质全部围绕"等距"展开。<br />
          · 垂径定理的本质：等腰三角形（OA=OB）底边上的高也是中线。<br />
          · 圆周角定理的本质：同弧圆心角被"共享"，每个圆周角只占一半。<br />
          · 常用模型：连半径、作弦心距，构造直角三角形解题。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.cr-panel { background: transparent; }
.cr-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.circle { fill: none; stroke: var(--bb-fg); stroke-width: 3; }
.opoint { fill: var(--bb-fg); }
.olbl, .lbl { fill: var(--bb-fg); font-size: 16px; font-weight: 900; font-family: var(--mono); pointer-events: none; }
.radius { stroke: var(--bb-fg-dim); stroke-width: 1.6; }
.chord { stroke: var(--bb-amber); stroke-width: 4; stroke-linecap: round; }
.chord.thin { stroke: var(--bb-fg-dim); stroke-width: 2; stroke-dasharray: 7 5; }
.chord.ghost { stroke: var(--bb-fg-dim); stroke-width: 2; stroke-dasharray: 5 5; opacity: 0.7; }
.om { stroke: var(--bb-red); stroke-width: 2.4; stroke-dasharray: 8 5; }
.om-t { fill: var(--bb-red); font-size: 14px; font-weight: 800; font-family: var(--mono); }
.right { fill: none; stroke: var(--bb-red); stroke-width: 1.8; }
.mpoint { fill: var(--bb-red); stroke: #fff; stroke-width: 1.5; }
.apoint { fill: var(--bb-blue); stroke: #fff; stroke-width: 2; cursor: pointer; }
.gpoint { fill: var(--bb-fg-dim); stroke: #fff; stroke-width: 1.5; }
.bpoint { fill: var(--bb-fg); stroke: #fff; stroke-width: 1.5; }
.csector { fill: rgba(70, 168, 232, 0.30); stroke: var(--bb-blue); stroke-width: 1.5; }
.sector-t { fill: var(--bb-blue); font-size: 15px; font-weight: 900; font-family: var(--mono); }
.cray { stroke: var(--bb-blue); stroke-width: 2.4; }
.iarc { fill: rgba(184, 121, 21, 0.32); stroke: var(--bb-amber); stroke-width: 2.2; }
.iarc-t { fill: var(--bb-amber); font-size: 15px; font-weight: 900; font-family: var(--mono); }
.hint { fill: var(--bb-fg-dim); font-size: 14px; }
</style>
