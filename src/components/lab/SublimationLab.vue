<script setup>
import { boardFg, boardText } from '../../lib/boardText'

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

// ===== 可调变量（方法）=====
const method = ref('bath') // 'bath' 热水浴(正确) | 'flame' 酒精灯直火(错误)
const WATER_TEMP = 100 // 热水浴温度 ≈ 100℃
const IODINE_MELT = 113.5 // 碘熔点 ≈ 113.5℃

const isBath = computed(() => method.value === 'bath')

// ===== 状态 =====
const state = ref('ready') // ready | running | done
const tNow = ref(0)
const particles = ref([]) // 蒸气/沉积粒子
let completed = false
const hint = ref('选择加热方式后点击「开始」，观察碘是直接变气体（升华）还是先熔化')
const startBtn = ref('开始')
const warn = ref('')

const conclusion = computed(() => {
  if (state.value !== 'done') return null
  return isBath.value
    ? { title: '升华 + 凝华', ok: true, text: '热水(<113.5℃)使碘直接由固态变气态（升华），冷却后蒸气在冷端直接变固态（凝华）。' }
    : { title: '错误：先熔化', ok: false, text: '直火温度远超碘熔点，碘先熔化成液体，无法证明“固态直接变气态”。应使用热水浴。' }
})

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

// 玻璃管（碘锤）几何
function tubeGeom(L) {
  const cx = L.W * 0.32
  const top = 88
  const bot = L.H - 150
  const w = 56
  return { cx, top, bot, w, x: cx - w / 2 }
}

// 小菱形晶体（碘的固态颗粒）
function drawCrystal(x, y, size, alpha) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.PI / 4)
  ctx.fillStyle = `rgba(107,63,160,${alpha})`
  ctx.fillRect(-size / 2, -size / 2, size, size)
  ctx.restore()
}

// 酒精灯（玻璃瓶身 + 内外焰 + 辉光）
function drawLamp(cx, baseY, now, lit) {
  const lampX = cx - 18
  const lampY = baseY - 42 // 火焰顶恰好够到管底
  // 投影
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.20)'
  ctx.beginPath()
  ctx.ellipse(cx, baseY + 3, 28, 6, 0, 0, Math.PI * 2)
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
  if (lit) {
    const fl = Math.sin(now * 0.012) * 1.6 + Math.sin(now * 0.023) * 1.0
    const fy = lampY - 9
    const glow = ctx.createRadialGradient(cx, fy - 12, 2, cx, fy - 12, 34)
    glow.addColorStop(0, 'rgba(255,184,82,0.55)')
    glow.addColorStop(1, 'rgba(255,184,82,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, fy - 12, 34, 0, Math.PI * 2)
    ctx.fill()
    // 外焰
    ctx.fillStyle = '#ff9a2e'
    ctx.beginPath()
    ctx.moveTo(cx, fy - 31 + fl)
    ctx.quadraticCurveTo(cx + 9, fy - 16, cx, fy)
    ctx.quadraticCurveTo(cx - 9, fy - 16, cx, fy - 31 + fl)
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
}

function drawApparatus(L, now) {
  const g = tubeGeom(L)
  const baseY = L.H - 68
  const running = state.value === 'running' || state.value === 'done'

  // 桌面带
  ctx.save()
  const tg = ctx.createLinearGradient(0, baseY, 0, L.H)
  tg.addColorStop(0, 'rgba(122,94,64,0.42)')
  tg.addColorStop(1, 'rgba(80,60,40,0.56)')
  ctx.fillStyle = tg
  ctx.fillRect(0, baseY, L.W * 0.56, L.H - baseY)
  ctx.strokeStyle = 'rgba(58,44,30,0.65)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, baseY)
  ctx.lineTo(L.W * 0.56, baseY)
  ctx.stroke()
  ctx.restore()

  // ===== 加热源 =====
  if (isBath.value) {
    // 热水浴：玻璃烧杯 + 渐变水 + 波动水面 + 气泡 + 蒸汽
    const bx = g.cx - 74
    const by = baseY - 96
    const bw = 148
    const bh = 96
    const wy0 = g.bot + 12 // 水面（管底浸在水中 12px）
    // 投影
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    ctx.beginPath()
    ctx.ellipse(g.cx, baseY + 3, bw * 0.62, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    // 玻璃杯身
    const glassGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0)
    glassGrad.addColorStop(0, 'rgba(255,255,255,0.18)')
    glassGrad.addColorStop(0.5, 'rgba(220,235,245,0.07)')
    glassGrad.addColorStop(1, 'rgba(255,255,255,0.24)')
    ctx.fillStyle = glassGrad
    rr(bx, by, bw, bh, 10)
    ctx.fill()
    // 水（半透明，便于看到管中碘）
    ctx.save()
    rr(bx + 3, by + 3, bw - 6, bh - 6, 8)
    ctx.clip()
    const surfY = (x) => wy0 + Math.sin(x * 0.09 + now * 0.004) * 1.2
    const wg = ctx.createLinearGradient(0, wy0, 0, by + bh)
    wg.addColorStop(0, 'rgba(150,205,235,0.82)')
    wg.addColorStop(1, 'rgba(90,160,205,0.9)')
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
    // 加热气泡（水中上升）
    if (running) {
      for (let i = 0; i < 7; i++) {
        const ph = i * 2.1
        const cyc = (now * 0.01 + ph) % 1
        const byy = by + bh - 8 - cyc * (by + bh - 8 - wy0)
        const bxx = bx + 16 + i * 17 + Math.sin(now * 0.003 + ph) * 3
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.beginPath()
        ctx.arc(bxx, byy, 2.2 + (i % 3), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
    // 杯壁
    ctx.strokeStyle = 'rgba(90,110,135,0.7)'
    ctx.lineWidth = 2
    rr(bx, by, bw, bh, 10)
    ctx.stroke()
    // 杯口
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(bx, by + 4)
    ctx.lineTo(bx + 7, by)
    ctx.lineTo(bx + bw - 7, by)
    ctx.lineTo(bx + bw, by + 4)
    ctx.stroke()
    // 蒸汽（杯口上）
    if (running) {
      for (let i = 0; i < 4; i++) {
        const ph = i * 1.7
        const cycle = (now * 0.018 + ph * 30) % 66
        const yy = by - 8 - cycle
        const xx = g.cx - 34 + i * 23 + Math.sin(now * 0.003 + ph) * 6
        const a = Math.max(0, 0.30 * (1 - cycle / 66))
        ctx.fillStyle = `rgba(238,243,248,${a.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(xx, yy, 6 + (i % 3), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // 标签
    ctx.fillStyle = boardText(ctx.canvas)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`热水浴 ≈ ${WATER_TEMP}℃`, g.cx, baseY + 8)
  } else {
    // 酒精灯直火
    drawLamp(g.cx, baseY, now, running)
    ctx.fillStyle = boardText(ctx.canvas)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('酒精灯直火', g.cx, baseY + 6)
  }

  // ===== 碘锤（密封玻璃管）=====
  // 管身玻璃
  const tubeGrad = ctx.createLinearGradient(g.x, 0, g.x + g.w, 0)
  tubeGrad.addColorStop(0, 'rgba(255,255,255,0.85)')
  tubeGrad.addColorStop(0.5, 'rgba(240,246,250,0.55)')
  tubeGrad.addColorStop(1, 'rgba(220,230,238,0.8)')
  ctx.fillStyle = tubeGrad
  rr(g.x, g.top, g.w, g.bot - g.top, 12)
  ctx.fill()
  ctx.strokeStyle = 'rgba(80,90,110,0.75)'
  ctx.lineWidth = 2.5
  rr(g.x, g.top, g.w, g.bot - g.top, 12)
  ctx.stroke()
  // 管身左侧高光
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  rr(g.x + 4, g.top + 4, 4, g.bot - g.top - 8, 2)
  ctx.fill()

  // 顶部密封塞
  ctx.fillStyle = '#8a5a2b'
  rr(g.x - 4, g.top - 10, g.w + 8, 14, 5)
  ctx.fill()
  ctx.strokeStyle = 'rgba(60,40,20,0.6)'
  ctx.lineWidth = 1.5
  rr(g.x - 4, g.top - 10, g.w + 8, 14, 5)
  ctx.stroke()
  // 塞子条纹
  ctx.strokeStyle = 'rgba(60,40,20,0.35)'
  ctx.lineWidth = 1
  for (let sx = g.x - 2; sx <= g.x + g.w + 2; sx += 8) {
    ctx.beginPath()
    ctx.moveTo(sx, g.top - 8)
    ctx.lineTo(sx, g.top + 2)
    ctx.stroke()
  }

  // 管底固态碘（晶体簇，随实验消耗）
  const solidFrac = isBath.value
    ? clamp(1 - tNow.value / 8, 0.15, 1)
    : clamp(1 - tNow.value / 6, 0.2, 1)
  const solidH = 26 * solidFrac
  ctx.fillStyle = '#6b3fa0'
  rr(g.x + 8, g.bot - solidH - 4, g.w - 16, solidH, 4)
  ctx.fill()
  // 晶体颗粒（底部固态碘）
  const nC = Math.max(3, Math.round(7 * solidFrac))
  for (let i = 0; i < nC; i++) {
    const px = g.x + 14 + rand(0, g.w - 28)
    const py = g.bot - 6 - rand(0, solidH - 4)
    drawCrystal(px, py, rand(3, 5), 0.55)
  }

  // 直火时：底部出现液态碘（紫红，已熔化）
  if (!isBath.value && running) {
    const liqH = 16 * clamp(tNow.value / 6, 0, 1)
    ctx.fillStyle = 'rgba(150,60,160,0.85)'
    rr(g.x + 10, g.bot - liqH - 2, g.w - 20, liqH, 6)
    ctx.fill()
    // 液面高光
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(g.x + 14, g.bot - liqH - 2)
    ctx.lineTo(g.x + g.w - 14, g.bot - liqH - 2)
    ctx.stroke()
  }

  // 顶部沉积的固态碘（凝华）
  if (isBath.value && state.value === 'done') {
    ctx.fillStyle = 'rgba(107,63,160,0.92)'
    rr(g.x + 8, g.top + 6, g.w - 16, 16, 4)
    ctx.fill()
    for (let i = 0; i < 6; i++) {
      drawCrystal(g.x + 14 + i * ((g.w - 28) / 5), g.top + 12 + rand(-2, 2), rand(3, 5), 0.6)
    }
  }

  // 紫色碘蒸气粒子
  for (const p of particles.value) {
    if (p.settled) {
      drawCrystal(p.x, p.y, p.r * 1.6, 0.65)
    } else {
      const wob = Math.sin(now * 0.005 + (p.phase || 0)) * 1.5
      const px = p.x + wob
      const g2 = ctx.createRadialGradient(px - 1.5, p.y - 1.5, 0.5, px, p.y, p.r)
      g2.addColorStop(0, 'rgba(200,150,240,0.95)')
      g2.addColorStop(1, 'rgba(120,60,170,0.2)')
      ctx.fillStyle = g2
      ctx.beginPath()
      ctx.arc(px, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 标签
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('密封玻璃管（碘锤）', g.cx, g.top - 26)
}

function drawCompare(L) {
  // 右下角：水浴温度 vs 碘熔点 对比条
  const x = L.W * 0.6
  const y = L.H - 150
  const w = L.W * 0.34
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.22)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 4
  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  rr(x, y, w, 118, 12)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = 'rgba(90,100,120,0.3)'
  ctx.lineWidth = 1
  rr(x, y, w, 118, 12)
  ctx.stroke()

  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('温度判据', x + 12, y + 10)
  // 色块标签
  const rowY = (label, temp, color, yy) => {
    ctx.fillStyle = color
    ctx.fillRect(x + 12, yy + 2, 10, 10)
    ctx.fillStyle = boardText(ctx.canvas)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillText(`${label} ≈ ${temp}℃`, x + 28, yy)
  }
  rowY('水浴温度', WATER_TEMP, '#4a90d9', y + 38)
  rowY('碘熔点', IODINE_MELT, '#6b3fa0', y + 60)
  // 温度对比条
  const barX = x + 12
  const barY = y + 88
  const barW = w - 24
  const t0 = 0
  const tMax = 130
  const pWater = ((WATER_TEMP - t0) / (tMax - t0)) * barW
  const pMelt = ((IODINE_MELT - t0) / (tMax - t0)) * barW
  ctx.fillStyle = 'rgba(120,120,130,0.25)'
  rr(barX, barY, barW, 8, 4)
  ctx.fill()
  ctx.fillStyle = '#4a90d9'
  rr(barX, barY, pWater, 8, 4)
  ctx.fill()
  ctx.fillStyle = '#6b3fa0'
  rr(barX, barY, pMelt, 8, 4)
  ctx.fill()
  // 熔点在线上端加竖线
  ctx.strokeStyle = '#6b3fa0'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(barX + pMelt, barY - 4)
  ctx.lineTo(barX + pMelt, barY + 12)
  ctx.stroke()
  const ok = WATER_TEMP < IODINE_MELT
  ctx.fillStyle = ok ? '#2faf6b' : '#e0584f'
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(ok ? '100℃ < 113.5℃ → 升华' : '100℃ > 113.5℃ → 熔化', barX + barW / 2, barY + 14)
}

function render(now) {
  if (!ctx) return
  const L = dims()
  paintBoard(ctx, L.W, L.H, 'chalk')
  // 标题
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 15px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('观察碘的升华和凝华', L.W / 2, 18)
  drawApparatus(L, now)
  drawCompare(L)
}

// ===== 控制 =====
function startRun() {
  if (state.value === 'running') return
  state.value = 'running'
  tNow.value = 0
  particles.value = []
  completed = false
  startBtn.value = '重新开始'
  warn.value = ''
  lastT = performance.now()
  hint.value = isBath.value
    ? '加热中…观察紫色碘蒸气上升（固态直接变气态）'
    : '加热中…注意碘是否先熔化（变成液体）'
}

function stopRun() {
  state.value = 'done'
  if (!completed) {
    completed = true
    if (isBath.value) {
      hint.value = '完成！碘在低于熔点时被加热，直接升华成紫色蒸气，冷却后凝华成固态碘。'
      emit('complete')
    } else {
      hint.value = '完成，但方式错误：直火使碘先熔化，无法证明升华。请改用热水浴。'
    }
  } else {
    hint.value = '再次实验结束，可切换加热方式对比。'
  }
}

function resetAll() {
  state.value = 'ready'
  tNow.value = 0
  particles.value = []
  completed = false
  startBtn.value = '开始'
  warn.value = ''
  hint.value = '选择加热方式后点击「开始」，观察碘是直接变气体（升华）还是先熔化'
}

function loop(now) {
  if (!lastT) lastT = now
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  const g = tubeGeom(dims())
  if (state.value === 'running' || state.value === 'done') {
    tNow.value += dt * 1.4
    // 产生蒸气
    if (state.value === 'running' && isBath.value && tNow.value < 8) {
      if (Math.random() < 0.4) {
        particles.value.push({
          x: g.cx + rand(-14, 14),
          y: g.bot - 30,
          vy: rand(30, 55),
          r: rand(3, 4.5),
          settled: false,
          phase: rand(0, 6),
          targetY: rand(g.top + 10, g.top + 44)
        })
      }
    }
    // 更新粒子
    for (const p of particles.value) {
      if (!p.settled) {
        p.y -= p.vy * dt
        if (p.y <= p.targetY) {
          p.y = p.targetY
          p.settled = true
        }
      }
    }
    if (tNow.value >= 9) stopRun()
  }
  render(now)
  raf = requestAnimationFrame(loop)
}

function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render(performance.now())
}

watch(method, () => {
  if (state.value !== 'running') resetAll()
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
          style="display:block;width:100%;height:520px;touch-action:none;border-radius:8px"
        ></canvas>
      </div>

      <div class="lab-actions">
        <div style="display:flex;gap:8px">
          <button class="btn" :class="{ 'btn-primary': isBath }" @click="method = 'bath'">热水浴（正确）</button>
          <button class="btn" :class="{ 'btn-primary': !isBath }" @click="method = 'flame'">酒精灯直火</button>
        </div>
        <button v-if="state !== 'running'" class="btn btn-primary" @click="startRun">{{ startBtn }}</button>
        <button class="btn" @click="resetAll">重置</button>
        <span class="feedback" :class="completed && isBath ? 'ok' : 'no'">{{ hint }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>关键判据</strong>
          <span>碘熔点 113.5℃</span>
        </div>
        <p style="font-size:14px;line-height:1.7;color:var(--text)">
          热水浴温度约 <b>100℃</b>，<b>低于</b>碘熔点 113.5℃，碘<b>不熔化</b>而直接升华成紫色蒸气；若用酒精灯直火（远超熔点），碘会先<b>熔化</b>，无法证明升华。
        </p>
      </div>

      <div class="lab-panel" v-if="conclusion">
        <div class="lab-panel-head">
          <strong>实验结论</strong>
        </div>
        <p style="font-size:14px;line-height:1.7" :style="{ color: conclusion.ok ? 'var(--ok)' : 'var(--danger)' }">
          <b>{{ conclusion.title }}</b>：{{ conclusion.text }}
        </p>
      </div>

      <FormulaPanel
        title="公式与概念"
        formula="升华：固→气（吸热）"
        desc="升华是固态直接变成气态（吸热），凝华是气态直接变成固态（放热）。碘在低于熔点的热水中直接升华，冷却后在冷端凝华成固态碘。"
        :rows="[
          { label: '水浴温度', value: WATER_TEMP + ' ℃' },
          { label: '碘熔点', value: IODINE_MELT + ' ℃' },
          { label: '现象', value: isBath ? '固态→气态（升华）' : '固态→液态（熔化）' }
        ]"
        :result="conclusion ? [{ label: '结论', value: conclusion.title }] : []"
        :verify="[
          '热水浴使碘升华而不熔化，证明“固态直接变气态”',
          '移开热源冷却，蒸气在冷端凝华成固态碘',
          '不可用酒精灯直火：温度超熔点会先熔化，不能证明升华'
        ]"
      />
    </aside>
  </div>
</template>
