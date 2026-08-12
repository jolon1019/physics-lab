<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

const U = ref(2.5) // 灯泡两端电压 V
const R = ref(10) // 灯泡电阻 Ω（近似，实际随温度略变）
const U_RATE = 2.5 // 额定电压 V

const I = computed(() => U.value / R.value)
const P = computed(() => (U.value * U.value) / R.value) // P = U²/R = UI
const P_RATE = computed(() => (U_RATE * U_RATE) / R.value)
const status = computed(() => {
  if (U.value < U_RATE - 0.01) return '较暗（实际功率 < 额定功率）'
  if (U.value > U_RATE + 0.01) return '过亮（实际功率 > 额定，长期使用易损坏）'
  return '正常发光（实际功率 = 额定功率）'
})
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

  const cx = W * 0.5
  const cy = H * 0.5
  const glow = Math.min(1, P.value / 1.0)
  // 光晕
  const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, 120)
  grd.addColorStop(0, `rgba(255,225,120,${0.25 + glow * 0.7})`)
  grd.addColorStop(1, 'rgba(255,225,120,0)')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.arc(cx, cy, 120, 0, Math.PI * 2)
  ctx.fill()
  // 灯泡玻璃
  ctx.fillStyle = `rgba(255,240,180,${0.5 + glow * 0.5})`
  ctx.strokeStyle = '#9c8a4a'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy, 46, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // 灯丝
  ctx.strokeStyle = glow > 0.5 ? '#fff3b0' : '#caa84a'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - 16, cy + 16)
  for (let i = 0; i <= 8; i++) {
    const x = cx - 16 + (i * 32) / 8
    const y = cy + 16 - (i % 2 === 0 ? 0 : 14)
    ctx.lineTo(x, y)
  }
  ctx.lineTo(cx + 16, cy + 16)
  ctx.stroke()
  // 灯座
  ctx.fillStyle = '#5b6068'
  ctx.fillRect(cx - 18, cy + 46, 36, 22)

  // 电压表（并联在灯泡两端）
  const vx = cx + 120
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#3a6ea5'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(vx, cy, 22, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#22324a'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('V', vx, cy - 4)
  ctx.fillStyle = '#d23b3b'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(`${U.value.toFixed(2)} V`, vx, cy + 26)

  // 电流表（串联，电源侧）
  const ax = cx - 130
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#3a6ea5'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(ax, cy, 22, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#22324a'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('A', ax, cy - 4)
  ctx.fillStyle = '#d23b3b'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(`${I.value.toFixed(2)} A`, ax, cy + 26)

  // 导线示意
  ctx.strokeStyle = '#5b6068'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(ax + 22, cy)
  ctx.lineTo(cx - 46, cy)
  ctx.moveTo(cx + 46, cy)
  ctx.lineTo(vx - 22, cy)
  ctx.stroke()

  // 状态
  ctx.fillStyle = U.value > U_RATE + 0.01 ? '#d23b3b' : U.value < U_RATE - 0.01 ? '#3a6ea5' : '#27ae60'
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(status.value, cx, H - 32)
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
watch([U, R], mark)

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
        <span class="feedback ok">调节电压观察亮度：P = UI，亮度由实际功率决定</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>测量电功率</span></div>
        <ParamSlider v-model="U" :min="0" :max="3" :step="0.1" :precision="1" label="灯泡两端电压 U" unit=" V" :hint="`额定电压 U额 = ${U_RATE} V`" />
        <ParamSlider v-model="R" :min="6" :max="16" :step="0.5" :precision="1" label="灯泡电阻 R" unit=" Ω" hint="实际灯泡电阻随温度略变，此处取近似" />
      </div>

      <FormulaPanel
        title="小灯泡的电功率"
        formula="P = U · I = U² / R"
        :rows="[
          { label: '电压 U', value: U.toFixed(2) + ' V' },
          { label: '电流 I = U/R', value: I.toFixed(2) + ' A' },
          { label: '额定电压 U额', value: U_RATE + ' V' }
        ]"
        :result="[
          { label: '实际功率 P = UI', value: P.toFixed(3) + ' W' },
          { label: '额定功率 P额', value: P_RATE.toFixed(3) + ' W' }
        ]"
        verify="用电压表和电流表分别测出灯泡两端电压 U 与通过电流 I，由 P=UI 算出实际功率。当 U = U额 时灯泡正常发光，此时功率为额定功率；U 偏离 U额，实际功率随之改变，亮度变化。"
      />
    </aside>
  </div>
</template>
