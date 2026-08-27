<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { boardFg } from '../../lib/boardText'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

const n1 = ref(2)
const n2 = ref(2)
const l1 = ref(15)
const l2 = ref(10)

const F1 = computed(() => n1.value * 0.5)
const F2 = computed(() => n2.value * 0.5)
const M1 = computed(() => F1.value * l1.value)
const M2 = computed(() => F2.value * l2.value)
const balance = computed(() => Math.abs(M1.value - M2.value) < 0.05)
const torqueDiff = computed(() => M1.value - M2.value)

const angDeg = computed(() => {
  const t = torqueDiff.value
  const a = t * 0.6
  return Math.max(-8, Math.min(8, a))
})

const trials = ref([])
const completed = ref(false)

const canvasRef = ref(null)
let ctx = null
let raf = null

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

function geom() {
  const { W, H } = dims()
  const baseY = H - 60
  const cx = W / 2
  const y0 = 280
  const scaleCm = 10
  const barL = 20 * scaleCm
  const barH = 10
  const tickY = 190
  return { W, H, baseY, cx, y0, scaleCm, barL, barH, tickY }
}

function drawWeights(x0, y0, n) {
  const cw = 20
  const ch = 14
  for (let i = 0; i < n; i++) {
    const wy = y0 + (i + 1) * (ch + 2)
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.25)'
    ctx.shadowBlur = 3
    ctx.shadowOffsetY = 2
    const g = ctx.createLinearGradient(x0 - cw / 2, wy, x0 + cw / 2, wy)
    g.addColorStop(0, '#c9a83a')
    g.addColorStop(0.3, '#f0d060')
    g.addColorStop(0.7, '#e8c44a')
    g.addColorStop(1, '#b89528')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.roundRect(x0 - cw / 2, wy, cw, ch, 2)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = '#8a6f24'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.roundRect(x0 - cw / 2, wy, cw, ch, 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillRect(x0 - cw / 2 + 3, wy + 2, cw - 10, 3)
    ctx.fillStyle = 'rgba(0,0,0,0.08)'
    ctx.fillRect(x0 - cw / 2 + 2, wy + ch - 4, cw - 4, 3)
  }
}

function drawRuler(g) {
  ctx.save()
  const rw = g.barL * 2 + 20
  const rh = 16
  const rx = g.cx - rw / 2
  const ry = g.tickY - rh / 2
  const rg = ctx.createLinearGradient(0, ry, 0, ry + rh)
  rg.addColorStop(0, '#e8edf2')
  rg.addColorStop(0.5, '#d0d8e0')
  rg.addColorStop(1, '#b8c2cc')
  ctx.fillStyle = rg
  ctx.beginPath()
  ctx.roundRect(rx, ry, rw, rh, 3)
  ctx.fill()
  ctx.strokeStyle = '#8a96a6'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(rx, ry, rw, rh, 3)
  ctx.stroke()
  ctx.strokeStyle = '#4a5568'
  ctx.lineWidth = 1.2
  ctx.fillStyle = '#4a5568'
  ctx.font = '700 9px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let d = -20; d <= 20; d += 1) {
    const major = d % 5 === 0
    const x = g.cx + d * g.scaleCm
    if (major) {
      ctx.beginPath()
      ctx.moveTo(x, ry)
      ctx.lineTo(x, ry + rh)
      ctx.stroke()
      if (d !== 0) ctx.fillText(String(Math.abs(d)), x, ry + rh + 3)
    } else if (d % 1 === 0) {
      ctx.beginPath()
      ctx.moveTo(x, ry + rh / 2 - 3)
      ctx.lineTo(x, ry + rh / 2 + 3)
      ctx.stroke()
    }
  }
  ctx.fillStyle = '#c0392b'
  ctx.font = '700 11px system-ui, sans-serif'
  ctx.textBaseline = 'bottom'
  ctx.fillText('O', g.cx, ry - 4)
  ctx.restore()
}

function drawTable(g) {
  ctx.save()
  const th = g.H - g.baseY
  const tg = ctx.createLinearGradient(0, g.baseY, 0, g.H)
  tg.addColorStop(0, 'rgba(160,120,80,0.6)')
  tg.addColorStop(0.15, 'rgba(140,106,72,0.5)')
  tg.addColorStop(0.5, 'rgba(120,88,56,0.45)')
  tg.addColorStop(1, 'rgba(80,58,36,0.55)')
  ctx.fillStyle = tg
  ctx.fillRect(0, g.baseY, g.W, th)
  ctx.strokeStyle = 'rgba(200,170,120,0.5)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, g.baseY)
  ctx.lineTo(g.W, g.baseY)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  for (let i = 0; i < 6; i++) {
    const y = g.baseY + 4 + i * (th / 6)
    ctx.beginPath()
    ctx.moveTo(20, y)
    ctx.lineTo(g.W - 20, y)
    ctx.stroke()
  }
  ctx.restore()
}

function drawPivot(g) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.3)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 3
  const pg = ctx.createLinearGradient(g.cx - 32, g.y0, g.cx + 32, g.baseY)
  pg.addColorStop(0, '#9ca3af')
  pg.addColorStop(0.4, '#6b7280')
  pg.addColorStop(1, '#4b5563')
  ctx.fillStyle = pg
  ctx.beginPath()
  ctx.moveTo(g.cx - 32, g.baseY - 2)
  ctx.lineTo(g.cx, g.y0 + 6)
  ctx.lineTo(g.cx + 32, g.baseY - 2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = '#374151'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(g.cx - 32, g.baseY - 2)
  ctx.lineTo(g.cx, g.y0 + 6)
  ctx.lineTo(g.cx + 32, g.baseY - 2)
  ctx.closePath()
  ctx.stroke()
  const bg = ctx.createLinearGradient(g.cx - 60, g.baseY - 12, g.cx + 60, g.baseY)
  bg.addColorStop(0, '#6b7280')
  bg.addColorStop(0.5, '#4b5563')
  bg.addColorStop(1, '#374151')
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(g.cx - 60, g.baseY - 12, 120, 12, 2)
  ctx.fill()
  ctx.strokeStyle = '#1f2937'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(g.cx - 60, g.baseY - 12, 120, 12, 2)
  ctx.stroke()
  ctx.fillStyle = '#1f2937'
  ctx.beginPath()
  ctx.arc(g.cx, g.y0 + 6, 7, 0, Math.PI * 2)
  ctx.fill()
  const sg = ctx.createRadialGradient(g.cx - 2, g.y0 + 4, 1, g.cx, g.y0 + 6, 7)
  sg.addColorStop(0, 'rgba(255,255,255,0.6)')
  sg.addColorStop(0.5, 'rgba(255,255,255,0.15)')
  sg.addColorStop(1, 'rgba(0,0,0,0.2)')
  ctx.fillStyle = sg
  ctx.beginPath()
  ctx.arc(g.cx, g.y0 + 6, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawLever(g) {
  ctx.save()
  ctx.translate(g.cx, g.y0)
  ctx.rotate((angDeg.value * Math.PI) / 180)
  ctx.shadowColor = 'rgba(0,0,0,0.2)'
  ctx.shadowBlur = 5
  ctx.shadowOffsetY = 3
  const lg = ctx.createLinearGradient(-g.barL, -g.barH / 2, -g.barL, g.barH / 2)
  lg.addColorStop(0, '#f0e0c0')
  lg.addColorStop(0.25, '#e8d4a8')
  lg.addColorStop(0.5, '#dcc898')
  lg.addColorStop(0.75, '#d0bc88')
  lg.addColorStop(1, '#c4b078')
  ctx.fillStyle = lg
  ctx.beginPath()
  ctx.roundRect(-g.barL, -g.barH / 2, g.barL * 2, g.barH, 3)
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.translate(g.cx, g.y0)
  ctx.rotate((angDeg.value * Math.PI) / 180)
  ctx.strokeStyle = '#8a7040'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.roundRect(-g.barL, -g.barH / 2, g.barL * 2, g.barH, 3)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fillRect(-g.barL + 6, -g.barH / 2 + 1.5, g.barL * 2 - 12, 2.5)
  ctx.fillStyle = 'rgba(0,0,0,0.06)'
  ctx.fillRect(-g.barL + 4, g.barH / 2 - 3.5, g.barL * 2 - 8, 2)
  ctx.strokeStyle = '#5a4a30'
  ctx.lineWidth = 0.6
  for (let i = -19; i <= 19; i++) {
    if (i === 0) continue
    const x = i * g.scaleCm
    ctx.beginPath()
    ctx.moveTo(x, -g.barH / 2 + 1)
    ctx.lineTo(x, g.barH / 2 - 1)
    ctx.stroke()
  }
  const xL = -l2.value * g.scaleCm
  ctx.strokeStyle = '#374151'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(xL, g.barH / 2)
  ctx.lineTo(xL, 20)
  ctx.stroke()
  ctx.fillStyle = '#9ca3af'
  ctx.beginPath()
  ctx.arc(xL, g.barH / 2, 2.5, 0, Math.PI * 2)
  ctx.fill()
  drawWeights(xL, g.barH / 2 - 2, n2.value)
  const xR = l1.value * g.scaleCm
  ctx.strokeStyle = '#374151'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(xR, g.barH / 2)
  ctx.lineTo(xR, 20)
  ctx.stroke()
  ctx.fillStyle = '#9ca3af'
  ctx.beginPath()
  ctx.arc(xR, g.barH / 2, 2.5, 0, Math.PI * 2)
  ctx.fill()
  drawWeights(xR, g.barH / 2 - 2, n1.value)
  ctx.restore()
}

function drawAnnotations(g) {
  ctx.save()
  const l1x = g.cx + l1.value * g.scaleCm
  const l2x = g.cx - l2.value * g.scaleCm
  const annY = g.tickY + 30
  ctx.strokeStyle = 'rgba(59,130,246,0.7)'
  ctx.fillStyle = 'rgba(59,130,246,0.9)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(g.cx, annY)
  ctx.lineTo(l1x, annY)
  ctx.stroke()
  ctx.setLineDash([])
  for (const [xx, dx] of [[g.cx, 1], [l1x, -1]]) {
    ctx.beginPath()
    ctx.moveTo(xx, annY)
    ctx.lineTo(xx + dx * 6, annY - 4)
    ctx.lineTo(xx + dx * 6, annY + 4)
    ctx.closePath()
    ctx.fill()
  }
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(`l₁ = ${l1.value} cm`, (g.cx + l1x) / 2, annY + 6)
  ctx.strokeStyle = 'rgba(239,68,68,0.7)'
  ctx.fillStyle = 'rgba(239,68,68,0.9)'
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(g.cx, annY + 20)
  ctx.lineTo(l2x, annY + 20)
  ctx.stroke()
  ctx.setLineDash([])
  for (const [xx, dx] of [[g.cx, -1], [l2x, 1]]) {
    ctx.beginPath()
    ctx.moveTo(xx, annY + 20)
    ctx.lineTo(xx + dx * 6, annY + 16)
    ctx.lineTo(xx + dx * 6, annY + 24)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillText(`l₂ = ${l2.value} cm`, (g.cx + l2x) / 2, annY + 26)
  const forceY = g.y0 - 50
  ctx.font = '700 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = '#2563eb'
  ctx.fillText(`F₁ = ${F1.value.toFixed(1)} N`, l1x, forceY)
  ctx.fillStyle = '#dc2626'
  ctx.fillText(`F₂ = ${F2.value.toFixed(1)} N`, l2x, forceY)
  ctx.restore()
}

function render() {
  if (!ctx) return
  const g = geom()
  paintBoard(ctx, g.W, g.H, 'chalk')
  drawTable(g)
  drawRuler(g)
  drawLever(g)
  drawPivot(g)
  drawAnnotations(g)
  ctx.fillStyle = boardFg(ctx.canvas)
  ctx.font = '700 15px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('探究杠杆的平衡条件', g.W / 2, 12)
  ctx.fillStyle = balance.value ? '#16a34a' : '#dc2626'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.fillText(
    balance.value ? '✓ 杠杆水平平衡' : `杠杆 ${angDeg.value > 0 ? '向右' : '向左'}倾斜（F₁l₁ 与 F₂l₂ 不相等）`,
    g.W / 2,
    32
  )
  ctx.fillStyle = '#4b5563'
  ctx.font = '600 11px ui-monospace, Consolas, monospace'
  ctx.fillText(
    `F₁·l₁ = ${M1.value.toFixed(1)}　|　F₂·l₂ = ${M2.value.toFixed(1)}　|　差 = ${(M1.value - M2.value).toFixed(2)}`,
    g.W / 2,
    50
  )
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

function recordTrial() {
  trials.value.push({ n: trials.value.length + 1, f1: F1.value, l1: l1.value, f2: F2.value, l2: l2.value })
  if (!completed.value && trials.value.length >= 2) {
    completed.value = true
    emit('complete')
  }
}

const allBalanced = computed(() => {
  if (trials.value.length < 2) return null
  return trials.value.every((t) => Math.abs(t.f1 * t.l1 - t.f2 * t.l2) < 0.2)
})

function resetAll() {
  n1.value = 2
  n2.value = 2
  l1.value = 15
  l2.value = 10
  trials.value = []
  completed.value = false
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
      <canvas
        class="logic-canvas" ref="canvasRef"
        style="display: block; width: 100%; height: 520px; border-radius: 8px"
      ></canvas>

      <div class="lab-actions">
        <button class="btn btn-primary" @click="recordTrial">记录本次数据</button>
        <button class="btn" @click="resetAll">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">
          {{ completed ? '✓ 已发现杠杆平衡条件' : '调节参数后点击「记录」积累数据' }}
        </span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong></div>
        <div class="lab-params">
          <ParamSlider v-model="n1" :min="1" :max="5" :step="1" :precision="0" label="动力侧钩码数 n₁" unit=" 个（每个 0.5 N）" :hint="'F₁ = ' + F1.toFixed(1) + ' N'" />
          <ParamSlider v-model="l1" :min="5" :max="20" :step="1" :precision="0" label="动力臂 l₁" unit=" cm" />
          <ParamSlider v-model="n2" :min="1" :max="5" :step="1" :precision="0" label="阻力侧钩码数 n₂" unit=" 个（每个 0.5 N）" :hint="'F₂ = ' + F2.toFixed(1) + ' N'" />
          <ParamSlider v-model="l2" :min="5" :max="20" :step="1" :precision="0" label="阻力臂 l₂" unit=" cm" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实验数据记录</strong><span>F₁·l₁ 与 F₂·l₂ 对比</span></div>
        <table class="trial-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>F₁ /N</th>
              <th>l₁ /cm</th>
              <th>F₂ /N</th>
              <th>l₂ /cm</th>
              <th>F₁·l₁</th>
              <th>F₂·l₂</th>
              <th>平衡</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in trials" :key="t.n">
              <td>{{ t.n }}</td>
              <td>{{ t.f1.toFixed(1) }}</td>
              <td>{{ t.l1 }}</td>
              <td>{{ t.f2.toFixed(1) }}</td>
              <td>{{ t.l2 }}</td>
              <td>{{ (t.f1 * t.l1).toFixed(1) }}</td>
              <td>{{ (t.f2 * t.l2).toFixed(1) }}</td>
              <td>{{ Math.abs(t.f1 * t.l1 - t.f2 * t.l2) < 0.2 ? '✓' : '✗' }}</td>
            </tr>
            <tr v-if="trials.length === 0">
              <td colspan="8" class="empty">调节参数后点击「记录本次数据」</td>
            </tr>
          </tbody>
        </table>
        <p v-if="trials.length >= 2" class="conclusion" :class="allBalanced ? 'ok' : 'no'">
          {{ allBalanced
            ? '✓ 所有记录组都满足 F₁·l₁ = F₂·l₂ — 杠杆平衡条件：动力 × 动力臂 = 阻力 × 阻力臂'
            : '✗ 部分记录不满足 F₁·l₁ = F₂·l₂，请重新调节使两边相等' }}
        </p>
      </div>

      <FormulaPanel
        title="杠杆的平衡条件"
        formula="F₁ · l₁ = F₂ · l₂"
        desc="杠杆平衡时，动力与动力臂的乘积等于阻力与阻力臂的乘积（阿基米德杠杆原理）。"
        :rows="[
          { label: '动力 F₁', value: F1.toFixed(1) + ' N' },
          { label: '动力臂 l₁', value: l1 + ' cm' },
          { label: '阻力 F₂', value: F2.toFixed(1) + ' N' },
          { label: '阻力臂 l₂', value: l2 + ' cm' }
        ]"
        :result="[
          { label: 'F₁·l₁', value: M1.toFixed(1) + ' N·cm' },
          { label: 'F₂·l₂', value: M2.toFixed(1) + ' N·cm' },
          { label: '差 Δ', value: (M1 - M2).toFixed(2) + ' N·cm' }
        ]"
        :verify="[
          '保持 F₂、l₂ 不变，改变 F₁ 并相应调节 l₁，杠杆再次水平时 F₁·l₁ 与原 F₂·l₂ 相等',
          '保持 F₁、l₁ 不变，改变 F₂ 并相应调节 l₂，杠杆再次水平时 F₂·l₂ 与原 F₁·l₁ 相等',
          '动力 × 动力臂 = 阻力 × 阻力臂（F₁·l₁ = F₂·l₂）',
          '力臂 = 支点到力的作用线的垂直距离'
        ]"
      />
    </aside>
  </div>
</template>

<style scoped>
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
.conclusion.no {
  color: var(--danger);
  background: rgba(224, 88, 79, 0.1);
  border-left: 3px solid var(--danger);
}
</style>