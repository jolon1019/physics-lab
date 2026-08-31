<script setup>
import { computed, ref } from 'vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'
import { svgPoint } from '../../lib/svgCoord'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560。两平行线 + 可旋转截线（三线八角） ===== */
const VW = 900, VH = 560
const L1Y = 170, L2Y = 400
const CX = 380 // 截线与 L1 的交点 x

const theta = ref(62) // 截线与水平线夹角（度）
const kind = ref('tongwei')
let seen = {}
let done = false

const kindList = [
  { id: 'tongwei', label: '同位角（F 型）', note: '位置相同 → 相等' },
  { id: 'neicuo', label: '内错角（Z 型）', note: '两线之间 + 截线两侧 → 相等' },
  { id: 'tongpang', label: '同旁内角（U 型）', note: '两线之间 + 截线同侧 → 互补' }
]
const kindNote = computed(() => kindList.find((k) => k.id === kind.value)?.note)

function setKind(k) {
  seen[k] = true
  kind.value = k
  if (!done && seen.tongwei && seen.neicuo && seen.tongpang) {
    done = true
    emit('complete')
  }
}

/* 截线几何：过 p1(CX, L1Y)，与水平方向成 θ 角指向右下
   数学角约定：0°=右，逆时针为正；截线向下方向 = −θ，向上方向 = 180−θ */
const cut = computed(() => {
  const t = (theta.value * Math.PI) / 180
  const dx = (L2Y - L1Y) / Math.tan(t)
  const p1 = { x: CX, y: L1Y }
  const p2 = { x: CX + dx, y: L2Y }
  const ex1 = { x: p1.x - dx * 0.7, y: L1Y - (L2Y - L1Y) * 0.7 }
  const ex2 = { x: p2.x + dx * 0.7, y: L2Y + (L2Y - L1Y) * 0.7 }
  return { p1, p2, ex1, ex2 }
})

/* 拖动截线：按鼠标相对 p1 的方向更新 θ */
function dragHandle(e) {
  e.preventDefault()
  const svg = e.currentTarget.closest('svg')
  const move = (ev) => {
    const p = svgPoint(svg, ev.clientX, ev.clientY)
    // 截线过 p1(CX, L1Y) 且与水平成 θ。手柄在两线之间（p1 下方），
    // 鼠标可能落在截线的任一半段：下半段用 (vx, vy) 方向、上半段取反向向量，
    // 统一折算出直线倾角 θ ∈ [20,160]
    const vx = p.x - CX
    const vy = p.y - L1Y
    let deg = (vy >= 0
      ? Math.atan2(vy, vx)
      : Math.atan2(-vy, -vx)) * 180 / Math.PI
    deg = Math.round(deg)
    if (deg >= 20 && deg <= 160) theta.value = deg
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/* 扇形（角）：顶点 c，从数学角 a1 到 a2（短弧方向直接插值），半径 r */
function pt(c, r, a) {
  const s = (a * Math.PI) / 180
  return { x: c.x + r * Math.cos(s), y: c.y - r * Math.sin(s) }
}
function sector(c, r, a1, a2) {
  const steps = 16
  let d = `M ${c.x} ${c.y} L ${pt(c, r, a1).x} ${pt(c, r, a1).y} `
  for (let i = 1; i <= steps; i++) {
    const a = a1 + ((a2 - a1) * i) / steps
    const p = pt(c, r, a)
    d += `L ${p.x.toFixed(1)} ${p.y.toFixed(1)} `
  }
  return d + 'Z'
}
function midPt(c, r, a1, a2) {
  return pt(c, r, (a1 + a2) / 2)
}

/* 三类示范角对（数学角区间）：
   交点处四射线方向：0（右）、180（左）、180−θ（截线向上）、−θ（截线向下）
   同位角 F：p1 (0, 180−θ)  与  p2 (0, 180−θ)
   内错角 Z：p1 (−θ, 0)     与  p2 (180−θ, 180)
   同旁内角 U：p1 (−θ, 0)   与  p2 (0, 180−θ) */
const pairs = computed(() => {
  const t = theta.value
  const c1 = cut.value.p1
  const c2 = cut.value.p2
  const v1 = t
  const v2 = kind.value === 'tongpang' ? 180 - t : t
  if (kind.value === 'tongwei') {
    return [
      { c: c1, a1: 0, a2: 180 - t, v: v1, label: '∠1' },
      { c: c2, a1: 0, a2: 180 - t, v: v2, label: '∠2' }
    ]
  }
  if (kind.value === 'neicuo') {
    return [
      { c: c1, a1: -t, a2: 0, v: v1, label: '∠1' },
      { c: c2, a1: 180 - t, a2: 180, v: v2, label: '∠2' }
    ]
  }
  return [
    { c: c1, a1: -t, a2: 0, v: v1, label: '∠1' },
    { c: c2, a1: 0, a2: 180 - t, v: v2, label: '∠2' }
  ]
})

/* 8 个角的编号位置 */
const marks = computed(() => {
  const t = theta.value
  const c1 = cut.value.p1
  const c2 = cut.value.p2
  const off = 30
  const defs = [
    { c: c1, a: (180 - t) / 2, l: '1' },
    { c: c1, a: -t / 2, l: '2' },
    { c: c1, a: 180 + t / 2, l: '3' },
    { c: c1, a: 180 + (180 - t) / 2, l: '4' },
    { c: c2, a: (180 - t) / 2, l: '5' },
    { c: c2, a: -t / 2, l: '6' },
    { c: c2, a: 180 + t / 2, l: '7' },
    { c: c2, a: 180 + (180 - t) / 2, l: '8' }
  ]
  return defs.map((m) => {
    const p = midPt(m.c, off, m.a - 20, m.a + 20)
    return { l: m.l, x: p.x, y: p.y }
  })
})

const rows = computed(() => [
  { label: '截线与横线夹角', value: `${theta.value}°` },
  { label: '当前关系', value: kindNote.value },
  { label: kind.value === 'tongpang' ? '两角之和' : '两角度数', value: kind.value === 'tongpang' ? `${theta.value}° + ${180 - theta.value}° = 180°` : `${theta.value}° = ${theta.value}°` },
  { label: '反用即判定', value: '由角的关系反推两线平行' }
])
const results = computed(() => [
  { label: '同位角', value: '相等（F 型）' },
  { label: '内错角', value: '相等（Z 型）' },
  { label: '同旁内角', value: '互补（U 型，和 180°）' }
])
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel pl-panel" style="padding: 0">
        <svg class="pl-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="三线八角">
          <!-- 两条平行线 -->
          <line class="pline" x1="80" :y1="L1Y" :x2="VW - 80" :y2="L1Y" />
          <line class="pline" x1="80" :y1="L2Y" :x2="VW - 80" :y2="L2Y" />
          <text class="lname" x="52" :y="L1Y + 6">l₁</text>
          <text class="lname" x="52" :y="L2Y + 6">l₂</text>

          <!-- 截线 -->
          <line class="cutline" :x1="cut.ex1.x" :y1="cut.ex1.y" :x2="cut.ex2.x" :y2="cut.ex2.y" />
          <text class="lname" :x="cut.ex2.x + 8" :y="cut.ex2.y + 4">l₃</text>

          <!-- 高亮角对（扇形） -->
          <g>
            <path v-for="(p, i) in pairs" :key="'a'+i" class="angle-arc"
              :d="sector(p.c, 60, p.a1, p.a2)" />
            <text v-for="(p, i) in pairs" :key="'at'+i" class="angle-lbl"
              :x="midPt(p.c, 88, p.a1, p.a2).x"
              :y="midPt(p.c, 88, p.a1, p.a2).y + 5"
              text-anchor="middle">{{ p.label }} = {{ p.v }}°</text>
          </g>

          <!-- 8 个角编号 -->
          <g>
            <text v-for="(m, i) in marks" :key="'m'+i" class="mark"
              :x="m.x" :y="m.y + 4" text-anchor="middle">{{ m.l }}</text>
          </g>

          <!-- 拖动手柄（截线上两交点之间的中点） -->
          <circle class="handle"
            :cx="(cut.p1.x + cut.p2.x) / 2"
            :cy="(cut.p1.y + cut.p2.y) / 2"
            r="12" @pointerdown.prevent="dragHandle" />

          <text class="hint" x="40" y="40">拖动橙色手柄旋转截线 l₃（当前 {{ theta }}°）· 形状变了，关系不变</text>
          <text class="note" x="40" y="516">F 型同位相等 · Z 型内错相等 · U 型同旁互补（和 180°）</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button
          v-for="k in kindList" :key="k.id"
          class="btn" :class="{ 'btn-primary': kind === k.id }"
          @click="setKind(k.id)"
        >{{ k.label }}</button>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实时数据</strong><span>拖动联动</span></div>
        <div class="lab-readout">
          <div class="lab-stat"><span>截线与横线夹角</span><strong>{{ theta }}°</strong></div>
          <div class="lab-stat accent"><span>当前关系</span><strong style="font-size:13px">{{ kindNote }}</strong></div>
          <div class="lab-stat success">
            <span>{{ kind === 'tongpang' ? '同旁内角之和' : '两角度数关系' }}</span>
            <strong>{{ kind === 'tongpang' ? '180°' : '相等' }}</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="三线八角"
        formula="平行 ⇒ 同位角相等 · 内错角相等 · 同旁内角互补"
        desc="两条平行线被第三条直线所截形成 8 个角。按位置分三类：同位角 F 型、内错角 Z 型、同旁内角 U 型。平行时前两者相等、后者互补。反之，由这些角的关系可以反推两直线平行（判定）。"
        :rows="rows"
        :result="results"
        :verify="[
          '性质与判定互逆：由平行推角（性质），由角推平行（判定）',
          '同位角相等 ⇒ 两直线平行（判定最常用）',
          '内错角相等或同旁内角互补同样可判定平行',
          '对顶角相等（相交线）是所有角度计算的底层工具'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>七年级·相交线与平行线</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          认角先认<b>形状</b>：F → 同位，Z → 内错，U → 同旁。<br />
          · 这些关系由"三线"的<b>位置</b>定义，与角度大小无关。<br />
          · 平行线的性质与判定互为逆用，是几何证明的基石。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.pl-panel { background: transparent; }
.pl-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.pline { stroke: var(--bb-fg); stroke-width: 3; }
.cutline { stroke: var(--bb-amber); stroke-width: 3.5; }
.lname { fill: var(--bb-fg); font-size: 18px; font-weight: 900; font-family: var(--mono); }
.angle-arc { fill: rgba(70, 232, 210, 0.25); stroke: var(--bb-green); stroke-width: 2.6; }
.angle-lbl { fill: var(--bb-green); font-size: 16px; font-weight: 900; font-family: var(--mono); }
.mark { fill: var(--bb-fg-dim); font-size: 14px; font-family: var(--mono); }
.handle { fill: var(--bb-amber); stroke: var(--bb-fg); stroke-width: 2.5; cursor: grab; }
.hint { fill: var(--bb-fg-dim); font-size: 14px; }
.note { fill: var(--bb-fg); font-size: 16px; font-weight: 800; }
</style>
