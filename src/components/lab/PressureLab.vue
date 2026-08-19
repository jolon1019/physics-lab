<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

const h = ref(10) // 深度 cm
const liquid = ref('water') // water / brine
const dir = ref('side') // up / side / down

const RHO = { water: 1.0, brine: 1.2 }
const LIQ_LABEL = { water: '水', brine: '盐水' }
const G = 10

const p = computed(() => 100 * RHO[liquid.value] * h.value) // Pa（公式 p=ρgh，ρ(g/cm³)·g·h(cm)→×100）
const dU = computed(() => Math.min(90, p.value * 0.03)) // U 形管液面高度差 px
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
  paintBoard(ctx, W, H, 'chalk')

  const tankX = 30
  const tankW = W * 0.5
  const tankTop = 60
  const tankBot = H - 50
  const liqColor = liquid.value === 'brine' ? 'rgba(120,170,210,0.5)' : 'rgba(110,170,215,0.45)'
  // 容器
  ctx.strokeStyle = '#5b6068'
  ctx.lineWidth = 3
  ctx.strokeRect(tankX, tankTop, tankW, tankBot - tankTop)
  // 液体
  ctx.fillStyle = liqColor
  ctx.fillRect(tankX + 2, tankTop + 2, tankW - 4, tankBot - tankTop - 4)
  // 液面线
  ctx.strokeStyle = 'rgba(60,110,165,0.8)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(tankX + 2, tankTop + 2)
  ctx.lineTo(tankX + tankW - 2, tankTop + 2)
  ctx.stroke()

  // 探头（压强计探针）插到深度 h 处，方向按 dir 转
  const surfaceY = tankTop + 2
  const tipY = surfaceY + (h.value / 20) * (tankBot - surfaceY - 14)
  const probeX = tankX + tankW * 0.45
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(probeX, tankTop - 18)
  ctx.lineTo(probeX, tipY - 10)
  ctx.stroke()
  // 探头尖朝向
  ctx.fillStyle = '#d23b3b'
  let ax = probeX
  let ay = tipY
  let ang = dir.value === 'up' ? -Math.PI / 2 : dir.value === 'down' ? Math.PI / 2 : 0
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(ax + Math.cos(ang - 0.4) * 12, ay + Math.sin(ang - 0.4) * 12)
  ctx.lineTo(ax + Math.cos(ang + 0.4) * 12, ay + Math.sin(ang + 0.4) * 12)
  ctx.closePath()
  ctx.fill()
  // 软导管连到 U 形管
  ctx.strokeStyle = '#888'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(probeX, tankTop - 18)
  ctx.lineTo(probeX + 30, tankTop - 28)
  ctx.lineTo(W * 0.82, tankTop - 28)
  ctx.stroke()

  // U 形管压强计
  const ux = W * 0.8
  const uBase = H - 70
  const uTop = tankTop - 28
  const tubeW = 16
  ctx.strokeStyle = '#3a6ea5'
  ctx.lineWidth = 3
  // 左管（基准液面高 uTop+20）
  const leftLevel = uTop + 20
  const rightLevel = leftLevel - dU.value
  ctx.fillStyle = 'rgba(60,110,165,0.4)'
  ctx.strokeStyle = '#3a6ea5'
  // 左管
  ctx.fillRect(ux - tubeW, leftLevel, tubeW, uBase - leftLevel)
  ctx.strokeRect(ux - tubeW, leftLevel, tubeW, uBase - leftLevel)
  // 右管
  ctx.fillRect(ux + 6, rightLevel, tubeW, uBase - rightLevel)
  ctx.strokeRect(ux + 6, rightLevel, tubeW, uBase - rightLevel)
  // 底部连接
  ctx.fillRect(ux - tubeW, uBase, tubeW + 6 + tubeW, 14)
  ctx.strokeRect(ux - tubeW, uBase, tubeW + 6 + tubeW, 14)
  // 液面标注
  ctx.fillStyle = '#22324a'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('U 形管压强计', ux + tubeW / 2 - 3, uBase + 26)
  ctx.fillStyle = '#d23b3b'
  ctx.fillText(`液面差 ∝ p`, ux + tubeW / 2 - 3, uTop - 40)

  // 文字标注
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`液体：${LIQ_LABEL[liquid.value]}（ρ=${RHO[liquid.value]} g/cm³）`, 16, 12)
  ctx.fillText(`探头方向：${dir.value === 'up' ? '向上' : dir.value === 'down' ? '向下' : '向侧面'}，深度 h = ${h.value} cm`, 16, 32)
  ctx.fillStyle = '#d23b3b'
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.fillText(`橡皮膜受到的液体压强 p = ρgh = ${p.value.toFixed(0)} Pa`, 16, H - 28)
  ctx.fillStyle = '#3a6ea5'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillText('同种液体、同一深度，向各个方向的压强相等', 16, H - 46)
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
watch([h, liquid, dir], mark)

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
          style="display: block; width: 100%; height: 520px; border-radius: 8px"
        ></canvas>
      </div>
      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': liquid === 'water' }" @click="liquid = 'water'">水</button>
        <button class="btn" :class="{ 'btn-primary': liquid === 'brine' }" @click="liquid = 'brine'">盐水</button>
        <button class="btn" :class="{ 'btn-primary': dir === 'up' }" @click="dir = 'up'">探头向上</button>
        <button class="btn" :class="{ 'btn-primary': dir === 'side' }" @click="dir = 'side'">探头向侧</button>
        <button class="btn" :class="{ 'btn-primary': dir === 'down' }" @click="dir = 'down'">探头向下</button>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>液体压强</span></div>
        <ParamSlider v-model="h" :min="0" :max="20" :step="1" :precision="0" label="深度 h" unit=" cm" hint="液面下越深，压强越大" />
      </div>

      <FormulaPanel
        title="液体内部压强"
        formula="p = ρ · g · h"
        :rows="[
          { label: '液体密度 ρ', value: RHO[liquid] + ' g/cm³' },
          { label: '深度 h', value: h + ' cm' },
          { label: 'g', value: G + ' N/kg' }
        ]"
        :result="[{ label: '压强 p = ρgh', value: p.toFixed(0) + ' Pa' }]"
        verify="液体内部向各个方向都有压强；同种液体、同一深度向各方向压强相等；深度越深压强越大；不同液体同一深度，密度越大压强越大。实验用 U 形管液面差反映压强大小。"
      />
    </aside>
  </div>
</template>
