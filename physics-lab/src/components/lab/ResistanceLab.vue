<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

/* ============ 物理模型 ============ */
// ρ：电阻率（μΩ·m，近似真实值，铜/铁/镍铬合金）
const MAT = {
  copper:   { rho: 0.017, label: '铜',     color: '#c87f3a', glow: '#f0a85a' },
  iron:     { rho: 0.1,   label: '铁',     color: '#8a8f96', glow: '#b9bec4' },
  nichrome: { rho: 1.1,   label: '镍铬合金', color: '#5a5a66', glow: '#9a6a5a' }
}

// 控制变量模式：自由 / 长度 / 横截面积 / 材料 / 温度
const MODES = [
  { key: 'free',    label: '自由探究',   hint: '可同时调节全部变量，自由观察电阻变化。' },
  { key: 'length',  label: '探究长度',   hint: '已锁定材料与横截面积，只改变长度 L，比较电阻。控制变量法。' },
  { key: 'area',    label: '探究横截面积', hint: '已锁定材料与长度，只改变横截面积 S，比较电阻。控制变量法。' },
  { key: 'material',label: '探究材料',   hint: '已锁定长度与横截面积，只换材料，比较电阻。控制变量法。' },
  { key: 'temp',    label: '探究温度',   hint: '已锁定材料/长度/横截面积，只改变温度，比较电阻。控制变量法。' }
]
const mode = ref('free')

const mat = ref('nichrome') // 默认镍铬合金（读数最直观）
const L = ref(1.0)          // 长度 m
const S = ref(1.0)          // 横截面积 mm²
const hot = ref(false)      // 加热

// 锁定状态：进入控制变量模式时，把无关变量固定到当前值
const locked = reactive({ mat: 'nichrome', L: 1.0, S: 1.0, hot: false })
watch(mode, (m) => {
  if (m !== 'free') {
    // 进入受控模式时，以当前值为基线锁定
    locked.mat = mat.value
    locked.L = L.value
    locked.S = S.value
    locked.hot = hot.value
  }
  // 探究长度：材料、面积锁死，只留 L 可调
  // 探究面积：材料、长度锁死，只留 S 可调
  // 探究材料：长度、面积锁死，只留材料可换
  // 探究温度：全部锁死，只留温度可调
})

const matLocked = computed(() => mode.value === 'area' || mode.value === 'length' || mode.value === 'temp')
const LLocked   = computed(() => mode.value === 'area' || mode.value === 'material' || mode.value === 'temp')
const SLocked   = computed(() => mode.value === 'length' || mode.value === 'material' || mode.value === 'temp')
const hotLocked = computed(() => mode.value === 'length' || mode.value === 'area' || mode.value === 'material')

const tempFactor = computed(() => (hot.value ? 1.25 : 1.0))
const R = computed(() => MAT[mat.value].rho * L.value * tempFactor.value / S.value)

// 转换法：用电流（灯泡亮度）反映电阻大小。电流随 R 增大而减小（单调、有界）。
const I_MAX = 0.6   // 电流表量程 0.6 A
const R_REF = 1.6   // 参考电阻：使读数分布直观
const I = computed(() => (I_MAX * R_REF) / (R_REF + R.value))
const brightness = computed(() => Math.min(1, I.value / I_MAX))

const curMode = computed(() => MODES.find((m) => m.key === mode.value))

/* ============ 记录对比表（控制变量法分析） ============ */
const snapshots = ref([])
const snapRef = ref(null)
const snaped = computed(() => snapshots.value.length > 0)
function addSnapshot() {
  snapshots.value.push({
    id: Date.now() + Math.random(),
    mat: MAT[mat.value].label,
    L: L.value,
    S: S.value,
    hot: hot.value ? '加热' : '常温',
    R: R.value,
    I: I.value,
    bri: brightness.value
  })
  if (snapshots.value.length > 6) snapshots.value.shift()
  // 自动滚动到记录表，确保用户看到新数据
  nextTick(() => {
    const el = snapRef.value
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  })
  mark()
}
function clearSnapshots() {
  snapshots.value = []
}

function briLabel(b) {
  if (b > 0.75) return '很亮'
  if (b > 0.45) return '较亮'
  if (b > 0.2) return '较暗'
  return '很暗'
}

// 亮度 → 颜色（记录表小圆点）
function briColor(b) {
  if (b > 0.75) return '#ffc24a'
  if (b > 0.45) return '#ffd97a'
  if (b > 0.2) return '#6a6a5a'
  return '#2a2a2a'
}

/* ============ 完成判定 ============ */
let completed = false
function mark() {
  if (!completed) {
    completed = true
    emit('complete')
  }
}
// 任意变量改动即视为已操作
watch([mat, L, S, hot, mode], mark, { deep: false })

/* ============ Canvas 绘制 ============ */
const canvasRef = ref(null)
let ctx = null
let raf = null
let electrons = [] // 电子粒子
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

// ============ 电路几何：规整矩形回路 ============
// 元件贴矩形四边：电池(左)·电流表(顶左)·电阻丝(顶中)·灯泡(右)
function nodes() {
  const LX = 0.16, RX = 0.84, TY = 0.34, BY = 0.66, MY = 0.50
  return {
    TL: { x: LX, y: TY }, TR: { x: RX, y: TY },
    BR: { x: RX, y: BY }, BL: { x: LX, y: BY },
    bat: { x: LX, y: MY },      // 电池：左边中点
    ammeter: { x: 0.30, y: TY }, // 电流表：上边左段
    wireL: { x: 0.44, y: TY },    // 电阻丝左端：上边
    wireR: { x: 0.72, y: TY },    // 电阻丝右端：上边
    lamp: { x: RX, y: MY }        // 灯泡：右边中点
  }
}

// 电子流动 + 走线用的闭合矩形周界
function loopPath() {
  const n = nodes()
  return [n.TL, n.TR, n.BR, n.BL, n.TL]
}

// 相对(0~1) → 画布像素
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

// 端子小圆点（接线点）
function drawDot(rel, color) {
  const p = px(rel)
  ctx.fillStyle = color || '#050505'
  ctx.beginPath()
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
  ctx.fill()
}

// ---- 电池（左边竖直，标准符号） ----
function drawBattery() {
  const n = nodes()
  const c = px(n.bat)
  const half = Math.min(34, cssH * 0.11) // 电池半高
  ctx.save()
  ctx.translate(c.x, c.y)
  // 电池体（盖住下方导线）
  ctx.fillStyle = '#fffef9'
  ctx.fillRect(-12, -half, 24, half * 2)
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2.5
  ctx.strokeRect(-12, -half, 24, half * 2)
  // 两节电池符号：长线(+)=粗、短线(-)=细
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 3
  for (let i = 0; i < 2; i++) {
    const y = (i - 0.5) * 14
    // 正极长线
    ctx.beginPath()
    ctx.moveTo(-9, y - 3)
    ctx.lineTo(9, y - 3)
    ctx.stroke()
    // 负极短线
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-5, y + 3)
    ctx.lineTo(5, y + 3)
    ctx.stroke()
  }
  // + / - 标记
  ctx.fillStyle = '#d92135'
  ctx.font = '800 13px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('+', 0, -half - 9)
  ctx.fillStyle = '#050505'
  ctx.fillText('−', 0, half + 9)
  // 标签
  ctx.fillStyle = '#3a3026'
  ctx.font = '800 12px system-ui'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText('电池 3V', -16, 0)
  ctx.restore()
}

// ---- 电流表（上边，圆形表盘） ----
function drawAmmeter() {
  const n = nodes()
  const c = px(n.ammeter)
  const r = Math.min(30, cssW * 0.044)
  ctx.save()
  ctx.translate(c.x, c.y)
  // 表盘（盖住导线）
  ctx.fillStyle = '#fffef9'
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2.5
  ctx.stroke()
  // 刻度弧（下半圆 0~0.6A）
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 1
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 8px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const a0 = Math.PI * 0.82, a1 = Math.PI * 0.18
  for (let i = 0; i <= 6; i++) {
    const t = i / 6
    const a = a0 + (a1 - a0) * t
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * (r - 5), Math.sin(a) * (r - 5))
    ctx.lineTo(Math.cos(a) * (r - 1), Math.sin(a) * (r - 1))
    ctx.stroke()
    if (i % 2 === 0) {
      ctx.fillText((i * 0.1).toFixed(1), Math.cos(a) * (r - 13), Math.sin(a) * (r - 13))
    }
  }
  // 指针（I=0→左，I=I_MAX→右）
  const t = Math.min(1, I.value / I_MAX)
  const pa = a0 + (a1 - a0) * t
  ctx.strokeStyle = '#ff3b4d'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(Math.cos(pa) * (r - 6), Math.sin(pa) * (r - 6))
  ctx.stroke()
  ctx.fillStyle = '#050505'
  ctx.beginPath()
  ctx.arc(0, 0, 3, 0, Math.PI * 2)
  ctx.fill()
  // A 符号 + 读数（表盘内上方）
  ctx.fillStyle = '#050505'
  ctx.font = '800 11px system-ui'
  ctx.fillText('A', 0, -r * 0.45)
  ctx.restore()
  // 标签放矩形内（下方）
  ctx.fillStyle = '#d92135'
  ctx.font = '800 11px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('电流表 ' + I.value.toFixed(2) + ' A', c.x, c.y + r + 5)
}

// ---- 电阻丝（上边中段，长度∝L 粗∝S 颜色=材料） ----
function drawResistor() {
  const n = nodes()
  const a = px(n.wireL)
  const b = px(n.wireR)
  const yc = a.y
  const th = 6 + (S.value / 4) * 18      // 线粗 ∝ S
  const seg = b.x - a.x
  const visLen = (L.value / 2) * seg      // 可视长度 ∝ L
  const x0 = a.x + (seg - visLen) / 2
  const x1 = x0 + visLen
  // 接线柱（盖住导线，连接电阻丝与细导线）
  ctx.fillStyle = '#3a3a3a'
  ctx.fillRect(x0 - 7, yc - 13, 14, 26)
  ctx.fillRect(x1 - 7, yc - 13, 14, 26)
  // 电阻丝本体
  ctx.strokeStyle = MAT[mat.value].color
  ctx.lineWidth = th
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, yc)
  ctx.lineTo(x1, yc)
  ctx.stroke()
  ctx.lineCap = 'butt'
  // 加热红光 + 热气
  if (hot.value) {
    ctx.strokeStyle = 'rgba(220,60,60,0.4)'
    ctx.lineWidth = th + 9
    ctx.beginPath()
    ctx.moveTo(x0, yc)
    ctx.lineTo(x1, yc)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(220,60,60,0.3)'
    ctx.lineWidth = 1.5
    for (let i = 0; i < 4; i++) {
      const wx = x0 + (visLen * (i + 1)) / 5
      ctx.beginPath()
      ctx.moveTo(wx, yc - th / 2 - 5)
      ctx.quadraticCurveTo(wx + 4, yc - th / 2 - 13, wx, yc - th / 2 - 21)
      ctx.stroke()
    }
  }
  // 长度标尺（矩形内侧）
  ctx.strokeStyle = '#3a3026'
  ctx.lineWidth = 1
  ctx.fillStyle = '#3a3026'
  ctx.font = '600 10px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const ticks = Math.max(2, Math.round(L.value / 0.5))
  for (let i = 0; i <= ticks; i++) {
    const tv = (i / ticks) * L.value
    const tx = x0 + (i / ticks) * visLen
    ctx.beginPath()
    ctx.moveTo(tx, yc + th / 2 + 3)
    ctx.lineTo(tx, yc + th / 2 + 10)
    ctx.stroke()
    ctx.fillText(tv.toFixed(1), tx, yc + th / 2 + 12)
  }
  // 标注（矩形内侧）
  ctx.fillStyle = '#145fd2'
  ctx.font = '800 11px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`材料 ${MAT[mat.value].label} · ρ=${MAT[mat.value].rho} · S=${S.value.toFixed(1)}mm² · L=${L.value.toFixed(1)}m`, (x0 + x1) / 2, yc - th / 2 - 6)
}

// ---- 灯泡（右边中点，亮度∝电流） ----
function drawLamp() {
  const n = nodes()
  const c = px(n.lamp)
  const r = Math.min(28, cssW * 0.042)
  const b = brightness.value
  ctx.save()
  ctx.translate(c.x, c.y)
  // 光晕
  if (b > 0.04) {
    const glow = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * (1.6 + b * 1.8))
    glow.addColorStop(0, `rgba(255,220,120,${0.7 * b})`)
    glow.addColorStop(1, 'rgba(255,220,120,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, 0, r * (1.6 + b * 1.8), 0, Math.PI * 2)
    ctx.fill()
  }
  // 灯泡玻璃（盖住导线）
  ctx.fillStyle = `rgba(255,${200 + Math.round(55 * b)},${120 + Math.round(80 * b)},${0.4 + 0.5 * b})`
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2.5
  ctx.stroke()
  // 灯丝
  ctx.strokeStyle = b > 0.08 ? `rgba(255,${160 + Math.round(95 * b)},40,${0.6 + 0.4 * b})` : '#999'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-r * 0.42, r * 0.2)
  ctx.lineTo(-r * 0.21, -r * 0.12)
  ctx.lineTo(0, r * 0.2)
  ctx.lineTo(r * 0.21, -r * 0.12)
  ctx.lineTo(r * 0.42, r * 0.2)
  ctx.stroke()
  ctx.restore()
  // 标签（矩形内侧，左方）
  ctx.fillStyle = '#050505'
  ctx.font = '800 11px system-ui'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText('小灯泡', c.x - r - 6, c.y - 8)
  ctx.fillStyle = '#b87915'
  ctx.fillText(briLabel(b), c.x - r - 6, c.y + 8)
}

// ---- 电子粒子沿 loopPath 流动 ----
function initElectrons() {
  electrons = []
  for (let i = 0; i < 16; i++) electrons.push({ t: i / 16 })
}

function pathLengths(path) {
  const segs = []
  let total = 0
  for (let i = 0; i < path.length - 1; i++) {
    const a = px(path[i])
    const b = px(path[i + 1])
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    segs.push(d)
    total += d
  }
  return { segs, total }
}

function pointAtT(path, segs, total, t) {
  let dist = t * total
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i]) {
      const a = px(path[i])
      const b = px(path[i + 1])
      const k = segs[i] ? dist / segs[i] : 0
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    }
    dist -= segs[i]
  }
  return px(path[path.length - 1])
}

function drawElectrons(path, segsInfo) {
  if (brightness.value < 0.02) return
  const speed = 0.0016 + brightness.value * 0.006
  for (const e of electrons) {
    e.t = (e.t + speed) % 1
    const p = pointAtT(path, segsInfo.segs, segsInfo.total, e.t)
    ctx.fillStyle = 'rgba(60,130,255,0.25)'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(60,130,255,0.95)'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

function render() {
  if (!ctx || cssW === 0) return
  // 背景
  ctx.fillStyle = '#f2f0ec'
  ctx.fillRect(0, 0, cssW, cssH)
  // 标题
  ctx.fillStyle = '#050505'
  ctx.font = '800 13px system-ui'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('串联电路 · 转换法：电流越小 → 电阻越大（灯泡越暗）', 14, 12)

  const path = loopPath()
  // 外层柔光底线（增加层次）
  drawPath(path, 'rgba(0,0,0,0.08)', 9)
  // 主导线（黑色矩形回路）
  drawPath(path, '#1a1a1a', 4)
  // 电子流动
  const segsInfo = pathLengths(path)
  drawElectrons(path, segsInfo)
  // 元件（盖住导线，贴矩形四边）
  drawBattery()
  drawAmmeter()
  drawResistor()
  drawLamp()
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
          <button
            v-for="m in MODES"
            :key="m.key"
            class="r-mode-btn"
            :class="{ active: mode === m.key }"
            @click="mode = m.key"
          >
            {{ m.label }}
          </button>
        </div>
      </div>
      <p class="r-mode-hint">{{ curMode.hint }}</p>

      <div class="lab-panel" style="padding: 0; min-height: 0; flex: 1">
        <canvas
          ref="canvasRef"
          style="display: block; width: 100%; height: 100%; min-height: 360px; background: #f2f0ec"
          role="img"
          aria-label="电阻实验电路图：电池、电流表、电阻丝、小灯泡组成的串联电路，电子沿导线流动"
        ></canvas>
      </div>

      <div class="lab-actions">
        <span class="r-readout">
          <span class="r-readout-item">电阻 <strong>{{ R.toFixed(3) }} Ω</strong></span>
          <span class="r-readout-item">电流 <strong>{{ I.toFixed(2) }} A</strong></span>
          <span class="r-readout-item">亮度 <strong>{{ briLabel(brightness) }}</strong></span>
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
        <!-- 材料 -->
        <div class="r-param" :class="{ locked: matLocked }">
          <div class="r-param-head">
            <span>材料（电阻率 ρ）</span>
            <span class="r-param-val">{{ MAT[mat].label }} · ρ={{ MAT[mat].rho }}</span>
          </div>
          <div class="r-mat-row">
            <button
              v-for="(m, k) in MAT"
              :key="k"
              class="r-mat-btn"
              :class="{ active: mat === k }"
              :disabled="matLocked"
              :style="{ '--mc': m.color }"
              @click="mat = k"
            >
              {{ m.label }}
            </button>
          </div>
          <p v-if="matLocked" class="r-lock-note">已锁定：探究本变量时需保持材料不变</p>
        </div>

        <!-- 长度 -->
        <div class="r-param" :class="{ locked: LLocked }">
          <ParamSlider v-model="L" :min="0.2" :max="2" :step="0.1" :precision="1" label="长度 L" unit=" m" :disabled="LLocked" />
          <p v-if="LLocked" class="r-lock-note">已锁定：探究本变量时需保持长度不变</p>
        </div>

        <!-- 横截面积 -->
        <div class="r-param" :class="{ locked: SLocked }">
          <ParamSlider v-model="S" :min="0.5" :max="4" :step="0.1" :precision="1" label="横截面积 S" unit=" mm²" :disabled="SLocked" />
          <p v-if="SLocked" class="r-lock-note">已锁定：探究本变量时需保持横截面积不变</p>
        </div>

        <!-- 温度 -->
        <div class="r-param" :class="{ locked: hotLocked }">
          <div class="r-param-head">
            <span>温度</span>
            <span class="r-param-val">{{ hot ? '加热（金属↑电阻↑）' : '常温' }}</span>
          </div>
          <div class="r-temp-row">
            <button class="btn" :class="{ 'btn-primary': !hot }" :disabled="hotLocked" @click="hot = false">常温</button>
            <button class="btn" :class="{ 'btn-primary': hot }" :disabled="hotLocked" @click="hot = true">加热 🔥</button>
          </div>
          <p v-if="hotLocked" class="r-lock-note">已锁定：探究本变量时需保持温度不变</p>
        </div>
      </div>

      <FormulaPanel
        title="电阻大小的因素"
        formula="R = ρ · L / S"
        :rows="[
          { label: '材料电阻率 ρ', value: MAT[mat].rho + ' μΩ·m' },
          { label: '长度 L', value: L + ' m' },
          { label: '横截面积 S', value: S + ' mm²' },
          { label: '温度系数', value: hot ? '×1.25（加热）' : '×1.0（常温）' }
        ]"
        :result="[
          { label: '电阻 R = ρL/S', value: R.toFixed(3) + ' Ω' },
          { label: '电流 I（转换法）', value: I.toFixed(2) + ' A' }
        ]"
        :verify="[
          '电阻是导体本身的性质，由材料(ρ)、长度L、横截面积S、温度共同决定',
          '同材料同面积：长度越长，电阻越大（R与L成正比）',
          '同材料同长度：横截面积越大（越粗），电阻越小（R与S成反比）',
          '长度面积相同时：镍铬合金 > 铁 > 铜（材料影响）',
          '金属温度升高，电阻增大；电阻与电压U、电流I无关（R=U/I只是测量式）',
          '转换法：电阻不便直接测，用电流大小/灯泡亮度间接比较电阻'
        ]"
      />

      <!-- 记录对比表（始终可见，空态提示） -->
      <div class="lab-panel" ref="snapRef">
        <div class="lab-panel-head">
          <strong>记录对比</strong>
          <span class="r-snap-count">{{ snapshots.length }}/6</span>
          <button v-if="snapshots.length" class="btn btn-sm" @click="clearSnapshots">清空</button>
        </div>
        <div class="r-table-wrap">
          <table v-if="snapshots.length" class="r-table">
            <thead>
              <tr>
                <th>材料</th><th>L/m</th><th>S/mm²</th><th>温度</th><th>R/Ω</th><th>I/A</th><th>亮度</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in snapshots" :key="s.id">
                <td>{{ s.mat }}</td>
                <td>{{ s.L.toFixed(1) }}</td>
                <td>{{ s.S.toFixed(1) }}</td>
                <td>{{ s.hot }}</td>
                <td class="r-num">{{ s.R.toFixed(3) }}</td>
                <td class="r-num">{{ s.I.toFixed(2) }}</td>
                <td><span class="r-bri-dot" :style="{ background: briColor(s.bri) }"></span>{{ briLabel(s.bri) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="r-empty">
            <p>尚无记录</p>
            <p class="r-empty-hint">点击下方「＋ 记录对比」按钮，把当前配置加入表格对比</p>
          </div>
        </div>
        <p class="r-table-tip">在「探究长度」模式下记录两行不同长度，可直观对比 R 与 I 的变化规律。</p>
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
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 8px,
    rgba(0, 0, 0, 0.03) 8px,
    rgba(0, 0, 0, 0.03) 16px
  );
}
.r-param-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8px 12px 4px;
}
.r-param-head span:first-child {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-h);
}
.r-param-val {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  font-family: var(--mono);
}
.r-lock-note {
  margin: 0 12px 8px;
  font-size: 11px;
  color: var(--text-dim);
  font-style: italic;
}
.r-mat-row,
.r-temp-row {
  display: flex;
  gap: 6px;
  padding: 4px 12px 10px;
}
.r-mat-btn {
  flex: 1;
  min-height: 34px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text-h);
  font-size: 12px;
  font-weight: 800;
  position: relative;
  transition: all 0.12s ease;
}
.r-mat-btn::before {
  content: '';
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--mc, #888);
  margin-right: 5px;
  vertical-align: middle;
}
.r-mat-btn:hover:not(:disabled) {
  box-shadow: 3px 3px 0 #050505;
}
.r-mat-btn.active {
  border-color: #050505;
  background: var(--accent-bg);
  color: var(--accent-strong);
  box-shadow: 3px 3px 0 #050505;
}
.r-mat-btn:disabled,
.r-temp-row .btn:disabled {
  cursor: not-allowed;
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
.r-bri-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--line);
  margin-right: 4px;
  vertical-align: middle;
}
.r-table-tip {
  padding: 8px 12px;
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.4;
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
