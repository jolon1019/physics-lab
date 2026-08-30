<script setup>
import { computed, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'
import { svgPoint } from '../../lib/svgCoord'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560，坐标范围 x,y ∈ [-7,7] ===== */
const VW = 900, VH = 560
const R = 7

const k = ref(4)
// 点 P 沿曲线的参数 x（约定 |x| ≥ 0.6，避开渐近线；符号随分支）
const px = ref(2)

let touched = false, moved = false, done = false
function touch() { touched = true; check() }
function check() {
  if (!done && touched && moved) { done = true; emit('complete') }
}

const f = (x) => k.value / x
const X = (x) => VW / 2 + (x / R) * (VW / 2 - 30)
const Y = (y) => VH / 2 - (y / R) * (VH / 2 - 30)

const py = computed(() => f(px.value))

/* 双曲线路径：两分支采样，靠近渐近线截断 */
function branch(sign) {
  let d = ''
  let pen = false
  for (let i = 0; i <= 200; i++) {
    const x = sign * (0.25 + (i / 200) * (R + 1 - 0.25))
    const y = f(x)
    if (Math.abs(y) > R + 1) { pen = false; continue }
    d += (pen ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1) + ' '
    pen = true
  }
  return d
}
const pathPos = computed(() => branch(1))
const pathNeg = computed(() => branch(-1))

/* 矩形（P 向两轴作垂线）：从坐标原点 (X(0),Y(0)) 到 P */
const rectPts = computed(() =>
  `${X(0)},${Y(py.value)} ${X(px.value)},${Y(py.value)} ${X(px.value)},${Y(0)} ${X(0)},${Y(0)}`
)
/* 矩形中心（对角线中点）：原点画布坐标为 (VW/2, VH/2) */
const rectCenter = computed(() => ({
  x: (VW / 2 + X(px.value)) / 2,
  y: (VH / 2 + Y(py.value)) / 2
}))

const gridX = []
for (let x = -R; x <= R; x++) gridX.push(x)
const gridY = []
for (let y = -R; y <= R; y++) gridY.push(y)
const ticksX = gridX.filter((x) => x !== 0)
const ticksY = gridY.filter((y) => y !== 0)

/* 拖动点 P：按 x 方向映射，跳过渐近线附近 */
function dragP(e) {
  e.preventDefault()
  const svg = e.currentTarget.closest('svg')
  const move = (ev) => {
    const p = svgPoint(svg, ev.clientX, ev.clientY)
    let x = Math.max(-R, Math.min(R, p.x))
    if (Math.abs(x) < 0.8) x = x >= 0 ? 0.8 : -0.8
    x = Math.round(x * 20) / 20
    if (x !== px.value) { px.value = x; moved = true; check() }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

const quad = computed(() =>
  k.value > 0 ? '一、三象限（y 随 x 增大而减小）' : '二、四象限（y 随 x 增大而增大）'
)

const rows = computed(() => [
  { label: 'k', value: `${k.value}` },
  { label: '点 P', value: `(${px.value.toFixed(2)}, ${py.value.toFixed(2)})` },
  { label: 'xy 乘积', value: (px.value * py.value).toFixed(2) },
  { label: '矩形面积 |k|', value: `${Math.abs(k.value)}` },
  { label: '所在象限', value: quad.value }
])
const results = computed(() => [
  { label: '几何意义', value: `矩形面积 = |xy| = |${k.value}| = ${Math.abs(k.value)}（与 P 位置无关）` },
  { label: '验证', value: Math.abs(px.value * py.value - k.value) < 0.02 ? '任意位置拖动，面积恒定 ✓' : '继续拖动 P 验证' }
])
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel iv-panel" style="padding: 0">
        <svg class="iv-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="反比例函数 k 的几何意义">
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

          <!-- 矩形面积（P 向两轴作垂线） -->
          <polygon class="krect" :points="rectPts" />
          <text class="krect-t" :x="rectCenter.x" :y="rectCenter.y" text-anchor="middle">
            面积 = |{{ k }}| = {{ Math.abs(k) }}
          </text>

          <!-- 双曲线两分支 -->
          <path class="curve" :d="pathPos" />
          <path class="curve" :d="pathNeg" />

          <!-- 点 P -->
          <circle class="pnode" :cx="X(px)" :cy="Y(py)" r="9" @pointerdown.prevent="dragP" />
          <text class="plbl" :x="X(px) + 14" :y="Y(py) - 10">
            P({{ px.toFixed(1) }}, {{ py.toFixed(1) }})
          </text>

          <!-- 解析式 -->
          <text class="expr" x="40" y="42">y =</text>
          <text class="expr" x="86" y="26">{{ k }} </text>
          <line class="expr-line" x1="82" y1="34" x2="116" y2="34" />
          <text class="expr" x="86" y="56">x</text>
          <text class="hint" x="40" y="86">拖动红点 P：矩形面积始终不变</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" @click="k = 4; touch()">k = 4</button>
        <button class="btn" @click="k = -4; touch()">k = −4</button>
        <button class="btn" @click="k = 8; touch()">k = 8</button>
        <span class="feedback no">{{ k > 0 ? 'k>0：曲线在一、三象限' : 'k<0：曲线在二、四象限' }}；试试把 P 拖到不同位置</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>实时联动</span></div>
        <div class="lab-params">
          <ParamSlider v-model="k" :min="-8" :max="8" :step="0.5" label="k（≠0）" @update:model-value="touch" />
        </div>
      </div>

      <FormulaPanel
        title="反比例函数"
        formula="y = k/x（k≠0）　矩形面积 = |k|"
        desc="k>0 双曲线在一、三象限，每一象限内 y 随 x 增大而减小；k<0 在二、四象限，y 随 x 增大而增大。过曲线上任意点向两坐标轴作垂线，围成的矩形面积恒等于 |k|。"
        :rows="rows"
        :result="results"
        :verify="[
          '三点法画双曲线：列表、描点、连线（两支，不与坐标轴相交）',
          'k 的几何意义对曲线上「任意」一点都成立',
          'k>0 与 k<0 增减性相反，且必须限定在同一象限内比较',
          '|k| 越大曲线离原点越远'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>九年级·反比例函数</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          反比例函数的三种表达：<b>y=k/x、xy=k、y=kx⁻¹</b>（k≠0）。<br />
          · 图像是<b>双曲线</b>，两支渐近坐标轴但永不相交。<br />
          · k 的几何意义是高频考点：矩形面积、三角形面积（=|k|/2）。<br />
          · 与一次函数交点：联立方程，k 相同则交点关于原点对称。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.iv-panel { background: transparent; }
.iv-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.grid line { stroke: var(--bb-fg-dim); stroke-width: 0.6; opacity: 0.28; }
.axis line { stroke: var(--bb-fg); stroke-width: 2; }
.axis text { fill: var(--bb-fg-dim); font-size: 12px; font-family: var(--mono); }
.krect { fill: rgba(70, 232, 210, 0.20); stroke: var(--bb-blue); stroke-width: 2; stroke-dasharray: 7 5; }
.krect-t { fill: var(--bb-blue); font-size: 17px; font-weight: 900; font-family: var(--mono); }
.curve { fill: none; stroke: var(--bb-amber); stroke-width: 4; stroke-linecap: round; }
.pnode { fill: var(--bb-red); stroke: #fff; stroke-width: 2.5; cursor: grab; }
.plbl { fill: var(--bb-red); font-size: 16px; font-weight: 800; font-family: var(--mono); }
.expr { fill: var(--bb-fg); font-size: 26px; font-weight: 900; font-family: var(--mono); }
.expr-line { stroke: var(--bb-fg); stroke-width: 2.4; }
.hint { fill: var(--bb-fg-dim); font-size: 14px; }
</style>
