<script setup>
import { boardFg, boardText } from '../../lib/boardText'

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

const mode = ref('solid') // 'solid' 固体 | 'liquid' 液体
const m = ref(54) // 固体质量 (g)
const v1 = ref(30) // 量筒初始水体积 (mL)
const v2 = ref(78) // 放入固体后体积 (mL)
const m0 = ref(20) // 空烧杯质量 (g)
const m1 = ref(68) // 烧杯+液体质量 (g)
const vL = ref(48) // 液体体积 (mL)
const note = ref('先测质量，再用量筒排水法测体积，最后计算密度')
let completed = false

const vSolid = computed(() => Math.max(1, v2.value - v1.value))
const rhoSolid = computed(() => m.value / vSolid.value)
const mliq = computed(() => Math.max(1, m1.value - m0.value))
const rhoLiquid = computed(() => mliq.value / Math.max(1, vL.value))

const canvasRef = ref(null)
let ctx = null
let raf = null
let lastT = null
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

function drawBalance(W, H, label) {
  const bx = W * 0.27
  const beamY = H * 0.32
  const postTop = beamY
  const postBot = H * 0.6
  // 底座
  ctx.fillStyle = '#9aa0a8'
  ctx.beginPath()
  ctx.moveTo(bx - 46, postBot)
  ctx.lineTo(bx + 46, postBot)
  ctx.lineTo(bx + 30, postBot - 14)
  ctx.lineTo(bx - 30, postBot - 14)
  ctx.closePath()
  ctx.fill()
  // 立柱
  ctx.strokeStyle = '#6b7078'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(bx, postBot - 14)
  ctx.lineTo(bx, postTop)
  ctx.stroke()
  // 横梁
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(bx - 80, beamY)
  ctx.lineTo(bx + 80, beamY)
  ctx.stroke()
  // 指针
  ctx.beginPath()
  ctx.moveTo(bx, beamY)
  ctx.lineTo(bx, beamY + 22)
  ctx.stroke()
  // 吊盘
  for (const s of [-1, 1]) {
    const px = bx + s * 80
    ctx.strokeStyle = '#6b7078'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(px, beamY)
    ctx.lineTo(px, beamY + 26)
    ctx.stroke()
    ctx.fillStyle = 'rgba(150,200,230,0.25)'
    ctx.strokeStyle = 'rgba(90,140,200,0.8)'
    ctx.beginPath()
    ctx.ellipse(px, beamY + 32, 34, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  // 左盘上的物体
  if (mode.value === 'solid') {
    ctx.fillStyle = '#b0795a'
    ctx.beginPath()
    ctx.moveTo(bx - 80, beamY + 26)
    ctx.lineTo(bx - 80 - 18, beamY + 50)
    ctx.lineTo(bx - 80 + 18, beamY + 50)
    ctx.closePath()
    ctx.fill()
  } else {
    // 烧杯
    ctx.fillStyle = 'rgba(150,200,230,0.35)'
    ctx.strokeStyle = 'rgba(90,140,200,0.85)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.rect(bx - 80 - 20, beamY + 26, 40, 26)
    ctx.fill()
    ctx.stroke()
    if (m1.value > m0.value) {
      ctx.fillStyle = 'rgba(120,170,120,0.6)'
      ctx.fillRect(bx - 80 - 16, beamY + 40, 32, 10)
    }
  }
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(label, bx, postBot + 8)
}

// 固体模式：两个量筒（甲、乙）并排展示排水法
function drawCylindersSolid(W, H) {
  const cw = 62
  const top = H * 0.18
  const bot = H * 0.82
  const vMax = 120
  const volToY = (v) => bot - ((bot - top) * v) / vMax
  // 两个量筒中心（甲、乙）
  const cxs = [W * 0.36, W * 0.66]
  const labels = ['甲', '乙']
  const vols = [v1.value, v2.value]
  // 先画两个筒身
  for (const cx of cxs) {
    const x = cx - cw / 2
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillRect(x, top, cw, bot - top)
    ctx.strokeStyle = '#7a828c'
    ctx.lineWidth = 2
    ctx.strokeRect(x, top, cw, bot - top)
    // 刻度（mL，每 20 mL 一条线+数字，10 mL 小线）
    ctx.strokeStyle = 'rgba(90,90,100,0.55)'
    ctx.fillStyle = boardText(ctx.canvas)
    ctx.font = '600 10px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (let v = 0; v <= vMax; v += 10) {
      const y = volToY(v)
      const major = v % 20 === 0
      ctx.lineWidth = major ? 1.3 : 0.7
      ctx.beginPath()
      ctx.moveTo(x + 2, y)
      ctx.lineTo(x + 2 + (major ? 10 : 5), y)
      ctx.stroke()
      if (major) ctx.fillText(String(v), x + 14, y)
    }
    // 筒底画椭圆
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.ellipse(cx, bot, cw / 2, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#7a828c'
    ctx.lineWidth = 2
    ctx.stroke()
    // 筒名（甲/乙）顶部
    ctx.fillStyle = boardText(ctx.canvas)
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(labels[cxs.indexOf(cx)], cx, top - 4)
  }
  // 甲筒：只装水到 V1
  const xA = cxs[0] - cw / 2
  const wyA = volToY(v1.value)
  ctx.fillStyle = 'rgba(120,170,210,0.55)'
  ctx.fillRect(xA + 2, wyA, cw - 4, bot - wyA - 2)
  ctx.beginPath()
  ctx.ellipse(cxs[0], wyA, (cw - 4) / 2, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()
  // 乙筒：装水到 V2 + 石块沉底
  const xB = cxs[1] - cw / 2
  const wyB = volToY(v2.value)
  ctx.fillStyle = 'rgba(120,170,210,0.55)'
  ctx.fillRect(xB + 2, wyB, cw - 4, bot - wyB - 2)
  ctx.beginPath()
  ctx.ellipse(cxs[1], wyB, (cw - 4) / 2, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()
  // 石块（不规则，棕色，沉在乙筒底部）
  if (v2.value > v1.value) {
    ctx.fillStyle = '#a87248'
    ctx.strokeStyle = '#6b4022'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    const sx = cxs[1], sy = bot - 8
    ctx.moveTo(sx - 14, sy)
    ctx.lineTo(sx - 18, sy - 10)
    ctx.lineTo(sx - 6, sy - 16)
    ctx.lineTo(sx + 8, sy - 12)
    ctx.lineTo(sx + 16, sy - 6)
    ctx.lineTo(sx + 12, sy + 2)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.moveTo(sx - 8, sy - 12)
    ctx.lineTo(sx - 4, sy - 14)
    ctx.lineTo(sx, sy - 12)
    ctx.lineTo(sx - 4, sy - 10)
    ctx.closePath()
    ctx.fill()
  }
  // V1 / V2 数值标注（各筒上方，红色）
  ctx.fillStyle = '#d92135'
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(`V1 = ${v1.value} mL`, cxs[0], top + 4)
  ctx.fillText(`V2 = ${v2.value} mL`, cxs[1], top + 4)
  // 差值箭头 + 体积公式（两筒之间，教材式标注）
  const ax = (cxs[0] + cxs[1]) / 2
  ctx.strokeStyle = '#d92135'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(cxs[0] + 16, wyA)
  ctx.lineTo(cxs[1] - 16, wyB)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#d92135'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`V石 = V2 − V1 = ${vSolid.value} mL`, ax, (wyA + wyB) / 2 - 10)
}

// 液体模式：单量筒
function drawCylinderLiquid(W, H) {
  const cx = W * 0.72
  const top = H * 0.16
  const bot = H * 0.84
  const cw = 76
  const x = cx - cw / 2
  const vMax = 120
  const volToY = (v) => bot - ((bot - top) * v) / vMax
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillRect(x, top, cw, bot - top)
  ctx.strokeStyle = '#7a828c'
  ctx.lineWidth = 2
  ctx.strokeRect(x, top, cw, bot - top)
  ctx.strokeStyle = 'rgba(90,90,100,0.5)'
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let v = 0; v <= vMax; v += 10) {
    const y = volToY(v)
    ctx.lineWidth = v % 50 === 0 ? 1.4 : 0.8
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (v % 50 === 0 ? 12 : 7), y)
    ctx.stroke()
    if (v % 50 === 0) ctx.fillText(String(v), x + 16, y)
  }
  const ly = volToY(vL.value)
  ctx.fillStyle = 'rgba(120,170,120,0.6)'
  ctx.fillRect(x + 2, ly, cw - 4, bot - ly - 2)
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`V液=${vL.value} mL`, cx, top - 8)
}

function render() {
  if (!ctx) return
  const { W, H } = dims()
  paintBoard(ctx, W, H, 'chalk')
  drawBalance(W, H, mode.value === 'solid' ? `固体质量 m = ${m.value} g` : `烧杯+液 m1 = ${m1.value} g`)
  if (mode.value === 'solid') drawCylindersSolid(W, H)
  else drawCylinderLiquid(W, H)
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
function setMode(to) {
  mode.value = to
  note.value = to === 'solid' ? '用天平测固体质量，量筒排水法测体积，ρ = m / V' : '测空杯质量与杯+液质量之差得液体质量，再量体积，ρ = m / V'
  if (!completed) {
    completed = true
    emit('complete')
  }
}
function resetAll() {
  m.value = 54
  v1.value = 30
  v2.value = 78
  m0.value = 20
  m1.value = 68
  vL.value = 48
  note.value = '先测质量，再用量筒排水法测体积，最后计算密度'
}

watch([m, v1, v2, m0, m1, vL], () => {
  if (mode.value === 'solid' && v2.value <= v1.value + 1) note.value = '注意：放入固体后体积 V2 必须大于初始水 V1'
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
        <button class="btn" :class="{ 'btn-primary': mode === 'solid' }" @click="setMode('solid')">测固体密度</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'liquid' }" @click="setMode('liquid')">测液体密度</button>
        <button class="btn" @click="resetAll">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ note }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>测量数据</strong><span>{{ mode === 'solid' ? '排水法' : '质量差法' }}</span></div>
        <template v-if="mode === 'solid'">
          <ParamSlider v-model="m" :min="10" :max="100" :step="1" label="固体质量 m" unit=" g" />
          <ParamSlider v-model="v1" :min="10" :max="60" :step="1" label="量筒初始水 V1" unit=" mL" />
          <ParamSlider v-model="v2" :min="20" :max="120" :step="1" label="放入固体后 V2" unit=" mL" />
        </template>
        <template v-else>
          <ParamSlider v-model="m0" :min="10" :max="50" :step="1" label="空烧杯质量 m0" unit=" g" />
          <ParamSlider v-model="m1" :min="20" :max="100" :step="1" label="烧杯+液体 m1" unit=" g" />
          <ParamSlider v-model="vL" :min="10" :max="100" :step="1" label="液体体积 V" unit=" mL" />
        </template>
      </div>

      <FormulaPanel
        v-if="mode === 'solid'"
        title="固体密度"
        formula="ρ = m / V"
        :rows="[
          { label: '质量 m', value: m + ' g' },
          { label: '体积 V = V2 − V1', value: vSolid + ' cm³' }
        ]"
        :result="[{ label: '密度 ρ', value: rhoSolid.toFixed(2) + ' g/cm³' }]"
      />
      <FormulaPanel
        v-else
        title="液体密度"
        formula="ρ = m / V"
        :rows="[
          { label: '液体质量 m = m1 − m0', value: mliq + ' g' },
          { label: '体积 V', value: vL + ' cm³' }
        ]"
        :result="[{ label: '密度 ρ', value: rhoLiquid.toFixed(2) + ' g/cm³' }]"
      />
    </aside>
  </div>
</template>
