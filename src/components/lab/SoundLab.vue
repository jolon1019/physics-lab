<script setup>
import { boardFg, boardText } from '../../lib/boardText'

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { playForkTone, playTone } from '../../lib/audio'
import { paintBoard } from '../../lib/boardBg'
import { boardTheme } from '../../lib/boardTheme'
import FullscreenBtn from './FullscreenBtn.vue'

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

// ===== 音叉模式三件器材（用户可调位置）=====
// 图片原画布：fork.png 400x400（内容 bbox 底 y=92%）；stand.png/ball.png 800x800
//   fork 内容底 0.92 → 站脚贴桌面（deskY=380）
//   stand 内容底 0.90 → 站脚贴桌面
//   ball 内容顶 0.268（214/800），内容底 0.671；摆动支点 = 铁架台横臂末端的夹子

// 音叉+共鸣箱（中央偏左）
const FORK_W = 200              // 图渲染宽
const FORK_H = FORK_W           // 图渲染高（原图方）
const FORK_X = 430              // 图左上 x（左右挪改这）
const FORK_Y = deskY - FORK_W * 0.92  // 图左上 y（贴桌面，桌面改 deskY 即可）

// 铁架台（右侧，支点位置 = 横臂末端夹子）
// stand.png 内容 7%-90% 竖向，0.07 处开始；横臂夹子大约在 x≈0.68、y≈0.22
const STAND_W = 340
const STAND_H = STAND_W
const STAND_X = 120             // 图左上 x（左右挪改这）
const STAND_Y = deskY - STAND_W * 0.90  // 站脚贴桌面

// 球（挂在铁架台横臂夹子上，pivot 必须 = 夹子位置）
const BALL_PIVOT_X = STAND_X + STAND_W * 0.62   // 摆动支点 x（=夹子横坐标）
const BALL_PIVOT_Y = STAND_Y + STAND_W * 0.27   // 摆动支点 y（=夹子纵坐标）
const BALL_W = 310                // 图渲染宽（球的视觉大小）
const BALL_H = BALL_W
const BALL_LEN = 324 / 800 * BALL_W  // content 长度（球到支点距离）

// 预加载 3 张图（首次 drawImage 时若未加载完会静默跳过，下一帧自动显示）
const forkImg = new Image(); forkImg.src = '/assets/lab/fork.png'
const standImg = new Image(); standImg.src = '/assets/lab/stand.png'
const ballImg = new Image(); ballImg.src = '/assets/lab/ball.png'
const clockImg = new Image(); clockImg.src = '/assets/lab/clock_crop.png'
const jarImg = new Image(); jarImg.src = '/assets/lab/jar.png'

// ===== 真空罩模式两件器材（用户可调位置）=====
// 图片原画布：jar.png 400x400（内容底 y=0.98，站脚贴桌面）；
//   clock_crop.png 103x150（已裁剪掉透明边，视觉中心 (49%, 50%)）

// 玻璃罩（中央）
const JAR_W = 260
const JAR_H = JAR_W
const JAR_X = 440 - JAR_W / 2           // 图左上 x（玻璃罩居中，画布中心 x=440）
const JAR_Y = deskY - JAR_W * 0.98       // 图左上 y（黑色底座贴桌面）

// 闹钟（玻璃罩中央偏下、底座上方；CLOCK_W 即闹钟主体宽度）
const CLOCK_W = 70
const CLOCK_H = Math.round((CLOCK_W * 150) / 103)  // 保持裁剪图比例 ≈160
const CLOCK_X = 440 - CLOCK_W * 0.49     // 图左上 x（水平居中于玻璃罩）
const CLOCK_Y = 217                       // 图左上 y（垂直中下区）

// 模式：音叉(转换法) / 真空罩(推理法) / 声波传播(介质)
const mode = ref('fork')
const strike = ref(70)
const vibr = ref(0)
const ballSwing = ref(0)
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

const seen = { hit: false, weak: false, restore: false, wave: false }
const mediaTried = new Set()
let completed = false
let wavePhase = 0

const volume = computed(() => Math.round(98 - (vacuum.value / 100) * 90))
const forkState = computed(() => (vibr.value > 0.02 ? '发声（音叉振动）' : '停止发声'))
const forkAmp = computed(() => Math.round(vibr.value * 100))
const toneState = computed(() => {
  if (vacuum.value < 40) return '铃声清晰'
  if (vacuum.value < 80) return '铃声减弱'
  return '几乎听不到'
})
const hint = ref('先「敲击音叉」，用乒乓球（转换法）显示看不见的振动')

/* ============ 音效 ============ */
function ringOnce() {
  if (muted.value || mode.value !== 'vacuum') return
  if (volume.value < 12) return
  const vol = Math.min(1, Math.max(0.05, (volume.value - 8) / 90))
  playTone({ freq: 880, duration: 0.26, volume: 0.14 * vol, type: 'triangle' })
  setTimeout(() => playTone({ freq: 620, duration: 0.30, volume: 0.10 * vol, type: 'triangle' }), 130)
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
const struck = ref(false)
function swingFork() {
  vibr.value = strike.value / 100
  ballSwing.value = (strike.value / 100) * 0.6
  struck.value = true
  forkTone?.stop()
  forkTone = muted.value
    ? null
    : playForkTone({ peak: 0.05 + (strike.value / 100) * 0.22 })
  if (vibr.value > 0.6) seen.hit = true
  hint.value = '音叉振动 → 乒乓球被弹开：用看得见的摆动“放大”显示看不见的振动（转换法）'
  tryComplete()
}
function toggleMute() {
  muted.value = !muted.value
  if (muted.value) {
    forkTone?.stop()
    forkTone = null
  } else if (vibr.value > 0.02) {
    forkTone = playForkTone({ peak: 0.05 + (strike.value / 100) * 0.22 })
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
  const forkDone = seen.hit
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
  seen.hit = seen.weak = seen.restore = seen.wave = false
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
  // 0. 物理画布铺底：容器比例与逻辑画布（880x470）不一致时，contain 缩放
  //    会留出 letterbox 区域（左右或上下），先把整个物理画布铺上黑板底色，
  //    避免露出面板底色造成「背景没铺满」
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = boardTheme.variant === 'light' ? '#f4f1ea' : '#163025'
  ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  ctx.restore()
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
  const textH = boardFg(ctx.canvas)
  const textCol = boardText(ctx.canvas)
  const amp = vibr.value > 0.02 ? vibr.value : 0
  const sw = Math.sin(flickerT * 0.5) * amp * 7  // 音叉振动水平偏移

  // 1. 铁架台（在最下层）
  if (standImg.complete && standImg.naturalWidth) {
    ctx.drawImage(standImg, STAND_X, STAND_Y, STAND_W, STAND_H)
  }

  // 2. 音叉+共鸣箱（带振动偏移 sw）
  if (forkImg.complete && forkImg.naturalWidth) {
    ctx.drawImage(forkImg, FORK_X + sw, FORK_Y, FORK_W, FORK_H)
  }

  // 3. 声波波纹：从音叉主体中心发出（渲染顺序在 drawForkMode 之前 → 自然叠在音叉后方）
  if (amp > 0.02) {
    pushArcs(FORK_X + FORK_W * 0.5, FORK_Y + FORK_H * 0.45, vibr.value)
  }

  // 4. 球（围绕支点 BALL_PIVOT 摆动）
  const ang = ballSwing.value * Math.sin(flickerT * 0.42)
  if (ballImg.complete && ballImg.naturalWidth) {
    ctx.save()
    ctx.translate(BALL_PIVOT_X, BALL_PIVOT_Y)
    ctx.rotate(ang)
    // 将球图绘制为：图内容顶 y=214/800 落在支点（旋转中心）处
    // content 水平中心 x=407/800，让图水平居中于支点
    ctx.drawImage(
      ballImg,
      -BALL_W * 407 / 800,        // dx：图左上 x（让内容水平中心对齐支点）
      -214 / 800 * BALL_W,        // dy：图左上 y（让内容顶落在支点）
      BALL_W, BALL_H
    )
    ctx.restore()
  }

  ctx.fillStyle = textH; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'
  ctx.fillText('音叉发声 · 乒乓球显示振动', 40, 40)
  ctx.fillStyle = textCol; ctx.font = '13px sans-serif'
  ctx.fillText(
    amp > 0.02 ? '听不到振动？看乒乓球被弹开——把不明显的振动"放大"显示' : '力度越大，振动越强，乒乓球摆得越高',
    40, 64
  )
}

function drawVacuumMode() {
  const textH = boardFg(ctx.canvas)
  const textCol = boardText(ctx.canvas)
  const pumpX = 640

  const ringing = volume.value > 30

  // 1. 玻璃罩（半透明罩体）
  if (jarImg.complete && jarImg.naturalWidth) {
    ctx.drawImage(jarImg, JAR_X, JAR_Y, JAR_W, JAR_H)
  }

  // 2. 罩内空气粒子（画在玻璃罩上层 → 不被罩色叠加，清晰可见；
  //    位置在罩体内部区域，视觉上仍在罩内）
  const n = Math.round(50 * (1 - vacuum.value / 100))
  ctx.fillStyle = 'rgba(90,130,200,0.7)'
  for (let i = 0; i < n; i++) {
    const p = waveRest[(i * 7) % waveRest.length]
    const px = JAR_X + JAR_W * 0.30 + ((p - 70) / 740) * JAR_W * 0.40
    const py = JAR_Y + JAR_W * 0.30 + ((i * 37) % (JAR_W * 0.50)) + Math.sin(flickerT * 0.05 + i) * 2
    ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill()
  }

  // 3. 闹钟（画在罩子上层 → 不被玻璃色叠加，清晰可见；
  //    位置在罩体内部区域，视觉上仍在罩内）
  if (clockImg.complete && clockImg.naturalWidth) {
    ctx.save()
    const shake = ringing ? Math.sin(flickerT * 0.35) * 0.06 : 0
    ctx.translate(CLOCK_X + CLOCK_W * 0.49, CLOCK_Y + CLOCK_H * 0.5)
    ctx.rotate(shake)
    ctx.drawImage(clockImg, -CLOCK_W * 0.49, -CLOCK_H * 0.5, CLOCK_W, CLOCK_H)
    ctx.restore()
  }

  // 4. 气压表（保留：可视化罩内气压变化）
  const barW = 150
  const pct = 1 - vacuum.value / 100
  ctx.fillStyle = '#f0eee7'; ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 2
  ctx.fillRect(pumpX - 30, 150, barW, 26); ctx.strokeRect(pumpX - 30, 150, barW, 26)
  ctx.fillStyle = pct > 0.6 ? '#0d9b61' : pct > 0.2 ? '#b87915' : '#d92135'
  ctx.fillRect(pumpX - 30, 150, barW * pct, 26)
  ctx.fillStyle = textH; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'
  ctx.fillText(`罩内气压 ${(pct * 100).toFixed(0)} kPa`, pumpX + 45, 170)

  if (ringing) pushArcs(440, 270, (volume.value - 30) / 70)

  ctx.fillStyle = textH; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'
  ctx.fillText('真空罩 · 闹钟在玻璃罩内', 40, 40)
  ctx.fillStyle = textCol; ctx.font = '13px sans-serif'
  ctx.fillText(
    vacuum.value < 40 ? '铃声清晰：空气（介质）在传播声波' : vacuum.value < 80 ? '抽去空气，铃声逐渐减弱' : '空气几乎抽尽，铃声听不到 → 真空不能传声',
    40, 64
  )
}

function drawWaveMode() {
  const textH = boardFg(ctx.canvas)
  const textCol = boardText(ctx.canvas)
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
        <canvas ref="canvasRef" class="cv-sound" style="display:block;width:100%;height:100%;touch-action:none"></canvas>
      </div>
      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': mode === 'fork' }" @click="mode = 'fork'">音叉发声</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'vacuum' }" @click="mode = 'vacuum'">真空罩</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'wave' }" @click="mode = 'wave'">声波传播</button>
        <button v-if="mode === 'fork'" class="btn btn-primary" @click="swingFork">{{ vibr > 0.02 ? '再敲一下' : '敲击音叉' }}</button>
        <button v-if="mode === 'wave'" class="btn btn-primary" @click="toggleWave">{{ wavePlay ? '暂停' : '播放' }}</button>
        <button v-if="mode === 'vacuum'" class="btn btn-primary" @click="restore">放气</button>
        <button class="btn" @click="reset">重置</button>
        <button class="btn" :class="{ 'btn-primary': muted }" @click="toggleMute">{{ muted ? '静音' : '音效开' }}</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
        <FullscreenBtn />
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
