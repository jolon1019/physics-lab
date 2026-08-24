<script setup>
import { boardFg, boardText } from '../../lib/boardText'

import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

// ===== 三个水杯（冷/温/热水，固定真实温度便于读数练习）=====
const cups = [
  { name: '冷水', temp: 18, color: '#9ccee8', deep: '#6fa8cc', steam: false },
  { name: '温水', temp: 53, color: '#f3cc9f', deep: '#d8a56e', steam: false },
  { name: '热水', temp: 87, color: '#e79a86', deep: '#cf6f58', steam: true }
]
const selected = ref(0)
const readings = reactive([null, null, null])
const results = reactive([null, null, null]) // true / false / null
const submitted = ref(false)
let completed = false
const hint = ref('点击左侧某个水杯，温度计会浸入并升起汞柱，请在右侧读出温度')

// 汞柱实际显示的温度（向所选水杯真实温度平滑过渡）
const mercury = ref(cups[0].temp)

const T_MIN = -20
const T_MAX = 110

function tempToFrac(t) {
  return (t - T_MIN) / (T_MAX - T_MIN)
}

// ===== Canvas =====
const canvasRef = ref(null)
let ctx = null
let raf = null
let lastT = null
const dpr = () => Math.min(window.devicePixelRatio || 1, 2)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

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

// 布局：烧杯整体居中，底坐在桌面线上
function beakerRects(W, H) {
  const n = cups.length
  const baseY = H - 52
  const areaW = W * 0.62
  const bw = Math.min(118, (areaW - (n - 1) * 32) / n)
  const gap = (areaW - bw * n) / (n - 1)
  const bx = (W - (bw * n + gap * (n - 1))) / 2
  const bh = 150
  const top = baseY - bh
  return cups.map((_, i) => ({ x: bx + i * (bw + gap), y: top, w: bw, h: bh, baseY }))
}

// 热水杯的上升蒸汽团
function drawSteam(cx, topY, now) {
  for (let i = 0; i < 4; i++) {
    const ph = i * 1.7
    const cycle = (now * 0.018 + ph * 30) % 72
    const yy = topY - 10 - cycle
    const xx = cx + Math.sin(now * 0.003 + ph) * 8 + (i - 1.5) * 9
    const r = 6 + (i % 3)
    const a = Math.max(0, 0.32 * (1 - cycle / 72))
    ctx.fillStyle = `rgba(238,243,248,${a.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(xx, yy, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawBeaker(L, r, idx, now) {
  const cup = cups[idx]
  const sel = idx === selected.value
  const cx = r.x + r.w / 2
  const baseY = r.baseY
  // 桌面
  ctx.save()
  const tg = ctx.createLinearGradient(0, baseY, 0, L.H)
  tg.addColorStop(0, 'rgba(122,94,64,0.42)')
  tg.addColorStop(1, 'rgba(80,60,40,0.56)')
  ctx.fillStyle = tg
  ctx.fillRect(0, baseY, L.W, L.H - baseY)
  ctx.strokeStyle = 'rgba(58,44,30,0.65)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, baseY)
  ctx.lineTo(L.W, baseY)
  ctx.stroke()
  ctx.restore()
  // 烧杯投影
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.16)'
  ctx.beginPath()
  ctx.ellipse(cx, baseY + 3, r.w * 0.62, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 玻璃杯身（半透明 + 高光）
  const glassGrad = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0)
  glassGrad.addColorStop(0, 'rgba(255,255,255,0.18)')
  glassGrad.addColorStop(0.5, 'rgba(220,235,245,0.07)')
  glassGrad.addColorStop(1, 'rgba(255,255,255,0.24)')
  ctx.fillStyle = glassGrad
  rr(r.x, r.y, r.w, r.h, 12)
  ctx.fill()

  // 水（渐变 + 波动水面）
  const fillFrac = 0.6
  const wy0 = r.y + r.h * (1 - fillFrac)
  const surfY = (x) => wy0 + Math.sin(x * 0.09 + now * 0.004) * 1.3
  ctx.save()
  rr(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10)
  ctx.clip()
  const grad = ctx.createLinearGradient(0, wy0, 0, r.y + r.h)
  grad.addColorStop(0, cup.color)
  grad.addColorStop(1, cup.deep)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(r.x + 3, r.y + r.h - 3)
  ctx.lineTo(r.x + 3, surfY(r.x + 3))
  for (let x = r.x + 3; x <= r.x + r.w - 3; x += 6) ctx.lineTo(x, surfY(x))
  ctx.lineTo(r.x + r.w - 3, r.y + r.h - 3)
  ctx.closePath()
  ctx.fill()
  // 水面亮线
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let x = r.x + 3; x <= r.x + r.w - 3; x += 6) {
    const y = surfY(x)
    x === r.x + 3 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()

  // 杯口
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(r.x, r.y + 5)
  ctx.lineTo(r.x + 7, r.y)
  ctx.lineTo(r.x + r.w - 7, r.y)
  ctx.lineTo(r.x + r.w, r.y + 5)
  ctx.stroke()

  // 杯壁描边（选中发光）
  ctx.save()
  if (sel) {
    ctx.shadowColor = '#3b6fd4'
    ctx.shadowBlur = 14
    ctx.strokeStyle = '#3b6fd4'
    ctx.lineWidth = 3
  } else {
    ctx.strokeStyle = 'rgba(80,80,90,0.55)'
    ctx.lineWidth = 2
  }
  rr(r.x, r.y, r.w, r.h, 12)
  ctx.stroke()
  ctx.restore()

  // 蒸汽（热水）
  if (cup.steam) drawSteam(cx, r.y, now)

  // 名称
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(cup.name, cx, baseY + 8)
  if (sel) {
    // 测量指示
    ctx.fillStyle = '#3b6fd4'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillText('▼ 正在测量', cx, r.y - 24)
  }
}

function drawThermometer(L) {
  // 温度计插入选中的杯子：刻度段在杯口上方，球部浸入水中
  const r = beakerRects(L.W, L.H)[selected.value]
  const cx = r.x + r.w / 2
  const topY = r.y - 150 // 刻度段顶端
  const rimY = r.y - 14 // 刻度段底端（杯口上方）
  const wy0 = r.y + r.h * 0.4 // 水面
  const bulbY = wy0 + 26 // 球部中心（水中，不碰杯底）
  const tubeW = 16
  const tx = cx - tubeW / 2
  const mx = cx
  const frac = tempToFrac(mercury.value)
  const mercuryTopY = rimY - (rimY - topY) * frac

  // 玻璃管（刻度段 → 杯中 → 球部）
  const tubeGrad = ctx.createLinearGradient(tx, 0, tx + tubeW, 0)
  tubeGrad.addColorStop(0, 'rgba(255,255,255,0.95)')
  tubeGrad.addColorStop(0.5, 'rgba(240,246,250,0.85)')
  tubeGrad.addColorStop(1, 'rgba(220,230,238,0.9)')
  ctx.fillStyle = tubeGrad
  rr(tx, topY, tubeW, bulbY - topY + 22, tubeW / 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,90,100,0.6)'
  ctx.lineWidth = 1.5
  rr(tx, topY, tubeW, bulbY - topY + 22, tubeW / 2)
  ctx.stroke()
  // 管身左侧高光
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  rr(tx + 2, topY + 2, 3, bulbY - topY + 14, 1.5)
  ctx.fill()

  // 球部（浸在水中）
  const bulbGrad = ctx.createRadialGradient(mx - 6, bulbY - 6, 2, mx, bulbY, 22)
  bulbGrad.addColorStop(0, 'rgba(255,255,255,0.95)')
  bulbGrad.addColorStop(0.6, 'rgba(240,246,250,0.9)')
  bulbGrad.addColorStop(1, 'rgba(210,222,232,0.9)')
  ctx.fillStyle = bulbGrad
  ctx.beginPath()
  ctx.arc(mx, bulbY, 20, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,90,100,0.6)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // 汞柱（圆头，从刻度段延伸到球部）
  const hg = ctx.createLinearGradient(mx - 5, 0, mx + 5, 0)
  hg.addColorStop(0, '#f26a5a')
  hg.addColorStop(0.5, '#ff8a72')
  hg.addColorStop(1, '#e0483c')
  ctx.fillStyle = hg
  ctx.beginPath()
  ctx.moveTo(mx - 5, mercuryTopY + 5)
  ctx.quadraticCurveTo(mx - 5, mercuryTopY, mx, mercuryTopY)
  ctx.quadraticCurveTo(mx + 5, mercuryTopY, mx + 5, mercuryTopY + 5)
  ctx.lineTo(mx + 5, bulbY + 14)
  ctx.lineTo(mx - 5, bulbY + 14)
  ctx.closePath()
  ctx.fill()
  // 球内汞
  const bulbHg = ctx.createRadialGradient(mx - 4, bulbY - 4, 1, mx, bulbY, 16)
  bulbHg.addColorStop(0, '#ff8a72')
  bulbHg.addColorStop(1, '#e0483c')
  ctx.fillStyle = bulbHg
  ctx.beginPath()
  ctx.arc(mx, bulbY, 15, 0, Math.PI * 2)
  ctx.fill()

  // 刻度尺（每 10℃ 标注，每 2℃ 一短线；全部在杯口上方）
  ctx.strokeStyle = 'rgba(60,60,70,0.65)'
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let t = T_MIN; t <= T_MAX; t += 2) {
    const y = rimY - (rimY - topY) * tempToFrac(t)
    const major = t % 10 === 0
    const x1 = tx - 4
    const x2 = tx - (major ? 15 : 9)
    ctx.lineWidth = major ? 1.6 : 1
    ctx.beginPath()
    ctx.moveTo(x1, y)
    ctx.lineTo(x2, y)
    ctx.stroke()
    if (major) ctx.fillText(String(t), x2 - 4, y)
  }
  // 单位
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText('℃', tx - 20, topY + 12)

  // 大号温度数字屏（杯口上方右侧）
  const dispW = 128
  const dispH = 36
  const dx = cx + tubeW / 2 + 14
  const dy = topY - 8
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 3
  ctx.fillStyle = 'rgba(18,22,32,0.88)'
  rr(dx, dy, dispW, dispH, 9)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 1
  rr(dx, dy, dispW, dispH, 9)
  ctx.stroke()
  ctx.fillStyle = '#ff5a48'
  ctx.font = '700 20px ui-monospace, Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${mercury.value.toFixed(1)} ℃`, dx + dispW / 2, dy + dispH / 2 + 1)

  // 视线标线（与汞柱上表面相平，只显示在杯口上方）
  if (mercuryTopY >= topY) {
    ctx.strokeStyle = '#3b6fd4'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(tx - 20, mercuryTopY)
    ctx.lineTo(tx + tubeW + 34, mercuryTopY)
    ctx.stroke()
    ctx.setLineDash([])
    // 视线小三角
    ctx.fillStyle = '#3b6fd4'
    ctx.beginPath()
    ctx.moveTo(tx + tubeW + 8, mercuryTopY)
    ctx.lineTo(tx + tubeW + 16, mercuryTopY - 5)
    ctx.lineTo(tx + tubeW + 16, mercuryTopY + 5)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#3b6fd4'
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('视线相平', tx + tubeW + 20, mercuryTopY - 2)
  }
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
  ctx.fillText('温度计的读数练习', L.W / 2, 18)
  const rects = beakerRects(L.W, L.H)
  rects.forEach((r, i) => drawBeaker(L, r, i, now))
  drawThermometer(L)
}

function loop(now) {
  if (!lastT) lastT = now
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  // 汞柱平滑过渡到所选水温
  const target = cups[selected.value].temp
  mercury.value += (target - mercury.value) * Math.min(1, dt * 4)
  render(now)
  raf = requestAnimationFrame(loop)
}

function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render(performance.now())
}

function onCanvasClick(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const rects = beakerRects(rect.width, rect.height)
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]
    if (x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 24 && y <= r.y + r.h + 24) {
      selected.value = i
      hint.value = `正在测量${cups[i].name}，请视线与汞柱上表面相平，在右侧读出温度`
      return
    }
  }
}

function submit() {
  submitted.value = true
  let allOk = true
  for (let i = 0; i < cups.length; i++) {
    const r = Number(readings[i])
    const ok = !isNaN(r) && Math.abs(r - cups[i].temp) <= 1
    results[i] = ok
    if (!ok) allOk = false
  }
  if (allOk) {
    hint.value = '全部读数正确！读数时视线与液柱上表面相平、估读到分度值下一位。'
    if (!completed) {
      completed = true
      emit('complete')
    }
  } else {
    hint.value = '有读数偏差，注意：视线相平、估读到分度值下一位，热水的汞柱更高。'
  }
}

function resetAll() {
  submitted.value = false
  for (let i = 0; i < 3; i++) {
    readings[i] = null
    results[i] = null
  }
  hint.value = '点击左侧某个水杯，温度计会浸入并升起汞柱，请在右侧读出温度'
}

const allFilled = computed(() => readings.every((r) => r !== null && r !== ''))

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
          style="display:block;width:100%;height:520px;touch-action:none;border-radius:8px;cursor:pointer"
          @click="onCanvasClick"
        ></canvas>
      </div>

      <div class="lab-actions">
        <button class="btn btn-primary" @click="submit" :disabled="!allFilled">记录并校验读数</button>
        <button class="btn" @click="resetAll">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>读数记录</strong>
          <span>估读到 0.1℃</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat" v-for="(c, i) in cups" :key="i">
            <span>{{ c.name }}（真实约 {{ c.temp }}℃）</span>
            <strong style="display:flex;align-items:center;gap:8px">
              <input
                type="number"
                step="0.1"
                v-model="readings[i]"
                placeholder="读数"
                style="width:74px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;font-size:14px"
              />
              <span v-if="submitted && results[i] === true" style="color:var(--ok)">✓</span>
              <span v-else-if="submitted && results[i] === false" style="color:var(--danger)">✗</span>
              <span v-else style="color:var(--text-dim)">℃</span>
            </strong>
          </div>
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>读数要点</strong>
          <span>不碰底壁</span>
        </div>
        <p style="font-size:14px;line-height:1.7;color:var(--text)">
          玻璃泡要<b>全部浸入</b>液体、<b>不碰容器底和壁</b>；待示数稳定后，<b>视线与液柱上表面相平</b>读数，并估读到分度值（1℃）的下一位。
        </p>
      </div>
    </aside>
  </div>
</template>
