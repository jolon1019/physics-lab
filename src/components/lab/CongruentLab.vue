<script setup>
import { computed, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×520，A 为原点，AB 沿 x 轴 ===== */
const VW = 900, VH = 520, U = 40, OX = 300, OY = 430
const toSvg = (p) => ({ x: OX + p.x * U, y: OY - p.y * U })
const fmt = (n) => (Math.round(n * 100) / 100).toString()
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y)
const RAD = Math.PI / 180

/* ===== 状态：mode = sss | sas | asa | aaa | ssa ===== */
const mode = ref('sss')
const hint = ref('拖动滑块改变「三边」，观察三角形是否还能变形')

// 共用参数（各模式取用所需项）
const sA = ref(5) // BC
const sB = ref(6) // CA
const sC = ref(7) // AB（底边，固定摆放）
const angA = ref(60) // ∠A（度）
const angB = ref(55) // ∠B（度）

/* ===== 求解：给定条件 → 顶点 C（可能 0 / 1 / 2 个解）===== */
function solve() {
  const A = { x: 0, y: 0 }, B = { x: sC.value, y: 0 }
  if (mode.value === 'sss') {
    const x = (sB.value * sB.value + sC.value * sC.value - sA.value * sA.value) / (2 * sC.value)
    const y2 = sB.value * sB.value - x * x
    if (y2 <= 0.001) return { pts: [], msg: '两边之和不大于第三边，拼不出三角形（不满足三角不等式）' }
    return { pts: [{ x, y: Math.sqrt(y2) }], msg: '三边锁定 → 三角形唯一（SSS 成立）' }
  }
  if (mode.value === 'sas') {
    const r = angA.value * RAD
    return { pts: [{ x: sB.value * Math.cos(r), y: sB.value * Math.sin(r) }], msg: '两边和它们的夹角锁定 → 三角形唯一（SAS 成立）' }
  }
  if (mode.value === 'asa' || mode.value === 'aaa') {
    const s = (angA.value + angB.value) * RAD
    if (angA.value + angB.value >= 178) return { pts: [], msg: '两角之和 ≥ 180°，拼不出三角形' }
    const t = (sC.value * Math.sin(angB.value * RAD)) / Math.sin(s)
    return { pts: [{ x: t * Math.cos(angA.value * RAD), y: t * Math.sin(angA.value * RAD) }], msg: mode.value === 'asa'
      ? '两角和它们的夹边锁定 → 三角形唯一（ASA 成立）'
      : '角只定形状不定大小：改变 c，三角形整体缩放但仍「角角角」相同 → 只能相似，SSS/ASA 才管全等' }
  }
  // ssa：已知 c=AB、∠B、b=CA（b 是 ∠B 的对边）
  const B0 = angB.value * RAD
  const D = sB.value * sB.value - sC.value * sC.value * Math.sin(B0) ** 2
  if (D < 0) return { pts: [], msg: 'b < c·sinB：以 A 为圆心、b 为半径的圆够不到射线 → 无解' }
  const sq = Math.sqrt(D)
  const ts = [sC.value * Math.cos(B0) - sq, sC.value * Math.cos(B0) + sq].filter((t) => t > 0.001)
  const pts = ts.map((t) => ({ x: sC.value - t * Math.cos(B0), y: t * Math.sin(B0) }))
  if (pts.length === 2) return { pts, msg: '两个不同的三角形都满足条件（绿 / 红）→ SSA 不能判定全等！' }
  return { pts: pts.slice(0, 1), msg: '此参数下恰有一解（b ≥ c 或直角情形）→ 但一般情况 SSA 有两个解，不能作为判定方法' }
}

const solved = computed(() => solve())
const tris = computed(() =>
  solved.value.pts.map((C) => {
    const A = { x: 0, y: 0 }, B = { x: sC.value, y: 0 }
    return {
      A, B, C,
      a: dist(B, C), b: dist(C, A), c: sC.value,
      angA: Math.atan2(C.y, C.x) / RAD,
      angB: Math.acos((sC.value ** 2 + dist(B, C) ** 2 - dist(C, A) ** 2) / (2 * sC.value * dist(B, C))) / RAD,
      angC: 180 - (Math.atan2(C.y, C.x) / RAD) - Math.acos((sC.value ** 2 + dist(B, C) ** 2 - dist(C, A) ** 2) / (2 * sC.value * dist(B, C))) / RAD
    }
  })
)

const poly = (t) => [t.A, t.B, t.C].map((p) => { const s = toSvg(p); return `${s.x},${s.y}` }).join(' ')

/* ===== 模式切换 ===== */
const MODES = {
  sss: { name: '三边 SSS', hint: '拖动滑块改变「三边」，观察三角形是否还能变形' },
  sas: { name: '两边夹角 SAS', hint: '改变 b、c 和夹角 ∠A，注意：夹角必须「夹」在两边中间' },
  asa: { name: '两角夹边 ASA', hint: '改变 ∠A、∠B 和夹边 c，两射线交点 C 是否唯一？' },
  aaa: { name: '三角 AAA（反例）', hint: '改变三个角或底边 c：形状不变、大小在变 → 相似 ≠ 全等' },
  ssa: { name: '两边对角 SSA（反例）', hint: '调 b 在 c·sinB 与 c 之间，看红色「第二解」三角形何时出现' }
}
const tried = new Set()
let changed = false, done = false
function pick(m) {
  mode.value = m
  tried.add(m)
  hint.value = MODES[m].hint
  checkDone()
}
function checkDone() {
  if (done) return
  if (changed && tried.size >= 5) {
    done = true
    emit('complete')
  }
}
function onSlider() { changed = true; checkDone() }

/* ===== 右侧读数 ===== */
const givenRows = computed(() => {
  const t = tris.value[0]
  const rows = []
  if (mode.value === 'sss') rows.push({ label: '已知三边 a, b, c', value: `${sA.value}, ${sB.value}, ${sC.value}` })
  if (mode.value === 'sas') rows.push({ label: '已知 b, ∠A, c', value: `${sB.value}, ${angA.value}°, ${sC.value}` })
  if (mode.value === 'asa' || mode.value === 'aaa') rows.push({ label: '已知 ∠A, ∠B' + (mode.value === 'asa' ? ', c' : ''), value: `${angA.value}°, ${angB.value}°` + (mode.value === 'asa' ? `, ${sC.value}` : '') })
  if (mode.value === 'ssa') rows.push({ label: '已知 c, ∠B, 对边 b', value: `${sC.value}, ${angB.value}°, ${sB.value}` })
  if (t) {
    rows.push({ label: '解的个数', value: `${tris.value.length} 个` })
    rows.push({ label: '第三边 a / b', value: `${t.a.toFixed(2)} / ${t.b.toFixed(2)}` })
    rows.push({ label: '三角 A / B / C', value: `${t.angA.toFixed(1)}° / ${t.angB.toFixed(1)}° / ${t.angC.toFixed(1)}°` })
  }
  return rows
})
const resultRows = computed(() => [
  { label: '结论', value: solved.value.msg }
])
const formula = computed(() => ({
  sss: '三边对应相等 ⇒ 全等 (SSS)',
  sas: '两边及其夹角对应相等 ⇒ 全等 (SAS)',
  asa: '两角及其夹边对应相等 ⇒ 全等 (ASA)',
  aaa: '三角对应相等 ⇒ 只保证相似 ✗',
  ssa: '两边及一边的对角 ⇒ 可能两解 ✗'
}[mode.value]))
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel cg-panel" style="padding: 0">
        <svg class="cg-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="全等三角形判定交互演示">
          <g class="grid">
            <line v-for="x in 31" :key="'v' + x" :x1="(x - 1) * 30" y1="0" :x2="(x - 1) * 30" :y2="VH" />
            <line v-for="y in 18" :key="'h' + y" x1="0" :y1="(y - 1) * 30" :x2="VW" :y2="(y - 1) * 30" />
          </g>
          <g class="axis">
            <line x1="0" :y1="OY" :x2="VW" :y2="OY" />
            <line :x1="OX" y1="0" :x2="OX" :y2="VH" />
          </g>

          <!-- SSA 第二解（红色虚线） -->
          <polygon v-if="tris.length === 2" class="tri-alt" :points="poly(tris[1])" />
          <!-- 主三角形 -->
          <polygon v-if="tris.length" class="tri-main" :points="poly(tris[0])" />

          <!-- 顶点与标注 -->
          <template v-if="tris.length">
            <g v-for="(t, ti) in tris" :key="'t' + ti" :class="ti === 1 ? 'alt' : 'main'">
              <template v-for="(p, li) in [t.A, t.B, t.C]" :key="'v' + ti + li">
                <circle :cx="toSvg(p).x" :cy="toSvg(p).y" r="7" />
                <text class="lbl" :x="toSvg(p).x + (li === 0 ? -20 : li === 1 ? 12 : 8)" :y="toSvg(p).y + (li === 2 ? -12 : 18)">
                  {{ 'ABC'[li] }}<tspan v-if="ti === 1">″</tspan>
                </text>
              </template>
              <!-- 边长标注 -->
              <text class="side-lbl" :x="(toSvg(t.A).x + toSvg(t.B).x) / 2" :y="(toSvg(t.A).y + toSvg(t.B).y) / 2 + 20">c={{ fmt(t.c) }}</text>
              <text class="side-lbl" :x="(toSvg(t.B).x + toSvg(t.C).x) / 2 + 14" :y="(toSvg(t.B).y + toSvg(t.C).y) / 2">a={{ fmt(t.a) }}</text>
              <text class="side-lbl" :x="(toSvg(t.C).x + toSvg(t.A).x) / 2 - 14" :y="(toSvg(t.C).y + toSvg(t.A).y) / 2" text-anchor="end">b={{ fmt(t.b) }}</text>
            </g>
          </template>

          <!-- 无解提示 -->
          <text v-else class="no-sol" :x="VW / 2" :y="VH / 2">{{ solved.msg }}</text>

          <!-- 图例（SSA 两解时） -->
          <g v-if="tris.length === 2" class="legend">
            <rect x="20" y="20" width="220" height="56" rx="6" />
            <text x="34" y="42" fill="var(--bb-green)">■ 解 1（绿）</text>
            <text x="34" y="64" fill="var(--bb-red)">■ 解 2（红）：同条件、不同形状</text>
          </g>
        </svg>
      </div>

      <div class="lab-actions">
        <button v-for="(m, k) in MODES" :key="k" class="btn" :class="{ 'btn-primary': mode === k }" @click="pick(k)">{{ m.name }}</button>
        <span class="feedback no">{{ hint }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>给定条件</strong><span>{{ MODES[mode].name }}</span></div>
        <ParamSlider v-if="mode === 'sss'" v-model="sA" :min="3" :max="9" :step="0.5" label="边 a（BC）" unit="" @update:model-value="onSlider" />
        <ParamSlider v-if="mode === 'sss' || mode === 'sas' || mode === 'ssa'" v-model="sB" :min="2" :max="9" :step="0.5" :label="mode === 'ssa' ? '对边 b（∠B 对面）' : '边 b（CA）'" unit="" @update:model-value="onSlider" />
        <ParamSlider v-model="sC" :min="3" :max="9" :step="0.5" :label="mode === 'aaa' ? '底边 c（大小试手）' : '底边 c（AB）'" unit="" @update:model-value="onSlider" />
        <ParamSlider v-if="mode === 'sas' || mode === 'asa' || mode === 'aaa'" v-model="angA" :min="20" :max="140" :step="1" label="角 A（°）" unit="°" @update:model-value="onSlider" />
        <ParamSlider v-if="mode === 'asa' || mode === 'aaa' || mode === 'ssa'" v-model="angB" :min="20" :max="140" :step="1" label="角 B（°）" unit="°" @update:model-value="onSlider" />
      </div>

      <FormulaPanel :title="'判定 · ' + MODES[mode].name" :formula="formula" :rows="givenRows" :result="resultRows"
        :verify="['SSS / SAS / ASA / AAS 能判定全等', 'AAA 只能判定相似（大小可缩放）', 'SSA（边边角）可能出现两解，不能判定', '判定的是「形状 + 大小都相同」，缺一不可']" />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>八年级上册·全等三角形</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          全等 = 形状大小完全相同。判定方法本质是<b>「哪些条件能把三角形锁死」</b>：<br />
          · <b>SSS</b>：三边一锁，骨架无法变形（三角形的稳定性）。<br />
          · <b>SAS</b>：夹角必须正好「夹」在两边之间，位置放错就变成 SSA。<br />
          · <b>ASA / AAS</b>：两角定形状，一条边定大小。<br />
          · <b>AAA 与 SSA 是两大陷阱</b>：前者放大缩小都全等不了，后者一圆两交点、两解不重合。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.cg-panel { background: transparent; }
.cg-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto;
  max-height: 100%; /* 桌面端 .lab-left 行高固定：超高时等比缩小而非被裁切 */
  aspect-ratio: 900 / 520;
  touch-action: pan-y; user-select: none;
}
.grid line { stroke: var(--bb-grid); stroke-width: 1; }
.axis line { stroke: var(--bb-fg-dim); stroke-width: 1.4; opacity: 0.6; }
.tri-main { fill: rgba(20, 95, 210, 0.15); stroke: var(--bb-blue); stroke-width: 3; }
.tri-alt { fill: rgba(217, 33, 53, 0.12); stroke: var(--bb-red); stroke-width: 2.6; stroke-dasharray: 8 5; }
.main circle { fill: var(--bb-blue); stroke: var(--bb-fg); stroke-width: 2; }
.alt circle { fill: var(--bb-red); stroke: var(--bb-fg); stroke-width: 2; }
.main .lbl { fill: var(--bb-blue); }
.alt .lbl { fill: var(--bb-red); }
.lbl { font-size: 16px; font-weight: 800; font-family: var(--mono); pointer-events: none; }
.side-lbl { fill: var(--bb-fg-dim); font-size: 13px; font-family: var(--mono); pointer-events: none; }
.no-sol { fill: var(--bb-red); font-size: 18px; font-weight: 800; text-anchor: middle; }
.legend rect { fill: var(--bb-surface, rgba(255,255,255,0.85)); stroke: var(--bb-fg-dim); stroke-width: 1.5; }
.legend text { font-size: 14px; font-weight: 700; font-family: var(--mono); }
</style>
