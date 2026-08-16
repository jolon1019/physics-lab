<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { createTone, playTone } from '../../lib/audio'
import { paintBoard } from '../../lib/boardBg'

const emit = defineEmits(['complete'])

const canvasRef = ref(null)
let ctx = null
let raf = null
let dpr = 1
let flickerT = 0
let lastTs = 0

const W = 880
const H = 470
const deskY = 380

// 模式：音叉(转换法) / 真空罩(推理法) / 声波传播(介质)
const mode = ref('fork')
const strike = ref(70)
const vibr = ref(0)
const ballSwing = ref(0)
const waterMode = ref(false)
const splashes = []
const vacuum = ref(0)
const wavePlay = ref(false)
const medium = ref('gas') // solid | liquid | gas
const muted = ref(false)

let forkTone = null
let bellTimer = null

const MEDIA = {
  solid: { label: '固体', v: 5200, color: '#c2622e', dot: '#e08a4e' },
  liquid: { label: '液体', v: 1500, color: '#2f7fb0', dot: '#5aa9d6' },
  gas: { label: '气体', v: 340, color: '#3a8f6a', dot: '#7fd0a8' }
}
const waveRest = []
for (let x = 70; x <= 810; x += 13) waveRest.push(x)

const seen = { hit: false, hold: false, weak: false, restore: false, wave: false }
const mediaTried = new Set()
let completed = false
let wavePhase = 0

const volume = computed(() => Math.round(98 - (vacuum.value / 100) * 90))
const forkState = computed(() => (vibr.value > 0.02 ? '发声（音叉振动）' : '停止发声'))
const forkAmp = computed(() => Math.round(vibr.value * 100))
const toneState = computed(() => {
  if (vacuum.value < 40) return '铃声清晰'
  if (vacuum.value < 80) return '🔉 铃声减弱'
  return '几乎听不到'
})
const hint = ref('先「敲击音叉」，用乒乓球（转换法）显示看不见的振动')

/* ============ 音效 ============ */
function ringOnce() {
  if (muted.value || mode.value !== 'vacuum') return
  if (volume.value < 12) return
  const vol = Math.min(1, Math.max(0.05, (volume.value - 8) / 90))
  playTone({ freq: 880, duration: 0.32, volume: 0.22 * vol, type: 'square' })
  setTimeout(() => playTone({ freq: 620, duration: 0.32, volume: 0.16 * vol, type: 'square' }), 140)
}
function startBell() {
  stopBell()
  bellTimer = setInterval(ringOnce, 700)
}
function stopBell() {
  if (bellTimer) {
    clearInterval(bellTimer)
    bellTimer = null
  }
}
watch(mode, (m) => {
  forkTone?.stop()
  forkTone = null
  if (m === 'vacuum') startBell()
  else stopBell()
})

/* ============ 交互 ============ */
function swingFork() {
  vibr.value = strike.value / 100
  ballSwing.value = (strike.value / 100) * 0.6
  struck.value = true
  forkTone?.stop()
  forkTone = muted.value
    ? null
    : createTone({ freq: 440, volume: 0.06 + (strike.value / 100) * 0.35, harmonics: [1, 0.12] })
  if (waterMode.value) {
    const fx = 360
    for (let i = 0; i < 14; i++) {
      splashes.push({ x: fx + (Math.random() - 0.5) * 40, y: deskY - 6, vx: (Math.random() - 0.5) * 120, vy: -120 - Math.random() * 160 })
    }
  }
  if (vibr.value > 0.6) seen.hit = true
  hint.value = '音叉振动 → 乒乓球被弹开：用看得见的摆动“放大”显示看不见的振动（转换法）'
  tryComplete()
}
const struck = ref(false)
function holdFork() {
  vibr.value = 0
  ballSwing.value = 0
  struck.value = false
  forkTone?.stop()
  forkTone = null
  seen.hold = true
  hint.value = '振动停止，发声停止（但已发出的声音仍在空气中传播一段距离）'
  tryComplete()
}
function toggleMute() {
  muted.value = !muted.value
  if (muted.value) {
    forkTone?.stop()
    forkTone = null
  } else if (vibr.value > 0.02) {
    forkTone = createTone({ freq: 440, volume: 0.06 + (strike.value / 100) * 0.35, harmonics: [1, 0.12] })
  }
}
function pumpOn() {
  if (vacuum.value >= 80 && !seen.weak) {
    seen.weak = true
    hint.value = '抽去空气后铃声几乎听不到 —— 真空不能传声（推理法）'
    tryComplete()
  }
}
function restore() {
  vacuum.value = 0
  if (seen.weak && !seen.restore) {
    seen.restore = true
    hint.value = '放气后铃声恢复 —— 证明声音靠空气（介质）传播'
    tryComplete()
  }
}
function toggleWave() {
  wavePlay.value = !wavePlay.value
  if (wavePlay.value && !seen.wave) {
    seen.wave = true
    mediaTried.add(medium.value)
    if (mediaTried.size >= 2) hint.value = '换不同介质看波行进快慢：v固 > v液 > v气'
    else hint.value = '纵波（疏密相间）向右传播；切换固体/液体/气体对比速度'
    tryComplete()
  }
}
function setMedium(m) {
  medium.value = m
  mediaTried.add(m)
  if (mediaTried.size >= 2 && seen.wave) {
    seen.wave = true
    hint.value = '换不同介质看波行进快慢：v固 > v液 > v气'
  }
  tryComplete()
}
function tryComplete() {
  const forkDone = seen.hit && seen.hold
  const vacuumDone = seen.weak && seen.restore
  const waveDone = seen.wave && mediaTried.size >= 2
  if ((forkDone || vacuumDone || waveDone) && !completed) {
    completed = true
    emit('complete')
  }
}
function reset() {
  mode.value = 'fork'
  vibr.value = 0
  ballSwing.value = 0
  struck.value = false
  vacuum.value = 0
  wavePlay.value = false
  waterMode.value = false
  splashes.length = 0
  seen.hit = seen.hold = seen.weak = seen.restore = seen.wave = false
  mediaTried.clear()
  forkTone?.stop()
  forkTone = null
  stopBell()
  hint.value = '先「敲击音叉」，用乒乓球（转换法）显示看不见的振动'
}

/* ============ 画布 ============ */
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

const arcs = []
function pushArcs(cx, cy, intensity) {
  if (intensity <= 0.03 || flickerT % 3 !== 0) return
  arcs.push({ x: cx, y: cy, r: 8, a: 0.5 * intensity })
}

function drawDesk() {
  paintBoard(ctx, W, H, 'chalk')
  // 桌面线（粉笔色描边，露出统一黑板底）
  ctx.strokeStyle = 'rgba(225,238,228,0.5)'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(0, deskY); ctx.lineTo(W, deskY); ctx.stroke()
  ctx.strokeStyle = 'rgba(225,238,228,0.25)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, deskY + 6); ctx.lineTo(W, deskY + 6); ctx.stroke()
}

function roundRectPath(x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return }
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawForkMode() {
  const accent = cssVar('--accent', '#3a6ea5')
  const textH = cssVar('--text-h', '#111')
  const textCol = cssVar('--text', '#555')
  const x = 340
  const boxY = deskY - 92
  const amp = vibr.value > 0.02 ? vibr.value : 0
  const sw = Math.sin(flickerT * 0.5) * amp * 7

  // 木共鸣箱
  const wg = ctx.createLinearGradient(0, boxY, 0, deskY)
  wg.addColorStop(0, '#d9b98a'); wg.addColorStop(1, '#a97f4f')
  ctx.fillStyle = wg
  ctx.beginPath()
  ctx.moveTo(x - 108, boxY); ctx.lineTo(x + 108, boxY); ctx.lineTo(x + 74, deskY); ctx.lineTo(x - 74, deskY)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = 'rgba(90,60,25,0.5)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = 'rgba(60,40,20,0.55)'
  ctx.beginPath(); ctx.arc(x - 40, boxY + 44, 9, 0, Math.PI * 2); ctx.arc(x + 40, boxY + 44, 9, 0, Math.PI * 2); ctx.fill()

  // 水盘（转换法：音叉触水溅水花）
  if (waterMode.value) {
    ctx.fillStyle = 'rgba(70,150,210,0.35)'
    roundRectPath(x - 60, deskY - 14, 120, 14, 5); ctx.fill()
    ctx.strokeStyle = 'rgba(40,110,170,0.7)'; ctx.lineWidth = 2; ctx.stroke()
  }

  // 黄铜音叉
  const mg = ctx.createLinearGradient(x - 34, 0, x + 34, 0)
  mg.addColorStop(0, '#c8a05c'); mg.addColorStop(0.3, '#f2d492'); mg.addColorStop(0.5, '#fff0b8')
  mg.addColorStop(0.7, '#e7c379'); mg.addColorStop(1, '#b0853f')
  ctx.fillStyle = mg
  const prongW = 13
  const prongTop = boxY - 120
  const prongBottom = boxY + 12
  const gap = 26
  const leftX = x - gap - prongW / 2 + sw
  const rightX = x + gap - prongW / 2 - sw
  for (const px of [leftX, rightX]) {
    roundRectPath(px, prongTop, prongW, prongBottom - prongTop, 6); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillRect(px + 2, prongTop + 5, 3, prongBottom - prongTop - 10)
    ctx.fillStyle = mg
  }
  roundRectPath(x - 40, prongBottom - 18, 80, 18, 8); ctx.fill()
  roundRectPath(x - 7, prongBottom - 4, 14, 34, 4); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x - 3, prongBottom + 2, 3, 28); ctx.fillStyle = mg

  // 振动光晕
  if (amp > 0.02) {
    ctx.save()
    ctx.shadowColor = accent; ctx.shadowBlur = 12; ctx.strokeStyle = accent; ctx.lineWidth = 2
    for (const px of [leftX, rightX]) {
      ctx.beginPath(); ctx.moveTo(px - 2, prongTop - 8); ctx.lineTo(px - 2, prongTop - 20)
      ctx.moveTo(px + prongW + 2, prongTop - 8); ctx.lineTo(px + prongW + 2, prongTop - 20); ctx.stroke()
    }
    ctx.restore()
    pushArcs(x, boxY - 62, vibr.value)
  }

  // 乒乓球（转换法：挂在支架上，被振动弹开而摆动）
  const pivotX = 600
  const pivotY = 120
  const L = 180
  const ang = ballSwing.value * Math.sin(flickerT * 0.42)
  const bx = pivotX + L * Math.sin(ang)
  const by = pivotY + L * Math.cos(ang)
  ctx.fillStyle = '#8b7355'
  ctx.fillRect(pivotX - 6, pivotY - 70, 12, 70)
  ctx.fillRect(pivotX - 50, pivotY - 64, 100, 8)
  ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(pivotX, pivotY); ctx.lineTo(bx, by); ctx.stroke()
  ctx.fillStyle = '#e74c3c'
  ctx.beginPath(); ctx.arc(bx, by, 15, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath(); ctx.arc(bx - 4, by - 5, 4.5, 0, Math.PI * 2); ctx.fill()
  // 连接小箭头：音叉→球
  if (amp > 0.02) {
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(x + 30, boxY - 40); ctx.lineTo(pivotX - 30, pivotY + 60); ctx.stroke()
    ctx.setLineDash([])
  }

  // 水花
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i]
    ctx.fillStyle = 'rgba(70,150,210,0.8)'
    ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill()
  }

  ctx.fillStyle = textH; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'
  ctx.fillText('🎵 音叉发声 · 乒乓球显示振动（转换法）', 40, 40)
  ctx.fillStyle = textCol; ctx.font = '13px sans-serif'
  ctx.fillText(
    amp > 0.02 ? '听不到振动？看乒乓球被弹开——把不明显的振动“放大”显示' : '力度越大，振动越强，乒乓球摆得越高',
    40, 64
  )
}

function drawVacuumMode() {
  const textH = cssVar('--text-h', '#111')
  const textCol = cssVar('--text', '#555')
  const accent = cssVar('--accent', '#3a6ea5')
  const cx = 300
  const pumpX = 640

  const ringing = volume.value > 30
  const shake = ringing ? Math.sin(flickerT * 0.35) * 0.06 : 0
  ctx.save(); ctx.translate(cx, 312); ctx.rotate(shake)
  ctx.fillStyle = '#f5f2e9'; ctx.strokeStyle = '#555'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#e74c3c'
  ctx.beginPath(); ctx.arc(0, -34, 7, 0, Math.PI * 2); ctx.arc(0, -34, 4, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#333'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -24); ctx.moveTo(0, 0); ctx.lineTo(16, 8); ctx.stroke()
  ctx.restore()

  // 罩内空气粒子（随抽气变稀）
  const n = Math.round(56 * (1 - vacuum.value / 100))
  ctx.fillStyle = 'rgba(90,130,200,0.5)'
  for (let i = 0; i < n; i++) {
    const p = waveRest[(i * 7) % waveRest.length]
    const px = cx - 90 + ((p - 70) / 740) * 180
    const py = 205 + ((i * 37) % 140) + Math.sin(flickerT * 0.05 + i) * 2
    ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill()
  }

  // 玻璃罩
  ctx.fillStyle = 'rgba(210,228,255,0.14)'
  ctx.strokeStyle = 'rgba(140,170,220,0.85)'; ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(170, deskY - 8); ctx.lineTo(170, 235)
  ctx.quadraticCurveTo(170, 150, cx, 150)
  ctx.quadraticCurveTo(430, 150, 430, 235)
  ctx.lineTo(430, deskY - 8); ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 5
  ctx.beginPath(); ctx.moveTo(185, 230); ctx.quadraticCurveTo(185, 175, 240, 165); ctx.stroke()

  // 底座与抽气管道
  ctx.fillStyle = '#8b7355'; ctx.fillRect(130, deskY - 8, 340, 16)
  ctx.strokeStyle = '#777'; ctx.lineWidth = 5
  ctx.beginPath(); ctx.moveTo(430, deskY - 4); ctx.quadraticCurveTo(520, deskY - 4, 560, deskY - 30); ctx.lineTo(560, deskY - 66); ctx.stroke()

  // 抽气泵
  ctx.fillStyle = '#7d8794'; ctx.fillRect(pumpX - 34, deskY - 96, 68, 92)
  ctx.fillStyle = '#5b6570'; ctx.fillRect(pumpX - 44, deskY - 108, 88, 16)
  ctx.fillStyle = '#c9a76b'; ctx.fillRect(pumpX - 6, deskY - 96, 12, 30)

  // 气压表
  const barW = 150
  const pct = 1 - vacuum.value / 100
  ctx.fillStyle = '#f0eee7'; ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 2
  ctx.fillRect(pumpX - 30, 150, barW, 26); ctx.strokeRect(pumpX - 30, 150, barW, 26)
  ctx.fillStyle = pct > 0.6 ? '#0d9b61' : pct > 0.2 ? '#b87915' : '#d92135'
  ctx.fillRect(pumpX - 30, 150, barW * pct, 26)
  ctx.fillStyle = textH; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'
  ctx.fillText(`罩内气压 ${(pct * 100).toFixed(0)} kPa`, pumpX + 45, 170)

  if (ringing) pushArcs(cx, 240, (volume.value - 30) / 70)

  ctx.fillStyle = textH; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'
  ctx.fillText('🔔 真空罩 · 闹钟在玻璃罩内（推理法）', 40, 40)
  ctx.fillStyle = textCol; ctx.font = '13px sans-serif'
  ctx.fillText(
    vacuum.value < 40 ? '铃声清晰：空气（介质）在传播声波' : vacuum.value < 80 ? '抽去空气，铃声逐渐减弱' : '空气几乎抽尽，铃声听不到 → 真空不能传声',
    40, 64
  )
}

function drawWaveMode() {
  const textH = cssVar('--text-h', '#111')
  const textCol = cssVar('--text', '#555')
  const m = MEDIA[medium.value]
  const A = 11
  const k = (2 * Math.PI) / 150
  const vNorm = m.v / 5200
  const speed = 170 * vNorm // px/s

  // 介质盒
  ctx.fillStyle = 'rgba(0,0,0,0.04)'
  roundRectPath(40, 150, W - 80, 230, 16); ctx.fill()
  ctx.strokeStyle = m.color; ctx.lineWidth = 2; ctx.setLineDash([8, 6])
  roundRectPath(40, 150, W - 80, 230, 16); ctx.stroke(); ctx.setLineDash([])
  ctx.fillStyle = m.color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'
  ctx.fillText(`介质：${m.label}　声速 v ≈ ${m.v} m/s　（v固 > v液 > v气）`, 56, 178)

  // 扬声器
  ctx.fillStyle = '#3a3a3a'
  roundRectPath(40, 250, 22, 50, 4); ctx.fill()
  ctx.fillStyle = '#555'
  ctx.beginPath(); ctx.arc(62, 275, 16, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#222'
  ctx.beginPath(); ctx.arc(62, 275, 8, 0, Math.PI * 2); ctx.fill()

  // 纵波粒子
  for (const rx of waveRest) {
    const dx = wavePlay.value ? A * Math.sin(wavePhase - k * rx) : 0
    const px = rx + dx
    const py = 275
    const comp = Math.sin(wavePhase - k * rx) // 压缩处 >0
    const col = comp > 0 ? m.dot : 'rgba(120,120,120,0.55)'
    ctx.fillStyle = col
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill()
  }

  // 行进波前标记
  if (wavePlay.value) {
    const front = 62 + ((wavePhase / k) % (W - 120))
    ctx.strokeStyle = m.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.5
    ctx.beginPath(); ctx.moveTo(front, 200); ctx.lineTo(front, 350); ctx.stroke()
    ctx.globalAlpha = 1
    ctx.fillStyle = m.color; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('疏密波 →', Math.min(W - 60, front), 195)
  }

  ctx.fillStyle = textH; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'
  ctx.fillText('🌊 声波是疏密相间的纵波，靠介质振动传播', 40, 40)
  ctx.fillStyle = textCol; ctx.font = '13px sans-serif'
  ctx.fillText(
    wavePlay.value ? '粒子只在原地往复，振动沿介质向右“传”出去（不是粒子在飞）' : '点「▶ 播放」，再切换固体/液体/气体看传播快慢',
    40, 64
  )
}

function render() {
  if (!ctx) return
  for (const a of arcs) { a.r += 3.2; a.a *= 0.94 }
  for (let i = arcs.length - 1; i >= 0; i--) if (arcs[i].a < 0.03) arcs.splice(i, 1)

  drawDesk()
  for (const a of arcs) {
    ctx.strokeStyle = `rgba(58,110,165,${a.a})`; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.stroke()
  }
  if (mode.value === 'fork') drawForkMode()
  else if (mode.value === 'vacuum') drawVacuumMode()
  else drawWaveMode()
}

function loop(ts) {
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016
  lastTs = ts
  flickerT += 1
  if (mode.value === 'fork' && vibr.value > 0) {
    vibr.value *= 0.985
    ballSwing.value *= 0.985
    if (vibr.value < 0.02) { vibr.value = 0; ballSwing.value = 0; forkTone?.stop(); forkTone = null }
  }
  if (mode.value === 'wave' && wavePlay.value) {
    const vNorm = MEDIA[medium.value].v / 5200
    wavePhase += 170 * vNorm * dt
  }
  // 水花物理
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i]
    s.vy += 520 * dt
    s.x += s.vx * dt
    s.y += s.vy * dt
    if (s.y > deskY - 6) splashes.splice(i, 1)
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
  forkTone?.stop()
  stopBell()
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel" style="padding:0">
        <canvas ref="canvasRef" style="display:block;width:100%;height:100%;touch-action:none"></canvas>
      </div>
      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': mode === 'fork' }" @click="mode = 'fork'">音叉发声</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'vacuum' }" @click="mode = 'vacuum'">真空罩</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'wave' }" @click="mode = 'wave'">声波传播</button>
        <button v-if="mode === 'fork'" class="btn btn-primary" @click="swingFork">{{ vibr > 0.02 ? '再敲一下' : '敲击音叉' }}</button>
        <button v-if="mode === 'fork'" class="btn" @click="holdFork">按住音叉</button>
        <button v-if="mode === 'fork'" class="btn" :class="{ 'btn-primary': waterMode }" @click="waterMode = !waterMode">水花演示</button>
        <button v-if="mode === 'wave'" class="btn btn-primary" @click="toggleWave">{{ wavePlay ? '⏸ 暂停' : '▶ 播放' }}</button>
        <button v-if="mode === 'vacuum'" class="btn btn-primary" @click="restore">放气</button>
        <button class="btn" @click="reset">重置</button>
        <button class="btn" :class="{ 'btn-primary': muted }" @click="toggleMute">{{ muted ? '🔇 静音' : '🔊 音效开' }}</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>实时联动</span></div>
        <div class="lab-params">
          <ParamSlider v-if="mode === 'fork'" v-model="strike" :min="10" :max="100" :step="5" label="敲击力度" unit=" %" hint="力度越大，振动越强，乒乓球摆得越高" />
          <ParamSlider v-else-if="mode === 'vacuum'" v-model="vacuum" :min="0" :max="100" :step="5" label="罩内抽气量" unit=" %" hint="抽气越多，罩内空气越少，铃声越弱" @update:modelValue="pumpOn" />
          <div v-else class="r-medium-tabs">
            <button v-for="(mv, mk) in MEDIA" :key="mk" class="r-medium-btn" :class="{ active: medium === mk }" @click="setMedium(mk)">{{ mv.label }}</button>
          </div>
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实时数据</strong><span>只读输出</span></div>
        <div class="lab-readout">
          <template v-if="mode === 'fork'">
            <div class="lab-stat"><span>发声状态</span><strong style="font-size:13px">{{ forkState }}</strong></div>
            <div class="lab-stat accent"><span>振动幅度</span><strong>{{ forkAmp }} %</strong></div>
            <div class="lab-stat success"><span>显示方式</span><strong style="font-size:12px">乒乓球(转换法)</strong></div>
            <div class="lab-stat"><span>说明</span><strong style="font-size:12px">振动→弹开</strong></div>
          </template>
          <template v-else-if="mode === 'vacuum'">
            <div class="lab-stat"><span>罩内气压</span><strong>{{ (100 - vacuum).toFixed(0) }} kPa</strong></div>
            <div class="lab-stat accent"><span>铃声大小</span><strong>{{ volume }} dB</strong></div>
            <div class="lab-stat success"><span>状态</span><strong style="font-size:13px">{{ toneState }}</strong></div>
            <div class="lab-stat"><span>说明</span><strong style="font-size:12px">真空不传声</strong></div>
          </template>
          <template v-else>
            <div class="lab-stat"><span>当前介质</span><strong style="font-size:13px">{{ MEDIA[medium].label }}</strong></div>
            <div class="lab-stat accent"><span>声速 v</span><strong>{{ MEDIA[medium].v }} m/s</strong></div>
            <div class="lab-stat success"><span>波的类型</span><strong style="font-size:12px">纵波(疏密)</strong></div>
            <div class="lab-stat"><span>说明</span><strong style="font-size:12px">靠介质传播</strong></div>
          </template>
        </div>
      </div>

      <FormulaPanel
        title="声的产生与传播"
        formula="发声：物体振动　传播：需要介质"
        desc="声音由物体振动产生；以声波（疏密相间的纵波）形式在固体、液体、气体中传播，真空不能传声。v固 > v液 > v气。"
        :rows="[
          { label: '15℃ 空气声速', value: '340 m/s' },
          { label: '水中声速', value: '约 1500 m/s' },
          { label: '钢铁中声速', value: '约 5200 m/s' }
        ]"
        :result="mode === 'vacuum' ? [
          { label: '当前铃声', value: volume + ' dB' },
          { label: '罩内气压', value: (100 - vacuum).toFixed(0) + ' kPa' }
        ] : mode === 'wave' ? [
          { label: '介质', value: MEDIA[medium].label },
          { label: '声速 v', value: MEDIA[medium].v + ' m/s' }
        ] : [
          { label: '振动幅度', value: forkAmp + ' %' },
          { label: '显示方式', value: '乒乓球' }
        ]"
        :verify="[
          '转换法：音叉振动不明显，用乒乓球弹开显示振动',
          '真空罩实验用“推理法”：无法抽成绝对真空，推理得出真空不能传声',
          '声波是纵波——粒子原地往复，振动“传”出去，不是粒子在飞',
          'v固 > v液 > v气；声速只与介质种类和温度有关'
        ]"
      />
    </aside>
  </div>
</template>

<style scoped>
.r-medium-tabs { display: flex; gap: 8px; padding: 12px }
.r-medium-btn {
  flex: 1;
  border: 2px solid var(--line);
  background: var(--surface);
  color: var(--text-h);
  font-weight: 700;
  font-size: 13px;
  padding: 8px 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.r-medium-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
</style>
