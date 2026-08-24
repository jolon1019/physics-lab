<script setup>
import { boardFg, boardText } from '../../lib/boardText'

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

// ===== 可调变量 =====
const altitude = ref(0) // 海拔 0~3000 m
const heatRate = ref(50) // 加热功率

// 沸点随海拔（气压）变化：海拔越高、气压越低、沸点越低
const boilingPoint = computed(() => 100 - altitude.value / 285)
const T_START = 20
const Tmin = 20
const Tmax = 104
const SLOWMO = 1.5

// ===== 状态 =====
const state = ref('ready') // ready | heating | boiling | done
const tNow = ref(0)
const temp = ref(T_START)
const points = ref([])
let completed = false
const hint = ref('点击「开始加热」，观察水沸腾前后气泡与温度的变化')
const startBtn = ref('开始加热')

const bubbles = ref([])
const steam = ref([])
const rings = ref([])

const isBoiling = computed(() => state.value === 'boiling' || state.value === 'done')

// ===== 公式面板 =====
const formulaRows = computed(() => [
  { label: '海拔高度', value: `${altitude.value} m` },
  { label: '当前沸点', value: `${boilingPoint.value.toFixed(1)} ℃` },
  { label: '当前温度', value: `${temp.value.toFixed(1)} ℃` }
])
const formulaResults = computed(() => {
  if (!isBoiling.value) return []
  return [
    { label: '是否沸腾', value: '是' },
    { label: '沸点', value: `${boilingPoint.value.toFixed(1)} ℃` },
    { label: '沸腾时温度变化', value: '保持不变' }
  ]
})
const verifySteps = computed(() => [
  '沸腾前：气泡自下而上变小（遇冷收缩）',
  '沸腾时：气泡变大并上升到水面破裂，剧烈汽化',
  '沸腾时持续吸热，但温度保持在沸点不变',
  '沸点随气压变化：海拔越高、气压越低、沸点越低'
])

// ===== Canvas =====
const canvasRef = ref(null)
let ctx = null
let raf = null
let lastT = null
const dpr = () => Math.min(window.devicePixelRatio || 1, 2)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const rand = (a, b) => a + Math.random() * (b - a)

function setupCanvas() {
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.round(rect.width * dpr())
  canvas.height = Math.round(rect.height * dpr())
  ctx = canvas.getContext('2d')
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0)
}
function dims() {
  const canvas = canvasRef.value
  return { W: canvas.width / dpr(), H: canvas.height / dpr() }
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

/* 装置 + 粒子：cx 烧杯中心、baseY 桌面线 */
function drawSetup(L, now) {
  const cx = L.W * 0.27
  const baseY = L.H - 72

  // 桌面（装置在左半区）
  ctx.save()
  const tg = ctx.createLinearGradient(0, baseY, 0, L.H)
  tg.addColorStop(0, 'rgba(120,92,62,0.40)')
  tg.addColorStop(1, 'rgba(78,58,38,0.55)')
  ctx.fillStyle = tg
  ctx.fillRect(0, baseY, L.W * 0.5, L.H - baseY)
  ctx.strokeStyle = 'rgba(56,42,28,0.65)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, baseY)
  ctx.lineTo(L.W * 0.5, baseY)
  ctx.stroke()
  ctx.restore()

  // 酒精灯（玻璃瓶身 + 烛芯 + 跳动火焰 + 辉光）——瓶身坐在桌面上，不被桌面带覆盖
  const lampX = cx - 18
  const lampY = baseY - 30
  // 投影
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.20)'
  ctx.beginPath()
  ctx.ellipse(cx, baseY + 3, 30, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 玻璃瓶身
  const bodyGrad = ctx.createLinearGradient(lampX, 0, lampX + 36, 0)
  bodyGrad.addColorStop(0, 'rgba(196,116,58,0.55)')
  bodyGrad.addColorStop(0.5, 'rgba(232,172,112,0.82)')
  bodyGrad.addColorStop(1, 'rgba(168,88,44,0.55)')
  ctx.fillStyle = bodyGrad
  rr(lampX, lampY, 36, 30, 7)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,70,35,0.5)'
  ctx.lineWidth = 1
  rr(lampX, lampY, 36, 30, 7)
  ctx.stroke()
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  rr(lampX + 5, lampY + 4, 6, 22, 3)
  ctx.fill()
  // 烛芯
  ctx.strokeStyle = '#2a2a2a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, lampY)
  ctx.lineTo(cx, lampY - 9)
  ctx.stroke()
  // 火焰
  if (state.value === 'heating' || isBoiling.value) {
    const fl = Math.sin(now * 0.012) * 1.6 + Math.sin(now * 0.023) * 1.0
    const fy = lampY - 9
    const glow = ctx.createRadialGradient(cx, fy - 12, 2, cx, fy - 12, 36)
    glow.addColorStop(0, 'rgba(255,184,82,0.55)')
    glow.addColorStop(1, 'rgba(255,184,82,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, fy - 12, 36, 0, Math.PI * 2)
    ctx.fill()
    // 外焰（加高，够到石棉网）
    ctx.fillStyle = '#ff9a2e'
    ctx.beginPath()
    ctx.moveTo(cx, fy - 36 + fl)
    ctx.quadraticCurveTo(cx + 9, fy - 16, cx, fy)
    ctx.quadraticCurveTo(cx - 9, fy - 16, cx, fy - 36 + fl)
    ctx.fill()
    // 内焰
    ctx.fillStyle = '#ffe27a'
    ctx.beginPath()
    ctx.moveTo(cx, fy - 19 + fl * 0.6)
    ctx.quadraticCurveTo(cx + 4, fy - 10, cx, fy - 2)
    ctx.quadraticCurveTo(cx - 4, fy - 10, cx, fy - 19 + fl * 0.6)
    ctx.fill()
    // 焰底蓝
    ctx.fillStyle = 'rgba(120,160,255,0.7)'
    ctx.beginPath()
    ctx.ellipse(cx, fy - 2, 4, 5, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // 石棉网
  const netY = lampY - 46
  ctx.fillStyle = 'rgba(92,92,98,0.92)'
  ctx.fillRect(cx - 40, netY, 80, 5)
  ctx.strokeStyle = 'rgba(165,165,170,0.5)'
  ctx.lineWidth = 1
  for (let i = -36; i <= 36; i += 8) {
    ctx.beginPath()
    ctx.moveTo(cx + i, netY)
    ctx.lineTo(cx + i, netY + 5)
    ctx.stroke()
  }

  // 烧杯（玻璃高光 + 刻度 + 水 + 气泡 + 蒸汽）
  const bh = 86
  const by = netY - bh
  const bw = 112
  const bx = cx - bw / 2
  // 投影
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.13)'
  ctx.beginPath()
  ctx.ellipse(cx, baseY + 2, bw * 0.62, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 波动水面几何
  const wf = 0.62
  const waterH = bh * wf
  const wy0 = by + bh - waterH
  const amp = isBoiling.value ? 3 : 1.2
  const surfY = (x) => wy0 + Math.sin(x * 0.06 + now * 0.005) * amp

  // 水（裁剪在烧杯内）
  ctx.save()
  rr(bx + 3, by + 3, bw - 6, bh - 6, 7)
  ctx.clip()
  const wg = ctx.createLinearGradient(0, wy0, 0, by + bh)
  wg.addColorStop(0, '#cdeaf6')
  wg.addColorStop(1, '#7fb8d8')
  ctx.fillStyle = wg
  ctx.beginPath()
  ctx.moveTo(bx + 3, by + bh - 3)
  ctx.lineTo(bx + 3, surfY(bx + 3))
  for (let x = bx + 3; x <= bx + bw - 3; x += 6) ctx.lineTo(x, surfY(x))
  ctx.lineTo(bx + bw - 3, by + bh - 3)
  ctx.closePath()
  ctx.fill()
  // 水面亮线
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let x = bx + 3; x <= bx + bw - 3; x += 6) {
    const y = surfY(x)
    x === bx + 3 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.stroke()
  // 气泡
  for (const b of bubbles.value) {
    const bxp = b.x + Math.sin(now * 0.005 + b.phase) * 1.6
    const g = ctx.createRadialGradient(bxp - b.r * 0.3, b.y - b.r * 0.3, 0.5, bxp, b.y, b.r)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(1, 'rgba(200,230,245,0.5)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(bxp, b.y, b.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // 玻璃杯身（半透明 + 竖向高光）
  const glassGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0)
  glassGrad.addColorStop(0, 'rgba(255,255,255,0.16)')
  glassGrad.addColorStop(0.5, 'rgba(210,230,240,0.08)')
  glassGrad.addColorStop(1, 'rgba(255,255,255,0.22)')
  ctx.fillStyle = glassGrad
  rr(bx, by, bw, bh, 9)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,110,135,0.7)'
  ctx.lineWidth = 2
  rr(bx, by, bw, bh, 9)
  ctx.stroke()
  // 杯口
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(bx, by + 4)
  ctx.lineTo(bx + 8, by)
  ctx.lineTo(bx + bw - 8, by)
  ctx.lineTo(bx + bw, by + 4)
  ctx.stroke()
  // 刻度
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1
  for (let i = 1; i <= 4; i++) {
    const gy = by + bh - (bh - 10) * (i / 5)
    ctx.beginPath()
    ctx.moveTo(bx + 4, gy)
    ctx.lineTo(bx + 13, gy)
    ctx.stroke()
  }

  // 水面破裂涟漪
  for (const r of rings.value) {
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * r.life})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(r.x, r.y, r.r, r.r * 0.4, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  // 蒸汽
  for (const s of steam.value) {
    ctx.fillStyle = `rgba(240,245,250,${s.alpha})`
    ctx.beginPath()
    ctx.arc(s.x + Math.sin(now * 0.003 + s.phase) * 7, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }

  // 温度计
  const tgx = bx + bw - 16
  const top = by - 48
  const bot = by + bh - 16
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  rr(tgx - 3, top, 6, bot - top, 3)
  ctx.fill()
  ctx.strokeStyle = 'rgba(70,82,102,0.7)'
  ctx.lineWidth = 1.5
  rr(tgx - 3, top, 6, bot - top, 3)
  ctx.stroke()
  // 刻度
  ctx.strokeStyle = 'rgba(70,82,102,0.6)'
  ctx.lineWidth = 1
  for (let T = 20; T <= 100; T += 20) {
    const ty = bot - (bot - top) * ((T - Tmin) / (Tmax - Tmin))
    ctx.beginPath()
    ctx.moveTo(tgx + 3, ty)
    ctx.lineTo(tgx + 7, ty)
    ctx.stroke()
  }
  // 红色液柱
  const f = clamp((temp.value - Tmin) / (Tmax - Tmin), 0, 1)
  const lvl = bot - (bot - top) * f
  ctx.fillStyle = '#e0584f'
  rr(tgx - 1.4, lvl, 2.8, bot - lvl + 6, 1.4)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(tgx, bot + 5, 4.6, 0, Math.PI * 2)
  ctx.fill()
  // 温度读数
  ctx.fillStyle = '#e0584f'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`${temp.value.toFixed(0)}℃`, tgx + 9, top + 4)

  // 标签
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(`水 · 沸点 ${boilingPoint.value.toFixed(0)}℃`, cx, baseY + 14)

  // ===== 粒子更新 =====
  if (state.value === 'heating' || isBoiling.value) {
    for (const b of bubbles.value) {
      b.y -= b.vy * 0.016
      if (isBoiling.value) b.r = Math.min(b.r + 0.05, 9)
      else b.r = Math.max(0.8, b.r - 0.03)
    }
    bubbles.value = bubbles.value.filter((b) => {
      if (b.y <= wy0 + 3) {
        rings.value.push({ x: b.x, y: wy0, r: 2, life: 1 })
        if (isBoiling.value)
          steam.value.push({ x: b.x, y: wy0 - 4, r: rand(3, 6), vy: rand(16, 26), phase: rand(0, 6), alpha: 0.5 })
        return false
      }
      return true
    })
    const rate = isBoiling.value ? 0.7 : 0.28
    if (Math.random() < rate) {
      bubbles.value.push({
        x: cx + rand(-34, 34),
        y: by + bh - 8,
        r: isBoiling.value ? rand(3, 6) : rand(1.5, 3),
        vy: isBoiling.value ? rand(45, 75) : rand(22, 38),
        phase: rand(0, 6)
      })
    }
    if (bubbles.value.length > 160) bubbles.value.splice(0, bubbles.value.length - 160)
  }
  for (const s of steam.value) {
    s.y -= s.vy * 0.016
    s.r += 0.15
    s.alpha -= 0.006
  }
  steam.value = steam.value.filter((s) => s.alpha > 0 && s.y > by - 60)
  if (steam.value.length > 40) steam.value.splice(0, steam.value.length - 40)
  for (const r of rings.value) {
    r.r += 0.6
    r.life -= 0.05
  }
  rings.value = rings.value.filter((r) => r.life > 0)
}

function drawGraph(L, now) {
  const gx = L.W * 0.52
  const gy = 70
  const gw = L.W * 0.42
  const gh = L.H - 160
  // 卡片阴影
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.25)'
  ctx.shadowBlur = 16
  ctx.shadowOffsetY = 6
  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  rr(gx, gy, gw, gh, 10)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = 'rgba(90,100,120,0.35)'
  ctx.lineWidth = 1.5
  rr(gx, gy, gw, gh, 10)
  ctx.stroke()

  const padL = 40
  const padB = 30
  const px0 = gx + padL
  const py0 = gy + gh - padB
  const px1 = gx + gw - 12
  const py1 = gy + 14
  const DUR = 13
  const X = (t) => px0 + (t / DUR) * (px1 - px0)
  const Y = (T) => py0 - ((T - Tmin) / (Tmax - Tmin)) * (py0 - py1)

  // 网格
  ctx.strokeStyle = 'rgba(120,120,135,0.12)'
  ctx.lineWidth = 1
  for (let T = Tmin; T <= Tmax; T += 20) {
    ctx.beginPath()
    ctx.moveTo(px0, Y(T))
    ctx.lineTo(px1, Y(T))
    ctx.stroke()
  }
  for (let t = 2; t <= DUR; t += 2) {
    ctx.beginPath()
    ctx.moveTo(X(t), py0)
    ctx.lineTo(X(t), py1)
    ctx.stroke()
  }
  // 坐标轴
  ctx.strokeStyle = 'rgba(70,70,82,0.85)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(px0, py1)
  ctx.lineTo(px0, py0)
  ctx.lineTo(px1, py0)
  ctx.stroke()
  // 箭头
  ctx.fillStyle = 'rgba(70,70,82,0.85)'
  ctx.beginPath()
  ctx.moveTo(px0, py1)
  ctx.lineTo(px0 - 4, py1 + 7)
  ctx.lineTo(px0 + 4, py1 + 7)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(px1, py0)
  ctx.lineTo(px1 - 7, py0 - 4)
  ctx.lineTo(px1 - 7, py0 + 4)
  ctx.closePath()
  ctx.fill()

  // 刻度文字
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let t = 0; t <= DUR; t += 2) ctx.fillText(String(t), X(t), py0 + 6)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let T = Tmin; T <= Tmax; T += 20) ctx.fillText(String(T), px0 - 6, Y(T))
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('时间 t / s', (px0 + px1) / 2, py0 + 14)
  ctx.save()
  ctx.translate(gx + 13, (py0 + py1) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('温度 T / ℃', 0, 0)
  ctx.restore()

  // 沸点参考线
  ctx.strokeStyle = 'rgba(224,88,79,0.55)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.moveTo(px0, Y(boilingPoint.value))
  ctx.lineTo(px1, Y(boilingPoint.value))
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#e0584f'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`沸点 ${boilingPoint.value.toFixed(0)}℃`, px0 + 4, Y(boilingPoint.value) - 2)

  // 曲线 + 渐变填充 + 辉光端点
  if (points.value.length > 1) {
    const last = points.value[points.value.length - 1]
    ctx.beginPath()
    points.value.forEach((p, i) => {
      const xx = X(p.t)
      const yy = Y(p.T)
      i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy)
    })
    ctx.lineTo(X(last.t), py0)
    ctx.lineTo(X(points.value[0].t), py0)
    ctx.closePath()
    const fg = ctx.createLinearGradient(0, py1, 0, py0)
    fg.addColorStop(0, 'rgba(224,88,79,0.30)')
    fg.addColorStop(1, 'rgba(224,88,79,0.02)')
    ctx.fillStyle = fg
    ctx.fill()

    ctx.strokeStyle = '#e0584f'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    points.value.forEach((p, i) => {
      const xx = X(p.t)
      const yy = Y(p.T)
      i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy)
    })
    ctx.stroke()

    ctx.save()
    ctx.shadowColor = '#e0584f'
    ctx.shadowBlur = 10
    ctx.fillStyle = '#e0584f'
    ctx.beginPath()
    ctx.arc(X(last.t), Y(last.T), 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('水沸腾 T–t 图像', gx + 12, gy + 10)
}

function render(now) {
  if (!ctx) return
  const L = dims()
  paintBoard(ctx, L.W, L.H, 'chalk')
  drawSetup(L, now)
  drawGraph(L, now)
}

// ===== 控制 =====
function startRun() {
  if (state.value === 'heating' || state.value === 'boiling') return
  state.value = 'heating'
  tNow.value = 0
  temp.value = T_START
  points.value = []
  bubbles.value = []
  steam.value = []
  rings.value = []
  completed = false
  startBtn.value = '重新加热'
  lastT = performance.now()
  hint.value = '加热中…注意观察沸腾前、沸腾时气泡的不同'
}

function stopRun() {
  state.value = 'done'
  if (!completed) {
    completed = true
    hint.value = `完成！水达到沸点 ${boilingPoint.value.toFixed(0)}℃ 后持续沸腾，温度保持${boilingPoint.value.toFixed(0)}℃不变。`
    emit('complete')
  } else {
    hint.value = '再次实验结束。改变海拔可看到沸点变化。'
  }
}

function resetAll() {
  state.value = 'ready'
  tNow.value = 0
  temp.value = T_START
  points.value = []
  bubbles.value = []
  steam.value = []
  rings.value = []
  completed = false
  startBtn.value = '开始加热'
  hint.value = '点击「开始加热」，观察水沸腾前后气泡与温度的变化'
}

function loop(now) {
  if (!lastT) lastT = now
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  if (state.value === 'heating' || isBoiling.value) {
    if (state.value !== 'done') {
      tNow.value += dt * SLOWMO
      const Tb = boilingPoint.value
      // 加热功率越高，到达沸点越快
      const heatTime = 4 + ((100 - heatRate.value) / 100) * 9
      const f = Math.min(tNow.value / heatTime, 1)
      if (f < 1) {
        temp.value = T_START + (Tb - T_START) * f
        state.value = 'heating'
      } else {
        temp.value = Tb
        if (state.value !== 'boiling') {
          state.value = 'boiling'
          hint.value = '沸腾了！气泡变大上升到水面破裂，温度保持在沸点。'
        }
      }
      points.value.push({ t: Math.min(tNow.value, 13), T: temp.value })
      if (tNow.value >= 13) stopRun()
    }
  }
  render(now)
  raf = requestAnimationFrame(loop)
}

function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render(performance.now())
}

watch(altitude, () => {
  if (state.value === 'ready' || state.value === 'done') temp.value = T_START
})

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
      <div class="lab-panel" style="padding:0">
        <canvas
          ref="canvasRef"
          style="display:block;width:100%;height:520px;background:transparent;touch-action:none;border-radius:8px"
        ></canvas>
      </div>

      <div class="lab-actions">
        <button v-if="state === 'ready' || state === 'done'" class="btn btn-primary" @click="startRun">{{ startBtn }}</button>
        <button v-else class="btn btn-primary" disabled>加热中…</button>
        <button class="btn" @click="resetAll">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>可调变量</strong>
          <span>海拔影响沸点</span>
        </div>
        <div class="lab-params">
          <ParamSlider v-model="altitude" :min="0" :max="3000" :step="100" label="海拔高度" unit=" m" hint="海拔越高、气压越低，沸点越低" />
          <ParamSlider v-model="heatRate" :min="20" :max="100" :step="5" label="加热功率" unit="%" hint="功率越大，升温越快、越早沸腾" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实时数据</strong>
          <span>自动记录</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat accent">
            <span>当前沸点</span>
            <strong>{{ boilingPoint.toFixed(1) }} ℃</strong>
          </div>
          <div class="lab-stat" :class="{ success: isBoiling }">
            <span>当前温度</span>
            <strong>{{ temp.toFixed(1) }} ℃</strong>
          </div>
          <div class="lab-stat" v-if="isBoiling">
            <span>状态</span>
            <strong>沸腾中</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="公式与结论"
        formula="沸腾：持续吸热，温度不变"
        desc="沸腾是液体内部和表面同时发生的剧烈汽化。沸腾时持续吸热但温度不变；沸点随气压变化（高海拔、低气压、沸点低）。条件：达到沸点+持续吸热。"
        :rows="formulaRows"
        :result="formulaResults"
        :verify="verifySteps"
      />
    </aside>
  </div>
</template>
