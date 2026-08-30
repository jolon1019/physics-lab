<script setup>
import { boardFg, boardText } from '../../lib/boardText'

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

const h = ref(10) // 深度 cm
const liquid = ref('water') // water / brine
const dir = ref('side') // up / side / down

const RHO = { water: 1.0, brine: 1.2 }
const LIQ_LABEL = { water: '水', brine: '盐水' }
const G = 10

const p = computed(() => 100 * RHO[liquid.value] * h.value) // Pa
const dU = computed(() => Math.min(90, p.value * 0.03)) // U 形管液面高度差 px
const dUCells = computed(() => (dU.value / 10).toFixed(1)) // 背板刻度格数
let completed = false

const canvasRef = ref(null)
let ctx = null
let raf = null
const dpr = () => Math.min(window.devicePixelRatio || 1, 2)

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
function rr(x, y, w, h, r) {
  ctx.beginPath()
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return }
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 装置几何
function geom() {
  const { W, H } = dims()
  const baseY = H - 56 // 桌面线
  const tank = { x: 42, y: 92, w: 398, h: baseY - 92 - 8, wall: 9 }
  const surfaceY = tank.y + 14
  const probeX = tank.x + 168
  const rodTop = tank.y - 30
  const u = { cx: 690, gap: 26, top: 56, base: baseY - 6, tubeW: 18 }
  return { W, H, baseY, tank, surfaceY, probeX, rodTop, u }
}

// 桌面（深色实验室台面）
function drawTable(g) {
  const tg = ctx.createLinearGradient(0, g.baseY, 0, g.H)
  tg.addColorStop(0, 'rgba(96,84,70,0.55)')
  tg.addColorStop(0.2, 'rgba(70,60,50,0.5)')
  tg.addColorStop(1, 'rgba(38,32,26,0.6)')
  ctx.fillStyle = tg
  ctx.fillRect(0, g.baseY, g.W, g.H - g.baseY)
  // 台面高光棱线
  ctx.strokeStyle = 'rgba(255,240,214,0.5)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, g.baseY)
  ctx.lineTo(g.W, g.baseY)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(20,14,10,0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, g.baseY + 3)
  ctx.lineTo(g.W, g.baseY + 3)
  ctx.stroke()
}

// 铁架台（底座 + 立杆 + 压强计背板固定）
function drawStand(g) {
  const px = 852
  // 底座
  const bg = ctx.createLinearGradient(0, g.baseY - 6, 0, g.baseY + 18)
  bg.addColorStop(0, '#5a5f68')
  bg.addColorStop(0.5, '#3d4149')
  bg.addColorStop(1, '#26292f')
  ctx.fillStyle = bg
  rr(px - 150, g.baseY - 6, 300, 24, 5)
  ctx.fill()
  ctx.strokeStyle = 'rgba(16,18,22,0.8)'
  ctx.lineWidth = 1.6
  rr(px - 150, g.baseY - 6, 300, 24, 5)
  ctx.stroke()
  // 底座螺栓
  ctx.fillStyle = '#7b818c'
  for (const bx of [px - 128, px + 128]) {
    ctx.beginPath(); ctx.arc(bx, g.baseY + 6, 4, 0, Math.PI * 2); ctx.fill()
  }
  // 立杆
  const pg = ctx.createLinearGradient(px - 7, 0, px + 7, 0)
  pg.addColorStop(0, '#494e57')
  pg.addColorStop(0.4, '#878d98')
  pg.addColorStop(0.55, '#c9cfd8')
  pg.addColorStop(1, '#3a3e46')
  ctx.fillStyle = pg
  ctx.fillRect(px - 7, 40, 14, g.baseY - 44)
  // 立杆顶端球头
  ctx.fillStyle = '#878d98'
  ctx.beginPath(); ctx.arc(px, 40, 7, 0, Math.PI * 2); ctx.fill()
}

// 水箱（圆角玻璃 + 水体 + 液面 + 气泡 + 深度标尺）
function drawTank(g, now) {
  const t = g.tank, wall = t.wall
  // 投影
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.20)'
  ctx.beginPath()
  ctx.ellipse(t.x + t.w / 2, g.baseY + 4, t.w * 0.52, 9, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 玻璃体（圆角）
  const wallGrad = ctx.createLinearGradient(t.x, 0, t.x + t.w, 0)
  wallGrad.addColorStop(0, 'rgba(206,224,236,0.55)')
  wallGrad.addColorStop(0.12, 'rgba(255,255,255,0.10)')
  wallGrad.addColorStop(0.5, 'rgba(255,255,255,0.05)')
  wallGrad.addColorStop(0.88, 'rgba(255,255,255,0.08)')
  wallGrad.addColorStop(1, 'rgba(178,202,218,0.5)')
  ctx.fillStyle = wallGrad
  rr(t.x, t.y, t.w, t.h, 12)
  ctx.fill()
  // 水体（内部裁剪）
  ctx.save()
  rr(t.x + wall, t.y + wall, t.w - 2 * wall, t.h - 2 * wall, 8)
  ctx.clip()
  const liqGrad = ctx.createLinearGradient(0, g.surfaceY, 0, t.y + t.h)
  if (liquid.value === 'brine') {
    liqGrad.addColorStop(0, 'rgba(120,186,238,0.60)')
    liqGrad.addColorStop(1, 'rgba(30,96,182,0.85)')
  } else {
    liqGrad.addColorStop(0, 'rgba(158,216,246,0.60)')
    liqGrad.addColorStop(1, 'rgba(48,130,198,0.80)')
  }
  ctx.fillStyle = liqGrad
  ctx.fillRect(t.x + wall, g.surfaceY - 6, t.w - 2 * wall, t.y + t.h - g.surfaceY + 6)
  // 光柱（折射亮带）
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  for (const [bx0, bw] of [[t.x + 60, 46], [t.x + 210, 70], [t.x + 330, 40]]) {
    ctx.beginPath()
    ctx.moveTo(bx0, g.surfaceY)
    ctx.lineTo(bx0 + bw, g.surfaceY)
    ctx.lineTo(bx0 + bw + 26, t.y + t.h)
    ctx.lineTo(bx0 + 26, t.y + t.h)
    ctx.closePath()
    ctx.fill()
  }
  // 底部焦散亮纹
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 2
  for (let i = 0; i < 3; i++) {
    const cy = t.y + t.h - 10 - i * 8
    ctx.beginPath()
    for (let x = t.x + wall; x <= t.x + t.w - wall; x += 8) {
      const y = cy + Math.sin(x * 0.06 + i * 2 + now * 0.002) * 2.4
      x === t.x + wall ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  // 液面（波动亮线 + 椭圆镜面）
  const amp = 1.3
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  for (let x = t.x + wall; x <= t.x + t.w - wall; x += 5) {
    const y = g.surfaceY + Math.sin(x * 0.045 + now * 0.0035) * amp
    x === t.x + wall ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.stroke()
  // 上浮气泡（探头入水后）
  if (h.value > 0) {
    const tipY = g.surfaceY + (h.value / 20) * (t.y + t.h - g.surfaceY - 12)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    for (let i = 0; i < 5; i++) {
      const prog = ((now * 0.00035 + i * 0.23) % 1)
      const by = tipY - prog * (tipY - g.surfaceY - 8)
      if (by <= g.surfaceY + 4) continue
      ctx.globalAlpha = 0.6 * (1 - prog)
      ctx.beginPath()
      ctx.arc(g.probeX + Math.sin(i * 2.4 + now * 0.001) * 8, by, 1.6 + i * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
  ctx.restore()
  // 玻璃描边 + 壁厚高光
  ctx.strokeStyle = 'rgba(96,126,158,0.85)'
  ctx.lineWidth = 3
  rr(t.x, t.y, t.w, t.h, 12)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(t.x + 5, t.y + 6, 5, t.h - 12)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(t.x + t.w - 10, t.y + 6, 4, t.h - 12)
  // 深度标尺（右壁内侧）
  const depthMax = 20
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'
  ctx.lineWidth = 1.5
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '600 10.5px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let dd = 0; dd <= depthMax; dd += 5) {
    const y = g.surfaceY + (dd / depthMax) * (t.y + t.h - g.surfaceY - 12)
    ctx.beginPath()
    ctx.moveTo(t.x + t.w - wall - 14, y)
    ctx.lineTo(t.x + t.w - wall - 2, y)
    ctx.stroke()
    ctx.fillText(String(dd), t.x + t.w - wall - 30, y)
  }
}

// 探头（金属杆 + 可见鼓起的橡皮膜）+ 深度标注
function drawProbe(g) {
  const t = g.tank
  const tipY = g.surfaceY + (h.value / 20) * (t.y + t.h - g.surfaceY - 12)
  // 金属杆（三段渐变 + 高光线）
  const rodGrad = ctx.createLinearGradient(g.probeX - 4.5, 0, g.probeX + 4.5, 0)
  rodGrad.addColorStop(0, '#6d727c')
  rodGrad.addColorStop(0.35, '#e8edf3')
  rodGrad.addColorStop(0.55, '#b7bec8')
  rodGrad.addColorStop(1, '#5c616b')
  ctx.fillStyle = rodGrad
  ctx.fillRect(g.probeX - 4, g.rodTop, 8, tipY - g.rodTop + 6)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillRect(g.probeX - 1.4, g.rodTop + 4, 1.4, tipY - g.rodTop)
  // 水上防滑握柄
  const grip = ctx.createLinearGradient(g.probeX - 8, 0, g.probeX + 8, 0)
  grip.addColorStop(0, '#3f434b')
  grip.addColorStop(0.5, '#7c828c')
  grip.addColorStop(1, '#33363d')
  ctx.fillStyle = grip
  rr(g.probeX - 8, g.rodTop, 16, 18, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(g.probeX - 7, g.rodTop + i * 4.5)
    ctx.lineTo(g.probeX + 7, g.rodTop + i * 4.5)
    ctx.stroke()
  }
  // 探头头：随方向旋转；橡皮膜随压强鼓起（可视化受压）
  ctx.save()
  ctx.translate(g.probeX, tipY)
  const ang = dir.value === 'up' ? Math.PI : dir.value === 'side' ? Math.PI / 2 : 0
  ctx.rotate(ang)
  const bulge = 3 + Math.min(7, p.value / 320) // 压强越大膜越凸
  // 金属连接头
  const collar = ctx.createLinearGradient(-8, 0, 8, 0)
  collar.addColorStop(0, '#565b64')
  collar.addColorStop(0.5, '#aab0ba')
  collar.addColorStop(1, '#4a4e56')
  ctx.fillStyle = collar
  rr(-8, -2, 16, 9, 2)
  ctx.fill()
  // 橡皮膜（凸出的红色膜面）
  const mem = ctx.createLinearGradient(0, 6, 0, 8 + bulge)
  mem.addColorStop(0, '#e25548')
  mem.addColorStop(1, '#a92418')
  ctx.fillStyle = mem
  ctx.beginPath()
  ctx.moveTo(-7.5, 7)
  ctx.quadraticCurveTo(0, 9 + bulge * 2, 7.5, 7)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,20,12,0.7)'
  ctx.lineWidth = 1
  ctx.stroke()
  // 膜面高光
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.beginPath()
  ctx.ellipse(-2.6, 8.5 + bulge * 0.5, 2.2, 1.1 + bulge * 0.16, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 深度 h 标注（金色双向箭头）
  const ax = g.probeX - 40
  const hy = (g.surfaceY + tipY) / 2
  ctx.strokeStyle = '#e8c25a'
  ctx.fillStyle = '#e8c25a'
  ctx.lineWidth = 1.6
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.moveTo(g.probeX, g.surfaceY)
  ctx.lineTo(ax, g.surfaceY)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(ax, g.surfaceY + 2)
  ctx.lineTo(ax, tipY)
  ctx.stroke()
  for (const [yy, ds] of [[g.surfaceY + 2, 1], [tipY, -1]]) {
    ctx.beginPath()
    ctx.moveTo(ax, yy)
    ctx.lineTo(ax - 6, yy + ds * 6)
    ctx.lineTo(ax + 6, yy + ds * 6)
    ctx.closePath()
    ctx.fill()
  }
  ctx.font = '700 12.5px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(`h = ${h.value} cm`, ax - 10, hy)
}

// 软管（橡胶双层 + 高光）
function drawHose(g) {
  const x1 = g.probeX, y1 = g.rodTop + 6
  const x2 = g.u.cx - g.u.gap / 2, y2 = g.u.top - 10
  const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - 58
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.quadraticCurveTo(mx, my, x2, y2)
  }
  ctx.lineCap = 'round'
  path()
  ctx.strokeStyle = '#3c4048'
  ctx.lineWidth = 8
  ctx.stroke()
  path()
  ctx.strokeStyle = 'rgba(130,136,146,0.95)'
  ctx.lineWidth = 4.5
  ctx.stroke()
  ctx.save()
  ctx.translate(0, -1.6)
  path()
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 1.4
  ctx.stroke()
  ctx.restore()
}

// U 形管压强计（铁架台夹持 + 刻度背板 + 玻璃管 + 红墨水弯月面）
function drawUTube(g) {
  const { cx, gap, top, base, tubeW } = g.u
  const x1 = cx - gap / 2, x2 = cx + gap / 2
  const innerW = tubeW - 8
  const bendY = base - 12
  const bendR = gap / 2
  const poleX = 852
  // 投影
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.16)'
  ctx.beginPath()
  ctx.ellipse(cx + 8, base + 8, gap / 2 + 26, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 刻度背板（读 Δh 的白色标尺）
  const boardW = 40
  const boardTop = top + 8, boardBot = base - 20
  const bbg = ctx.createLinearGradient(cx - boardW / 2, 0, cx + boardW / 2, 0)
  bbg.addColorStop(0, '#e8e4d5')
  bbg.addColorStop(0.5, '#faf7ec')
  bbg.addColorStop(1, '#ded9c8')
  ctx.fillStyle = bbg
  rr(cx - boardW / 2, boardTop, boardW, boardBot - boardTop, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,80,60,0.7)'
  ctx.lineWidth = 1.5
  rr(cx - boardW / 2, boardTop, boardW, boardBot - boardTop, 4)
  ctx.stroke()
  const baseLevel = top + 46
  ctx.strokeStyle = 'rgba(110,100,80,0.85)'
  ctx.lineWidth = 1
  ctx.fillStyle = 'rgba(90,80,60,0.9)'
  ctx.font = '600 8.5px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i <= 12; i++) {
    const y = baseLevel - i * 10
    if (y < boardTop + 6) break
    const major = i % 2 === 0
    ctx.beginPath()
    ctx.moveTo(cx - (major ? boardW / 2 - 3 : boardW / 2 - 8), y)
    ctx.lineTo(cx + boardW / 2 - 3, y)
    ctx.stroke()
    if (major) ctx.fillText(String(i / 2), cx, y)
  }
  // 铁架台夹持臂（两道，连立杆与背板）
  for (const cy of [top + 22, base - 34]) {
    const cg = ctx.createLinearGradient(0, cy - 5, 0, cy + 5)
    cg.addColorStop(0, '#8b919b')
    cg.addColorStop(0.5, '#565b64')
    cg.addColorStop(1, '#3a3e46')
    ctx.fillStyle = cg
    rr(cx + boardW / 2 - 4, cy - 5, poleX - (cx + boardW / 2) + 12, 10, 3)
    ctx.fill()
    ctx.fillStyle = '#7b818c'
    ctx.beginPath(); ctx.arc(cx + boardW / 2 + 4, cy, 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#2c3037'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  // U 形玻璃路径
  const uPath = () => {
    ctx.beginPath()
    ctx.moveTo(x1, top)
    ctx.lineTo(x1, bendY)
    ctx.arc(cx, bendY, bendR, Math.PI, 0, true)
    ctx.lineTo(x2, top)
  }
  ctx.lineCap = 'round'
  // 玻璃体
  uPath()
  ctx.strokeStyle = 'rgba(198,219,233,0.95)'
  ctx.lineWidth = tubeW
  ctx.stroke()
  uPath()
  ctx.strokeStyle = 'rgba(240,248,253,0.65)'
  ctx.lineWidth = tubeW - 5
  ctx.stroke()
  // 红墨水（连通器：左降右升）
  const leftLevel = baseLevel + dU.value / 2
  const rightLevel = baseLevel - dU.value / 2
  ctx.beginPath()
  ctx.moveTo(x1, leftLevel)
  ctx.lineTo(x1, bendY)
  ctx.arc(cx, bendY, bendR, Math.PI, 0, true)
  ctx.lineTo(x2, rightLevel)
  ctx.strokeStyle = '#d84036'
  ctx.lineWidth = innerW
  ctx.stroke()
  // 弯月面（椭圆液面）
  ctx.fillStyle = '#b12e26'
  ctx.beginPath(); ctx.ellipse(x1, leftLevel, innerW / 2, 3.2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(x2, rightLevel, innerW / 2, 3.2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.beginPath(); ctx.ellipse(x1 - 1.5, leftLevel - 0.8, innerW / 4, 1.1, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(x2 - 1.5, rightLevel - 0.8, innerW / 4, 1.1, 0, 0, Math.PI * 2); ctx.fill()
  // 玻璃高光条纹
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x1 - 3.5, top + 10); ctx.lineTo(x1 - 3.5, bendY - 6); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x2 + 3.5, top + 10); ctx.lineTo(x2 + 3.5, bendY - 6); ctx.stroke()
  // 玻璃外轮廓
  uPath()
  ctx.strokeStyle = 'rgba(84,104,130,0.75)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  // 管口金属箍（左接软管 / 右通大气）
  for (const [fx, open] of [[x1, false], [x2, true]]) {
    const fg = ctx.createLinearGradient(fx - 9, 0, fx + 9, 0)
    fg.addColorStop(0, '#565b64')
    fg.addColorStop(0.5, '#b3b9c2')
    fg.addColorStop(1, '#4a4e56')
    ctx.fillStyle = fg
    rr(fx - 9, top - 8, 18, 10, 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(30,34,40,0.7)'
    ctx.lineWidth = 1
    rr(fx - 9, top - 8, 18, 10, 2)
    ctx.stroke()
    if (open) {
      ctx.fillStyle = '#1e232b'
      ctx.beginPath(); ctx.ellipse(fx, top - 8, 6, 2.4, 0, 0, Math.PI * 2); ctx.fill()
    }
  }
  // 液面差标注（右侧引出：两虚线 + 括号箭头）
  const bx0 = x2 + tubeW / 2 + 14
  ctx.strokeStyle = 'rgba(242,101,90,0.75)'
  ctx.lineWidth = 1.4
  ctx.setLineDash([4, 3])
  ctx.beginPath(); ctx.moveTo(x1, leftLevel); ctx.lineTo(bx0 + 10, leftLevel); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x2, rightLevel); ctx.lineTo(bx0 + 10, rightLevel); ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(bx0, leftLevel)
  ctx.lineTo(bx0, rightLevel)
  ctx.stroke()
  for (const [yy, ds] of [[leftLevel, -1], [rightLevel, 1]]) {
    ctx.beginPath()
    ctx.moveTo(bx0, yy)
    ctx.lineTo(bx0 - 5, yy + ds * 5)
    ctx.lineTo(bx0 + 5, yy + ds * 5)
    ctx.closePath()
    ctx.fillStyle = '#f2655a'
    ctx.fill()
  }
  ctx.fillStyle = '#f2655a'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`Δh = ${dUCells.value} 格`, bx0 + 12, (leftLevel + rightLevel) / 2)
  // 名称
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 12.5px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('U 形管压强计', cx, base + 16)
}

function render(now) {
  if (!ctx) return
  const g = geom()
  paintBoard(ctx, g.W, g.H, 'chalk')
  drawTable(g)
  drawStand(g)
  drawTank(g, now || 0)
  drawHose(g)
  drawProbe(g)
  drawUTube(g)

  // 顶部信息
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`液体：${LIQ_LABEL[liquid.value]}（ρ = ${RHO[liquid.value]} g/cm³）`, 20, 14)
  ctx.fillText(`探头方向：${dir.value === 'up' ? '向上' : dir.value === 'down' ? '向下' : '向侧面'} · 深度 h = ${h.value} cm`, 20, 34)
  // 底部结论
  ctx.fillStyle = '#d23b3b'
  ctx.font = '800 15px system-ui, sans-serif'
  ctx.fillText(`橡皮膜所受液体压强　p = ρgh = ${p.value.toFixed(0)} Pa`, 20, g.H - 30)
  ctx.fillStyle = '#7ba7d0'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillText('同种液体同一深度，各个方向压强相等 → 液面差不变', 20, g.H - 52)
}

function loop(now) {
  render(now)
  raf = requestAnimationFrame(loop)
}
function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render(performance.now())
}

function mark() {
  if (!completed) {
    completed = true
    emit('complete')
  }
}
watch([h, liquid, dir], mark)

let resizeObs = null
onMounted(() => {
  setupCanvas()
  render(performance.now())
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
      <div class="lab-panel" style="padding: 0">
        <canvas
          class="logic-canvas" ref="canvasRef"
          style="display: block; width: 100%; height: 520px; border-radius: 8px"
        ></canvas>
      </div>
      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': liquid === 'water' }" @click="liquid = 'water'">水</button>
        <button class="btn" :class="{ 'btn-primary': liquid === 'brine' }" @click="liquid = 'brine'">盐水</button>
        <button class="btn" :class="{ 'btn-primary': dir === 'up' }" @click="dir = 'up'">探头向上</button>
        <button class="btn" :class="{ 'btn-primary': dir === 'side' }" @click="dir = 'side'">探头向侧</button>
        <button class="btn" :class="{ 'btn-primary': dir === 'down' }" @click="dir = 'down'">探头向下</button>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>液体压强</span></div>
        <ParamSlider v-model="h" :min="0" :max="20" :step="1" :precision="0" label="深度 h" unit=" cm" hint="液面下越深，压强越大" />
      </div>

      <FormulaPanel
        title="液体内部压强"
        formula="p = ρ · g · h"
        :rows="[
          { label: '液体密度 ρ', value: RHO[liquid] + ' g/cm³' },
          { label: '深度 h', value: h + ' cm' },
          { label: 'g', value: G + ' N/kg' }
        ]"
        :result="[{ label: '压强 p = ρgh', value: p.toFixed(0) + ' Pa' }]"
        :verify="[
          '探头放入水中，U 形管两液面出现高度差——说明液体内部存在压强',
          '保持深度不变，探头朝上、朝侧、朝下，液面差不变——同深度各方向压强相等',
          '同一液体中增大深度，液面差变大——深度越深压强越大',
          '同一深度换用盐水，液面差变大——密度越大压强越大'
        ]"
      />
    </aside>
  </div>
</template>
