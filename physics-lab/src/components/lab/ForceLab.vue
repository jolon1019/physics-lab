<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

const F = ref(2) // 拉力 N
const FMAX = 8 // 弹性限度 N
const PX_PER_N = 15 // 每牛顿对应的伸长像素
const L0 = 60 // 弹簧原长 px
let completed = false

const overLimit = computed(() => F.value > FMAX)
const x = computed(() => F.value * PX_PER_N) // 伸长量 px
const k = computed(() => 1 / PX_PER_N) // N/cm，恒值（弹性限度内）

const canvasRef = ref(null)
let ctx = null
let raf = null
const dpr = () => Math.min(window.devicePixelRatio || 1, 2)

function setupCanvas() {
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.round(rect.width * dpr())
  canvas.height = Math.round(rect.height * dpr())
  ctx = canvas.getContext('2d')
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0)
}
function dims() {
  const canvas = canvasRef.value
  return { W: canvas.width / dpr(), H: canvas.height / dpr() }
}

function drawSpring(topX, topY, len, coils, color) {
  const botY = topY + len
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(topX, topY)
  const seg = len / (coils * 2)
  for (let i = 0; i < coils * 2; i++) {
    const y = topY + seg * (i + 0.5)
    const dir = i % 2 === 0 ? 1 : -1
    ctx.lineTo(topX + dir * 14, y)
  }
  ctx.lineTo(topX, botY)
  ctx.stroke()
  return botY
}

function render() {
  if (!ctx) return
  const { W, H } = dims()
  ctx.fillStyle = '#f2f0ec'
  ctx.fillRect(0, 0, W, H)

  const cx = W * 0.42
  const supportY = 40
  // 支架
  ctx.fillStyle = '#7a828c'
  ctx.fillRect(cx - 90, supportY - 14, 180, 14)
  ctx.strokeStyle = '#5b6068'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx, supportY)
  ctx.lineTo(cx, supportY + 6)
  ctx.stroke()

  // 弹簧（超过弹性限度变红）
  const springColor = overLimit.value ? '#d23b3b' : '#3a6ea5'
  const len = L0 + x.value
  const botY = drawSpring(cx, supportY + 6, len, 12, springColor)

  // 挂钩与重物
  ctx.strokeStyle = springColor
  ctx.beginPath()
  ctx.moveTo(cx, botY)
  ctx.lineTo(cx, botY + 10)
  ctx.stroke()
  const wR = 26
  ctx.fillStyle = overLimit.value ? '#e07a7a' : '#c08a5a'
  ctx.beginPath()
  ctx.arc(cx, botY + 10 + wR, wR, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${F.value.toFixed(1)} N`, cx, botY + 10 + wR)

  // 右侧刻度尺（弹簧测力计刻度，每 1N = PX_PER_N px）
  const rulerX = W * 0.72
  ctx.strokeStyle = '#3a3026'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(rulerX, supportY + 6)
  ctx.lineTo(rulerX, supportY + 6 + L0 + FMAX * PX_PER_N + 20)
  ctx.stroke()
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = '#3a3026'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let i = 0; i <= 10; i++) {
    const y = supportY + 6 + L0 + i * PX_PER_N
    const major = i % 2 === 0
    ctx.lineWidth = major ? 1.4 : 0.8
    ctx.beginPath()
    ctx.moveTo(rulerX, y)
    ctx.lineTo(rulerX + (major ? 12 : 7), y)
    ctx.stroke()
    if (major) ctx.fillText(String(i), rulerX + 16, y)
  }
  // 弹性限度标记
  const ylim = supportY + 6 + L0 + FMAX * PX_PER_N
  ctx.strokeStyle = '#d23b3b'
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(rulerX - 4, ylim)
  ctx.lineTo(rulerX + 20, ylim)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#d23b3b'
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.fillText('弹性限度', rulerX + 24, ylim)

  // 指针（随重物底部对齐）
  const py = botY + 10 + wR
  ctx.fillStyle = '#d23b3b'
  ctx.beginPath()
  ctx.moveTo(rulerX - 2, py)
  ctx.lineTo(rulerX - 12, py)
  ctx.lineTo(rulerX - 2, py - 5)
  ctx.closePath()
  ctx.fill()
  ctx.textAlign = 'right'
  ctx.fillText(`读数 ${F.value.toFixed(1)} N`, rulerX - 14, py)

  if (overLimit.value) {
    ctx.fillStyle = '#d23b3b'
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('超过弹性限度！伸长与拉力不再成正比，无法恢复原长', W / 2, H - 18)
  }
}

function loop() {
  render()
  raf = requestAnimationFrame(loop)
}
function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render()
}

watch(F, () => {
  if (!completed) {
    completed = true
    emit('complete')
  }
})

let resizeObs = null
onMounted(() => {
  setupCanvas()
  render()
  if (window.ResizeObserver) {
    resizeObs = new ResizeObserver(resizeCanvas)
    resizeObs.observe(canvasRef.value.parentElement)
  }
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (resizeObs) resizeObs.disconnect()
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel" style="padding: 0">
        <canvas
          ref="canvasRef"
          style="display: block; width: 100%; height: 520px; background: #f2f0ec; border-radius: 8px"
        ></canvas>
      </div>
      <div class="lab-actions">
        <span class="feedback ok">调节拉力，观察弹簧伸长：弹性限度内伸长与拉力成正比（F = k·x）</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>弹簧测力计</span></div>
        <ParamSlider v-model="F" :min="0" :max="10" :step="0.5" :precision="1" label="拉力 F" unit=" N" :hint="`弹簧原长对应 0 N，每 1 N 伸长 ${PX_PER_N} px`" />
      </div>

      <FormulaPanel
        title="弹簧测力计原理"
        formula="F = k · x"
        :rows="[
          { label: '拉力 F', value: F.toFixed(1) + ' N' },
          { label: '伸长量 x', value: (F * PX_PER_N / 15).toFixed(2) + ' cm' }
        ]"
        :result="[
          { label: '劲度系数 k = F / x', value: overLimit ? '不恒定（超弹性限度）' : k.toFixed(2) + ' N/cm' }
        ]"
        verify="在弹性限度内，改变拉力 F，比值 F/x 保持不变，即弹簧伸长与拉力成正比——这就是弹簧测力计刻度的依据。"
      />
    </aside>
  </div>
</template>
