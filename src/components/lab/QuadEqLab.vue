<script setup>
import { computed, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560，坐标系 x∈[-7,7]；方程 ax²+bx+c=0 ===== */
const VW = 900, VH = 560
const R = 7

const a = ref(1)
const b = ref(-3)
const c = ref(2)

let touched = false, done = false
function touch() {
  touched = true
  if (!done && Math.abs(a.value) >= 0.1) {
    done = true
    emit('complete')
  }
}

const f = (x) => a.value * x * x + b.value * x + c.value
const X = (x) => VW / 2 + (x / R) * (VW / 2 - 30)
const Y = (y) => VH / 2 - (y / R) * (VH / 2 - 30)

const gridX = []
for (let x = -R; x <= R; x++) gridX.push(x)
const gridY = []
for (let y = -R; y <= R; y++) gridY.push(y)
const ticksX = gridX.filter((x) => x !== 0)
const ticksY = gridY.filter((y) => y !== 0)

/* 抛物线路径 */
const path = computed(() => {
  let d = ''
  let pen = false
  for (let x = -R - 1; x <= R + 1; x += 0.04) {
    const y = f(x)
    if (y < -R - 0.4 || y > R + 0.4) { pen = false; continue }
    d += (pen ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1) + ' '
    pen = true
  }
  return d
})

/* ===== 方程与解 ===== */
const eq = computed(() => {
  const termA = Math.abs(a.value - 1) < 0.01 ? 'x²' : `${a.value}x²`
  return `${termA} ${b.value >= 0 ? '+' : '−'} ${Math.abs(b.value)}x ${c.value >= 0 ? '+' : '−'} ${Math.abs(c.value)} = 0`
})
const delta = computed(() => b.value * b.value - 4 * a.value * c.value)
const roots = computed(() => {
  if (Math.abs(a.value) < 0.1 || delta.value < 0) return []
  const s = Math.sqrt(delta.value)
  return [(-b.value - s) / (2 * a.value), (-b.value + s) / (2 * a.value)]
})
const kind = computed(() => {
  if (Math.abs(a.value) < 0.1) return 'linear'
  if (delta.value > 0.001) return 'two'
  if (delta.value > -0.001) return 'double'
  return 'none'
})

/* 黑板解题步骤（随系数实时更新） */
const steps = computed(() => {
  if (kind.value === 'linear') return ['⚠ a = 0：二次项消失，这是一元一次方程', '一次方程 bx + c = 0 的解是 x = −c/b']
  const l1 = `① 判别式　Δ = b² − 4ac = (${b.value})² − 4×${a.value}×${c.value} = ${delta.value}`
  const l2 = `② 判断　Δ ${delta.value > 0 ? '>' : delta.value < 0 ? '<' : '='} 0 → ${
    kind.value === 'two' ? '两个不相等的实根' : kind.value === 'double' ? '两个相等的实根（重根）' : '无实数根'
  }`
  const out = [l1, l2]
  if (kind.value !== 'none') {
    const s = Math.sqrt(delta.value)
    out.push(`③ 求根公式　x = (−b ± √Δ) / 2a = (${fmt(-b.value)} ± ${s.toFixed(2)}) / ${fmt(2 * a.value)}`)
    if (kind.value === 'two') {
      out.push(`④ 解得　x₁ = ${roots.value[0].toFixed(2)}，x₂ = ${roots.value[1].toFixed(2)}`)
      if (isIntRoot()) out.push(`⑤ 因式分解　${a.value === 1 ? '' : a.value}(x ${roots.value[0] >= 0 ? '−' : '+'} ${Math.abs(roots.value[0])})(x ${roots.value[1] >= 0 ? '−' : '+'} ${Math.abs(roots.value[1])}) = 0`)
    } else {
      out.push(`④ 解得　x₁ = x₂ = ${roots.value[0].toFixed(2)}（重根）`)
    }
  } else {
    out.push('③ √Δ 无意义 → 方程无实数根（抛物线与 x 轴没有交点）')
  }
  return out
})
function isIntRoot() {
  return roots.value.length === 2 && roots.value.every((r) => Math.abs(r - Math.round(r)) < 0.01)
}
const fmt = (n) => (Math.round(n * 100) / 100).toString()

const presets = [
  { label: 'x²−3x+2=0', a: 1, b: -3, c: 2 },
  { label: 'x²−4=0', a: 1, b: 0, c: -4 },
  { label: 'x²−2x+1=0', a: 1, b: -2, c: 1 },
  { label: 'x²+2x+3=0', a: 1, b: 2, c: 3 }
]
function applyPreset(p) { a.value = p.a; b.value = p.b; c.value = p.c; touch() }

const rows = computed(() => [
  { label: '方程', value: eq.value },
  { label: 'Δ = b² − 4ac', value: delta.value.toString() },
  { label: '根的情况', value: kind.value === 'two' ? '两个不相等实根' : kind.value === 'double' ? '两个相等实根（重根）' : kind.value === 'none' ? '无实数根' : 'a=0，非二次方程' },
  { label: '根 x₁ / x₂', value: roots.value.length ? roots.value.map((r) => r.toFixed(2)).join(' / ') : '—' },
  { label: '与图像的关系', value: '根 = 抛物线与 x 轴交点的横坐标' }
])
const results = computed(() => [
  { label: '几何视角', value: 'y = ax²+bx+c 与 x 轴的交点即方程的根' },
  { label: '韦达定理', value: roots.value.length === 2 ? `x₁+x₂ = ${(-b.value / a.value).toFixed(2)}，x₁·x₂ = ${(c.value / a.value).toFixed(2)}` : '—' }
])
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel qe-panel" style="padding: 0">
        <svg class="qe-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="一元二次方程：抛物线与 x 轴交点即方程的根">
          <!-- 网格与坐标轴 -->
          <g class="grid">
            <line v-for="x in gridX" :key="'gx'+x" :x1="X(x)" :y1="Y(-R)" :x2="X(x)" :y2="Y(R)" />
            <line v-for="y in gridY" :key="'gy'+y" :x1="X(-R)" :y1="Y(y)" :x2="X(R)" :y2="Y(y)" />
          </g>
          <g class="axis">
            <line :x1="X(-R)" :y1="Y(0)" :x2="X(R)" :y2="Y(0)" />
            <line :x1="X(0)" :y1="Y(-R)" :x2="X(0)" :y2="Y(R)" />
            <text v-for="x in ticksX" :key="'tx'+x" :x="X(x)" :y="Y(0)+16" text-anchor="middle">{{ x }}</text>
            <text v-for="y in ticksY" :key="'ty'+y" :x="X(0)-8" :y="Y(y)+4" text-anchor="end">{{ y }}</text>
          </g>

          <!-- 抛物线 -->
          <path class="curve" :d="path" />
          <!-- 根（与 x 轴交点） -->
          <g v-for="(r, i) in roots" :key="'r'+i" v-show="Math.abs(r) <= R">
            <circle class="root" :cx="X(r)" :cy="Y(0)" r="6" />
            <text class="root-t" :x="X(r)" :y="Y(0) - 14" text-anchor="middle">x{{ i === 0 ? '₁' : '₂' }} = {{ r.toFixed(2) }}</text>
          </g>

          <!-- 黑板解题区 -->
          <g class="work">
            <rect x="520" y="80" width="350" height="240" rx="10" />
            <text class="work-title" x="540" y="112">解方程　{{ eq }}</text>
            <text v-for="(l, i) in steps" :key="'s'+i" class="work-line" :x="540" :y="146 + i * 30">{{ l }}</text>
          </g>

          <text class="expr" x="40" y="42">{{ eq }}</text>
          <text class="hint" x="40" y="68">拖动系数：抛物线与 x 轴的交点就是方程的根</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button v-for="p in presets" :key="p.label" class="btn" @click="applyPreset(p)">{{ p.label }}</button>
        <span class="feedback no" v-if="Math.abs(a) < 0.1">a = 0 时不是二次方程！</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>系数</strong><span>实时联动</span></div>
        <div class="lab-params">
          <ParamSlider v-model="a" :min="-3" :max="3" :step="0.1" label="a（≠0）" @update:model-value="touch" />
          <ParamSlider v-model="b" :min="-6" :max="6" :step="0.5" label="b" @update:model-value="touch" />
          <ParamSlider v-model="c" :min="-6" :max="6" :step="0.5" label="c" @update:model-value="touch" />
        </div>
      </div>

      <FormulaPanel
        title="一元二次方程"
        formula="ax² + bx + c = 0（a≠0）　Δ = b² − 4ac"
        desc="四种解法：直接开平方、配方法、公式法（通用）、因式分解（十字相乘）。判别式 Δ 决定根的个数；根也是抛物线与 x 轴交点的横坐标——方程与函数在这里汇合。"
        :rows="rows"
        :result="results"
        :verify="[
          'Δ>0 ⇔ 两个不相等实根 ⇔ 抛物线与 x 轴两个交点',
          'Δ=0 ⇔ 重根 ⇔ 抛物线与 x 轴相切（顶点落在 x 轴上）',
          'Δ<0 ⇔ 无实根 ⇔ 抛物线与 x 轴无交点',
          '韦达定理：x₁+x₂ = −b/a，x₁·x₂ = c/a（不解方程也可求两根关系）'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>九年级上·一元二次方程</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          解法选择顺序：<b>开平方 → 因式分解 → 公式法</b>（万能）。<br />
          · 配方法是公式法的来源：(x+h)² = k 直接开平方。<br />
          · Δ 只判"有没有、有几个"，具体根还要代公式算。<br />
          · 应用题最后一步：检验根是否符合实际意义（舍去增根）。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.qe-panel { background: transparent; }
.qe-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.grid line { stroke: var(--bb-fg-dim); stroke-width: 0.6; opacity: 0.28; }
.axis line { stroke: var(--bb-fg); stroke-width: 2; }
.axis text { fill: var(--bb-fg-dim); font-size: 12px; font-family: var(--mono); }
.curve { fill: none; stroke: var(--bb-amber); stroke-width: 4; stroke-linecap: round; }
.root { fill: var(--bb-green); stroke: #fff; stroke-width: 2; }
.root-t { fill: var(--bb-green); font-size: 14px; font-weight: 800; font-family: var(--mono); }
.expr { fill: var(--bb-fg); font-size: 24px; font-weight: 900; font-family: var(--mono); }
.hint { fill: var(--bb-fg-dim); font-size: 14px; }
/* 黑板解题区 */
.work rect { fill: rgba(255, 255, 255, 0.55); stroke: var(--bb-fg-dim); stroke-width: 1.5; stroke-dasharray: 6 5; }
.work-title { fill: var(--bb-fg); font-size: 17px; font-weight: 900; font-family: var(--mono); }
.work-line { fill: var(--bb-fg); font-size: 14.5px; font-weight: 600; font-family: var(--mono); }
</style>
