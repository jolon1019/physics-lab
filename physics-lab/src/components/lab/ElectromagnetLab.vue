<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

const I = ref(0.6) // 电流 A
const turns = ref(100) // 线圈匝数
const TURNS_OPT = { few: 50, mid: 100, many: 150 }

const strength = computed(() => I.value * turns.value) // 相对磁性强弱
const maxStrength = 1.0 * 150
const nails = computed(() => Math.round((strength.value / maxStrength) * 12))
let completed = false

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

function render() {
  if (!ctx) return
  const { W, H } = dims()
  ctx.fillStyle = '#f2f0ec'
  ctx.fillRect(0, 0, W, H)

  const cy = H * 0.42
  const x0 = 140
  const x1 = W - 140
  // 铁芯
  ctx.fillStyle = '#7a828c'
  ctx.fillRect(x0, cy - 10, x1 - x0, 20)
  ctx.strokeStyle = '#5b6068'
  ctx.lineWidth = 2
  ctx.strokeRect(x0, cy - 10, x1 - x0, 20)

  // 线圈（匝数越多，可见绕组越密）
  const visTurns = Math.max(4, Math.round(turns.value / 12))
  ctx.strokeStyle = '#c0742a'
  ctx.lineWidth = 4
  for (let i = 0; i < visTurns; i++) {
    const x = x0 + 24 + (i / (visTurns - 1)) * (x1 - x0 - 48)
    ctx.beginPath()
    ctx.ellipse(x, cy, 12, 22, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 电池与电流方向
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(70, cy, 22, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#22324a'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('电池', 70, cy)
  ctx.strokeStyle = '#5b6068'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(92, cy)
  ctx.lineTo(x0, cy)
  ctx.moveTo(x1, cy)
  ctx.lineTo(W - 70, cy)
  ctx.lineTo(W - 70, cy + 30)
  ctx.lineTo(70, cy + 30)
  ctx.lineTo(70, cy + 22)
  ctx.stroke()
  // 电流箭头
  ctx.fillStyle = '#d23b3b'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.fillText(`电流 I = ${I.value.toFixed(2)} A`, 70, cy - 34)

  // 大头针（被吸引，沿铁芯两端分布）
  for (let i = 0; i < nails.value; i++) {
    const side = i % 2 === 0 ? -1 : 1
    const pos = Math.floor(i / 2)
    const px = (side < 0 ? x0 + 24 : x1 - 24) + side * pos * 12
    const py = cy + 12
    ctx.strokeStyle = '#444'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px, py + 18)
    ctx.stroke()
    ctx.fillStyle = '#bbb'
    ctx.beginPath()
    ctx.arc(px, py + 20, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // 标注
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`线圈匝数 = ${turns.value} 匝`, 16, 12)
  ctx.fillStyle = '#d23b3b'
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.fillText(`吸引大头针数量 = ${nails.value} 枚（磁性随电流、匝数增强）`, 16, H - 30)
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

function mark() {
  if (!completed) {
    completed = true
    emit('complete')
  }
}
watch([I, turns], mark)

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
        <button class="btn" :class="{ 'btn-primary': turns === 50 }" @click="turns = 50">匝数少</button>
        <button class="btn" :class="{ 'btn-primary': turns === 100 }" @click="turns = 100">匝数中</button>
        <button class="btn" :class="{ 'btn-primary': turns === 150 }" @click="turns = 150">匝数多</button>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>探究电磁铁</span></div>
        <ParamSlider v-model="I" :min="0.2" :max="1" :step="0.05" :precision="2" label="电流 I" unit=" A" />
      </div>

      <FormulaPanel
        title="电磁铁磁性强弱"
        formula="磁性 ∝ 电流 I × 匝数 N"
        :rows="[
          { label: '电流 I', value: I.toFixed(2) + ' A' },
          { label: '线圈匝数 N', value: turns + ' 匝' }
        ]"
        :result="[{ label: '相对磁性强弱 (= I·N)', value: strength.toFixed(0) }]"
        verify="电磁铁磁性强弱与电流大小、线圈匝数有关：电流越大、匝数越多，磁性越强；还可通过插入铁芯显著增强磁性。电磁铁磁性强弱可用吸引大头针的数目来比较（转换法）。"
      />
    </aside>
  </div>
</template>
