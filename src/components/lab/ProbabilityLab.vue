<script setup>
import { computed, ref } from 'vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560；模式：coin 硬币 / dice 骰子 ===== */
const VW = 900, VH = 560

const mode = ref('coin')
const total = ref(0)
const counts = ref([]) // 硬币 [正面,反面]；骰子 [1..6]
let freqHist = []      // 累计频率历史（研究正面 / 点数≤3 之外统一研究「事件A」）

const theoryP = computed(() => (mode.value === 'coin' ? 0.5 : 1 / 3)) // 事件A（正面 / 点数≥5）的理论概率
const theoryTxt = computed(() => (mode.value === 'coin' ? '0.5' : '1/3 ≈ 0.333'))
const outcomes = computed(() => (mode.value === 'coin' ? ['正面', '反面'] : ['1点', '2点', '3点', '4点', '5点', '6点']))
// 事件 A：硬币正面 / 骰子 ≥5 点
const eventIdx = computed(() => (mode.value === 'coin' ? 0 : [4, 5]))
const eventCount = computed(() =>
  mode.value === 'coin' ? counts.value[0] || 0 : (counts.value[4] || 0) + (counts.value[5] || 0)
)
const eventLabel = computed(() => (mode.value === 'coin' ? '正面朝上' : '点数 ≥ 5'))

let done = false

function reset() {
  total.value = 0
  counts.value = mode.value === 'coin' ? [0, 0] : [0, 0, 0, 0, 0, 0]
  freqHist = []
}
reset()

function setMode(m) {
  if (mode.value === m) return
  mode.value = m
  reset()
}

function rollOnce() {
  if (mode.value === 'coin') {
    counts.value[Math.random() < 0.5 ? 0 : 1]++
  } else {
    counts.value[Math.floor(Math.random() * 6)]++
  }
  total.value++
}

function flip(n) {
  for (let i = 0; i < n; i++) rollOnce()
  // 频率历史：记录本次批后的累计频率（限流采样）
  freqHist.push({ n: total.value, f: eventCount.value / total.value })
  if (freqHist.length > 60) freqHist = freqHist.filter((_, i) => i % 2 === 0)
  if (!done && total.value >= 300) {
    done = true
    emit('complete')
  }
}

/* ===== 柱状图（频率）===== */
const bars = computed(() => {
  const n = outcomes.value.length
  const padL = 70, padB = 40, padT = 24
  const w = VW - padL - 30, h = VH - padB - padT
  return counts.value.map((cnt, i) => {
    const f = total.value ? cnt / total.value : 0
    const bw = (w / n) * 0.6
    const x = padL + (w / n) * (i + 0.5) - bw / 2
    const bh = f * h
    return {
      x, y: padT + h - bh, w: bw, h: bh, f, cnt,
      cx: padL + (w / n) * (i + 0.5),
      label: outcomes.value[i]
    }
  })
})
const barBaseY = VH - 40
const theoryY = computed(() => barBaseY - theoryP.value * (VH - 40 - 24))

/* ===== 频率折线（事件 A）===== */
const linePts = computed(() => {
  const padL = 70, padT = 24
  const w = VW - padL - 30, h = VH - 40 - padT
  const maxN = Math.max(total.value, 1)
  return freqHist.map((p) => ({
    x: padL + (p.n / maxN) * w,
    y: barBaseY - p.f * (VH - 40 - padT)
  }))
})

const rows = computed(() => [
  { label: '试验总次数', value: `${total.value}` },
  { label: `事件「${eventLabel.value}」频数`, value: `${eventCount.value}` },
  { label: '事件频率', value: total.value ? (eventCount.value / total.value).toFixed(4) : '—' },
  { label: `理论概率（事件「${eventLabel.value}」）`, value: theoryTxt.value },
  ...bars.value.map((b, i) => ({ label: `${outcomes.value[i]} 频率`, value: total.value ? b.f.toFixed(4) : '0' }))
])
const results = computed(() => {
  if (!total.value) return [{ label: '提示', value: '先抛几次再观察' }]
  const f = eventCount.value / total.value
  const dev = Math.abs(f - theoryP.value)
  return [
    { label: '频率 vs 概率偏差', value: dev.toFixed(4) },
    { label: '结论', value: dev < 0.02 ? '频率已非常接近理论概率 ✓' : '次数越多，偏差越小' }
  ]
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel pb-panel" style="padding: 0">
        <svg class="pb-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="用频率估计概率：频率柱状图与频率折线">
          <!-- 坐标轴 -->
          <line class="axis" x1="70" :y1="barBaseY" :x2="VW - 30" :y2="barBaseY" />
          <line class="axis" x1="70" y1="24" x2="70" :y2="barBaseY" />
          <!-- 理论概率虚线 -->
          <line class="theory" x1="70" :y1="theoryY" :x2="VW - 30" :y2="theoryY" />
          <text class="theory-t" x="VW - 34" :y="theoryY - 6" text-anchor="end">「{{ eventLabel }}」理论概率 {{ theoryTxt }}</text>

          <!-- 柱 -->
          <g v-for="(b, i) in bars" :key="i">
            <rect class="bar" :x="b.x" :y="b.y" :width="b.w" :height="Math.max(b.h, 0)" rx="4" />
            <text class="bar-v" :x="b.cx" :y="b.y - 8" text-anchor="middle">{{ total ? (b.f * 100).toFixed(1) + '%' : '' }}</text>
            <text class="bar-l" :x="b.cx" :y="barBaseY + 22" text-anchor="middle">{{ b.label }}</text>
            <text class="bar-c" :x="b.cx" :y="barBaseY + 40" text-anchor="middle">{{ b.cnt }} 次</text>
          </g>

          <!-- 频率折线（事件 A） -->
          <polyline v-if="linePts.length > 1" class="freq-line" :points="linePts.map((p) => `${p.x},${p.y}`).join(' ')" />
          <circle v-for="(p, i) in linePts" :key="'p'+i" class="freq-dot" :cx="p.x" :cy="p.y" r="3.5" />
          <text v-if="linePts.length" class="freq-lbl" x="76" y="40">「{{ eventLabel }}」频率折线</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': mode === 'coin' }" @click="setMode('coin')">抛硬币</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'dice' }" @click="setMode('dice')">掷骰子</button>
        <button class="btn btn-primary" @click="flip(1)">抛 1 次</button>
        <button class="btn btn-primary" @click="flip(100)">抛 100 次</button>
        <button class="btn btn-primary" @click="flip(1000)">抛 1000 次</button>
        <button class="btn" @click="reset(); done = false">重置</button>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实时数据</strong><span>自动记录</span></div>
        <div class="lab-readout">
          <div class="lab-stat"><span>试验总次数</span><strong>{{ total }}</strong></div>
          <div class="lab-stat accent">
            <span>「{{ eventLabel }}」频率</span>
            <strong>{{ total ? (eventCount / total).toFixed(4) : '—' }}</strong>
          </div>
          <div class="lab-stat success">
            <span>理论概率</span>
            <strong>{{ mode === 'coin' ? '1/2 = 0.5' : 'P(≥5) = 1/3 ≈ 0.333' }}</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="用频率估计概率"
        formula="频率 = 频数 / 总次数 → 稳定于概率"
        desc="大量重复试验中，频率逐渐稳定在概率附近；次数越多越可靠。每次试验相互独立，短期波动不代表概率改变。"
        :rows="rows"
        :result="results"
        :verify="[
          '等可能事件 P(A) = m/n：m 为事件包含的结果数',
          '频率是「试验值」，概率是「理论值」，大量试验下频率 → 概率',
          '抛硬币正反概率各 1/2；骰子每点 1/6，P(≥5) = 2/6 = 1/3',
          '独立事件：前面的结果不影响后面的抛掷'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>九年级·概率初步</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          概率刻画<b>随机可能性的大小</b>，频率是它的实验估计。<br />
          · 少量试验波动大，大量试验才稳定——先猜再大量验证。<br />
          · 频率折线<b>收敛</b>于理论概率虚线，正是大数定律的直观。<br />
          · 0 ≤ P(A) ≤ 1：必然事件 P=1，不可能事件 P=0。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.pb-panel { background: transparent; }
.pb-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.axis { stroke: var(--bb-fg); stroke-width: 2; }
.theory { stroke: var(--bb-red); stroke-width: 1.8; stroke-dasharray: 8 6; }
.theory-t { fill: var(--bb-red); font-size: 14px; font-weight: 800; font-family: var(--mono); }
.bar { fill: rgba(70, 232, 210, 0.55); stroke: var(--bb-blue); stroke-width: 2; }
.bar-v { fill: var(--bb-fg); font-size: 13px; font-weight: 800; font-family: var(--mono); }
.bar-l { fill: var(--bb-fg); font-size: 15px; font-weight: 800; }
.bar-c { fill: var(--bb-fg-dim); font-size: 12px; font-family: var(--mono); }
.freq-line { fill: none; stroke: var(--bb-amber); stroke-width: 2.5; stroke-linejoin: round; }
.freq-dot { fill: var(--bb-amber); }
.freq-lbl { fill: var(--bb-amber); font-size: 14px; font-weight: 800; }
</style>
