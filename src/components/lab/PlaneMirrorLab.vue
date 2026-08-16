<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'

const emit = defineEmits(['complete'])

const objCm = ref(30) // 物距 u（cm）
const cmpCm = ref(20) // 比较蜡烛到镜面距离（等效替代）
const showScreen = ref(false)
const note = ref('拖动“物距”移动蜡烛；调节“比较蜡烛”使其与镜中像重合，验证像与物等大')
let completed = false

const SCALE = 4.4 // px / cm
const canvasRef = ref(null)
let ctx = null
let raf = null
let lastT = null
const dpr = () => Math.min(window.devicePixelRatio || 1, 2)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const candleH = 70

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

function drawCandle(x, baseY, mode) {
  // mode: 'obj' 实物 | 'img' 虚像 | 'cmp' 比较蜡烛
  const ghost = mode === 'img'
  const wax = ghost ? 'rgba(220,180,90,0.30)' : '#e7c27a'
  const edge = ghost ? 'rgba(180,140,70,0.45)' : '#c79a3f'
  const w = 26
  const topY = baseY - candleH
  ctx.save()
  if (ghost) ctx.setLineDash([5, 4])
  // 蜡身
  ctx.fillStyle = wax
  ctx.fillRect(x - w / 2, topY, w, candleH)
  ctx.strokeStyle = edge
  ctx.lineWidth = 2
  ctx.strokeRect(x - w / 2, topY, w, candleH)
  // 烛芯 + 火焰
  ctx.strokeStyle = edge
  ctx.beginPath()
  ctx.moveTo(x, topY)
  ctx.lineTo(x, topY - 8)
  ctx.stroke()
  if (!ghost) {
    const fg = ctx.createLinearGradient(x, topY - 26, x, topY - 4)
    fg.addColorStop(0, '#ffd34d')
    fg.addColorStop(1, '#ff7a18')
    ctx.fillStyle = fg
    ctx.beginPath()
    ctx.moveTo(x, topY - 26)
    ctx.quadraticCurveTo(x + 8, topY - 12, x, topY - 4)
    ctx.quadraticCurveTo(x - 8, topY - 12, x, topY - 26)
    ctx.fill()
  } else {
    ctx.fillStyle = 'rgba(255,150,60,0.3)'
    ctx.beginPath()
    ctx.ellipse(x, topY - 14, 6, 14, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function render() {
  if (!ctx) return
  const { W, H } = dims()
  paintBoard(ctx, W, H, 'dark')

  const mx = W / 2
  const topY = H * 0.18
  const baseY = H * 0.82
  const u = objCm.value * SCALE
  const v = objCm.value * SCALE
  const objX = mx - u
  const imgX = mx + v
  const cmpX = mx + cmpCm.value * SCALE

  // 桌面
  ctx.strokeStyle = 'rgba(120,110,90,0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(40, baseY + 2)
  ctx.lineTo(W - 40, baseY + 2)
  ctx.stroke()

  // 玻璃板（平面镜替代物）
  ctx.fillStyle = 'rgba(150,200,230,0.25)'
  ctx.fillRect(mx - 3, topY, 6, baseY - topY)
  ctx.strokeStyle = 'rgba(90,140,200,0.8)'
  ctx.lineWidth = 2
  ctx.strokeRect(mx - 3, topY, 6, baseY - topY)
  ctx.fillStyle = '#3a3026'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('玻璃板（平面镜）', mx, topY - 6)

  // 虚像连线（物—像 关于镜面对称）
  ctx.strokeStyle = 'rgba(120,120,130,0.5)'
  ctx.setLineDash([6, 5])
  ctx.beginPath()
  ctx.moveTo(objX, baseY - candleH / 2)
  ctx.lineTo(imgX, baseY - candleH / 2)
  ctx.stroke()
  ctx.setLineDash([])

  // 物体蜡烛（左）
  drawCandle(objX, baseY, 'obj')
  // 虚像蜡烛（右，虚线）
  drawCandle(imgX, baseY, 'img')

  // 比较蜡烛（右，可移动）
  const coincide = Math.abs(cmpCm.value - objCm.value) < 1.2
  drawCandle(cmpX, baseY, 'cmp')
  if (coincide) {
    ctx.strokeStyle = '#2faf6b'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cmpX, baseY - candleH / 2, 40, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#2faf6b'
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('与像完全重合 → 像与物等大', cmpX, baseY - candleH - 30)
  }

  // 文字：物距 / 像距
  ctx.fillStyle = '#3a3026'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(`物距 u = ${objCm.value} cm`, (objX + mx) / 2, baseY + 8)
  ctx.fillText(`像距 v = ${objCm.value} cm`, (mx + imgX) / 2, baseY + 8)

  // 光屏验证虚像
  if (showScreen.value) {
    ctx.fillStyle = 'rgba(90,90,100,0.85)'
    ctx.fillRect(imgX + 28, topY + 10, 10, baseY - topY - 20)
    ctx.fillStyle = '#b4521f'
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('光屏', imgX + 42, topY + 14)
    ctx.fillText('光屏上承接不到像 → 虚像', imgX + 42, topY + 34)
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
function verifyCoincide() {
  cmpCm.value = objCm.value
  note.value = '已用等效替代法让比较蜡烛与像重合，证明平面镜成像与物等大'
  if (!completed) {
    completed = true
    emit('complete')
  }
}
function toggleScreen() {
  showScreen.value = !showScreen.value
  note.value = showScreen.value
    ? '光屏放在像的位置仍承接不到像——平面镜成的是虚像'
    : '拖动“物距”移动蜡烛；调节“比较蜡烛”使其与镜中像重合'
}
function resetAll() {
  objCm.value = 30
  cmpCm.value = 20
  showScreen.value = false
  note.value = '拖动“物距”移动蜡烛；调节“比较蜡烛”使其与镜中像重合，验证像与物等大'
}

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
      <div class="lab-panel board-dark" style="padding: 0">
        <canvas
          ref="canvasRef"
          style="display: block; width: 100%; height: 520px; background: transparent; border-radius: 8px"
        ></canvas>
      </div>
      <div class="lab-actions">
        <button class="btn btn-primary" @click="verifyCoincide">比较蜡烛与像重合</button>
        <button class="btn" @click="toggleScreen">{{ showScreen ? '拿走光屏' : '放光屏验虚像' }}</button>
        <button class="btn" @click="resetAll">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ note }}</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>调节位置</strong><span>等效替代法</span></div>
        <ParamSlider v-model="objCm" :min="10" :max="48" :step="1" label="物距 u（物体到镜面）" unit=" cm" />
        <ParamSlider v-model="cmpCm" :min="10" :max="48" :step="1" label="比较蜡烛到镜面" unit=" cm" hint="调到与物距相同即与像重合" />
      </div>

      <FormulaPanel
        title="平面镜成像特点"
        formula="u = v，像与物等大"
        :rows="[
          { label: '物距 u', value: objCm + ' cm' },
          { label: '像距 v', value: objCm + ' cm' }
        ]"
        :result="[
          { label: '像与物大小', value: '相等' },
          { label: '连线与镜面', value: '垂直' },
          { label: '像的性质', value: '虚像' }
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>对称·虚像</span></div>
        <p style="font-size: 14px; line-height: 1.7; color: var(--text)">
          像与物体关于镜面<b>对称</b>：等大、等距、连线垂直镜面，且是<b>虚像</b>（光屏承接不到）。用另一支相同蜡烛与像重合，即可比较大小。
        </p>
      </div>
    </aside>
  </div>
</template>
