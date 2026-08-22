<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

const N = ref(10) // 压力 N
const surface = ref('wood') // wood / towel / sand
const speed = ref(2) // 拉动速度 m/s
const wide = ref(true) // 接触面积（平放=大 / 侧放=小）

const MU = { wood: 0.4, towel: 0.65, sand: 0.85 }
const SURF_LABEL = { wood: '木板面', towel: '毛巾面', sand: '砂纸面' }
const SURF_TONE = {
  wood: { base: '#caa06a', edge: '#8a5a2b', dark: '#6f4622', grain: 'rgba(120,72,30,0.55)' },
  towel: { base: '#7fb0d8', edge: '#3f6f97', dark: '#33597c', grain: 'rgba(255,255,255,0.5)' },
  sand: { base: '#e7cf9a', edge: '#b89653', dark: '#8f7034', grain: 'rgba(143,112,52,0.6)' }
}

const f = computed(() => (MU[surface.value] * N.value).toFixed(2))
let completed = false

// 拉力匀速向右，物块随拉力平移（仅视觉），速度只影响运动线密度
const phase = ref(0)
let raf = null

// 物块几何（平放=宽矮，侧放=窄高，体积相同）
const BW_WIDE = 150
const BW_NARROW = 64
const BW_H_WIDE = 72
const BW_H_NARROW = 150
const blockW = computed(() => (wide.value ? BW_WIDE : BW_NARROW))
const blockH = computed(() => (wide.value ? BW_H_WIDE : BW_NARROW))

// 弹簧测力计：拉力越大弹簧拉伸越长、读数越大（匀速时 = 摩擦力 f）
const dynRead = computed(() => Number(f.value))
const springLen = computed(() => 26 + dynRead.value * 5.2)

// 平滑插值弹簧长度，避免切换时突跳
const springAnim = ref(springLen.value)
watch(springLen, (v) => { springAnim.value = v })
let lastT = 0
function tick(now) {
  const dt = Math.min(((now - lastT) || 16) / 1000, 0.05)
  lastT = now
  // lerp
  springAnim.value += (springLen.value - springAnim.value) * Math.min(1, dt * 8)
  phase.value += dt * speed.value * 3.2
  raf = requestAnimationFrame(tick)
}

// 运动线（速度越大越密）
const motionLines = computed(() => {
  const out = []
  const count = Math.round(3 + speed.value * 2)
  const off = (phase.value * 26) % 30
  for (let i = 0; i < count; i++) {
    out.push((i * 30 + off) % 150)
  }
  return out
})

function mark() {
  if (!completed) {
    completed = true
    emit('complete')
  }
}
watch([N, surface, speed, wide], mark)

onMounted(() => {
  lastT = performance.now()
  raf = requestAnimationFrame(tick)
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel" style="padding: 0">
        <svg
          class="friction-svg"
          viewBox="0 0 640 520"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="滑动摩擦力演示动画"
        >
          <defs>
            <!-- 木纹块渐变 -->
            <linearGradient id="fr-wood" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#e3b878" />
              <stop offset="0.5" stop-color="#cf9a55" />
              <stop offset="1" stop-color="#b27e3c" />
            </linearGradient>
            <linearGradient id="fr-wood-side" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#a9742f" />
              <stop offset="1" stop-color="#8a5d23" />
            </linearGradient>
            <linearGradient id="fr-metal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#fbfdff" />
              <stop offset="0.5" stop-color="#dfe6ee" />
              <stop offset="1" stop-color="#b9c4d0" />
            </linearGradient>
            <linearGradient id="fr-dyn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#ffffff" />
              <stop offset="1" stop-color="#eef3f8" />
            </linearGradient>
            <filter id="fr-soft" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.28" />
            </filter>
          </defs>

          <!-- 地面 / 接触面 -->
          <g>
            <!-- 桌面底色 -->
            <rect x="0" y="360" width="640" height="160" fill="#1d2a24" />
            <!-- 接触面材质带 -->
            <g>
              <!-- 木板面：木纹 -->
              <template v-if="surface === 'wood'">
                <rect x="36" y="356" width="568" height="14" :fill="SURF_TONE.wood.base" />
                <rect x="36" y="356" width="568" height="14" fill="none" :stroke="SURF_TONE.wood.edge" stroke-width="2" />
                <g :stroke="SURF_TONE.wood.grain" stroke-width="1.4" opacity="0.8">
                  <line v-for="i in 11" :key="'wg' + i" :x1="48 + i * 48" y1="358" :x2="48 + i * 48" y2="368" />
                  <path d="M44 363 Q180 359 320 363 T600 363" fill="none" />
                  <path d="M44 366 Q200 362 360 366 T600 366" fill="none" />
                </g>
              </template>
              <!-- 毛巾面：毛圈纹理 -->
              <template v-else-if="surface === 'towel'">
                <rect x="36" y="356" width="568" height="14" :fill="SURF_TONE.towel.base" />
                <rect x="36" y="356" width="568" height="14" fill="none" :stroke="SURF_TONE.towel.edge" stroke-width="2" />
                <g :stroke="SURF_TONE.towel.grain" stroke-width="1.6">
                  <circle v-for="i in 26" :key="'tl' + i" :cx="52 + (i * 21) % 540" :cy="363" r="3.4" fill="none" />
                </g>
              </template>
              <!-- 砂纸面：砂粒 -->
              <template v-else>
                <rect x="36" y="356" width="568" height="14" :fill="SURF_TONE.sand.base" />
                <rect x="36" y="356" width="568" height="14" fill="none" :stroke="SURF_TONE.sand.edge" stroke-width="2" />
                <g :fill="SURF_TONE.sand.grain">
                  <circle v-for="i in 60" :key="'sd' + i" :cx="44 + ((i * 53) % 552)" :cy="360 + ((i * 31) % 8)" r="1.5" />
                </g>
              </template>
            </g>
          </g>

          <!-- 弹簧测力计（左侧） -->
          <g filter="url(#fr-soft)">
            <!-- 外壳 -->
            <rect x="34" y="232" width="34" height="58" rx="6" fill="url(#fr-dyn)" stroke="#2b3a4a" stroke-width="2.5" />
            <!-- 刻度窗 -->
            <rect x="40" y="240" width="22" height="42" rx="3" fill="#f4f8fb" stroke="#9fb0c0" stroke-width="1.2" />
            <g stroke="#9fb0c0" stroke-width="1">
              <line v-for="i in 5" :key="'sc' + i" :x1="44" :y1="244 + i * 7" x2="58" :y2="244 + i * 7" />
            </g>
            <!-- 读数指针（随拉力上下） -->
            <line
              x1="40" y1="266" x2="58"
              :y1="248 + (springAnim / (26 + 8.5 * 5.2)) * 36"
              :y2="248 + (springAnim / (26 + 8.5 * 5.2)) * 36"
              stroke="#d92135" stroke-width="2.4"
            />
            <!-- 顶部提环 -->
            <circle cx="51" cy="222" r="9" fill="none" stroke="#2b3a4a" stroke-width="3" />
            <!-- 螺旋弹簧（拉力越大越长） -->
            <path
              :d="`M51 290
                ${Array.from({length:10},(_,i)=>{const y=290+(springAnim/10)*i;const x=51+(i%2?7:-7);return `L ${x} ${y.toFixed(1)}`}).join(' ')}
                L51 ${(290+springAnim).toFixed(1)}`"
              fill="none" stroke="#5b6b7a" stroke-width="2.4"
            />
            <!-- 挂钩 -->
            <path :d="`M51 ${290+springAnim} q0 10 8 10 q8 0 8 -8`" fill="none" stroke="#2b3a4a" stroke-width="2.6" />
            <!-- 数字读数 -->
            <text x="51" y="306" text-anchor="middle" font-size="13" font-weight="800" fill="#1a1a1a">{{ f }}</text>
            <text x="51" y="320" text-anchor="middle" font-size="9" font-weight="700" fill="#555">N</text>
          </g>

          <!-- 拉杆（测力计 → 物块） -->
          <line x1="67" :y1="300 + springAnim" :x2="230" :y2="300 + springAnim" stroke="#3a6ea5" stroke-width="4" stroke-linecap="round" />

          <!-- 物块 -->
          <g :transform="`translate(230 300) `">
            <!-- 宽矮 / 窄高 均以此为原点上方绘制 -->
            <g :transform="`translate(${-blockW/2} ${-blockH})`">
              <rect :width="blockW" :height="blockH" rx="6" :fill="wide ? 'url(#fr-wood)' : 'url(#fr-wood-side)'" :stroke="SURF_TONE.wood.edge" stroke-width="2.5" />
              <!-- 顶面高光 -->
              <rect :width="blockW" height="10" rx="6" fill="rgba(255,255,255,0.28)" />
              <!-- 木纹细节 -->
              <g v-if="wide" :stroke="SURF_TONE.wood.grain" stroke-width="1.2" opacity="0.6">
                <line :x1="14" :y1="22" :x2="blockW-14" y2="22" />
                <line :x1="14" :y1="44" :x2="blockW-14" y2="44" />
              </g>
              <g v-else :stroke="SURF_TONE.wood.grain" stroke-width="1.2" opacity="0.6">
                <line x1="20" :y1="14" :x2="20" :y2="blockH-14" />
                <line x1="44" :y1="14" :x2="44" :y2="blockH-14" />
              </g>
              <text :x="blockW/2" :y="blockH/2" text-anchor="middle" dominant-baseline="middle" font-size="14" font-weight="800" fill="#3a240f">物块</text>
            </g>
          </g>

          <!-- 拉力箭头（向右，匀速） -->
          <g>
            <line x1="180" y1="206" x2="232" y2="206" stroke="#d92135" stroke-width="4" stroke-linecap="round" />
            <path d="M232 206 l-12 -7 l0 14 z" fill="#d92135" />
          </g>
          <text x="206" y="196" text-anchor="middle" font-size="13" font-weight="800" fill="#d92135">F 拉</text>

          <!-- 运动线（速度越大越密） -->
          <g stroke="#3a6ea5" stroke-width="2" opacity="0.45" stroke-linecap="round">
            <line
              v-for="(d, i) in motionLines"
              :key="'ml' + i"
              :x1="230 + blockW + 14 + d"
              y1="312"
              :x2="230 + blockW + 14 + d + 14"
              y2="312"
            />
          </g>

          <!-- 标注 -->
          <g font-family="system-ui, sans-serif" font-weight="700">
            <text x="20" y="30" font-size="14" fill="#f2f5f0">接触面：{{ SURF_LABEL[surface] }}（μ = {{ MU[surface] }}）</text>
            <text x="20" y="52" font-size="12.5" fill="#c7d0c8">
              压力 N = {{ N }} N ・ 速度 = {{ speed }} m/s ・ 接触面积：{{ wide ? '大（平放）' : '小（侧放）' }}
            </text>
            <text x="20" y="502" font-size="14" font-weight="800" fill="#ff6b78">
              匀速直线拉动时，弹簧测力计示数 = 滑动摩擦力 f = μ・N = {{ f }} N
            </text>
          </g>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': surface === 'wood' }" @click="surface = 'wood'">木板面</button>
        <button class="btn" :class="{ 'btn-primary': surface === 'towel' }" @click="surface = 'towel'">毛巾面</button>
        <button class="btn" :class="{ 'btn-primary': surface === 'sand' }" @click="surface = 'sand'">砂纸面</button>
        <button class="btn" :class="{ 'btn-primary': wide }" @click="wide = true">接触面积大</button>
        <button class="btn" :class="{ 'btn-primary': !wide }" @click="wide = false">接触面积小</button>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>探究摩擦力</span></div>
        <ParamSlider v-model="N" :min="2" :max="30" :step="1" :precision="0" label="压力 N（接触面正压力）" unit=" N" />
        <ParamSlider v-model="speed" :min="1" :max="6" :step="1" :precision="0" label="拉动速度 v" unit=" m/s" hint="速度不影响滑动摩擦力大小" />
        <p style="padding:4px 12px;font-size:12px;color:var(--text-dim)">接触面积（按钮切换）也不影响滑动摩擦力大小。</p>
      </div>

      <FormulaPanel
        title="滑动摩擦力"
        formula="f = μ · N"
        :rows="[
          { label: '接触面 μ', value: MU[surface] },
          { label: '压力 N', value: N + ' N' }
        ]"
        :result="[{ label: '摩擦力 f = μN', value: f + ' N' }]"
        verify="匀速直线拉动时，弹簧测力计示数等于滑动摩擦力（二力平衡）。f 只与接触面粗糙程度 μ 和压力 N 有关，与速度、接触面积无关。"
      />
    </aside>
  </div>
</template>

<style scoped>
.friction-svg {
  display: block;
  width: 100%;
  height: 520px;
  background: transparent;
  border-radius: 8px;
}
</style>
