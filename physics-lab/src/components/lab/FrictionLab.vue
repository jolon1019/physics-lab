<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

const N = ref(10) // 压力 N
const surface = ref('wood') // wood / towel / sand
const speed = ref(2) // 拉动速度 m/s
const wide = ref(true) // 接触面积（平放=大 / 侧放=小）

const MU = { wood: 0.4, towel: 0.65, sand: 0.85 }
const SURF_LABEL = { wood: '木板面', towel: '毛巾面', sand: '砂纸面' }

const f = computed(() => (MU[surface.value] * N.value).toFixed(2))
let completed = false

const canvasRef = ref(null)
let ctx = null
let raf = null
let t = 0
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

  const groundY = H * 0.7
  // 接触面（纹理密度随粗糙程度）
  ctx.fillStyle = '#cdbfa6'
  ctx.fillRect(0, groundY, W, H - groundY)
  const density = MU[surface.value]
  ctx.strokeStyle = 'rgba(90,70,50,0.5)'
  ctx.lineWidth = 1
  for (let i = 0; i < 60 * density; i++) {
    const x = (i * 53) % W
    const y = groundY + 8 + ((i * 29) % (H - groundY - 12))
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 10, y + 3)
    ctx.stroke()
  }

  // 物块（平放=宽矮，侧放=窄高，体积相同只是接触面积变）
  const bw = wide.value ? 120 : 56
  const bh = wide.value ? 56 : 120
  const bx = W * 0.5 - bw / 2
  const by = groundY - bh
  ctx.fillStyle = '#d98a4a'
  ctx.strokeStyle = '#9c5a22'
  ctx.lineWidth = 2
  ctx.fillRect(bx, by, bw, bh)
  ctx.strokeRect(bx, by, bw, bh)
  ctx.fillStyle = '#7a3f12'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('物块', bx + bw / 2, by + bh / 2)

  // 弹簧测力计（左侧拉环→块）匀速向右拉
  const scaleY = by + bh / 2
  ctx.strokeStyle = '#3a6ea5'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(40, scaleY)
  ctx.lineTo(bx - 14, scaleY)
  ctx.stroke()
  // 拉环
  ctx.beginPath()
  ctx.arc(40, scaleY, 9, 0, Math.PI * 2)
  ctx.stroke()
  // 测力计表盘
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#3a6ea5'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(70, scaleY, 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#22324a'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(f.value, 70, scaleY)

  // 拉力箭头（方向向右）；速度只影响运动线密度，不影响 f
  ctx.strokeStyle = '#d23b3b'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(bx - 30, scaleY - 26)
  ctx.lineTo(bx - 30 + 26, scaleY - 26)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(bx - 30 + 26, scaleY - 26)
  ctx.lineTo(bx - 30 + 18, scaleY - 26 - 5)
  ctx.lineTo(bx - 30 + 18, scaleY - 26 + 5)
  ctx.closePath()
  ctx.fill()

  // 运动线（速度越大越密，仅表示快慢）
  t += 0.05 * speed.value
  ctx.strokeStyle = 'rgba(60,110,165,0.4)'
  ctx.lineWidth = 1
  for (let i = 0; i < speed.value * 3; i++) {
    const lx = bx + bw + 10 + ((t * 30 + i * 22) % 120)
    ctx.beginPath()
    ctx.moveTo(lx, by + 16)
    ctx.lineTo(lx + 12, by + 16)
    ctx.stroke()
  }

  // 标注
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`接触面：${SURF_LABEL[surface.value]}（μ=${MU[surface.value]}）`, 16, 14)
  ctx.fillText(`压力 N = ${N.value} N　拉动速度 = ${speed.value} m/s　接触面积：${wide.value ? '大' : '小'}`, 16, 34)
  ctx.fillStyle = '#d23b3b'
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.fillText(`弹簧测力计读数（匀速时 = 摩擦力）f = ${f.value} N`, 16, H - 28)
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
watch([N, surface, speed, wide], mark)

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
        <button class="btn" :class="{ 'btn-primary': surface === 'wood' }" @click="surface = 'wood'">木板面</button>
        <button class="btn" :class="{ 'btn-primary': surface === 'towel' }" @click="surface = 'towel'">毛巾面</button>
        <button class="btn" :class="{ 'btn-primary': surface === 'sand' }" @click="surface = 'sand'">砂纸面</button>
        <button class="btn" :class="{ 'btn-primary': wide }" @click="wide = true">接触面积大</button>
        <button class="btn" :class="{ 'btn-primary': !wide }" @click="wide = false">接触面积小</button>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>探究摩擦力</span></div>
        <ParamSlider v-model="N" :min="2" :max="30" :step="1" :precision="0" label="压力 N（接触面正压力）" unit=" N" />
        <ParamSlider v-model="speed" :min="1" :max="6" :step="1" :precision="0" label="拉动速度 v" unit=" m/s" hint="速度不影响滑动摩擦力大小" />
        <p style="padding:4px 12px;font-size:12px;color:var(--text-dim)">接触面积（按钮切换）也不影响滑动摩擦力大小。</p>
      </div>

      <FormulaPanel
        title="滑动摩擦力"
        formula="f = μ · N"
        :rows="[
          { label: '接触面 μ', value: MU[surface] },
          { label: '压力 N', value: N + ' N' }
        ]"
        :result="[{ label: '摩擦力 f = μN', value: f + ' N' }]"
        verify="匀速直线拉动时，弹簧测力计示数等于滑动摩擦力（二力平衡）。f 只与接触面粗糙程度 μ 和压力 N 有关，与速度、接触面积无关。"
      />
    </aside>
  </div>
</template>
