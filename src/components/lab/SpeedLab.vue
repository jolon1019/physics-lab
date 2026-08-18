<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'

const emit = defineEmits(['complete'])

// ===== 可调变量 =====
const slope = ref(35) // 斜面坡度（度，20~55）
const distanceCm = ref(120) // 总路程（cm，60~200）

// ===== 物理常量 =====
const L_M = 2.0 // 斜面全长代表的真实长度（米）
const G = 9.8 // 重力加速度（m/s²）
const SLOWMO = 2.4 // 动画放慢倍数（计时仍显示真实物理秒）
const WHEEL_R = 7 // 车轮半径（画布像素），用于车轮转角计算

// ===== 状态 =====
const state = ref('ready') // ready | running | done
const elapsed = ref(0) // 真实物理时间（秒）
const marks = { mid: null, end: null }
const results = ref(null)
let completed = false
const hint = ref('点击「开始计时」释放小车')
const startBtn = ref('开始计时')

// ===== 公式面板 =====
const S_TOTAL = computed(() => distanceCm.value / 100)
const formulaRows = computed(() => [
  { label: '全程路程 s', value: `${S_TOTAL.value.toFixed(2)} m` },
  { label: '中点路程 s₁ = s/2', value: `${(S_TOTAL.value / 2).toFixed(2)} m` },
  { label: '后半程路程 s₂ = s/2', value: `${(S_TOTAL.value / 2).toFixed(2)} m` }
])
const formulaResults = computed(() => {
  if (state.value !== 'done' || !marks.mid || !marks.end) return []
  const total = S_TOTAL.value
  const half = total / 2
  const tEnd = marks.end
  const tMid = marks.mid
  return [
    { label: '全程 v̄ = s/t₃', value: `${(total / tEnd).toFixed(3)} m/s` },
    { label: '前半程 v̄ = (s/2)/t₂', value: `${(half / tMid).toFixed(3)} m/s` },
    { label: '后半程 v̄ = (s/2)/(t₃−t₂)', value: `${(half / (tEnd - tMid)).toFixed(3)} m/s` }
  ]
})
const verifySteps = computed(() => [
  '全程平均速度 v̄₁ = s/t₃，用全程路程除以全程时间',
  '前半程平均速度 v̄₂ = (s/2)/t₂，用半程路程除以到中点的时刻',
  '后半程平均速度 v̄₃ = (s/2)/(t₃−t₂)，用半程路程除以后半程时间',
  '将三段 v̄ 对比：后半程比前半程快，说明小车越滑越快',
  '多次测量取平均值，可减小误差'
])

// ===== 物理 =====
function physics() {
  const theta = (slope.value * Math.PI) / 180
  const a = G * Math.sin(theta) // m/s²
  const dM = distanceCm.value / 100 // 全程路程（米）
  const tEnd = Math.sqrt((2 * dM) / Math.max(a, 1e-6)) // 从静止滑到终点所需时间
  return { a, dM, tEnd }
}

// ===== Canvas 2D（纯矢量绘制，无 AI 生图）=====
const canvasRef = ref(null)
let ctx = null
let raf = null
let lastT = null
let tScreen = 0
const currentFrac = ref(0) // 当前已走路程占所选全程的比例（真实匀加速：∝ t²）

// ===== 贴纸资源（小车 / 滑道，PNG 已放置在 public/assets/lab/）=====
const imgCart = ref(null) // 小车贴纸（che.png）
const imgRamp = ref(null) // 滑道贴纸（huadao.png）
const TRACK_H = 36 // 滑道贴纸在画布上的厚度（px，源图 800×148，约 170px 长时保真）
const CART_W = 84 // 小车贴纸在画布上的宽度（px），源 che.png 裁后 225×133（已去白底、透明），高度按原图比例自动

// 贴纸内"接触参考行"占源图高度的比例（像素实测，用于精确对齐，消除悬浮 / 断裂感）
// huadao.png：车轮滚行的上表面行 ≈ y27（占 148）
// che.png：车轮最底不透明行 ≈ y124（占 133）
// 两者都对齐同一条 plank 线（斜面表面），车轮即精确压在滑道上表面
const RAMP_SURF_FRAC = 27 / 148
const CART_WHEEL_FRAC = 124 / 133
const RAMP_EXT = TRACK_H * 0.5 // 滑道两端各外伸，确保起点 / 终点与整体衔接、无端点缺口

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function setupCanvas() {
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)
  ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return rect
}

function dims() {
  const canvas = canvasRef.value
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  return { W: canvas.width / dpr, H: canvas.height / dpr }
}

// 计算场景布局：底座三角形下面直角边 = 画布宽的 2/3（默认状态）
function layout() {
  const { W, H } = dims()
  const groundY = H - 78
  const theta = (slope.value * Math.PI) / 180
  // 目标底边：画布宽的 2/3；坡度太陡时压缩以保证顶端不溢出
  const desiredBase = W * (2 / 3)
  const maxBase = Math.max(80, (H - 96) / Math.max(Math.tan(theta), 0.05))
  const BASE = Math.min(desiredBase, maxBase)
  // 斜面长 = 底边 / cosθ，使水平投影（底边）= BASE；RAMP_LEN 仅随坡度变、不再随 distanceCm 变
  const RAMP_LEN = BASE / Math.cos(theta)
  // 底座定位：左 8% 边距起向右铺 BASE
  const topX = W * 0.08
  const pivotX = topX + BASE
  const pivotY = groundY - 4
  const topY = pivotY - RAMP_LEN * Math.sin(theta)
  return { W, H, groundY, pivotX, pivotY, RAMP_LEN, theta, topX, topY, BASE }
}

// 斜面表面上的点（f: 0=顶端起点, 1=底端）
function ptOnPlank(L, f) {
  return {
    x: L.topX + (L.pivotX - L.topX) * f,
    y: L.topY + (L.pivotY - L.topY) * f
  }
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

// 背景 + 桌面线
function drawBackground(L) {
  paintBoard(ctx, L.W, L.H, 'chalk')
  // 桌面线（粉笔色描边，露出统一黑板底）
  const px = L.W * 0.08
  const pw = L.W * 0.86
  const py = L.groundY
  const ph = 36
  ctx.strokeStyle = 'rgba(225,238,228,0.5)'
  ctx.lineWidth = 2
  rr(px, py, pw, ph, 16)
  ctx.stroke()
}

// 木质斜面（保留支撑楔块；斜面表面改用贴纸 huadao.png，沿斜面方向铺满）
function drawRamp(L) {
  const top = { x: L.topX, y: L.topY }
  const pivot = { x: L.pivotX, y: L.pivotY }

  // 支撑楔块（直角三角形：顶端、底端、底端正下方）
  ctx.fillStyle = '#e3d2b0'
  ctx.beginPath()
  ctx.moveTo(top.x, top.y)
  ctx.lineTo(pivot.x, pivot.y)
  ctx.lineTo(top.x, pivot.y)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,90,50,0.25)'
  ctx.lineWidth = 1
  ctx.stroke()
  // 楔块左侧竖直面阴影
  ctx.fillStyle = 'rgba(0,0,0,0.05)'
  ctx.beginPath()
  ctx.moveTo(top.x, top.y)
  ctx.lineTo(top.x, pivot.y)
  ctx.lineTo(top.x - 8, pivot.y)
  ctx.lineTo(top.x - 8, top.y + 8 * Math.tan(L.theta))
  ctx.closePath()
  ctx.fill()

  // 滑道贴纸（沿斜面方向铺满，顶端 → 底端）
  if (imgRamp.value && imgRamp.value.complete && imgRamp.value.naturalWidth > 0) {
    ctx.save()
    ctx.translate(top.x, top.y)
    ctx.rotate(L.theta)
    // 贴纸上表面行(源 y27)对齐 plank 线(局部 y=0)；两端各外伸 RAMP_EXT 封住端点缺口
    ctx.drawImage(imgRamp.value, -RAMP_EXT, -RAMP_SURF_FRAC * TRACK_H, L.RAMP_LEN + RAMP_EXT * 2, TRACK_H)
    ctx.restore()
  } else {
    // 贴纸未加载完成时的降级：沿用旧木纹斜面（避免空缺）
    const thick = 16
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#a9824f'
    ctx.lineWidth = thick + 4
    ctx.beginPath()
    ctx.moveTo(top.x, top.y + 3)
    ctx.lineTo(pivot.x, pivot.y + 3)
    ctx.stroke()
    ctx.strokeStyle = '#c9a36b'
    ctx.lineWidth = thick
    ctx.beginPath()
    ctx.moveTo(top.x, top.y)
    ctx.lineTo(pivot.x, pivot.y)
    ctx.stroke()
  }
}

// 起 / 中 / 末 测量标记（仅显示数字）
function drawMarker(L, f, color, num) {
  const p = ptOnPlank(L, f)
  const n = { x: Math.sin(L.theta), y: -Math.cos(L.theta) }
  const tip = { x: p.x + n.x * 24, y: p.y + n.y * 24 }
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  ctx.lineTo(tip.x, tip.y)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`${num} cm`, tip.x, tip.y - 6)
}

// 停表 + 直尺道具
function drawProps(L) {
  // 停表（右上）
  const sx = L.W - 56
  const sy = 64
  const r = 22
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#3a3026'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(sx, sy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#3a3026'
  rr(sx - 5, sy - r - 8, 10, 8, 2)
  ctx.fill()
  const frac = state.value === 'done' ? 1 : clamp(elapsed.value / Math.max(physics().tEnd, 1e-6), 0, 1)
  const ang = -Math.PI / 2 + frac * Math.PI * 1.5
  ctx.strokeStyle = '#e0584f'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(sx + Math.cos(ang) * r * 0.7, sy + Math.sin(ang) * r * 0.7)
  ctx.stroke()
  ctx.fillStyle = '#3a3026'
  ctx.beginPath()
  ctx.arc(sx, sy, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a3026'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(elapsed.value.toFixed(2) + ' s', sx, sy + r + 4)

  // 直尺（右下）
  const rx = L.W - 156
  const ry = L.H - 28
  const rw = 130
  const rh = 10
  ctx.fillStyle = '#f6d7a0'
  rr(rx, ry, rw, rh, 3)
  ctx.fill()
  ctx.strokeStyle = '#9a7b4f'
  ctx.lineWidth = 1
  rr(rx, ry, rw, rh, 3)
  ctx.stroke()
  ctx.strokeStyle = '#9a7b4f'
  for (let i = 0; i <= 13; i++) {
    const tx = rx + (i / 13) * rw
    const h = i % 5 === 0 ? 6 : 3
    ctx.beginPath()
    ctx.moveTo(tx, ry)
    ctx.lineTo(tx, ry + h)
    ctx.stroke()
  }
}

// 小车（贴纸 che.png，沿斜面倾斜，车轮最底行精确压在滑道上表面）
function drawCart(L, f) {
  const p = ptOnPlank(L, f)
  // 锚点 = plank 表面点（= 滑道贴纸上表面行对齐的那条线）。不再额外偏移，否则会悬浮
  const cx = p.x
  const cy = p.y

  // 接触阴影（落在滑道面上，沿斜面）
  ctx.fillStyle = 'rgba(60,50,40,0.18)'
  ctx.beginPath()
  ctx.ellipse(cx, cy + 2, CART_W * 0.5, 4, L.theta, 0, Math.PI * 2)
  ctx.fill()

  // 小车贴纸（che.png：原图车头朝左 → 水平翻转使车头朝下坡 +x 方向）
  if (imgCart.value && imgCart.value.complete && imgCart.value.naturalWidth > 0) {
    const aspect = imgCart.value.naturalHeight / imgCart.value.naturalWidth
    const cartH = CART_W * aspect
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(L.theta)
    ctx.scale(-1, 1) // 翻转：车头朝下坡
    // 车轮最底行(源 124/133)对齐 plank 线(局部 y=0)，即精确压在滑道上表面
    ctx.drawImage(imgCart.value, -CART_W / 2, -CART_WHEEL_FRAC * cartH, CART_W, cartH)
    ctx.restore()
  } else {
    // 贴纸未加载完成时的降级：旧红车身（避免空缺，车轮底贴 plank）
    const u = { x: Math.cos(L.theta), y: Math.sin(L.theta) }
    const ny = { x: Math.sin(L.theta), y: -Math.cos(L.theta) }
    const L2W = (lx, ly) => ({ x: cx + u.x * lx + ny.x * ly, y: cy + u.y * lx + ny.y * ly })
    const cartW = 48, cartH = 18, wheelR = WHEEL_R, gap = 2
    const b0 = L2W(-cartW / 2, wheelR + gap)
    const b1 = L2W(cartW / 2, wheelR + gap)
    const b2 = L2W(cartW / 2, wheelR + gap + cartH)
    const b3 = L2W(-cartW / 2, wheelR + gap + cartH)
    ctx.fillStyle = '#e0584f'
    ctx.beginPath()
    ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b3.x, b3.y)
    ctx.closePath(); ctx.fill()
  }
}

function drawOverlay() {
  if (!ctx) return
  const { W } = dims()
  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  rr(12, 12, Math.min(W - 24, 360), 34, 8)
  ctx.fill()
  ctx.fillStyle = '#3a3026'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(hint.value, 22, 29)
}

function render() {
  if (!ctx) return
  const L = layout()
  drawBackground(L)
  drawRamp(L)
  drawMarker(L, 0, '#8a8a8a', 0)
  drawMarker(L, 0.5, '#3b6fd4', Math.round(distanceCm.value * 0.5))
  drawMarker(L, 1, '#2faf6b', distanceCm.value)
  drawProps(L)
  const f = currentFrac.value
  drawCart(L, f)
  drawOverlay()
}

// ===== 控制 =====
function startRun() {
  if (state.value === 'running') return
  state.value = 'running'
  tScreen = 0
  currentFrac.value = 0
  elapsed.value = 0
  marks.mid = null
  marks.end = null
  results.value = null
  completed = false
  lastT = performance.now()
  startBtn.value = '再次计时'
  hint.value = `小车下滑中，系统将自动记录中点(${Math.round((S_TOTAL.value / 2) * 100)}cm)与底端的时刻`
}

function stopRun() {
  if (state.value !== 'running') return
  marks.end = elapsed.value
  state.value = 'done'
  const total = S_TOTAL.value
  const halfDist = total / 2
  const calc = (dist, t) => (t > 0 ? (dist / t).toFixed(2) : '—')
  const totalS = calc(total, marks.end)
  const halfS = calc(halfDist, marks.mid)
  const restS = calc(halfDist, marks.end - marks.mid)
  results.value = { total: `${totalS} m/s`, half: `${halfS} m/s`, rest: `${restS} m/s` }
  if (!completed) {
    completed = true
    hint.value = `测量完成！全程 ${totalS} m/s，中点 ${marks.mid.toFixed(2)} s，底端 ${marks.end.toFixed(2)} s`
    emit('complete')
  } else {
    hint.value = `再次测量：全程 ${totalS} m/s（多次测量取平均值更准）`
  }
  startBtn.value = '再次计时'
}

function resetAll() {
  state.value = 'ready'
  tScreen = 0
  currentFrac.value = 0
  elapsed.value = 0
  marks.mid = null
  marks.end = null
  results.value = null
  completed = false
  startBtn.value = '开始计时'
  hint.value = '点击「开始计时」释放小车'
}

function loop(now) {
  if (!lastT) lastT = now
  const dtRaw = (now - lastT) / 1000
  lastT = now
  const dt = Math.min(dtRaw, 0.05)

  if (state.value === 'running') {
    tScreen += dt
    const { tEnd } = physics()
    const tReal = Math.min(tScreen / SLOWMO, tEnd)
    const frac = Math.min(1, Math.pow(tReal / tEnd, 2))

    elapsed.value = tReal

    if (frac >= 0.5 && marks.mid === null) {
      marks.mid = tReal
      hint.value = `中点时刻 ${marks.mid.toFixed(2)} s 已记录，等待底端…`
    }
    if (frac >= 1) {
      stopRun()
    }
    currentFrac.value = frac
  }

  render()
  raf = requestAnimationFrame(loop)
}

function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render()
}

watch(slope, render)
watch(distanceCm, render)

let resizeObs = null
onMounted(() => {
  setupCanvas()
  render()
  // 异步加载贴纸资源（PNG 已放置在 public/assets/lab/）
  const loadImg = (refName, src) => {
    const img = new Image()
    img.onload = () => { render() } // 加载完成后重绘，让贴纸出现
    img.onerror = () => { console.warn('[SpeedLab] failed to load', src) }
    img.src = src
    if (refName === 'cart') imgCart.value = img
    else imgRamp.value = img
  }
  loadImg('cart', '/assets/lab/che.png')
  loadImg('ramp', '/assets/lab/huadao.png')
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
          style="display:block;width:100%;height:520px;touch-action:none;border-radius:8px"
        ></canvas>
      </div>

      <div class="lab-actions">
        <button v-if="state !== 'running'" class="btn btn-primary" @click="startRun">{{ startBtn }}</button>
        <button class="btn" @click="resetAll">重置</button>
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
          <ParamSlider v-model="slope" :min="20" :max="55" :step="1" label="斜面坡度 θ" unit="°" hint="坡度越大，小车下滑越快，斜面会实时倾斜" />
          <ParamSlider v-model="distanceCm" :min="60" :max="200" :step="10" label="总路程 s" unit=" cm" hint="改变斜面长度，测不同路程的平均速度" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实时数据</strong>
          <span>自动记录</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat">
            <span>计时器</span>
            <strong>{{ elapsed.toFixed(2) }} s</strong>
          </div>
          <div class="lab-stat success">
            <span>中点时刻 t₂</span>
            <strong>{{ marks.mid !== null ? marks.mid.toFixed(2) + ' s' : '—' }}</strong>
          </div>
          <div class="lab-stat success">
            <span>底端时刻 t₃</span>
            <strong>{{ marks.end !== null ? marks.end.toFixed(2) + ' s' : '—' }}</strong>
          </div>
          <div class="lab-stat accent">
            <span>全程平均速度</span>
            <strong>{{ results ? results.total : '—' }}</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="公式与结果"
        formula="v̄ = s / t"
        desc="平均速度 = 路程 ÷ 时间。小车沿斜面下滑，用停表测出各段时间，即可算出各段平均速度。"
        :rows="formulaRows"
        :result="formulaResults"
        :verify="verifySteps"
      />
    </aside>
  </div>
</template>
