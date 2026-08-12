<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

const mat = ref('copper') // copper / iron / nichrome
const L = ref(1.0) // 长度 m
const S = ref(1.0) // 横截面积 mm²
const hot = ref(false) // 加热

const MAT = {
  copper: { rho: 0.017, label: '铜', color: '#c87f3a' },
  iron: { rho: 0.1, label: '铁', color: '#8a8f96' },
  nichrome: { rho: 1.1, label: '镍铬合金', color: '#5a5a66' }
}
const tempFactor = computed(() => (hot.value ? 1.25 : 1.0))
const R = computed(() => MAT[mat.value].rho * L.value * tempFactor.value / S.value)
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

  // 电阻丝：长度 ∝ L，粗细 ∝ S
  const x0 = 60
  const x1 = x0 + (L.value / 2) * (W - 140)
  const yc = H * 0.45
  const th = 6 + (S.value / 4) * 22
  // 接线柱
  ctx.fillStyle = '#5b6068'
  ctx.fillRect(x0 - 14, yc - 8, 14, 16)
  ctx.fillRect(x1, yc - 8, 14, 16)
  // 电阻丝本体
  ctx.strokeStyle = MAT[mat.value].color
  ctx.lineWidth = th
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, yc)
  ctx.lineTo(x1, yc)
  ctx.stroke()
  ctx.lineCap = 'butt'
  // 加热红光
  if (hot.value) {
    ctx.strokeStyle = 'rgba(220,60,60,0.5)'
    ctx.lineWidth = th + 8
    ctx.beginPath()
    ctx.moveTo(x0, yc)
    ctx.lineTo(x1, yc)
    ctx.stroke()
  }

  // 标尺刻度（标长度）
  ctx.strokeStyle = '#3a3026'
  ctx.lineWidth = 1
  ctx.fillStyle = '#3a3026'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let i = 0; i <= 2; i += 0.5) {
    const x = x0 + (i / 2) * (W - 140)
    ctx.beginPath()
    ctx.moveTo(x, yc + th / 2 + 6)
    ctx.lineTo(x, yc + th / 2 + 14)
    ctx.stroke()
    ctx.fillText(i.toFixed(1) + ' m', x, yc + th / 2 + 16)
  }
  // 横截面积标注
  ctx.fillStyle = '#3a6ea5'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`横截面积 S = ${S.value.toFixed(2)} mm²（线粗表示）`, x0, yc - th / 2 - 26)
  ctx.fillText(`材料：${MAT[mat.value].label}（电阻率 ρ=${MAT[mat.value].rho}）`, x0, 16)
  ctx.fillStyle = '#d23b3b'
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.fillText(`电阻 R = ρL/S = ${R.toFixed(3)} Ω`, x0, H - 30)
  if (hot.value) {
    ctx.fillStyle = '#d23b3b'
    ctx.fillText('（已加热：金属温度升高，电阻增大）', x0, H - 50)
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
watch([mat, L, S, hot], mark)

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
        <button class="btn" :class="{ 'btn-primary': mat === 'copper' }" @click="mat = 'copper'">铜</button>
        <button class="btn" :class="{ 'btn-primary': mat === 'iron' }" @click="mat = 'iron'">铁</button>
        <button class="btn" :class="{ 'btn-primary': mat === 'nichrome' }" @click="mat = 'nichrome'">镍铬合金</button>
        <button class="btn" :class="{ 'btn-primary': hot }" @click="hot = !hot">{{ hot ? '已加热' : '常温' }}</button>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>探究电阻</span></div>
        <ParamSlider v-model="L" :min="0.2" :max="2" :step="0.1" :precision="1" label="长度 L" unit=" m" />
        <ParamSlider v-model="S" :min="0.5" :max="4" :step="0.1" :precision="1" label="横截面积 S" unit=" mm²" />
      </div>

      <FormulaPanel
        title="电阻大小的因素"
        formula="R = ρ · L / S"
        :rows="[
          { label: '材料电阻率 ρ', value: MAT[mat].rho + ' μΩ·m' },
          { label: '长度 L', value: L + ' m' },
          { label: '横截面积 S', value: S + ' mm²' }
        ]"
        :result="[{ label: '电阻 R = ρL/S', value: R.toFixed(3) + ' Ω' }]"
        verify="电阻是导体本身的性质：与材料（ρ）、长度 L 成正比，与横截面积 S 成反比；同种材料、横截面积一定时，长度越长电阻越大；金属温度升高电阻增大。注意电阻与电压、电流无关。"
      />
    </aside>
  </div>
</template>
