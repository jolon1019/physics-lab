<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import { boardTheme } from '../../lib/boardTheme'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

const objCm = ref(30) // 物距 u（cm）：点燃蜡烛到镜面距离
const cmpCm = ref(18) // 比较蜡烛（未点燃）到镜面距离（cm）
const showScreen = ref(false)
const note = ref('拖动“物距”移动点燃蜡烛；再拖动“比较蜡烛”，让它与镜中像重合，即可比较像与物的大小')
let completed = false

/* 实验记录表：多做几次实验 */
const trials = ref([])
const COINCIDE_TOL = 1.5 // cm

const canvasRef = ref(null)
let ctx = null
let raf = null
let lastT = null
const dpr = () => Math.min(window.devicePixelRatio || 1, 2)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const candleH = 70

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

/* 蜡烛：mode = 'obj' 点燃实物 | 'img' 虚像 | 'cmp' 未点燃比较蜡烛 */
function drawCandle(x, baseY, mode, t) {
  const ghost = mode === 'img'
  const wax = ghost ? 'rgba(220,180,90,0.28)' : '#e7c27a'
  const edge = ghost ? 'rgba(180,140,70,0.42)' : '#c79a3f'
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
  if (mode === 'obj') {
    // 点燃：带轻微闪烁的火焰
    const flick = Math.sin((t || 0) * 0.006) * 1.6 + Math.sin((t || 0) * 0.013) * 1.0
    const fg = ctx.createLinearGradient(x, topY - 28 + flick, x, topY - 4)
    fg.addColorStop(0, '#ffe27a')
    fg.addColorStop(0.5, '#ffb43d')
    fg.addColorStop(1, '#ff7a18')
    ctx.fillStyle = fg
    ctx.beginPath()
    ctx.moveTo(x, topY - 28 + flick)
    ctx.quadraticCurveTo(x + 8, topY - 12, x, topY - 4)
    ctx.quadraticCurveTo(x - 8, topY - 12, x, topY - 28 + flick)
    ctx.fill()
    // 内焰
    ctx.fillStyle = 'rgba(120,180,255,0.55)'
    ctx.beginPath()
    ctx.moveTo(x, topY - 18 + flick)
    ctx.quadraticCurveTo(x + 3.5, topY - 11, x, topY - 6)
    ctx.quadraticCurveTo(x - 3.5, topY - 11, x, topY - 18 + flick)
    ctx.fill()
  } else if (mode === 'cmp') {
    // 未点燃：黑色烛芯、无火
    ctx.fillStyle = '#3a2a18'
    ctx.beginPath()
    ctx.arc(x, topY - 9, 2.4, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // 虚像：半透明橙焰轮廓
    ctx.fillStyle = 'rgba(255,150,60,0.28)'
    ctx.beginPath()
    ctx.ellipse(x, topY - 14, 6, 14, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/* 水平尺寸箭头（带双箭头） */
function dimLine(x1, x2, y, label) {
  const a = Math.min(x1, x2), b = Math.max(x1, x2)
  ctx.save()
  ctx.strokeStyle = '#5a78c8'
  ctx.fillStyle = '#5a78c8'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(a, y)
  ctx.lineTo(b, y)
  ctx.stroke()
  const ah = 5
  for (const [px, dir] of [[a, 1], [b, -1]]) {
    ctx.beginPath()
    ctx.moveTo(px, y)
    ctx.lineTo(px + dir * ah, y - ah)
    ctx.lineTo(px + dir * ah, y + ah)
    ctx.closePath()
    ctx.fill()
  }
  if (label) {
    ctx.fillStyle = '#e8ecf6'
    ctx.font = '700 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(label, (a + b) / 2, y - 5)
  }
  ctx.restore()
}

function render(t) {
  if (!ctx) return
  const { W, H } = dims()
  paintBoard(ctx, W, H, boardTheme.variant === 'light' ? 'light' : 'dark')

  // 动态比例：保证 48cm 也能放进半屏
  const SCALE = Math.min((W / 2 - 70) / 48, 5.6)
  const paperX = 22
  const paperY = H * 0.12
  const paperW = W - 44
  const paperH = H * 0.82
  const mx = W / 2 // 玻璃板 / 平面镜位置线
  const baseY = paperY + paperH - 26 // 桌面（蜡烛站立处）
  const topY = paperY + 6

  const u = objCm.value * SCALE
  const v = objCm.value * SCALE
  const objX = mx - u
  const imgX = mx + v
  const cmpX = mx + cmpCm.value * SCALE

  // 桌面铺纸
  ctx.save()
  ctx.fillStyle = '#efe8d6'
  ctx.strokeStyle = 'rgba(120,110,90,0.45)'
  ctx.lineWidth = 1.5
  roundRect(paperX, paperY, paperW, paperH, 8)
  ctx.fill()
  ctx.stroke()
  ctx.restore()

  // 沿玻璃板在纸上画的“平面镜位置”线（标签移到纸面内顶部，避免被深色背景吞掉）
  const mirrorTop = paperY + 30
  ctx.strokeStyle = 'rgba(90,140,200,0.9)'
  ctx.lineWidth = 2
  ctx.setLineDash([7, 4])
  ctx.beginPath()
  ctx.moveTo(mx, mirrorTop)
  ctx.lineTo(mx, baseY + 4)
  ctx.stroke()
  ctx.setLineDash([])
  // 标签：纸面内、深蓝描边文字，清晰可读
  ctx.fillStyle = '#2b3a66'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('平面镜位置（玻璃板）', mx, paperY + 12)

  // 玻璃板（半透明竖板）
  ctx.fillStyle = 'rgba(150,200,230,0.22)'
  ctx.fillRect(mx - 3, mirrorTop, 6, baseY - mirrorTop + 4)
  ctx.strokeStyle = 'rgba(90,140,200,0.7)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(mx - 3, mirrorTop, 6, baseY - mirrorTop + 4)

  // 物—像 对称连线（虚线，辅助理解轴对称）
  ctx.strokeStyle = 'rgba(150,150,160,0.45)'
  ctx.setLineDash([6, 5])
  ctx.beginPath()
  ctx.moveTo(objX, baseY - candleH / 2)
  ctx.lineTo(imgX, baseY - candleH / 2)
  ctx.stroke()
  ctx.setLineDash([])

  // 点燃蜡烛（左）
  drawCandle(objX, baseY, 'obj', t)
  // 虚像（右，虚线）
  drawCandle(imgX, baseY, 'img', t)
  // 未点燃比较蜡烛（右，可移动）
  drawCandle(cmpX, baseY, 'cmp', t)

  // 重合判定
  const coincide = Math.abs(cmpCm.value - objCm.value) < COINCIDE_TOL
  if (coincide) {
    ctx.strokeStyle = '#2faf6b'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cmpX, baseY - candleH / 2, 42, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#2faf6b'
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText('与像重合 → 像与物等大', cmpX, baseY - candleH - 26)
  }

  // 纸上的位置标记（A=物，A'=像）
  marker(objX, baseY, '#c79a3f', 'A（物）', 'left')
  marker(imgX, baseY, 'rgba(180,140,70,0.7)', "A'（像）", 'right')

  // u / v 尺寸标注
  dimLine(mx, objX, baseY + 16, `u = ${objCm.value} cm`)
  dimLine(mx, imgX, baseY + 16, `v = ${objCm.value} cm`)

  // 光屏验证虚像
  if (showScreen.value) {
    const sx = imgX + 30
    ctx.fillStyle = 'rgba(90,90,100,0.9)'
    ctx.fillRect(sx, topY + 12, 10, baseY - topY - 24)
    ctx.fillStyle = '#b4521f'
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('光屏', sx + 14, topY + 16)
    ctx.fillText('光屏上承接不到像', sx + 14, topY + 36)
    ctx.fillText('→ 平面镜成虚像', sx + 14, topY + 56)
  }
}

function marker(x, y, color, text, side) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 3.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a3320'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textBaseline = 'top'
  ctx.textAlign = side === 'left' ? 'right' : 'left'
  ctx.fillText(text, x + (side === 'left' ? -8 : 8), y + 6)
  ctx.restore()
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

function loop(ts) {
  lastT = ts
  render(ts)
  raf = requestAnimationFrame(loop)
}
function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render(lastT || 0)
}

/* 记录一次实验数据（比较蜡烛需与像重合） */
function recordTrial() {
  if (Math.abs(cmpCm.value - objCm.value) >= COINCIDE_TOL) {
    note.value = '请先把“比较蜡烛”移到与镜中像重合，再用等效替代法记录大小关系'
    return
  }
  const n = trials.value.length + 1
  trials.value.push({ n, u: objCm.value, v: objCm.value })
  note.value = `已记录第 ${n} 次：u = v = ${objCm.value} cm，像与物等大`
  if (!completed) {
    completed = true
    emit('complete')
  }
}

function toggleScreen() {
  showScreen.value = !showScreen.value
  note.value = showScreen.value
    ? '把光屏放在像的位置，仍承接不到像——说明平面镜成的是虚像'
    : '拖动“物距”移动点燃蜡烛；再拖动“比较蜡烛”使其与镜中像重合'
}

function resetAll() {
  objCm.value = 30
  cmpCm.value = 18
  showScreen.value = false
  trials.value = []
  completed = false
  note.value = '拖动“物距”移动点燃蜡烛；再拖动“比较蜡烛”，让它与镜中像重合，即可比较像与物的大小'
}

const conclusion = computed(() => {
  if (trials.value.length < 2) return null
  return '由多次实验可知：像到平面镜的距离等于物体到平面镜的距离（v = u），像与物体大小相等，且是正立、等大的虚像。'
})

let resizeObs = null
onMounted(() => {
  setupCanvas()
  render(0)
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
      <div class="lab-panel board-dark board-adaptive" style="padding: 0">
        <canvas
          class="logic-canvas" ref="canvasRef"
          style="display: block; width: 100%; height: 520px; background: transparent; border-radius: 8px"
        ></canvas>
      </div>
      <div class="lab-actions">
        <button class="btn btn-primary" @click="recordTrial">记录本次数据</button>
        <button class="btn" @click="toggleScreen">{{ showScreen ? '拿走光屏' : '放光屏验虚像' }}</button>
        <button class="btn" @click="resetAll">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ note }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>调节位置</strong><span>等效替代法</span></div>
        <ParamSlider v-model="objCm" :min="10" :max="48" :step="1" label="物距 u（点燃蜡烛到镜面）" unit=" cm" />
        <ParamSlider v-model="cmpCm" :min="10" :max="48" :step="1" label="比较蜡烛到镜面" unit=" cm" hint="移到与物距相同即与像重合" />
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实验记录表</strong><span>多做几次</span></div>
        <table class="exp-table">
          <thead>
            <tr><th>次数</th><th>物到镜 u / cm</th><th>像到镜 v / cm</th><th>像与物大小</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in trials" :key="row.n">
              <td>{{ row.n }}</td>
              <td>{{ row.u }}</td>
              <td>{{ row.v }}</td>
              <td>等大</td>
            </tr>
            <tr v-if="trials.length === 0">
              <td colspan="4" class="empty">移动蜡烛并点击「记录本次数据」</td>
            </tr>
          </tbody>
        </table>
        <p v-if="conclusion" class="conclusion">{{ conclusion }}</p>
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
          { label: '连线与镜面', value: '垂直（对称）' },
          { label: '像的性质', value: '虚像' }
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>对称·虚像</span></div>
        <p style="font-size: 14px; line-height: 1.7; color: var(--text)">
          像与物体关于镜面<b>对称</b>：等大、等距、连线垂直镜面，且是<b>虚像</b>（光屏承接不到）。用另一支相同蜡烛与像重合，即可比较大小——这就是<b>等效替代法</b>。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.exp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-bottom: 6px;
}
.exp-table th,
.exp-table td {
  border: 1px solid var(--border, #d8d2c4);
  padding: 6px 8px;
  text-align: center;
}
.exp-table th {
  background: rgba(90, 120, 200, 0.12);
  font-weight: 700;
}
.exp-table .empty {
  color: var(--muted, #888);
  font-size: 12px;
}
.conclusion {
  font-size: 13px;
  line-height: 1.6;
  color: #1f6b3f;
  background: rgba(47, 175, 107, 0.1);
  border-left: 3px solid #2faf6b;
  padding: 8px 10px;
  border-radius: 4px;
  margin: 4px 0 0;
}
</style>
