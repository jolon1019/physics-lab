<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
// 通用电路元件图标（PNG 路径统一在 src/circuit/pngAssets.js / src/lib/drawCircuitIcon.js
// 集中，本文件不再 import 任何 PNG 文件；同图不同页直接调用 drawCircuitIcon 即可）。
import { drawCircuitIcon } from '../../lib/drawCircuitIcon'

const emit = defineEmits(['complete'])

/* ============ 物理模型 ============ */
// 电源电动势（两节电池组，教学取值）
const E = 12 // 电源电压 V
const RHEO_MAX = 60 // 滑动变阻器最大接入阻值 Ω
// 控制变量模式：自由 / 探究I-U(固定R，调滑变改变U) / 探究I-R(固定U，换R时滑变自动补偿)
const MODES = [
  { key: 'free', label: '自由探究', hint: '可同时调节滑动变阻器（改变电压 U）与小灯泡 R，自由观察电流变化与小灯泡明暗。' },
  { key: 'IU', label: '探究 I–U', hint: '已锁定小灯泡 R，只移动滑动变阻器改变电压 U —— 观察 I 与 U 成正比（图像过原点直线）。控制变量法。' },
  { key: 'IR', label: '探究 I–R', hint: '已锁定电压 U，只换小灯泡 R —— 滑动变阻器会自动调大/调小以维持 U 不变，观察 I 与 R 成反比（图像双曲线）。控制变量法。' }
]
const mode = ref('free')
const switchOn = ref(true) // 开关状态：true=闭合（电流流过），false=断开（无电流）

const R = ref(10) // 小灯泡电阻（被研究对象）Ω
const Rrheo = ref(20) // 滑动变阻器接入阻值 Ω（自由 / 探究I-U 时手动调节）
const lockedR = ref(10) // 探究I-U 时锁定的小灯泡阻值
const lockedU = ref(6) // 探究I-R 时锁定的电压

// 切换模式前先记录锁定基线（取切换那一刻的真实读数）
function setMode(m) {
  if (m === 'IU') lockedR.value = R.value
  if (m === 'IR') lockedU.value = U.value
  mode.value = m
}

// 有效滑动变阻器阻值：IR 模式由"维持电压 U 不变"反算，其余模式用用户设定值
const rheo = computed(() =>
  mode.value === 'IR'
    ? Math.max(0, R.value * (E / lockedU.value - 1))
    : Rrheo.value
)
// 开关断开 → 断路 → I=0、U=0
const U = computed(() => switchOn.value ? (E * R.value) / (R.value + rheo.value) : 0)
const I = computed(() => switchOn.value ? E / (R.value + rheo.value) : 0)

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

/* ============ PNG 元件渲染（统一调用 drawCircuitIcon） ============ */
// 不再本地缓存 Image 与手写 blit；PNG 路径知识集中在 pngAssets.js，缓存与对齐在 drawCircuitIcon。
// 本文件只补：①端子点（黄铜）；②自定义标签（灯泡 R 值+亮度，变阻器 R′值）。

// ===== 电路几何：中心点(像素) + 接线柱(像素) =====
// 接线柱位置 = PNG contain 后的半显示尺寸（电路中所有 PNG 均为 400×400 正方形，
// contain 进 w×h 方框后显示尺寸 = min(w,h)），导线正好落在元件接线柱上；
// 主回路在元件两接线柱之间断开、绕开元件本体（标准电路图画法）。
function geom() {
  const W = cssW, H = cssH
  const LX = 0.10, RX = 0.90, TY = 0.28, BY = 0.78
  const c = {
    TL: { x: LX * W, y: TY * H },
    TR: { x: RX * W, y: TY * H },
    BR: { x: RX * W, y: BY * H },
    BL: { x: LX * W, y: BY * H },
    bat: { x: LX * W, y: 0.5 * H },
    sw: { x: 0.20 * W, y: TY * H },
    am: { x: 0.36 * W, y: TY * H },
    bulb: { x: 0.62 * W, y: TY * H },
    rheo: { x: 0.50 * W, y: BY * H },
    vm: { x: 0.62 * W, y: 0.56 * H }
  }
  const BOX = { bat: [96, 100], sw: [86, 74], am: [86, 86], bulb: [104, 104], rheo: [120, 92], vm: [86, 86] }
  const half = (k) => Math.min(BOX[k][0], BOX[k][1]) / 2
  return {
    c, BOX,
    term: {
      batT: { x: c.bat.x, y: c.bat.y - half('bat') },
      batB: { x: c.bat.x, y: c.bat.y + half('bat') },
      swL: { x: c.sw.x - half('sw'), y: c.sw.y },
      swR: { x: c.sw.x + half('sw'), y: c.sw.y },
      amL: { x: c.am.x - half('am'), y: c.am.y },
      amR: { x: c.am.x + half('am'), y: c.am.y },
      bulbL: { x: c.bulb.x - half('bulb'), y: c.bulb.y },
      bulbR: { x: c.bulb.x + half('bulb'), y: c.bulb.y },
      rheoL: { x: c.rheo.x - half('rheo'), y: c.rheo.y },
      rheoR: { x: c.rheo.x + half('rheo'), y: c.rheo.y },
      vmL: { x: c.vm.x - half('vm'), y: c.vm.y },
      vmR: { x: c.vm.x + half('vm'), y: c.vm.y }
    }
  }
}

// 主回路：从 TL 顺时针，依次在元件接线柱处断开（元件本体位于两接线柱之间）
function loopPath(g) {
  const t = g.term
  return [
    g.c.TL, t.swL, t.swR, t.amL, t.amR, t.bulbL, t.bulbR, g.c.TR,
    g.c.BR, t.rheoR, t.rheoL, g.c.BL, t.batB, t.batT, g.c.TL
  ]
}

function drawPath(pts, color, w) {
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y)
  }
  ctx.stroke()
}

// 接线柱：深色外圈 + 黄铜内点，黑板/浅色背景都清晰可见
function drawDot(p) {
  ctx.fillStyle = '#050505'
  ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#e8c063'
  ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill()
}

// 电池（左侧竖直；通用函数已处理"素材横躺→逆时针 90° 竖立 + + 极性 + 电源 X V 标签"）
function drawBatteryPNG(g) {
  const c = g.c.bat
  const [w, h] = g.BOX.bat
  drawCircuitIcon(ctx, 'battery', c.x, c.y, w, h, { batteryV: E })
  drawDot(g.term.batT); drawDot(g.term.batB)
}

// 开关（上边左段；通用函数处理开/合 PNG + 端子行 dy 对齐 + 闭合/断开标签）
function drawSwitchPNG(g) {
  const c = g.c.sw
  const [w, h] = g.BOX.sw
  drawCircuitIcon(ctx, 'switch', c.x, c.y, w, h, { open: !switchOn.value })
  drawDot(g.term.swL); drawDot(g.term.swR)
}

// 电流表（PNG，串联在回路中；通用函数在屏幕内部画红色读数 + "电流表 A"标签）
function drawAmmeterPNG(g) {
  const c = g.c.am
  const [w, h] = g.BOX.am
  drawCircuitIcon(ctx, 'ammeter', c.x, c.y, w, h, { current: I.value })
  drawDot(g.term.amL); drawDot(g.term.amR)
}

// 小灯泡（通用函数画本体+辉光；本处补自定义标签"R 值+亮度"）
function drawLightBulb(g) {
  const c = g.c.bulb
  const [w, h] = g.BOX.bulb
  const on = switchOn.value && I.value > 0.02 // >20mA 视为点亮
  const b = on ? Math.min(1, I.value / 1.2) : 0
  drawCircuitIcon(ctx, 'bulb', c.x, c.y, w, h, { glow: b, label: false })
  drawDot(g.term.bulbL); drawDot(g.term.bulbR)
  // 自定义标签：亮时显示明暗程度百分比，断/熄时显示"熄灭"
  ctx.fillStyle = '#3a3026'
  ctx.font = '800 11px system-ui'
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  const bright = on ? ' · 亮度 ' + Math.round(b * 100) + '%' : ' · 熄灭'
  ctx.fillText('小灯泡 R = ' + R.value.toFixed(1) + ' Ω' + bright, c.x, c.y - h / 2 - 6)
}

// 滑动变阻器（通用函数画本体+红滑片；本处补自定义标签"R′=X Ω"）
function drawRheostatPNG(g) {
  const c = g.c.rheo
  const [w, h] = g.BOX.rheo
  drawCircuitIcon(ctx, 'rheostat', c.x, c.y, w, h, { frac: Math.min(rheo.value, RHEO_MAX) / RHEO_MAX, label: false })
  drawDot(g.term.rheoL); drawDot(g.term.rheoR)
  ctx.fillStyle = '#3a3026'
  ctx.font = '800 10px system-ui'
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('滑动变阻器 R′ = ' + rheo.value.toFixed(0) + ' Ω', c.x, c.y + Math.min(w, h) / 2 + 4)
}

// 电压表（并联在小灯泡两端：先画从灯泡到电压表接线柱的引线，再画本体+读数）
function drawVoltmeterPNG(g) {
  const c = g.c.vm
  const [w, h] = g.BOX.vm
  const bL = g.term.bulbL, bR = g.term.bulbR
  const vmL = g.term.vmL, vmR = g.term.vmR
  // 引线（接到电压表接线柱）
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(bL.x, bL.y); ctx.lineTo(vmL.x, vmL.y); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(bR.x, bR.y); ctx.lineTo(vmR.x, vmR.y); ctx.stroke()
  drawCircuitIcon(ctx, 'voltmeter', c.x, c.y, w, h, { voltage: U.value })
  drawDot(vmL); drawDot(vmR)
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
    const a = path[i], b = path[i + 1]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    segs.push(d); total += d
  }
  return { segs, total }
}
function pointAtT(path, segs, total, t) {
  let dist = t * total
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i]) {
      const a = path[i], b = path[i + 1]
      const k = segs[i] ? dist / segs[i] : 0
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    }
    dist -= segs[i]
  }
  return path[path.length - 1]
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
  const g = geom()
  const path = loopPath(g)
  drawPath(path, 'rgba(0,0,0,0.08)', 9)
  drawPath(path, '#1a1a1a', 4)
  const segsInfo = pathLengths(path)
  drawElectrons(path, segsInfo)
  drawBatteryPNG(g)
  drawSwitchPNG(g)
  drawAmmeterPNG(g)
  drawLightBulb(g)
  drawRheostatPNG(g)
  drawVoltmeterPNG(g)
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
  paintBoard(ctx, W, H, 'chalk')
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
  paintBoard(ctx, cssW, cssH, 'chalk')
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
          style="display: block; width: 100%; height: 100%; min-height: 360px"
          role="img"
          :aria-label="view === 'circuit' ? '欧姆定律电路图：电源、开关、电流表、小灯泡、滑动变阻器串联，电压表并联在小灯泡两端' : '电流与电压或电阻的关系图像'"
        ></canvas>
      </div>

      <div class="lab-actions">
        <span class="r-readout">
          <span class="r-readout-item">电源 <strong>{{ E }} V</strong></span>
          <span class="r-readout-item">电压 U <strong>{{ U.toFixed(1) }} V</strong></span>
          <span class="r-readout-item">小灯泡 R <strong>{{ R.toFixed(1) }} Ω</strong></span>
          <span class="r-readout-item">滑动变阻器 R′ <strong>{{ rheo.toFixed(0) }} Ω</strong></span>
          <span class="r-readout-item">电流 I <strong>{{ I.toFixed(2) }} A</strong></span>
        </span>
        <button class="btn" :class="{ 'btn-on': switchOn }" @click="switchOn = !switchOn">
          {{ switchOn ? '⏸ 断开开关' : '▶ 闭合开关' }}
        </button>
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
          <ParamSlider v-model="R" :min="2" :max="20" :step="0.5" :precision="1" label="小灯泡 R" unit=" Ω" :disabled="RLocked" :hint="RLocked ? '已锁定：探究 I 与 U 时保持小灯泡阻值不变' : '换用不同小灯泡，观察电流变化（电阻越大，电流越小）'" />
        </div>
        <div class="r-param" :class="{ locked: ULocked }">
          <ParamSlider v-model="Rrheo" :min="0" :max="60" :step="1" :precision="0" label="滑动变阻器 R′" unit=" Ω" :disabled="ULocked" :hint="ULocked ? '已自动调节：换灯泡时自动改变阻值以维持电压 U 不变（控制变量法）' : '移动滑片改变小灯泡两端电压 U，观察电流变化与小灯泡明暗'" />
        </div>
      </div>

      <FormulaPanel
        title="欧姆定律"
        formula="I = U / R（U = I·R，I = E / (R + R′)）"
        :rows="[
          { label: '电源 E', value: E + ' V' },
          { label: '小灯泡 R', value: R.toFixed(1) + ' Ω' },
          { label: '滑动变阻器 R′', value: rheo.toFixed(0) + ' Ω' }
        ]"
        :result="[
          { label: '电流 I = E/(R+R′)', value: I.toFixed(2) + ' A' },
          { label: '电压 U = I·R', value: U.toFixed(1) + ' V' }
        ]"
        :verify="[
          '小灯泡 R 一定时，移动滑动变阻器改变电压 U，电流 I 与 U 成正比（图像过原点直线，斜率=1/R）',
          '电压 U 一定时，换不同小灯泡 R，电流 I 与 R 成反比（图像双曲线）；换大电阻时滑动变阻器需自动调大以维持 U 不变',
          '滑动变阻器作用：①调节小灯泡两端电压 U；②探究 I–R 时自动补偿、维持 U 不变（控制变量法）',
          '电阻是导体本身性质，不随 U、I 变化；R=U/I 只是计算式，真实决定式是 I = E/(R + R′)',
          '小灯泡亮度由实际电流决定：电流越大灯越亮；电阻越大或滑动变阻器阻值越大则电流越小、灯越暗（亮度随电阻变化而明暗）',
          '断开开关 → 断路 → I=0、U=0，小灯泡熄灭（验证 I 与电路通断的关系）'
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
.btn-on {
  background: var(--accent);
  color: #fff;
  border-color: #050505;
  box-shadow: 3px 3px 0 #050505;
}
</style>
