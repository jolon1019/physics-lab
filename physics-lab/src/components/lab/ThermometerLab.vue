<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

const emit = defineEmits(['complete'])

// ===== 三个水杯（冷/温/热水，固定真实温度便于读数练习）=====
const cups = [
  { name: '冷水', temp: 18, color: '#a9d4e8', steam: false },
  { name: '温水', temp: 53, color: '#f1caa0', steam: false },
  { name: '热水', temp: 87, color: '#e79a86', steam: true }
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

function beakerRects(W, H) {
  const n = cups.length
  const areaW = W * 0.6
  const bx = W * 0.06
  const bw = Math.min(110, (areaW - (n - 1) * 30) / n)
  const gap = (areaW - bx - bw * n) / (n - 1)
  const top = H - 200
  const bh = 140
  return cups.map((_, i) => ({ x: bx + i * (bw + gap), y: top, w: bw, h: bh }))
}

function drawBeaker(L, r, idx) {
  const cup = cups[idx]
  const sel = idx === selected.value
  // 烧杯玻璃
  ctx.fillStyle = sel ? 'rgba(90,140,200,0.10)' : 'rgba(120,120,130,0.08)'
  rr(r.x, r.y, r.w, r.h, 10)
  ctx.fill()
  // 水
  const fillFrac = 0.62
  const wy = r.y + r.h * (1 - fillFrac)
  ctx.save()
  rr(r.x + 3, wy, r.w - 6, r.y + r.h - wy - 3, 8)
  ctx.clip()
  const grad = ctx.createLinearGradient(0, wy, 0, r.y + r.h)
  grad.addColorStop(0, cup.color)
  grad.addColorStop(1, cup.color)
  ctx.fillStyle = cup.color
  ctx.fillRect(r.x, wy, r.w, r.h)
  ctx.restore()
  // 杯壁
  ctx.strokeStyle = sel ? '#3b6fd4' : 'rgba(80,80,90,0.5)'
  ctx.lineWidth = sel ? 3 : 2
  rr(r.x, r.y, r.w, r.h, 10)
  ctx.stroke()
  // 热气（热水）
  if (cup.steam) {
    ctx.strokeStyle = 'rgba(180,180,190,0.5)'
    ctx.lineWidth = 2
    for (let k = 0; k < 3; k++) {
      const sx = r.x + r.w * (0.3 + k * 0.2)
      ctx.beginPath()
      for (let s = 0; s <= 18; s++) {
        const yy = r.y - 6 - s * 2.2
        const xx = sx + Math.sin(s * 0.6 + performance.now() / 400 + k) * 4
        if (s === 0) ctx.moveTo(xx, yy)
        else ctx.lineTo(xx, yy)
      }
      ctx.stroke()
    }
  }
  // 名称
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(cup.name, r.x + r.w / 2, r.y + r.h + 8)
  if (sel) {
    ctx.fillStyle = '#3b6fd4'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillText('▼ 正在测量', r.x + r.w / 2, r.y - 18)
  }
}

function drawThermometer(L) {
  const tx = L.W - 78
  const topY = 70
  const bulbY = L.H - 130
  const tubeTop = topY
  const tubeBot = bulbY - 18
  const tubeW = 16
  const frac = tempToFrac(mercury.value)
  const mercuryTopY = tubeBot - (tubeBot - tubeTop) * frac

  // 选中杯到温度计的虚线引导
  const br = beakerRects(L.W, L.H)[selected.value]
  ctx.strokeStyle = 'rgba(59,111,212,0.4)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([6, 5])
  ctx.beginPath()
  ctx.moveTo(br.x + br.w / 2, br.y + 6)
  ctx.lineTo(tx + tubeW / 2, bulbY - 30)
  ctx.stroke()
  ctx.setLineDash([])

  // 玻璃管
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  rr(tx, tubeTop, tubeW, tubeBot - tubeTop + 40, tubeW / 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,90,100,0.7)'
  ctx.lineWidth = 2
  rr(tx, tubeTop, tubeW, tubeBot - tubeTop + 40, tubeW / 2)
  ctx.stroke()
  // 球部
  ctx.beginPath()
  ctx.arc(tx + tubeW / 2, bulbY, 20, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fill()
  ctx.stroke()

  // 汞柱
  const mx = tx + tubeW / 2
  ctx.fillStyle = '#e0584f'
  rr(mx - 5, mercuryTopY, 10, bulbY - mercuryTopY + 18, 5)
  ctx.fill()
  // 球内汞
  ctx.beginPath()
  ctx.arc(mx, bulbY, 15, 0, Math.PI * 2)
  ctx.fillStyle = '#e0584f'
  ctx.fill()

  // 刻度尺（每 10℃ 标注，每 2℃ 一短线）
  ctx.strokeStyle = 'rgba(60,60,70,0.6)'
  ctx.fillStyle = '#3a3026'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let t = T_MIN; t <= T_MAX; t += 2) {
    const y = tubeBot - (tubeBot - tubeTop) * tempToFrac(t)
    const major = t % 10 === 0
    const x1 = tx - 4
    const x2 = tx - (major ? 14 : 9)
    ctx.lineWidth = major ? 1.6 : 1
    ctx.beginPath()
    ctx.moveTo(x1, y)
    ctx.lineTo(x2, y)
    ctx.stroke()
    if (major) ctx.fillText(String(t), x2 - 3, y)
  }

  // 视线（与汞柱上表面相平）
  ctx.strokeStyle = '#3b6fd4'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(tx - 22, mercuryTopY)
  ctx.lineTo(tx + tubeW + 30, mercuryTopY)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#3b6fd4'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText('视线相平', tx + tubeW + 4, mercuryTopY - 2)
}

function render() {
  if (!ctx) return
  const L = dims()
  ctx.fillStyle = '#f2f0ec'
  ctx.fillRect(0, 0, L.W, L.H)
  const rects = beakerRects(L.W, L.H)
  rects.forEach((r, i) => drawBeaker(L, r, i))
  drawThermometer(L)
}

function loop(now) {
  if (!lastT) lastT = now
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  // 汞柱平滑过渡到所选水温
  const target = cups[selected.value].temp
  mercury.value += (target - mercury.value) * Math.min(1, dt * 4)
  render()
  raf = requestAnimationFrame(loop)
}

function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render()
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
      <div class="lab-panel" style="padding:0">
        <canvas
          ref="canvasRef"
          style="display:block;width:100%;height:520px;background:#f2f0ec;touch-action:none;border-radius:8px;cursor:pointer"
          @click="onCanvasClick"
        ></canvas>
      </div>

      <div class="lab-actions">
        <button class="btn btn-primary" @click="submit" :disabled="!allFilled">记录并校验读数</button>
        <button class="btn" @click="resetAll">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
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
