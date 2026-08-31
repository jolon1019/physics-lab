<script setup>
import { computed, reactive, ref } from 'vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×420，天平 ===== */
const VW = 900, VH = 420

// 关卡库：ax + b = c，解为整数
const LEVELS = [
  { a: 2, b: 3, c: 7 },
  { a: 3, b: 1, c: 10 },
  { a: 4, b: 5, c: 13 },
  { a: 5, b: 2, c: 17 },
  { a: 2, b: 7, c: 15 }
]
const levelIdx = ref(0)

// 操作进度：leftA（x 盒个数）、leftB（左盘砝码数）、right（右盘砝码数）
const st = reactive({ leftA: LEVELS[0].a, leftB: LEVELS[0].b, right: LEVELS[0].c })
const log = ref([])
let solvedAny = false

const eqText = computed(() => {
  const xTerm = st.leftA === 0 ? '' : st.leftA === 1 ? 'x' : `${st.leftA}x`
  const l = `${xTerm}${st.leftB ? (xTerm ? ' + ' : '') + st.leftB : ''}` || '0'
  return `${l} = ${st.right}`
})

function loadLevel(i) {
  levelIdx.value = i
  st.leftA = LEVELS[i].a
  st.leftB = LEVELS[i].b
  st.right = LEVELS[i].c
  log.value = []
}

function subAllB() {
  if (st.leftB <= 0) return
  const sub = st.leftB
  st.right -= sub
  st.leftB = 0
  log.value.push(`两边同减 ${sub}（移项）→ ${st.leftA}x = ${st.right}`)
  check()
}

function divA() {
  if (st.leftA <= 1 || st.leftB > 0) return
  const cur = st.leftA
  st.right = Math.round((st.right / cur) * 1000) / 1000
  st.leftA = 1
  log.value.push(`两边同除以 ${cur}（系数化为 1）→ x = ${st.right}`)
  check()
}

function check() {
  if (solvedAny) return
  if (st.leftA === 1 && st.leftB === 0) {
    solvedAny = true
    emit('complete')
  }
}

const solved = computed(() => st.leftA === 1 && st.leftB === 0)
const xVal = computed(() => (solved.value ? st.right : null))

/* ===== 天平绘制（方程两边始终相等 → 天平恒平衡） ===== */
const LVW = 118 // 盘宽
// 左盘挂点 = 梁左端
const beamL = { x: 150, y: 130 }
const beamR = { x: 750, y: 130 }

const leftItems = computed(() => {
  const items = []
  const total = st.leftA + st.leftB
  const boxW = Math.min(40, (LVW - 14) / Math.max(total, 1))
  for (let i = 0; i < st.leftA; i++) items.push({ type: 'x', x: i * boxW, w: boxW })
  for (let i = 0; i < st.leftB; i++) items.push({ type: 'b', x: (st.leftA + i) * boxW, w: boxW })
  return items
})

const rows = computed(() => [
  { label: '当前方程', value: eqText.value },
  { label: '操作步数', value: `${log.value.length}` },
  { label: '天平状态', value: '平衡（两边同操作，始终平衡）' }
])
const results = computed(() => solved.value
  ? [
      { label: '解', value: `x = ${xVal.value}` },
      { label: '检验', value: `${LEVELS[levelIdx.value].a}×${xVal.value} + ${LEVELS[levelIdx.value].b} = ${LEVELS[levelIdx.value].c} ✓` }
    ]
  : [{ label: '下一步', value: st.leftB > 0 ? `两边同减 ${st.leftB}（移项）` : `两边同除以 ${st.leftA}` }]
)
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel bl-panel" style="padding: 0">
        <svg class="bl-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="天平平衡解方程">
          <!-- 支柱与底座 -->
          <polygon class="base" points="450,320 350,368 550,368" />
          <rect class="pillar" x="443" y="132" width="14" height="198" rx="4" />
          <circle class="pivot" cx="450" cy="132" r="10" />

          <!-- 横梁（恒水平） -->
          <line class="beam" :x1="beamL.x" :y1="beamL.y" :x2="beamR.x" :y2="beamR.y" />

          <!-- 左盘：ax + b -->
          <g>
            <line class="string" :x1="beamL.x" :y1="beamL.y" :x2="beamL.x" :y2="beamL.y + 40" />
            <path class="pan" :d="`M ${beamL.x - LVW / 2 - 12} ${beamL.y + 60} Q ${beamL.x} ${beamL.y + 100} ${beamL.x + LVW / 2 + 12} ${beamL.y + 60} Z`" />
            <g v-for="(it, i) in leftItems" :key="'li'+i">
              <rect v-if="it.type === 'x'" class="xbox" :x="beamL.x - LVW / 2 + it.x + 4" :y="beamL.y + 44 - 26" :width="it.w - 8" height="26" rx="4" />
              <text v-if="it.type === 'x'" class="xbox-t" :x="beamL.x - LVW / 2 + it.x + it.w / 2" :y="beamL.y + 44 - 8" text-anchor="middle">x</text>
              <rect v-else class="weight" :x="beamL.x - LVW / 2 + it.x + 6" :y="beamL.y + 44 - 16" :width="it.w - 12" height="16" rx="3" />
            </g>
          </g>

          <!-- 右盘：c 个砝码（每行最多 7 个） -->
          <g>
            <line class="string" :x1="beamR.x" :y1="beamR.y" :x2="beamR.x" :y2="beamR.y + 40" />
            <path class="pan" :d="`M ${beamR.x - LVW / 2 - 12} ${beamR.y + 60} Q ${beamR.x} ${beamR.y + 100} ${beamR.x + LVW / 2 + 12} ${beamR.y + 60} Z`" />
            <g v-for="i in st.right" :key="'w'+i">
              <rect class="weight" :x="beamR.x - LVW / 2 + ((i - 1) % 7) * 14 + 8" :y="beamR.y + 44 - 16 - Math.floor((i - 1) / 7) * 18" width="11" height="16" rx="3" />
            </g>
          </g>

          <!-- 方程大字 -->
          <text class="eq" x="450" y="52" text-anchor="middle">{{ eqText }}</text>
          <text v-if="solved" class="solved" x="450" y="86" text-anchor="middle">解出 x = {{ xVal }}，代回原方程检验 ✓</text>
          <text v-else class="hint" x="450" y="86" text-anchor="middle">对天平两边做相同操作，让左边只剩 x</text>

          <!-- 操作记录（最多显示最近 4 条） -->
          <g v-for="(l, i) in log.slice(-4)" :key="'lg'+i" class="logline-wrap">
            <text class="logline" x="60" :y="386 - (log.slice(-4).length - 1 - i) * 18">· {{ l }}</text>
          </g>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn btn-primary" :disabled="st.leftB <= 0" @click="subAllB()">两边同减 {{ st.leftB }}（移项）</button>
        <button class="btn btn-primary" :disabled="st.leftA <= 1 || st.leftB > 0" @click="divA()">两边同除以 {{ st.leftA }}</button>
        <button class="btn" @click="loadLevel(levelIdx)">重做本关</button>
        <span class="feedback no">第 {{ levelIdx + 1 }} 关 · 移项变号 = 两边同减</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>关卡</strong><span>ax + b = c</span></div>
        <div class="lab-actions" style="padding: 10px">
          <button
            v-for="(l, i) in LEVELS" :key="i"
            class="btn" :class="{ 'btn-primary': levelIdx === i }"
            @click="loadLevel(i)"
          >{{ l.a }}x + {{ l.b }} = {{ l.c }}</button>
        </div>
      </div>

      <FormulaPanel
        title="一元一次方程"
        formula="ax + b = c → x = (c − b) / a"
        desc="方程就是天平：两边做相同操作，等式仍成立。先两边同减 b（移项，注意变号），再两边同除以 a（系数化为 1），解出 x 后代回原方程检验。"
        :rows="rows"
        :result="results"
        :verify="[
          '等式性质 1：两边同加减同一数 → 仍是等式（移项的依据）',
          '等式性质 2：两边同乘除同一非零数 → 仍是等式（去系数的依据）',
          '移项必须变号：从一边移到另一边，+ 变 −、− 变 +',
          '解出后必须检验：代回原方程看左右是否相等'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>七年级·一元一次方程</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          解方程五步：去分母 → 去括号 → <b>移项</b> → 合并同类项 → 系数化为 1。<br />
          · 每一步都是"天平两边做相同的事"。<br />
          · 应用题关键：设未知数，找等量关系列方程。<br />
          · 方程思想：把未知当已知，用等量关系桥接。
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.bl-panel { background: transparent; }
.bl-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 420;
  touch-action: pan-y; user-select: none;
}
.base { fill: var(--bb-fg-dim); opacity: 0.5; }
.pillar { fill: var(--bb-fg-dim); }
.pivot { fill: var(--bb-amber); stroke: var(--bb-fg); stroke-width: 2; }
.beam { stroke: var(--bb-fg); stroke-width: 7; stroke-linecap: round; }
.string { stroke: var(--bb-fg-dim); stroke-width: 1.6; }
.pan { fill: rgba(70, 232, 210, 0.35); stroke: var(--bb-blue); stroke-width: 2.5; }
.xbox { fill: rgba(184, 121, 21, 0.7); stroke: var(--bb-amber); stroke-width: 1.5; }
.xbox-t { fill: #fff; font-size: 14px; font-weight: 900; font-family: var(--mono); pointer-events: none; }
.weight { fill: var(--bb-fg-dim); stroke: var(--bb-fg); stroke-width: 1; }
.eq { fill: var(--bb-fg); font-size: 30px; font-weight: 900; font-family: var(--mono); }
.solved { fill: var(--bb-green); font-size: 17px; font-weight: 800; }
.hint { fill: var(--bb-fg-dim); font-size: 14px; }
.logline { fill: var(--bb-fg-dim); font-size: 12.5px; font-family: var(--mono); }
</style>
