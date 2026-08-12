<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { playNoise, playTone } from '../../lib/audio'

const emit = defineEmits(['complete'])

const canvasRef = ref(null)
let ctx = null
let raf = null
let dpr = 1
let flickerT = 0

const W = 860
const H = 460

const distance = ref(50) // 到悬崖距离（米）
const sourceId = ref('class')

const SOURCES = [
  { id: 'whisper', label: '轻声细语', db: 20, harm: '安全范围', zone: 'safe', way: '—' },
  { id: 'class', label: '教室嘈杂', db: 60, harm: '可接受', zone: 'safe', way: '声源处：保持安静' },
  { id: 'horn', label: '汽车鸣笛', db: 90, harm: '损伤听力', zone: 'danger', way: '声源处：禁止鸣笛' },
  { id: 'saw', label: '电锯作业', db: 100, harm: '损伤听力', zone: 'danger', way: '人耳处：戴耳罩' },
  { id: 'plane', label: '飞机起降', db: 130, harm: '严重损伤听力', zone: 'danger', way: '传播中：隔音墙' }
]

const source = computed(() => SOURCES.find((s) => s.id === sourceId.value))

// 回声动画进度 0~1（0 喊出 → 0.5 到达悬崖 → 1 回到耳边）
const echoP = ref(0)
let echoActive = false

const echoTime = computed(() => (2 * distance.value) / 340)
const echoCan = computed(() => echoTime.value >= 0.1)

const seen = { echo: false, sources: new Set() }
let completed = false

// 音效
const muted = ref(false)

const hint = ref('点击「喊话」测回声，再点选不同噪声源观察分贝')
const startBtn = ref('📣 喊话')

const noiseLevel = computed(() => {
  const db = source.value.db
  if (db < 70) return '安全范围'
  if (db < 90) return '影响学习工作'
  return '⛔ 损伤听力'
})

function playSourceAudio(s) {
  switch (s.id) {
    case 'whisper':
      playNoise({ duration: 1.2, volume: 0.06, type: 'white', cutoff: 2500 })
      break
    case 'class':
      playNoise({ duration: 1.6, volume: 0.16, type: 'brown' })
      break
    case 'horn':
      for (let i = 0; i < 2; i++) {
        setTimeout(() => playTone({ freq: 420, duration: 0.24, volume: 0.28, type: 'sawtooth' }), i * 420)
      }
      break
    case 'saw':
      playTone({ freq: 110, duration: 1.3, volume: 0.22, type: 'sawtooth' })
      playNoise({ duration: 1.3, volume: 0.14, type: 'brown' })
      break
    case 'plane':
      playTone({ freq: 90, duration: 1.8, volume: 0.3, type: 'sine' })
      playNoise({ duration: 1.8, volume: 0.2, type: 'white', cutoff: 500 })
      break
  }
}

function shout() {
  if (echoActive) return
  echoActive = true
  echoP.value = 0
  if (!muted.value) {
    playTone({ freq: 250, duration: 0.12, volume: 0.35, type: 'sine' })
    const delayMs = Math.round(echoTime.value * 1000)
    if (delayMs > 0) {
      setTimeout(() => playTone({ freq: 250, duration: 0.2, volume: 0.14, type: 'sine' }), delayMs)
    }
  }
  if (!seen.echo) {
    seen.echo = true
    hint.value = echoCan.value ? '能听到回声（间隔 ≥ 0.1 s）' : '距离太近，原声与回声重叠'
    tryComplete()
  }
}

function pickSource(id) {
  sourceId.value = id
  seen.sources.add(id)
  if (!muted.value) playSourceAudio(source.value)
  hint.value = `${source.value.label}：${source.value.db} dB —— ${source.value.way}`
  tryComplete()
}

function tryComplete() {
  if (seen.echo && seen.sources.size >= 2 && !completed) {
    completed = true
    emit('complete')
    hint.value = '回声测距 + 噪声分贝都体验过 —— 实验完成！'
  }
}

function reset() {
  distance.value = 50
  sourceId.value = 'class'
  echoActive = false
  echoP.value = 0
  seen.echo = false
  seen.sources.clear()
  hint.value = '点击「喊话」测回声，再点选不同噪声源观察分贝'
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

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name) || fallback
}

const groundY = 360
const meterY = 395

function drawPerson(x) {
  ctx.fillStyle = '#3a4a5a'
  ctx.beginPath()
  ctx.arc(x, 200, 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(x - 11, 216, 22, 46)
  // 举起的胳膊（喊话）
  ctx.strokeStyle = '#3a4a5a'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x + 8, 232)
  ctx.lineTo(x + 26, 208)
  ctx.stroke()
  // 嘴巴
  ctx.fillStyle = '#d92135'
  ctx.beginPath()
  ctx.arc(x + 12, 202, 4, 0, Math.PI * 2)
  ctx.fill()
}

function drawCliff() {
  const cliffX = 480 + (distance.value / 100) * 300
  const top = 120
  ctx.fillStyle = '#8a8178'
  ctx.beginPath()
  ctx.moveTo(cliffX, top)
  ctx.lineTo(cliffX + 160, 150)
  ctx.lineTo(cliffX + 200, groundY)
  ctx.lineTo(cliffX + 40, groundY)
  ctx.lineTo(cliffX, 230)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.moveTo(cliffX + 40, groundY)
  ctx.lineTo(cliffX + 160, 150)
  ctx.lineTo(cliffX + 200, groundY)
  ctx.closePath()
  ctx.fill()
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.beginPath()
  ctx.moveTo(cliffX, top)
  ctx.lineTo(cliffX + 10, 220)
  ctx.lineTo(cliffX + 6, 200)
  ctx.closePath()
  ctx.fill()
}

function drawEcho() {
  const personX = 150
  const cliffX = 480 + (distance.value / 100) * 300
  if (!echoActive) return
  const p = echoP.value
  const accent = cssVar('--accent', '#ff3b4d')

  // 声波：去程与回程
  const drawArc = (fromX, toX, t, color, label) => {
    const x = fromX + (toX - fromX) * t
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    for (const r of [10, 20, 30]) {
      ctx.globalAlpha = 0.55 - r * 0.012
      ctx.beginPath()
      ctx.arc(x, 215, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    if (label) {
      ctx.fillStyle = color
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(label, x, 255)
    }
  }

  if (p < 0.5) {
    drawArc(personX, cliffX, p / 0.5, accent, '原声 →')
  } else {
    drawArc(cliffX, personX, (p - 0.5) / 0.5, '#0d9b61', '← 回声')
  }
}

function drawNoiseMeter() {
  const x0 = 80
  const x1 = 780
  const y = meterY
  const barH = 22
  const db = source.value.db
  const zones = [
    { from: 0, to: 70, color: 'rgba(13,155,97,0.35)' },
    { from: 70, to: 90, color: 'rgba(184,121,21,0.35)' },
    { from: 90, to: 130, color: 'rgba(217,33,53,0.35)' }
  ]
  for (const z of zones) {
    const zx0 = x0 + ((z.from) / 130) * (x1 - x0)
    const zx1 = x0 + (z.to / 130) * (x1 - x0)
    ctx.fillStyle = z.color
    ctx.fillRect(zx0, y, zx1 - zx0, barH)
  }
  ctx.strokeStyle = cssVar('--line', '#0b0b0b')
  ctx.lineWidth = 2
  ctx.strokeRect(x0, y, x1 - x0, barH)

  const mx = x0 + (db / 130) * (x1 - x0)
  ctx.fillStyle = '#d92135'
  ctx.beginPath()
  ctx.moveTo(mx - 8, y - 10)
  ctx.lineTo(mx + 8, y - 10)
  ctx.lineTo(mx, y + 2)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = cssVar('--text', '#555')
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('0', x0, y + barH + 14)
  ctx.fillText('70', x0 + (70 / 130) * (x1 - x0), y + barH + 14)
  ctx.fillText('90', x0 + (90 / 130) * (x1 - x0), y + barH + 14)
  ctx.fillText('130 dB', x1 - 36, y + barH + 14)
}

function render() {
  if (!ctx) return

  // 背景
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#dfe9f5')
  g.addColorStop(1, '#f6f1e6')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // 地面
  ctx.fillStyle = '#cbb98f'
  ctx.fillRect(0, groundY, W, H - groundY)
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.fillRect(0, groundY, W, 4)

  drawCliff()
  drawPerson(150)
  drawEcho()
  drawNoiseMeter()

  const textH = cssVar('--text-h', '#111')
  const textCol = cssVar('--text', '#555')
  ctx.textAlign = 'left'
  ctx.fillStyle = textH
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText('🏔️ 回声测距 · 噪声分贝表', 40, 40)
  ctx.fillStyle = textCol
  ctx.font = '13px sans-serif'
  ctx.fillText(
    echoActive
      ? echoCan.value
        ? `回声时间 ${echoTime.value.toFixed(3)} s ≥ 0.1 s，能区分原声与回声`
        : '间隔 < 0.1 s，原声与回声重叠，听不清'
      : `距离悬崖 ${distance.value} m，点击「喊话」向悬崖大喊`,
    40,
    64
  )
  ctx.fillStyle = textH
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText(`当前声源：${source.value.label}　${source.value.db} dB`, 80, meterY - 20)
}

function loop() {
  flickerT += 1
  if (echoActive) {
    echoP.value += 1 / 72
    if (echoP.value >= 1) echoActive = false
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
        <button class="btn btn-primary" @click="shout">{{ startBtn }}</button>
        <button class="btn" :class="{ 'btn-primary': muted }" @click="muted = !muted">{{ muted ? '静音' : '音效开' }}</button>
        <button class="btn" @click="reset">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>可调变量 / 噪声源</strong>
          <span>实时联动</span>
        </div>
        <div class="lab-params">
          <ParamSlider
            v-model="distance"
            :min="5"
            :max="100"
            :step="1"
            label="到悬崖距离 d"
            unit=" m"
            hint="d ≥ 17 m 时回声间隔 ≥ 0.1 s，可区分原声与回声"
          />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 12px 12px">
          <button
            v-for="s in SOURCES"
            :key="s.id"
            class="btn btn-sm"
            :class="{ 'btn-primary': sourceId === s.id }"
            @click="pickSource(s.id)"
          >{{ s.label }}</button>
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实时数据</strong>
          <span>只读输出</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat">
            <span>回声时间 t=2d/v</span>
            <strong>{{ echoTime.toFixed(3) }} s</strong>
          </div>
          <div class="lab-stat accent">
            <span>能否区分回声</span>
            <strong style="font-size:13px">{{ echoCan ? '能（≥0.1s）' : '不能（<0.1s）' }}</strong>
          </div>
          <div class="lab-stat success">
            <span>当前噪声</span>
            <strong>{{ source.db }} dB</strong>
          </div>
          <div class="lab-stat" :class="{ accent: source.db >= 90 }">
            <span>危害等级</span>
            <strong style="font-size:12px">{{ noiseLevel }}</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="回声与噪声"
        formula="t = 2d / v　　（回声路程 = 2d）"
        desc="声音传播到障碍物再反射回来，传播路程为往返距离 2d；人耳区分原声与回声需间隔 ≥ 0.1 s，对应 d ≥ 17 m。"
        :rows="[
          { label: '声速（15℃ 空气）', value: '340 m/s' },
          { label: '距离 d', value: distance + ' m' },
          { label: '回声时间 t', value: echoTime.toFixed(3) + ' s' }
        ]"
        :result="[
          { label: '区分条件', value: 't ≥ 0.1 s' },
          { label: '最小距离', value: 'd ≥ 17 m' }
        ]"
        :verify="[
          '0 dB 不是没有声音，而是人耳刚能听到的最微弱声音',
          '> 70 dB 影响学习工作，> 90 dB 损伤听力',
          '控制噪声三途径：防止噪声产生（声源处）、阻断传播（传播中）、防止入耳（人耳处）',
          '噪声环保角度：妨碍正常休息、学习、工作的声音都算噪声'
        ]"
      />
    </aside>
  </div>
</template>
