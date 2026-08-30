<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'
import { svgPoint } from '../../lib/svgCoord'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560，直角三角形 C 为直角顶点、A 为研究角 ===== */
const VW = 900, VH = 560

const angleDeg = ref(30)   // 锐角 A
const hyp = ref(10)        // 斜边 c

let touched = false, done = false
function touch() {
  touched = true
  if (!done) { done = true; emit('complete') }
}

/* 以 A 在左下、直角 C 在右下布置：AB 为邻边（水平），BC 为对边（竖直） */
const geo = computed(() => {
  const A = angleDeg.value * Math.PI / 180
  const c = hyp.value
  const s = Math.min((VW - 220) / (c * Math.cos(A)), (VH - 140) / c) // 统一缩放
  const ax = 130, ay = VH - 90
  const bx = ax + c * Math.cos(A) * s
  const by = ay
  const cx = bx, cy = ay - c * Math.sin(A) * s
  return { ax, ay, bx, by, cx, cy, A: angleDeg.value, c, s }
})

const sinA = computed(() => Math.sin(angleDeg.value * Math.PI / 180))
const cosA = computed(() => Math.cos(angleDeg.value * Math.PI / 180))
const tanA = computed(() => Math.tan(angleDeg.value * Math.PI / 180))

const aLen = computed(() => hyp.value * sinA.value) // 对边 BC
const bLen = computed(() => hyp.value * cosA.value) // 邻边 AB

/* 特殊角高亮 */
const isSpecial = computed(() => [30, 45, 60].includes(angleDeg.value))

const rows = computed(() => [
  { label: '锐角 A', value: `${angleDeg.value}°` },
  { label: '对边 a（BC）', value: aLen.value.toFixed(2) },
  { label: '邻边 b（AB）', value: bLen.value.toFixed(2) },
  { label: '斜边 c（AC）', value: hyp.value.toFixed(2) },
  { label: 'sinA = a/c', value: sinA.value.toFixed(4) },
  { label: 'cosA = b/c', value: cosA.value.toFixed(4) },
  { label: 'tanA = a/b', value: tanA.value.toFixed(4) }
])
const results = computed(() => [
  { label: '随 A 增大', value: 'sinA↑　cosA↓　tanA↑' },
  { label: '边长放大', value: '三边同乘 k，比值不变（相似）' }
])

/* 直接拖动顶点 C 改变角度 */
function dragC(e) {
  e.preventDefault()
  const svg = e.currentTarget.closest('svg')
  const move = (ev) => {
    const p = svgPoint(svg, ev.clientX, ev.clientY)
    const dx = p.x - geo.value.ax
    const dy = geo.value.ay - p.y
    let deg = Math.atan2(dy, Math.max(dx, 1)) * 180 / Math.PI
    deg = Math.max(8, Math.min(82, Math.round(deg)))
    if (deg !== angleDeg.value) { angleDeg.value = deg; touch() }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

const specialTable = [
  { deg: '30°', sin: '1/2', cos: '√3/2', tan: '√3/3' },
  { deg: '45°', sin: '√2/2', cos: '√2/2', tan: '1' },
  { deg: '60°', sin: '√3/2', cos: '1/2', tan: '√3' }
]

/* ===== 单位圆动画视图 ===== */
const viewMode = ref('triangle')
const playing = ref(false)
const showWave = ref(true)
const focus = ref('all') // all | sin | cos | tan —— 单位圆分开展示某一比值
const FOCI = [
  { id: 'all', label: '全部' },
  { id: 'sin', label: '正弦 sin' },
  { id: 'cos', label: '余弦 cos' },
  { id: 'tan', label: '正切 tan' }
]
let playRaf = null, playLast = 0

const CIRC = { cx: 300, cy: 300, r: 140, wx: 540, ww: 330 }

const circ = computed(() => {
  const { cx, cy, r } = CIRC
  const rad = angleDeg.value * Math.PI / 180
  const cosv = Math.cos(rad), sinv = Math.sin(rad)
  const P = { x: cx + r * cosv, y: cy - r * sinv }
  // tan：终边 OP 延长后与切线 x = cx+r 的交点纵偏移 = r·tanθ（超界则截断显示）
  const tanv = Math.tan(rad)
  const TAN_MAX = 225
  const tanOk = Math.abs(cosv) > 0.02
  const tanY = cy - r * tanv
  const clamped = Math.abs(tanY - cy) > TAN_MAX
  const tanYc = cy + Math.max(-TAN_MAX, Math.min(TAN_MAX, tanY - cy))
  // 波形：按 focus 画 sin / cos / tan 曲线（tan 在渐近线处断开并标虚线）
  const waveLines = []
  const asym = []
  let linkFrom = { x: P.x, y: P.y }
  let waveStartY = cy
  let waveLabel = 'sin 波形（随旋转滑动）'
  if (showWave.value) {
    const f = focus.value === 'cos' ? Math.cos : focus.value === 'tan' ? Math.tan : Math.sin
    const amp = focus.value === 'tan' ? 235 : r
    if (focus.value === 'cos') { linkFrom = { x: cx + r * cosv, y: cy }; waveLabel = 'cos 波形（随旋转滑动）' }
    if (focus.value === 'tan') {
      linkFrom = { x: cx + r, y: cy + Math.max(-TAN_MAX, Math.min(TAN_MAX, -r * tanv)) }
      waveLabel = 'tan 曲线（虚线处为渐近线）'
      for (let a = 90; a < angleDeg.value + 340; a += 180) {
        if (a >= angleDeg.value) {
          const fr = (a - angleDeg.value) / 340
          if (fr <= 1) asym.push(CIRC.wx + fr * CIRC.ww)
        }
      }
    }
    let cur = []
    let prevY = null
    for (let k = 0; k <= 34; k++) {
      const ph = ((angleDeg.value + k * 10) % 360) * Math.PI / 180
      let yv = cy - amp * f(ph)
      if (focus.value === 'tan') yv = cy + Math.max(-amp, Math.min(amp, -amp * Math.tan(ph)))
      if (prevY != null && Math.abs(yv - prevY) > 150 && cur.length) {
        waveLines.push(cur)
        cur = []
      }
      cur.push(`${(CIRC.wx + (k / 34) * CIRC.ww).toFixed(1)},${yv.toFixed(1)}`)
      prevY = yv
    }
    if (cur.length) waveLines.push(cur)
    waveStartY = waveLines.length && waveLines[0].length ? Number(waveLines[0][0].split(',')[1]) : cy
  }
  const arcEnd = { x: cx + 46 * cosv, y: cy - 46 * sinv }
  const half = (angleDeg.value / 2) * Math.PI / 180
  const arcLbl = { x: cx + 64 * Math.cos(half), y: cy - 64 * Math.sin(half) }
  return { P, cosv, sinv, tanv, tanYc, tanOk, clamped, waveLines, asym, linkFrom, waveStartY, waveLabel, arcEnd, arcLbl }
})

function setView(v) {
  viewMode.value = v
  stopPlay()
  if (v === 'triangle') angleDeg.value = Math.max(8, Math.min(82, angleDeg.value))
}
function togglePlay() {
  playing.value = !playing.value
  if (playing.value) {
    playLast = performance.now()
    playRaf = requestAnimationFrame(playTick)
  } else if (playRaf) {
    cancelAnimationFrame(playRaf)
  }
}
function playTick(now) {
  if (!playing.value) return
  const dt = Math.min((now - playLast) / 1000, 0.05)
  playLast = now
  angleDeg.value = Math.round((angleDeg.value + dt * 45) % 360)
  touch()
  playRaf = requestAnimationFrame(playTick)
}
function stopPlay() {
  playing.value = false
  if (playRaf) cancelAnimationFrame(playRaf)
}
/* 拖动圆上的点 P 改变角度 */
function dragP(e) {
  e.preventDefault()
  stopPlay()
  const svg = e.currentTarget.closest('svg')
  const move = (ev) => {
    const p = svgPoint(svg, ev.clientX, ev.clientY)
    let deg = Math.round((Math.atan2(CIRC.cy - p.y, p.x - CIRC.cx) * 180) / Math.PI)
    deg = (deg + 360) % 360
    if (deg !== angleDeg.value) { angleDeg.value = deg; touch() }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
onBeforeUnmount(stopPlay)
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel tg-panel" style="padding: 0">
        <svg class="tg-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="锐角三角函数：直角三角形三边比值">
          <!-- 底边基线 -->
          <g v-if="viewMode === 'triangle'">
          <line class="ground" x1="90" :y1="geo.ay" x2="VW - 60" :y2="geo.ay" />

          <!-- 直角标记 -->
          <path class="rmark" :d="`M ${geo.bx - 16} ${geo.by} L ${geo.bx - 16} ${geo.by - 16} L ${geo.bx} ${geo.by - 16}`" />

          <!-- 角 A 圆弧 -->
          <path class="arc" :d="`M ${geo.ax + 52} ${geo.ay} A 52 52 0 0 0 ${geo.ax + 52 * Math.cos(geo.A * Math.PI / 180)} ${geo.ay - 52 * Math.sin(geo.A * Math.PI / 180)}`" />
          <text class="albl" :x="geo.ax + 74" :y="geo.ay - 14">A = {{ angleDeg }}°</text>

          <!-- 三角形 -->
          <polygon class="tri" :points="`${geo.ax},${geo.ay} ${geo.bx},${geo.by} ${geo.cx},${geo.cy}`" />

          <!-- 三边标签 -->
          <text class="edge e-a" :x="geo.bx + 12" :y="(geo.by + geo.cy) / 2">a = {{ aLen.toFixed(2) }}</text>
          <text class="edge e-b" :x="(geo.ax + geo.bx) / 2" :y="geo.ay + 26" text-anchor="middle">b = {{ bLen.toFixed(2) }}</text>
          <text class="edge e-c" :x="(geo.ax + geo.cx) / 2 - 14" :y="(geo.ay + geo.cy) / 2" text-anchor="end">c = {{ hyp.toFixed(2) }}</text>

          <!-- 顶点字母 -->
          <circle class="dot" :cx="geo.ax" :cy="geo.ay" r="5" />
          <circle class="dot" :cx="geo.bx" :cy="geo.by" r="5" />
          <circle class="dot dot-c drag" :cx="geo.cx" :cy="geo.cy" r="8" @pointerdown.prevent="dragC" />
          <text class="vtx" :x="geo.ax - 16" :y="geo.ay + 6">A</text>
          <text class="vtx" :x="geo.bx + 10" :y="geo.ay + 6">B</text>
          <text class="vtx" :x="geo.cx + 10" :y="geo.cy - 6">C（直角）</text>

          <!-- 比值读数条 -->
          <g class="ratio">
            <text x="600" y="70">sinA = a/c = {{ sinA.toFixed(3) }}</text>
            <text x="600" y="98">cosA = b/c = {{ cosA.toFixed(3) }}</text>
            <text x="600" y="126">tanA = a/b = {{ tanA.toFixed(3) }}</text>
          </g>
          <text v-if="isSpecial" class="special" x="600" y="158">✓ 特殊角，对照下表核对</text>
          </g>

          <!-- ===== 单位圆动画视图 ===== -->
          <g v-else>
            <!-- 坐标轴与单位圆 -->
            <line class="uc-axis" x1="60" :y1="CIRC.cy" :x2="CIRC.cx + CIRC.r + 60" :y2="CIRC.cy" />
            <line class="uc-axis" :x1="CIRC.cx" y1="80" :x2="CIRC.cx" :y2="520" />
            <circle class="uc-circle" :cx="CIRC.cx" :cy="CIRC.cy" :r="CIRC.r" />
            <!-- 正切切线（x = r 处竖直虚线） -->
            <line class="tanline" :x1="CIRC.cx + CIRC.r" y1="60" :x2="CIRC.cx + CIRC.r" y2="520" />
            <!-- 角弧与角度 -->
            <path class="uc-arc" :d="`M ${CIRC.cx + 46} ${CIRC.cy} A 46 46 0 0 0 ${circ.arcEnd.x} ${circ.arcEnd.y}`" />
            <text class="uc-deg" :x="circ.arcLbl.x" :y="circ.arcLbl.y" text-anchor="middle">{{ angleDeg }}°</text>

            <!-- cos（横）/ sin（竖）/ 半径：按 focus 分开展示 -->
            <line v-if="focus === 'all' || focus === 'cos'" class="seg-cos" :class="{ solo: focus !== 'all' }" :x1="CIRC.cx" :y1="CIRC.cy" :x2="circ.P.x" :y2="CIRC.cy" />
            <line v-if="focus === 'all' || focus === 'sin'" class="seg-sin" :class="{ solo: focus !== 'all' }" :x1="circ.P.x" :y1="CIRC.cy" :x2="circ.P.x" :y2="circ.P.y" />
            <line class="radius-line" :x1="CIRC.cx" :y1="CIRC.cy" :x2="circ.P.x" :y2="circ.P.y" />
            <!-- tan（终边延长交切线） -->
            <g v-if="circ.tanOk && (focus === 'all' || focus === 'tan')">
              <line class="seg-tan" :class="{ solo: focus !== 'all' }" :x1="CIRC.cx + CIRC.r" :y1="CIRC.cy" :x2="CIRC.cx + CIRC.r" :y2="circ.tanYc" />
              <text class="uclbl t" :x="CIRC.cx + CIRC.r + 10" :y="(CIRC.cy + circ.tanYc) / 2">tan = {{ circ.tanv.toFixed(3) }}{{ circ.clamped ? '（出图）' : '' }}</text>
            </g>
            <text v-else-if="focus === 'all' || focus === 'tan'" class="uclbl t" :x="CIRC.cx + CIRC.r + 10" :y="CIRC.cy - 40">tan 不存在（cos = 0）</text>

            <!-- 数值标签 -->
            <text v-if="focus === 'all' || focus === 'cos'" class="uclbl c" :x="(CIRC.cx + circ.P.x) / 2" :y="CIRC.cy + 18" text-anchor="middle">cos = {{ cosA.toFixed(3) }}</text>
            <text v-if="focus === 'all' || focus === 'sin'" class="uclbl s" :x="circ.P.x + (circ.sinv >= 0 ? 10 : -10)" :y="(CIRC.cy + circ.P.y) / 2 + 4" :text-anchor="circ.sinv >= 0 ? 'start' : 'end'">sin = {{ sinA.toFixed(3) }}</text>

            <!-- 波形：按当前 focus 画 sin / cos / tan 曲线 -->
            <g v-if="showWave">
              <line v-for="(ax, i) in circ.asym" :key="'ay' + i" class="asymline" :x1="ax" :y1="CIRC.cy - 240" :x2="ax" :y2="CIRC.cy + 240" />
              <polyline v-for="(pts, i) in circ.waveLines" :key="'wv' + i" class="wavepath" :points="pts.join(' ')" />
              <line class="wavelink" :x1="circ.linkFrom.x" :y1="circ.linkFrom.y" :x2="CIRC.wx" :y2="circ.waveStartY" />
              <text class="wavelbl" :x="CIRC.wx + CIRC.ww / 2" :y="CIRC.cy - CIRC.r - 16" text-anchor="middle">{{ circ.waveLabel }}</text>
            </g>

            <!-- 圆心、旋转点 -->
            <circle class="opoint" :cx="CIRC.cx" :cy="CIRC.cy" r="5" />
            <text class="olbl" :x="CIRC.cx - 18" :y="CIRC.cy + 20">O</text>
            <circle class="dragp" :cx="circ.P.x" :cy="circ.P.y" r="10" @pointerdown.prevent="dragP" />
          </g>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': viewMode === 'triangle' }" @click="setView('triangle')">直角三角形</button>
        <button class="btn" :class="{ 'btn-primary': viewMode === 'circle' }" @click="setView('circle')">单位圆动画</button>
        <template v-if="viewMode === 'circle'">
          <button
            v-for="fc in FOCI" :key="fc.id"
            class="btn" :class="{ 'btn-primary': focus === fc.id }"
            @click="focus = fc.id"
          >{{ fc.label }}</button>
          <button class="btn" @click="showWave = !showWave">{{ showWave ? '隐藏波形' : '显示波形' }}</button>
          <button class="btn btn-primary" @click="togglePlay">{{ playing ? '⏸ 暂停' : '▶ 旋转' }}</button>
          <span class="feedback no">{{ focus === 'all' ? '三条线段同时在转，点上方按钮可单独看某一条' : '只看' + (FOCI.find(f => f.id === focus)?.label || '') + '：拖动 P 或点「旋转」观察它的变化' }}</span>
        </template>
        <template v-else>
          <button class="btn" @click="angleDeg = 30; touch()">30°</button>
          <button class="btn" @click="angleDeg = 45; touch()">45°</button>
          <button class="btn" @click="angleDeg = 60; touch()">60°</button>
          <span class="feedback no">拖动 C 点或滑块改变锐角，看三边比值如何变化；放大斜边比值不变</span>
        </template>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>实时联动</span></div>
        <div class="lab-params">
          <ParamSlider v-model="angleDeg" :min="viewMode === 'circle' ? 0 : 8" :max="viewMode === 'circle' ? 359 : 82" :step="1" :label="viewMode === 'circle' ? '角 θ' : '锐角 A'" unit="°" @update:model-value="touch" />
          <ParamSlider v-if="viewMode === 'triangle'" v-model="hyp" :min="6" :max="12" :step="0.5" label="斜边 c" @update:model-value="touch" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>特殊角对照</strong><span>必背</span></div>
        <table class="sp-table">
          <thead><tr><th>角</th><th>sin</th><th>cos</th><th>tan</th></tr></thead>
          <tbody>
            <tr v-for="r in specialTable" :key="r.deg" :class="{ on: angleDeg + '°' === r.deg }">
              <td>{{ r.deg }}</td><td>{{ r.sin }}</td><td>{{ r.cos }}</td><td>{{ r.tan }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <FormulaPanel
        title="锐角三角函数"
        formula="sinA = a/c　cosA = b/c　tanA = a/b"
        desc="锐角三角函数只与角的大小有关：边长整体放大缩小，比值不变。0°~90° 内 sinA、tanA 随角增大而增大，cosA 随角增大而减小。"
        :rows="rows"
        :result="results"
        :verify="[
          '对边：角 A 对面的一条直角边；邻边：与角 A 相邻的直角边',
          '互余关系：sinA = cos(90°−A)，tan45°=1 是分界',
          'sin30° = 1/2 ⇒ 30° 角的对边是斜边的一半',
          '解直角三角形：知两边或一边一角，选含未知量的比值式'
        ]"
      />
    </aside>
  </div>
</template>

<style scoped>
.tg-panel { background: transparent; }
.tg-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.ground { stroke: var(--bb-fg-dim); stroke-width: 1.4; opacity: 0.5; }
.tri { fill: rgba(184, 121, 21, 0.22); stroke: var(--bb-amber); stroke-width: 3.5; stroke-linejoin: round; }
.rmark { fill: none; stroke: var(--bb-fg-dim); stroke-width: 1.6; }
.arc { fill: none; stroke: var(--bb-red); stroke-width: 2.4; }
.albl { fill: var(--bb-red); font-size: 17px; font-weight: 900; font-family: var(--mono); }
.edge { font-size: 16px; font-weight: 800; font-family: var(--mono); }
.e-a { fill: var(--bb-green); }
.e-b { fill: var(--bb-blue); }
.e-c { fill: var(--bb-red); }
.dot { fill: var(--bb-fg); }
.dot-c { fill: var(--bb-amber); stroke: var(--bb-fg); stroke-width: 2; cursor: grab; }
.vtx { fill: var(--bb-fg); font-size: 16px; font-weight: 900; font-family: var(--mono); pointer-events: none; }
.ratio text { fill: var(--bb-fg); font-size: 19px; font-weight: 800; font-family: var(--mono); }
.special { fill: var(--bb-green); font-size: 15px; font-weight: 700; }
.sp-table {
  width: 100%; border-collapse: collapse; font-size: 13.5px;
  font-family: var(--mono); text-align: center;
}
.sp-table th, .sp-table td { padding: 6px 4px; border-bottom: 1px solid var(--line); }
.sp-table th { color: var(--text-dim); font-size: 12px; }
.sp-table tr.on td { background: var(--accent-soft); font-weight: 900; color: var(--accent-strong); }

/* ===== 单位圆动画 ===== */
.uc-axis { stroke: var(--bb-fg-dim); stroke-width: 1.4; opacity: 0.6; }
.uc-circle { fill: none; stroke: var(--bb-fg); stroke-width: 2.6; }
.tanline { stroke: var(--bb-fg-dim); stroke-width: 1.2; stroke-dasharray: 6 6; opacity: 0.6; }
.uc-arc { fill: none; stroke: var(--bb-red); stroke-width: 2.4; }
.uc-deg { fill: var(--bb-red); font-size: 16px; font-weight: 900; font-family: var(--mono); }
.seg-sin { stroke: var(--bb-red); stroke-width: 4.5; stroke-linecap: round; }
.seg-cos { stroke: var(--bb-blue); stroke-width: 4.5; stroke-linecap: round; }
.seg-tan { stroke: var(--bb-green); stroke-width: 4.5; stroke-linecap: round; }
.seg-sin.solo, .seg-cos.solo, .seg-tan.solo { stroke-width: 7; filter: drop-shadow(0 0 3px rgba(0,0,0,0.18)); }
.radius-line { stroke: var(--bb-fg-dim); stroke-width: 1.6; stroke-dasharray: 5 5; }
.uclbl { font-size: 14.5px; font-weight: 900; font-family: var(--mono); pointer-events: none; }
.uclbl.s { fill: var(--bb-red); }
.uclbl.c { fill: var(--bb-blue); }
.uclbl.t { fill: var(--bb-green); }
.wavepath { fill: none; stroke: var(--bb-amber); stroke-width: 3; stroke-linejoin: round; }
.wavelink { stroke: var(--bb-fg-dim); stroke-width: 1.2; stroke-dasharray: 4 5; opacity: 0.7; }
.wavelbl { fill: var(--bb-amber); font-size: 13.5px; font-weight: 800; }
.asymline { stroke: var(--bb-fg-dim); stroke-width: 1.2; stroke-dasharray: 5 5; opacity: 0.65; }
.opoint { fill: var(--bb-fg); }
.olbl { fill: var(--bb-fg); font-size: 15px; font-weight: 900; font-family: var(--mono); }
.dragp { fill: var(--bb-blue); stroke: #fff; stroke-width: 2.5; cursor: grab; }
</style>
