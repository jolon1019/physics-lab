<script setup>
import { computed, reactive, ref } from 'vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×560。左：等距方块塔；右：三视图 ===== */
const VW = 900, VH = 560
const N = 4          // 网格 4×4
const MAXH = 3       // 每格最多 3 层

// 高度图 h[x][y]，x 列（0..3），y 行（0..3）
const h = reactive(Array.from({ length: N }, () => Array(N).fill(0)))

let done = false
function bump() {
  if (!done) { done = true; emit('complete') }
}
function add(x, y) {
  h[x][y] = (h[x][y] + 1) % (MAXH + 1) // 0→1→2→3→0 循环
  bump()
}
function sub(x, y) {
  h[x][y] = (h[x][y] + MAXH) % (MAXH + 1)
  bump()
}
function clearAll() {
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) h[x][y] = 0
}
function preset() {
  clearAll()
  h[0][1] = 2; h[1][1] = 3; h[2][1] = 1; h[1][2] = 1
  bump()
}
preset()

/* ===== 等距投影 ===== */
const W = 34, HGT = 17, HH = 24       // 半格宽 / 平面半高 / 每层高
const OX = 230, OY = 100              // 投影原点
const P = (x, y, z) => ({ x: OX + (x - y) * W, y: OY + (x + y) * HGT - z * HH })

const cols = []
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cols.push({ x, y })
const drawOrder = cols.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y))

const prisms = computed(() =>
  drawOrder
    .filter((c) => h[c.x][c.y] > 0)
    .map((c) => {
      const { x, y } = c
      const z = h[x][y]
      return {
        key: `${x}-${y}`,
        top: [P(x, y, z), P(x + 1, y, z), P(x + 1, y + 1, z), P(x, y + 1, z)],
        right: [P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, 0), P(x + 1, y, 0)],
        left: [P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, 0), P(x, y + 1, 0)],
        base: [P(x, y, 0), P(x + 1, y, 0), P(x + 1, y + 1, 0), P(x, y + 1, 0)],
        height: z
      }
    })
)
/* 点击命中层：所有格子的底面菱形（画在最上层保证可点） */
const hitAreas = cols.map((c) => ({
  x: c.x, y: c.y,
  pts: [P(c.x, c.y, 0), P(c.x + 1, c.y, 0), P(c.x + 1, c.y + 1, 0), P(c.x, c.y + 1, 0)]
}))
const poly = (pts) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

/* ===== 三视图数据 ===== */
// 主视图：列 = x，高度 = max_y h[x][y]
const front = computed(() => Array.from({ length: N }, (_, x) => Math.max(...h[x])))
// 左视图：列 = y，高度 = max_x h[x][y]
const left = computed(() => Array.from({ length: N }, (_, y) => Math.max(...h.map((col) => col[y]))))
const topCells = computed(() => cols.filter((c) => h[c.x][c.y] > 0))

const totalBlocks = computed(() => cols.reduce((s, c) => s + h[c.x][c.y], 0))
const maxHeight = computed(() => Math.max(...front.value, ...left.value, 0))

/* 视图面板布局（-first-angle 制图排布：主视图左上、俯视图其正下、左视图其右侧）
   主-俯「长对正」（同 x 起点）、主-左「高平齐」（同 y 起点）、俯-左「宽相等」 */
const S = 36, MAX = 4
const FX = 580, FY = 90    // 主视图左上角
const LX = 750             // 左视图（与主视图同高起点）
const TY = 280             // 俯视图（与主视图同 x 起点）
// 主视图：横轴 x，纵轴 z（z=0 在最底行）
const frontRect = (x, z) => ({ x: FX + x * S, y: FY + (MAX - 1 - z) * S })
// 左视图：横轴 y，纵轴 z（与主视图同一行高基线 → 高平齐）
const leftRect = (y, z) => ({ x: LX + y * S, y: FY + (MAX - 1 - z) * S })
// 俯视图：x 向右、y 向下（前排 y=3 在下，与主视图同 x 对齐 → 长对正）
const topRect = (x, y) => ({ x: FX + x * S, y: TY + y * S })

const viewTitle = { top: '俯视图（从上往下看）', front: '主视图（从正面看）', left: '左视图（从左面看）' }

function onCell(e, x, y) {
  if (e.shiftKey || e.button === 2) sub(x, y)
  else add(x, y)
}
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel bv-panel" style="padding: 0">
        <svg class="bv-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="投影与三视图：方块塔等距模型与三视图" @contextmenu.prevent>
          <!-- 地面网格（虚线菱形） -->
          <g class="floor">
            <polygon v-for="c in hitAreas" :key="'f'+c.x+'-'+c.y" :points="poly(c.pts)" />
          </g>

          <!-- 方块柱 -->
          <g v-for="p in prisms" :key="p.key">
            <polygon class="face right" :points="poly(p.right)" />
            <polygon class="face left" :points="poly(p.left)" />
            <polygon class="face top" :points="poly(p.top)" />
            <text class="hnum" :x="(p.top[0].x + p.top[2].x) / 2" :y="(p.top[0].y + p.top[2].y) / 2 + 4" text-anchor="middle">{{ p.height }}</text>
          </g>

          <!-- 命中层（透明，最上） -->
          <g>
            <polygon v-for="c in hitAreas" :key="'h'+c.x+'-'+c.y"
              class="hit" :points="poly(c.pts)"
              @click.prevent="onCell($event, c.x, c.y)"
              @contextmenu.prevent="sub(c.x, c.y)" />
          </g>

          <!-- 操作提示 -->
          <text class="tip" x="40" y="36">点击格子加一层（循环清零）· 右键 / Shift+点击 减一层</text>

          <!-- 三视图面板 -->
          <g class="views">
            <!-- 主视图 -->
            <text class="vtitle" :x="FX" :y="FY - 10">{{ viewTitle.front }}</text>
            <template v-for="(hm, x) in front">
              <rect v-for="z in hm" :key="'f'+x+'-'+z" class="vcell on"
                :x="frontRect(x, z - 1).x" :y="frontRect(x, z - 1).y" :width="S" :height="S" />
            </template>
            <!-- 左视图（高平齐：与主视图同一基线） -->
            <text class="vtitle" :x="LX" :y="FY - 10">{{ viewTitle.left }}</text>
            <template v-for="(hm, y) in left">
              <rect v-for="z in hm" :key="'l'+y+'-'+z" class="vcell on"
                :x="leftRect(y, z - 1).x" :y="leftRect(y, z - 1).y" :width="S" :height="S" />
            </template>
            <!-- 俯视图（长对正：与主视图同 x 起点） -->
            <text class="vtitle" :x="FX" :y="TY - 10">{{ viewTitle.top }}</text>
            <g v-for="c in cols" :key="'t'+c.x+'-'+c.y">
              <rect class="vcell" :x="topRect(c.x, c.y).x" :y="topRect(c.x, c.y).y"
                :width="S" :height="S" :class="{ on: h[c.x][c.y] > 0 }" />
            </g>
          </g>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" @click="preset()">预设示例</button>
        <button class="btn" @click="clearAll(); bump()">清空</button>
        <span class="feedback no">检验三视图：长对正、高平齐、宽相等</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实时数据</strong><span>自动统计</span></div>
        <div class="lab-readout">
          <div class="lab-stat"><span>方块总数</span><strong>{{ totalBlocks }}</strong></div>
          <div class="lab-stat accent"><span>最高层数</span><strong>{{ maxHeight }}</strong></div>
          <div class="lab-stat success"><span>俯视图占用格</span><strong>{{ topCells.length }} / {{ N * N }}</strong></div>
        </div>
      </div>

      <FormulaPanel
        title="三视图"
        formula="长对正 · 高平齐 · 宽相等"
        desc="主视图反映长与高，左视图反映宽与高，俯视图反映长与宽。主-俯长对正、主-左高平齐、俯-左宽相等。视图中每一列的高度 = 该方向上各行的最大层数。"
        :rows="[
          { label: '主视图列数', value: `${N} 列（对应俯视图的列 x）` },
          { label: '左视图列数', value: `${N} 列（对应俯视图的行 y）` },
          { label: '主视图各列高', value: front.join(' , ') },
          { label: '左视图各列高', value: left.join(' , ') }
        ]"
        :result="[
          { label: '方块总数', value: `${totalBlocks}（各格层数之和）` },
          { label: '最高层数', value: `${maxHeight}` }
        ]"
        :verify="[
          '俯视图：有方块的格子才着色，被挡住的也要画',
          '主视图第 x 列高 = max( 该列上所有行的层数 )',
          '左视图第 y 列高 = max( 该行上所有列的层数 )',
          '三视图互相校验：长对正、高平齐、宽相等'
        ]"
      />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>要点</strong><span>九年级·投影与视图</span></div>
        <p style="font-size: 14px; line-height: 1.75; color: var(--text)">
          三视图是<b>工程与制图的语言</b>：机械图纸、建筑平面都靠它。<br />
          · 平行投影下同一物体不同方向 → 不同视图。<br />
          · 由三视图反过来想象实物，是空间观念的核心训练。<br />
          · 试一试：只搭一格 3 层，三个视图分别是什么形状？
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.bv-panel { background: transparent; }
.bv-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 560;
  touch-action: pan-y; user-select: none;
}
.floor polygon { fill: rgba(255,255,255,0.02); stroke: var(--bb-fg-dim); stroke-width: 1; stroke-dasharray: 5 5; opacity: 0.6; }
.face { stroke: rgba(10, 14, 24, 0.55); stroke-width: 1.2; stroke-linejoin: round; }
.face.top { fill: #64e3cb; }
.face.left { fill: #1f9fb4; }
.face.right { fill: #14809a; }
.hnum { fill: #06251f; font-size: 14px; font-weight: 900; font-family: var(--mono); pointer-events: none; }
.hit { fill: transparent; cursor: pointer; }
.hit:hover { fill: rgba(255, 207, 51, 0.18); }
.tip { fill: var(--bb-fg-dim); font-size: 14px; }
.vtitle { fill: var(--bb-fg); font-size: 14px; font-weight: 800; }
.vcell { fill: rgba(255,255,255,0.04); stroke: var(--bb-fg-dim); stroke-width: 1.2; }
.vcell.on { fill: rgba(70, 232, 210, 0.4); stroke: var(--bb-blue); stroke-width: 1.8; }
</style>
