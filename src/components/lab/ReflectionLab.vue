<script setup>
import { boardFg, boardText } from '../../lib/boardText'

import { onBeforeUnmount, onMounted, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

const incident = ref(40) // 入射角 i（度）
const folded = ref(false) // 纸板向前折（验证三线共面）
const note = ref('拖动“入射角”滑块改变入射光线方向，观察反射光线如何变化')
let completed = false

const canvasRef = ref(null)
let ctx = null
let raf = null
let lastT = null
const dpr = () => Math.min(window.devicePixelRatio || 1, 2)
const D2R = Math.PI / 180
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

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
function arc(x, y, r, a0, a1) {
  ctx.beginPath()
  ctx.moveTo(x + r * Math.cos(a0), y + r * Math.sin(a0))
  const n = 18
  for (let s = 1; s <= n; s++) {
    const a = a0 + ((a1 - a0) * s) / n
    ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a))
  }
  ctx.stroke()
}
function arrow(x1, y1, x2, y2, color) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const h = 12
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - h * Math.cos(ang - 0.4), y2 - h * Math.sin(ang - 0.4))
  ctx.lineTo(x2 - h * Math.cos(ang + 0.4), y2 - h * Math.sin(ang + 0.4))
  ctx.closePath()
  ctx.fill()
}

function render() {
  if (!ctx) return
  const { W, H } = dims()
  paintBoard(ctx, W, H, 'dark')

  const cx = W / 2
  const mirrorY = H * 0.66
  const mx0 = W * 0.16
  const mx1 = W * 0.84
  const L = clamp(H * 0.3, 150, 250)
  const i = incident.value * D2R
  const aUp = -Math.PI / 2
  const aInc = Math.atan2(-Math.cos(i), -Math.sin(i))
  const aRef = Math.atan2(-Math.cos(i), Math.sin(i))
  const hit = { x: cx, y: mirrorY }
  const src = { x: cx - L * Math.sin(i), y: mirrorY - L * Math.cos(i) }
  const refEnd = { x: cx + L * Math.sin(i), y: mirrorY - L * Math.cos(i) }

  // 镜面
  ctx.strokeStyle = '#7a828c'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(mx0, mirrorY)
  ctx.lineTo(mx1, mirrorY)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(122,130,140,0.5)'
  ctx.lineWidth = 1.5
  for (let x = mx0 + 10; x < mx1; x += 16) {
    ctx.beginPath()
    ctx.moveTo(x, mirrorY + 4)
    ctx.lineTo(x - 10, mirrorY + 16)
    ctx.stroke()
  }
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('镜面', (mx0 + mx1) / 2, mirrorY + 18)

  // 法线
  ctx.strokeStyle = folded.value ? 'rgba(120,120,130,0.35)' : '#2f3a4a'
  ctx.lineWidth = 2
  ctx.setLineDash([7, 6])
  ctx.beginPath()
  ctx.moveTo(cx, mirrorY)
  ctx.lineTo(cx, mirrorY - L - 40)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.textAlign = 'left'
  ctx.fillText('法线', cx + 6, mirrorY - L - 36)

  // 入射光线
  arrow(src.x, src.y, hit.x, hit.y, '#e0584f')
  ctx.fillStyle = '#e0584f'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('入射光线', src.x - 6, src.y - 8)

  // 入射角弧 + 标注
  ctx.strokeStyle = '#e0584f'
  ctx.lineWidth = 1.5
  arc(hit.x, hit.y, 34, aUp, aInc)
  ctx.fillStyle = '#e0584f'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('i', hit.x - 50, hit.y - 18)

  if (!folded.value) {
    // 反射光线（平面板内）
    arrow(hit.x, hit.y, refEnd.x, refEnd.y, '#3b6fd4')
    ctx.fillStyle = '#3b6fd4'
    ctx.textAlign = 'left'
    ctx.fillText('反射光线', refEnd.x + 6, refEnd.y - 8)
    ctx.strokeStyle = '#3b6fd4'
    ctx.lineWidth = 1.5
    arc(hit.x, hit.y, 34, aUp, aRef)
    ctx.fillStyle = '#3b6fd4'
    ctx.fillText('r', hit.x + 44, hit.y - 18)
  } else {
    // 向前折纸板：反射光线离开平面（用虚线灰箭头示意出平面）
    ctx.strokeStyle = 'rgba(120,120,130,0.6)'
    ctx.fillStyle = 'rgba(120,120,130,0.6)'
    ctx.setLineDash([6, 5])
    arrow(hit.x, hit.y, hit.x - L * 0.78 * Math.sin(i * 0.6), hit.y - L * 0.78 * Math.cos(i * 0.6) - 26, 'rgba(120,120,130,0.6)')
    ctx.setLineDash([])
    ctx.font = '700 12px system-ui, sans-serif'
    ctx.fillText('反射光线（出平面）', hit.x - 150, hit.y - L * 0.78 * 0.5 - 40)
    ctx.fillStyle = '#b4521f'
    ctx.font = '800 15px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('纸板向前折 → 反射光线不在纸板平面，证明三线共面', W / 2, H * 0.12)
  }

  // 结论
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(
    folded.value ? '反射光线消失（出平面）' : `反射角 r = 入射角 i = ${incident.value}°`,
    W / 2,
    H - 16
  )
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
function toggleFold() {
  folded.value = !folded.value
  note.value = folded.value
    ? '把纸板向前折，反射光线离开平面——说明反射光线、入射光线、法线在同一平面内'
    : '把纸板放回平面，重新观察反射光线'
  if (!completed) {
    completed = true
    emit('complete')
  }
}
function resetAll() {
  incident.value = 40
  folded.value = false
  note.value = '拖动“入射角”滑块改变入射光线方向，观察反射光线如何变化'
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
          class="logic-canvas" ref="canvasRef"
          style="display: block; width: 100%; height: 520px; background: transparent; border-radius: 8px"
        ></canvas>
      </div>
      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': folded }" @click="toggleFold">
          {{ folded ? '放回纸板（共面）' : '向前折纸板（验共面）' }}
        </button>
        <button class="btn" @click="resetAll">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ note }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>调节入射角</strong><span>改变光线方向</span></div>
        <ParamSlider v-model="incident" :min="10" :max="85" :step="1" label="入射角 i" unit="°" />
      </div>

      <FormulaPanel
        title="光的反射定律"
        formula="∠r = ∠i"
        :rows="[
          { label: '入射角 i', value: incident + '°' },
          { label: '反射角 r', value: folded ? '—（出平面）' : incident + '°' }
        ]"
        :result="[{ label: '结论', value: '反射角 = 入射角' }]"
        :verify="folded ? ['纸板向前折，反射光线离开平面 → 反射光线、入射光线、法线在同一平面内'] : []"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>三线共面</span></div>
        <p style="font-size: 14px; line-height: 1.7; color: var(--text)">
          反射光线、入射光线和<b>法线在同一平面内</b>；分居法线两侧；<b>反射角等于入射角</b>。点击「向前折纸板」可验证三线共面。
        </p>
      </div>
    </aside>
  </div>
</template>
