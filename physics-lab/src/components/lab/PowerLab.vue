<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

/* ============ 物理模型 ============ */
const U_RATE = 2.5 // 额定电压 V
const U = ref(2.5) // 灯泡两端电压 V
const R = ref(10) // 灯泡电阻 Ω（近似，实际随温度略变）

const I = computed(() => U.value / R.value)
const P = computed(() => U.value * I.value) // P = UI
const P_RATE = computed(() => (U_RATE * U_RATE) / R.value)
const glow = computed(() => Math.min(1, P.value / 1.0))
const status = computed(() => {
  if (U.value < U_RATE - 0.01) return { text: '较暗（实际功率 < 额定功率）', cls: 'dim' }
  if (U.value > U_RATE + 0.01) return { text: '过亮（实际功率 > 额定，易损坏）', cls: 'over' }
  return { text: '正常发光（实际功率 = 额定功率）', cls: 'ok' }
})
let completed = false

/* ============ 记录对比表 ============ */
const snapshots = ref([])
const snapRef = ref(null)
function addSnapshot() {
  snapshots.value.push({
    id: Date.now() + Math.random(),
    U: U.value,
    I: I.value,
    P: P.value,
    st: status.value.cls
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
watch([U, R], mark)

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
  const LX = 0.15, RX = 0.85, TY = 0.28, BY = 0.74
  return {
    TL: { x: LX, y: TY }, TR: { x: RX, y: TY },
    BR: { x: RX, y: BY }, BL: { x: LX, y: BY },
    bat: { x: LX, y: 0.5 },
    sw: { x: 0.30, y: TY },
    rheo: { x: 0.50, y: TY },
    ammeter: { x: 0.70, y: TY },
    bulb: { x: RX, y: 0.5 },
    vmeter: { x: 0.66, y: 0.5 }
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
function drawBattery() {
  const n = nodes()
  const c = px(n.bat)
  const half = Math.min(34, cssH * 0.11)
  ctx.save()
  ctx.translate(c.x, c.y)
  ctx.fillStyle = '#fffef9'
  ctx.fillRect(-12, -half, 24, half * 2)
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2.5
  ctx.strokeRect(-12, -half, 24, half * 2)
  ctx.strokeStyle = '#050505'
  for (let i = 0; i < 2; i++) {
    const y = (i - 0.5) * 14
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(-9, y - 3); ctx.lineTo(9, y - 3); ctx.stroke()
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(-5, y + 3); ctx.lineTo(5, y + 3); ctx.stroke()
  }
  ctx.fillStyle = '#d92135'
  ctx.font = '800 13px system-ui'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('+', 0, -half - 9)
  ctx.fillStyle = '#050505'
  ctx.fillText('−', 0, half + 9)
  ctx.fillStyle = '#3a3026'
  ctx.font = '800 12px system-ui'
  ctx.textAlign = 'right'
  ctx.fillText('电源', -16, 0)
  ctx.restore()
}
function drawSwitch() {
  const n = nodes()
  const p = px(n.sw)
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x + 14, p.y); ctx.stroke()
  drawDot({ x: n.sw.x - 0.02, y: n.sw.y })
  drawDot({ x: n.sw.x + 0.02, y: n.sw.y })
  ctx.beginPath(); ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x + 14, p.y - 14); ctx.stroke()
  ctx.fillStyle = '#3a3026'
  ctx.font = '800 11px system-ui'
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText('开关', p.x, p.y - 18)
}
function drawMeter(kind, value, rel, r) {
  const c = px(rel)
  ctx.save()
  ctx.translate(c.x, c.y)
  ctx.fillStyle = '#fffef9'
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.fillStyle = '#050505'
  ctx.font = '800 13px system-ui'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(kind, 0, -r * 0.35)
  ctx.restore()
  ctx.fillStyle = '#d92135'
  ctx.font = '800 11px ui-monospace, monospace'
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText(value, c.x, c.y + r + 4)
  ctx.fillStyle = '#3a3026'
  ctx.font = '800 10px system-ui'
  ctx.fillText(kind === 'A' ? '电流表' : '电压表', c.x, c.y + r + 18)
}
function drawRheostat() {
  const n = nodes()
  const c = px(n.rheo)
  const w = Math.min(70, cssW * 0.1)
  const h = 18
  ctx.save()
  ctx.translate(c.x, c.y)
  ctx.fillStyle = '#fffef9'
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2.5
  ctx.strokeRect(-w / 2, -h / 2, w, h)
  ctx.fillStyle = '#050505'
  ctx.fillRect(-4, -h / 2 - 6, 8, 6)
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(0, -h / 2 - 6); ctx.lineTo(0, -h / 2 - 16)
  ctx.lineTo(8, -h / 2 - 10); ctx.moveTo(0, -h / 2 - 16); ctx.lineTo(-8, -h / 2 - 10); ctx.stroke()
  ctx.restore()
  ctx.fillStyle = '#3a3026'
  ctx.font = '800 10px system-ui'
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('滑动变阻器', c.x, c.y + h / 2 + 4)
}
function drawBulb() {
  const n = nodes()
  const c = px(n.bulb)
  const r = Math.min(30, cssW * 0.044)
  const b = glow.value
  ctx.save()
  ctx.translate(c.x, c.y)
  if (b > 0.03) {
    const grd = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * (1.6 + b * 1.8))
    grd.addColorStop(0, `rgba(255,220,120,${0.7 * b})`)
    grd.addColorStop(1, 'rgba(255,220,120,0)')
    ctx.fillStyle = grd
    ctx.beginPath(); ctx.arc(0, 0, r * (1.6 + b * 1.8), 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = `rgba(255,${200 + Math.round(55 * b)},${120 + Math.round(80 * b)},${0.4 + 0.5 * b})`
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
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
  // 灯座
  ctx.fillStyle = '#5b6068'
  ctx.fillRect(-r * 0.42, r, r * 0.84, r * 0.5)
  ctx.restore()
  // 端子
  drawDot({ x: n.bulb.x, y: n.bulb.y - 0.0 })
  // 标注
  ctx.fillStyle = '#050505'
  ctx.font = '800 11px system-ui'
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText('小灯泡', c.x + r + 6, c.y - 8)
  ctx.fillStyle = b > 0.5 ? '#d92135' : '#b87915'
  ctx.fillText(status.value.text.split('（')[0], c.x + r + 6, c.y + 8)
}
function drawVoltmeter() {
  const n = nodes()
  const tr = px(n.TR), br = px(n.BR)
  const vm = px(n.vmeter)
  const r = 18
  const vR = vm.x + r * 0.7, vL = vm.x - r * 0.7
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2.5
  // 电压表并联在灯泡两端：从灯泡上、下接线端引线到电压表
  ctx.beginPath(); ctx.moveTo(tr.x, tr.y); ctx.lineTo(vR, vm.y); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(br.x, br.y); ctx.lineTo(vR, vm.y); ctx.stroke()
  drawMeter('V', U.value.toFixed(2) + ' V', n.vmeter, r)
  // 隐藏左侧引线（避免穿过电流表区域）
  void vL
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
  const iNorm = Math.min(1, I.value / 0.6)
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
  ctx.fillStyle = '#f2f0ec'
  ctx.fillRect(0, 0, cssW, cssH)
  ctx.fillStyle = '#050505'
  ctx.font = '800 13px system-ui'
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('测量电路 · 电流表串联测 I，电压表并联测 U（亮度由实际功率 P=UI 决定）', 14, 12)
  const path = loopPath()
  drawPath(path, 'rgba(0,0,0,0.08)', 9)
  drawPath(path, '#1a1a1a', 4)
  const segsInfo = pathLengths(path)
  drawElectrons(path, segsInfo)
  drawBattery()
  drawSwitch()
  drawRheostat()
  drawAmmeterOnCircuit()
  drawBulb()
  drawVoltmeter()
}
function drawAmmeterOnCircuit() {
  const n = nodes()
  drawMeter('A', I.value.toFixed(2) + ' A', n.ammeter, Math.min(26, cssW * 0.038))
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
          style="display: block; width: 100%; height: 100%; min-height: 360px; background: #f2f0ec"
          role="img"
          aria-label="测量小灯泡电功率电路图：电源、开关、滑动变阻器、电流表串联，小灯泡，电压表并联在灯泡两端"
        ></canvas>
      </div>
      <div class="lab-actions">
        <span class="r-readout">
          <span class="r-readout-item">电压 <strong>{{ U.toFixed(2) }} V</strong></span>
          <span class="r-readout-item">电流 <strong>{{ I.toFixed(2) }} A</strong></span>
          <span class="r-readout-item">实际功率 <strong>{{ P.toFixed(3) }} W</strong></span>
          <span class="r-readout-item">额定 <strong>{{ P_RATE.toFixed(3) }} W</strong></span>
        </span>
        <button class="btn" @click="addSnapshot">＋ 记录对比</button>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>可调变量</strong>
          <span>测量电功率</span>
        </div>
        <ParamSlider v-model="U" :min="0" :max="3" :step="0.1" :precision="1" label="灯泡两端电压 U" unit=" V" :hint="`额定电压 U额 = ${U_RATE} V`" />
        <ParamSlider v-model="R" :min="6" :max="16" :step="0.5" :precision="1" label="灯泡电阻 R" unit=" Ω" hint="实际灯泡电阻随温度略变，此处取近似" />
        <p class="pw-status" :class="status.cls">{{ status.text }}</p>
      </div>

      <FormulaPanel
        title="小灯泡的电功率"
        formula="P = U · I = U² / R"
        :rows="[
          { label: '电压 U', value: U.toFixed(2) + ' V' },
          { label: '电流 I = U/R', value: I.toFixed(2) + ' A' },
          { label: '额定电压 U额', value: U_RATE + ' V' }
        ]"
        :result="[
          { label: '实际功率 P = UI', value: P.toFixed(3) + ' W' },
          { label: '额定功率 P额', value: P_RATE.toFixed(3) + ' W' }
        ]"
        :verify="[
          '用电压表测灯泡两端电压 U、电流表测电流 I，由 P=UI 算实际功率',
          'U = U额 时灯泡正常发光，此时功率为额定功率',
          'U < U额 较暗（实际功率<额定），U > U额 过亮（易损坏）',
          '亮度由实际功率决定，不是由电压或电流单独决定；应直接用 P=UI 实测，不把 R 当变量'
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
              <tr><th>U/V</th><th>I/A</th><th>P/W</th><th>状态</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in snapshots" :key="s.id">
                <td class="r-num">{{ s.U.toFixed(2) }}</td>
                <td class="r-num">{{ s.I.toFixed(2) }}</td>
                <td class="r-num">{{ s.P.toFixed(3) }}</td>
                <td>
                  <span class="pw-dot" :class="s.st"></span>
                  {{ s.st === 'ok' ? '正常' : s.st === 'over' ? '过亮' : '较暗' }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="r-empty">
            <p>尚无记录</p>
            <p class="r-empty-hint">调电压到 U额=2.5V 记录额定状态，再调小/调大各记一行，对比实际功率与亮度</p>
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
.pw-status {
  margin: 4px 12px 10px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 2px solid var(--line);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.4;
}
.pw-status.ok { background: var(--success-bg); color: var(--success); border-color: var(--success); }
.pw-status.dim { background: var(--warning-bg); color: var(--warning); border-color: var(--warning); }
.pw-status.over { background: var(--danger-bg); color: var(--danger); border-color: var(--danger); }
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
.pw-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--line);
  margin-right: 4px;
  vertical-align: middle;
}
.pw-dot.ok { background: var(--green); }
.pw-dot.dim { background: var(--amber); }
.pw-dot.over { background: var(--danger); }
@media (max-width: 1180px) {
  .lab-stage { grid-template-columns: 1fr; }
  .lab-left { height: auto; }
}
</style>
