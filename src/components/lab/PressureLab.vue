<script setup>
import { boardFg, boardText } from '../../lib/boardText'

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
  ctx = canvas.getContext('2d')
  canvas.width = 1800
  canvas.height = 1040
  ctx.setTransform(2, 0, 0, 2, 0, 0)
}
function dims() {
  return { W: 900, H: 520 }
}

// 装置几何（统一）
function geom() {
  const { W, H } = dims()
  const baseY = H - 60 // 桌面线
  const tankX = 30
  const tankW = W * 0.5
  const tankTop = 60
  const tankBot = baseY
  const surfaceY = tankTop + 12 // 液面
  const probeX = tankX + tankW * 0.45
  const ux = W * 0.8
  const uBase = baseY
  const uTop = 32
  return { W, H, baseY, tankX, tankW, tankTop, tankBot, surfaceY, probeX, ux, uBase, uTop }
}

// 桌面带（木纹 + 边缘）
function drawTable(g) {
  const tg = ctx.createLinearGradient(0, g.baseY, 0, g.H)
  tg.addColorStop(0, 'rgba(140,106,72,0.5)')
  tg.addColorStop(0.35, 'rgba(120,90,60,0.45)')
  tg.addColorStop(1, 'rgba(76,56,38,0.55)')
  ctx.fillStyle = tg
  ctx.fillRect(0, g.baseY, g.W, g.H - g.baseY)
  ctx.strokeStyle = 'rgba(50,36,22,0.65)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, g.baseY + 2)
  ctx.lineTo(g.W, g.baseY + 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,235,200,0.45)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, g.baseY)
  ctx.lineTo(g.W, g.baseY)
  ctx.stroke()
}

// 玻璃水箱 + 液体
function drawTank(g, now) {
  const tw = 10 // 壁厚
  // 投影
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(g.tankX + g.tankW / 2, g.baseY + 3, g.tankW * 0.5, 8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 玻璃壁底色
  const wallGrad = ctx.createLinearGradient(g.tankX, 0, g.tankX + g.tankW, 0)
  wallGrad.addColorStop(0, 'rgba(215,232,242,0.5)')
  wallGrad.addColorStop(0.15, 'rgba(255,255,255,0.08)')
  wallGrad.addColorStop(0.85, 'rgba(255,255,255,0.06)')
  wallGrad.addColorStop(1, 'rgba(185,208,222,0.45)')
  ctx.fillStyle = wallGrad
  ctx.fillRect(g.tankX, g.tankTop, g.tankW, g.tankBot - g.tankTop)
  // 水（内部，渐变 + 波动液面）
  ctx.save()
  ctx.beginPath()
  ctx.rect(g.tankX + tw, g.tankTop + tw, g.tankW - 2 * tw, g.tankBot - g.tankTop - 2 * tw)
  ctx.clip()
  const liqGrad = ctx.createLinearGradient(0, g.tankTop, 0, g.tankBot)
  if (liquid.value === 'brine') {
    liqGrad.addColorStop(0, 'rgba(110,180,235,0.55)')
    liqGrad.addColorStop(1, 'rgba(38,108,190,0.78)')
  } else {
    liqGrad.addColorStop(0, 'rgba(150,215,245,0.55)')
    liqGrad.addColorStop(1, 'rgba(58,140,205,0.7)')
  }
  ctx.fillStyle = liqGrad
  ctx.fillRect(g.tankX + tw, g.tankTop + tw, g.tankW - 2 * tw, g.tankBot - g.tankTop - 2 * tw)
  // 波动液面亮线
  const amp = 1.2
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let x = g.tankX + tw; x <= g.tankX + g.tankW - tw; x += 6) {
    const y = g.surfaceY + 2 + Math.sin(x * 0.05 + now * 0.004) * amp
    x === g.tankX + tw ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
  // 壁描边 + 高光
  ctx.strokeStyle = 'rgba(90,120,150,0.8)'
  ctx.lineWidth = 3
  ctx.strokeRect(g.tankX, g.tankTop, g.tankW, g.tankBot - g.tankTop)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(g.tankX + 4, g.tankTop + 4, 5, g.tankBot - g.tankTop - 8)
  // 深度刻度
  const depthMax = 20
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 1.5
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let d = 0; d <= depthMax; d += 5) {
    const y = g.surfaceY + (d / depthMax) * (g.tankBot - g.surfaceY - 14)
    ctx.beginPath()
    ctx.moveTo(g.tankX + tw + 2, y)
    ctx.lineTo(g.tankX + tw + 12, y)
    ctx.stroke()
    ctx.fillText(String(d), g.tankX + tw + 16, y)
  }
}

// 探头（金属杆 + 橡皮膜头，方向可转）+ 软管 + 深度标注
function drawProbe(g) {
  const tipY = g.surfaceY + (h.value / 20) * (g.tankBot - g.surfaceY - 14)
  // 金属杆
  const rodGrad = ctx.createLinearGradient(g.probeX - 4, 0, g.probeX + 4, 0)
  rodGrad.addColorStop(0, 'rgba(160,165,175,0.9)')
  rodGrad.addColorStop(0.5, 'rgba(232,237,242,0.95)')
  rodGrad.addColorStop(1, 'rgba(140,145,155,0.9)')
  ctx.fillStyle = rodGrad
  ctx.fillRect(g.probeX - 3.5, g.tankTop - 16, 7, tipY - (g.tankTop - 16))
  // 探头头（按方向旋转：橡皮膜红色圆头）
  ctx.save()
  ctx.translate(g.probeX, tipY)
  const ang = dir.value === 'up' ? -Math.PI / 2 : dir.value === 'down' ? Math.PI / 2 : 0
  ctx.rotate(ang)
  // 金属连接头
  ctx.fillStyle = '#8a8f98'
  ctx.fillRect(-6, 0, 12, 10)
  // 橡皮膜（红色半圆）
  ctx.fillStyle = '#d23b3b'
  ctx.beginPath()
  ctx.arc(0, 10, 8, 0, Math.PI)
  ctx.closePath()
  ctx.fill()
  // 膜高光
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.arc(-2.5, 10, 3, 0, Math.PI)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  // 深度 h 尺寸箭头（左）
  const hy = (g.surfaceY + tipY) / 2
  ctx.strokeStyle = '#e8c25a'
  ctx.fillStyle = '#e8c25a'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(g.probeX - 36, g.surfaceY + 5)
  ctx.lineTo(g.probeX - 36, tipY)
  ctx.stroke()
  for (const [yy, ds] of [[g.surfaceY + 5, 1], [tipY, -1]]) {
    ctx.beginPath()
    ctx.moveTo(g.probeX - 36, yy)
    ctx.lineTo(g.probeX - 42, yy + ds * 6)
    ctx.lineTo(g.probeX - 30, yy + ds * 6)
    ctx.closePath()
    ctx.fill()
  }
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(`h=${h.value}cm`, g.probeX - 44, hy)
  // 软管（杆顶 → U 形管）
  ctx.strokeStyle = 'rgba(150,150,158,0.95)'
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.moveTo(g.probeX, g.tankTop - 16)
  ctx.quadraticCurveTo(g.probeX + 60, g.tankTop - 46, g.W * 0.76, g.tankTop - 40)
  ctx.stroke()
  // 软管接头（U 形管端）
  ctx.fillStyle = '#9a9fa8'
  ctx.beginPath()
  ctx.arc(g.W * 0.76, g.tankTop - 40, 4, 0, Math.PI * 2)
  ctx.fill()
}

// U 形管压强计（玻璃管 + 红墨水液柱）
function drawUTube(g) {
  const tubeW = 16
  // 投影
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.beginPath()
  ctx.ellipse(g.ux + tubeW / 2 - 3, g.baseY + 3, tubeW + 10, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 玻璃管身
  const glassGrad = ctx.createLinearGradient(g.ux - tubeW, 0, g.ux + tubeW + 6, 0)
  glassGrad.addColorStop(0, 'rgba(220,235,245,0.5)')
  glassGrad.addColorStop(0.5, 'rgba(255,255,255,0.12)')
  glassGrad.addColorStop(1, 'rgba(190,210,225,0.5)')
  ctx.fillStyle = glassGrad
  ctx.fillRect(g.ux - tubeW, g.uTop, tubeW, g.uBase - g.uTop)
  ctx.fillRect(g.ux + 6, g.uTop, tubeW, g.uBase - g.uTop)
  ctx.fillRect(g.ux - tubeW, g.uBase, tubeW * 2 + 6, 14)
  // 管壁描边
  ctx.strokeStyle = 'rgba(90,110,135,0.8)'
  ctx.lineWidth = 2
  ctx.strokeRect(g.ux - tubeW, g.uTop, tubeW, g.uBase - g.uTop)
  ctx.strokeRect(g.ux + 6, g.uTop, tubeW, g.uBase - g.uTop)
  ctx.strokeRect(g.ux - tubeW, g.uBase, tubeW * 2 + 6, 14)
  // 红墨水液柱
  const leftLevel = g.uTop + 20
  const rightLevel = leftLevel - dU.value
  const redGrad = ctx.createLinearGradient(0, g.uTop, 0, g.uBase)
  redGrad.addColorStop(0, '#f2655a')
  redGrad.addColorStop(1, '#d0342a')
  ctx.fillStyle = redGrad
  ctx.fillRect(g.ux - tubeW + 2, leftLevel, tubeW - 4, g.uBase - leftLevel + 14)
  ctx.fillRect(g.ux + 8, rightLevel, tubeW - 4, g.uBase - rightLevel + 14)
  // 液面高光
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillRect(g.ux - tubeW + 2, leftLevel, tubeW - 4, 1.5)
  ctx.fillRect(g.ux + 8, rightLevel, tubeW - 4, 1.5)
  // 管壁高光
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fillRect(g.ux - tubeW + 2, g.uTop, 2.5, g.uBase - g.uTop)
  ctx.fillRect(g.ux + 8, g.uTop, 2.5, g.uBase - g.uTop)
  // 液面差标注（虚线 + 文字）
  ctx.strokeStyle = 'rgba(242,101,90,0.55)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(g.ux - tubeW - 4, leftLevel)
  ctx.lineTo(g.ux + tubeW + 10, rightLevel)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#f2655a'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`Δh = ${dU.value.toFixed(0)} px`, g.ux + tubeW / 2 - 3, rightLevel - 4)
  // 标签
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText('U 形管压强计', g.ux + tubeW / 2 - 3, g.uBase + 26)
  ctx.fillStyle = '#f2655a'
  ctx.textBaseline = 'bottom'
  ctx.fillText('液面差 ∝ p', g.ux + tubeW / 2 - 3, g.uTop - 8)
}

function render(now) {
  if (!ctx) return
  const g = geom()
  paintBoard(ctx, g.W, g.H, 'chalk')
  drawTable(g)
  drawTank(g, now || 0)
  drawProbe(g)
  drawUTube(g)

  // 文字标注
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`液体：${LIQ_LABEL[liquid.value]}（ρ=${RHO[liquid.value]} g/cm³）`, 16, 12)
  ctx.fillText(`探头方向：${dir.value === 'up' ? '向上' : dir.value === 'down' ? '向下' : '向侧面'}，深度 h = ${h.value} cm`, 16, 32)
  ctx.fillStyle = '#d23b3b'
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.fillText(`橡皮膜受到的液体压强 p = ρgh = ${p.value.toFixed(0)} Pa`, 16, g.H - 28)
  ctx.fillStyle = '#3a6ea5'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillText('同种液体、同一深度，向各个方向的压强相等', 16, g.H - 46)
}

function loop(now) {
  render(now)
  raf = requestAnimationFrame(loop)
}
function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render(performance.now())
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
  render(performance.now())
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
          class="logic-canvas" ref="canvasRef"
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
