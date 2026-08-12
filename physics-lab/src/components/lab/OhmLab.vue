<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

const mode = ref('U') // U: 探究 I 与 U（固定R） / R: 探究 I 与 R（固定U）
const U = ref(6) // 电压 V
const R = ref(10) // 电阻 Ω

const I = computed(() => U.value / R.value)
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

  const padL = 56
  const padB = 46
  const padT = 28
  const padR = 24
  const px = padL
  const py = padT
  const pw = W - padL - padR
  const ph = H - padT - padB

  // 坐标轴
  ctx.strokeStyle = '#8a8f96'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(px, py)
  ctx.lineTo(px, py + ph)
  ctx.lineTo(px + pw, py + ph)
  ctx.stroke()
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(mode.value === 'U' ? '电压 U / V' : '电阻 R / Ω', px + pw / 2, py + ph + 16)
  ctx.save()
  ctx.translate(16, py + ph / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('电流 I / A', 0, 0)
  ctx.restore()

  let xMax, yMax
  if (mode.value === 'U') {
    xMax = 12
    yMax = 2.2
  } else {
    xMax = 20
    yMax = 2.5
  }
  const X = (v) => px + (v / xMax) * pw
  const Y = (v) => py + ph - (v / yMax) * ph

  // 网格刻度
  ctx.strokeStyle = 'rgba(120,120,130,0.25)'
  ctx.lineWidth = 1
  ctx.fillStyle = '#6b7078'
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textBaseline = 'top'
  for (let i = 0; i <= (mode.value === 'U' ? 12 : 20); i += mode.value === 'U' ? 2 : 4) {
    ctx.beginPath()
    ctx.moveTo(X(i), py)
    ctx.lineTo(X(i), py + ph)
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.fillText(String(i), X(i), py + ph + 4)
  }
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let i = 0; i <= (mode.value === 'U' ? 2 : 2.5); i += 0.5) {
    ctx.beginPath()
    ctx.moveTo(px, Y(i))
    ctx.lineTo(px + pw, Y(i))
    ctx.stroke()
    ctx.fillText(i.toFixed(1), px - 6, Y(i))
  }

  // 关系曲线 / 直线
  ctx.strokeStyle = '#3a6ea5'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  if (mode.value === 'U') {
    ctx.moveTo(X(0), Y(0))
    ctx.lineTo(X(xMax), Y((xMax / R.value) > yMax ? yMax : xMax / R.value))
  } else {
    let first = true
    for (let r = 0.5; r <= 20; r += 0.5) {
      const i = U.value / r
      const xx = X(r)
      const yy = Y(Math.min(i, yMax))
      if (first) {
        ctx.moveTo(xx, yy)
        first = false
      } else ctx.lineTo(xx, yy)
    }
  }
  ctx.stroke()

  // 当前工作点
  const cxv = mode.value === 'U' ? U.value : R.value
  const cyv = I.value
  const cxp = X(cxv)
  const cyp = Y(Math.min(cyv, yMax))
  ctx.fillStyle = '#d23b3b'
  ctx.beginPath()
  ctx.arc(cxp, cyp, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`( ${cxv.toFixed(1)}, ${cyv.toFixed(2)} )`, cxp + 9, cyp - 4)
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
watch([mode, U, R], mark)

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
        <button class="btn" :class="{ 'btn-primary': mode === 'U' }" @click="mode = 'U'">探究 I 与 U（固定 R）</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'R' }" @click="mode = 'R'">探究 I 与 R（固定 U）</button>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>欧姆定律</span></div>
        <ParamSlider v-model="U" :min="1" :max="12" :step="0.5" :precision="1" label="电压 U" unit=" V" />
        <ParamSlider v-model="R" :min="2" :max="20" :step="0.5" :precision="1" label="电阻 R" unit=" Ω" />
        <p style="padding:4px 12px;font-size:12px;color:var(--text-dim)">
          {{ mode === 'U' ? '固定 R，改变 U：I 与 U 成正比（图像为过原点的直线，斜率=1/R）。' : '固定 U，改变 R：I 与 R 成反比（图像为双曲线）。' }}
        </p>
      </div>

      <FormulaPanel
        title="欧姆定律"
        formula="I = U / R"
        :rows="[
          { label: '电压 U', value: U + ' V' },
          { label: '电阻 R', value: R + ' Ω' }
        ]"
        :result="[{ label: '电流 I = U/R', value: I.toFixed(2) + ' A' }]"
        verify="一段导体中电流与两端电压成正比、与电阻成反比。探究时要用控制变量法：研究 I 与 U 的关系须保持 R 不变；研究 I 与 R 的关系须保持 U 不变。"
      />
    </aside>
  </div>
</template>
