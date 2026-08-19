<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import { drawCircuitIcon } from '../../lib/drawCircuitIcon'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ============ 物理模型 ============ */
const E = 3 // 电源电压 V
const U_RATE = 2.5 // 额定电压 V
const U = ref(2.5) // 灯泡两端电压设定 V
const R = ref(10) // 灯泡电阻 Ω（近似，实际随温度略变）
const switchOn = ref(true) // 开关：true=闭合，false=断开（断路）

const Ueff = computed(() => switchOn.value ? U.value : 0) // 开关断开 → 灯泡两端电压 0
const I = computed(() => switchOn.value ? U.value / R.value : 0) // 断开 → I=0
const P = computed(() => Ueff.value * I.value) // P = UI
const P_RATE = computed(() => (U_RATE * U_RATE) / R.value)
const glow = computed(() => Math.min(1, P.value / 1.0))
const status = computed(() => {
  if (!switchOn.value) return { text: '熄灭（断开开关 → 断路，实际功率 = 0）', cls: 'dim' }
  if (U.value < U_RATE - 0.01) return { text: '较暗（实际功率 < 额定功率）', cls: 'dim' }
  if (U.value > U_RATE + 0.01) return { text: '过亮（实际功率 > 额定，易损坏）', cls: 'over' }
  return { text: '正常发光（实际功率 = 额定功率）', cls: 'ok' }
})
const RHEO_MAX = 60
const rheoVal = ref(20) // 滑动变阻器接入阻值（装饰，仿真中不改变 I）
let completed = false

/* ============ 记录对比表 ============ */
const snapshots = ref([])
const snapRef = ref(null)
function addSnapshot() {
  snapshots.value.push({
    id: Date.now() + Math.random(),
    U: Ueff.value,
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
// 元件图标统一由 drawCircuitIcon 绘制（见 src/lib/drawCircuitIcon.js）

// ===== 电路几何：中心点(像素) + 接线柱(像素) =====
function geom() {
  const W = cssW, H = cssH
  const LX = 0.10, RX = 0.90, TY = 0.28, BY = 0.78
  const c = {
    TL: { x: LX * W, y: TY * H },
    TR: { x: RX * W, y: TY * H },
    BR: { x: RX * W, y: BY * H },
    BL: { x: LX * W, y: BY * H },
    bat: { x: LX * W, y: 0.5 * H },
    sw: { x: 0.20 * W, y: TY * H },
    am: { x: 0.36 * W, y: TY * H },
    bulb: { x: 0.62 * W, y: TY * H },
    rheo: { x: 0.50 * W, y: BY * H },
    vm: { x: 0.62 * W, y: 0.56 * H }
  }
  const BOX = { bat: [96, 100], sw: [86, 74], am: [86, 86], bulb: [104, 104], rheo: [120, 92], vm: [86, 86] }
  const half = (k) => Math.min(BOX[k][0], BOX[k][1]) / 2
  return {
    c, BOX,
    term: {
      batT: { x: c.bat.x, y: c.bat.y - half('bat') },
      batB: { x: c.bat.x, y: c.bat.y + half('bat') },
      swL: { x: c.sw.x - half('sw'), y: c.sw.y },
      swR: { x: c.sw.x + half('sw'), y: c.sw.y },
      amL: { x: c.am.x - half('am'), y: c.am.y },
      amR: { x: c.am.x + half('am'), y: c.am.y },
      bulbL: { x: c.bulb.x - half('bulb'), y: c.bulb.y },
      bulbR: { x: c.bulb.x + half('bulb'), y: c.bulb.y },
      rheoL: { x: c.rheo.x - half('rheo'), y: c.rheo.y },
      rheoR: { x: c.rheo.x + half('rheo'), y: c.rheo.y },
      vmL: { x: c.vm.x - half('vm'), y: c.vm.y },
      vmR: { x: c.vm.x + half('vm'), y: c.vm.y }
    }
  }
}

// 主回路：从 TL 顺时针，依次在元件接线柱处断开
function loopPath(g) {
  const t = g.term
  return [
    g.c.TL, t.swL, t.swR, t.amL, t.amR, t.bulbL, t.bulbR, g.c.TR,
    g.c.BR, t.rheoL, t.rheoR, g.c.BL, t.batB, t.batT, g.c.TL
  ]
}

function drawPath(pts, color, w) {
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke()
}

// 接线柱：深色外圈 + 黄铜内点
function drawDot(p) {
  ctx.fillStyle = '#050505'
  ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#e8c063'
  ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill()
}
// 元件图标（电池/开关/电流表/灯泡/变阻器/电压表）统一由 drawCircuitIcon 绘制
function initElectrons() {
  electrons = []
  for (let i = 0; i < 16; i++) electrons.push({ t: i / 16 })
}
function pathLengths(path) {
  const segs = []
  let total = 0
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    segs.push(d); total += d
  }
  return { segs, total }
}
function pointAtT(path, segs, total, t) {
  let dist = t * total
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i]) {
      const a = path[i], b = path[i + 1]
      const k = segs[i] ? dist / segs[i] : 0
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    }
    dist -= segs[i]
  }
  return path[path.length - 1]
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
  paintBoard(ctx, cssW, cssH, 'chalk')
  ctx.fillStyle = '#050505'
  ctx.font = '800 13px system-ui'
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('测量电路 · 电流表串联测 I，电压表并联测 U（亮度由实际功率 P=UI 决定）', 14, 12)
  const g = geom()
  const path = loopPath(g)
  drawPath(path, 'rgba(0,0,0,0.08)', 9)
  drawPath(path, '#1a1a1a', 4)
  const segsInfo = pathLengths(path)
  drawElectrons(path, segsInfo)
  // 元件图标（通用函数，见 src/lib/drawCircuitIcon.js）+ 接线柱
  drawCircuitIcon(ctx, 'battery', g.c.bat.x, g.c.bat.y, g.BOX.bat[0], g.BOX.bat[1], { batteryV: E })
  drawCircuitIcon(ctx, 'switch', g.c.sw.x, g.c.sw.y, g.BOX.sw[0], g.BOX.sw[1], { open: !switchOn.value })
  drawCircuitIcon(ctx, 'ammeter', g.c.am.x, g.c.am.y, g.BOX.am[0], g.BOX.am[1], { current: I.value })
  drawCircuitIcon(ctx, 'bulb', g.c.bulb.x, g.c.bulb.y, g.BOX.bulb[0], g.BOX.bulb[1], { glow: glow.value })
  drawCircuitIcon(ctx, 'rheostat', g.c.rheo.x, g.c.rheo.y, g.BOX.rheo[0], g.BOX.rheo[1], { frac: Math.min(rheoVal.value, RHEO_MAX) / RHEO_MAX, label: '滑动变阻器 R′ = ' + rheoVal.value.toFixed(0) + ' Ω' })
  // 电压表并联引线（从灯泡左右接线柱到电压表接线柱）
  const bL = g.term.bulbL, bR = g.term.bulbR, vmL = g.term.vmL, vmR = g.term.vmR
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(bL.x, bL.y); ctx.lineTo(vmL.x, vmL.y); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(bR.x, bR.y); ctx.lineTo(vmR.x, vmR.y); ctx.stroke()
  drawCircuitIcon(ctx, 'voltmeter', g.c.vm.x, g.c.vm.y, g.BOX.vm[0], g.BOX.vm[1], { voltage: Ueff.value })
  drawDot(g.term.batT); drawDot(g.term.batB)
  drawDot(g.term.swL); drawDot(g.term.swR)
  drawDot(g.term.amL); drawDot(g.term.amR)
  drawDot(g.term.bulbL); drawDot(g.term.bulbR)
  drawDot(g.term.rheoL); drawDot(g.term.rheoR)
  drawDot(vmL); drawDot(vmR)
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
          style="display: block; width: 100%; height: 100%; min-height: 360px"
          role="img"
          aria-label="测量小灯泡电功率电路图：电源、开关、滑动变阻器、电流表串联，小灯泡，电压表并联在灯泡两端"
        ></canvas>
      </div>
      <div class="lab-actions">
        <span class="r-readout">
          <span class="r-readout-item">电压 <strong>{{ Ueff.toFixed(2) }} V</strong></span>
          <span class="r-readout-item">电流 <strong>{{ I.toFixed(2) }} A</strong></span>
          <span class="r-readout-item">实际功率 <strong>{{ P.toFixed(3) }} W</strong></span>
          <span class="r-readout-item">额定 <strong>{{ P_RATE.toFixed(3) }} W</strong></span>
        </span>
        <button class="btn" :class="{ 'btn-on': switchOn }" @click="switchOn = !switchOn">
          {{ switchOn ? '⏸ 断开开关' : '▶ 闭合开关' }}
        </button>
        <button class="btn" @click="addSnapshot">＋ 记录对比</button>
        <FullscreenBtn />
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
.btn-on {
  background: var(--accent);
  color: #fff;
  border-color: #050505;
  box-shadow: 3px 3px 0 #050505;
}
@media (max-width: 1180px) {
  .lab-stage:not(.is-fullscreen) { grid-template-columns: 1fr; }
  .lab-left:not(.is-fullscreen) { height: auto; }
}
</style>
