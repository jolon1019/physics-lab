<script setup>
import { computed, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560，坐标范围 x,y ∈ [-7,7] ===== */
const VW = 900, VH = 560
const R = 7

const k = ref(1)
const b = ref(2)

let touched = false, done = false
function touch() {
  touched = true
  if (!done && Math.abs(k.value) >= 0.1) {
    done = true
    emit('complete')
  }
}

const f = (x) => k.value * x + b.value
const X = (x) => VW / 2 + (x / R) * (VW / 2 - 30)
const Y = (y) => VH / 2 - (y / R) * (VH / 2 - 30)

const gridX = []
for (let x = -R; x <= R; x++) gridX.push(x)
const gridY = []
for (let y = -R; y <= R; y++) gridY.push(y)
const ticksX = gridX.filter((x) => x !== 0)
const ticksY = gridY.filter((y) => y !== 0)

/* 直线路径：与画布边界求交 */
const path = computed(() => {
  const pts = []
  for (const x of [-R - 1, R + 1]) {
    const y = f(x)
    if (y >= -R - 1 && y <= R + 1) pts.push([x, y])
  }
  if (pts.length < 2 && k.value !== 0) {
    // 用上下边界 y=±(R+1) 反解 x
    for (const y of [-R - 1, R + 1]) {
      const x = (y - b.value) / k.value
      if (x >= -R - 1 && x <= R + 1) pts.push([x, y])
    }
  }
  if (pts.length < 2) return ''
  const [p, q] = pts
  return `M ${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)} L ${X(q[0]).toFixed(1)} ${Y(q[1]).toFixed(1)}`
})

/* 交点 */
const yInt = computed(() => ({ x: 0, y: b.value }))
const xInt = computed(() => (Math.abs(k.value) < 0.1 ? null : { x: -b.value / k.value, y: 0 }))

const presets = [
  { label: 'y = x', k: 1, b: 0 },
  { label: 'y = 2x + 1', k: 2, b: 1 },
  { label: 'y = −x + 3', k: -1, b: 3 },
  { label: 'y = ½x − 2', k: 0.5, b: -2 }
]
function applyPreset(p) { k.value = p.k; b.value = p.b; touch() }

const trend = computed(() => (k.value > 0 ? 'y 随 x 增大而增大（上升）' : k.value < 0 ? 'y 随 x 增大而减小（下降）' : 'k=0：水平线（非常函数）'))

const rows = computed(() => [
  { label: '解析式', value: `y = ${k.value}x ${b.value >= 0 ? '+' : '−'} ${Math.abs(b.value)}` },
  { label: 'k（斜率）', value: `${k.value}（|k| 越大越陡）` },
  { label: '增减性', value: trend.value },
  { label: '与 y 轴交点', value: `(0, ${b.value})` },
  { label: '与 x 轴交点', value: xInt.value ? `(${xInt.value.x.toFixed(2)}, 0)` : '无（水平线）' }
])
const results = computed(() => [
  { label: 'k 定方向', value: k.value > 0 ? 'k>0：上升，经过一、三方向' : k.value < 0 ? 'k<0：下降' : 'k=0：水平线' },
  { label: 'b 定交点', value: `与 y 轴交于 (0, ${b.value})，b=0 时过原点（正比例函数）` }
])
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel lf-panel" style="padding: 0">
        <svg class="lf-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="一次函数直线">
          <!-- 网格 -->
          <g class="grid">
            <line v-for="x in gridX" :key="'gx'+x" :x1="X(x)" :y1="Y(-R)" :x2="X(x)" :y2="Y(R)" />
            <line v-for="y in gridY" :key="'gy'+y" :x1="X(-R)" :y1="Y(y)" :x2="X(R)" :y2="Y(y)" />
          </g>
          <!-- 坐标轴 -->
          <g class="axis">
            <line :x1="X(-R)" :y1="Y(0)" :x2="X(R)" :y2="Y(0)" />
            <line :x1="X(0)" :y1="Y(-R)" :x2="X(0)" :y2="Y(R)" />
            <text v-for="x in ticksX" :key="'tx'+x" :x="X(x)" :y="Y(0)+16" text-anchor="middle">{{ x }}</text>
            <text v-for="y in ticksY" :key="'ty'+y" :x="X(0)-8" :y="Y(y)+4" text-anchor="end">{{ y }}</text>
          </g>

          <!-- 直线 -->
          <line v-if="Math.abs(k) < 0.1" class="flat" :x1="X(-R)" :y1="Y(b)" :x2="X(R)" :y2="Y(b)" />
          <path v-else class="line" :d="path" />

          <!-- 交点 -->
          <g>
            <circle class="pt-b" :cx="X(0)" :cy="Y(yInt.y)" r="6" />
            <text class="pt-t tb" :x="X(0) + 10" :y="Y(yInt.y) - 10">(0, {{ b }})</text>
            <g v-if="xInt && Math.abs(xInt.x) <= R">
              <circle class="pt-x" :cx="X(xInt.x)" :cy="Y(0)" r="6" />
              <text class="pt-t tx" :x="X(xInt.x)" :y="Y(0) + 26" text-anchor="middle">({{ xInt.x.toFixed(2) }}, 0)</text>
            </g>
          </g>

          <!-- 解析式 -->
          <text class="expr" x="40" y="42">y = {{ k }}x {{ b >= 0 ? '+' : '−' }} {{ Math.abs(b) }}</text>
          <text class="hint" x="40" y="68">{{ trend }}</text>
          <text class="hint" x="40" y="90">y 轴交点 (0, {{ b }}){{ Math.abs(b) < 0.01 ? ' → 过原点，是正比例函数' : '' }}</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button v-for="p in presets" :key="p.label" class="btn" @click="applyPreset(p)">{{ p.label }}</button>
        <span class="feedback no" v-if="Math.abs(k) < 0.1">k 不能为 0！k=0 时是常函数不是一次函数</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>系数</strong><span>实时联动</span></div>
        <div class="lab-params">
          <ParamSlider v-model="k" :min="-4" :max="4" :step="0.1" label="k（方向 / 陡峭）" @update:model-value="touch" />
          <ParamSlider v-model="b" :min="-6" :max="6" :step="0.5" label="b（y 轴交点）" @update:model-value="touch" />
        </div>
      </div>

      <FormulaPanel
        title="一次函数"
        formula="y = kx + b（k≠0）"
        desc="k>0 上升，y 随 x 增大而增大；k<0 下降。|k| 越大越陡。b 是与 y 轴交点的纵坐标。b=0 时为正比例函数，图像过原点。两条直线 k 相同则平行。"
        :rows="rows"
        :result="results"
        :verify="[
          '平移：b>0 由 y=kx 向上平移 |b| 个单位；b<0 向下',
          '增减性只看 k 的符号，与 b 无关',
          '求交点：与 x 轴令 y=0，与 y 轴令 x=0',
          '两直线交点：联立方程组求解'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>八年级下·一次函数</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          一次函数是<b>匀速变化的数学模型</b>（与物理的匀速直线运动同构）。<br />
          · 待定系数法：两点定一条直线，代入求 k、b。<br />
          · 应用：行程、收费、方案比较 —— 看交点找"更划算"的分界。<br />
          · 一次函数与一元一次方程、不等式息息相关。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.lf-panel { background: transparent; }
.lf-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.grid line { stroke: var(--bb-fg-dim); stroke-width: 0.6; opacity: 0.28; }
.axis line { stroke: var(--bb-fg); stroke-width: 2; }
.axis text { fill: var(--bb-fg-dim); font-size: 12px; font-family: var(--mono); }
.line { fill: none; stroke: var(--bb-amber); stroke-width: 4; stroke-linecap: round; }
.flat { fill: none; stroke: var(--bb-amber); stroke-width: 4; }
.pt-b { fill: var(--bb-green); stroke: #fff; stroke-width: 2; }
.pt-x { fill: var(--bb-blue); stroke: #fff; stroke-width: 2; }
.pt-t { font-size: 15px; font-weight: 800; font-family: var(--mono); }
.tb { fill: var(--bb-green); }
.tx { fill: var(--bb-blue); }
.expr { fill: var(--bb-fg); font-size: 24px; font-weight: 900; font-family: var(--mono); }
.hint { fill: var(--bb-fg-dim); font-size: 14px; }
</style>
