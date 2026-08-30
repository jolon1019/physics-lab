<script setup>
import { computed, reactive, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'
import { svgPoint } from '../../lib/svgCoord'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560 ===== */
const VW = 900, VH = 560

// 大三角形顶点 + 位似中心（全部可拖动）
const pts = reactive({ A: { x: 300, y: 150 }, B: { x: 150, y: 430 }, C: { x: 560, y: 430 }, O: { x: 730, y: 170 } })
const k = ref(0.6)

let touched = false, done = false
function touch() {
  touched = true
  if (!done) { done = true; emit('complete') }
}

/* 小三角形 = 以 O 为位似中心、比例 k 的像 */
const img = computed(() => ({
  A: { x: pts.O.x + (pts.A.x - pts.O.x) * k.value, y: pts.O.y + (pts.A.y - pts.O.y) * k.value },
  B: { x: pts.O.x + (pts.B.x - pts.O.x) * k.value, y: pts.O.y + (pts.B.y - pts.O.y) * k.value },
  C: { x: pts.O.x + (pts.C.x - pts.O.x) * k.value, y: pts.O.y + (pts.C.y - pts.O.y) * k.value }
}))

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y)
const area = (P, Q, R) => Math.abs(P.x * (Q.y - R.y) + Q.x * (R.y - P.y) + R.x * (P.y - Q.y)) / 2

const m = computed(() => {
  const { A, B, C } = pts
  const a = dist(B, C), b = dist(C, A), c = dist(A, B)
  const P = img.value
  const a2 = dist(P.B, P.C), b2 = dist(P.C, P.A), c2 = dist(P.A, P.B)
  return {
    a, b, c,
    a2, b2, c2,
    perim: a + b + c,
    perim2: a2 + b2 + c2,
    area: area(A, B, C),
    area2: area(P.A, P.B, P.C)
  }
})
const ratio = computed(() => (m.value.a ? m.value.a2 / m.value.a : 0))
const areaRatio = computed(() => (m.value.area ? m.value.area2 / m.value.area : 0))

/* ===== 拖动 ===== */
let dragging = null
const svgEl = ref(null)
function onDown(name, e) {
  e.preventDefault()
  dragging = name
  touch()
  const svg = svgEl.value
  const move = (ev) => {
    if (!dragging) return
    const p = svgPoint(svg, ev.clientX, ev.clientY)
    pts[dragging].x = Math.max(30, Math.min(VW - 30, Math.round(p.x)))
    pts[dragging].y = Math.max(30, Math.min(VH - 30, Math.round(p.y)))
  }
  const up = () => {
    dragging = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

const handles = [
  { name: 'A', p: () => pts.A, cls: 'h-a' },
  { name: 'B', p: () => pts.B, cls: 'h-b' },
  { name: 'C', p: () => pts.C, cls: 'h-c' },
  { name: 'O', p: () => pts.O, cls: 'h-o' }
]

const rows = computed(() => [
  { label: '相似比 k', value: k.value.toFixed(2) },
  { label: '大三角形边 a,b,c', value: `${m.value.a.toFixed(0)}, ${m.value.b.toFixed(0)}, ${m.value.c.toFixed(0)}` },
  { label: '小三角形边 a′,b′,c′', value: `${m.value.a2.toFixed(0)}, ${m.value.b2.toFixed(0)}, ${m.value.c2.toFixed(0)}` },
  { label: '对应边比 a′/a', value: ratio.value.toFixed(3) },
  { label: '周长比', value: `${m.value.perim2.toFixed(0)} / ${m.value.perim.toFixed(0)} = ${(m.value.perim2 / m.value.perim).toFixed(3)}` },
  { label: '面积比', value: `${areaRatio.value.toFixed(3)}（应为 k² = ${(k.value * k.value).toFixed(2)}）` }
])
const results = computed(() => [
  { label: '对应边比 = k', value: `k = ${k.value.toFixed(2)}，a′/a = ${ratio.value.toFixed(3)} ✓` },
  { label: '面积比 = k²', value: `${areaRatio.value.toFixed(3)} ≈ ${(k.value * k.value).toFixed(3)}` }
])
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel sm-panel" style="padding: 0">
        <svg ref="svgEl" class="sm-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="相似三角形：位似缩放">
          <!-- 位似连线（O 到各顶点，虚线延长） -->
          <g class="rays">
            <line v-for="h in handles.slice(0, 3)" :key="'r'+h.name"
              :x1="h.p().x" :y1="h.p().y" :x2="img[h.name].x" :y2="img[h.name].y" />
          </g>

          <!-- 大三角形 -->
          <polygon class="big" :points="`${pts.A.x},${pts.A.y} ${pts.B.x},${pts.B.y} ${pts.C.x},${pts.C.y}`" />
          <!-- 小三角形（像） -->
          <polygon class="small" :points="`${img.A.x},${img.A.y} ${img.B.x},${img.B.y} ${img.C.x},${img.C.y}`" />

          <!-- 边长标签（大） -->
          <text class="lbl" :x="(pts.B.x + pts.C.x) / 2" :y="pts.B.y + 24" text-anchor="middle">a = {{ m.a.toFixed(0) }}</text>
          <text class="lbl" :x="(pts.C.x + pts.A.x) / 2 + 12" :y="(pts.C.y + pts.A.y) / 2">b = {{ m.b.toFixed(0) }}</text>
          <text class="lbl" :x="(pts.A.x + pts.B.x) / 2 - 12" :y="(pts.A.y + pts.B.y) / 2" text-anchor="end">c = {{ m.c.toFixed(0) }}</text>
          <!-- 边长标签（小） -->
          <text class="lbl lbl2" :x="(img.B.x + img.C.x) / 2" :y="img.B.y + 20" text-anchor="middle">a′ = {{ m.a2.toFixed(0) }}</text>
          <text class="lbl lbl2" :x="(img.C.x + img.A.x) / 2 + 10" :y="(img.C.y + img.A.y) / 2">b′</text>
          <text class="lbl lbl2" :x="(img.A.x + img.B.x) / 2 - 10" :y="(img.A.y + img.B.y) / 2" text-anchor="end">c′</text>

          <!-- 顶点字母 -->
          <text class="vtx" :x="pts.A.x - 18" :y="pts.A.y - 6">A</text>
          <text class="vtx" :x="pts.B.x - 18" :y="pts.B.y + 20">B</text>
          <text class="vtx" :x="pts.C.x + 10" :y="pts.C.y + 20">C</text>
          <text class="vtx v2" :x="img.A.x + 10" :y="img.A.y - 6">A′</text>
          <text class="vtx v2" :x="img.B.x + 10" :y="img.B.y + 18">B′</text>
          <text class="vtx v2" :x="img.C.x - 20" :y="img.C.y + 18">C′</text>

          <!-- 可拖动手柄 -->
          <g v-for="h in handles" :key="h.name">
            <circle :class="['handle', h.cls]" :cx="h.p().x" :cy="h.p().y" r="11"
              @pointerdown.prevent="onDown(h.name, $event)" />
            <text class="hname" :x="h.p().x" :y="h.p().y + 4" text-anchor="middle" style="pointer-events:none">{{ h.name }}</text>
          </g>

          <!-- 说明 -->
          <text class="tip" x="40" y="40">拖动 A / B / C 改变形状 · 拖动 O 移动位似中心 · 滑块调 k</text>
          <text class="tip2" x="40" y="64">对应边比 = k = {{ k.toFixed(2) }}　面积比 = k² = {{ (k * k).toFixed(2) }}</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" @click="k = 0.5; touch()">k = 0.5</button>
        <button class="btn" @click="k = 1; touch()">k = 1（全等）</button>
        <button class="btn" @click="k = 1.5; touch()">k = 1.5</button>
        <span class="feedback no">注意面积比：k=2 时面积是 4 倍，不是 2 倍！</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>实时联动</span></div>
        <div class="lab-params">
          <ParamSlider v-model="k" :min="0.4" :max="2" :step="0.05" label="相似比 k" @update:model-value="touch" />
        </div>
      </div>

      <FormulaPanel
        title="相似三角形"
        formula="a′/a = b′/b = c′/c = k　面积比 = k²"
        desc="三边对应成比例、三角对应相等的两个三角形相似。周长比与一切对应线段（高、中线、角平分线）之比都等于 k；面积比等于 k²。位似是带缩放中心的相似。"
        :rows="rows"
        :result="results"
        :verify="[
          '判定：AA（两角）最常用；SAS 需夹角相等；SSS 需三边成比例',
          'k=1 时相似退化为全等——全等是相似的特例',
          '面积比 k² 的来历：面积 = 底 × 高 ÷2，两条线段各乘 k',
          '平行于一边的直线截三角形，截出的小三角形与原三角形相似（A 字型）'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>九年级·相似</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          相似三角形是<b>测量的数学</b>：影子测高、金字塔测地都是它。<br />
          · 记牢两级台阶：<b>边比 = k，面积比 = k²</b>。<br />
          · 常见模型：A 字型、8 字型、母子型、一线三等角。<br />
          · 位似变换可在平面直角坐标系中用坐标表达：x′ = kx（以原点为中心）。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.sm-panel { background: transparent; }
.sm-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.rays line { stroke: var(--bb-fg-dim); stroke-width: 1.2; stroke-dasharray: 4 5; opacity: 0.55; }
.big { fill: rgba(20, 95, 210, 0.18); stroke: var(--bb-blue); stroke-width: 3.5; stroke-linejoin: round; }
.small { fill: rgba(13, 155, 97, 0.20); stroke: var(--bb-green); stroke-width: 3; stroke-dasharray: 9 6; stroke-linejoin: round; }
.lbl { fill: var(--bb-blue); font-size: 16px; font-weight: 800; font-family: var(--mono); pointer-events: none; }
.lbl2 { fill: var(--bb-green); font-size: 14px; }
.vtx { fill: var(--bb-blue); font-size: 17px; font-weight: 900; font-family: var(--mono); pointer-events: none; }
.v2 { fill: var(--bb-green); }
.handle { stroke: #fff; stroke-width: 2.5; cursor: grab; }
.h-a, .h-b, .h-c { fill: var(--bb-blue); }
.h-o { fill: var(--bb-red); }
.hname { fill: #fff; font-size: 12px; font-weight: 900; font-family: var(--mono); }
.tip { fill: var(--bb-fg-dim); font-size: 14px; }
.tip2 { fill: var(--bb-fg); font-size: 16px; font-weight: 800; font-family: var(--mono); }
</style>
