<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { playNoise, playTone } from '../../lib/audio'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

const canvasRef = ref(null)
let ctx = null
let raf = null
let dpr = 1
let frame = 0

/* 响应式逻辑画布尺寸：直接等于容器 CSS 像素，配合 dpr 变换，
   使绘制始终铺满容器，边框内不出现留白或空白区域 */
let CW = 880
let CH = 470
let groundY = 360

const mode = ref('echo') // echo | noise | car-echo
const distance = ref(50)
const sourceId = ref('class')
const muted = ref(false)

/* ============ 图片预加载 ============ */
const carImg = new Image(); carImg.src = '/assets/lab/car.png'
const roadImg = new Image(); roadImg.src = '/assets/lab/road.png'
let roadPatt = null
function getRoadPatt() {
  if (!ctx) return null
  if (!roadPatt && roadImg.complete && roadImg.naturalWidth) {
    roadPatt = ctx.createPattern(roadImg, 'repeat')
  }
  return roadPatt
}

/* ============ 噪声源数据 ============ */
const SOURCES = [
  { id: 'whisper', label: '轻声细语', db: 20, harm: '安全范围', path: 'none', way: '—', icon: '🤫' },
  { id: 'class', label: '教室嘈杂', db: 60, harm: '可接受', path: 'source', way: '声源处：保持安静', icon: '🗣️' },
  { id: 'horn', label: '汽车鸣笛', db: 90, harm: '损伤听力', path: 'source', way: '声源处：禁止鸣笛', icon: '📢' },
  { id: 'saw', label: '电锯作业', db: 100, harm: '损伤听力', path: 'ear', way: '人耳处：戴耳罩', icon: '🪚' },
  { id: 'plane', label: '飞机起降', db: 130, harm: '严重损伤', path: 'path', way: '传播中：隔音墙', icon: '✈️' }
]
const source = computed(() => SOURCES.find((s) => s.id === sourceId.value))

/* ============ 回声模型（山崖固定，汽车移动体现距离） ============ */
const D_MIN = 5, D_MAX = 100
let wallX = 784
let cliffFaceX = 776            // 山崖反射面（高光左缘），wave 实际在此反射
let personNearX = 654           // 距山崖最近的汽车中心（d=D_MIN）
let personFarX = 120            // 最远位置（d=D_MAX）
let person17X = 600
function personXAt(d) {
  return personFarX + (1 - (d - D_MIN) / (D_MAX - D_MIN)) * (personNearX - personFarX)
}
const echoTime = computed(() => (2 * distance.value) / 340)
const echoCan = computed(() => echoTime.value >= 0.1)

/* 汽车尺寸（绘制时统一引用） */
const CAR_W = 92
const CAR_H = 68

/* ============ 噪声布局（随容器自适应） ============ */
let srcX = 730
let earX = 104
let noiseWallX = 417
let srcY = 276

/* 声波交互：点击“鸣笛”或点击画布，生成一个向前运动、遇崖反射返回的声波包 */
let wave = { active: false, prog: 0, frames: 150, path: 1 }
let echoPlayed = false
let justEchoed = ref(false)
let echoFlash = 0

/* ============ 噪声动画相位 ============ */
let noisePhase = 0
const noiseLevel = computed(() => {
  const db = source.value.db
  if (db < 70) return '安全范围'
  if (db < 90) return '影响学习工作'
  return '⛔ 损伤听力'
})

/* ============ 汽车回声（例题）演示 ============ */
// 题：汽车以 v_car 速度驶向山崖，按喇叭 3 s 后听到回声（声速 340 m/s），
// 求听到回声时车与山崖的距离。
const carSpeed = ref(20)        // m/s
const V_SOUND = 340             // m/s（15℃ 空气，固定）
const ECHO_T = 3                // s（题目给定）
// 按喇叭时距山崖 D0 = T/2 * (v声 + v车)，使回声恰好在 T 秒后返回
const d0 = computed(() => 1.5 * (V_SOUND + carSpeed.value))
// 听到回声时距山崖 D1 = T/2 * (v声 - v车) = 480 m（v车=20 时）
const dAtEcho = computed(() => 1.5 * (V_SOUND - carSpeed.value))

let carDemo = { running: false, t0: 0, elapsed: 0, done: false }
function honk() {
  if (carDemo.running) return
  if (carDemo.done) resetCarDemo()
  carDemo.running = true
  carDemo.t0 = performance.now()
  carDemo.elapsed = 0
  carDemo.done = false
  if (!muted.value) playTone({ freq: 420, duration: 0.18, volume: 0.2, type: 'triangle' })
  hint.value = '声波向山崖传去，3 s 后将听到回声 —— 留意车与山崖的距离在减小'
}
function resetCarDemo() {
  carDemo = { running: false, t0: 0, elapsed: 0, done: false }
}

/* ============ 交互 / 完成 ============ */
const seen = { echo: false, carEcho: false, sources: new Set() }
let completed = false
const hint = ref('点「📯 按喇叭」或点击画面，汽车鸣笛后声波从山崖反射返回')

const actionLabel = computed(() => {
  if (mode.value === 'echo') return wave.active ? '鸣笛中…' : '📯 按喇叭'
  if (mode.value === 'car-echo') return carDemo.running ? '鸣笛中…' : carDemo.done ? '🔄 再演示一次' : '📯 按喇叭开始'
  return ''
})
function runAction() {
  if (mode.value === 'echo') shout()
  else if (mode.value === 'car-echo') honk()
}

function playSourceAudio(s) {
  switch (s.id) {
    case 'whisper': playNoise({ duration: 1.2, volume: 0.06, type: 'white', cutoff: 2500 }); break
    case 'class': playNoise({ duration: 1.6, volume: 0.16, type: 'brown' }); break
    case 'horn': for (let i = 0; i < 2; i++) setTimeout(() => playTone({ freq: 420, duration: 0.24, volume: 0.28, type: 'sawtooth' }), i * 420); break
    case 'saw': playTone({ freq: 110, duration: 1.3, volume: 0.22, type: 'sawtooth' }); playNoise({ duration: 1.3, volume: 0.14, type: 'brown' }); break
    case 'plane': playTone({ freq: 90, duration: 1.8, volume: 0.3, type: 'sine' }); playNoise({ duration: 1.8, volume: 0.2, type: 'white', cutoff: 500 }); break
  }
}

function shout() {
  if (wave.active) return
  const mouthX = personXAt(distance.value) + CAR_W / 2 - 4  // 喇叭口位置
  wave.active = true
  wave.prog = 0
  wave.path = 2 * (cliffFaceX - mouthX)
  wave.frames = Math.round(70 + distance.value * 1.1) // 距离越远，往返耗时越长
  echoPlayed = false
  if (!muted.value) playTone({ freq: 380, duration: 0.16, volume: 0.22, type: 'triangle' })
  if (!seen.echo) {
    seen.echo = true
    hint.value = echoCan.value ? '回声时间 ≥ 0.1 s，能区分原声与回声' : '距离太近，原声与回声重叠'
    tryComplete()
  }
}

function onCanvasClick() {
  if (mode.value === 'echo') shout()
  else if (mode.value === 'car-echo') honk()
}

function pickSource(id) {
  sourceId.value = id
  seen.sources.add(id)
  if (!muted.value) playSourceAudio(source.value)
  hint.value = `${source.value.icon} ${source.value.label}：${source.value.db} dB —— ${source.value.way}`
  tryComplete()
}

function tryComplete() {
  if ((seen.echo || seen.carEcho) && seen.sources.size >= 2 && !completed) {
    completed = true
    emit('complete')
    hint.value = '回声测距 + 噪声分贝与控制途径都体验过 —— 实验完成！'
  }
}

function reset() {
  distance.value = 50
  sourceId.value = 'class'
  wave.active = false
  wave.prog = 0
  seen.echo = false
  seen.carEcho = false
  seen.sources.clear()
  resetCarDemo()
  hint.value = mode.value === 'car-echo'
    ? '设定车速，点「按喇叭」开始 3 秒演示'
    : mode.value === 'noise'
      ? '点选不同噪声源，观察分贝数、危害等级与控制途径'
      : '点「📯 按喇叭」或点击画面，汽车鸣笛后声波从山崖反射返回'
}

watch(mode, (m) => {
  resetCarDemo()
  if (m === 'echo') hint.value = '点「📯 按喇叭」或点击画面，汽车鸣笛后声波从山崖反射返回'
  else if (m === 'car-echo') hint.value = '设定车速，点「按喇叭」开始 3 秒演示'
  else hint.value = '点选不同噪声源，观察分贝数、危害等级与控制途径'
})

/* ============ 画布初始化（响应式铺满） ============ */
function setupCanvas() {
  const canvas = canvasRef.value
  dpr = window.devicePixelRatio || 1
  ctx = canvas.getContext('2d')
  resizeCanvas()
}
let resizeObs = null
function layout() {
  groundY = CH - 110
  wallX = CW - 96
  cliffFaceX = wallX - 8
  personNearX = wallX - 130
  personFarX = 120
  person17X = personXAt(17)
  srcX = CW - 150
  earX = 104
  noiseWallX = (srcX + earX) / 2
  srcY = groundY - 84
  roadPatt = null // 容器尺寸变了，重建 pattern
}
function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  const rect = canvas.getBoundingClientRect()
  CW = Math.max(320, rect.width)
  CH = Math.max(240, rect.height)
  canvas.width = Math.round(CW * dpr)
  canvas.height = Math.round(CH * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  layout()
}
function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name) || fallback
}
function roundRectPath(x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return }
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/* ============ 场景公共元素 ============ */
function drawSky() {
  paintBoard(ctx, CW, CH, 'chalk')
}
function drawGround() {
  // 地面线（粉笔色描边，露出统一黑板底）
  ctx.strokeStyle = 'rgba(225,238,228,0.5)'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(CW, groundY); ctx.stroke()
  ctx.strokeStyle = 'rgba(225,238,228,0.25)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, groundY + 4); ctx.lineTo(CW, groundY + 4); ctx.stroke()
}
function drawRoad() {
  // 用 road.png 平铺做路面；未加载完用灰色兜底
  const patt = getRoadPatt()
  const ry = groundY
  const rh = 40
  ctx.fillStyle = patt || '#4a4a4a'
  ctx.fillRect(0, ry, CW, rh)
  ctx.strokeStyle = 'rgba(225,238,228,0.45)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(CW, ry); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, ry + rh); ctx.lineTo(CW, ry + rh); ctx.stroke()
}

/* 人物：腿长与躯干/头部协调，双脚着地，整体比例自然
   （保留：噪声模式的“听者”，用于“人耳处”控制点） */
function drawPerson(x, mouthOpen, isEarMode, earBlocked) {
  const skin = '#e6b48f', cloth = '#3a4a5a', leg = '#2b3640'
  const hipY = groundY - 84
  const shoulderY = hipY - 50
  const headY = shoulderY - 14
  ctx.strokeStyle = leg; ctx.lineWidth = 7; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x - 6, hipY); ctx.lineTo(x - 7, (hipY + groundY) / 2); ctx.lineTo(x - 6, groundY - 6); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + 6, hipY); ctx.lineTo(x + 7, (hipY + groundY) / 2); ctx.lineTo(x + 6, groundY - 6); ctx.stroke()
  ctx.fillStyle = '#1f282f'
  ctx.beginPath(); ctx.ellipse(x - 11, groundY - 3, 9, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(x + 11, groundY - 3, 9, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = cloth
  roundRectPath(x - 12, shoulderY, 24, hipY - shoulderY + 2, 10); ctx.fill()
  ctx.strokeStyle = cloth; ctx.lineWidth = 7; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x + 8, shoulderY + 10); ctx.lineTo(x + 26, shoulderY - 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x - 8, shoulderY + 10); ctx.lineTo(x - 17, shoulderY + 32); ctx.stroke()
  ctx.fillStyle = skin
  ctx.beginPath(); ctx.arc(x, headY, 14, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#3a2c22'
  ctx.beginPath(); ctx.arc(x, headY - 3, 14, Math.PI * 1.02, Math.PI * 1.98); ctx.fill()
  ctx.fillStyle = '#2a2a2a'
  ctx.beginPath(); ctx.arc(x + 5, headY - 1, 1.9, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = mouthOpen ? '#7a1f2b' : '#6a4040'
  ctx.beginPath()
  if (mouthOpen) ctx.ellipse(x + 6, headY + 5, 5, 3.4, 0, 0, Math.PI * 2)
  else ctx.ellipse(x + 6, headY + 5, 2.4, 1.3, 0, 0, Math.PI * 2)
  ctx.fill()
  const earXp = x - 14
  ctx.fillStyle = isEarMode ? '#caa37a' : '#d2a884'
  ctx.beginPath(); ctx.arc(earXp, headY, 3.6, 0, Math.PI * 2); ctx.fill()
  if (isEarMode && earBlocked) {
    ctx.fillStyle = '#2b2b2b'
    ctx.beginPath(); ctx.arc(earXp - 2, headY, 9, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#444'
    ctx.beginPath(); ctx.arc(earXp - 2, headY, 5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(earXp - 2, headY - 9); ctx.lineTo(earXp - 2, headY + 9); ctx.stroke()
  }
}

/* 汽车：car.png 面朝右，x 为车身中心，底边贴地面 */
function drawCar(x, honking) {
  const cw = CAR_W, ch = CAR_H
  const jx = honking ? Math.sin(frame * 0.7) * 1.4 : 0
  if (carImg.complete && carImg.naturalWidth) {
    ctx.drawImage(carImg, x - cw / 2 + jx, groundY - ch, cw, ch)
  } else {
    ctx.fillStyle = '#5b6570'
    roundRectPath(x - cw / 2, groundY - ch, cw, ch - 18, 10); ctx.fill()
    ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 2; ctx.stroke()
  }
  // 鸣笛时喇叭波纹
  if (honking) {
    const hx = x + cw / 2 - 4
    const hy = groundY - ch * 0.55
    ctx.strokeStyle = 'rgba(123,91,214,0.55)'; ctx.lineWidth = 2
    for (let i = 1; i <= 3; i++) {
      const r = i * 7 + (frame % 12)
      ctx.beginPath(); ctx.arc(hx, hy, r, -0.55, 0.55); ctx.stroke()
    }
  }
}

/* 山崖（替代原墙）：褐色山体 + 反射面高光 */
function drawCliffStatic() {
  const wx = wallX, w = 30
  const top = groundY - 220
  const g = ctx.createLinearGradient(wx, 0, wx + w, 0)
  g.addColorStop(0, '#a8916a'); g.addColorStop(1, '#6e5a3c')
  roundRectPath(wx - 10, top, w + 20, groundY - top, 8)
  ctx.fillStyle = g; ctx.fill()
  ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 2.5
  roundRectPath(wx - 10, top, w + 20, groundY - top, 8); ctx.stroke()
  // 岩层纹
  ctx.strokeStyle = 'rgba(60,45,30,0.45)'; ctx.lineWidth = 1
  for (let y = top + 22; y < groundY - 6; y += 26) {
    ctx.beginPath(); ctx.moveTo(wx - 8, y); ctx.lineTo(wx + w + 8, y); ctx.stroke()
  }
  // 反射面高光（左缘）
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(wx - 8, top + 4); ctx.lineTo(wx - 8, groundY - 4); ctx.stroke()
  // 峰顶略斜
  ctx.fillStyle = '#3a2a18'
  ctx.beginPath(); ctx.moveTo(wx - 10, top); ctx.lineTo(wx + w + 10, top); ctx.lineTo(wx + w + 10, top + 8); ctx.lineTo(wx - 10, top + 8); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#3a3026'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText('山崖 · 反射面', wx + w / 2, top - 8)
}

/* ============ 回声模式：固定山崖 + 单条行进声波包 ============ */
function drawTravelWave() {
  const px = personXAt(distance.value)
  const mouthX = px + CAR_W / 2 - 4
  const half = cliffFaceX - mouthX
  const dist = wave.prog * wave.path
  let front = dist <= half ? mouthX + dist : cliffFaceX - (dist - half)
  front = Math.max(mouthX, Math.min(cliffFaceX, front))
  const reflected = dist > half
  const y0 = groundY - 150
  const Wpk = Math.min(190, Math.max(90, half * 0.9))
  const steps = 84
  const k = 0.16
  const phase = frame / 9
  const amp = 14
  const g = ctx.createLinearGradient(front - Wpk / 2, 0, front + Wpk / 2, 0)
  if (reflected) { g.addColorStop(0, '#9b6bf0'); g.addColorStop(1, '#6a4fd0') }
  else { g.addColorStop(0, '#2f9fd0'); g.addColorStop(1, '#7b5bd6') }
  ctx.save()
  ctx.strokeStyle = g
  ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.shadowColor = reflected ? 'rgba(123,91,214,0.5)' : 'rgba(47,159,208,0.5)'
  ctx.shadowBlur = 8
  ctx.beginPath()
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = front - Wpk / 2 + Wpk * t
    const env = Math.sin(t * Math.PI)
    const y = y0 + env * Math.sin((x - front) * k - phase) * amp
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
  ctx.fillStyle = reflected ? '#6a4fd0' : '#2f9fd0'
  ctx.beginPath(); ctx.arc(front, y0, 4, 0, Math.PI * 2); ctx.fill()
}

function drawEchoMode() {
  drawSky(); drawRoad()
  const px = personXAt(distance.value)
  // 17 m 固定参考线（细虚线）
  ctx.strokeStyle = echoCan.value ? 'rgba(13,155,97,0.7)' : 'rgba(217,33,53,0.7)'
  ctx.lineWidth = 1.5; ctx.setLineDash([5, 5])
  ctx.beginPath(); ctx.moveTo(person17X, groundY - 210); ctx.lineTo(person17X, groundY); ctx.stroke(); ctx.setLineDash([])
  ctx.fillStyle = echoCan.value ? '#0d9b61' : '#d92135'
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText('17 m', person17X, groundY - 216)
  // 山崖
  drawCliffStatic()
  // 距离标签（路面下方）
  ctx.fillStyle = '#3a3026'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('d = ' + distance.value + ' m', px, groundY + 48)
  // 汽车（鸣笛时整体微抖 + 喇叭波纹）
  drawCar(px, wave.active && wave.prog < 0.12)
  // 行进声波包
  if (wave.active) drawTravelWave()
  // 回声返回提示
  if (justEchoed.value && echoFlash > 0) {
    ctx.fillStyle = `rgba(123,91,214,${Math.min(1, echoFlash)})`
    ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('🔊 回声返回', px, groundY - 168)
  }
  // 标题与说明
  ctx.fillStyle = cssVar('--text-h', '#111'); ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('🚗 回声测距：汽车鸣笛，声波从山崖反射返回', 28, 22)
  ctx.fillStyle = cssVar('--text', '#555'); ctx.font = '13px sans-serif'
  const desc = wave.active
    ? (echoCan.value ? `回声时间 ${echoTime.value.toFixed(3)} s ≥ 0.1 s，能区分原声与回声` : '间隔 < 0.1 s，原声与回声重叠，听不清')
    : `距山崖 ${distance.value} m（山崖固定，移动汽车改变距离），点「按喇叭」或画面发声`
  ctx.fillText(desc, 28, 46)
}

/* ============ 噪声模式 ============ */
function drawSource(x, s, blocked) {
  const y = srcY
  ctx.fillStyle = blocked ? '#9aa0a6' : '#5b6570'
  roundRectPath(x - 56, y - 30, 112, 60, 10); ctx.fill()
  ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 2.5; ctx.stroke()
  const vib = blocked ? 0 : Math.sin(frame / 4) * 4
  ctx.fillStyle = '#e9edf2'
  ctx.beginPath(); ctx.ellipse(x - 18, y, 14, 18 + vib, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#5b6570'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.fillStyle = '#3a3f45'
  ctx.beginPath(); ctx.arc(x - 18, y, 5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(s.icon + ' ' + s.label, x + 18, y)
  if (blocked) {
    ctx.strokeStyle = '#d92135'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(x, y - 52, 16, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - 11, y - 63); ctx.lineTo(x + 11, y - 41); ctx.stroke()
    ctx.fillStyle = '#d92135'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('禁鸣', x, y - 74)
  }
}
function drawNoiseWaves() {
  const sx = srcX, sy = srcY
  let baseA = 0.85
  if (source.value.path === 'source') baseA = 0.1
  const pathCtl = source.value.path === 'path'
  for (let i = 0; i < 9; i++) {
    let r = (noisePhase * 1.7 + i * 24) % 240
    const a = baseA * (1 - r / 240)
    if (a <= 0.02) continue
    ctx.save()
    if (pathCtl) { ctx.beginPath(); ctx.rect(0, 0, noiseWallX, CH); ctx.clip() }
    ctx.strokeStyle = `rgba(217,33,53,${a})`; ctx.lineWidth = 2.4
    ctx.beginPath(); ctx.arc(sx, sy, r, Math.PI / 2, Math.PI * 3 / 2); ctx.stroke()
    ctx.restore()
    if (pathCtl) {
      ctx.save()
      ctx.beginPath(); ctx.rect(noiseWallX, 0, CW - noiseWallX, CH); ctx.clip()
      ctx.strokeStyle = `rgba(217,33,53,${a * 0.16})`; ctx.lineWidth = 2.4
      ctx.beginPath(); ctx.arc(sx, sy, r, Math.PI / 2, Math.PI * 3 / 2); ctx.stroke()
      ctx.restore()
    }
  }
}
function drawGate(x, y, label, active, drawIcon) {
  ctx.fillStyle = active ? cssVar('--accent', '#ff3b4d') : 'rgba(120,120,120,0.55)'
  ctx.beginPath(); ctx.arc(x, y, active ? 9 : 6, 0, Math.PI * 2); ctx.fill()
  if (active) {
    ctx.strokeStyle = cssVar('--accent', '#ff3b4d'); ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = cssVar('--accent', '#ff3b4d'); ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('✓ ' + label, x, y - 20)
  } else {
    ctx.fillStyle = 'rgba(90,90,90,0.75)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(label, x, y - 14)
  }
  if (drawIcon) drawIcon()
}
function drawWall() {
  ctx.fillStyle = '#7a6a55'
  ctx.fillRect(noiseWallX - 9, srcY - 64, 18, groundY - (srcY - 64))
  ctx.strokeStyle = '#4a3f30'; ctx.lineWidth = 1
  for (let y = srcY - 60; y < groundY; y += 12) {
    ctx.beginPath(); ctx.moveTo(noiseWallX - 9, y); ctx.lineTo(noiseWallX + 9, y); ctx.stroke()
  }
  for (let y = srcY - 54; y < groundY; y += 24) {
    ctx.beginPath(); ctx.moveTo(noiseWallX - 9, y); ctx.lineTo(noiseWallX + 9, y + 12); ctx.stroke()
  }
  ctx.fillStyle = '#4a3f30'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText('隔音墙', noiseWallX, srcY - 68)
}
function drawNoiseMode() {
  drawSky(); drawGround()
  const active = source.value.path
  const blocked = active === 'source'
  drawPerson(earX, false, true, active === 'ear')
  if (active === 'path') drawWall()
  drawSource(srcX, source.value, blocked)
  drawNoiseWaves()
  drawGate(srcX, srcY - 30, '① 声源处', active === 'source', null)
  drawGate(noiseWallX, srcY - 40, '② 传播中', active === 'path', null)
  drawGate(earX, srcY - 46, '③ 人耳处', active === 'ear', null)
  ctx.strokeStyle = active === 'path' ? cssVar('--accent', '#ff3b4d') : 'rgba(120,120,120,0.4)'
  ctx.lineWidth = active === 'path' ? 3 : 1.5; ctx.setLineDash([6, 5])
  ctx.beginPath(); ctx.moveTo(srcX, srcY); ctx.lineTo(earX, srcY); ctx.stroke(); ctx.setLineDash([])
  drawNoiseMeter()
  ctx.fillStyle = cssVar('--text-h', '#111'); ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(`🔊 噪声控制：${source.value.icon} ${source.value.label} ${source.value.db} dB`, 28, 22)
  ctx.fillStyle = cssVar('--text', '#555'); ctx.font = '13px sans-serif'
  ctx.fillText(`${source.value.harm}　控制途径：${source.value.way}`, 28, 46)
}
function drawNoiseMeter() {
  const x0 = 70, x1 = CW - 70, y = CH - 58, barH = 22
  const db = source.value.db
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  roundRectPath(x0 - 10, y - 8, (x1 - x0) + 20, barH + 16, 8); ctx.fill()
  const zones = [
    { from: 0, to: 70, color: 'rgba(13,155,97,0.45)' },
    { from: 70, to: 90, color: 'rgba(184,121,21,0.45)' },
    { from: 90, to: 130, color: 'rgba(217,33,53,0.45)' }
  ]
  for (const z of zones) {
    const zx0 = x0 + (z.from / 130) * (x1 - x0)
    const zx1 = x0 + (z.to / 130) * (x1 - x0)
    ctx.fillStyle = z.color; ctx.fillRect(zx0, y, zx1 - zx0, barH)
  }
  ctx.strokeStyle = cssVar('--line', '#0b0b0b'); ctx.lineWidth = 2
  ctx.strokeRect(x0, y, x1 - x0, barH)
  const mx = x0 + (db / 130) * (x1 - x0)
  ctx.fillStyle = '#d92135'
  ctx.beginPath(); ctx.moveTo(mx - 8, y - 10); ctx.lineTo(mx + 8, y - 10); ctx.lineTo(mx, y + 2); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#d92135'; ctx.font = 'bold 22px ui-monospace, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
  ctx.fillText(db + ' dB', x1, y + barH / 2)
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '11px sans-serif'; ctx.fillStyle = cssVar('--text', '#555')
  ctx.fillText('0', x0, y + barH + 14)
  ctx.fillText('70', x0 + (70 / 130) * (x1 - x0), y + barH + 14)
  ctx.fillText('90', x0 + (90 / 130) * (x1 - x0), y + barH + 14)
  ctx.textAlign = 'right'; ctx.fillText('130', x1, y + barH + 14)
}

/* ============ 汽车回声（例题）模式 ============ */
function drawWavePacket(front, y0, reflected) {
  const Wpk = 72
  const steps = 40
  const k = 0.22
  const phase = frame / 8
  const amp = 10
  const g = ctx.createLinearGradient(front - Wpk / 2, 0, front + Wpk / 2, 0)
  if (reflected) { g.addColorStop(0, '#9b6bf0'); g.addColorStop(1, '#6a4fd0') }
  else { g.addColorStop(0, '#2f9fd0'); g.addColorStop(1, '#7b5bd6') }
  ctx.save()
  ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.shadowColor = reflected ? 'rgba(123,91,214,0.5)' : 'rgba(47,159,208,0.5)'; ctx.shadowBlur = 8
  ctx.beginPath()
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = front - Wpk / 2 + Wpk * t
    const env = Math.sin(t * Math.PI)
    const y = y0 + env * Math.sin((x - front) * k - phase) * amp
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.stroke(); ctx.restore()
  ctx.fillStyle = reflected ? '#6a4fd0' : '#2f9fd0'
  ctx.beginPath(); ctx.arc(front, y0, 4, 0, Math.PI * 2); ctx.fill()
}

function drawCarEchoWave(carX, carStartX, cliffX, pxPerM, D0) {
  const e = carDemo.elapsed
  const tOut = D0 / V_SOUND
  const y0 = groundY - 150
  if (e <= tOut) {
    const frontX = carStartX + V_SOUND * e * pxPerM
    drawWavePacket(frontX, y0, false)
  } else {
    // 到达山崖瞬间的短涟漪
    const hitPhase = Math.min(1, (e - tOut) / 0.35)
    if (hitPhase < 1) {
      ctx.strokeStyle = `rgba(123,91,214,${0.7 * (1 - hitPhase)})`; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(cliffX, y0, 6 + hitPhase * 30, 0, Math.PI * 2); ctx.stroke()
    }
    // 回波：从山崖向车返回
    const backE = e - tOut
    const frontX = cliffX - V_SOUND * backE * pxPerM
    drawWavePacket(Math.max(carX, frontX), y0, true)
  }
}

function drawCarEchoMode() {
  drawSky(); drawRoad()
  drawCliffStatic()
  // 像素缩放：起点到山崖的像素距离 = D0 米
  const carRunPx = 260
  const cliffX = wallX
  const carStartX = cliffX - carRunPx
  const D0 = d0.value
  const pxPerM = carRunPx / D0
  // 实时距离与车位置
  const dNow = carDemo.running || carDemo.done
    ? Math.max(dAtEcho.value, D0 - carSpeed.value * carDemo.elapsed)
    : D0
  const carX = cliffX - dNow * pxPerM
  // 起点参考线 + 标签
  ctx.strokeStyle = 'rgba(123,91,214,0.65)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4])
  ctx.beginPath(); ctx.moveTo(carStartX, groundY - 200); ctx.lineTo(carStartX, groundY); ctx.stroke(); ctx.setLineDash([])
  ctx.fillStyle = '#7b5bd6'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText(`按喇叭时 d₀ = ${D0.toFixed(0)} m`, carStartX, groundY - 206)
  // 汽车
  drawCar(carX, carDemo.running && !carDemo.done)
  // 声波
  if (carDemo.running) drawCarEchoWave(carX, carStartX, cliffX, pxPerM, D0)
  // 完成：标注听到回声的距离
  if (carDemo.done) {
    ctx.strokeStyle = 'rgba(13,155,97,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4])
    ctx.beginPath(); ctx.moveTo(carX, groundY - 160); ctx.lineTo(carX, groundY); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#0d9b61'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(`听到回声时 d₁ = ${dAtEcho.value.toFixed(0)} m`, carX, groundY - 166)
  }
  // 实时距离
  ctx.fillStyle = '#3a3026'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('d = ' + dNow.toFixed(0) + ' m', carX, groundY + 48)
  // 标题与题面
  ctx.fillStyle = cssVar('--text-h', '#111'); ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('🚗 山崖回声测距（例题）', 28, 22)
  ctx.fillStyle = cssVar('--text', '#555'); ctx.font = '13px sans-serif'
  ctx.fillText('汽车以 v车 驶向山崖，按喇叭 3 s 后听到回声（声速 340 m/s），求听到回声时车与山崖的距离。', 28, 46)
  const status = carDemo.done
    ? `✅ 3 s 后听到回声 —— 车距山崖 = ${dAtEcho.value.toFixed(0)} m`
    : carDemo.running
      ? `已用时 ${carDemo.elapsed.toFixed(2)} s ／ 3.00 s`
      : `设定车速 ${carSpeed.value} m/s、声速 340 m/s，点「按喇叭」开始 3 s 演示`
  ctx.fillText(status, 28, 66)
}

function render() {
  if (!ctx) return
  if (mode.value === 'echo') drawEchoMode()
  else if (mode.value === 'noise') drawNoiseMode()
  else drawCarEchoMode()
}

function loop() {
  frame++
  noisePhase += 1
  if (justEchoed.value) { echoFlash -= 0.03; if (echoFlash <= 0) { echoFlash = 0; justEchoed.value = false } }
  if (wave.active) {
    wave.prog += 1 / wave.frames
    if (wave.prog >= 1) {
      wave.prog = 1
      if (!echoPlayed) {
        echoPlayed = true
        justEchoed.value = true
        echoFlash = 1
        if (!muted.value) playTone({ freq: 250, duration: 0.2, volume: 0.14, type: 'sine' })
      }
      wave.active = false
    }
  }
  // 汽车回声（例题）演示计时
  if (carDemo.running) {
    carDemo.elapsed = (performance.now() - carDemo.t0) / 1000
    if (carDemo.elapsed >= ECHO_T) {
      carDemo.elapsed = ECHO_T
      carDemo.done = true
      carDemo.running = false
      if (!muted.value) playTone({ freq: 340, duration: 0.22, volume: 0.18, type: 'sine' })
      if (!seen.carEcho) {
        seen.carEcho = true
        hint.value = `听到回声！车距山崖 = ${dAtEcho.value.toFixed(0)} m —— 解题见右侧`
        tryComplete()
      }
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
        <canvas ref="canvasRef" style="display:block;width:100%;height:100%;cursor:pointer" @click="onCanvasClick"></canvas>
      </div>
      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': mode === 'echo' }" @click="mode = 'echo'">回声测距</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'noise' }" @click="mode = 'noise'">噪声控制</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'car-echo' }" @click="mode = 'car-echo'">🚗 山崖回声（例题）</button>
        <button v-if="mode === 'echo' || mode === 'car-echo'" class="btn btn-primary" @click="runAction">{{ actionLabel }}</button>
        <button class="btn" :class="{ 'btn-primary': muted }" @click="muted = !muted">{{ muted ? '🔇 静音' : '🔊 音效开' }}</button>
        <button class="btn" @click="reset">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>{{ mode === 'echo' ? '可调变量' : mode === 'car-echo' ? '可调变量' : '噪声源' }}</strong><span>实时联动</span></div>
        <div class="lab-params">
          <ParamSlider
            v-if="mode === 'echo'"
            v-model="distance"
            :min="5"
            :max="100"
            :step="1"
            label="到山崖距离 d"
            unit=" m"
            hint="距山崖 d ≥ 17 m 时回声间隔 ≥ 0.1 s，可区分原声与回声"
          />
          <ParamSlider
            v-else-if="mode === 'car-echo'"
            v-model="carSpeed"
            :min="5"
            :max="40"
            :step="1"
            label="车速 v车"
            unit=" m/s"
            hint="例题默认 20 m/s；调整后听到回声时距离 d₁ = (340 − v车) × 3 / 2"
          />
          <div v-else class="r-src-grid">
            <button
              v-for="s in SOURCES"
              :key="s.id"
              class="btn btn-sm"
              :class="{ 'btn-primary': sourceId === s.id }"
              @click="pickSource(s.id)"
            >{{ s.icon }} {{ s.label }}</button>
          </div>
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实时数据</strong><span>只读输出</span></div>
        <div class="lab-readout">
          <template v-if="mode === 'echo'">
            <div class="lab-stat"><span>回声时间 t=2d/v</span><strong>{{ echoTime.toFixed(3) }} s</strong></div>
            <div class="lab-stat" :class="echoCan ? 'success' : 'accent'"><span>能否区分回声</span><strong style="font-size:13px">{{ echoCan ? '能（≥0.1s）' : '不能（<0.1s）' }}</strong></div>
            <div class="lab-stat success"><span>距离 d</span><strong>{{ distance }} m</strong></div>
            <div class="lab-stat"><span>说明</span><strong style="font-size:12px">路程=2d</strong></div>
          </template>
          <template v-else-if="mode === 'car-echo'">
            <div class="lab-stat"><span>回声时间 t</span><strong>{{ ECHO_T }} s</strong></div>
            <div class="lab-stat"><span>声速 v声</span><strong>{{ V_SOUND }} m/s</strong></div>
            <div class="lab-stat"><span>车速 v车</span><strong>{{ carSpeed }} m/s</strong></div>
            <div class="lab-stat accent"><span>按喇叭时 d₀</span><strong>{{ d0.toFixed(0) }} m</strong></div>
            <div class="lab-stat success"><span>听到时距离 d₁</span><strong>{{ dAtEcho.toFixed(0) }} m</strong></div>
            <div class="lab-stat"><span>状态</span><strong style="font-size:12px">{{ carDemo.done ? '已听到回声' : carDemo.running ? '演示中…' : '待按喇叭' }}</strong></div>
          </template>
          <template v-else>
            <div class="lab-stat"><span>当前噪声</span><strong>{{ source.db }} dB</strong></div>
            <div class="lab-stat accent"><span>危害等级</span><strong style="font-size:12px">{{ noiseLevel }}</strong></div>
            <div class="lab-stat success"><span>控制途径</span><strong style="font-size:12px">{{ source.way }}</strong></div>
            <div class="lab-stat"><span>说明</span><strong style="font-size:12px">三处可减弱</strong></div>
          </template>
        </div>
      </div>

      <FormulaPanel
        :title="mode === 'echo' ? '回声测距' : mode === 'car-echo' ? '山崖回声测距（例题）' : '噪声的控制'"
        :formula="mode === 'echo' ? 't = 2d / v（回声路程 = 2d）' : mode === 'car-echo' ? '2d₀ = v声·t + v车·t　→　d₁ = (v声 − v车)·t / 2' : '控制噪声：三处入手'"
        :desc="mode === 'echo'
          ? '声音传播到障碍物再反射回来，路程为往返 2d；间隔 ≥ 0.1 s 才能区分原声与回声，对应 d ≥ 17 m。'
          : mode === 'car-echo'
            ? '汽车按喇叭时距山崖 d₀，3 s 后听到回声时距山崖 d₁。声音走的总路程 = v声·t = 340×3 = 1020 m = d₀ + d₁；同时车走了 v车·t = 20×3 = 60 m = d₀ − d₁。两式联立得 d₁ = (1020 − 60) / 2 = 480 m。'
            : '控制噪声的三条途径：声源处（防产生，如禁止鸣笛）、传播过程中（阻断，如隔音墙/植树）、人耳处（防入耳，如戴耳罩）。'"
        :rows="mode === 'echo' ? [
          { label: '声速（15℃ 空气）', value: '340 m/s' },
          { label: '距离 d', value: distance + ' m' },
          { label: '回声时间 t', value: echoTime.toFixed(3) + ' s' }
        ] : mode === 'car-echo' ? [
          { label: '声速 v声', value: V_SOUND + ' m/s' },
          { label: '车速 v车', value: carSpeed + ' m/s' },
          { label: '回声时间 t', value: ECHO_T + ' s' },
          { label: '按喇叭时 d₀', value: d0.toFixed(0) + ' m' },
          { label: '听到时 d₁', value: dAtEcho.toFixed(0) + ' m' }
        ] : [
          { label: '当前声源', value: source.label },
          { label: '分贝', value: source.db + ' dB' },
          { label: '对应途径', value: source.path === 'source' ? '声源处' : source.path === 'path' ? '传播中' : source.path === 'ear' ? '人耳处' : '安全' }
        ]"
        :result="mode === 'echo' ? [
          { label: '区分条件', value: 't ≥ 0.1 s' },
          { label: '最小距离', value: 'd ≥ 17 m' }
        ] : mode === 'car-echo' ? [
          { label: '声音总路程', value: '1020 m' },
          { label: '车走路程', value: '60 m' },
          { label: '答 d₁', value: dAtEcho.toFixed(0) + ' m' }
        ] : [
          { label: '>70dB', value: '影响学习' },
          { label: '>90dB', value: '损伤听力' }
        ]"
        :verify="mode === 'echo' ? [
          '0 dB 不是没声音，是人耳刚能听到的最弱声',
          '回声路程是往返 2d，不是单程 d',
          'd ≥ 17 m（即 t ≥ 0.1 s）才能把回声与原声区分开'
        ] : mode === 'car-echo' ? [
          '关键：声音从按喇叭点去山崖、再返回到“此时”车的位置',
          '声音总路程 = v声·t；车走路程 = v车·t',
          '设按喇叭时距 d₀，听到时距 d₁，则 v声·t = d₀ + d₁、v车·t = d₀ − d₁',
          '联立解得 d₁ = (v声 − v车)·t / 2 = (340−20)×3/2 = 480 m'
        ] : [
          '0 dB 不是没有声音，而是人耳刚能听到的最微弱声音',
          '> 70 dB 影响学习工作，> 90 dB 损伤听力',
          '控制噪声三途径：声源处 / 传播中 / 人耳处',
          '环保角度：妨碍正常休息、学习、工作的声音都算噪声'
        ]"
      />
    </aside>
  </div>
</template>

<style scoped>
.r-src-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 12px }
</style>
