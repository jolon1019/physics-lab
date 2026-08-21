<script setup>
import { boardFg, boardText } from '../../lib/boardText'

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { playTone } from '../../lib/audio'
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

const mode = ref('echo') // echo | car-echo
const distance = ref(50)
const muted = ref(false)

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

/* 汽车尺寸（按 car.png 原始 1:1 比例不拉伸，略微放大） */
const CAR_W = 100

/* 路面：回到之前的条带状位置（路面顶距画布底 110px，不再贴死底边）；
   路面下方填充地面色，避免路条像悬浮在画面中间、下方留白。
   汽车按 car.png 实际车底（图像 y=299/400）对齐路面，
   不再因底部 100px 透明留白而“悬空”在路面之上。 */
const ROAD_H = 40
const ROAD_TOP_GAP = 110          // groundY = CH - 110，路面顶在距画布底 110px 处
const CAR_BOTTOM_FRAC = 299 / 400 // car.png 不透明车底占图像高度的纵向比例

/* ============ 图片预加载 ============ */
const carImg = new Image(); carImg.src = '/assets/lab/car.png'
const roadImg = new Image(); roadImg.src = '/assets/lab/road.png'
/* 声波交互：点击"鸣笛"或点击画布，生成一个向前运动、遇崖反射返回的声波包 */


/* 声波交互：点击"鸣笛"或点击画布，生成一个向前运动、遇崖反射返回的声波包 */
let wave = { active: false, prog: 0, frames: 150, path: 1 }
let echoPlayed = false
let justEchoed = ref(false)
let echoFlash = 0

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
const seen = { echo: false, carEcho: false }
let completed = false
const hint = ref('点「按喇叭」或点击画面，汽车鸣笛后声波从山崖反射返回')

const actionLabel = computed(() => {
  if (mode.value === 'echo') return wave.active ? '鸣笛中…' : '按喇叭'
  return carDemo.running ? '鸣笛中…' : carDemo.done ? '再演示一次' : '按喇叭开始'
})
function runAction() {
  if (mode.value === 'echo') shout()
  else if (mode.value === 'car-echo') honk()
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

function tryComplete() {
  if ((seen.echo || seen.carEcho) && !completed) {
    completed = true
    emit('complete')
    hint.value = '回声测距体验完成 —— 试着切换到「山崖回声（例题）」做联立方程'
  }
}

function reset() {
  distance.value = 50
  wave.active = false
  wave.prog = 0
  seen.echo = false
  seen.carEcho = false
  resetCarDemo()
  hint.value = mode.value === 'car-echo'
    ? '设定车速，点「按喇叭」开始 3 秒演示'
    : '点「按喇叭」或点击画面，汽车鸣笛后声波从山崖反射返回'
}

watch(mode, (m) => {
  resetCarDemo()
  hint.value = m === 'car-echo'
    ? '设定车速，点「按喇叭」开始 3 秒演示'
    : '点「按喇叭」或点击画面，汽车鸣笛后声波从山崖反射返回'
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
  groundY = CH - ROAD_TOP_GAP
  wallX = CW - 36
  cliffFaceX = wallX - 8
  personNearX = wallX - 130
  personFarX = 120
  person17X = personXAt(17)
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
  const ry = groundY
  const rh = ROAD_H
  const gy = ry + rh
  // 路面下方填充地面色，避免路条像悬浮在画面中间、下方留白
  ctx.fillStyle = '#10211a'
  ctx.fillRect(0, gy, CW, CH - gy)
  // 路面：把 road.png 的路带（源 y=164..281，高 118px）显式平铺为
  // 400×ROAD_H 的瓦片，每个瓦片“顶边”对齐路面顶 ry。这样纹理只沿 x 重复，
  // 垂直方向零相位偏移——无论容器高度如何，路面“上边缘”永远是路带顶、
  // “下边缘”永远是路带底，彻底消除之前 createPattern 锚定画布原点导致的
  // “下边缘显示在上边缘”错位。
  if (roadImg.complete && roadImg.naturalWidth) {
    const TILE_W = 400, SRC_Y = 164, SRC_H = 118
    for (let x = 0; x < CW; x += TILE_W) {
      ctx.drawImage(roadImg, 0, SRC_Y, TILE_W, SRC_H, x, ry, TILE_W, rh)
    }
  } else {
    ctx.fillStyle = '#4a4a4a'
    ctx.fillRect(0, ry, CW, rh)
  }
  // 路面上下边缘线
  ctx.strokeStyle = 'rgba(225,238,228,0.6)'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(CW, ry); ctx.stroke()
  ctx.strokeStyle = 'rgba(225,238,228,0.32)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CW, gy); ctx.stroke()
}

/* 汽车：car.png 保持原始宽高比不拉伸，x 为车身中心，车轮“压”在路面上 */
function drawCar(x, honking) {
  const cw = CAR_W
  // 按原图比例计算绘制高度（car.png 为 400×400 方图，不拉伸）
  const ch = (carImg.complete && carImg.naturalWidth)
    ? cw * (carImg.naturalHeight / carImg.naturalWidth)
    : cw
  // 去掉横向抖动：原 jx=sin*1.4 在车每帧仅前进 ~0.4px 时，会把“向前位移”淹没成
  // 原地左右晃动，看起来卡顿。改为整数像素对齐——贴图对齐到像素网格后，亚像素重采样
  // 抖动消失，每帧位移干净顺滑（丝滑）。
  const overlap = 8
  const yTop = groundY + overlap - CAR_BOTTOM_FRAC * ch
  const dx = Math.round(x - cw / 2)
  const dy = Math.round(yTop)
  if (carImg.complete && carImg.naturalWidth) {
    ctx.drawImage(carImg, dx, dy, cw, ch)
  } else {
    ctx.fillStyle = '#5b6570'
    roundRectPath(dx, dy, cw, ch, 10); ctx.fill()
    ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 2; ctx.stroke()
  }
  // 鸣笛时喇叭波纹（从车头偏上位置发出）
  if (honking) {
    const hx = dx + cw / 2 - 4
    const hy = dy + ch * 0.34
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
  ctx.fillStyle = boardText(ctx.canvas); ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
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
  // 距离标签（路面下方地面色上，白字带深色描边，避开汽车）
  ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3
  ctx.strokeText('d = ' + distance.value + ' m', px, groundY + ROAD_H + 14)
  ctx.fillStyle = '#ffffff'
  ctx.fillText('d = ' + distance.value + ' m', px, groundY + ROAD_H + 14)
  ctx.fillText('d = ' + distance.value + ' m', px, groundY + ROAD_H - 12)
  // 汽车（鸣笛时整体微抖 + 喇叭波纹）
  drawCar(px, wave.active && wave.prog < 0.12)
  // 行进声波包
  if (wave.active) drawTravelWave()
  // 回声返回提示
  if (justEchoed.value && echoFlash > 0) {
    ctx.fillStyle = `rgba(123,91,214,${Math.min(1, echoFlash)})`
    ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('回声返回', px, groundY - 168)
  }
  // 标题与说明
  ctx.fillStyle = boardFg(ctx.canvas); ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('回声测距：汽车鸣笛，声波从山崖反射返回', 28, 22)
  ctx.fillStyle = boardText(ctx.canvas); ctx.font = '13px sans-serif'
  const desc = wave.active
    ? (echoCan.value ? `回声时间 ${echoTime.value.toFixed(3)} s ≥ 0.1 s，能区分原声与回声` : '间隔 < 0.1 s，原声与回声重叠，听不清')
    : `距山崖 ${distance.value} m（山崖固定，移动汽车改变距离），点「按喇叭」或画面发声`
  ctx.fillText(desc, 28, 46)
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
  // 像素缩放：车放在左侧，到山崖的像素距离 = D0 米（行走路程随 carRunPx 增大而增大）
  const cliffX = wallX
  // 车尽量靠左起步、山崖尽量靠右，拉长路面可用像素，使 60m 行驶在屏上位移更大
  const carStartX = Math.max(58, Math.round(CW * 0.07))
  const carRunPx = cliffX - carStartX
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
  // 实时距离（贴在路面上，白字带深色描边）
  ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3
  const dTxt = 'd = ' + dNow.toFixed(0) + ' m'
  ctx.strokeText(dTxt, carX, groundY + ROAD_H + 14)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(dTxt, carX, groundY + ROAD_H + 14)
  // 标题与题面
  ctx.fillStyle = boardFg(ctx.canvas); ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('回声测距（例题）', 28, 22)
  ctx.fillStyle = boardText(ctx.canvas); ctx.font = '13px sans-serif'
  ctx.fillText('汽车以 v车 驶向山崖，按喇叭 3 s 后听到回声（声速 340 m/s），求听到回声时车与山崖的距离。', 28, 46)
  const status = carDemo.done
    ? `3 s 后听到回声 —— 车距山崖 = ${dAtEcho.value.toFixed(0)} m`
    : carDemo.running
      ? `已用时 ${carDemo.elapsed.toFixed(2)} s ／ 3.00 s`
      : `设定车速 ${carSpeed.value} m/s、声速 340 m/s，点「按喇叭」开始 3 s 演示`
  ctx.fillText(status, 28, 66)
}

function render() {
  if (!ctx) return
  if (mode.value === 'echo') drawEchoMode()
  else drawCarEchoMode()
}

function loop() {
  frame++
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
        <button class="btn" :class="{ 'btn-primary': mode === 'car-echo' }" @click="mode = 'car-echo'">回声测距（例题）</button>
        <button v-if="mode === 'echo' || mode === 'car-echo'" class="btn btn-primary" @click="runAction">{{ actionLabel }}</button>
        <button class="btn" :class="{ 'btn-primary': muted }" @click="muted = !muted">{{ muted ? '静音' : '音效开' }}</button>
        <button class="btn" @click="reset">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>实时联动</span></div>
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
        </div>
      </div>

      <FormulaPanel
        :title="mode === 'echo' ? '回声测距' : '回声测距（例题）'"
        :formula="mode === 'echo' ? 't = 2d / v（回声路程 = 2d）' : '2d₀ = v声·t + v车·t　→　d₁ = (v声 − v车)·t / 2'"
        :desc="mode === 'echo'
          ? '声音传播到障碍物再反射回来，路程为往返 2d；间隔 ≥ 0.1 s 才能区分原声与回声，对应 d ≥ 17 m。'
          : '汽车按喇叭时距山崖 d₀，3 s 后听到回声时距山崖 d₁。声音走的总路程 = v声·t = 340×3 = 1020 m = d₀ + d₁；同时车走了 v车·t = 20×3 = 60 m = d₀ − d₁。两式联立得 d₁ = (1020 − 60) / 2 = 480 m。'"
        :rows="mode === 'echo' ? [
          { label: '声速（15℃ 空气）', value: '340 m/s' },
          { label: '距离 d', value: distance + ' m' },
          { label: '回声时间 t', value: echoTime.toFixed(3) + ' s' }
        ] : [
          { label: '声速 v声', value: V_SOUND + ' m/s' },
          { label: '车速 v车', value: carSpeed + ' m/s' },
          { label: '回声时间 t', value: ECHO_T + ' s' },
          { label: '按喇叭时 d₀', value: d0.toFixed(0) + ' m' },
          { label: '听到时 d₁', value: dAtEcho.toFixed(0) + ' m' }
        ]"
        :result="mode === 'echo' ? [
          { label: '区分条件', value: 't ≥ 0.1 s' },
          { label: '最小距离', value: 'd ≥ 17 m' }
        ] : [
          { label: '声音总路程', value: '1020 m' },
          { label: '车走路程', value: '60 m' },
          { label: '答 d₁', value: dAtEcho.toFixed(0) + ' m' }
        ]"
        :verify="mode === 'echo' ? [
          '0 dB 不是没声音，是人耳刚能听到的最弱声',
          '回声路程是往返 2d，不是单程 d',
          'd ≥ 17 m（即 t ≥ 0.1 s）才能把回声与原声区分开'
        ] : [
          '关键：声音从按喇叭点去山崖、再返回到“此时”车的位置',
          '声音总路程 = v声·t；车走路程 = v车·t',
          '设按喇叭时距 d₀，听到时距 d₁，则 v声·t = d₀ + d₁、v车·t = d₀ − d₁',
          '联立解得 d₁ = (v声 − v车)·t / 2 = (340−20)×3/2 = 480 m'
        ]"
      />
    </aside>
  </div>
</template>

<style scoped>
</style>
