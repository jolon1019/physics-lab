<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

/* ============ 物理模型 ============ */
// 电源电动势（两节电池组，教学取值）
const E = 12 // 电源电压 V
const RHEO_MAX = 60 // 滑动变阻器最大接入阻值 Ω
// 控制变量模式：自由 / 探究I-U(固定R，调滑变改变U) / 探究I-R(固定U，换R时滑变自动补偿)
const MODES = [
  { key: 'free', label: '自由探究', hint: '可同时调节滑动变阻器（改变电压 U）与定值电阻 R，自由观察电流变化。' },
  { key: 'IU', label: '探究 I–U', hint: '已锁定定值电阻 R，只移动滑动变阻器改变电压 U —— 观察 I 与 U 成正比（图像过原点直线）。控制变量法。' },
  { key: 'IR', label: '探究 I–R', hint: '已锁定电压 U，只换定值电阻 R —— 滑动变阻器会自动调大/调小以维持 U 不变，观察 I 与 R 成反比（图像双曲线）。控制变量法。' }
]
const mode = ref('free')

const R = ref(10) // 定值电阻（被研究对象）Ω
const Rrheo = ref(20) // 滑动变阻器接入阻值 Ω（自由 / 探究I-U 时手动调节）
const lockedR = ref(10) // 探究I-U 时锁定的定值电阻
const lockedU = ref(6) // 探究I-R 时锁定的电压

// 切换模式前先记录锁定基线（取切换那一刻的真实读数）
function setMode(m) {
  if (m === 'IU') lockedR.value = R.value
  if (m === 'IR') lockedU.value = U.value
  mode.value = m
}

// 有效滑动变阻器阻值：IR 模式由“维持电压 U 不变”反算，其余模式用用户设定值
const rheo = computed(() =>
  mode.value === 'IR'
    ? Math.max(0, R.value * (E / lockedU.value - 1))
    : Rrheo.value
)
// 电压表读数（并联在定值电阻两端）：U = I·R
const U = computed(() => (E * R.value) / (R.value + rheo.value))
// 电流表读数（串联）：I = E / (R + R滑)
const I = computed(() => E / (R.value + rheo.value))

const ULocked = computed(() => mode.value === 'IR')
const RLocked = computed(() => mode.value === 'IU')

const curMode = computed(() => MODES.find((m) => m.key === mode.value))

/* ============ 视图切换：电路图 / 关系图 ============ */
const view = ref('circuit') // 'circuit' | 'graph'

/* ============ 记录对比表 ============ */
const snapshots = ref([])
const snapRef = ref(null)
function addSnapshot() {
  snapshots.value.push({
    id: Date.now() + Math.random(),
    U: U.value,
    R: R.value,
    I: I.value
  })
  if (snapshots.value.length > 6) snapshots.value.shift()
  nextTick(() => {
    const el = snapRef.value
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
  mark()
}
function clearSnapshots() {
  snapshots.value = []
}

/* ============ 完成判定 ============ */
let completed = false
function mark() {
  if (!completed) {
    completed = true
    emit('complete')
  }
}
watch([U, R, mode], mark)

/* ============ Canvas 绘制 ============ */
const canvasRef = ref(null)
let ctx = null
let raf = null
let electrons = []
const dpr = () => Math.min(window.devicePixelRatio || 1, 2)
let cssW = 0
let cssH = 0

function setupCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  cssW = rect.width
  cssH = rect.height
  canvas.width = Math.round(cssW * dpr())
  canvas.height = Math.round(cssH * dpr())
  ctx = canvas.getContext('2d')
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0)
}

// 规整矩形回路：电源(左) · 开关(上左) · 电流表(上中) · 定值电阻(上右) · 滑动变阻器(下中)
function nodes() {
  const LX = 0.15, RX = 0.85, TY = 0.28, BY = 0.74
  return {
    TL: { x: LX, y: TY }, TR: { x: RX, y: TY },
    BR: { x: RX, y: BY }, BL: { x: LX, y: BY },
    bat: { x: LX, y: 0.5 },
    sw: { x: 0.30, y: TY },
    ammeter: { x: 0.50, y: TY },
    rL: { x: 0.66, y: TY }, rR: { x: 0.82, y: TY },
    rheo: { x: 0.50, y: BY },
    vmeter: { x: 0.74, y: 0.52 }
  }
}
function loopPath() {
  const n = nodes()
  return [n.TL, n.TR, n.BR, n.BL, n.TL]
}
function px(p) {
  return { x: p.x * cssW, y: p.y * cssH }
}
function drawPath(pts, color, w) {
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  const s = px(pts[0])
  ctx.moveTo(s.x, s.y)
  for (let i = 1; i < pts.length; i++) {
    const p = px(pts[i])
    ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
}
function drawDot(rel, color) {
  const p = px(rel)
  ctx.fillStyle = color || '#050505'
  ctx.beginPath()
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
  ctx.fill()
}

// 电池（左侧竖直）
function drawBattery() {
  const n = nodes()
  const c = px(n.bat)
  const half = Math.min(34, cssH * 0.11)
  ctx.save()
  ctx.translate(c.x, c.y)
  ctx.fillStyle = '#fffef9'
  ctx.fillRect(-12, -half, 24, half * 2)
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2.5
  ctx.strokeRect(-12, -half, 24, half * 2)
  ctx.strokeStyle = '#050505'
  for (let i = 0; i < 2; i++) {
    const y = (i - 0.5) * 14
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(-9, y - 3); ctx.lineTo(9, y - 3); ctx.stroke()
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(-5, y + 3); ctx.lineTo(5, y + 3); ctx.stroke()
  }
  ctx.fillStyle = '#d92135'
  ctx.font = '800 13px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('+', 0, -half - 9)
  ctx.fillStyle = '#050505'
  ctx.fillText('−', 0, half + 9)
  ctx.fillStyle = '#3a3026'
  ctx.font = '800 12px system-ui'
  ctx.textAlign = 'right'
  ctx.fillText('电源', -16, 0)
  ctx.restore()
}

// 开关（上边左段）
function drawSwitch() {
  const n = nodes()
  const p = px(n.sw)
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x + 14, p.y); ctx.stroke()
  drawDot({ x: n.sw.x - 0.02, y: n.sw.y })
  drawDot({ x: n.sw.x + 0.02, y: n.sw.y })
  // 闭合的闸刀
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x + 14, p.y - 14); ctx.stroke()
  ctx.fillStyle = '#3a3026'
  ctx.font = '800 11px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('开关', p.x, p.y - 18)
}

// 圆形仪表（电流表/电压表通用）
function drawMeter(kind, value, rel, r) {
  const c = px(rel)
  ctx.save()
  ctx.translate(c.x, c.y)
  ctx.fillStyle = '#fffef9'
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.fillStyle = '#050505'
  ctx.font = '800 13px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(kind, 0, -r * 0.35)
  ctx.restore()
  ctx.fillStyle = '#d92135'
  ctx.font = '800 11px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(value, c.x, c.y + r + 4)
  ctx.fillStyle = '#3a3026'
  ctx.font = '800 10px system-ui'
  ctx.fillText(kind === 'A' ? '电流表' : '电压表', c.x, c.y + r + 18)
}

// 定值电阻（上边右段，锯齿符号）
function drawResistor() {
  const n = nodes()
  const a = px(n.rL), b = px(n.rR)
  const yc = a.y
  const x0 = a.x, x1 = b.x
  const segs = 6
  const step = (x1 - x0) / segs
  const amp = 9
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, yc)
  for (let i = 0; i < segs; i++) {
    const xm = x0 + step * (i + 0.5)
    const ym = yc + (i % 2 === 0 ? -amp : amp)
    ctx.lineTo(xm, ym)
  }
  ctx.lineTo(x1, yc)
  ctx.stroke()
  drawDot(n.rL); drawDot(n.rR)
  // 标注
  ctx.fillStyle = '#145fd2'
  ctx.font = '800 11px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('定值电阻 R = ' + R.value.toFixed(1) + ' Ω', (x0 + x1) / 2, yc - amp - 8)
}

// 滑动变阻器（下边中段，矩形+箭头）
function drawRheostat() {
  const n = nodes()
  const c = px(n.rheo)
  const w = Math.min(70, cssW * 0.1)
  const h = 18
  ctx.save()
  ctx.translate(c.x, c.y)
  ctx.fillStyle = '#fffef9'
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2.5
  ctx.strokeRect(-w / 2, -h / 2, w, h)
  // 滑片位置随接入阻值移动（左=0Ω，右=RHEO_MAX）
  const sx = -w / 2 + (Math.min(rheo.value, RHEO_MAX) / RHEO_MAX) * w
  // 滑片
  ctx.fillStyle = '#050505'
  ctx.fillRect(sx - 4, -h / 2 - 6, 8, 6)
  // 箭头（斜向上）
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(sx, -h / 2 - 6)
  ctx.lineTo(sx, -h / 2 - 16)
  ctx.lineTo(sx + 8, -h / 2 - 10)
  ctx.moveTo(sx, -h / 2 - 16)
  ctx.lineTo(sx - 8, -h / 2 - 10)
  ctx.stroke()
  ctx.restore()
  ctx.fillStyle = '#3a3026'
  ctx.font = '800 10px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('滑动变阻器 R′ = ' + rheo.value.toFixed(0) + ' Ω', c.x, c.y + h / 2 + 4)
}

// 电压表（并联在电阻两端）
function drawVoltmeter() {
  const n = nodes()
  const rL = px(n.rL), rR = px(n.rR)
  const vm = px(n.vmeter)
  const r = 18
  const mL = vm.x - r * 0.7, mR = vm.x + r * 0.7
  // 两条引线：从电阻两端斜下接到电压表两侧
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(rL.x, rL.y); ctx.lineTo(mL, vm.y); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(rR.x, rR.y); ctx.lineTo(mR, vm.y); ctx.stroke()
  drawMeter('V', U.value.toFixed(1) + ' V', n.vmeter, r)
}

// 电子流动
function initElectrons() {
  electrons = []
  for (let i = 0; i < 16; i++) electrons.push({ t: i / 16 })
}
function pathLengths(path) {
  const segs = []
  let total = 0
  for (let i = 0; i < path.length - 1; i++) {
    const a = px(path[i]), b = px(path[i + 1])
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    segs.push(d); total += d
  }
  return { segs, total }
}
function pointAtT(path, segs, total, t) {
  let dist = t * total
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i]) {
      const a = px(path[i]), b = px(path[i + 1])
      const k = segs[i] ? dist / segs[i] : 0
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    }
    dist -= segs[i]
  }
  return px(path[path.length - 1])
}
function drawElectrons(path, segsInfo) {
  const iNorm = Math.min(1, I.value / 1.2)
  if (iNorm < 0.01) return
  const speed = 0.0016 + iNorm * 0.006
  for (const e of electrons) {
    e.t = (e.t + speed) % 1
    const p = pointAtT(path, segsInfo.segs, segsInfo.total, e.t)
    ctx.fillStyle = 'rgba(60,130,255,0.25)'
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(60,130,255,0.95)'
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill()
  }
}

function renderCircuit() {
  const path = loopPath()
  drawPath(path, 'rgba(0,0,0,0.08)', 9)
  drawPath(path, '#1a1a1a', 4)
  const segsInfo = pathLengths(path)
  drawElectrons(path, segsInfo)
  drawBattery()
  drawSwitch()
  drawAmmeterCircuit()
  drawResistor()
  drawRheostat()
  drawVoltmeter()
}
function drawAmmeterCircuit() {
  const n = nodes()
  drawMeter('A', I.value.toFixed(2) + ' A', n.ammeter, Math.min(26, cssW * 0.038))
}

// ============ 关系图（I-U / I-R） ============
// 自动选取“漂亮”的纵轴量程与刻度，保证曲线与工作点始终落在图内
function niceAxis(target) {
  if (!(target > 0)) target = 1
  const pow = Math.pow(10, Math.floor(Math.log10(target)))
  const base = target / pow // ∈ [1,10)
  let mult
  if (base <= 1.2) mult = 1.2
  else if (base <= 1.5) mult = 1.5
  else if (base <= 2) mult = 2
  else if (base <= 2.5) mult = 2.5
  else if (base <= 3) mult = 3
  else if (base <= 4) mult = 4
  else if (base <= 5) mult = 5
  else if (base <= 6) mult = 6
  else if (base <= 8) mult = 8
  else mult = 10
  const yMax = mult * pow
  // 选约 5 等分刻度
  let step = yMax / 5
  const spow = Math.pow(10, Math.floor(Math.log10(step)))
  const sbase = step / spow
  let smult
  if (sbase <= 1) smult = 1
  else if (sbase <= 2) smult = 2
  else if (sbase <= 2.5) smult = 2.5
  else if (sbase <= 5) smult = 5
  else smult = 10
  step = smult * spow
  return { yMax, step }
}

function renderGraph() {
  const W = cssW, H = cssH
  ctx.fillStyle = '#f2f0ec'
  ctx.fillRect(0, 0, W, H)
  const padL = 56, padB = 46, padT = 34, padR = 24
  const px0 = padL, py0 = padT
  const pw = W - padL - padR, ph = H - padT - padB
  // 边框
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(px0, py0); ctx.lineTo(px0, py0 + ph); ctx.lineTo(px0 + pw, py0 + ph)
  ctx.stroke()
  // 坐标轴标题
  ctx.fillStyle = '#3a3026'
  ctx.font = '800 12px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(mode.value === 'IU' ? '电压 U / V' : '电阻 R / Ω', px0 + pw / 2, py0 + ph + 14)
  ctx.save()
  ctx.translate(15, py0 + ph / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('电流 I / A', 0, 0)
  ctx.restore()

  const isIU = mode.value === 'IU'
  // 横轴量程（与滑块上限一致）
  const xMax = isIU ? 12 : 20
  // 纵轴量程：取到曲线峰值与工作点中的较大者（保证点一定在曲线上、不被截断）
  const dataMax = isIU ? xMax / R.value : U.value / 0.5
  const { yMax, step } = niceAxis(Math.max(dataMax, I.value, 1.2))
  const X = (v) => px0 + (v / xMax) * pw
  const Y = (v) => py0 + ph - (v / yMax) * ph

  // 横向网格 + 纵轴刻度（动态）
  ctx.strokeStyle = 'rgba(120,120,130,0.22)'
  ctx.fillStyle = '#6b7078'
  ctx.lineWidth = 1
  ctx.font = '600 10px system-ui'
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
  const yDec = step < 1 ? 2 : step < 2 ? 1 : 0
  for (let v = 0; v <= yMax + step * 0.5; v += step) {
    ctx.beginPath(); ctx.moveTo(px0, Y(v)); ctx.lineTo(px0 + pw, Y(v)); ctx.stroke()
    ctx.fillText(v.toFixed(yDec), px0 - 6, Y(v))
  }
  // 纵向网格 + 横轴刻度（固定量程）
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  if (isIU) {
    for (let i = 0; i <= 12; i += 2) {
      ctx.beginPath(); ctx.moveTo(X(i), py0); ctx.lineTo(X(i), py0 + ph); ctx.stroke()
      ctx.fillText(String(i), X(i), py0 + ph + 4)
    }
  } else {
    for (let i = 0; i <= 20; i += 4) {
      ctx.beginPath(); ctx.moveTo(X(i), py0); ctx.lineTo(X(i), py0 + ph); ctx.stroke()
      ctx.fillText(String(i), X(i), py0 + ph + 4)
    }
  }

  // 关系曲线（严格按 I=U/R 计算，因 yMax 已自适应，不会被截断，斜率正确）
  ctx.strokeStyle = '#3a6ea5'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  if (isIU) {
    ctx.moveTo(X(0), Y(0))
    ctx.lineTo(X(xMax), Y(xMax / R.value))
  } else {
    let first = true
    const N = 160
    for (let k = 0; k <= N; k++) {
      const r = 0.5 + (xMax - 0.5) * (k / N)
      const i = U.value / r
      const xx = X(r), yy = Y(i)
      if (first) { ctx.moveTo(xx, yy); first = false } else ctx.lineTo(xx, yy)
    }
  }
  ctx.stroke()

  // 当前工作点（必落在曲线上：IU 时 (U,U/R) 在直线 y=x/R 上；IR 时 (R,U/R) 在双曲线上）
  const cxv = isIU ? U.value : R.value
  const cyv = I.value
  ctx.fillStyle = '#ff3b4d'
  ctx.beginPath(); ctx.arc(X(cxv), Y(cyv), 6, 0, Math.PI * 2); ctx.fill()
  ctx.font = '800 12px system-ui'
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
  ctx.fillText('(' + cxv.toFixed(1) + ', ' + I.value.toFixed(2) + ')', X(cxv) + 9, Y(cyv) - 4)

  // 自由模式下给出说明（此时 U、R 同时可变，曲线按当前 U 给出 I–R 关系）
  if (mode.value === 'free') {
    ctx.fillStyle = '#9a6b3a'
    ctx.font = '700 11px system-ui'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('自由模式：曲线为当前 U=' + U.value.toFixed(1) + 'V 下的 I–R 关系，建议切换到「探究 I–U / I–R」做控制变量分析', px0, py0 - 22)
  }
}

function render() {
  if (!ctx || cssW === 0) return
  if (view.value === 'graph') {
    renderGraph()
    return
  }
  ctx.fillStyle = '#f2f0ec'
  ctx.fillRect(0, 0, cssW, cssH)
  ctx.fillStyle = '#050505'
  ctx.font = '800 13px system-ui'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('串联测量电路 · 滑动变阻器调节电压 U，电压表并联测 U、电流表串联测 I（电子流∝电流）', 14, 12)
  renderCircuit()
}

function loop() {
  render()
  raf = requestAnimationFrame(loop)
}
function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render()
}
let resizeObs = null
onMounted(() => {
  initElectrons()
  setupCanvas()
  render()
  if (window.ResizeObserver) {
    resizeObs = new ResizeObserver(resizeCanvas)
    resizeObs.observe(canvasRef.value.parentElement)
  }
  window.addEventListener('resize', resizeCanvas)
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (resizeObs) resizeObs.disconnect()
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <!-- 控制变量模式条 -->
      <div class="r-mode-bar">
        <span class="r-mode-label">控制变量法</span>
      <div class="r-mode-tabs">
        <button v-for="m in MODES" :key="m.key" class="r-mode-btn" :class="{ active: mode === m.key }" @click="setMode(m.key)">
          {{ m.label }}
        </button>
      </div>
      </div>
      <p class="r-mode-hint">{{ curMode.hint }}</p>

      <!-- 视图切换：电路图 / 关系图 -->
      <div class="ohm-view-tabs">
        <button class="ohm-view-btn" :class="{ active: view === 'circuit' }" @click="view = 'circuit'">电路图</button>
        <button class="ohm-view-btn" :class="{ active: view === 'graph' }" @click="view = 'graph'">
          {{ mode === 'IU' ? 'I–U 关系图' : mode === 'IR' ? 'I–R 关系图' : 'I–U/I–R 关系图' }}
        </button>
      </div>

      <div class="lab-panel" style="padding: 0; min-height: 0; flex: 1">
        <canvas
          ref="canvasRef"
          style="display: block; width: 100%; height: 100%; min-height: 360px; background: #f2f0ec"
          role="img"
          :aria-label="view === 'circuit' ? '欧姆定律电路图：电源、开关、电流表、定值电阻、滑动变阻器串联，电压表并联在电阻两端' : '电流与电压或电阻的关系图像'"
        ></canvas>
      </div>

      <div class="lab-actions">
        <span class="r-readout">
          <span class="r-readout-item">电源 <strong>{{ E }} V</strong></span>
          <span class="r-readout-item">电压 U <strong>{{ U.toFixed(1) }} V</strong></span>
          <span class="r-readout-item">定值电阻 R <strong>{{ R.toFixed(1) }} Ω</strong></span>
          <span class="r-readout-item">滑动变阻器 R′ <strong>{{ rheo.toFixed(0) }} Ω</strong></span>
          <span class="r-readout-item">电流 I <strong>{{ I.toFixed(2) }} A</strong></span>
        </span>
        <button class="btn" @click="addSnapshot">＋ 记录对比</button>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>可调变量</strong>
          <span>{{ curMode.label }}</span>
        </div>
        <div class="r-param" :class="{ locked: RLocked }">
          <ParamSlider v-model="R" :min="2" :max="20" :step="0.5" :precision="1" label="定值电阻 R" unit=" Ω" :disabled="RLocked" :hint="RLocked ? '已锁定：探究 I 与 U 时保持定值电阻不变' : '换用不同定值电阻，观察电流变化'" />
        </div>
        <div class="r-param" :class="{ locked: ULocked }">
          <ParamSlider v-model="Rrheo" :min="0" :max="60" :step="1" :precision="0" label="滑动变阻器 R′" unit=" Ω" :disabled="ULocked" :hint="ULocked ? '已自动调节：换电阻时自动改变阻值以维持电压 U 不变（控制变量法）' : '移动滑片改变定值电阻两端电压 U，观察电流变化'" />
        </div>
      </div>

      <FormulaPanel
        title="欧姆定律"
        formula="I = U / R（U = I·R，I = E / (R + R′)）"
        :rows="[
          { label: '电源 E', value: E + ' V' },
          { label: '定值电阻 R', value: R.toFixed(1) + ' Ω' },
          { label: '滑动变阻器 R′', value: rheo.toFixed(0) + ' Ω' }
        ]"
        :result="[
          { label: '电流 I = E/(R+R′)', value: I.toFixed(2) + ' A' },
          { label: '电压 U = I·R', value: U.toFixed(1) + ' V' }
        ]"
        :verify="[
          '定值电阻 R 一定时，移动滑动变阻器改变电压 U，电流 I 与 U 成正比（图像过原点直线，斜率=1/R）',
          '电压 U 一定时，换不同定值电阻 R，电流 I 与 R 成反比（图像双曲线）；换大电阻时滑动变阻器需自动调大以维持 U 不变',
          '滑动变阻器作用：①调节定值电阻两端电压 U；②探究 I–R 时自动补偿、维持 U 不变（控制变量法）',
          '电阻是导体本身性质，不随 U、I 变化；R=U/I 只是计算式，真实决定式是 I = E/(R + R′)'
        ]"
      />

      <div class="lab-panel" ref="snapRef">
        <div class="lab-panel-head">
          <strong>记录对比</strong>
          <span class="r-snap-count">{{ snapshots.length }}/6</span>
          <button v-if="snapshots.length" class="btn btn-sm" @click="clearSnapshots">清空</button>
        </div>
        <div class="r-table-wrap">
          <table v-if="snapshots.length" class="r-table">
            <thead>
              <tr><th>U/V</th><th>R/Ω</th><th>I/A</th><th>关系</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in snapshots" :key="s.id">
                <td class="r-num">{{ s.U.toFixed(1) }}</td>
                <td class="r-num">{{ s.R.toFixed(1) }}</td>
                <td class="r-num">{{ s.I.toFixed(2) }}</td>
                <td>{{ mode === 'IR' ? 'U固定' : 'R固定' }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="r-empty">
            <p>尚无记录</p>
            <p class="r-empty-hint">在「探究 I–U」下记录不同电压、或在「探究 I–R」下记录不同电阻，对比电流变化规律</p>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.r-mode-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.r-mode-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--accent-strong);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.r-mode-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.r-mode-btn {
  min-height: 32px;
  padding: 0 10px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
  transition: all 0.12s ease;
}
.r-mode-btn:hover {
  background: var(--accent-soft);
  color: var(--accent-strong);
  box-shadow: 3px 3px 0 #050505;
}
.r-mode-btn.active {
  border-color: #050505;
  background: #050505;
  color: #fff;
  box-shadow: 3px 3px 0 var(--accent);
}
.r-mode-hint {
  margin: 4px 0 8px;
  padding: 8px 12px;
  border-left: 3px solid var(--accent);
  background: var(--accent-bg);
  border-radius: 0 6px 6px 0;
  font-size: 12px;
  color: var(--text-h);
  line-height: 1.5;
}
.ohm-view-tabs {
  display: flex;
  gap: 6px;
}
.ohm-view-btn {
  min-height: 30px;
  padding: 0 12px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
  transition: all 0.12s ease;
}
.ohm-view-btn:hover {
  background: var(--accent-soft);
  color: var(--accent-strong);
}
.ohm-view-btn.active {
  border-color: #050505;
  background: var(--blue);
  color: #fff;
  box-shadow: 3px 3px 0 #050505;
}
.r-readout {
  display: flex;
  gap: 8px;
  flex: 1;
  flex-wrap: wrap;
}
.r-readout-item {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 4px 10px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  font-size: 12px;
  color: var(--muted-2);
}
.r-readout-item strong {
  font-family: var(--mono);
  font-size: 14px;
  color: var(--accent-strong);
}
.r-param {
  border-bottom: 1px dashed var(--line);
}
.r-param:last-child {
  border-bottom: none;
}
.r-param.locked {
  opacity: 0.6;
  background: repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(0, 0, 0, 0.03) 8px, rgba(0, 0, 0, 0.03) 16px);
}
.r-snap-count {
  margin-left: auto;
  margin-right: 6px;
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--accent-strong);
  font-size: 11px;
  font-weight: 800;
  font-family: var(--mono);
}
.r-table-wrap {
  overflow-x: auto;
}
.r-empty {
  padding: 18px 12px;
  text-align: center;
}
.r-empty p {
  color: var(--text-dim);
  font-size: 13px;
  font-weight: 700;
}
.r-empty-hint {
  margin-top: 4px !important;
  font-size: 11px !important;
  font-weight: 400 !important;
}
.r-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.r-table th,
.r-table td {
  padding: 7px 8px;
  text-align: center;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.r-table th {
  background: var(--surface-3);
  color: var(--muted-2);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
.r-table td.r-num {
  font-family: var(--mono);
  font-weight: 700;
  color: var(--text-h);
}
@media (max-width: 1180px) {
  .lab-stage {
    grid-template-columns: 1fr;
  }
  .lab-left {
    height: auto;
  }
}
</style>
