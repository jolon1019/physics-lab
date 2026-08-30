<script setup>
import { computed, ref } from 'vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'
import { svgPoint } from '../../lib/svgCoord'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×420，数轴 x∈[-8,8] ===== */
const VW = 900, VH = 420
const R = 8
const OX = VW / 2
const AXIS_Y = 210
const X = (x) => OX + x * 50
const invX = (sx) => (sx - OX) / 50

const a = ref(3)
const b = ref(-5)

let moved = false, done = false
function check() {
  if (!done && moved) { done = true; emit('complete') }
}

function onDown(which, e) {
  e.preventDefault()
  const svg = e.currentTarget.closest('svg')
  const move = (ev) => {
    const p = svgPoint(svg, ev.clientX, ev.clientY)
    let x = Math.max(-R, Math.min(R, Math.round(p.x)))
    if (which === 'a' && x !== a.value) { a.value = x; moved = true; check() }
    if (which === 'b' && x !== b.value) { b.value = x; moved = true; check() }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/* 距离弧（A 到原点，画在轴下方） */
const arcA = computed(() => {
  const x1 = X(0), x2 = X(a.value)
  const y = AXIS_Y + 34
  return `M ${x1} ${y} A ${Math.abs(x2 - x1) / 2} 22 0 0 ${a.value > 0 ? 0 : 1} ${x2} ${y}`
})
/* 相反数对称虚线（A 与 -A 连线） */
const oppLine = computed(() => ({ x1: X(a.value), y1: AXIS_Y - 44, x2: X(-a.value), y2: AXIS_Y - 44 }))

const cmp = computed(() => {
  if (a.value === b.value) return 'A 与 B 相等'
  const left = a.value < b.value ? 'A' : 'B'
  const right = a.value < b.value ? 'B' : 'A'
  return `${left} < ${right}（数轴上 ${left} 在 ${right} 左边）`
})

const ticks = []
for (let x = -R; x <= R; x++) ticks.push(x)

const rows = computed(() => [
  { label: '点 A', value: `${a.value}` },
  { label: 'A 的相反数 −A', value: `${-a.value}` },
  { label: 'A 的绝对值 |A|', value: `${Math.abs(a.value)}` },
  { label: '点 B', value: `${b.value}` },
  { label: '|B|', value: `${Math.abs(b.value)}` },
  { label: 'A、B 之间的距离', value: `${Math.abs(a.value - b.value)}` }
])
const results = computed(() => [
  { label: '大小比较', value: cmp.value },
  { label: '相反数验证', value: `A 与 −A 关于原点对称：${a.value} 与 ${-a.value}` },
  { label: '绝对值验证', value: `|${a.value}| = ${Math.abs(a.value)}（距离非负）` }
])
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel nl-panel" style="padding: 0">
        <svg class="nl-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="数轴：相反数与绝对值">
          <!-- 数轴 -->
          <line class="axis" :x1="X(-R) - 30" :y1="AXIS_Y" :x2="X(R) + 30" :y2="AXIS_Y" />
          <polygon class="axis" :points="`${X(R)+26},${AXIS_Y} ${X(R)+8},${AXIS_Y-6} ${X(R)+8},${AXIS_Y+6}`" />
          <g v-for="t in ticks" :key="'t'+t">
            <line class="tick" :x1="X(t)" :y1="AXIS_Y - 7" :x2="X(t)" :y2="AXIS_Y + 7" />
            <text class="tick-t" :x="X(t)" :y="AXIS_Y + 26" text-anchor="middle">{{ t }}</text>
          </g>
          <text class="tick-t" :x="X(0) - 12" :y="AXIS_Y + 26" font-weight="900">O</text>

          <!-- 绝对值距离弧（A 到原点） -->
          <path v-if="a !== 0" class="arc" :d="arcA" />
          <text v-if="a !== 0" class="arc-t" :x="(X(0) + X(a)) / 2" :y="AXIS_Y + 58" text-anchor="middle">|A| = {{ Math.abs(a) }}</text>

          <!-- 相反数对称虚线 -->
          <line v-if="a !== 0" class="opp" :x1="oppLine.x1" :y1="oppLine.y1" :x2="oppLine.x2" :y2="oppLine.y2" />
          <text v-if="a !== 0" class="opp-t" :x="X(0)" :y="AXIS_Y - 54" text-anchor="middle">−A 与 A 关于原点对称</text>

          <!-- 点 B -->
          <g class="pt pt-b" @pointerdown.prevent="onDown('b', $event)">
            <circle :cx="X(b)" :cy="AXIS_Y" r="12" />
            <text :x="X(b)" :y="AXIS_Y + 4" text-anchor="middle">B</text>
          </g>
          <!-- 点 A（画在最上层） -->
          <g class="pt pt-a" @pointerdown.prevent="onDown('a', $event)">
            <circle :cx="X(a)" :cy="AXIS_Y" r="13" />
            <text :x="X(a)" :y="AXIS_Y + 4" text-anchor="middle">A</text>
          </g>

          <!-- 说明 -->
          <text class="hint" x="40" y="42">拖动 A、B 两点（左右拖）· 蓝点是 A 的相反数 · 红弧是 |A|</text>
          <text class="big" x="40" y="356">{{ cmp }}</text>
          <text class="big dim" x="40" y="386">a = {{ a }}　−a = {{ -a }}　|a| = {{ Math.abs(a) }}　|b| = {{ Math.abs(b) }}</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" @click="a = 3; b = -5; moved = true; check()">复位</button>
        <button class="btn" @click="a = 0; moved = true; check()">A 移到原点</button>
        <button class="btn" @click="a = -a; moved = true; check()">A 取相反数</button>
        <span class="feedback no">试试把 A 拖到负数区，|A| 依然非负</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实时数据</strong><span>拖动联动</span></div>
        <div class="lab-readout">
          <div class="lab-stat"><span>点 A / 相反数</span><strong>{{ a }} / {{ -a }}</strong></div>
          <div class="lab-stat accent"><span>|A|（到原点距离）</span><strong>{{ Math.abs(a) }}</strong></div>
          <div class="lab-stat success"><span>点 B / |B|</span><strong>{{ b }} / {{ Math.abs(b) }}</strong></div>
        </div>
      </div>

      <FormulaPanel
        title="数轴与绝对值"
        formula="|a| = 点 A 到原点的距离 ≥ 0"
        desc="数轴三要素：原点、正方向、单位长度。相反数在数轴上关于原点对称；绝对值就是到原点的距离。数轴上右边的数总比左边的大。"
        :rows="rows"
        :result="results"
        :verify="[
          '相反数：−a 与 a 到原点距离相等、分居两侧',
          '绝对值非负：|a| ≥ 0，只有 |0| = 0',
          '两点距离 = 右边的数 − 左边的数 = |a − b|',
          '负数比较大小：绝对值大的反而小（如 −5 < −3）'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>七年级·有理数</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          数轴把<b>数与形</b>第一次联系起来：<br />
          · 相反数是"对折"关系，绝对值是"距离"关系。<br />
          · 有理数比较大小统一到数轴上的左右位置。<br />
          · 后续很多几何问题（距离、对称）都从这里起步。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.nl-panel { background: transparent; }
.nl-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 420;
  touch-action: pan-y; user-select: none;
}
.axis { fill: var(--bb-fg); stroke: var(--bb-fg); stroke-width: 2.5; }
.tick { stroke: var(--bb-fg); stroke-width: 2; }
.tick-t { fill: var(--bb-fg-dim); font-size: 13px; font-family: var(--mono); }
.arc { fill: none; stroke: var(--bb-red); stroke-width: 2.6; }
.arc-t { fill: var(--bb-red); font-size: 15px; font-weight: 800; font-family: var(--mono); }
.opp { stroke: var(--bb-blue); stroke-width: 1.8; stroke-dasharray: 7 5; }
.opp-t { fill: var(--bb-blue); font-size: 14px; font-weight: 700; }
.pt { cursor: grab; }
.pt circle { stroke: #fff; stroke-width: 2.5; }
.pt-a circle { fill: var(--bb-amber); }
.pt-b circle { fill: var(--bb-green); }
.pt text { fill: #fff; font-size: 12px; font-weight: 900; pointer-events: none; font-family: var(--mono); }
.hint { fill: var(--bb-fg-dim); font-size: 14px; }
.big { fill: var(--bb-fg); font-size: 20px; font-weight: 900; font-family: var(--mono); }
.dim { fill: var(--bb-fg-dim); font-size: 16px; font-weight: 700; }
</style>
