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

function roundRect(x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 不规则石块（棕色）—— 电子秤上与量筒乙中保持一致
function drawStone(cx, baseY) {
  ctx.fillStyle = '#a87248'
  ctx.strokeStyle = '#6b4022'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cx - 14, baseY)
  ctx.lineTo(cx - 18, baseY - 10)
  ctx.lineTo(cx - 6, baseY - 16)
  ctx.lineTo(cx + 8, baseY - 12)
  ctx.lineTo(cx + 16, baseY - 6)
  ctx.lineTo(cx + 12, baseY + 2)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.moveTo(cx - 8, baseY - 12)
  ctx.lineTo(cx - 4, baseY - 14)
  ctx.lineTo(cx, baseY - 12)
  ctx.lineTo(cx - 4, baseY - 10)
  ctx.closePath()
  ctx.fill()
}

// 烧杯（液体模式下放在秤上，与量筒液体模式一致）
function drawBeakerOnScale(cx, baseY) {
  ctx.fillStyle = 'rgba(150,200,230,0.35)'
  ctx.strokeStyle = 'rgba(90,140,200,0.85)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.rect(cx - 20, baseY - 26, 40, 26)
  ctx.fill(); ctx.stroke()
  if (m1.value > m0.value) {
    ctx.fillStyle = 'rgba(120,170,120,0.6)'
    ctx.fillRect(cx - 16, baseY - 12, 32, 10)
  }
}

// 电子秤：LCD 显示质量，秤上物体与量筒中的物体一致
function drawScale(W, H, label) {
  const sx = W * 0.18
  const baseW = 110
  const baseH = 48
  const baseTop = H * 0.5
  const baseBot = baseTop + baseH
  // 秤体
  ctx.fillStyle = '#d3d8de'
  ctx.strokeStyle = '#6b7078'
  ctx.lineWidth = 2.5
  roundRect(sx - baseW / 2, baseTop, baseW, baseH, 9)
  ctx.fill(); ctx.stroke()
  // 秤盘
  ctx.fillStyle = '#eef1f4'
  roundRect(sx - baseW / 2 + 8, baseTop - 6, baseW - 16, 8, 4)
  ctx.fill(); ctx.stroke()
  // LCD 显示屏
  const lcdW = 78, lcdH = 24
  const lcdX = sx - lcdW / 2
  const lcdY = baseTop + 12
  ctx.fillStyle = '#10210f'
  ctx.fillRect(lcdX, lcdY, lcdW, lcdH)
  ctx.strokeStyle = '#0a140a'
  ctx.lineWidth = 1
  ctx.strokeRect(lcdX, lcdY, lcdW, lcdH)
  // 数字（绿色 LCD）
  ctx.fillStyle = '#39ff6a'
  ctx.font = '700 17px "Courier New", monospace'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const massVal = mode.value === 'solid' ? m.value : m1.value
  ctx.fillText(`${massVal.toFixed(1)} g`, lcdX + lcdW - 6, lcdY + lcdH / 2 + 1)
  // 秤上物体
  const objBaseY = baseTop - 6
  if (mode.value === 'solid') drawStone(sx, objBaseY)
  else drawBeakerOnScale(sx, objBaseY)
  // 标注
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(label, sx, baseBot + 8)
}

// 竖向双箭头（标注液面差的高度）
function drawDoubleVArrow(x, yTop, yBot) {
  ctx.strokeStyle = '#d92135'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x, yBot); ctx.stroke()
  ctx.fillStyle = '#d92135'
  ctx.beginPath()
  ctx.moveTo(x, yTop); ctx.lineTo(x - 4, yTop + 9); ctx.lineTo(x + 4, yTop + 9)
  ctx.closePath(); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x, yBot); ctx.lineTo(x - 4, yBot - 9); ctx.lineTo(x + 4, yBot - 9)
  ctx.closePath(); ctx.fill()
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
  // 石块（不规则，棕色，沉在乙筒底部，与电子秤上一致）
  if (v2.value > v1.value) {
    drawStone(cxs[1], bot - 8)
  }
  // V1 / V2 读数移到两个量筒外侧（不直接标在量筒本体上）
  ctx.fillStyle = '#d92135'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  ctx.fillText(`V1 = ${v1.value} mL`, xA - 8, wyA)
  ctx.textAlign = 'left'
  ctx.fillText(`V2 = ${v2.value} mL`, xB + cw + 8, wyB)
  // 差值：两侧水平平行延展到中间，再用竖向双箭头表示 V石
  const gapL = cxs[0] + cw / 2 + 6
  const gapR = cxs[1] - cw / 2 - 6
  const mgx = (cxs[0] + cxs[1]) / 2
  ctx.strokeStyle = '#d92135'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.beginPath(); ctx.moveTo(gapL, wyA); ctx.lineTo(mgx, wyA); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(gapR, wyB); ctx.lineTo(mgx, wyB); ctx.stroke()
  ctx.setLineDash([])
  drawDoubleVArrow(mgx, Math.min(wyA, wyB), Math.max(wyA, wyB))
  // 差值文字（带白底，居中于中间列）
  const midY = (wyA + wyB) / 2
  const dtxt = `V石 = V2 − V1 = ${vSolid.value} mL`
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const dtw = ctx.measureText(dtxt).width
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  roundRect(mgx - dtw / 2 - 7, midY - 11, dtw + 14, 22, 6)
  ctx.fill()
  ctx.fillStyle = '#d92135'
  ctx.fillText(dtxt, mgx, midY)
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
  drawScale(W, H, mode.value === 'solid' ? `固体质量 m = ${m.value} g` : `烧杯+液 m1 = ${m1.value} g`)
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
  note.value = to === 'solid' ? '用电子秤测固体质量，量筒排水法测体积，ρ = m / V' : '测空杯质量与杯+液质量之差得液体质量，再量体积，ρ = m / V'
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
  note.value = '先用电子秤测质量，再用量筒排水法测体积，最后计算密度'
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
