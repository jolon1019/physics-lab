<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { boardFg } from '../../lib/boardText'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

const mode = ref('fixed')
const G = ref(4)
const pullDist = ref(0)

const weightN = computed(() => G.value)
const pulleyN = computed(() => {
  if (mode.value === 'system') return 3
  if (mode.value === 'fixed') return 1
  return 2
})
const idealF = computed(() => weightN.value / pulleyN.value)
const effortDist = computed(() => {
  if (mode.value === 'fixed') return pullDist.value
  if (mode.value === 'system') return pullDist.value * 3
  return pullDist.value * 2
})
const directionChanged = computed(() => mode.value === 'fixed' || mode.value === 'systemDown')
const savesForce = computed(() => mode.value !== 'fixed')
const savesDistance = computed(() => mode.value === 'fixed')

const modeMeta = computed(() => {
  const m = mode.value
  if (m === 'fixed') return {
    title: '定滑轮',
    formula: 'F = G（不省力）',
    desc: '定滑轮实质是等臂杠杆，不省力但可以改变力的方向。'
  }
  if (m === 'movable') return {
    title: '动滑轮',
    formula: 'F = G/2（省一半力）',
    desc: '动滑轮实质是动力臂为阻力臂 2 倍的省力杠杆，省一半力但不能改变方向，且费距离。'
  }
  if (m === 'system') return {
    title: '滑轮组（向上拉）',
    formula: 'F = G/3（省三分之二力）',
    desc: '绳端系在动滑轮框上，n = 3 段绳子承担物重，最省力但不改变方向。'
  }
  return {
    title: '滑轮组（向下拉）',
    formula: 'F = G/2（省一半力）',
    desc: '绳端系在定滑轮框下，n = 2 段绳子承担物重，既省力又能改变力的方向。'
  }
})

const trials = ref([])
const completed = ref(false)

function recordTrial() {
  trials.value.push({
    n: trials.value.length + 1,
    mode: mode.value === 'fixed' ? '定滑轮'
      : mode.value === 'movable' ? '动滑轮'
      : mode.value === 'system' ? '滑轮组(上拉)' : '滑轮组(下拉)',
    G: weightN.value,
    F: idealF.value,
    h: pullDist.value,
    s: effortDist.value
  })
  if (!completed.value && trials.value.length >= 3) {
    completed.value = true
    emit('complete')
  }
}

function resetAll() {
  mode.value = 'fixed'
  G.value = 4
  pullDist.value = 0
  trials.value = []
  completed.value = false
}

const canvasRef = ref(null)
let ctx = null
let raf = null
let dragging = false
let dragSign = 1
let dragStartY = 0
let dragStartVal = 0
let prevPullDist = 0
let rotationAngle = 0
let hitZones = []

function setupCanvas() {
  const canvas = canvasRef.value
  ctx = canvas.getContext('2d')
  canvas.width = 1800
  canvas.height = 1040
  ctx.setTransform(2, 0, 0, 2, 0, 0)
}
function dims() {
  return { W: 900, H: 520 }
}
function addHit(x, y, rx, ry, sign) {
  hitZones.push({ x, y, rx, ry, sign })
}
function zoneAt(p) {
  return hitZones.find(z => Math.abs(p.x - z.x) < z.rx && Math.abs(p.y - z.y) < z.ry) || null
}

function screenToCanvas(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (900 / rect.width),
    y: (e.clientY - rect.top) * (520 / rect.height)
  }
}

function onPointerDown(e) {
  const p = screenToCanvas(e)
  const z = zoneAt(p)
  if (z) {
    dragging = true
    dragSign = z.sign
    dragStartY = p.y
    dragStartVal = pullDist.value
    canvasRef.value.setPointerCapture(e.pointerId)
    canvasRef.value.style.cursor = 'grabbing'
  }
}
function onPointerMove(e) {
  const p = screenToCanvas(e)
  if (!dragging) {
    canvasRef.value.style.cursor = zoneAt(p) ? 'grab' : 'default'
    return
  }
  const newPull = Math.max(0, Math.min(40, dragStartVal + dragSign * (p.y - dragStartY) * 0.35))
  pullDist.value = Math.round(newPull)
}
function onPointerUp() {
  dragging = false
  canvasRef.value.style.cursor = 'grab'
}

function ropeStyle() {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}
function strokePath(pts, color) {
  ropeStyle()
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1] + 1.5)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1] + 1.5)
  ctx.stroke()
  ctx.strokeStyle = color || '#3a2a1a'
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(pts[0][0] - 0.8, pts[0][1] - 0.8)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] - 0.8, pts[i][1] - 0.8)
  ctx.stroke()
}
function strokeArc(cx, cy, r, a0, a1, ccw, color) {
  ropeStyle()
  ctx.strokeStyle = color || '#3a2a1a'
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.arc(cx, cy, r, a0, a1, ccw)
  ctx.stroke()
}

function drawPulley(cx, cy, r, angle) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)

  const pg = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.05, 0, 0, r)
  pg.addColorStop(0, '#f2f5f9')
  pg.addColorStop(0.3, '#dde4ec')
  pg.addColorStop(0.6, '#c2ccd8')
  pg.addColorStop(0.85, '#98a5b5')
  pg.addColorStop(1, '#78869a')
  ctx.fillStyle = pg
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#55617a'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(85,97,122,0.45)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(70,80,100,0.55)'
  ctx.lineWidth = 1.6
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 / 8) * i
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2)
    ctx.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7)
    ctx.stroke()
  }

  ctx.fillStyle = '#414d66'
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.beginPath()
  ctx.arc(-r * 0.03, -r * 0.03, r * 0.055, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

function drawAnchorPlate(x, y) {
  ctx.fillStyle = '#59647a'
  ctx.beginPath()
  ctx.roundRect(x - 11, y - 8, 22, 12, 3)
  ctx.fill()
  ctx.strokeStyle = '#39435a'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.roundRect(x - 11, y - 8, 22, 12, 3)
  ctx.stroke()
  ctx.fillStyle = '#2e3648'
  ctx.beginPath()
  ctx.arc(x - 6, y - 2, 1.8, 0, Math.PI * 2)
  ctx.arc(x + 6, y - 2, 1.8, 0, Math.PI * 2)
  ctx.fill()
}

function drawRing(x, y, r) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.25)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetY = 1
  ctx.strokeStyle = '#7c8899'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
  ctx.strokeStyle = '#aab4c2'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.arc(x - r * 0.15, y - r * 0.15, r * 0.85, Math.PI * 0.7, Math.PI * 1.7)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(40,48,62,0.6)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(x, y, r, Math.PI * 0.15, Math.PI * 0.85)
  ctx.stroke()
}

function drawLink(x, y1, y2) {
  ctx.strokeStyle = '#6a7688'
  ctx.lineWidth = 3.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y1)
  ctx.lineTo(x, y2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(x - 1, y1 + 1)
  ctx.lineTo(x - 1, y2 - 1)
  ctx.stroke()
}

function drawLiftHook(x, topY, ringY) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.22)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetY = 1

  ctx.strokeStyle = '#7c8899'
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.arc(x, topY + 4, 4.5, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = '#6a7688'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, topY + 8)
  ctx.lineTo(x, ringY - 12)
  ctx.stroke()

  ctx.strokeStyle = '#828fa1'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(x, ringY - 2, 10, -Math.PI * 0.12, Math.PI * 1.02, false)
  ctx.stroke()
  ctx.restore()

  ctx.strokeStyle = '#b6c0cd'
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(x - 1.5, ringY - 3.5, 8.5, Math.PI * 0.85, Math.PI * 1.55)
  ctx.stroke()

  ctx.fillStyle = '#9aa6b6'
  ctx.beginPath()
  ctx.arc(x + 8.8, ringY + 5.5, 2.4, 0, Math.PI * 2)
  ctx.fill()
}

function drawWeight(cx, topY, n) {
  const w = 42, h = 15, gap = 3
  drawRing(cx, topY - 10, 5)
  drawLink(cx, topY - 5, topY)
  for (let i = 0; i < n; i++) {
    const y = topY + i * (h + gap)
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.22)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetY = 2
    const g = ctx.createLinearGradient(cx - w / 2, y, cx + w / 2, y + h)
    g.addColorStop(0, '#d4a838')
    g.addColorStop(0.18, '#f6da58')
    g.addColorStop(0.5, '#efc73a')
    g.addColorStop(0.85, '#d2a02a')
    g.addColorStop(1, '#9c7418')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.roundRect(cx - w / 2, y, w, h, 3)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = '#8a6f24'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(cx - w / 2, y, w, h, 3)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.fillRect(cx - w / 2 + 4, y + 2, w - 14, 3)
  }
}

function drawGauge(x, cy, forceVal) {
  const w = 28, h = 48

  drawRing(x, cy - h / 2 - 4, 3.5)
  drawLink(x, cy - h / 2 - 1, cy - h / 2 + 2)

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.22)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetY = 1.5
  const g = ctx.createLinearGradient(x - w / 2, cy, x + w / 2, cy)
  g.addColorStop(0, '#dfe4ea')
  g.addColorStop(0.25, '#f6f8fa')
  g.addColorStop(0.75, '#eef1f4')
  g.addColorStop(1, '#c9cfd6')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(x - w / 2, cy - h / 2, w, h, 6)
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = '#59647a'
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.roundRect(x - w / 2, cy - h / 2, w, h, 6)
  ctx.stroke()

  ctx.fillStyle = '#39415a'
  ctx.fillRect(x - w / 2 + 3, cy - h / 2 + 2, w - 6, 4)
  ctx.fillRect(x - w / 2 + 3, cy + h / 2 - 6, w - 6, 4)

  const sw = w - 7, sh = 18
  ctx.fillStyle = '#101c14'
  ctx.beginPath()
  ctx.roundRect(x - sw / 2, cy - sh / 2 - 1, sw, sh, 3)
  ctx.fill()

  ctx.fillStyle = '#39ff88'
  ctx.font = '700 10px Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = '#39ff88'
  ctx.shadowBlur = 5
  ctx.fillText(forceVal.toFixed(1), x - 3, cy - 1)
  ctx.shadowBlur = 0
  ctx.font = '700 7px system-ui, sans-serif'
  ctx.fillText('N', x + 7, cy + 4)

  drawRing(x, cy + h / 2 + 4, 3.5)
}

function drawArrow(x1, y1, x2, y2, color) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return
  const ux = dx / len, uy = dy / len
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - ux * 9 - uy * 5, y2 - uy * 9 + ux * 5)
  ctx.lineTo(x2 - ux * 9 + uy * 5, y2 - uy * 9 - ux * 5)
  ctx.closePath()
  ctx.fill()
}

function drawLabel(text, x, y, color, align, baseline, size) {
  ctx.fillStyle = color || '#4b5563'
  ctx.font = `700 ${size || 12}px system-ui, sans-serif`
  ctx.textAlign = align || 'center'
  ctx.textBaseline = baseline || 'middle'
  ctx.fillText(text, x, y)
}

function render() {
  if (!ctx) return
  const { W, H } = dims()
  paintBoard(ctx, W, H, 'chalk')
  const cx = W * 0.38
  const beamY = 46
  const pulR = 26
  const weightCount = Math.max(1, Math.round(G.value))
  const h = pullDist.value

  hitZones = []
  const delta = h - prevPullDist
  rotationAngle += delta * 0.06
  prevPullDist = h

  ctx.fillStyle = '#67707e'
  ctx.beginPath()
  ctx.roundRect(cx - 155, beamY - 14, 310, 18, 5)
  ctx.fill()
  ctx.strokeStyle = '#4a5260'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(cx - 155, beamY - 14, 310, 18, 5)
  ctx.stroke()

  if (mode.value === 'fixed') {
    const pcx = cx
    const pcy = beamY + pulR + 14
    const rL = pcx - pulR
    const rR = pcx + pulR

    ctx.strokeStyle = '#5a6478'
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.moveTo(pcx, beamY)
    ctx.lineTo(pcx, pcy - pulR)
    ctx.stroke()

    const weightBase = pcy + 160
    const weightY = weightBase - h * 2.2
    const stackH = weightCount * 18 - 3

    const gaugeH = 48
    const gaugeBase = pcy + 110
    const gaugeCy = gaugeBase + h * 2.2

    drawPulley(pcx, pcy, pulR, rotationAngle)

    strokePath([[rL, pcy], [rL, weightY - 15]])
    drawWeight(rL, weightY, weightCount)

    strokePath([[rR, pcy], [rR, gaugeCy - gaugeH / 2 - 8]])
    drawGauge(rR, gaugeCy, idealF.value)
    addHit(rR, gaugeCy, 30, 46, 1)

    const gripY = gaugeCy + gaugeH / 2 + 22
    drawArrow(rR, gripY, rR, gripY + 26, '#dc2626')
    drawLabel(`拉力 ${idealF.value.toFixed(1)} N`, rR, gripY + 38, '#dc2626', 'center', 'top', 12)

    const gAx = rL - 30
    drawArrow(gAx, weightY + stackH / 2 + 20, gAx, weightY + stackH / 2 - 14, '#2563eb')
    drawLabel('G', gAx, weightY + stackH / 2 - 24, '#2563eb', 'center', 'bottom', 13)

    drawLabel(`h = ${h} cm`, rL - 44, (weightY + weightBase) / 2, '#0f8a4a', 'right', 'middle', 12)
    drawLabel(`s = ${effortDist.value} cm`, rR + 34, (gaugeCy + gaugeBase) / 2, '#0f8a4a', 'left', 'middle', 12)

  } else if (mode.value === 'movable') {
    const axX = cx
    const pcx = axX + pulR
    const eX = pcx + pulR

    drawAnchorPlate(axX, beamY + 2)

    const pulBase = beamY + 200
    const pulCy = pulBase - h * 1.2

    const gaugeH = 48
    const gaugeCy = beamY + 129 - h * 2.4
    const gaugeBot = gaugeCy + gaugeH / 2 + 8

    const wY = pulCy + pulR + 34
    const stackH = weightCount * 18 - 3

    drawPulley(pcx, pulCy, pulR, -rotationAngle)
    drawLiftHook(pcx, pulCy + pulR, wY - 10)

    strokePath([[axX, beamY + 8], [axX, pulCy]])
    strokeArc(pcx, pulCy, pulR, Math.PI, 0, true)
    strokePath([[eX, pulCy], [eX, gaugeBot]])

    drawWeight(pcx, wY, weightCount)
    drawGauge(eX, gaugeCy, idealF.value)
    addHit(eX, gaugeCy, 30, 46, -1)
    addHit(pcx, pulCy, 40, 40, -1)

    drawArrow(eX + 30, gaugeCy + 26, eX + 30, gaugeCy - 26, '#dc2626')
    drawLabel(`拉力 ${idealF.value.toFixed(1)} N`, eX + 36, gaugeCy, '#dc2626', 'left', 'middle', 12)

    const gAx = pcx + 34
    drawArrow(gAx, wY + stackH / 2 + 20, gAx, wY + stackH / 2 - 14, '#2563eb')
    drawLabel('G', gAx, wY + stackH / 2 - 24, '#2563eb', 'center', 'bottom', 13)

    drawLabel(`h = ${h} cm`, pcx - 40, (wY + pulBase) / 2, '#0f8a4a', 'right', 'middle', 12)
    drawLabel(`s = ${effortDist.value} cm`, eX + 30, (gaugeBot + pulCy) / 2, '#0f8a4a', 'left', 'middle', 12)
    drawLabel('n = 2 段承担', axX - 10, (beamY + pulCy) / 2, '#0f8a4a', 'right', 'middle', 12)

  } else if (mode.value === 'system') {
    const mCx = cx
    const fCx = mCx
    const fCy = beamY + pulR + 14

    drawAnchorPlate(fCx, beamY + 2)

    const mBase = fCy + 158
    const mCy = mBase - h * 1.0

    const gaugeH = 48
    const gaugeCy = beamY + 146 - h * 3.0
    const gaugeBot = gaugeCy + gaugeH / 2 + 8
    const eX = mCx + pulR

    const tieY = mCy - pulR - 14
    const wY = mCy + pulR + 34
    const stackH = weightCount * 18 - 3

    drawPulley(fCx, fCy, pulR, rotationAngle)
    drawPulley(mCx, mCy, pulR, -rotationAngle * 1.2)
    drawLiftHook(mCx, mCy + pulR, wY - 10)

    drawRing(mCx, tieY, 4.5)

    const dTP = Math.max(pulR + 1, tieY - fCy)
    const phi = Math.acos(Math.min(1, pulR / dTP))
    const tanX = mCx + pulR * Math.sin(phi)
    const tanY = fCy + pulR * Math.cos(phi)
    strokePath([[mCx, tieY - 4], [tanX, tanY]])
    strokeArc(fCx, fCy, pulR, Math.atan2(tanY - fCy, tanX - fCx), Math.PI, true)
    strokePath([[fCx - pulR, fCy], [mCx - pulR, mCy]])
    strokeArc(mCx, mCy, pulR, Math.PI, 0, true)
    strokePath([[eX, mCy], [eX, gaugeBot]])

    drawWeight(mCx, wY, weightCount)
    drawGauge(eX, gaugeCy, idealF.value)
    addHit(eX, gaugeCy, 30, 46, -1)
    addHit(mCx, mCy, 40, 40, -1)

    drawArrow(eX + 30, gaugeCy + 26, eX + 30, gaugeCy - 26, '#dc2626')
    drawLabel(`拉力 ${idealF.value.toFixed(1)} N`, eX + 36, gaugeCy, '#dc2626', 'left', 'middle', 12)

    const gAx = mCx - 34
    drawArrow(gAx, wY + stackH / 2 + 20, gAx, wY + stackH / 2 - 14, '#2563eb')
    drawLabel('G', gAx, wY + stackH / 2 - 24, '#2563eb', 'center', 'bottom', 13)

    drawLabel(`h = ${h} cm`, mCx - 44, (wY + mBase) / 2, '#0f8a4a', 'right', 'middle', 12)
    drawLabel(`s = ${effortDist.value} cm`, eX + 34, (gaugeBot + mCy) / 2, '#0f8a4a', 'left', 'middle', 12)
    drawLabel('n = 3 段承担', fCx - pulR - 10, (fCy + mCy) / 2, '#0f8a4a', 'right', 'middle', 12)

  } else {
    const mCx = cx
    const fCx = cx
    const fCy = beamY + pulR + 14

    drawAnchorPlate(fCx, beamY + 2)

    const hookY = fCy + pulR + 10
    drawRing(fCx, hookY, 4.5)

    const mBase = fCy + 158
    const mCy = mBase - h * 1.2

    const gaugeH = 48
    const eX = fCx + pulR
    const gaugeCy = fCy + 70 + h * 2.4
    const gaugeTop = gaugeCy - gaugeH / 2 - 8

    const wY = mCy + pulR + 34
    const stackH = weightCount * 18 - 3

    drawPulley(fCx, fCy, pulR, rotationAngle)
    drawPulley(mCx, mCy, pulR, -rotationAngle * 1.2)
    drawLiftHook(mCx, mCy + pulR, wY - 10)

    const dTP2 = Math.max(pulR + 1, mCy - hookY - 6)
    const phi2 = Math.acos(Math.min(1, pulR / dTP2))
    const tanX2 = mCx + pulR * Math.sin(phi2)
    const tanY2 = mCy - pulR * Math.cos(phi2)
    strokePath([[fCx, hookY + 5], [tanX2, tanY2]])
    strokeArc(mCx, mCy, pulR, Math.atan2(tanY2 - mCy, tanX2 - mCx), Math.PI, false)
    strokePath([[mCx - pulR, mCy], [mCx - pulR, fCy]])
    strokeArc(fCx, fCy, pulR, Math.PI, 0, false)
    strokePath([[eX, fCy], [eX, gaugeTop]])

    drawWeight(mCx, wY, weightCount)
    drawGauge(eX, gaugeCy, idealF.value)
    addHit(eX, gaugeCy, 30, 46, 1)
    addHit(mCx, mCy, 40, 40, -1)

    drawArrow(eX + 30, gaugeCy - 26, eX + 30, gaugeCy + 26, '#dc2626')
    drawLabel(`拉力 ${idealF.value.toFixed(1)} N`, eX + 36, gaugeCy + 30, '#dc2626', 'left', 'middle', 12)

    const gAx = mCx - 34
    drawArrow(gAx, wY + stackH / 2 + 20, gAx, wY + stackH / 2 - 14, '#2563eb')
    drawLabel('G', gAx, wY + stackH / 2 - 24, '#2563eb', 'center', 'bottom', 13)

    drawLabel(`h = ${h} cm`, mCx - 44, (wY + mBase) / 2, '#0f8a4a', 'right', 'middle', 12)
    drawLabel(`s = ${effortDist.value} cm`, eX + 34, (fCy + gaugeCy) / 2, '#0f8a4a', 'left', 'middle', 12)
    drawLabel('n = 2 段承担', mCx - pulR - 10, (fCy + mCy) / 2, '#0f8a4a', 'right', 'middle', 12)
  }

  ctx.fillStyle = boardFg(ctx.canvas)
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const title = mode.value === 'fixed' ? '定滑轮'
    : mode.value === 'movable' ? '动滑轮'
    : mode.value === 'system' ? '滑轮组（向上拉）' : '滑轮组（向下拉）'
  ctx.fillText(`${title}实验`, 18, 10)

  const infoY = H - 72
  ctx.fillStyle = '#4b5563'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`物重 G = ${weightN.value.toFixed(1)} N　→　拉力 F = ${idealF.value.toFixed(1)} N（${savesForce.value ? '省力' : '不省力'}）`, 30, infoY)
  ctx.fillText(`物体上升 h = ${h} cm　→　绳端移动 s = ${effortDist.value} cm（${savesDistance.value ? '不费距离' : '费距离'}）`, 30, infoY + 18)
  ctx.fillText(`力的方向${directionChanged.value ? '改变（向下拉提升重物）' : '不变（需向上拉）'}　·　拖动画布中的测力计试试`, 30, infoY + 36)
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
  setupCanvas()
  render()
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
      <div class="canvas-wrap">
        <canvas
          class="logic-canvas lab-canvas" ref="canvasRef"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
        ></canvas>
        <div class="mode-fabs">
          <button class="btn" :class="{ 'btn-primary': mode === 'fixed' }" @click="mode = 'fixed'">定滑轮</button>
          <button class="btn" :class="{ 'btn-primary': mode === 'movable' }" @click="mode = 'movable'">动滑轮</button>
          <button class="btn" :class="{ 'btn-primary': mode === 'system' }" @click="mode = 'system'">上拉组</button>
          <button class="btn" :class="{ 'btn-primary': mode === 'systemDown' }" @click="mode = 'systemDown'">下拉组</button>
        </div>
      </div>
      <div class="lab-actions">
        <button class="btn" @click="resetAll">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">
          {{ completed ? '✓ 已完成四种滑轮对比' : '拖动画布中的测力计或滑轮，记录数据对比' }}
        </span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实验参数</strong></div>
        <div class="lab-params">
          <ParamSlider v-model="G" :min="1" :max="8" :step="0.5" :precision="1" label="物重 G" unit=" N" />
          <ParamSlider v-model="pullDist" :min="0" :max="40" :step="1" :precision="0" label="物体上升高度 h" unit=" cm" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实验数据记录</strong>
          <span>{{ trials.length }} 组</span>
          <button class="btn btn-primary btn-record" @click="recordTrial">记录本次数据</button>
        </div>
        <table class="trial-table">
          <thead>
            <tr>
              <th>#</th>
              <th>类型</th>
              <th>G/N</th>
              <th>F/N</th>
              <th>h/cm</th>
              <th>s/cm</th>
              <th>省力</th>
              <th>省距离</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in trials" :key="t.n">
              <td>{{ t.n }}</td>
              <td>{{ t.mode }}</td>
              <td>{{ t.G }}</td>
              <td>{{ t.F.toFixed(1) }}</td>
              <td>{{ t.h }}</td>
              <td>{{ t.s }}</td>
              <td>{{ t.F < t.G ? '✓' : '✗' }}</td>
              <td>{{ t.s <= t.h ? '✓' : '✗' }}</td>
            </tr>
            <tr v-if="trials.length === 0">
              <td colspan="8" class="empty">切换滑轮类型后点击「记录本次数据」</td>
            </tr>
          </tbody>
        </table>
        <p v-if="trials.length >= 3" class="conclusion ok">
          ✓ 定滑轮不省力但改变方向；动滑轮省力但不改变方向且费距离；滑轮组兼具两者优点
        </p>
      </div>

      <FormulaPanel
        :title="modeMeta.title"
        :formula="modeMeta.formula"
        :desc="modeMeta.desc"
        :rows="[
          { label: '物重 G', value: weightN.toFixed(1) + ' N' },
          { label: '承担绳段数 n', value: String(pulleyN) }
        ]"
        :result="[
          { label: '拉力 F', value: idealF.toFixed(1) + ' N' },
          { label: '物体上升 h', value: pullDist + ' cm' },
          { label: '绳端移动 s', value: effortDist + ' cm' }
        ]"
        :verify="[
          '定滑轮：F = G，s = h，改变力的方向',
          '动滑轮：F = G/2，s = 2h，不改变方向',
          '滑轮组：F = G/n，s = nh，n 为承担物重的绳段数'
        ]"
      />
    </aside>
  </div>
</template>

<style scoped>
.canvas-wrap {
  position: relative;
  display: flex;
  justify-content: center;
}
.lab-canvas {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: calc(100vh - 250px);
  border-radius: 8px;
  cursor: grab;
}
.mode-fabs {
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 5;
  display: flex;
  gap: 6px;
}
.mode-fabs .btn {
  padding: 5px 12px;
  font-size: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
}
.btn-record {
  margin-left: auto;
  padding: 4px 12px;
  font-size: 12px;
}
.trial-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.trial-table th,
.trial-table td {
  border: 1px solid var(--line);
  padding: 5px 6px;
  text-align: center;
}
.trial-table th {
  background: rgba(90, 120, 200, 0.12);
  font-weight: 700;
}
.trial-table .empty {
  color: var(--muted);
  font-size: 12px;
}
.conclusion {
  margin: 8px 12px 12px;
  font-size: 13px;
  line-height: 1.6;
  padding: 8px 10px;
  border-radius: 6px;
}
.conclusion.ok {
  color: var(--success);
  background: rgba(47, 175, 107, 0.1);
  border-left: 3px solid var(--success);
}
</style>
