<script setup>
import { computed, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560。数据集 → 三种统计图 ===== */
const VW = 900, VH = 560

const DATASETS = [
  { name: '本周每日阅读（分钟）', unit: '分钟', cats: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'], values: [25, 40, 30, 45, 35, 80, 65] },
  { name: '班级最喜欢的科目（人数）', unit: '人', cats: ['数学', '物理', '语文', '英语', '体育'], values: [14, 11, 8, 6, 9] },
  { name: '六月份气温（℃）抽样', unit: '℃', cats: ['1日', '5日', '10日', '15日', '20日', '25日', '30日'], values: [26, 28, 31, 33, 30, 27, 29] }
]
const dsIdx = ref(0)
const chart = ref('bar') // bar | line | pie
let seen = {}
let done = false

function setChart(c) {
  seen[c] = true
  chart.value = c
  if (!done && seen.bar && seen.line && seen.pie) {
    done = true
    emit('complete')
  }
}
function nextData() {
  dsIdx.value = (dsIdx.value + 1) % DATASETS.length
}
const ds = computed(() => DATASETS[dsIdx.value])
const total = computed(() => ds.value.values.reduce((s, v) => s + v, 0))

/* ===== 条形/折线：自适应宽度 + 整数刻度 ===== */
const padL = 70, padB = 60, padT = 70
const plotH = VH - padT - padB
const plotW = VW - padL - 40
function niceStep(x) {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1))))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= x) return m * pow
  return 10 * pow
}
const rawMax = computed(() => Math.max(...ds.value.values))
const step = computed(() => niceStep(rawMax.value / 4))
const maxV = computed(() => Math.ceil((rawMax.value * 1.05) / step.value) * step.value)
const yTicks = computed(() => {
  const t = []
  for (let v = 0; v <= maxV.value + 0.001; v += step.value) t.push(v)
  return t
})
const barW = computed(() => Math.min(52, (plotW / ds.value.values.length) * 0.55))
const bx = (i, n) => padL + (plotW / n) * (i + 0.5)
const by = (v) => padT + plotH - (v / maxV.value) * plotH

/* ===== 扇形 ===== */
const cx0 = VW / 2, cy0 = padT + plotH / 2 + 10, r0 = 150
let acc = 0
const slices = computed(() => {
  acc = -90 // 从 12 点方向开始
  return ds.value.values.map((v, i) => {
    const frac = v / total.value
    const a1 = acc
    const a2 = acc + frac * 360
    acc = a2
    return { i, frac, a1, a2, mid: (a1 + a2) / 2 }
  })
})
function arcPt(r, deg) {
  const s = (deg * Math.PI) / 180
  return { x: cx0 + r * Math.cos(s), y: cy0 + r * Math.sin(s) }
}
function slicePath(s) {
  const large = s.a2 - s.a1 > 180 ? 1 : 0
  const p1 = arcPt(r0, s.a1)
  const p2 = arcPt(r0, s.a2)
  return `M ${cx0} ${cy0} L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${r0} ${r0} 0 ${large} 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} Z`
}
const sliceColors = ['#46a8e8', '#46e8d2', '#f0b429', '#e86a5f', '#9b6ef0', '#5fc86a', '#e89746']

const rows = computed(() => [
  { label: '数据集', value: ds.value.name },
  { label: '总量', value: `${total.value} ${ds.value.unit}` },
  { label: '最大项', value: `${ds.value.cats[ds.value.values.indexOf(Math.max(...ds.value.values))]} = ${Math.max(...ds.value.values)}` },
  { label: '最小项', value: `${ds.value.cats[ds.value.values.indexOf(Math.min(...ds.value.values))]} = ${Math.min(...ds.value.values)}` },
  ...ds.value.values.map((v, i) => ({
    label: `${ds.value.cats[i]} 占比`,
    value: `${v}（${((v / total.value) * 100).toFixed(1)}%，圆心角 ${((v / total.value) * 360).toFixed(0)}°）`
  }))
])
const results = computed(() => [
  { label: '条形图', value: '比多少 —— 谁最大谁最小一目了然' },
  { label: '折线图', value: '看趋势 —— 随时间升还是降' },
  { label: '扇形图', value: '看占比 —— 部分占整体的百分比（和为 100%）' }
])
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel dc-panel" style="padding: 0">
        <svg class="dc-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="三种统计图">
          <text class="title" x="40" y="40">{{ ds.name }}</text>
          <text class="subtitle" x="40" y="62">当前图型：{{ chart === 'bar' ? '条形图' : chart === 'line' ? '折线图' : '扇形图' }}　总量 = {{ total }} {{ ds.unit }}</text>

          <!-- ===== 条形图 / 折线图 ===== -->
          <g v-if="chart !== 'pie'">
            <!-- 坐标轴 -->
            <line class="axis" :x1="padL" :y1="padT + plotH" :x2="padL + plotW + 20" :y2="padT + plotH" />
            <line class="axis" :x1="padL" :y1="padT" :x2="padL" :y2="padT + plotH" />
            <text class="axis-t" :x="padL - 10" :y="padT - 8" text-anchor="end">{{ ds.unit }}</text>
            <!-- 刻度 -->
            <g v-for="(v, gi) in yTicks" :key="'g'+gi">
              <line class="gline" :x1="padL" :y1="by(v)" :x2="padL + plotW" :y2="by(v)" />
              <text class="axis-t" :x="padL - 8" :y="by(v) + 4" text-anchor="end">{{ v }}</text>
            </g>
            <!-- 条形 -->
            <g v-if="chart === 'bar'">
              <rect v-for="(v, i) in ds.values" :key="'b'+i" class="bar"
                :x="bx(i, ds.values.length) - barW / 2" :y="by(v)" :width="barW" :height="padT + plotH - by(v)" rx="5" />
              <text v-for="(v, i) in ds.values" :key="'bv'+i" class="val"
                :x="bx(i, ds.values.length)" :y="by(v) - 8" text-anchor="middle">{{ v }}</text>
            </g>
            <!-- 折线 -->
            <g v-else>
              <polyline class="linepath" :points="ds.values.map((v, i) => `${bx(i, ds.values.length)},${by(v)}`).join(' ')" />
              <circle v-for="(v, i) in ds.values" :key="'lp'+i" class="dot" :cx="bx(i, ds.values.length)" :cy="by(v)" r="6" />
              <text v-for="(v, i) in ds.values" :key="'lv'+i" class="val"
                :x="bx(i, ds.values.length)" :y="by(v) - 12" text-anchor="middle">{{ v }}</text>
            </g>
            <!-- 类目 -->
            <text v-for="(cat, i) in ds.cats" :key="'c'+i" class="cat"
              :x="bx(i, ds.values.length)" :y="padT + plotH + 22" text-anchor="middle">{{ cat }}</text>
          </g>

          <!-- ===== 扇形图 ===== -->
          <g v-else>
            <path v-for="(s, i) in slices" :key="'s'+i" class="slice"
              :d="slicePath(s)" :fill="sliceColors[i % sliceColors.length]" />
            <text v-for="(s, i) in slices" :key="'st'+i" class="slice-t"
              :x="arcPt(r0 * 0.66, s.mid).x" :y="arcPt(r0 * 0.66, s.mid).y + 4" text-anchor="middle">
              {{ ds.cats[i] }} {{ ((s.frac) * 100).toFixed(0) }}%
            </text>
            <text class="pie-note" :x="cx0" :y="cy0 + r0 + 40" text-anchor="middle">圆心角 = 占比 × 360°，各部分占比之和 = 100%</text>
          </g>

          <!-- 图例提示 -->
          <text class="hint" x="40" :y="VH - 14">同一组数据，三种表达：条形比多少 · 折线看趋势 · 扇形看占比</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': chart === 'bar' }" @click="setChart('bar')">条形图</button>
        <button class="btn" :class="{ 'btn-primary': chart === 'line' }" @click="setChart('line')">折线图</button>
        <button class="btn" :class="{ 'btn-primary': chart === 'pie' }" @click="setChart('pie')">扇形图</button>
        <button class="btn" @click="nextData()">换一组数据</button>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实时数据</strong><span>自动统计</span></div>
        <div class="lab-readout">
          <div class="lab-stat"><span>数据总量</span><strong>{{ total }} {{ ds.unit }}</strong></div>
          <div class="lab-stat accent"><span>最大项</span><strong style="font-size:13px">{{ ds.cats[ds.values.indexOf(Math.max(...ds.values))] }} = {{ Math.max(...ds.values) }}</strong></div>
          <div class="lab-stat success"><span>最大项占比</span><strong>{{ ((Math.max(...ds.values) / total) * 100).toFixed(1) }}%</strong></div>
        </div>
      </div>

      <FormulaPanel
        title="统计图的选择"
        formula="扇形圆心角 = 占比 × 360°"
        desc="条形图便于比较数量多少；折线图反映随时间的变化趋势；扇形图反映部分占整体的百分比。收集（划记）→ 整理（列表）→ 描述（选图）→ 分析（读结论）是数据处理的全流程。"
        :rows="rows"
        :result="results"
        :verify="[
          '各部分占比之和必须为 100%（扇形图中所有圆心角之和为 360°）',
          '条形图纵轴应从 0 开始，否则会夸大差异',
          '折线图的点 = 每个时刻的数据，连线只为看趋势',
          '频数 = 落在某组的数据个数，频率 = 频数 ÷ 总数'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>七年级·数据的收集与描述</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          全面调查 = <b>普查</b>（精确但费时），抽样调查（用样本估计总体）。<br />
          · 选图口诀：<b>比较多少条形，变化趋势折线，占比构成扇形</b>。<br />
          · 看到统计图先看坐标轴起点与单位，警惕"忽悠图"。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.dc-panel { background: transparent; }
.dc-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.title { fill: var(--bb-fg); font-size: 22px; font-weight: 900; }
.subtitle { fill: var(--bb-fg-dim); font-size: 14px; }
.axis { stroke: var(--bb-fg); stroke-width: 2; }
.axis-t { fill: var(--bb-fg-dim); font-size: 12px; font-family: var(--mono); }
.gline { stroke: var(--bb-fg-dim); stroke-width: 0.6; opacity: 0.3; }
.bar { fill: rgba(70, 168, 232, 0.55); stroke: var(--bb-blue); stroke-width: 2; }
.linepath { fill: none; stroke: var(--bb-amber); stroke-width: 3.5; stroke-linejoin: round; }
.dot { fill: var(--bb-amber); stroke: #fff; stroke-width: 1.5; }
.val { fill: var(--bb-fg); font-size: 14px; font-weight: 800; font-family: var(--mono); }
.cat { fill: var(--bb-fg); font-size: 14px; font-weight: 700; }
.slice { stroke: rgba(10, 14, 24, 0.4); stroke-width: 1.5; }
.slice-t { fill: #0a1420; font-size: 13px; font-weight: 900; }
.pie-note { fill: var(--bb-fg-dim); font-size: 14px; }
.hint { fill: var(--bb-fg-dim); font-size: 14px; }
</style>
