<script setup>
import { boardFg, boardText } from '../../lib/boardText'

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

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
  paintBoard(ctx, W, H, 'chalk')

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

  // ===== 弹簧测力计：外壳 + 刻度窗(0~8N 每 0.5N) + 红色指针 + 挂钩 + 重物 =====
  const DYN_W = 56                     // 外壳宽
  const shellTop = supportY + 6        // 外壳顶（挂支架）
  const y0 = shellTop + 24             // 0 N 刻度线 y
  const shellBot = y0 + FMAX * PX_PER_N + 22 // 外壳底（连弹簧）
  const winX = cx - DYN_W / 2 + 10     // 刻度窗左缘
  const winW = DYN_W - 26              // 刻度窗宽（留数字位）

  // 外壳（圆筒）
  ctx.fillStyle = '#f7f4ec'
  ctx.strokeStyle = '#2b3a4a'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.roundRect(cx - DYN_W / 2, shellTop, DYN_W, shellBot - shellTop, 10)
  ctx.fill(); ctx.stroke()
  // 顶部固定端盖（挂支架）
  ctx.fillStyle = '#2b3a4a'
  ctx.fillRect(cx - DYN_W / 2, shellTop, DYN_W, 12)
  // 底部端盖（连弹簧）
  ctx.fillStyle = '#1f2c39'
  ctx.fillRect(cx - DYN_W / 2, shellBot - 10, DYN_W, 10)

  // 刻度窗（白底，精确刻度 0~8N 每 0.5N 一格）
  ctx.fillStyle = '#f6fafd'
  ctx.fillRect(winX, y0 - 14, winW + 10, FMAX * PX_PER_N + 26)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let n = 0; n <= FMAX; n++) {
    for (let h = 0; h < 2; h++) {
      const v = n + h * 0.5
      if (v > FMAX) continue
      const y = y0 + v * PX_PER_N
      const major = h === 0
      ctx.strokeStyle = major ? '#2b3a4a' : '#7d8a9a'
      ctx.lineWidth = major ? 1.6 : 0.9
      ctx.beginPath()
      ctx.moveTo(winX + 3, y)
      ctx.lineTo(winX + 3 + (major ? 12 : 6), y)
      ctx.stroke()
      if (major) {
        ctx.fillStyle = boardText(ctx.canvas)
        ctx.fillText(String(v), winX + 20, y)
      }
    }
  }
  // 弹性限度虚线（8N）
  const ylim = y0 + FMAX * PX_PER_N
  ctx.strokeStyle = '#d23b3b'
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(winX - 2, ylim)
  ctx.lineTo(winX + winW + 14, ylim)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#d23b3b'
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.fillText('弹性限度', winX + winW + 18, ylim)

  // 红色指针（随读数移动，超限顶格）
  const py = y0 + Math.min(F.value, FMAX) * PX_PER_N
  ctx.strokeStyle = '#d92135'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(winX - 4, py)
  ctx.lineTo(winX + winW + 6, py)
  ctx.stroke()

  // 弹簧（外壳下方：顶部连外壳底，随拉力伸长）
  const springColor = overLimit.value ? '#d23b3b' : '#3a6ea5'
  const springTopY = shellBot + 6
  const springLen = L0 + x.value
  drawSpring(cx, springTopY, springLen, 12, springColor)

  // 挂钩与重物（随弹簧伸长下移）
  const botY = springTopY + springLen
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
  ctx.strokeStyle = '#5a4030'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${F.value.toFixed(1)} N`, cx, botY + 10 + wR)

  // 读数标注（指针右侧）
  ctx.fillStyle = '#d92135'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`读数 ${F.value.toFixed(1)} N`, winX + winW + 22, Math.min(py + 8, ylim + 12))

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
          style="display: block; width: 100%; height: 520px; background: transparent; border-radius: 8px"
        ></canvas>
      </div>
      <div class="lab-actions">
        <span class="feedback ok">调节拉力，观察弹簧伸长：弹性限度内伸长与拉力成正比（F = k·x）</span>
        <FullscreenBtn />
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
