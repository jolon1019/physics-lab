<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'

const emit = defineEmits(['complete'])

const G = ref(5) // 物重 N（固定物体）
const Vobj = ref(500) // 物体体积 cm³
const r = ref(0.5) // 浸没比例 0..1
const liquid = ref('water') // water / brine

const RHO = { water: 1.0, brine: 1.2 }
const LIQ_LABEL = { water: '水', brine: '盐水' }
const G_CON = 10

const Fb = computed(() => 0.01 * RHO[liquid.value] * r.value * Vobj.value) // N
const Fpull = computed(() => Math.max(0, G.value - Fb.value))
const willRise = computed(() => Fb.value > G.value)
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
  const tankW = W * 0.55
  const tankTop = 70
  const tankBot = H - 50
  const liqColor = liquid.value === 'brine' ? 'rgba(120,170,210,0.5)' : 'rgba(110,170,215,0.45)'
  ctx.strokeStyle = '#5b6068'
  ctx.lineWidth = 3
  ctx.strokeRect(tankX, tankTop, tankW, tankBot - tankTop)
  const yLiq = tankTop + 24
  ctx.fillStyle = liqColor
  ctx.fillRect(tankX + 2, yLiq, tankW - 4, tankBot - yLiq - 2)
  ctx.strokeStyle = 'rgba(60,110,165,0.8)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(tankX + 2, yLiq)
  ctx.lineTo(tankX + tankW - 2, yLiq)
  ctx.stroke()

  // 物块（边长随 Vobj 变化）
  const cube = 40 + (Vobj.value / 800) * 60
  const cx = tankX + tankW * 0.5
  const top = yLiq - (1 - r.value) * cube
  const bx = cx - cube / 2
  // 浸没部分颜色更深
  ctx.fillStyle = '#d98a4a'
  ctx.strokeStyle = '#9c5a22'
  ctx.lineWidth = 2
  ctx.fillRect(bx, top, cube, cube)
  ctx.strokeRect(bx, top, cube, cube)
  // 浸没部分（液面以下）叠蓝
  const subTop = Math.max(top, yLiq)
  if (subTop < top + cube) {
    ctx.fillStyle = 'rgba(60,110,165,0.4)'
    ctx.fillRect(bx, subTop, cube, top + cube - subTop)
  }
  ctx.fillStyle = '#7a3f12'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('物块', cx, top + cube / 2)

  // 弹簧测力计（上方吊物块）
  const scaleTop = 30
  ctx.strokeStyle = '#3a6ea5'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, scaleTop)
  ctx.lineTo(cx, top - 6)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, scaleTop + 16, 15, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#22324a'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.fillText(Fpull.value.toFixed(2), cx, scaleTop + 16)

  // 浮力箭头（向上，长度 ∝ Fb）
  const fl = 20 + Fb.value * 8
  ctx.strokeStyle = '#27ae60'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx, top + cube)
  ctx.lineTo(cx, top + cube + fl)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, top + cube + fl)
  ctx.lineTo(cx - 5, top + cube + fl - 8)
  ctx.lineTo(cx + 5, top + cube + fl - 8)
  ctx.closePath()
  ctx.fill()
  // 重力箭头（向下，长度 ∝ G）
  const gl = 20 + G.value * 8
  ctx.strokeStyle = '#d23b3b'
  ctx.beginPath()
  ctx.moveTo(cx, top + cube)
  ctx.lineTo(cx, top + cube - gl)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, top + cube - gl)
  ctx.lineTo(cx - 5, top + cube - gl + 8)
  ctx.lineTo(cx + 5, top + cube - gl + 8)
  ctx.closePath()
  ctx.fill()

  // 标注
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`液体：${LIQ_LABEL[liquid.value]}（ρ=${RHO[liquid.value]} g/cm³）　物体体积 V = ${Vobj.value} cm³`, 16, 10)
  ctx.fillText(`浸没比例 = ${Math.round(r.value * 100)}%`, 16, 30)
  ctx.fillStyle = '#27ae60'
  ctx.fillText(`浮力 F浮 = ${Fb.value.toFixed(2)} N（向上）`, 16, H - 44)
  ctx.fillStyle = '#d23b3b'
  ctx.fillText(`物重 G = ${G.value} N（向下）　测力计拉力 = ${Fpull.value.toFixed(2)} N`, 16, H - 26)
  if (willRise.value) {
    ctx.fillStyle = '#d23b3b'
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.fillText('浮力 > 重力，物体将上浮（测力计拉力为 0）', 16, H - 64)
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
watch([r, liquid, Vobj, G], mark)

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
        <button class="btn" :class="{ 'btn-primary': liquid === 'water' }" @click="liquid = 'water'">水</button>
        <button class="btn" :class="{ 'btn-primary': liquid === 'brine' }" @click="liquid = 'brine'">盐水</button>
        <span class="feedback ok">完全浸没后继续下沉，F浮 不再变化——浮力与深度无关</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>探究浮力</span></div>
        <ParamSlider v-model="r" :min="0" :max="1" :step="0.05" :precision="2" label="浸没比例 V排/V物" unit="" hint="0 = 完全露出，1 = 完全浸没" />
        <ParamSlider v-model="Vobj" :min="200" :max="800" :step="20" :precision="0" label="物体体积 V" unit=" cm³" />
        <ParamSlider v-model="G" :min="2" :max="8" :step="0.5" :precision="1" label="物重 G" unit=" N" />
      </div>

      <FormulaPanel
        title="浮力（称重法 / 阿基米德原理）"
        formula="F浮 = G − F拉 = ρ液·g·V排"
        :rows="[
          { label: '液体密度 ρ', value: RHO[liquid] + ' g/cm³' },
          { label: '排开体积 V排', value: (r * Vobj).toFixed(0) + ' cm³' },
          { label: '物重 G', value: G + ' N' }
        ]"
        :result="[
          { label: '浮力 F浮 = ρgV排', value: Fb.toFixed(2) + ' N' },
          { label: '测力计拉力 F拉', value: Fpull.toFixed(2) + ' N' }
        ]"
        verify="浮力大小只与液体密度和排开液体的体积有关；物体完全浸没后，即使继续下沉、深度增大，V排 不变，F浮 也不变（与深度无关）。"
      />
    </aside>
  </div>
</template>
