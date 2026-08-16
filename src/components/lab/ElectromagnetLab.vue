<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import { drawCircuitIcon } from '../../lib/drawCircuitIcon'

const emit = defineEmits(['complete'])

/* ============ 物理模型 ============ */
const I = ref(0.6) // 电流 A（设定电流）
const N = ref(100) // 线圈匝数
const core = ref(true) // 是否插入铁芯
const CORE_MULT = 3 // 铁芯增强倍数
const switchOn = ref(true) // 开关：true=闭合（通电有磁性），false=断开（断路，无磁性）
const Ieff = computed(() => switchOn.value ? I.value : 0) // 断开 → 电流 0
const maxStrength = 1.0 * 150 * CORE_MULT

const strength = computed(() => Ieff.value * N.value * (core.value ? CORE_MULT : 1))
const nails = computed(() => Math.max(0, Math.round((strength.value / maxStrength) * 14)))
let completed = false

/* ============ 记录对比表 ============ */
const snapshots = ref([])
const snapRef = ref(null)
function addSnapshot() {
  snapshots.value.push({
    id: Date.now() + Math.random(),
    I: I.value,
    N: N.value,
    core: core.value,
    nails: nails.value
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

function mark() {
  if (!completed) {
    completed = true
    emit('complete')
  }
}
watch([I, N, core], mark)

/* ============ Canvas ============ */
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
function nodes() {
  const LX = 0.15, RX = 0.85, TY = 0.26, BY = 0.76
  return {
    TL: { x: LX, y: TY }, TR: { x: RX, y: TY },
    BR: { x: RX, y: BY }, BL: { x: LX, y: BY },
    bat: { x: LX, y: 0.5 },
    sw: { x: 0.30, y: TY },
    rheo: { x: 0.50, y: TY },
    coilTop: { x: RX, y: 0.34 },
    coilBot: { x: RX, y: 0.66 },
    coilMid: { x: RX, y: 0.5 }
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
  ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill()
}
// 螺线管（竖直，绕在铁芯上）
function drawCoil() {
  const n = nodes()
  const cx = px(n.coilMid).x
  const topY = px(n.coilTop).y
  const botY = px(n.coilBot).y
  const rw = 15 // 线圈半宽
  // 铁芯
  if (core.value) {
    ctx.fillStyle = '#8a8f96'
    ctx.fillRect(cx - 7, topY, 14, botY - topY)
    ctx.strokeStyle = '#5b6068'
    ctx.lineWidth = 2
    ctx.strokeRect(cx - 7, topY, 14, botY - topY)
  } else {
    ctx.strokeStyle = '#9aa0a8'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.strokeRect(cx - 7, topY, 14, botY - topY)
    ctx.setLineDash([])
  }
  // 绕组（匝数越多越密）
  const visTurns = Math.max(4, Math.round(N.value / 12))
  ctx.strokeStyle = '#c0742a'
  ctx.lineWidth = 4
  for (let i = 0; i < visTurns; i++) {
    const y = topY + 6 + (i / (visTurns - 1)) * (botY - topY - 12)
    ctx.beginPath()
    ctx.ellipse(cx, y, rw, 7, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  // 电流方向（右旋定则）：右侧向上、左侧向下
  ctx.fillStyle = '#d92135'
  ctx.font = '800 12px system-ui'
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText('↑I', cx + rw + 4, (topY + botY) / 2 - 8)
  ctx.fillText('↓I', cx - rw - 24, (topY + botY) / 2 + 8)
  // 磁极
  ctx.fillStyle = '#d92135'
  ctx.font = '800 13px system-ui'
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText('N', cx, topY - 6)
  ctx.fillStyle = '#145fd2'
  ctx.textBaseline = 'top'
  ctx.fillText('S', cx, botY + 6)
  // 磁场线（N→S 外弧）
  ctx.strokeStyle = 'rgba(20,95,210,0.45)'
  ctx.lineWidth = 1.5
  for (const dir of [-1, 1]) {
    for (let k = 1; k <= 2; k++) {
      const off = k * 26
      ctx.beginPath()
      ctx.moveTo(cx + dir * (rw + 2), topY)
      ctx.quadraticCurveTo(cx + dir * (off + rw), (topY + botY) / 2, cx + dir * (rw + 2), botY)
      ctx.stroke()
    }
  }
  // 连接端（盖住导线）
  drawDot(n.coilTop)
  drawDot(n.coilBot)
  ctx.fillStyle = '#3a3026'
  ctx.font = '800 10px system-ui'
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText('螺线管', cx + rw + 4, topY + 2)
  ctx.fillText(core.value ? '（有铁芯）' : '（无铁芯）', cx + rw + 4, topY + 16)
}
// 被吸引的大头针（磁极两端）
function drawNails() {
  const n = nodes()
  const cx = px(n.coilMid).x
  const topY = px(n.coilTop).y
  const botY = px(n.coilBot).y
  const total = nails.value
  const perEnd = Math.ceil(total / 2)
  for (let i = 0; i < total; i++) {
    const top = i % 2 === 0
    const idx = Math.floor(i / 2)
    const spread = (idx - (perEnd - 1) / 2) * 13
    const x = cx + spread
    if (top) {
      const y0 = topY - 6
      drawNail(x, y0, -1)
    } else {
      const y0 = botY + 6
      drawNail(x, y0, 1)
    }
  }
}
function drawNail(x, y0, dir) {
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + dir * 18); ctx.stroke()
  ctx.fillStyle = '#bbb'
  ctx.beginPath(); ctx.arc(x, y0 + dir * 20, 3.2, 0, Math.PI * 2); ctx.fill()
}
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
  const iNorm = Math.min(1, I.value / 1.0)
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
function render() {
  if (!ctx || cssW === 0) return
  paintBoard(ctx, cssW, cssH, 'chalk')
  ctx.fillStyle = '#050505'
  ctx.font = '800 13px system-ui'
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('电磁铁电路 · 磁性 ∝ 电流 × 匝数（插入铁芯大幅增强）；用吸引大头针数比较磁性强弱（转换法）', 14, 12)
  const path = loopPath()
  drawPath(path, 'rgba(0,0,0,0.08)', 9)
  drawPath(path, '#1a1a1a', 4)
  const segsInfo = pathLengths(path)
  drawElectrons(path, segsInfo)
  // 元件图标（通用函数，见 src/lib/drawCircuitIcon.js）+ 接线柱
  const nb = px(nodes().bat), ns = px(nodes().sw), nr = px(nodes().rheo)
  drawCircuitIcon(ctx, 'battery', nb.x, nb.y, 96, 100, { batteryV: 3 })
  drawCircuitIcon(ctx, 'switch', ns.x, ns.y, 86, 74, { open: !switchOn.value })
  drawCircuitIcon(ctx, 'rheostat', nr.x, nr.y, 120, 92, { frac: 0.5 })
  drawDot({ x: nb.x, y: nb.y - 48 }); drawDot({ x: nb.x, y: nb.y + 48 })
  drawDot({ x: ns.x - 37, y: ns.y }); drawDot({ x: ns.x + 37, y: ns.y })
  drawDot({ x: nr.x - 46, y: nr.y }); drawDot({ x: nr.x + 46, y: nr.y })
  drawCoil()
  drawNails()
  // 状态条
  ctx.fillStyle = nails.value > 0 ? '#d92135' : '#777'
  ctx.font = '800 14px system-ui'
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText('吸引大头针数量 = ' + nails.value + ' 枚', cssW / 2, cssH - 12)
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
      <div class="lab-panel" style="padding: 0; min-height: 0; flex: 1">
        <canvas
          ref="canvasRef"
          style="display: block; width: 100%; height: 100%; min-height: 360px; background: transparent"
          role="img"
          aria-label="电磁铁实验电路图：电源、开关、滑动变阻器与绕在铁芯上的螺线管串联，螺线管两端吸引大头针"
        ></canvas>
      </div>
      <div class="lab-actions">
        <span class="r-readout">
          <span class="r-readout-item">电流 <strong>{{ I.toFixed(2) }} A</strong></span>
          <span class="r-readout-item">匝数 <strong>{{ N }} 匝</strong></span>
          <span class="r-readout-item">铁芯 <strong>{{ core ? '有' : '无' }}</strong></span>
          <span class="r-readout-item">大头针 <strong>{{ nails }} 枚</strong></span>
        </span>
        <button class="btn" @click="addSnapshot">＋ 记录对比</button>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>可调变量</strong>
          <span>探究电磁铁</span>
        </div>
        <ParamSlider v-model="I" :min="0.2" :max="1" :step="0.05" :precision="2" label="电流 I" unit=" A" hint="电流越大，磁性越强" />
        <div class="em-param">
          <div class="em-param-head"><span>线圈匝数 N</span><span class="em-param-val">{{ N }} 匝</span></div>
          <div class="em-turns-row">
            <button class="em-turn-btn" :class="{ active: N === 50 }" @click="N = 50">匝数少 50</button>
            <button class="em-turn-btn" :class="{ active: N === 100 }" @click="N = 100">匝数中 100</button>
            <button class="em-turn-btn" :class="{ active: N === 150 }" @click="N = 150">匝数多 150</button>
          </div>
          <p class="em-hint">匝数越多，磁性越强</p>
        </div>
        <div class="em-param">
          <div class="em-param-head"><span>铁芯</span><span class="em-param-val">{{ core ? '已插入（增强）' : '无铁芯（空心）' }}</span></div>
          <div class="em-turns-row">
            <button class="em-turn-btn" :class="{ active: core }" @click="core = true">插入铁芯</button>
            <button class="em-turn-btn" :class="{ active: !core }" @click="core = false">拔出铁芯</button>
          </div>
          <p class="em-hint">插入铁芯可显著增强磁性</p>
        </div>
      </div>

      <FormulaPanel
        title="电磁铁磁性强弱"
        formula="磁性 ∝ 电流 I × 匝数 N"
        :rows="[
          { label: '电流 I', value: I.toFixed(2) + ' A' },
          { label: '线圈匝数 N', value: N + ' 匝' },
          { label: '铁芯', value: core ? '有（×' + CORE_MULT + '）' : '无' }
        ]"
        :result="[{ label: '相对磁性强弱 (= I·N·铁芯)', value: strength.toFixed(0) }]"
        :verify="[
          '电磁铁磁性强弱与电流大小、线圈匝数有关：电流越大、匝数越多，磁性越强',
          '插入铁芯可显著增强磁性（铁芯被磁化）',
          '用吸引大头针的数目比较磁性强弱——看不见的磁性转换为可数的数目，是转换法',
          '电磁铁通电有磁性、断电无磁性，磁性有无可由电流控制（与永磁体不同）'
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
              <tr><th>I/A</th><th>N/匝</th><th>铁芯</th><th>大头针/枚</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in snapshots" :key="s.id">
                <td class="r-num">{{ s.I.toFixed(2) }}</td>
                <td class="r-num">{{ s.N }}</td>
                <td>{{ s.core ? '有' : '无' }}</td>
                <td class="r-num">{{ s.nails }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="r-empty">
            <p>尚无记录</p>
            <p class="r-empty-hint">固定匝数改变电流、或固定电流改变匝数各记录几行，对比吸引大头针数（磁性）</p>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
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
.em-param {
  border-bottom: 1px dashed var(--line);
  padding-bottom: 4px;
}
.em-param:last-child { border-bottom: none; }
.em-param-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8px 12px 4px;
}
.em-param-head span:first-child {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-h);
}
.em-param-val {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  font-family: var(--mono);
}
.em-turns-row {
  display: flex;
  gap: 6px;
  padding: 4px 12px 6px;
}
.em-turn-btn {
  flex: 1;
  min-height: 34px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text-h);
  font-size: 12px;
  font-weight: 800;
  transition: all 0.12s ease;
}
.em-turn-btn:hover {
  background: var(--accent-soft);
  color: var(--accent-strong);
  box-shadow: 3px 3px 0 #050505;
}
.em-turn-btn.active {
  border-color: #050505;
  background: #050505;
  color: #fff;
  box-shadow: 3px 3px 0 var(--accent);
}
.em-hint {
  margin: 0 12px 8px;
  font-size: 11px;
  color: var(--text-dim);
  font-style: italic;
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
.r-table-wrap { overflow-x: auto; }
.r-empty { padding: 18px 12px; text-align: center; }
.r-empty p { color: var(--text-dim); font-size: 13px; font-weight: 700; }
.r-empty-hint { margin-top: 4px !important; font-size: 11px !important; font-weight: 400 !important; }
.r-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.r-table th, .r-table td {
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
  .lab-stage { grid-template-columns: 1fr; }
  .lab-left { height: auto; }
}
</style>
