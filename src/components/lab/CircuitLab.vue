<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

const topology = ref('series') // series / parallel
const U = ref(6) // 电源电压 V
const R1 = ref(8) // 灯泡1电阻 Ω
const R2 = ref(12) // 灯泡2电阻 Ω

const I1 = computed(() => U.value / R1.value)
const I2 = computed(() => U.value / R2.value)
const IS = computed(() => U.value / (R1.value + R2.value)) // 串联电流
const ITotal = computed(() => (topology.value === 'series' ? IS.value : I1.value + I2.value))
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

function wire(p) {
  ctx.strokeStyle = '#5b6068'
  ctx.lineWidth = 3
  ctx.beginPath()
  p.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])))
  ctx.stroke()
}
function battery(x, y) {
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x, y - 16)
  ctx.lineTo(x, y + 16)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x - 9, y - 8)
  ctx.lineTo(x + 9, y - 8)
  ctx.stroke()
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(x - 9, y + 8)
  ctx.lineTo(x + 9, y + 8)
  ctx.stroke()
  ctx.fillStyle = '#22324a'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${U.value} V`, x, y - 26)
}
function ammeter(x, y, val) {
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#3a6ea5'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(x, y, 18, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#22324a'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('A', x, y - 1)
  ctx.fillStyle = '#d23b3b'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(`${val.toFixed(2)} A`, x, y + 22)
}
function bulb(x, y, I) {
  const glow = Math.min(1, I / 1.5)
  ctx.fillStyle = `rgba(255,210,80,${0.3 + glow * 0.6})`
  ctx.strokeStyle = '#9c5a22'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(x, y, 18, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = '#7a4a16'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x - 9, y - 6)
  ctx.lineTo(x - 3, y)
  ctx.lineTo(x - 7, y)
  ctx.lineTo(x - 1, y + 6)
  ctx.stroke()
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(`I=${I.toFixed(2)} A`, x, y + 22)
}

function render() {
  if (!ctx) return
  const { W, H } = dims()
  paintBoard(ctx, W, H, 'chalk')
  const midY = H * 0.42

  if (topology.value === 'series') {
    const bx = 70
    battery(bx, midY)
    ammeter(bx + 90, midY, IS.value)
    bulb(bx + 230, midY - 60, IS.value)
    bulb(bx + 230, midY + 60, IS.value)
    wire([
      [bx, midY - 22], [bx + 90, midY - 22], [bx + 90, midY - 18],
      [bx + 150, midY - 18], [bx + 230, midY - 18], [bx + 230, midY - 42], [bx + 230, midY - 78]
    ])
    wire([
      [bx + 230, midY - 42], [bx + 310, midY - 42], [bx + 310, midY + 42], [bx + 230, midY + 42]
    ])
    wire([
      [bx + 230, midY + 78], [bx + 150, midY + 78], [bx + 90, midY + 78], [bx + 90, midY + 22],
      [bx, midY + 22]
    ])
    ctx.fillStyle = '#3a3026'
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`串联：处处电流相等　I = I₁ = I₂ = ${IS.value.toFixed(2)} A`, 16, 16)
  } else {
    const bx = 70
    battery(bx, midY)
    ammeter(bx + 70, midY, ITotal.value)
    bulb(bx + 250, midY - 70, I1.value)
    bulb(bx + 250, midY + 70, I2.value)
    ammeter(bx + 170, midY - 70, I1.value)
    ammeter(bx + 170, midY + 70, I2.value)
    // 干路
    wire([
      [bx, midY - 22], [bx + 70, midY - 22], [bx + 70, midY - 18],
      [bx + 110, midY - 18], [bx + 110, midY - 70], [bx + 130, midY - 70]
    ])
    wire([
      [bx, midY + 22], [bx + 70, midY + 22], [bx + 70, midY + 18],
      [bx + 110, midY + 18], [bx + 110, midY + 70], [bx + 130, midY + 70]
    ])
    // 上支路
    wire([
      [bx + 130, midY - 70], [bx + 170, midY - 70], [bx + 210, midY - 70], [bx + 250, midY - 70],
      [bx + 290, midY - 70], [bx + 290, midY + 70], [bx + 250, midY + 70]
    ])
    // 下支路回到电池
    wire([
      [bx + 130, midY + 70], [bx + 70, midY + 70], [bx + 70, midY + 78], [bx, midY + 78]
    ])
    ctx.fillStyle = '#3a3026'
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`并联：干路电流 = 各支路之和`, 16, 16)
    ctx.fillText(`I = I₁ + I₂ = ${I1.value.toFixed(2)} + ${I2.value.toFixed(2)} = ${ITotal.value.toFixed(2)} A`, 16, 36)
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

function mark() {
  if (!completed) {
    completed = true
    emit('complete')
  }
}
watch([topology, U, R1, R2], mark)

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
        <button class="btn" :class="{ 'btn-primary': topology === 'series' }" @click="topology = 'series'">串联电路</button>
        <button class="btn" :class="{ 'btn-primary': topology === 'parallel' }" @click="topology = 'parallel'">并联电路</button>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>探究电流规律</span></div>
        <ParamSlider v-model="U" :min="2" :max="12" :step="1" :precision="0" label="电源电压 U" unit=" V" />
        <ParamSlider v-model="R1" :min="4" :max="20" :step="1" :precision="0" label="灯泡1电阻 R₁" unit=" Ω" />
        <ParamSlider v-model="R2" :min="4" :max="20" :step="1" :precision="0" label="灯泡2电阻 R₂" unit=" Ω" />
      </div>

      <FormulaPanel
        v-if="topology === 'series'"
        title="串联电流规律"
        formula="I = I₁ = I₂"
        :rows="[
          { label: '总电阻 R = R₁+R₂', value: (R1 + R2) + ' Ω' },
          { label: '电压 U', value: U + ' V' }
        ]"
        :result="[{ label: '电流 I = U/R', value: IS.toFixed(2) + ' A' }]"
        verify="串联电路电流处处相等：用一个电流表接在不同位置，示数都相同。"
      />
      <FormulaPanel
        v-else
        title="并联电流规律"
        formula="I = I₁ + I₂"
        :rows="[
          { label: '支路1电流 I₁ = U/R₁', value: I1.toFixed(2) + ' A' },
          { label: '支路2电流 I₂ = U/R₂', value: I2.toFixed(2) + ' A' }
        ]"
        :result="[{ label: '干路电流 I = I₁+I₂', value: ITotal.toFixed(2) + ' A' }]"
        verify="并联电路干路电流等于各支路电流之和；各支路两端电压都等于电源电压。"
      />
    </aside>
  </div>
</template>
