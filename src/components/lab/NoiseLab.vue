<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { playNoise, playTone } from '../../lib/audio'
import { paintBoard } from '../../lib/boardBg'

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

const mode = ref('echo') // echo | noise
const distance = ref(50)
const sourceId = ref('class')
const muted = ref(false)

/* ============ 噪声源数据 ============ */
const SOURCES = [
  { id: 'whisper', label: '轻声细语', db: 20, harm: '安全范围', path: 'none', way: '—', icon: '🤫' },
  { id: 'class', label: '教室嘈杂', db: 60, harm: '可接受', path: 'source', way: '声源处：保持安静', icon: '🗣️' },
  { id: 'horn', label: '汽车鸣笛', db: 90, harm: '损伤听力', path: 'source', way: '声源处：禁止鸣笛', icon: '📢' },
  { id: 'saw', label: '电锯作业', db: 100, harm: '损伤听力', path: 'ear', way: '人耳处：戴耳罩', icon: '🪚' },
  { id: 'plane', label: '飞机起降', db: 130, harm: '严重损伤', path: 'path', way: '传播中：隔音墙', icon: '✈️' }
]
const source = computed(() => SOURCES.find((s) => s.id === sourceId.value))

/* ============ 回声模型（墙固定，人物移动体现距离） ============ */
const D_MIN = 5, D_MAX = 100
let wallX = 784
let personNearX = 692
let personFarX = 104
let person17X = 600
function personXAt(d) {
  return personFarX + (1 - (d - D_MIN) / (D_MAX - D_MIN)) * (personNearX - personFarX)
}
const echoTime = computed(() => (2 * distance.value) / 340)
const echoCan = computed(() => echoTime.value >= 0.1)

/* ============ 噪声布局（随容器自适应） ============ */
let srcX = 730
let earX = 104
let noiseWallX = 417
let srcY = 276

/* 声波交互：点击“喊话”或点击画布，生成一个向前运动、遇墙反射返回的声波包 */
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

/* ============ 交互 / 完成 ============ */
const seen = { echo: false, sources: new Set() }
let completed = false
const hint = ref('点「📣 喊话」或点击画面，向墙发声，观察声波去程与回声返回')
const startBtn = ref('📣 喊话')

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
  const mouthX = personXAt(distance.value) + 16
  wave.active = true
  wave.prog = 0
  wave.path = 2 * (wallX - mouthX)
  wave.frames = Math.round(70 + distance.value * 1.1) // 距离越远，往返耗时越长
  echoPlayed = false
  if (!muted.value) playTone({ freq: 250, duration: 0.12, volume: 0.35, type: 'sine' })
  if (!seen.echo) {
    seen.echo = true
    hint.value = echoCan.value ? '回声时间 ≥ 0.1 s，能区分原声与回声' : '距离太近，原声与回声重叠'
    tryComplete()
  }
}

function onCanvasClick() {
  if (mode.value === 'echo') shout()
}

function pickSource(id) {
  sourceId.value = id
  seen.sources.add(id)
  if (!muted.value) playSourceAudio(source.value)
  hint.value = `${source.value.icon} ${source.value.label}：${source.value.db} dB —— ${source.value.way}`
  tryComplete()
}

function tryComplete() {
  if (seen.echo && seen.sources.size >= 2 && !completed) {
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
  seen.sources.clear()
  hint.value = '点「📣 喊话」或点击画面，向墙发声，观察声波去程与回声返回'
}

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
  personNearX = wallX - 80
  personFarX = 104
  person17X = personXAt(17)
  srcX = CW - 150
  earX = 104
  noiseWallX = (srcX + earX) / 2
  srcY = groundY - 84
}
function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  const rect = canvas.getBoundingClientRect()
  CW = Math.max(320, rect.width)
  CH = Math.max(240, rect.height)
  canvas.width = Math.round(CW * dpr)
  canvas.height = Math.round(CH * dpr)
  // 逻辑坐标 = CSS 像素，变换仅做 dpr 缩放，画面精确铺满容器
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

/* 人物：腿长与躯干/头部协调，双脚着地，整体比例自然 */
function drawPerson(x, mouthOpen, isEarMode, earBlocked) {
  const skin = '#e6b48f', cloth = '#3a4a5a', leg = '#2b3640'
  const hipY = groundY - 84
  const shoulderY = hipY - 50
  const headY = shoulderY - 14
  // 腿（髋→膝→踝，略带自然弯曲），长度与上半身协调
  ctx.strokeStyle = leg; ctx.lineWidth = 7; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x - 6, hipY); ctx.lineTo(x - 7, (hipY + groundY) / 2); ctx.lineTo(x - 6, groundY - 6); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + 6, hipY); ctx.lineTo(x + 7, (hipY + groundY) / 2); ctx.lineTo(x + 6, groundY - 6); ctx.stroke()
  // 脚
  ctx.fillStyle = '#1f282f'
  ctx.beginPath(); ctx.ellipse(x - 11, groundY - 3, 9, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(x + 11, groundY - 3, 9, 4, 0, 0, Math.PI * 2); ctx.fill()
  // 躯干（圆角）
  ctx.fillStyle = cloth
  roundRectPath(x - 12, shoulderY, 24, hipY - shoulderY + 2, 10); ctx.fill()
  // 手臂：右臂举起朝墙（喊话），左臂自然下垂
  ctx.strokeStyle = cloth; ctx.lineWidth = 7; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x + 8, shoulderY + 10); ctx.lineTo(x + 26, shoulderY - 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x - 8, shoulderY + 10); ctx.lineTo(x - 17, shoulderY + 32); ctx.stroke()
  // 头
  ctx.fillStyle = skin
  ctx.beginPath(); ctx.arc(x, headY, 14, 0, Math.PI * 2); ctx.fill()
  // 头发
  ctx.fillStyle = '#3a2c22'
  ctx.beginPath(); ctx.arc(x, headY - 3, 14, Math.PI * 1.02, Math.PI * 1.98); ctx.fill()
  // 眼（朝墙，向右）
  ctx.fillStyle = '#2a2a2a'
  ctx.beginPath(); ctx.arc(x + 5, headY - 1, 1.9, 0, Math.PI * 2); ctx.fill()
  // 嘴
  ctx.fillStyle = mouthOpen ? '#7a1f2b' : '#6a4040'
  ctx.beginPath()
  if (mouthOpen) ctx.ellipse(x + 6, headY + 5, 5, 3.4, 0, 0, Math.PI * 2)
  else ctx.ellipse(x + 6, headY + 5, 2.4, 1.3, 0, 0, Math.PI * 2)
  ctx.fill()
  // 耳 + 耳罩
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

/* ============ 回声模式：固定墙 + 单条行进声波包 ============ */
function drawWallStatic() {
  const wx = wallX, w = 26
  const top = groundY - 210
  const g = ctx.createLinearGradient(wx, 0, wx + w, 0)
  g.addColorStop(0, '#c2b8a8'); g.addColorStop(1, '#8d8374')
  ctx.fillStyle = g
  roundRectPath(wx, top, w, groundY - top, 6); ctx.fill()
  ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 2.5
  roundRectPath(wx, top, w, groundY - top, 6); ctx.stroke()
  ctx.strokeStyle = 'rgba(60,55,45,0.3)'; ctx.lineWidth = 1
  for (let y = top + 18; y < groundY - 6; y += 20) {
    ctx.beginPath(); ctx.moveTo(wx + 3, y); ctx.lineTo(wx + w - 3, y); ctx.stroke()
  }
  for (let y = top + 30; y < groundY - 6; y += 40) {
    ctx.beginPath(); ctx.moveTo(wx + 3, y); ctx.lineTo(wx + w - 3, y + 18); ctx.stroke()
  }
  // 反光面（左缘高光，声波反射处）
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(wx, top + 4); ctx.lineTo(wx, groundY - 4); ctx.stroke()
  ctx.fillStyle = '#3a3026'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText('墙 · 反射面', wx + w / 2, top - 8)
}

/* 行进声波包：从人物嘴部向右传播，遇墙反射后向左返回人物 */
function drawTravelWave() {
  const px = personXAt(distance.value)
  const mouthX = px + 16
  const half = wallX - mouthX
  const dist = wave.prog * wave.path
  let front = dist <= half ? mouthX + dist : wallX - (dist - half)
  front = Math.max(mouthX, Math.min(wallX, front))
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
    const env = Math.sin(t * Math.PI) // 两端收束、中部饱满的声波包
    const y = y0 + env * Math.sin((x - front) * k - phase) * amp
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
  // 波前亮点
  ctx.fillStyle = reflected ? '#6a4fd0' : '#2f9fd0'
  ctx.beginPath(); ctx.arc(front, y0, 4, 0, Math.PI * 2); ctx.fill()
}

function drawEchoMode() {
  drawSky(); drawGround()
  const px = personXAt(distance.value)
  // 17 m 固定参考线（细虚线，无填充圆）
  ctx.strokeStyle = echoCan.value ? 'rgba(13,155,97,0.7)' : 'rgba(217,33,53,0.7)'
  ctx.lineWidth = 1.5; ctx.setLineDash([5, 5])
  ctx.beginPath(); ctx.moveTo(person17X, groundY - 210); ctx.lineTo(person17X, groundY); ctx.stroke(); ctx.setLineDash([])
  ctx.fillStyle = echoCan.value ? '#0d9b61' : '#d92135'
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText('17 m', person17X, groundY - 216)
  // 墙（固定不动）
  drawWallStatic()
  // 地面距离标签（随人物，简洁）
  ctx.fillStyle = '#3a3026'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('d = ' + distance.value + ' m', px, groundY + 8)
  // 人物（移动体现距离变化）
  drawPerson(px, wave.active && wave.prog < 0.12, false, false)
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
  ctx.fillText('🧱 回声测距：向墙发声，声波反射返回', 28, 22)
  ctx.fillStyle = cssVar('--text', '#555'); ctx.font = '13px sans-serif'
  const desc = wave.active
    ? (echoCan.value ? `回声时间 ${echoTime.value.toFixed(3)} s ≥ 0.1 s，能区分原声与回声` : '间隔 < 0.1 s，原声与回声重叠，听不清')
    : `距墙 ${distance.value} m（墙固定，移动人物改变距离），点「喊话」或画面发声`
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

function render() {
  if (!ctx) return
  if (mode.value === 'echo') drawEchoMode()
  else drawNoiseMode()
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
        <button v-if="mode === 'echo'" class="btn btn-primary" @click="shout">{{ startBtn }}</button>
        <button class="btn" :class="{ 'btn-primary': muted }" @click="muted = !muted">{{ muted ? '🔇 静音' : '🔊 音效开' }}</button>
        <button class="btn" @click="reset">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>{{ mode === 'echo' ? '可调变量' : '噪声源' }}</strong><span>实时联动</span></div>
        <div class="lab-params">
          <ParamSlider
            v-if="mode === 'echo'"
            v-model="distance"
            :min="5"
            :max="100"
            :step="1"
            label="到墙距离 d"
            unit=" m"
            hint="距墙 d ≥ 17 m 时回声间隔 ≥ 0.1 s，可区分原声与回声"
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
          <template v-else>
            <div class="lab-stat"><span>当前噪声</span><strong>{{ source.db }} dB</strong></div>
            <div class="lab-stat accent"><span>危害等级</span><strong style="font-size:12px">{{ noiseLevel }}</strong></div>
            <div class="lab-stat success"><span>控制途径</span><strong style="font-size:12px">{{ source.way }}</strong></div>
            <div class="lab-stat"><span>说明</span><strong style="font-size:12px">三处可减弱</strong></div>
          </template>
        </div>
      </div>

      <FormulaPanel
        :title="mode === 'echo' ? '回声测距' : '噪声的控制'"
        :formula="mode === 'echo' ? 't = 2d / v（回声路程 = 2d）' : '控制噪声：三处入手'"
        :desc="mode === 'echo'
          ? '声音传播到障碍物再反射回来，路程为往返 2d；间隔 ≥ 0.1 s 才能区分原声与回声，对应 d ≥ 17 m。'
          : '控制噪声的三条途径：声源处（防产生，如禁止鸣笛）、传播过程中（阻断，如隔音墙/植树）、人耳处（防入耳，如戴耳罩）。'"
        :rows="mode === 'echo' ? [
          { label: '声速（15℃ 空气）', value: '340 m/s' },
          { label: '距离 d', value: distance + ' m' },
          { label: '回声时间 t', value: echoTime.toFixed(3) + ' s' }
        ] : [
          { label: '当前声源', value: source.label },
          { label: '分贝', value: source.db + ' dB' },
          { label: '对应途径', value: source.path === 'source' ? '声源处' : source.path === 'path' ? '传播中' : source.path === 'ear' ? '人耳处' : '安全' }
        ]"
        :result="mode === 'echo' ? [
          { label: '区分条件', value: 't ≥ 0.1 s' },
          { label: '最小距离', value: 'd ≥ 17 m' }
        ] : [
          { label: '>70dB', value: '影响学习' },
          { label: '>90dB', value: '损伤听力' }
        ]"
        :verify="mode === 'echo' ? [
          '0 dB 不是没声音，是人耳刚能听到的最弱声',
          '回声路程是往返 2d，不是单程 d',
          'd ≥ 17 m（即 t ≥ 0.1 s）才能把回声与原声区分开'
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
