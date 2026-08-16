<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'

const emit = defineEmits(['complete'])

const canvasRef = ref(null)
let ctx = null
let raf = null
let dpr = 1
let flickerT = 0

const W = 860
const H = 460

const v1 = ref(2) // 红球匀速速度 m/s
const a2 = ref(0.5) // 蓝球加速度 m/s²
const S = 60 // 赛程 m

// 赛道几何
const trackY1 = 120
const trackY2 = 180
const trackX0 = 80
const trackX1 = 800

const running = ref(false)
const done = ref(false)
let t = 0
let s1 = 0
let s2 = 0
let v2 = 0
const trace1 = [] // { t, s } 红球
const trace2 = [] // { t, s } 蓝球

const seen = { move: false, param: false }
let completed = false

const hint = ref('点击「开始」，观察红球匀速、蓝球加速的运动')

const t1f = computed(() => S / v1.value)
const t2f = computed(() => Math.sqrt((2 * S) / a2.value))

const leader = computed(() => {
  if (done.value) {
    if (t1f.value < t2f.value) return `红球先到（${t1f.value.toFixed(1)}s vs ${t2f.value.toFixed(1)}s）`
    if (t2f.value < t1f.value) return `蓝球先到（${t2f.value.toFixed(1)}s vs ${t1f.value.toFixed(1)}s）`
    return '同时到达'
  }
  return s1 > s2 ? '红球领先' : s2 > s1 ? '蓝球领先' : '齐头并进'
})

const kmh = computed(() => (v1.value * 3.6).toFixed(1))

watch([v1, a2], () => {
  seen.param = true
  tryComplete()
})

function startPause() {
  if (done.value) {
    resetRun()
    running.value = true
  } else {
    running.value = !running.value
  }
  if (running.value) seen.move = true
  tryComplete()
}

function resetRun() {
  running.value = false
  done.value = false
  t = 0
  s1 = 0
  s2 = 0
  v2 = 0
  trace1.length = 0
  trace2.length = 0
  hint.value = '点击「开始」，观察红球匀速、蓝球加速的运动'
}

function reset() {
  resetRun()
  v1.value = 2
  a2.value = 0.5
  seen.move = seen.param = false
}

function tryComplete() {
  if (seen.move && seen.param && !completed) {
    completed = true
    hint.value = '匀速（s-t 直线、v-t 水平线）与变速（曲线）对比完成！'
    emit('complete')
  }
}

function setupCanvas() {
  const canvas = canvasRef.value
  dpr = window.devicePixelRatio || 1
  ctx = canvas.getContext('2d')
  resizeCanvas()
}

let resizeObs = null

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  const rect = canvas.getBoundingClientRect()
  const cw = Math.max(200, rect.width)
  const ch = Math.max(200, rect.height)
  const scale = Math.min((cw * dpr) / W, (ch * dpr) / H)
  canvas.width = Math.max(1, Math.round(cw * dpr))
  canvas.height = Math.max(1, Math.round(ch * dpr))
  canvas.style.height = ''
  ctx.setTransform(scale, 0, 0, scale, (cw * dpr - W * scale) / 2, (ch * dpr - H * scale) / 2)
}

const C = {
  bg0: '#0a0d14',
  bg1: '#0e1320',
  grid: 'rgba(140,165,210,0.09)',
  red: '#ff3b4d',
  blue: '#6ea8ff',
  amber: '#ffc94d',
  text: '#c9d1d9',
  muted: '#7d8794',
  finish: '#4ade80'
}

function trackX(s) {
  return trackX0 + (Math.min(s, S) / S) * (trackX1 - trackX0)
}

function drawBall(x, y, color) {
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 13, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.beginPath()
  ctx.arc(x - 4, y - 5, 4, 0, Math.PI * 2)
  ctx.fill()
}

function drawTracks() {
  paintBoard(ctx, W, H, 'chalk')

  for (const ty of [trackY1, trackY2]) {
    ctx.strokeStyle = 'rgba(225,238,228,0.5)'
    ctx.lineWidth = 2
    ctx.setLineDash([12, 8])
    ctx.beginPath()
    ctx.moveTo(trackX0, ty)
    ctx.lineTo(trackX1, ty)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 终点线
  ctx.strokeStyle = C.finish
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(trackX1, trackY1 - 20)
  ctx.lineTo(trackX1, trackY2 + 20)
  ctx.stroke()
  ctx.fillStyle = C.finish
  ctx.font = '700 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('终点 60 m', trackX1, trackY2 + 40)
}

function drawChart(x0, y0, w, h, title, drawFn, opts = {}) {
  const { xLabel = '', yLabel = '' } = opts
  const padL = 24, padR = 6, padT = 22, padB = 16
  const px = x0 + padL
  const py = y0 + padT
  const pw = w - padL - padR
  const ph = h - padT - padB

  ctx.fillStyle = 'rgba(14,19,32,0.92)'
  ctx.strokeStyle = 'rgba(150,170,210,0.4)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.rect(x0, y0, w, h)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = C.text
  ctx.font = '700 12px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(title, x0 + 8, y0 + 16)

  ctx.save()
  ctx.beginPath()
  ctx.rect(px, py, pw, ph)
  ctx.clip()
  // 坐标轴（左 + 下）
  ctx.strokeStyle = 'rgba(150,170,210,0.55)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(px, py)
  ctx.lineTo(px, py + ph)
  ctx.lineTo(px + pw, py + ph)
  ctx.stroke()
  drawFn({ px, py, pw, ph })
  ctx.restore()

  // 轴标
  ctx.fillStyle = C.muted
  ctx.font = '11px sans-serif'
  if (yLabel) {
    ctx.save()
    ctx.translate(x0 + 12, py + ph / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(yLabel, 0, 0)
    ctx.restore()
  }
  if (xLabel) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(xLabel, px + pw / 2, y0 + h - 3)
  }
}

function drawST() {
  const x0 = 36
  const y0 = 260
  const w = 382
  const h = 120
  const tMax = Math.max(t1f.value, t2f.value) * 1.05
  drawChart(x0, y0, w, h, 's–t 图像（路程—时间）', ({ px, py, pw, ph }) => {
    const X = (t) => px + (t / tMax) * pw
    const Y = (s) => py + ph - (Math.min(s, S) / S) * ph

    ctx.strokeStyle = C.red
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(X(0), Y(0))
    ctx.lineTo(X(Math.min(t, t1f.value)), Y(Math.min(v1.value * Math.min(t, t1f.value), S)))
    ctx.stroke()

    ctx.strokeStyle = C.blue
    ctx.lineWidth = 2.5
    const n = Math.min(trace2.length, 240)
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const p = trace2[i]
      if (i === 0) ctx.moveTo(X(p.t), Y(p.s))
      else ctx.lineTo(X(p.t), Y(p.s))
    }
    ctx.stroke()
  }, { xLabel: '时间 t / s', yLabel: '路程 s / m' })
}

function drawVT() {
  const x0 = 442
  const y0 = 260
  const w = 382
  const h = 120
  const tMax = Math.max(t1f.value, t2f.value) * 1.05
  const vMax = Math.max(v1.value, a2.value * tMax, 0.1) * 1.1
  drawChart(x0, y0, w, h, 'v–t 图像（速度—时间）', ({ px, py, pw, ph }) => {
    const X = (t) => px + (t / tMax) * pw
    const Y = (v) => py + ph - (v / vMax) * ph

    ctx.strokeStyle = C.red
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(X(0), Y(v1.value))
    ctx.lineTo(X(Math.min(t, tMax)), Y(v1.value))
    ctx.stroke()

    ctx.strokeStyle = C.blue
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(X(0), Y(0))
    ctx.lineTo(X(Math.min(t, tMax)), Y(a2.value * Math.min(t, tMax)))
    ctx.stroke()
  }, { xLabel: '时间 t / s', yLabel: '速度 v / (m·s⁻¹)' })
}

function render() {
  if (!ctx) return
  drawTracks()

  drawBall(trackX(s1), trackY1, C.red)
  drawBall(trackX(s2), trackY2, C.blue)

  ctx.textAlign = 'left'
  ctx.fillStyle = C.text
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('红球：匀速直线运动　v₁ = ' + v1.value + ' m/s（' + kmh.value + ' km/h）', 36, 60)
  ctx.fillStyle = C.blue
  ctx.fillText('蓝球：匀加速运动　a₂ = ' + a2.value + ' m/s²', 36, 82)
  ctx.fillStyle = C.amber
  ctx.font = '600 13px sans-serif'
  ctx.fillText('计时 ' + t.toFixed(1) + ' s　·　红球 ' + s1.toFixed(1) + ' m　·　蓝球 ' + s2.toFixed(1) + ' m', 36, 104)
  ctx.fillStyle = C.text
  ctx.fillText(leader.value + '（相同时间比路程）', 36, 230)

  drawST()
  drawVT()
}

function loop() {
  flickerT += 1
  if (running.value && !done.value) {
    const dt = 0.08
    t += dt
    s1 += v1.value * dt
    s2 += v2 * dt + 0.5 * a2.value * dt * dt
    v2 += a2.value * dt
    trace2.push({ t, s: s2 })

    const s1Done = s1 >= S
    const s2Done = s2 >= S
    if (s1Done) s1 = S
    if (s2Done) s2 = S
    if (s1Done || s2Done) {
      running.value = false
      done.value = true
      hint.value = t1f.value < t2f.value ? '红球先到终点 —— 相同路程比时间' : t2f.value < t1f.value ? '蓝球先到终点 —— 匀加速运动更快' : '同时到达！'
    }
  }
  render()
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  setupCanvas()
  if (window.ResizeObserver) {
    resizeObs = new ResizeObserver(() => resizeCanvas())
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
        <canvas ref="canvasRef" style="display:block;width:100%"></canvas>
      </div>

      <div class="lab-actions">
        <button class="btn btn-primary" @click="startPause">{{ done ? '重跑' : running ? '暂停' : '开始' }}</button>
        <button class="btn" @click="reset">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>可调变量</strong>
          <span>实时联动</span>
        </div>
        <div class="lab-params">
          <ParamSlider
            v-model="v1"
            :min="1"
            :max="6"
            :step="0.5"
            label="红球速度 v₁"
            unit=" m/s"
            hint="速度恒定 → s–t 图像为过原点倾斜直线"
          />
          <ParamSlider
            v-model="a2"
            :min="0.2"
            :max="1.2"
            :step="0.1"
            label="蓝球加速度 a₂"
            unit=" m/s²"
            hint="速度不断增大 → s–t 图像为曲线，v–t 图像为斜线"
          />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实时数据</strong>
          <span>只读输出</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat">
            <span>计时 t</span>
            <strong>{{ t.toFixed(1) }} s</strong>
          </div>
          <div class="lab-stat accent">
            <span>红球 s₁ / v₁</span>
            <strong style="font-size:12px">{{ s1.toFixed(1) }} m / {{ v1 }} m/s</strong>
          </div>
          <div class="lab-stat">
            <span>蓝球 s₂ / v₂</span>
            <strong style="font-size:12px">{{ s2.toFixed(1) }} m / {{ v2.toFixed(1) }} m/s</strong>
          </div>
          <div class="lab-stat success">
            <span>当前比较</span>
            <strong style="font-size:12px">{{ leader }}</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="运动的快慢（速度）"
        formula="v = s / t　　s = vt　　t = s/v"
        desc="速度表示物体运动的快慢。匀速直线运动：沿直线且速度不变；变速运动用平均速度 v̄ = s总/t总 粗略描述。"
        :rows="[
          { label: '红球速度 v₁', value: v1 + ' m/s' },
          { label: '换算 km/h', value: kmh + ' km/h' },
          { label: '蓝球加速度 a₂', value: a2 + ' m/s²' }
        ]"
        :result="[
          { label: '1 m/s = 3.6 km/h', value: '换算×3.6' },
          { label: '匀速 s–t 图像', value: '过原点斜直线' },
          { label: '匀速 v–t 图像', value: '平行时间轴' }
        ]"
        :verify="[
          '比较快慢：相同时间比路程；相同路程比时间',
          '匀速直线运动：s–t 图像是过原点的倾斜直线，v–t 图像是平行时间轴的直线',
          '平均速度 v̄ = s总/t总，不是速度的平均值',
          '变速运动：速度不断变化，s–t 图像是曲线，v–t 图像是斜线'
        ]"
      />
    </aside>
  </div>
</template>