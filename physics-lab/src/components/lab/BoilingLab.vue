<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

// ===== 可调变量 =====
const altitude = ref(0) // 海拔 0~3000 m
const heatRate = ref(50) // 加热功率

// 沸点随海拔（气压）变化：海拔越高、气压越低、沸点越低
const boilingPoint = computed(() => 100 - altitude.value / 285)
const T_START = 20
const Tmin = 20
const Tmax = 104
const SLOWMO = 1.5

// ===== 状态 =====
const state = ref('ready') // ready | heating | boiling | done
const tNow = ref(0)
const temp = ref(T_START)
const points = ref([])
let completed = false
const hint = ref('点击「开始加热」，观察水沸腾前后气泡与温度的变化')
const startBtn = ref('开始加热')
const bubbles = ref([])

const isBoiling = computed(() => state.value === 'boiling' || state.value === 'done')

// ===== 公式面板 =====
const formulaRows = computed(() => [
  { label: '海拔高度', value: `${altitude.value} m` },
  { label: '当前沸点', value: `${boilingPoint.value.toFixed(1)} ℃` },
  { label: '当前温度', value: `${temp.value.toFixed(1)} ℃` }
])
const formulaResults = computed(() => {
  if (!isBoiling.value) return []
  return [
    { label: '是否沸腾', value: '是' },
    { label: '沸点', value: `${boilingPoint.value.toFixed(1)} ℃` },
    { label: '沸腾时温度变化', value: '保持不变' }
  ]
})
const verifySteps = computed(() => [
  '沸腾前：气泡自下而上变小（遇冷收缩）',
  '沸腾时：气泡变大并上升到水面破裂，剧烈汽化',
  '沸腾时持续吸热，但温度保持在沸点不变',
  '沸点随气压变化：海拔越高、气压越低、沸点越低'
])

// ===== Canvas =====
const canvasRef = ref(null)
let ctx = null
let raf = null
let lastT = null
const dpr = () => Math.min(window.devicePixelRatio || 1, 2)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const rand = (a, b) => a + Math.random() * (b - a)

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
function rr(x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    return
  }
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function spawnBubble(cx, by, bh, surfaceY) {
  bubbles.value.push({
    x: cx + rand(-30, 30),
    y: by + bh - rand(2, 10),
    r: isBoiling.value ? rand(3, 7) : rand(1.5, 3),
    vy: isBoiling.value ? rand(40, 70) : rand(20, 35),
    surfaceY
  })
}

function drawSetup(L) {
  const cx = L.W * 0.27
  const baseY = L.H - 64
  // 酒精灯
  const lampX = cx - 17
  const lampY = baseY + 4
  ctx.fillStyle = '#c4453d'
  rr(lampX, lampY, 34, 28, 6)
  ctx.fill()
  ctx.fillStyle = '#7a7a7a'
  rr(lampX + 12, lampY - 8, 10, 8, 3)
  ctx.fill()
  if (state.value === 'heating' || isBoiling.value) {
    ctx.fillStyle = '#f5a623'
    ctx.beginPath()
    ctx.moveTo(cx, lampY - 8)
    ctx.quadraticCurveTo(cx + 9, lampY - 26, cx, lampY - 34)
    ctx.quadraticCurveTo(cx - 9, lampY - 26, cx, lampY - 8)
    ctx.fill()
  }
  // 石棉网
  ctx.fillStyle = '#5a5a5a'
  ctx.fillRect(cx - 36, lampY - 44, 72, 6)
  // 烧杯
  const bw = 110
  const bx = cx - bw / 2
  const by = lampY - 130
  const bh = 84
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  rr(bx, by, bw, bh, 8)
  ctx.fill()
  // 水
  const wf = 0.66
  const wy = by + bh * (1 - wf)
  ctx.save()
  rr(bx + 3, wy, bw - 6, by + bh - wy - 3, 6)
  ctx.clip()
  const grad = ctx.createLinearGradient(0, wy, 0, by + bh)
  grad.addColorStop(0, '#bfe0f0')
  grad.addColorStop(1, '#7fb8d8')
  ctx.fillStyle = grad
  ctx.fillRect(bx, wy, bw, bh)
  // 气泡
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  for (const b of bubbles.value) {
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
  ctx.strokeStyle = 'rgba(80,90,110,0.7)'
  ctx.lineWidth = 2
  rr(bx, by, bw, bh, 8)
  ctx.stroke()
  // 温度计
  const tgx = bx + bw - 14
  ctx.strokeStyle = 'rgba(80,90,110,0.7)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(tgx, by - 44)
  ctx.lineTo(tgx, by + bh - 20)
  ctx.stroke()
  const f = clamp((temp.value - Tmin) / (Tmax - Tmin), 0, 1)
  const my = by + bh - 20 - (by + bh - 20 - (by - 44)) * f
  ctx.strokeStyle = '#e0584f'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(tgx, my)
  ctx.lineTo(tgx, by + bh - 20)
  ctx.stroke()
  // 标签
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(`水 · 沸点 ${boilingPoint.value.toFixed(0)}℃`, cx, baseY + 14)

  // 更新气泡
  if (state.value === 'heating' || isBoiling.value) {
    for (const b of bubbles.value) {
      b.y -= b.vy * 0.016
      // 沸腾前上升变小，沸腾时保持变大
      if (!isBoiling.value) b.r = Math.max(0.8, b.r - 0.02)
    }
    bubbles.value = bubbles.value.filter((b) => b.y > by + 8)
    if (Math.random() < (isBoiling.value ? 0.6 : 0.3)) spawnBubble(cx, by, bh, wy)
  }
}

function drawGraph(L) {
  const gx = L.W * 0.52
  const gy = 70
  const gw = L.W * 0.42
  const gh = L.H - 160
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  rr(gx, gy, gw, gh, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,100,120,0.4)'
  ctx.lineWidth = 1.5
  rr(gx, gy, gw, gh, 8)
  ctx.stroke()
  const padL = 38
  const padB = 28
  const px0 = gx + padL
  const py0 = gy + gh - padB
  const px1 = gx + gw - 12
  const py1 = gy + 14
  const DUR = 13
  const X = (t) => px0 + (t / DUR) * (px1 - px0)
  const Y = (T) => py0 - ((T - Tmin) / (Tmax - Tmin)) * (py0 - py1)
  ctx.strokeStyle = 'rgba(70,70,80,0.8)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(px0, py1)
  ctx.lineTo(px0, py0)
  ctx.lineTo(px1, py0)
  ctx.stroke()
  ctx.fillStyle = '#3a3026'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let t = 0; t <= DUR; t += 2) ctx.fillText(String(t), X(t), py0 + 6)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let T = Tmin; T <= Tmax; T += 20) {
    ctx.fillText(String(T), px0 - 6, Y(T))
    ctx.strokeStyle = 'rgba(120,120,130,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px0, Y(T))
    ctx.lineTo(px1, Y(T))
    ctx.stroke()
  }
  ctx.fillStyle = '#3a3026'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('时间 t / s', (px0 + px1) / 2, py0 + 14)
  ctx.save()
  ctx.translate(gx + 12, (py0 + py1) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('温度 T / ℃', 0, 0)
  ctx.restore()
  // 沸点参考线
  ctx.strokeStyle = 'rgba(224,88,79,0.5)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.moveTo(px0, Y(boilingPoint.value))
  ctx.lineTo(px1, Y(boilingPoint.value))
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#e0584f'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`沸点 ${boilingPoint.value.toFixed(0)}℃`, px0 + 4, Y(boilingPoint.value) - 2)
  // 曲线
  if (points.value.length > 1) {
    ctx.strokeStyle = '#e0584f'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    points.value.forEach((p, i) => {
      const xx = X(p.t)
      const yy = Y(p.T)
      if (i === 0) ctx.moveTo(xx, yy)
      else ctx.lineTo(xx, yy)
    })
    ctx.stroke()
    const last = points.value[points.value.length - 1]
    ctx.fillStyle = '#e0584f'
    ctx.beginPath()
    ctx.arc(X(last.t), Y(last.T), 4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('水沸腾 T–t 图像', gx + 10, gy + 8)
}

function render() {
  if (!ctx) return
  const L = dims()
  ctx.fillStyle = '#f2f0ec'
  ctx.fillRect(0, 0, L.W, L.H)
  drawSetup(L)
  drawGraph(L)
}

// ===== 控制 =====
function startRun() {
  if (state.value === 'running' || state.value === 'heating') return
  state.value = 'heating'
  tNow.value = 0
  temp.value = T_START
  points.value = []
  bubbles.value = []
  completed = false
  startBtn.value = '重新加热'
  lastT = performance.now()
  hint.value = '加热中…注意观察沸腾前、沸腾时气泡的不同'
}

function stopRun() {
  state.value = 'done'
  if (!completed) {
    completed = true
    hint.value = `完成！水达到沸点 ${boilingPoint.value.toFixed(0)}℃ 后持续沸腾，温度保持${boilingPoint.value.toFixed(0)}℃不变。`
    emit('complete')
  } else {
    hint.value = '再次实验结束。改变海拔可看到沸点变化。'
  }
}

function resetAll() {
  state.value = 'ready'
  tNow.value = 0
  temp.value = T_START
  points.value = []
  bubbles.value = []
  completed = false
  startBtn.value = '开始加热'
  hint.value = '点击「开始加热」，观察水沸腾前后气泡与温度的变化'
}

function loop(now) {
  if (!lastT) lastT = now
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  if (state.value === 'heating' || isBoiling.value) {
    tNow.value += dt * SLOWMO
    const Tb = boilingPoint.value
    const heatTime = 9
    const f = Math.min(tNow.value / heatTime, 1)
    if (f < 1) {
      temp.value = T_START + (Tb - T_START) * f
      state.value = 'heating'
    } else {
      temp.value = Tb
      if (state.value !== 'boiling' && state.value !== 'done') {
        state.value = 'boiling'
        hint.value = '沸腾了！气泡变大上升到水面破裂，温度保持在沸点。'
      }
    }
    points.value.push({ t: Math.min(tNow.value, 13), T: temp.value })
    if (tNow.value >= 13) {
      stopRun()
    }
  }
  render()
  raf = requestAnimationFrame(loop)
}

function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render()
}

watch(altitude, () => {
  if (state.value === 'ready' || state.value === 'done') temp.value = T_START
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
      <div class="lab-panel" style="padding:0">
        <canvas
          ref="canvasRef"
          style="display:block;width:100%;height:520px;background:#f2f0ec;touch-action:none;border-radius:8px"
        ></canvas>
      </div>

      <div class="lab-actions">
        <button v-if="state === 'ready' || state === 'done'" class="btn btn-primary" @click="startRun">{{ startBtn }}</button>
        <button v-else class="btn btn-primary" disabled>加热中…</button>
        <button class="btn" @click="resetAll">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>可调变量</strong>
          <span>海拔影响沸点</span>
        </div>
        <div class="lab-params">
          <ParamSlider v-model="altitude" :min="0" :max="3000" :step="100" label="海拔高度" unit=" m" hint="海拔越高、气压越低，沸点越低" />
          <ParamSlider v-model="heatRate" :min="20" :max="100" :step="5" label="加热功率" unit="%" hint="仅影响动画节奏" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实时数据</strong>
          <span>自动记录</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat accent">
            <span>当前沸点</span>
            <strong>{{ boilingPoint.toFixed(1) }} ℃</strong>
          </div>
          <div class="lab-stat" :class="{ success: isBoiling }">
            <span>当前温度</span>
            <strong>{{ temp.toFixed(1) }} ℃</strong>
          </div>
          <div class="lab-stat" v-if="isBoiling">
            <span>状态</span>
            <strong>沸腾中</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="公式与结论"
        formula="沸腾：持续吸热，温度不变"
        desc="沸腾是液体内部和表面同时发生的剧烈汽化。沸腾时持续吸热但温度不变；沸点随气压变化（高海拔、低气压、沸点低）。条件：达到沸点+持续吸热。"
        :rows="formulaRows"
        :result="formulaResults"
        :verify="verifySteps"
      />
    </aside>
  </div>
</template>
