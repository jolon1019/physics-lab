<script setup>
import { computed, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ===== 画布：用面积拼合证明乘法公式 ===== */
const VW = 900, VH = 520, U = 46

const mode = ref('square-sum') // square-sum | square-diff | diff-sq
const hint = ref('拖动 a、b 滑块：左边大正方形的各块面积之和 = 右边的公式展开')

const a = ref(5)
const b = ref(2)
const fmt = (n) => (Math.round(n * 100) / 100).toString()

/* ===== 三种图形布局（返回带颜色分块的多边形）===== */
const layout = computed(() => {
  const av = a.value, bv = b.value
  const A = av * U, B = bv * U
  const ox = 60, oy = VH - 60 // 左下角
  if (mode.value === 'square-sum') {
    // (a+b)² = a² + 2ab + b²
    const s = A + B
    return {
      blocks: [
        { pts: [[ox, oy - A], [ox + A, oy - A], [ox + A, oy], [ox, oy]], cls: 'k-a', txt: `a² = ${fmt(av * av)}`, short: 'a²', tx: ox + A / 2, ty: oy - A / 2 + 6 },
        { pts: [[ox + A, oy - s], [ox + s, oy - s], [ox + s, oy - A], [ox + A, oy - A]], cls: 'k-b', txt: `b² = ${fmt(bv * bv)}`, short: 'b²', tx: ox + A + B / 2, ty: oy - A - B / 2 + 6 },
        { pts: [[ox, oy - s], [ox + A, oy - s], [ox + A, oy - A], [ox, oy - A]], cls: 'k-ab', txt: `ab = ${fmt(av * bv)}`, short: 'ab', tx: ox + A / 2, ty: oy - A - B / 2 + 6 },
        { pts: [[ox + A, oy - A], [ox + s, oy - A], [ox + s, oy], [ox + A, oy]], cls: 'k-ab', txt: `ab = ${fmt(av * bv)}`, short: 'ab', tx: ox + A + B / 2, ty: oy - A / 2 + 6 }
      ],
      outline: [[ox, oy], [ox + s, oy], [ox + s, oy - s], [ox, oy - s]],
      dims: [
        { x1: ox, y1: oy + 30, x2: ox + A, y2: oy + 30, label: 'a', cls: 'dim-a' },
        { x1: ox + A, y1: oy + 30, x2: ox + s, y2: oy + 30, label: 'b', cls: 'dim-b' },
        { x1: ox + s + 30, y1: oy - A, x2: ox + s + 30, y2: oy, label: 'a', cls: 'dim-a', vertical: true },
        { x1: ox + s + 30, y1: oy - s, x2: ox + s + 30, y2: oy - A, label: 'b', cls: 'dim-b', vertical: true }
      ],
      dim: `大正方形边长 a + b = ${fmt(av + bv)}，面积 = ${fmt((av + bv) ** 2)}`,
      total: (av + bv) ** 2
    }
  }
  if (mode.value === 'square-diff') {
    // (a−b)² = a² − 2ab + b²：a² 中减去两条 a×b 长条，重叠的 b² 角被多减一次
    const d = A - B
    return {
      blocks: [
        { pts: [[ox, oy - d], [ox + d, oy - d], [ox + d, oy], [ox, oy]], cls: 'k-d', txt: `(a−b)² = ${fmt((av - bv) ** 2)}`, short: '(a−b)²', tx: ox + d / 2, ty: oy - d / 2 + 6 },
        { pts: [[ox + d, oy], [ox + A, oy], [ox + A, oy - d], [ox + d, oy - d]], cls: 'k-ab', txt: `ab = ${fmt(av * bv)}`, short: 'ab', tx: ox + d + B / 2, ty: oy - d / 2 + 6 },
        { pts: [[ox, oy - d], [ox + d, oy - d], [ox + d, oy - A], [ox, oy - A]], cls: 'k-ab', txt: `ab = ${fmt(av * bv)}`, short: 'ab', tx: ox + d / 2, ty: oy - d - B / 2 + 6 },
        { pts: [[ox + d, oy - d], [ox + A, oy - d], [ox + A, oy - A], [ox + d, oy - A]], cls: 'k-b', txt: `b² 多减`, short: 'b²', tx: ox + d + B / 2, ty: oy - d - B / 2 + 6 }
      ],
      outline: [[ox, oy], [ox + A, oy], [ox + A, oy - A], [ox, oy - A]],
      dims: [
        { x1: ox - 30, y1: oy - A, x2: ox - 30, y2: oy, label: 'a', cls: 'dim-a', vertical: true },
        { x1: ox, y1: oy + 30, x2: ox + d, y2: oy + 30, label: 'a−b', cls: 'dim-d' },
        { x1: ox + d, y1: oy + 30, x2: ox + A, y2: oy + 30, label: 'b', cls: 'dim-b' },
        { x1: ox + A + 30, y1: oy - d, x2: ox + A + 30, y2: oy, label: 'a−b', cls: 'dim-d', vertical: true },
        { x1: ox + A + 30, y1: oy - A, x2: ox + A + 30, y2: oy - d, label: 'b', cls: 'dim-b', vertical: true }
      ],
      dim: `a² − 2ab + b² = ${fmt(av * av - 2 * av * bv + bv * bv)}（绿色 b² 角被两条 ab 重复减，需 +b² 补回）`,
      total: av ** 2
    }
  }
  // 平方差：a² − b² = (a+b)(a−b) —— 剪下 b² 角，剩余拼成长方形
  const UR = 30
  return {
    blocks: [
      { pts: [[ox, oy - A], [ox + A, oy - A], [ox + A, oy], [ox, oy]], cls: 'k-a', txt: `a² = ${fmt(av * av)}`, short: 'a²', tx: ox + A / 2 - B / 2, ty: oy - A / 2 + 6 },
      { pts: [[ox + (av - bv) * U, oy], [ox + A, oy], [ox + A, oy - B], [ox + (av - bv) * U, oy - B]], cls: 'k-cut', txt: `−b² = ${fmt(bv * bv)}`, short: '−b²', tx: ox + (av - bv) * U + B / 2, ty: oy - B / 2 + 6 }
    ],
    outline: [[ox, oy], [ox + A, oy], [ox + A, oy - A], [ox, oy - A]],
    dims: [
      { x1: ox, y1: oy + 30, x2: ox + A, y2: oy + 30, label: 'a', cls: 'dim-a' },
      { x1: ox + (av - bv) * U, y1: oy + 58, x2: ox + A, y2: oy + 58, label: 'b', cls: 'dim-b' },
      { x1: ox + A + 30, y1: oy - A, x2: ox + A + 30, y2: oy, label: 'a', cls: 'dim-a', vertical: true },
      { x1: ox + A + 58, y1: oy - B, x2: ox + A + 58, y2: oy, label: 'b', cls: 'dim-b', vertical: true }
    ],
    rect: { x: ox + A + 80, y: oy - (av + bv) * UR, w: (av + bv) * UR, h: (av - bv) * UR },
    dim: `剩余面积 = ${fmt(av * av - bv * bv)}`,
    total: av ** 2 - bv ** 2
  }
})

const polyStr = (pts) => pts.map((p) => p.join(',')).join(' ')

/* ===== 标注自适应：色块小的时候降级为短标签 / 隐藏，避免文字溢出重叠 ===== */
const dispBlocks = computed(() =>
  layout.value.blocks.map((blk) => {
    const xs = blk.pts.map((p) => p[0])
    const ys = blk.pts.map((p) => p[1])
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    const textW = (t) => [...t].reduce((s, ch) => s + (ch.charCodeAt(0) > 255 ? 13.5 : 8.2), 0)
    let txt = blk.txt
    let fs = 14
    if (w < textW(txt) + 14 || h < 36) {
      txt = blk.short || ''
      fs = 12.5
    }
    if (txt && (w < textW(txt) + 8 || h < 20)) txt = ''
    return { ...blk, txt, fs }
  })
)

/* ===== 公式与读数 ===== */
const FORMULAS = {
  'square-sum': { title: '完全平方和', f: '(a + b)² = a² + 2ab + b²' },
  'square-diff': { title: '完全平方差', f: '(a − b)² = a² − 2ab + b²' },
  'diff-sq': { title: '平方差', f: 'a² − b² = (a + b)(a − b)' }
}
const rows = computed(() => {
  const R = (x) => fmt(x)
  if (mode.value === 'square-sum')
    return [
      { label: 'a² + b²', value: R(a.value ** 2 + b.value ** 2) },
      { label: '2ab', value: R(2 * a.value * b.value) },
      { label: '四块合计', value: R(a.value ** 2 + 2 * a.value * b.value + b.value ** 2) }
    ]
  if (mode.value === 'square-diff')
    return [
      { label: 'a² + b²', value: R(a.value ** 2 + b.value ** 2) },
      { label: '2ab', value: R(2 * a.value * b.value) },
      { label: '(a−b)² 直接算', value: R((a.value - b.value) ** 2) }
    ]
  return [
    { label: 'a² − b²', value: R(a.value ** 2 - b.value ** 2) },
    { label: 'a + b', value: R(a.value + b.value) },
    { label: 'a − b', value: R(a.value - b.value) },
    { label: '(a+b)(a−b)', value: R((a.value + b.value) * (a.value - b.value)) }
  ]
})
const results = computed(() => [
  { label: '图形总面积', value: fmt(layout.value.total) },
  { label: '公式计算', value: fmt(
    mode.value === 'square-sum' ? (a.value + b.value) ** 2
      : mode.value === 'square-diff' ? a.value ** 2
      : a.value ** 2 - b.value ** 2
  ) }
])

/* ===== 完成条件 ===== */
const tried = new Set()
let changed = false, done = false
function pick(m) {
  mode.value = m
  tried.add(m)
  hint.value = m === 'square-sum'
    ? '拖动 a、b：大正方形被分成 a²、b² 和两个 ab 长条，四块之和就是 (a+b)²'
    : m === 'square-diff'
      ? '看左上角 (a−b)²：用 a² 减去两条 ab，右下角 b² 被多减了一次，要补回来'
      : '从 a² 里剪掉右下角 b²，剩下的两块可拼成 (a+b)×(a−b) 的长方形'
  checkDone()
}
function onSlider() { changed = true; checkDone() }
function checkDone() {
  if (done || !changed || tried.size < 3) return
  done = true
  emit('complete')
}
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel mf-panel" style="padding: 0">
        <svg class="mf-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="乘法公式的几何证明">
          <!-- 分块（标注随色块大小自适应） -->
          <g v-for="(blk, i) in dispBlocks" :key="'b' + i">
            <polygon :class="['blk', blk.cls]" :points="polyStr(blk.pts)" />
            <text v-if="blk.txt" class="blk-txt" :font-size="blk.fs" :x="blk.tx" :y="blk.ty" text-anchor="middle">{{ blk.txt }}</text>
          </g>

          <!-- 平方差：拼出的长方形 -->
          <g v-if="layout.rect">
            <rect class="mf-rect" :x="layout.rect.x" :y="layout.rect.y" :width="layout.rect.w" :height="layout.rect.h" />
            <text class="rect-txt" :x="layout.rect.x + layout.rect.w / 2" :y="layout.rect.y + layout.rect.h / 2 - 6" text-anchor="middle">(a+b)(a−b)</text>
            <text class="rect-txt small" :x="layout.rect.x + layout.rect.w / 2" :y="layout.rect.y + layout.rect.h / 2 + 16" text-anchor="middle">= {{ fmt((a + b) * (a - b)) }}</text>
            <text class="dim" :x="layout.rect.x" :y="layout.rect.y - 10">宽 a+b = {{ fmt(a + b) }} · 高 a−b = {{ fmt(a - b) }}</text>
          </g>

          <!-- 外框与尺寸 -->
          <polygon class="outline" :points="polyStr(layout.outline)" />
          <!-- 外部尺寸标注：标明 a、b 各对应哪条线段 -->
          <g v-for="(d, i) in layout.dims" :key="'dm' + i" :class="['dimline', d.cls]">
            <line class="dim-main" :x1="d.x1" :y1="d.y1" :x2="d.x2" :y2="d.y2" />
            <template v-if="!d.vertical">
              <line :x1="d.x1" :y1="d.y1 - 5" :x2="d.x1" :y2="d.y1 + 5" />
              <line :x1="d.x2" :y1="d.y2 - 5" :x2="d.x2" :y2="d.y2 + 5" />
              <text :x="(d.x1 + d.x2) / 2" :y="d.y1 - 7" text-anchor="middle">{{ d.label }}</text>
            </template>
            <template v-else>
              <line :x1="d.x1 - 5" :y1="d.y1" :x2="d.x1 + 5" :y2="d.y1" />
              <line :x1="d.x2 - 5" :y1="d.y2" :x2="d.x2 + 5" :y2="d.y2" />
              <text :x="d.x1 + 9" :y="(d.y1 + d.y2) / 2 + 5" text-anchor="start">{{ d.label }}</text>
            </template>
          </g>
          <text class="dim" x="60" :y="VH - 6">{{ layout.dim }}</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': mode === 'square-sum' }" @click="pick('square-sum')">(a+b)²</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'square-diff' }" @click="pick('square-diff')">(a−b)²</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'diff-sq' }" @click="pick('diff-sq')">a²−b²</button>
        <span class="feedback no">{{ hint }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>边长</strong><span>拖动看面积恒等</span></div>
        <ParamSlider v-model="a" :min="4" :max="7" :step="0.5" label="a" unit="" @update:model-value="onSlider" />
        <ParamSlider v-model="b" :min="1" :max="3" :step="0.5" label="b" unit="" @update:model-value="onSlider" />
      </div>

      <FormulaPanel :title="'几何证明 · ' + FORMULAS[mode].title" :formula="FORMULAS[mode].f" :rows="rows" :result="results"
        :verify="['同一块面积用两种方法算，结果必相等 → 公式成立', '(a+b)²：a² + 2ab + b² 四块铺满大正方形', '(a−b)²：减两条 ab 时 b² 被多减，需补回 +b²', 'a²−b²：剪拼变成长方形，长 a+b、宽 a−b']" />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>八年级上册·整式乘法</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          乘法公式不用死记，<b>算两次同一块面积</b>就能推出来：<br />
          · <b>(a±b)² = a² ± 2ab + b²</b>：中间项 2ab 是两条长方形，最容易漏。<br />
          · <b>a² − b² = (a+b)(a−b)</b>：只有「平方减平方」才能这样分解，注意符号。<br />
          · 公式里 a、b 可以换成任意式子（整体思想），这是后续因式分解与简便计算的基础。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.mf-panel { background: transparent; }
.mf-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto;
  max-height: 100%; /* 桌面端 .lab-left 行高固定：超高时等比缩小而非被裁切 */
  aspect-ratio: 900 / 520;
  touch-action: pan-y; user-select: none;
}
.outline { fill: none; stroke: var(--bb-fg); stroke-width: 3; }
.blk { stroke: var(--bb-fg); stroke-width: 1.6; }
.k-a { fill: rgba(20, 95, 210, 0.22); }
.k-b { fill: rgba(13, 155, 97, 0.24); }
.k-ab { fill: rgba(184, 121, 21, 0.26); }
.k-d { fill: rgba(124, 58, 237, 0.24); }
.k-cut { fill: rgba(217, 33, 53, 0.30); stroke-dasharray: 7 5; }
.mf-rect { fill: rgba(13, 155, 97, 0.20); stroke: var(--bb-green); stroke-width: 2.6; }
.blk-txt { fill: var(--bb-fg); font-size: 14px; font-weight: 800; font-family: var(--mono); pointer-events: none; }
.rect-txt { fill: var(--bb-green); font-size: 16px; font-weight: 900; font-family: var(--mono); }
.rect-txt.small { font-size: 13px; }
.dim { fill: var(--bb-fg-dim); font-size: 13px; font-family: var(--mono); }
/* 外部尺寸标注线（a 蓝 / b 绿 / a−b 紫，与色块颜色对应） */
.dimline line { stroke-width: 1.6; }
.dim-a line { stroke: var(--bb-blue); }
.dim-b line { stroke: var(--bb-green); }
.dim-d line { stroke: var(--bb-purple); }
.dimline text { font-size: 16px; font-weight: 800; font-style: italic; font-family: var(--mono); }
.dim-a text { fill: var(--bb-blue); }
.dim-b text { fill: var(--bb-green); }
.dim-d text { fill: var(--bb-purple); }
</style>
