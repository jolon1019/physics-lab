<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

const canvasRef = ref(null)
let ctx = null
let raf = null
let dpr = 1
let flickerT = 0

// 可调变量
const slope = ref(35) // 斜面坡度（度，20~55）
const distanceCm = ref(120) // 总路程（cm，60~200）

// 场景画布几何（逻辑像素）
const W = 860
const H = 640
const botY = 590 // 斜面底端（桌面）纵坐标
const deskY = botY + 30 // 桌面高度
const topMargin = 46 // 顶部留白（标题 + 顶端挡板空间）
const spanMax = 0.9 * W // 200cm 时斜面水平投影目标（占画面 90%）

// 坡度角（度）
const angleDeg = computed(() => slope.value)
// 斜面像素长度：优先让 200cm 的水平投影占满 90% 宽，受画面高度约束时自动截断
const lengthPx = computed(() => {
  const rad = (angleDeg.value * Math.PI) / 180
  const span = spanMax * (distanceCm.value / 200)
  const bySpan = span / Math.cos(rad)
  const byHeight = (botY - topMargin) / Math.sin(rad)
  return Math.min(bySpan, byHeight)
})

// 模拟加速度（像素/帧²，仅用于让小车看起来更自然）
const ACCEL = computed(() => 0.32 * Math.sin((angleDeg.value * Math.PI) / 180))
// 总路程（米）
const S_TOTAL = computed(() => distanceCm.value / 100)

// 三段坐标：0=顶端 1=中点 2=底端（斜面水平居中）
const pts = computed(() => {
  const rad = (angleDeg.value * Math.PI) / 180
  const span = lengthPx.value * Math.cos(rad)
  const bottom = { x: W / 2 + span / 2, y: botY }
  const top = { x: W / 2 - span / 2, y: botY - lengthPx.value * Math.sin(rad) }
  const mid = { x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 }
  return [top, mid, bottom]
})
const len = computed(() => {
  const p = pts.value
  return Math.hypot(p[2].x - p[0].x, p[2].y - p[0].y)
})

// 小车位置参数（0~1，沿斜面）
const carPos = ref(0)
let carPosNum = 0
let dispPos = 0 // 显示位置（平滑跟随）
let wheelAngle = 0
let prevPos = 0
const state = ref('ready') // ready | running | done
let speed = 0 // 沿斜面方向速度（像素/帧）
const elapsed = ref(0) // 秒

// 自动记录的时刻
const marks = { mid: null, end: null }
const results = ref(null)
let completed = false

// s-t 实时轨迹（绘制用）
const trace = []

const hint = ref('点击「开始计时」释放小车')
const startBtn = ref('开始计时')

// 公式面板：代入变量实时数值
const formulaRows = computed(() => [
  { label: '全程路程 s', value: `${S_TOTAL.value.toFixed(2)} m` },
  { label: '中点路程 s₁ = s/2', value: `${(S_TOTAL.value / 2).toFixed(2)} m` },
  { label: '后半程路程 s₂ = s/2', value: `${(S_TOTAL.value / 2).toFixed(2)} m` }
])

// 公式面板：测量结果（实时）
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

// 求证方法（初中知识：只涉及平均速度）
const verifySteps = computed(() => {
  const steps = [
    '全程平均速度 v̄₁ = s/t₃，用全程路程除以全程时间',
    '前半程平均速度 v̄₂ = (s/2)/t₂，用半程路程除以到中点的时刻',
    '后半程平均速度 v̄₃ = (s/2)/(t₃−t₂)，用半程路程除以后半程时间',
    '将三段 v̄ 对比：后半程比前半程快，说明小车越滑越快（只描述现象，不涉及匀加速公式）',
    '多次测量取平均值，可减小误差'
  ]
  return steps
})

function setupCanvas() {
  const canvas = canvasRef.value
  dpr = window.devicePixelRatio || 1
  ctx = canvas.getContext('2d')
  resizeCanvas()
}

let resizeObs = null

// 逻辑坐标系恒为 W×H；内部像素 = 显示尺寸 × DPR，防止拉宽变形
function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  const rect = canvas.getBoundingClientRect()
  const cw = Math.max(200, rect.width)
  const ch = (cw * H) / W
  const scale = (cw * dpr) / W // 逻辑像素 → 物理像素
  canvas.width = Math.round(cw * dpr)
  canvas.height = Math.round(ch * dpr)
  canvas.style.height = `${ch}px`
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
}

// ===== 深色实验室配色 =====
const C = {
  bg0: '#0a0d14',
  bg1: '#0e1320',
  panel: '#111726',
  grid: 'rgba(140,165,210,0.07)',
  axis: 'rgba(150,170,210,0.35)',
  accent: '#ff3b4d',
  green: '#0d9b61',
  amber: '#ffc94d',
  blue: '#6ea8ff',
  text: '#c9d1d9',
  muted: '#7d8794',
  white: '#eef3fa'
}

function drawBackground() {
  // 垂直渐变
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, C.bg0)
  g.addColorStop(0.5, C.bg1)
  g.addColorStop(1, '#0a0d14')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // 细网格
  ctx.strokeStyle = C.grid
  ctx.lineWidth = 1
  for (let x = 30; x < W; x += 30) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = 20; y < H; y += 20) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }

  // 顶部呼吸光晕
  const halo = ctx.createRadialGradient(W * 0.5, -40, 10, W * 0.5, -40, 420)
  halo.addColorStop(0, 'rgba(110,168,255,0.10)')
  halo.addColorStop(1, 'rgba(110,168,255,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, W, H)
}

function drawDesk() {
  // 桌面渐变
  const dg = ctx.createLinearGradient(0, deskY, 0, deskY + 40)
  dg.addColorStop(0, 'rgba(140,165,210,0.14)')
  dg.addColorStop(1, 'rgba(140,165,210,0.02)')
  ctx.fillStyle = dg
  ctx.fillRect(0, deskY, W, H - deskY)

  // 桌面亮线
  ctx.strokeStyle = 'rgba(150,180,220,0.5)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, deskY)
  ctx.lineTo(W, deskY)
  ctx.stroke()

  // 桌面暗面
  ctx.strokeStyle = 'rgba(150,180,220,0.14)'
  ctx.beginPath()
  ctx.moveTo(0, deskY + 2)
  ctx.lineTo(W, deskY + 2)
  ctx.stroke()
}

function drawWedge() {
  const p = pts.value
  const rad = (angleDeg.value * Math.PI) / 180

  // 斜面投下的阴影
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 10
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath()
  ctx.moveTo(p[0].x + 4, p[0].y + 16)
  ctx.lineTo(p[2].x + 18, p[2].y + 16)
  ctx.lineTo(p[2].x + 34, p[2].y + 26)
  ctx.lineTo(p[0].x - 2, p[0].y + 26)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // 木制斜面表面（带高光渐变）
  const wg = ctx.createLinearGradient(p[0].x, p[0].y, p[2].x, p[2].y)
  wg.addColorStop(0, '#c9a76b')
  wg.addColorStop(0.5, '#b58f52')
  wg.addColorStop(1, '#9a723a')
  ctx.fillStyle = wg
  ctx.beginPath()
  ctx.moveTo(p[0].x, p[0].y)
  ctx.lineTo(p[2].x, p[2].y)
  ctx.lineTo(p[2].x + 14, p[2].y + 14)
  ctx.lineTo(p[0].x - 14, p[0].y + 14)
  ctx.closePath()
  ctx.fill()

  // 斜面顶部高光带
  ctx.save()
  ctx.shadowColor = 'rgba(255,240,200,0.5)'
  ctx.shadowBlur = 6
  ctx.strokeStyle = 'rgba(255,235,190,0.85)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(p[0].x, p[0].y)
  ctx.lineTo(p[2].x, p[2].y)
  ctx.stroke()
  ctx.restore()

  // 木纹
  ctx.strokeStyle = 'rgba(120,85,40,0.5)'
  ctx.lineWidth = 1
  for (let i = 1; i < 8; i++) {
    const t = i / 8
    const x1 = p[0].x + (p[2].x - p[0].x) * t
    const y1 = p[0].y + (p[2].y - p[0].y) * t
    ctx.beginPath()
    ctx.moveTo(x1 - 14, y1 + 6)
    ctx.lineTo(x1 + 14, y1 + 14)
    ctx.stroke()
  }

  // 深色支撑楔
  const sg = ctx.createLinearGradient(0, p[0].y + 14, 0, deskY)
  sg.addColorStop(0, '#5c4a2e')
  sg.addColorStop(1, '#3a2f1e')
  ctx.fillStyle = sg
  ctx.beginPath()
  ctx.moveTo(p[0].x - 14, p[0].y + 14)
  ctx.lineTo(p[2].x + 14, p[2].y + 14)
  ctx.lineTo(p[2].x + 14, deskY)
  ctx.lineTo(p[0].x - 14, deskY)
  ctx.closePath()
  ctx.fill()

  // 支撑侧边高光
  ctx.strokeStyle = 'rgba(255,220,160,0.12)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(p[0].x - 14, p[0].y + 14)
  ctx.lineTo(p[0].x - 14, deskY)
  ctx.stroke()

  // 顶端挡板
  ctx.fillStyle = 'rgba(160,170,190,0.9)'
  ctx.fillRect(p[0].x - 10, p[0].y - 26, 10, 26)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(p[0].x - 10, p[0].y - 26, 3, 26)

  // 底部挡板
  ctx.fillStyle = 'rgba(130,140,160,0.9)'
  ctx.fillRect(p[2].x + 2, p[2].y - 26, 11, 26)
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.fillRect(p[2].x + 2, p[2].y - 26, 3, 26)

  void rad
}

function drawScale() {
  const p = pts.value
  const total = S_TOTAL.value
  const rad = (angleDeg.value * Math.PI) / 180
  // 沿斜面法线方向的偏移（刻度画在斜面表面下方）
  const offX = Math.sin(rad)
  const offY = -Math.cos(rad)

  const n = 12
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const gx = p[0].x + (p[2].x - p[0].x) * t
    const gy = p[0].y + (p[2].y - p[0].y) * t
    const big = i % 3 === 0
    ctx.strokeStyle = big ? C.accent : 'rgba(160,175,205,0.5)'
    ctx.lineWidth = big ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(gx + offX * 8, gy + offY * 8)
    ctx.lineTo(gx + offX * 24, gy + offY * 24)
    ctx.stroke()
    if (big) {
      ctx.fillStyle = big ? C.accent : C.muted
      ctx.font = '600 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`${Math.round((i * total * 100) / n)}`, gx + offX * 40, gy + offY * 40 + 4)
    }
  }

  // 中点、底端发光标记
  const tag = (label, px, py, color) => {
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = 10
    ctx.fillStyle = color
    ctx.font = '700 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`◮ ${label}`, px, py)
    ctx.restore()
  }
  tag(`中点 ${Math.round(total * 50)} cm`, p[1].x - offX * 72, p[1].y - offY * 72, C.green)
  tag(`底端 ${Math.round(total * 100)} cm`, p[2].x - 8 - offX * 72, p[2].y - offY * 72, C.accent)
}

function drawTrail(cx, cy, rad, speedK) {
  // 尾部光带（速度越快越长）
  const len = 26 + speedK * 90
  const p = pts.value
  const ang = Math.atan2(p[2].y - p[0].y, p[2].x - p[0].x)
  const g = ctx.createLinearGradient(cx - Math.cos(ang) * len, cy - Math.sin(ang) * len, cx, cy)
  g.addColorStop(0, 'rgba(255,59,77,0)')
  g.addColorStop(1, 'rgba(255,120,120,0.75)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(cx - Math.cos(ang) * len - Math.sin(ang) * 5, cy - Math.sin(ang) * len + Math.cos(ang) * 5)
  ctx.lineTo(cx - Math.sin(ang) * 5, cy + Math.cos(ang) * 5)
  ctx.lineTo(cx + Math.sin(ang) * 5, cy - Math.cos(ang) * 5)
  ctx.lineTo(cx - Math.cos(ang) * len + Math.sin(ang) * 5, cy - Math.sin(ang) * len - Math.cos(ang) * 5)
  ctx.closePath()
  ctx.fill()
}

function drawWindLines(cx, cy, rad, speedK) {
  if (speedK < 0.25) return
  const p = pts.value
  const ang = Math.atan2(p[2].y - p[0].y, p[2].x - p[0].x)
  ctx.strokeStyle = `rgba(180,210,255,${0.4 * speedK})`
  ctx.lineWidth = 1.4
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * 7
    const ox = cx + Math.cos(ang + Math.PI / 2) * off
    const oy = cy + Math.sin(ang + Math.PI / 2) * off
    const len = 26 + speedK * 70
    const travel = ((flickerT * (1.5 + i * 0.4) + i * 130) % 260)
    const bx = ox - Math.cos(ang) * (travel * speedK)
    const by = oy - Math.sin(ang) * (travel * speedK)
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx - Math.cos(ang) * len, by - Math.sin(ang) * len)
    ctx.stroke()
  }
}

function drawCar(x, y, speedK) {
  const p = pts.value
  const rad = Math.atan2(p[2].y - p[0].y, p[2].x - p[0].x)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rad)

  // 车底阴影
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 3

  // 车身主体（红渐变，跑车线条）
  const cg = ctx.createLinearGradient(0, -17, 0, 12)
  cg.addColorStop(0, '#ff6b5e')
  cg.addColorStop(0.45, '#f23b3b')
  cg.addColorStop(1, '#b01e28')
  ctx.fillStyle = cg
  ctx.beginPath()
  ctx.moveTo(-20, -8)
  ctx.quadraticCurveTo(-23, -17, -12, -16)
  ctx.quadraticCurveTo(2, -17, 10, -14)
  ctx.quadraticCurveTo(18, -13, 20, -6)
  ctx.quadraticCurveTo(22, 0, 18, 4)
  ctx.lineTo(-22, 4)
  ctx.quadraticCurveTo(-27, 0, -20, -8)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // 车身描边高光
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-18, -7)
  ctx.quadraticCurveTo(-20, -15, -10, -14)
  ctx.quadraticCurveTo(2, -15, 9, -12)
  ctx.stroke()

  // 侧面高光
  const hg = ctx.createLinearGradient(0, -16, 0, 3)
  hg.addColorStop(0, 'rgba(255,255,255,0.6)')
  hg.addColorStop(0.4, 'rgba(255,255,255,0.06)')
  hg.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hg
  ctx.beginPath()
  ctx.moveTo(-19, -8)
  ctx.quadraticCurveTo(-18, -15, -9, -14)
  ctx.lineTo(8, -14)
  ctx.lineTo(-19, -8)
  ctx.closePath()
  ctx.fill()

  // 车窗（蓝色反光）
  const wg = ctx.createLinearGradient(-6, -14, 6, -9)
  wg.addColorStop(0, '#bfe3ff')
  wg.addColorStop(1, '#4f95d9')
  ctx.fillStyle = wg
  ctx.beginPath()
  ctx.moveTo(-11, -13)
  ctx.quadraticCurveTo(-3, -15, 5, -13)
  ctx.lineTo(2, -7)
  ctx.lineTo(-13, -7)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(10,20,35,0.5)'
  ctx.lineWidth = 0.8
  ctx.stroke()

  // 尾灯（运动时亮起）
  if (speedK > 0.05) {
    ctx.save()
    ctx.shadowColor = C.accent
    ctx.shadowBlur = 10
    ctx.fillStyle = '#ff4d4d'
    ctx.fillRect(-24, -7, 4, 5)
    ctx.restore()
  }

  // 车轮（辐条随运动旋转）
  for (const wx of [-11, 8]) {
    ctx.fillStyle = '#101218'
    ctx.beginPath()
    ctx.arc(wx, 5, 5.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#2a2f3a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(wx, 5, 5.6, 0, Math.PI * 2)
    ctx.stroke()
    // 轮毂
    ctx.fillStyle = '#d9dde6'
    ctx.beginPath()
    ctx.arc(wx, 5, 2.2, 0, Math.PI * 2)
    ctx.fill()
    // 旋转辐条
    ctx.save()
    ctx.translate(wx, 5)
    ctx.rotate(wheelAngle * (wx > 0 ? 1 : 1))
    ctx.strokeStyle = 'rgba(200,205,220,0.75)'
    ctx.lineWidth = 0.9
    for (let a = 0; a < 4; a++) {
      const aa = a * (Math.PI / 2)
      ctx.beginPath()
      ctx.moveTo(Math.cos(aa) * 1.2, Math.sin(aa) * 1.2)
      ctx.lineTo(Math.cos(aa) * 4.4, Math.sin(aa) * 4.4)
      ctx.stroke()
    }
    ctx.restore()
  }

  // 底盘
  ctx.fillStyle = '#262a33'
  ctx.fillRect(-24, 2, 44, 4)

  ctx.restore()
}

function drawHeader() {
  const total = S_TOTAL.value
  ctx.textAlign = 'center'
  ctx.fillStyle = C.text
  ctx.font = '700 14px sans-serif'
  ctx.fillText(
    state.value === 'ready' ? '小车静止在斜面顶端' : state.value === 'running' ? `计时中 … ${elapsed.value.toFixed(2)} s` : '测量完成！',
    W / 2,
    32
  )
  ctx.fillStyle = C.blue
  ctx.font = '600 12px sans-serif'
  ctx.fillText(`全程 s = ${total.toFixed(2)} m，中点 ${(total / 2).toFixed(2)} m，时刻自动记录`, W / 2, 50)

  if (marks.mid !== null && state.value === 'running') {
    ctx.fillStyle = C.green
    ctx.font = '700 12px sans-serif'
    ctx.fillText(`✅ 已自动记录中点时刻 t₂ = ${marks.mid.toFixed(2)} s`, W / 2, 68)
  }
  if (results.value) {
    ctx.fillStyle = C.accent
    ctx.font = '700 12px sans-serif'
    ctx.fillText(
      `全程 v̄ = ${results.value.total}   ·   前半程 v̄ = ${results.value.half}   ·   后半程 v̄ = ${results.value.rest}`,
      W / 2,
      68
    )
  }
}

function render() {
  if (!ctx) return
  ctx.clearRect(0, 0, W, H)

  drawBackground()
  drawDesk()
  drawWedge()
  drawScale()

  // 小车位置插值（用平滑后的显示位置）
  const p = pts.value
  const cp = p[0].x + (p[2].x - p[0].x) * dispPos
  const cpy = p[0].y + (p[2].y - p[0].y) * dispPos
  const speedK = Math.min(1, speed / 3)
  drawTrail(cp, cpy, 0, speedK)
  drawWindLines(cp, cpy, 0, speedK)
  drawCar(cp, cpy, speedK)

  drawHeader()
}

function startRun() {
  if (state.value === 'running') return
  state.value = 'running'
  carPosNum = 0
  dispPos = 0
  prevPos = 0
  speed = 0
  wheelAngle = 0
  elapsed.value = 0
  marks.mid = null
  marks.end = null
  results.value = null
  completed = false
  trace.length = 0
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
    hint.value = `测量完成！全程 ${totalS} m/s，中点 ${marks.mid.toFixed(2)} s，底端 ${marks.end.toFixed(2)} s ✅`
    emit('complete')
  } else {
    hint.value = `再次测量：全程 ${totalS} m/s（多次测量取平均值更准）`
  }
  startBtn.value = '再次计时'
}

function resetAll() {
  state.value = 'ready'
  carPosNum = 0
  dispPos = 0
  prevPos = 0
  speed = 0
  elapsed.value = 0
  marks.mid = null
  marks.end = null
  results.value = null
  completed = false
  trace.length = 0
  startBtn.value = '开始计时'
  hint.value = '点击「开始计时」释放小车'
}

function loop() {
  flickerT += 1
  if (state.value === 'running') {
    const dt = 1
    speed += ACCEL.value * dt
    carPosNum += speed / len.value
    elapsed.value += dt * 0.016 // 每帧 16ms

    // 车轮转动
    wheelAngle += (carPosNum - prevPos) * 6
    prevPos = carPosNum

    // 记录 s-t 点
    trace.push({ t: elapsed.value, s: carPosNum * S_TOTAL.value })

    // 自动记录中点时刻（精确插值）
    if (carPosNum >= 0.5 && marks.mid === null) {
      marks.mid = elapsed.value
      hint.value = `✅ 中点时刻 ${marks.mid.toFixed(2)} s 已记录，等待底端…`
    }
    // 自动记录底端时刻
    if (carPosNum >= 1) {
      carPosNum = 1
      stopRun()
    }
  }

  // 显示位置平滑跟随（顺滑缓动）
  const diff = carPosNum - dispPos
  dispPos += diff * 0.16
  if (Math.abs(diff) < 0.001) dispPos = carPosNum

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
        <canvas
          ref="canvasRef"
          style="display:block;width:100%;background:#0a0d14;touch-action:none"
        ></canvas>
      </div>

      <div class="lab-actions">
        <button v-if="state !== 'running'" class="btn btn-primary" @click="startRun">▶ {{ startBtn }}</button>
        <button class="btn" @click="resetAll">↺ 重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
      </div>

      <FormulaPanel
        title="🧮 公式与结果"
        formula="v̄ = s / t"
        desc="平均速度 = 路程 ÷ 时间。小车沿斜面下滑，用停表测出各段时间，即可算出各段平均速度。"
        :rows="formulaRows"
        :result="formulaResults"
        :verify="verifySteps"
      />
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>⚙ 可调变量</strong>
          <span>实时联动</span>
        </div>
        <div class="lab-params">
          <ParamSlider v-model="slope" :min="20" :max="55" :step="1" label="斜面坡度 θ" unit="°" hint="坡度越大，小车下滑越快，计时误差越大" />
          <ParamSlider v-model="distanceCm" :min="60" :max="200" :step="10" label="总路程 s" unit=" cm" hint="改变斜面长度，测不同路程的平均速度" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>📊 实时数据</strong>
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
    </aside>
  </div>
</template>
