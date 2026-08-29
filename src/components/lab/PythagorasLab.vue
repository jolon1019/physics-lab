<script setup>
import { computed, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560，直角三角形 + 三个正方形（赵爽弦图式拼合）===== */
const VW = 900, VH = 560

const a = ref(3) // 竖直边
const b = ref(4) // 水平边
const showGrid = ref(true)
const anim = ref(false)

/* 三角形顶点 + 三个正方形：先算数学坐标，再自动缩放居中到画布 */
const geo = computed(() => {
  const av = a.value, bv = b.value
  const c2 = av * av + bv * bv
  const c = Math.sqrt(c2)
  // 数学坐标（y 向上）：直角顶点在原点
  const P = { x: 0, y: 0 }
  const Q = { x: bv, y: 0 }
  const R = { x: 0, y: av }
  const sqA = [P, R, { x: -av, y: av }, { x: -av, y: 0 }]
  const sqB = [P, Q, { x: bv, y: -bv }, { x: 0, y: -bv }]
  // c² 向外（远离三角形一侧）：垂直于 Q→R 且背离原点
  const nx = av, ny = bv
  const sqC = [Q, R, { x: R.x + nx, y: R.y + ny }, { x: Q.x + nx, y: Q.y + ny }]
  const all = [...sqA, ...sqB, ...sqC]
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const pad = 46
  const s = Math.min((VW - pad * 2) / (maxX - minX), (VH - pad * 2) / (maxY - minY))
  const cxm = (minX + maxX) / 2, cym = (minY + maxY) / 2
  const T = (p) => ({ x: VW / 2 + (p.x - cxm) * s, y: VH / 2 - (p.y - cym) * s })
  const M = (pts) => pts.map(T)
  const ctr = (pts) => ({ x: (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4, y: (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4 })
  return {
    P: T(P), Q: T(Q), R: T(R), c, c2, scale: s,
    sqA: M(sqA), sqB: M(sqB), sqC: M(sqC),
    cA: ctr(M(sqA)), cB: ctr(M(sqB)), cC: ctr(M(sqC)),
    aU: av * s, bU: bv * s
  }
})

const poly = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ')

/* ===== 割补验证：把 a²、b² 切成 4+1 块拼进 c²（赵爽弦图）=====
   弦图：c² 正方形内放 4 个直角三角形（a,b,c），中间空出 (b−a)² 小正方形
   a² + b² = 4·(½ab) + (b−a)² = 2ab + b² − 2ab + a² ✓
   这里用读数直接展示该恒等式，并用弦图叠加在 c² 上演示 */
const xian = computed(() => {
  const S = geo.value.sqC // c² 的四角（循环序）
  const c = geo.value.c
  const cx = (S[0].x + S[1].x + S[2].x + S[3].x) / 4
  const cy = (S[0].y + S[1].y + S[2].y + S[3].y) / 4
  // 每边上的直角顶点 X：X = Si + (a²/c)·u + (ab/c)·n（n 指向正方形中心）
  const xs = S.map((s, i) => {
    const s2 = S[(i + 1) % 4]
    const ux = (s2.x - s.x) / c, uy = (s2.y - s.y) / c
    let nx = -(uy), ny = ux
    if ((cx - (s.x + s2.x) / 2) * nx + (cy - (s.y + s2.y) / 2) * ny < 0) { nx = -nx; ny = -ny }
    return {
      x: s.x + (a.value * a.value / c) * ux + (a.value * b.value / c) * nx,
      y: s.y + (a.value * a.value / c) * uy + (a.value * b.value / c) * ny
    }
  })
  return {
    tris: [0, 1, 2, 3].map((i) => poly([S[i], S[(i + 1) % 4], xs[i]])),
    hole: poly(xs)
  }
})

/* ===== 读数 ===== */
const rows = computed(() => [
  { label: '直角边 a', value: fmt(a.value) },
  { label: '直角边 b', value: fmt(b.value) },
  { label: '斜边 c = √(a²+b²)', value: geo.value.c.toFixed(3) },
  { label: 'a²（蓝方格数）', value: fmt(a.value * a.value) },
  { label: 'b²（绿方格数）', value: fmt(b.value * b.value) },
  { label: 'c²（红方格数）', value: fmt(geo.value.c2) }
])
const results = computed(() => [
  { label: 'a² + b²', value: fmt(a.value * a.value + b.value * b.value) },
  { label: 'c²', value: fmt(geo.value.c2) },
  { label: '验证', value: Math.abs(a.value * a.value + b.value * b.value - geo.value.c2) < 1e-9 ? 'a² + b² = c² ✓' : '误差' }
])
const fmt = (n) => (Math.round(n * 1000) / 1000).toString()

/* ===== 完成条件：改过 a、b 且展开过弦图 ===== */
let touched = false, opened = false, done = false
function onSlider() { touched = true; checkDone() }
function toggleXian() {
  anim.value = !anim.value
  if (anim.value) opened = true
  checkDone()
}
function checkDone() {
  if (done || !touched || !opened) return
  done = true
  emit('complete')
}

/* 网格线（仅在正方形内画单位格，帮助数格子）*/
function unitLines(sq, n) {
  const lines = []
  for (let i = 1; i < Math.round(n); i++) {
    const k = i / n
    const t = (p, q) => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k })
    lines.push([t(sq[0], sq[1]), t(sq[3], sq[2])])
    lines.push([t(sq[0], sq[3]), t(sq[1], sq[2])])
  }
  return lines
}
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel py-panel" style="padding: 0">
        <svg class="py-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="勾股定理：面积拼合演示">
          <!-- 三个正方形 -->
          <polygon class="sq sq-a" :points="poly(geo.sqA)" />
          <polygon class="sq sq-b" :points="poly(geo.sqB)" />
          <polygon class="sq sq-c" :points="poly(geo.sqC)" />

          <!-- 单位格（数格子验证面积） -->
          <g v-if="showGrid" class="cells">
            <line v-for="(l, i) in unitLines(geo.sqA, a)" :key="'ga'+i" :x1="l[0].x" :y1="l[0].y" :x2="l[1].x" :y2="l[1].y" />
            <line v-for="(l, i) in unitLines(geo.sqB, b)" :key="'gb'+i" :x1="l[0].x" :y1="l[0].y" :x2="l[1].x" :y2="l[1].y" />
          </g>

          <!-- 赵爽弦图：c² 内的 4 三角形 + 中心小正方形 -->
          <g v-if="anim" class="xian">
            <polygon v-for="(p, i) in xian.tris" :key="'x'+i" :points="p" />
            <polygon class="xian-hole" :points="xian.hole" />
          </g>

          <!-- 直角三角形 -->
          <polygon class="rt" :points="poly([geo.P, geo.Q, geo.R])" />
          <path class="right-mark" :d="`M ${geo.P.x + 14} ${geo.P.y} L ${geo.P.x + 14} ${geo.P.y - 14} L ${geo.P.x} ${geo.P.y - 14}`" />

          <!-- 边长标签 -->
          <text class="lbl lbl-a" :x="geo.P.x - 10" :y="(geo.P.y + geo.R.y) / 2" text-anchor="end">a = {{ fmt(a) }}</text>
          <text class="lbl lbl-b" :x="(geo.P.x + geo.Q.x) / 2 - 16" :y="geo.P.y - 8">b = {{ fmt(b) }}</text>
          <text class="lbl lbl-c" :x="(geo.Q.x + geo.R.x) / 2 + 12" :y="(geo.Q.y + geo.R.y) / 2">c = {{ geo.c.toFixed(2) }}</text>

          <!-- 面积标签 -->
          <text class="area lbl-a" :x="geo.cA.x" :y="geo.cA.y + 6" text-anchor="middle">a² = {{ fmt(a * a) }}</text>
          <text class="area lbl-b" :x="geo.cB.x" :y="geo.cB.y + 6" text-anchor="middle">b² = {{ fmt(b * b) }}</text>
          <text class="area lbl-c" :x="geo.cC.x" :y="geo.cC.y + 6" text-anchor="middle">c² = {{ fmt(geo.c2) }}</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': anim }" @click="toggleXian">{{ anim ? '收起弦图' : '展开弦图割补' }}</button>
        <button class="btn" @click="showGrid = !showGrid">{{ showGrid ? '隐藏方格' : '显示方格' }}</button>
        <span class="feedback no">{{ anim ? 'c² = 4 个直角三角形 + 中间小正方形 = 2ab + (b−a)² = a² + b²' : '拖动滑块改变 a、b；点「展开弦图割补」看 c² 如何被 a、b 的三角形铺满' }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>直角边</strong><span>数格子看面积</span></div>
        <ParamSlider v-model="a" :min="2" :max="6" :step="0.5" label="竖直边 a" unit="" @update:model-value="onSlider" />
        <ParamSlider v-model="b" :min="2" :max="7" :step="0.5" label="水平边 b" unit="" @update:model-value="onSlider" />
      </div>

      <FormulaPanel title="勾股定理" formula="a² + b² = c²" :rows="rows" :result="results"
        :verify="['蓝正方形面积 + 绿正方形面积 = 红正方形面积', '弦图：c² 铺 4 个 (a,b,c) 三角形，中间恰好空出 (b−a)²', '2ab + (b−a)² = a² + b²，与 c² 完全吻合', '逆定理同样成立：三边满足 a²+b²=c² ⇒ 必为直角三角形']" />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>八年级下册·勾股定理</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          直角三角形<b>两直角边的平方和等于斜边的平方</b>。<br />
          · 数格子：a²、b² 的正方形面积「搬」进 c²，面积守恒即定理成立。<br />
          · <b>赵爽弦图</b>（我国古代证明）：大正方形 c² = 4 个三角形 + 小正方形 (b−a)²。<br />
          · 常见勾股数：3-4-5、5-12-13、6-8-10、7-24-25、8-15-17。<br />
          · <b>逆定理</b>用来判定直角：算三边平方，看两小和是否等于最大。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.py-panel { background: transparent; }
.py-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto;
  max-height: 100%; /* 桌面端 .lab-left 行高固定：超高时等比缩小而非被裁切 */
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.sq { stroke-width: 2.5; }
.sq-a { fill: rgba(20, 95, 210, 0.20); stroke: var(--bb-blue); }
.sq-b { fill: rgba(13, 155, 97, 0.20); stroke: var(--bb-green); }
.sq-c { fill: rgba(217, 33, 53, 0.16); stroke: var(--bb-red); }
.cells line { stroke: var(--bb-fg-dim); stroke-width: 0.8; opacity: 0.45; }
.rt { fill: rgba(184, 121, 21, 0.30); stroke: var(--bb-amber); stroke-width: 3.5; }
.right-mark { fill: none; stroke: var(--bb-fg-dim); stroke-width: 1.6; }
.xian polygon { fill: rgba(184, 121, 21, 0.28); stroke: var(--bb-amber); stroke-width: 1.8; }
.xian .xian-hole { fill: rgba(124, 58, 237, 0.30); stroke: var(--bb-purple); stroke-width: 1.8; }
.lbl { font-size: 15px; font-weight: 800; font-family: var(--mono); pointer-events: none; }
.lbl-a { fill: var(--bb-blue); }
.lbl-b { fill: var(--bb-green); }
.lbl-c { fill: var(--bb-red); }
.area { font-size: 16px; font-weight: 900; }
</style>
