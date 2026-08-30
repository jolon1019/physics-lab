<script setup>
import { computed, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560，坐标系 x∈[-8,8] y∈[-6,8] ===== */
const VW = 900, VH = 560
const XR = 8, YMIN = -6, YMAX = 8

const a = ref(1)
const b = ref(0)
const c = ref(0)

let touched = false, done = false
function touch() {
  touched = true
  if (!done && Math.abs(a.value) >= 0.05) {
    done = true
    emit('complete')
  }
}

const f = (x) => a.value * x * x + b.value * x + c.value

/* 数学坐标 → 画布坐标 */
const X = (x) => VW / 2 + (x / XR) * (VW / 2 - 30)
const Y = (y) => VH / 2 + 30 - ((y - (YMIN + YMAX) / 2) / ((YMAX - YMIN) / 2)) * (VH / 2 - 30)

/* 网格与刻度（排除 0，原点由坐标轴表达） */
const gridX = []
for (let x = -XR; x <= XR; x++) gridX.push(x)
const gridY = []
for (let y = YMIN; y <= YMAX; y++) gridY.push(y)
const ticksX = gridX.filter((x) => x !== 0)
const ticksY = gridY.filter((y) => y !== 0)

/* 抛物线路径：逐点采样，超出画布纵向范围时断开 */
const path = computed(() => {
  let d = ''
  let pen = false
  for (let x = -XR - 1; x <= XR + 1; x += 0.04) {
    const y = f(x)
    if (y < YMIN - 0.4 || y > YMAX + 0.4) { pen = false; continue }
    d += (pen ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1) + ' '
    pen = true
  }
  return d
})

/* 顶点 / 对称轴 / Δ / 零点 */
const vx = computed(() => (Math.abs(a.value) < 0.05 ? null : -b.value / (2 * a.value)))
const vy = computed(() => (vx.value === null ? null : f(vx.value)))
const delta = computed(() => b.value * b.value - 4 * a.value * c.value)
const roots = computed(() => {
  if (Math.abs(a.value) < 0.05 || delta.value < 0) return []
  const s = Math.sqrt(delta.value)
  return [(-b.value - s) / (2 * a.value), (-b.value + s) / (2 * a.value)]
    .filter((x) => x >= -XR && x <= XR)
})

const isOpenUp = computed(() => a.value > 0)
const dirText = computed(() => {
  if (Math.abs(a.value) < 0.05) return 'a≈0，不是二次函数'
  if (Math.abs(b.value) < 0.05) return ''
  return (Math.sign(a.value) === Math.sign(b.value))
    ? 'a、b 同号 → 对称轴在 y 轴左侧'
    : 'a、b 异号 → 对称轴在 y 轴右侧'
})

const presets = [
  { label: 'y = x²', a: 1, b: 0, c: 0 },
  { label: 'y = ½x²', a: 0.5, b: 0, c: 0 },
  { label: 'y = (x−2)² − 3', a: 1, b: -4, c: 1 },
  { label: 'y = −x² + 4', a: -1, b: 0, c: 4 }
]
function applyPreset(p) {
  a.value = p.a; b.value = p.b; c.value = p.c
  touch()
}

const rows = computed(() => [
  { label: 'a / b / c', value: `${a.value} / ${b.value} / ${c.value}` },
  { label: '开口方向', value: isOpenUp.value ? '向上' : '向下' },
  { label: '对称轴', value: vx.value === null ? '—' : `x = ${vx.value.toFixed(2)}` },
  { label: '顶点', value: vx.value === null ? '—' : `(${vx.value.toFixed(2)}, ${vy.value.toFixed(2)})` },
  { label: 'Δ = b² − 4ac', value: delta.value.toFixed(2) },
  { label: '与 y 轴交点', value: `(0, ${c.value})` }
])
const results = computed(() => {
  if (Math.abs(a.value) < 0.05) return [{ label: '警告', value: 'a = 0 时不是二次函数' }]
  const n = delta.value > 0.001 ? 2 : (delta.value > -0.001 ? 1 : 0)
  return [
    { label: '与 x 轴交点个数', value: `${n} 个（Δ ${delta.value > 0 ? '>' : delta.value < 0 ? '<' : '='} 0）` },
    { label: '交点横坐标', value: roots.value.length ? roots.value.map((x) => x.toFixed(2)).join(' , ') : '—' }
  ]
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel qd-panel" style="padding: 0">
        <svg class="qd-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="二次函数抛物线图像">
          <!-- 网格 -->
          <g class="grid">
            <line v-for="x in gridX" :key="'gx'+x" :x1="X(x)" :y1="Y(YMIN)" :x2="X(x)" :y2="Y(YMAX)" />
            <line v-for="y in gridY" :key="'gy'+y" :x1="X(-XR)" :y1="Y(y)" :x2="X(XR)" :y2="Y(y)" />
          </g>
          <!-- 坐标轴 -->
          <g class="axis">
            <line :x1="X(-XR)" :y1="Y(0)" :x2="X(XR)" :y2="Y(0)" />
            <line :x1="X(0)" :y1="Y(YMIN)" :x2="X(0)" :y2="Y(YMAX)" />
            <polygon :points="`${X(XR)+10},${Y(0)} ${X(XR)},${Y(0)-5} ${X(XR)},${Y(0)+5}`" />
            <polygon :points="`${X(0)},${Y(YMAX)-10} ${X(0)-5},${Y(YMAX)} ${X(0)+5},${Y(YMAX)}`" />
            <text v-for="x in ticksX" :key="'tx'+x" :x="X(x)" :y="Y(0)+16" text-anchor="middle">{{ x }}</text>
            <text v-for="y in ticksY" :key="'ty'+y" :x="X(0)-8" :y="Y(y)+4" text-anchor="end">{{ y }}</text>
            <text :x="X(XR)+8" :y="Y(0)+4">x</text>
            <text :x="X(0)-16" :y="Y(YMAX)+2">y</text>
          </g>

          <!-- 对称轴 -->
          <line v-if="vx !== null" class="sym" :x1="X(vx)" :y1="Y(YMIN)" :x2="X(vx)" :y2="Y(YMAX)" />
          <!-- 抛物线 -->
          <path class="curve" :d="path" />
          <!-- 顶点 -->
          <g v-if="vx !== null">
            <circle class="vertex" :cx="X(vx)" :cy="Y(vy)" r="6" />
            <text class="vtx" :x="X(vx) + 12" :y="Y(vy) - 10">顶点 ({{ vx.toFixed(2) }}, {{ vy.toFixed(2) }})</text>
          </g>
          <!-- 与 x 轴交点 -->
          <g v-for="(r, i) in roots" :key="'r'+i">
            <circle class="root" :cx="X(r)" :cy="Y(0)" r="5" />
          </g>

          <!-- 解析式与提示 -->
          <text class="expr" x="40" y="40">y = {{ a }}x² {{ b >= 0 ? '+' : '−' }} {{ Math.abs(b) }}x {{ c >= 0 ? '+' : '−' }} {{ Math.abs(c) }}</text>
          <text class="dir" x="40" y="64">{{ dirText || (isOpenUp ? '开口向上' : '开口向下') }}　　Δ = {{ delta.toFixed(2) }}</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button v-for="p in presets" :key="p.label" class="btn" @click="applyPreset(p)">{{ p.label }}</button>
        <FullscreenBtn />
        <span class="feedback no">{{ Math.abs(a) < 0.05 ? 'a 不能为 0！二次函数必须有二次项' : '拖动右侧滑块，观察开口、对称轴与顶点' }}</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>系数</strong><span>实时联动</span></div>
        <div class="lab-params">
          <ParamSlider v-model="a" :min="-3" :max="3" :step="0.1" label="a（开口）" @update:model-value="touch" />
          <ParamSlider v-model="b" :min="-6" :max="6" :step="0.5" label="b（对称轴）" @update:model-value="touch" />
          <ParamSlider v-model="c" :min="-6" :max="6" :step="0.5" label="c（y 轴交点）" @update:model-value="touch" />
        </div>
      </div>

      <FormulaPanel
        title="二次函数"
        formula="y = ax² + bx + c（a≠0）"
        desc="a 定开口与宽窄；b 与 a「左同右异」定对称轴；c 定与 y 轴交点。Δ = b²−4ac 定与 x 轴交点个数。"
        :rows="rows"
        :result="results"
        :verify="[
          '顶点式 y = a(x−h)² + k 的顶点就是 (h, k)',
          '对称轴 x = −b/2a：a、b 同号在左，异号在右（左同右异）',
          'Δ>0 两个零点，Δ=0 一个（顶点在 x 轴上），Δ<0 无零点',
          '上下平移改 c，左右平移换 x 为 (x−m)'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>九年级·二次函数</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          抛物线三要素：<b>开口、对称轴、顶点</b>。<br />
          · a>0 开口向上（有最低点），a<0 向下（有最高点）。<br />
          · 顶点式 y = a(x−h)²+k 直接读顶点；配方是通用武器。<br />
          · 与 x 轴交点即方程 ax²+bx+c=0 的根，联系 Δ。<br />
          · 平移口诀：<b>左加右减、上加下减</b>。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.qd-panel { background: transparent; }
.qd-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.grid line { stroke: var(--bb-fg-dim); stroke-width: 0.6; opacity: 0.28; }
.axis line { stroke: var(--bb-fg); stroke-width: 2; }
.axis polygon { fill: var(--bb-fg); }
.axis text { fill: var(--bb-fg-dim); font-size: 12px; font-family: var(--mono); }
.sym { stroke: var(--bb-purple); stroke-width: 1.8; stroke-dasharray: 8 6; opacity: 0.85; }
.curve { fill: none; stroke: var(--bb-amber); stroke-width: 4; stroke-linecap: round; }
.vertex { fill: var(--bb-red); stroke: #fff; stroke-width: 2; }
.root { fill: var(--bb-green); stroke: #fff; stroke-width: 2; }
.vtx { fill: var(--bb-red); font-size: 15px; font-weight: 800; font-family: var(--mono); }
.expr { fill: var(--bb-fg); font-size: 20px; font-weight: 900; font-family: var(--mono); }
.dir { fill: var(--bb-fg-dim); font-size: 14px; font-family: var(--mono); }
</style>
