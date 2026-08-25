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
  const tankTop = 80 // 水箱略低
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
  // 软管（杆顶 → U 形管左管管口，弧线连通）
  const endX = g.ux - 8 // U 形管左管中心
  const endY = g.uTop - 3
  ctx.strokeStyle = 'rgba(150,150,158,0.95)'
  ctx.lineWidth = 3.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(g.probeX, g.tankTop - 16)
  ctx.quadraticCurveTo((g.probeX + endX) / 2, g.tankTop - 62, endX, endY)
  ctx.stroke()
}

// U 形管压强计（真实连通管：玻璃 U 形管道 + 红墨水沿内径流动，底部半圆弯管联通）
function drawUTube(g) {
  const cx = g.ux + 3 // 两管中心
  const gap = 22 // 两管中心距
  const x1 = cx - gap / 2
  const x2 = cx + gap / 2
  const tubeW = 16 // 玻璃外径
  const innerW = tubeW - 8 // 内径
  const bendY = g.uBase - 12 // 底部弯管中心
  const bendR = gap / 2 // 弯管半径
  // 投影
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.beginPath()
  ctx.ellipse(cx, g.baseY + 3, gap / 2 + 14, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // U 形路径（左管→底部半圆→右管）
  const uPath = () => {
    ctx.beginPath()
    ctx.moveTo(x1, g.uTop)
    ctx.lineTo(x1, bendY)
    ctx.arc(cx, bendY, bendR, Math.PI, 0, false)
    ctx.lineTo(x2, g.uTop)
  }
  ctx.lineCap = 'round'
  // 玻璃管体（外径描边）
  uPath()
  ctx.strokeStyle = 'rgba(190,212,228,0.9)'
  ctx.lineWidth = tubeW
  ctx.stroke()
  // 管体内部提亮（形成壁厚）
  uPath()
  ctx.strokeStyle = 'rgba(235,245,252,0.55)'
  ctx.lineWidth = tubeW - 4
  ctx.stroke()
  // 红墨水：按连通器对称浮动（左管降 dU/2、右管升 dU/2），内径描边不溢出
  const baseLevel = g.uTop + 40
  const leftLevel = baseLevel + dU.value / 2
  const rightLevel = baseLevel - dU.value / 2
  ctx.beginPath()
  ctx.moveTo(x1, leftLevel)
  ctx.lineTo(x1, bendY)
  ctx.arc(cx, bendY, bendR, Math.PI, 0, false)
  ctx.lineTo(x2, rightLevel)
  ctx.strokeStyle = '#e0483c'
  ctx.lineWidth = innerW
  ctx.stroke()
  // 液面高光（红墨水亮线）
  ctx.beginPath()
  ctx.moveTo(x1, leftLevel + 3)
  ctx.lineTo(x1, bendY + 9)
  ctx.arc(cx, bendY, bendR - 3, Math.PI * 0.85, 0.15, false)
  ctx.lineTo(x2, rightLevel + 3)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2
  ctx.stroke()
  // 玻璃外轮廓线
  uPath()
  ctx.strokeStyle = 'rgba(90,110,135,0.7)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  // 液面差标注（虚线连两液面）
  ctx.strokeStyle = 'rgba(242,101,90,0.6)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(x1 - tubeW / 2 - 4, leftLevel)
  ctx.lineTo(x2 + tubeW / 2 + 4, rightLevel)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#f2655a'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`Δh = ${dU.value.toFixed(0)} px`, cx, rightLevel - 6)
  // 左管口软管接头（金属圈，与软管视觉连通）
  ctx.fillStyle = '#b9bec6'
  ctx.beginPath()
  ctx.arc(x1, g.uTop - 4, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,110,135,0.6)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#8a8f98'
  ctx.beginPath()
  ctx.arc(x1, g.uTop - 4, 3.5, 0, Math.PI * 2)
  ctx.fill()
  // 标签
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText('U 形管压强计', cx, g.uBase + 26)
  ctx.fillStyle = '#f2655a'
  ctx.textBaseline = 'bottom'
  ctx.fillText('液面差 ∝ p', cx, g.uTop - 8)
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
        :verify="[
          '探头放入水中，U 形管两液面出现高度差——说明液体内部存在压强',
          '保持深度不变，探头朝上、朝侧、朝下，液面差不变——同深度各方向压强相等',
          '同一液体中增大深度，液面差变大——深度越深压强越大',
          '同一深度换用盐水，液面差变大——密度越大压强越大'
        ]"
      />
    </aside>
  </div>
</template>
