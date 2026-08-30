<script setup>
import { computed, reactive, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560。底边 c 水平放置，两棍 a、b 从两端搭起 ===== */
const VW = 900, VH = 560

const side = reactive({ a: 3, b: 4, c: 7 }) // a 左棍 b 右棍 c 底边（自动把最长边放底部）

let tried = { fail: false, ok: false }
let done = false
function check() {
  const maxV = Math.max(side.a, side.b, side.c)
  if (side.a + side.b + side.c - maxV > maxV) {
    tried.ok = true   // 短两边之和 > 最长边
  } else {
    tried.fail = true
  }
  if (!done && tried.ok && tried.fail) {
    done = true
    emit('complete')
  }
}

/* 视觉：把最长边作为底边，另两边作为两棍 */
const geo = computed(() => {
  const { a, b, c } = side
  const arr = [
    { v: a, name: 'a' },
    { v: b, name: 'b' },
    { v: c, name: 'c' }
  ]
  const maxSide = arr.reduce((m, s) => (s.v > m.v ? s : m), arr[0])
  const others = arr.filter((s) => s !== maxSide)
  const base = maxSide.v
  const L1 = others[0].v, L2 = others[1].v
  const scale = Math.min(560 / Math.max(base, 1), 1) * 66
  const x1 = 170, x2 = x1 + base * scale
  const y0 = 430
  const canForm = L1 + L2 > base
  let apex = null
  let gapX = null
  if (canForm) {
    const d = ((base * base + L1 * L1 - L2 * L2) / (2 * base)) * scale
    const h2 = L1 * L1 * scale * scale - d * d
    apex = { x: x1 + d, y: y0 - Math.sqrt(Math.max(h2, 0)) }
  } else {
    // 搭不成：两棍以各自最大可行角度平搭，显示缺口
    gapX = { from: x1 + L1 * scale * 0.999, to: x2 - L2 * scale * 0.999 }
  }
  return {
    x1, x2, y0, scale, base, maxName: maxSide.name,
    L1, L2, l1Name: others[0].name, l2Name: others[1].name,
    canForm, apex, gapX,
    gap: Math.max(base - L1 - L2, 0)
  }
})

const inequalities = computed(() => [
  { text: `${side.a} + ${side.b} > ${side.c}`, ok: side.a + side.b > side.c },
  { text: `${side.a} + ${side.c} > ${side.b}`, ok: side.a + side.c > side.b },
  { text: `${side.b} + ${side.c} > ${side.a}`, ok: side.b + side.c > side.a }
])
const canForm = computed(() => inequalities.value.every((i) => i.ok))

const rows = computed(() => [
  { label: '三根木棍 a / b / c', value: `${side.a} / ${side.b} / ${side.c}` },
  { label: '能否围成三角形', value: canForm.value ? '能 ✓' : `不能（缺口 ${geo.value.gap.toFixed(0)}）` },
  { label: '不等式 1', value: `${inequalities.value[0].text} ${inequalities.value[0].ok ? '✓' : '✗'}` },
  { label: '不等式 2', value: `${inequalities.value[1].text} ${inequalities.value[1].ok ? '✓' : '✗'}` },
  { label: '不等式 3', value: `${inequalities.value[2].text} ${inequalities.value[2].ok ? '✓' : '✗'}` }
])
const results = computed(() => [
  { label: '判定捷径', value: '较短两边之和 > 最长边 ⇔ 能围成' },
  { label: '推论', value: '两边之差 < 第三边 < 两边之和' }
])
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel ts-panel" style="padding: 0">
        <svg class="ts-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="三角形三边关系">
          <!-- 底边（最长边） -->
          <line class="base-side" :x1="geo.x1" :y1="geo.y0" :x2="geo.x2" :y2="geo.y0" />
          <text class="lbl lbl-base" :x="(geo.x1 + geo.x2) / 2" :y="geo.y0 + 30" text-anchor="middle">{{ geo.maxName }} = {{ geo.base }}</text>
          <circle :cx="geo.x1" :cy="geo.y0" r="6" class="hinge" />
          <circle :cx="geo.x2" :cy="geo.y0" r="6" class="hinge" />

          <template v-if="geo.canForm">
            <!-- 两棍搭成三角形 -->
            <polygon class="tri-ok" :points="`${geo.x1},${geo.y0} ${geo.apex.x},${geo.apex.y} ${geo.x2},${geo.y0}`" />
            <text class="lbl lbl-l1" :x="(geo.x1 + geo.apex.x) / 2 - 12" :y="(geo.y0 + geo.apex.y) / 2" text-anchor="end">{{ geo.l1Name }} = {{ geo.L1 }}</text>
            <text class="lbl lbl-l2" :x="(geo.x2 + geo.apex.x) / 2 + 12" :y="(geo.y0 + geo.apex.y) / 2">{{ geo.l2Name }} = {{ geo.L2 }}</text>
            <text class="verdict ok" x="450" y="120" text-anchor="middle">✓ 能围成三角形：{{ geo.l1Name }} + {{ geo.l2Name }} > {{ geo.maxName }}</text>
          </template>
          <template v-else>
            <!-- 两棍平搭 + 缺口 -->
            <line class="stick" :x1="geo.x1" :y1="geo.y0" :x2="geo.gapX.from" :y2="geo.y0 - 8" />
            <line class="stick stick2" :x1="geo.x2" :y1="geo.y0" :x2="geo.gapX.to" :y2="geo.y0 - 8" />
            <line class="gapline" :x1="geo.gapX.from" :y1="geo.y0 - 8" :x2="geo.gapX.to" :y2="geo.y0 - 8" />
            <text class="gap-t" :x="(geo.gapX.from + geo.gapX.to) / 2" :y="geo.y0 - 22" text-anchor="middle">缺口 {{ geo.gap.toFixed(0) }}</text>
            <text class="verdict no" x="450" y="120" text-anchor="middle">✗ 搭不到头：{{ geo.l1Name }} + {{ geo.l2Name }} = {{ geo.L1 + geo.L2 }} ≤ {{ geo.maxName }}</text>
          </template>

          <text class="hint" x="40" y="40">调节三根木棍的长度，看两根短棍能否搭到一起</text>
          <text class="note" x="40" y="516">判定捷径：只须检验「较短两边之和 > 最长边」</text>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" @click="side.a = 3; side.b = 4; side.c = 7; check()">试 3,4,7（搭不成）</button>
        <button class="btn" @click="side.a = 5; side.b = 4; side.c = 7; check()">试 4,5,7（能围成）</button>
        <button class="btn" @click="side.a = 2; side.b = 2; side.c = 4; check()">试 2,2,4（恰好重合）</button>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>三根木棍</strong><span>拖动联动</span></div>
        <div class="lab-params">
          <ParamSlider v-model="side.a" :min="1" :max="10" :step="1" label="木棍 a" @update:model-value="check" />
          <ParamSlider v-model="side.b" :min="1" :max="10" :step="1" label="木棍 b" @update:model-value="check" />
          <ParamSlider v-model="side.c" :min="1" :max="10" :step="1" label="木棍 c" @update:model-value="check" />
        </div>
      </div>

      <FormulaPanel
        title="三角形三边关系"
        formula="任意两边之和 > 第三边"
        desc="两点之间线段最短：绕两边的路程必然长于直走的第三边。判定时只须看「较短两边之和是否大于最长边」。等价推论：|两边之差| < 第三边。"
        :rows="rows"
        :result="results"
        :verify="[
          '必须三对不等式同时成立，缺一不可',
          '2, 2, 4：2+2 = 4，等号不行——恰好共线围不成',
          '已知两边求第三边范围：两边之差 < x < 两边之和',
          '等腰三角形讨论腰长时要先检验能否构成三角形'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>八年级·三角形</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          三边关系的本质是<b>"两点之间线段最短"</b>。<br />
          · 判定捷径记住一句：<b>短两边之和 > 最长边</b>。<br />
          · 求第三边取值范围：两边之差 < x < 两边之和。<br />
          · 等腰三角形给两边长时，务必分情况讨论并检验。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.ts-panel { background: transparent; }
.ts-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.base-side { stroke: var(--bb-red); stroke-width: 5; stroke-linecap: round; }
.hinge { fill: var(--bb-fg); }
.tri-ok { fill: rgba(13, 155, 97, 0.22); stroke: var(--bb-green); stroke-width: 3.5; stroke-linejoin: round; }
.stick { stroke: var(--bb-amber); stroke-width: 6; stroke-linecap: round; }
.stick2 { stroke: var(--bb-blue); stroke-width: 6; stroke-linecap: round; }
.gapline { stroke: var(--bb-red); stroke-width: 2.5; stroke-dasharray: 7 5; }
.gap-t { fill: var(--bb-red); font-size: 16px; font-weight: 900; font-family: var(--mono); }
.lbl { font-size: 15px; font-weight: 800; font-family: var(--mono); pointer-events: none; }
.lbl-base { fill: var(--bb-red); }
.lbl-l1 { fill: var(--bb-amber); }
.lbl-l2 { fill: var(--bb-blue); }
.verdict { font-size: 24px; font-weight: 900; font-family: var(--mono); }
.verdict.ok { fill: var(--bb-green); }
.verdict.no { fill: var(--bb-red); }
.hint { fill: var(--bb-fg-dim); font-size: 14px; }
.note { fill: var(--bb-fg); font-size: 16px; font-weight: 800; }
</style>
