<script setup>
import { computed, ref } from 'vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'
import { svgPoint } from '../../lib/svgCoord'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560，坐标系 x,y ∈ [-6,6] ===== */
const VW = 900, VH = 560
const R = 6
const X = (x) => VW / 2 + (x * (VW / 2 - 60)) / R
const Y = (y) => VH / 2 - (y * (VH / 2 - 50)) / R
const invX = (sx) => Math.round(((sx - VW / 2) * R) / (VW / 2 - 60))
const invY = (sy) => Math.round(((VH / 2 - sy) * R) / (VH / 2 - 50))

const gridX = []
for (let x = -R; x <= R; x++) gridX.push(x)
const gridY = []
for (let y = -R; y <= R; y++) gridY.push(y)
const ticksX = gridX.filter((x) => x !== 0)
const ticksY = gridY.filter((y) => y !== 0)

/* 挑战状态 */
const target = ref(null)      // {x, y}
const state = ref('idle')     // idle | wrong
const wrongAt = ref(null)     // 答错时展示的正确位置
const score = ref(0)
const streakWrong = ref(0)
const lastMsg = ref('点击「开始挑战」出第一题')
const done = ref(false)

function quadName(x, y) {
  if (x === 0 && y === 0) return '原点'
  if (x === 0) return 'y 轴上'
  if (y === 0) return 'x 轴上'
  if (x > 0 && y > 0) return '第一象限'
  if (x < 0 && y > 0) return '第二象限'
  if (x < 0 && y < 0) return '第三象限'
  return '第四象限'
}

function newTarget() {
  let x, y
  do {
    x = Math.floor(Math.random() * (2 * R + 1)) - R
    y = Math.floor(Math.random() * (2 * R + 1)) - R
  } while (target.value && x === target.value.x && y === target.value.y)
  target.value = { x, y }
  state.value = 'ask'
  wrongAt.value = null
  lastMsg.value = `请在网格上点击点 (${x}, ${y}) —— 先横后纵`
}

function onGridClick(e) {
  if (!target.value) return
  const svg = e.currentTarget.closest('svg')
  const p = svgPoint(svg, e.clientX, e.clientY)
  const gx = invX(p.x)
  const gy = invY(p.y)
  const t = target.value
  if (gx === t.x && gy === t.y) {
    score.value++
    state.value = 'idle'
    lastMsg.value = `✓ 正确！(${t.x}, ${t.y}) 在${quadName(t.x, t.y)}`
    target.value = null
    if (!done.value && score.value >= 5) {
      done.value = true
      emit('complete')
    }
    setTimeout(() => { if (!done.value || score.value < 5) newTarget() }, 900)
  } else {
    state.value = 'wrong'
    wrongAt.value = { gx, gy }
    lastMsg.value = `✗ 你点到 (${gx}, ${gy})。正确位置已用绿色标出——${quadName(t.x, t.y)}`
    setTimeout(() => { wrongAt.value = null }, 1600)
  }
}

/* 悬停坐标提示 */
const hover = ref(null)
function onMove(e) {
  const svg = e.currentTarget.closest('svg')
  const p = svgPoint(svg, e.clientX, e.clientY)
  hover.value = { x: invX(p.x), y: invY(p.y) }
}

const rows = computed(() => [
  { label: '得分（连对）', value: `${score.value} / 5` },
  { label: '悬停位置', value: hover.value ? `(${hover.value.x}, ${hover.value.y})` : '—' },
  { label: '悬停区域', value: hover.value ? quadName(hover.value.x, hover.value.y) : '—' }
])
const results = computed(() => [
  { label: '口诀', value: '先横后纵：先沿 x 轴，再沿 y 方向' },
  { label: '象限符号', value: '一(+,+) 二(−,+) 三(−,−) 四(+,−)' }
])
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel cp-panel" style="padding: 0">
        <svg class="cp-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="平面直角坐标系描点挑战" @click="onGridClick" @pointermove="onMove">
          <!-- 网格 -->
          <g class="grid">
            <line v-for="x in gridX" :key="'gx'+x" :x1="X(x)" :y1="Y(-R)" :x2="X(x)" :y2="Y(R)" />
            <line v-for="y in gridY" :key="'gy'+y" :x1="X(-R)" :y1="Y(y)" :x2="X(R)" :y2="Y(y)" />
          </g>
          <!-- 象限水印 -->
          <text class="quad q1" :x="X(3)" :y="Y(3)">Ⅰ</text>
          <text class="quad q2" :x="X(-3)" :y="Y(3)">Ⅱ</text>
          <text class="quad q3" :x="X(-3)" :y="Y(-3)">Ⅲ</text>
          <text class="quad q4" :x="X(3)" :y="Y(-3)">Ⅳ</text>
          <!-- 坐标轴 -->
          <g class="axis">
            <line :x1="X(-R)" :y1="Y(0)" :x2="X(R)" :y2="Y(0)" />
            <line :x1="X(0)" :y1="Y(-R)" :x2="X(0)" :y2="Y(R)" />
            <text v-for="x in ticksX" :key="'tx'+x" :x="X(x)" :y="Y(0)+16" text-anchor="middle">{{ x }}</text>
            <text v-for="y in ticksY" :key="'ty'+y" :x="X(0)-8" :y="Y(y)+4" text-anchor="end">{{ y }}</text>
            <circle :cx="X(0)" :cy="Y(0)" r="4" />
            <text class="o" :x="X(0)-14" :y="Y(0)+18">O</text>
          </g>

          <!-- 悬停十字 -->
          <g v-if="hover && target">
            <circle class="hover" :cx="X(hover.x)" :cy="Y(hover.y)" r="6" />
          </g>

          <!-- 答错提示：用户点错的位置 + 正确位置 -->
          <g v-if="wrongAt">
            <circle class="wrong" :cx="X(wrongAt.gx)" :cy="Y(wrongAt.gy)" r="8" />
            <circle class="right" :cx="X(target.x)" :cy="Y(target.y)" r="9" />
            <text class="right-t" :x="X(target.x) + 14" :y="Y(target.y) - 10">正确：({{ target.x }}, {{ target.y }})</text>
          </g>
        </svg>
      </div>

      <!-- 题目横幅：紧贴动画下方，醒目展示当前要找的坐标 -->
      <div class="question-banner" :class="{ solved: done }">
        <template v-if="target">
          <span class="qb-label">当前题目</span>
          <span class="qb-target">请在网格上点击点 <b>({{ target.x }}, {{ target.y }})</b></span>
          <span class="qb-hint">先沿 x 轴找 {{ target.x }}，再沿 y 方向找 {{ target.y }} · {{ quadName(target.x, target.y) }}</span>
        </template>
        <template v-else>
          <span class="qb-target qb-idle">{{ done ? '挑战完成！连对 5 题' : '点「开始挑战」出第一题' }}</span>
        </template>
      </div>

      <div class="lab-actions">
        <button v-if="!target && !done" class="btn btn-primary" @click="newTarget()">开始挑战</button>
        <button v-if="target" class="btn" @click="newTarget()">换一题</button>
        <span class="feedback" :class="state === 'wrong' ? 'no' : 'ok'">{{ lastMsg }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>挑战进度</strong><span>连对 5 题完成</span></div>
        <div class="lab-readout">
          <div class="lab-stat"><span>得分</span><strong>{{ score }} / 5</strong></div>
          <div class="lab-stat success"><span>悬停区域</span><strong style="font-size:13px">{{ hover ? quadName(hover.x, hover.y) : '—' }}</strong></div>
        </div>
      </div>

      <FormulaPanel
        title="平面直角坐标系"
        formula="点 P(x, y)　先横后纵"
        desc="x 轴与 y 轴把平面分成四个象限：一(+,+)、二(−,+)、三(−,−)、四(+,−)，逆时针排列。坐标轴上的点不属于任何象限。点到 x 轴的距离 = |y|，到 y 轴的距离 = |x|。"
        :rows="rows"
        :result="results"
        :verify="[
          '有序数对：(2,3) ≠ (3,2)，顺序不能颠倒',
          '原点 O(0,0)：两轴交点，负方向与正方向相反',
          '平移规律：点 (x,y) 向右平移 a 得 (x+a, y)，向上平移 b 得 (x, y+b)',
          '对称：关于 x 轴对称 (x,−y)；关于 y 轴对称 (−x,y)；关于原点对称 (−x,−y)'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>七年级·坐标系</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          坐标系是<b>数与形结合的桥梁</b>，函数图像全靠它。<br />
          · 找点口诀：<b>先横后纵</b>，正负定方向。<br />
          · 象限按逆时针 Ⅰ→Ⅱ→Ⅲ→Ⅳ 排列。<br />
          · 会用坐标描述位置、平移与对称。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.cp-panel { background: transparent; }
/* 题目横幅：动画正下方，大字号高对比 */
.question-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin: 0;
  padding: 14px 20px;
  border-top: 2px solid var(--line);
  background: var(--accent-soft, #ffe9a8);
}
.qb-label {
  font-size: 15px;
  font-weight: 900;
  color: var(--accent-strong, #b8860b);
  white-space: nowrap;
}
.qb-target {
  font-size: 22px;
  font-weight: 900;
  color: var(--text-h, #111);
  font-family: var(--mono, monospace);
}
.qb-target b { font-size: 26px; color: var(--accent-strong, #b8860b); }
.qb-hint { font-size: 13px; color: var(--text-2, #666); margin-left: auto; }
.qb-idle { color: var(--text-2, #666); font-family: inherit; font-size: 17px; }
.question-banner.solved { background: #e8f8ef; }
.question-banner.solved .qb-target { color: #27ae60; }
.cp-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none; cursor: crosshair;
}
.grid line { stroke: var(--bb-fg-dim); stroke-width: 0.6; opacity: 0.3; }
.axis line { stroke: var(--bb-fg); stroke-width: 2; }
.axis text { fill: var(--bb-fg-dim); font-size: 12px; font-family: var(--mono); }
.axis .o { fill: var(--bb-fg); font-weight: 900; }
.quad { font-size: 40px; font-weight: 900; opacity: 0.18; text-anchor: middle; font-family: var(--mono); }
.q1, .q3 { fill: var(--bb-blue); }
.q2, .q4 { fill: var(--bb-green); }
.hover { fill: none; stroke: var(--bb-amber); stroke-width: 2; }
.wrong { fill: none; stroke: var(--bb-red); stroke-width: 3; }
.right { fill: var(--bb-green); stroke: #fff; stroke-width: 2.5; }
.right-t { fill: var(--bb-green); font-size: 15px; font-weight: 800; font-family: var(--mono); }
</style>
