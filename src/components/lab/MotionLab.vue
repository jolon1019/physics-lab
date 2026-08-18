<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

// 动态 viewBox：高度固定，宽度跟随容器宽高比实时计算
// => 画面始终满铺容器、零留白、永不变形（无论右侧如何拉长）
const H = 520
const W = ref(1000)
const groundY = 360
const MIN_W = 420
const MAX_W = 2600

const stageEl = ref(null)
let ro = null

const carCenter = () => W.value / 2
const cloudCenter = () => W.value * 0.56
const trackLeft = () => -140
const trackRight = () => W.value + 140
const trackSpan = () => W.value + 280

const speed = ref(2) // 车速 m/s
const cloudSpeed = ref(2) // 白云速度 m/s（默认与车相同 → 相对静止）
const reference = ref('ground') // ground | car | cloud

// ===== 三元素贴纸尺寸（car/cloud/road.png 均为 400×400 透明画布） =====
const CAR_W = 132
const CAR_H = 132
const CLOUD_W = 116
const CLOUD_H = 116
const ROAD_H = 60 // 路面渲染高度
const ROAD_TILE_W = 320 // 单段路的渲染宽度（视觉 4:1，原图 1:1 拉伸）
const ROAD_TILES = 10 // 最多铺 10 段，覆盖 W 最大 2600 + buffer

// 连续位置（始终单向增大、循环，绝不反向）
let carPos = carCenter()
let cloudPos = cloudCenter()
let wheelAngle = 0
let frame = 0
// 背景氛围云的累计偏移：随白云速度推进，w=0 时冻结（不再用 frame 驱动）
let cloudDrift1 = 140
let cloudDrift2 = 640

const seen = { ground: false, car: false, cloud: false }
let completed = false

const hint = ref('切换参照物，观察同一物体是运动还是静止')

// 响应式渲染状态
const carX = ref(carCenter())
const carBounce = ref(0)
const cloudX = ref(cloudCenter())
const cloudY = ref(groundY - 188)
const worldOffset = ref(0)
const laneOffset = ref(0)
const lampOffset = ref(0)
const hillOffset = ref(0)
const cityOffset = ref(0)
const wheelAngleVal = ref(0)
const puffs = ref([])
const speedLines = ref([])

// 运动状态取决于各物体相对参照物的速度是否相同
const EPS = 0.001
const relState = (a, b) => (Math.abs(a - b) < EPS ? '静止' : '运动')

const verdict = computed(() => {
  const cs = speed.value
  const ws = cloudSpeed.value
  if (reference.value === 'ground') {
    return {
      car: cs > 0 ? '运动' : '静止',
      person: cs > 0 ? '运动' : '静止',
      cloud: ws > 0 ? '运动' : '静止',
      ground: '静止'
    }
  }
  if (reference.value === 'car') {
    return {
      car: '静止',
      person: '静止',
      cloud: relState(ws, cs),
      ground: cs > 0 ? '向后运动' : '静止'
    }
  }
  return {
    car: relState(cs, ws),
    person: relState(cs, ws),
    cloud: '静止',
    ground: ws > 0 ? '向后运动' : '静止'
  }
})

const speedKmh = computed(() => (speed.value * 3.6).toFixed(1))
const cloudKmh = computed(() => (cloudSpeed.value * 3.6).toFixed(1))

const refLabel = computed(() =>
  reference.value === 'car' ? '车厢' : reference.value === 'cloud' ? '白云' : '地面'
)

// 玻璃拟态结论卡片（窄屏自动收窄）
const cardW = computed(() => (W.value < 680 ? 196 : 256))
const cardH = 132
const cardX = computed(() => W.value - 14 - cardW.value)

function mod(x, n) {
  return ((x % n) + n) % n
}
function trackX(pos) {
  return mod(pos - trackLeft(), trackSpan()) + trackLeft()
}
function wrapX(v) {
  const span = W.value + 140
  return mod(v + 70, span) - 70
}

// 背景星点（相对坐标，随宽度铺开）
const stars = Array.from({ length: 54 }, () => ({
  rx: Math.random(),
  ry: Math.random() * 0.42,
  r: 0.7 + Math.random() * 1.6,
  o: 0.25 + Math.random() * 0.6,
  d: (Math.random() * 6).toFixed(2)
}))

function pickReference(r) {
  reference.value = r
  seen[r] = true
  if (r === 'cloud') {
    hint.value = '以白云为参照物：白云速度 = 车速时，车和人相对白云静止；调高白云速度，车相对白云向前运动'
  } else if (r === 'car') {
    hint.value = '以车厢为参照物：车内人静止；白云是否静止，取决于白云速度是否等于车速'
  } else {
    hint.value = '以地面为参照物：汽车、车内人、白云都在运动（速度相同则同步移动）'
  }
  const got = Object.values(seen).filter(Boolean).length
  if (got >= 2 && !completed) {
    completed = true
    hint.value = '参照物不同，运动状态不同；同速同向的两个物体相对静止 —— 实验完成！'
    emit('complete')
  }
}

function reset() {
  reference.value = 'ground'
  carPos = carCenter()
  cloudPos = cloudCenter()
  seen.ground = seen.car = seen.cloud = false
  hint.value = '切换参照物，观察同一物体是运动还是静止'
}

// 由参照物决定“世界”滚动：让所选参照物居中、世界连续滚动、另一物体环绕
function computeOffsets() {
  let wo, cx, clx
  if (reference.value === 'ground') {
    wo = 0
    cx = trackX(carPos)
    clx = trackX(cloudPos)
  } else if (reference.value === 'car') {
    wo = carPos - carCenter()
    cx = carCenter()
    clx = wrapX(cloudPos - carPos + carCenter())
  } else {
    wo = cloudPos - cloudCenter()
    clx = cloudCenter()
    cx = wrapX(carPos - cloudPos + carCenter())
  }
  return { wo, cx, clx }
}

let raf = null

function loop() {
  frame++
  const vCar = 0.8 + speed.value * 0.4 // 视觉速度（车速滑块最小值为 1，恒动）
  const vCloud = cloudSpeed.value * 0.8 // 白云视觉速度：w=0 时为 0，白云真正静止
  carPos += vCar
  cloudPos += vCloud
  cloudDrift1 += vCloud * 0.14
  cloudDrift2 += vCloud * 0.1
  wheelAngle += vCar * 0.06

  const { wo, cx, clx } = computeOffsets()
  worldOffset.value = wo
  laneOffset.value = mod(wo, ROAD_TILE_W)
  lampOffset.value = mod(wo, 460)
  hillOffset.value = mod(wo * 0.22, 460)
  cityOffset.value = mod(wo * 0.4, 520)
  carX.value = cx
  cloudX.value = clx
  cloudY.value = groundY - 190 + (cloudSpeed.value > 0 ? Math.sin(frame * 0.05) * 4 : 0)
  carBounce.value = Math.sin(frame * 0.22) * 1.6
  wheelAngleVal.value = wheelAngle

  // 尾气粒子（从车尾后方冒出，向左飘散）
  if (frame % 10 === 0 && reference.value !== 'car') {
    puffs.value.push({ id: frame, x: cx - 96, y: groundY - 34, a: 0.34, r: 4 })
  }
  const arr = puffs.value
  for (const p of arr) {
    p.x -= 1.8
    p.a -= 0.018
    p.r += 0.5
  }
  puffs.value = arr.filter((p) => p.a > 0)

  // 速度线（增强流动感）
  if (frame % 6 === 0) {
    const y = groundY - 60 - Math.random() * 120
    speedLines.value.push({ id: frame, x: W.value * 0.5 + 160, y, len: 26 + Math.random() * 30, a: 0.5 })
  }
  const sl = speedLines.value
  for (const s of sl) {
    s.x -= 6 + speed.value * 1.2
    s.a -= 0.018
  }
  speedLines.value = sl.filter((s) => s.a > 0 && s.x > -40)

  raf = requestAnimationFrame(loop)
}

function resize() {
  const el = stageEl.value
  if (!el) return
  const w = el.clientWidth
  const h = el.clientHeight
  if (w > 0 && h > 0) {
    W.value = Math.min(MAX_W, Math.max(MIN_W, Math.round(H * (w / h))))
  }
}

onMounted(() => {
  resize()
  ro = new ResizeObserver(resize)
  if (stageEl.value) ro.observe(stageEl.value)
  raf = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (ro) ro.disconnect()
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel motion-panel" style="padding: 0">
        <div ref="stageEl" class="motion-stage">
          <svg
            class="motion-svg"
            :viewBox="`0 0 ${W} ${H}`"
            preserveAspectRatio="none"
            role="img"
            aria-label="运动的描述：小车载着乘客在霓虹公路上行驶，可切换地面、车厢、白云为参照物观察运动状态"
          >
            <defs>
              <!-- 黄昏霓虹天空 -->
              <linearGradient id="ml-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#1a1240" />
                <stop offset="0.38" stop-color="#3b2a6b" />
                <stop offset="0.66" stop-color="#9b4a8c" />
                <stop offset="0.86" stop-color="#f2885a" />
                <stop offset="1" stop-color="#ffd18a" />
              </linearGradient>
              <linearGradient id="ml-road" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#3a3550" />
                <stop offset="1" stop-color="#211d33" />
              </linearGradient>
              <linearGradient id="ml-grass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#2c3b4a" />
                <stop offset="1" stop-color="#16222e" />
              </linearGradient>
              <linearGradient id="ml-hill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#5a3f7a" />
                <stop offset="1" stop-color="#33245a" />
              </linearGradient>
              <linearGradient id="ml-city" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#241a47" />
                <stop offset="1" stop-color="#3a2a63" />
              </linearGradient>
              <linearGradient id="ml-car" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#46e8d2" />
                <stop offset="0.5" stop-color="#19b6c9" />
                <stop offset="1" stop-color="#0e7aa6" />
              </linearGradient>
              <linearGradient id="ml-car2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#ff8fb0" />
                <stop offset="1" stop-color="#e6396b" />
              </linearGradient>
              <radialGradient id="ml-win" cx="0.4" cy="0.3" r="0.9">
                <stop offset="0" stop-color="#bff6ff" />
                <stop offset="1" stop-color="#5fc8e8" />
              </radialGradient>
              <radialGradient id="ml-sun" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stop-color="#fff1c0" />
                <stop offset="0.55" stop-color="#ffb15a" />
                <stop offset="1" stop-color="#ff8a5a" stop-opacity="0" />
              </radialGradient>
              <linearGradient id="ml-lampglow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#9ff6ff" stop-opacity="0.9" />
                <stop offset="1" stop-color="#9ff6ff" stop-opacity="0" />
              </linearGradient>
              <filter id="ml-soft" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#0a0a1a" flood-opacity="0.4" />
              </filter>
              <filter id="ml-glow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="7" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <!-- 车道虚线（滚动） -->
              <pattern id="ml-lane" x="0" y="0" width="150" height="14" patternUnits="userSpaceOnUse">
                <rect x="0" y="3" width="64" height="8" rx="4" fill="rgba(255,236,170,0.92)" />
              </pattern>
              <!-- 远山（视差滚动） -->
              <pattern id="ml-hill" x="0" y="0" width="460" height="200" patternUnits="userSpaceOnUse">
                <path d="M0 200 Q115 36 230 200 Z" fill="url(#ml-hill)" />
                <path d="M230 200 Q330 86 460 200 Z" fill="url(#ml-hill)" opacity="0.65" />
              </pattern>
              <!-- 城市剪影（中景视差滚动） -->
              <pattern id="ml-city" x="0" y="0" width="520" height="150" patternUnits="userSpaceOnUse">
                <rect x="10" y="60" width="46" height="90" fill="url(#ml-city)" />
                <rect x="70" y="30" width="34" height="120" fill="url(#ml-city)" />
                <rect x="118" y="78" width="58" height="72" fill="url(#ml-city)" />
                <rect x="190" y="44" width="30" height="106" fill="url(#ml-city)" />
                <rect x="232" y="20" width="42" height="130" fill="url(#ml-city)" />
                <rect x="290" y="70" width="52" height="80" fill="url(#ml-city)" />
                <rect x="356" y="40" width="36" height="110" fill="url(#ml-city)" />
                <rect x="406" y="84" width="60" height="66" fill="url(#ml-city)" />
                <rect x="478" y="52" width="30" height="98" fill="url(#ml-city)" />
                <g fill="#ffd98a" opacity="0.55">
                  <rect x="20" y="74" width="6" height="6" /><rect x="34" y="92" width="6" height="6" />
                  <rect x="78" y="46" width="6" height="6" /><rect x="90" y="70" width="6" height="6" />
                  <rect x="242" y="36" width="6" height="6" /><rect x="258" y="60" width="6" height="6" />
                  <rect x="364" y="56" width="6" height="6" /><rect x="486" y="68" width="6" height="6" />
                </g>
              </pattern>
              <!-- 霓虹街灯（滚动） -->
              <pattern id="ml-lamp" x="0" y="0" width="460" height="120" patternUnits="userSpaceOnUse">
                <g>
                  <rect x="40" y="20" width="7" height="80" rx="2" fill="#2a2740" />
                  <path d="M40 20 q30 -2 56 0 l0 8 q-28 2 -56 0 Z" fill="#2a2740" />
                  <circle cx="68" cy="30" r="10" fill="#9ff6ff" filter="url(#ml-glow)" />
                  <rect x="44" y="34" width="22" height="10" fill="url(#ml-lampglow)" opacity="0.8" />
                  <circle cx="68" cy="30" r="4.5" fill="#ffffff" />
                </g>
              </pattern>
            </defs>

            <!-- 天空（满铺） -->
            <rect x="0" y="0" :width="W" :height="H" fill="transparent" />
            <!-- 星点 -->
            <g>
              <circle
                v-for="(s, i) in stars" :key="i"
                :cx="s.rx * W" :cy="s.ry * H" :r="s.r"
                fill="#ffffff" :opacity="s.o" class="star" :style="{ animationDelay: s.d + 's' }"
              />
            </g>
            <!-- 落日辉光 -->
            <circle :cx="W - 130" cy="96" r="150" fill="url(#ml-sun)" />
            <circle :cx="W - 130" cy="96" r="42" fill="#ffe7a6" />
            <circle :cx="W - 130" cy="96" r="42" fill="#fff4cf" opacity="0.5" filter="url(#ml-glow)" />

            <!-- 远山/城市剪影已移除：统一露出黑板底，仅保留地平线处的霓虹公路 -->

            <!-- 背景氛围云（随白云速度漂移，w=0 时静止） -->
            <g fill="rgba(255,255,255,0.14)">
              <g :transform="`translate(${mod(cloudDrift1, W + 320) - 160} 78)`">
                <circle cx="0" cy="0" r="22" /><circle cx="24" cy="-13" r="28" /><circle cx="54" cy="-4" r="24" /><circle cx="28" cy="11" r="26" />
              </g>
              <g :transform="`translate(${mod(cloudDrift2, W + 320) - 160} 132)`">
                <circle cx="0" cy="0" r="17" /><circle cx="20" cy="-11" r="22" /><circle cx="44" cy="-3" r="19" /><circle cx="22" cy="10" r="20" />
              </g>
            </g>

            <!-- 地面已移除：统一露出黑板底（地平线处的路面/车道线保留） -->
            <!-- 柏油路面（road.png 平铺，沿车速反向滚动 → laneOffset） -->
            <g :transform="`translate(${-laneOffset} ${groundY})`">
              <image
                v-for="i in ROAD_TILES" :key="i - 1"
                :x="(i - 1) * ROAD_TILE_W" y="0"
                :width="ROAD_TILE_W" :height="ROAD_H"
                preserveAspectRatio="none"
                href="/assets/lab/road.png"
              />
            </g>
            <!-- 霓虹街灯已移除：统一露出黑板底 -->

            <!-- 速度线 -->
            <g>
              <line
                v-for="s in speedLines" :key="s.id"
                :x1="s.x" :y1="s.y" :x2="s.x + s.len" :y2="s.y"
                stroke="rgba(159,246,255,0.7)" stroke-width="2" :stroke-opacity="Math.max(0, s.a)"
                stroke-linecap="round"
              />
            </g>

            <!-- 参照物高亮：选白云时圈出白云 -->
            <circle
              v-if="reference === 'cloud'"
              :cx="cloudX" :cy="cloudY + 4" r="66"
              fill="none" stroke="#ff4d7d" stroke-width="3" stroke-dasharray="10 9"
              opacity="0.9"
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-38" dur="1.1s" repeatCount="indefinite" />
            </circle>
            <!-- 参照物高亮：选车厢时圈出汽车 -->
            <circle
              v-if="reference === 'car'"
              :cx="carX" :cy="groundY - 56" r="84"
              fill="none" stroke="#ff4d7d" stroke-width="3" stroke-dasharray="10 9"
              opacity="0.9"
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-38" dur="1.1s" repeatCount="indefinite" />
            </circle>

            <!-- 白云（cloud.png 贴纸，参照物本体） -->
            <image
              href="/assets/lab/cloud.png"
              :x="cloudX - CLOUD_W / 2" :y="cloudY - CLOUD_H / 2"
              :width="CLOUD_W" :height="CLOUD_H"
              filter="url(#ml-soft)"
            />

            <!-- 汽车（car.png 贴纸，车轮贴路面，保留微跳 carBounce） -->
            <image
              href="/assets/lab/car.png"
              :x="carX - CAR_W / 2" :y="groundY - CAR_H * 0.78 - carBounce"
              :width="CAR_W" :height="CAR_H"
              filter="url(#ml-soft)"
            />

            <!-- 尾气粒子 -->
            <g>
              <circle
                v-for="p in puffs" :key="p.id"
                :cx="p.x" :cy="p.y" :r="p.r"
                :fill="`rgba(159,246,255,${Math.max(0, p.a)})`"
              />
            </g>

            <!-- 物体状态标签 -->
            <g :transform="`translate(${carX} ${groundY - 156})`" v-if="verdict.car !== '静止' || reference !== 'ground'">
              <rect x="-46" y="-16" width="92" height="27" rx="13" fill="rgba(20,16,40,0.82)" stroke="#46e8d2" stroke-width="1.6" />
              <text x="0" y="4" text-anchor="middle" font-size="14" font-weight="800" fill="#46e8d2">{{ verdict.car }}</text>
            </g>
            <g :transform="`translate(${cloudX} ${cloudY - 60})`">
              <rect x="-46" y="-16" width="92" height="27" rx="13" fill="rgba(20,16,40,0.82)" stroke="#ff8fb0" stroke-width="1.6" />
              <text x="0" y="4" text-anchor="middle" font-size="14" font-weight="800" :fill="verdict.cloud === '静止' ? '#5fe6a0' : '#ff8fb0'">{{ verdict.cloud }}</text>
            </g>

            <!-- 标题 -->
            <text x="34" y="42" font-size="22" font-weight="900" fill="#ffffff">运动的描述 · 参照物</text>
            <text x="34" y="64" font-size="14" fill="rgba(255,255,255,0.75)">换一个参照物，再看谁动谁静</text>

            <!-- 玻璃拟态结论卡片（右上角；窄屏自动隐藏，避免遮挡汽车） -->
            <g class="ml-card">
              <rect :x="cardX" y="16" :width="cardW" :height="cardH" rx="14" fill="rgba(18,14,38,0.62)" stroke="rgba(159,246,255,0.5)" stroke-width="1.4" />
              <rect :x="cardX" y="16" :width="cardW" height="30" rx="14" fill="rgba(70,232,210,0.16)" />
              <text :x="cardX + 18" y="37" font-size="14" font-weight="800" fill="#46e8d2">参照物：{{ refLabel }}</text>
              <text :x="cardX + 18" y="66" font-size="13" fill="#f3f6ff">汽车：{{ verdict.car }}</text>
              <text :x="cardX + 18" y="88" font-size="13" fill="#f3f6ff">车内人：{{ verdict.person }}</text>
              <text :x="cardX + 18" y="110" font-size="13" fill="#f3f6ff">白云：{{ verdict.cloud }}</text>
              <text :x="cardX + 18" y="132" font-size="13" fill="#f3f6ff">地面景物：{{ verdict.ground }}</text>
            </g>
          </svg>
        </div>
      </div>

      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': reference === 'ground' }" @click="pickReference('ground')">以地面为参照物</button>
        <button class="btn" :class="{ 'btn-primary': reference === 'car' }" @click="pickReference('car')">以车厢为参照物</button>
        <button class="btn" :class="{ 'btn-primary': reference === 'cloud' }" @click="pickReference('cloud')">以白云为参照物</button>
        <button class="btn" @click="reset">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>可调变量</strong>
          <span>实时联动</span>
        </div>
        <div class="lab-params">
          <ParamSlider
            v-model="speed"
            :min="1"
            :max="10"
            :step="0.5"
            label="车速 v"
            unit=" m/s"
            hint="速度只影响快慢，不影响运动/静止的判断"
          />
          <ParamSlider
            v-model="cloudSpeed"
            :min="0"
            :max="10"
            :step="0.5"
            label="白云速度 w"
            unit=" m/s"
            hint="与车速相同时，白云与车相对静止；不同则彼此运动"
          />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实时数据</strong>
          <span>只读输出</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat">
            <span>参照物</span>
            <strong style="font-size:13px">{{ refLabel }}</strong>
          </div>
          <div class="lab-stat accent">
            <span>车速（换算）</span>
            <strong>{{ speed }} m/s = {{ speedKmh }} km/h</strong>
          </div>
          <div class="lab-stat accent">
            <span>白云速度（换算）</span>
            <strong>{{ cloudSpeed }} m/s = {{ cloudKmh }} km/h</strong>
          </div>
          <div class="lab-stat success">
            <span>车内人</span>
            <strong style="font-size:13px">{{ verdict.person }}（相对参照物）</strong>
          </div>
          <div class="lab-stat">
            <span>白云</span>
            <strong style="font-size:13px">{{ verdict.cloud }}（相对参照物）</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="运动的描述"
        formula="v = s / t"
        desc="机械运动：物体位置的变化。判断运动还是静止，要看它相对于参照物的位置是否改变。"
        :rows="[
          { label: '车速 v', value: speed + ' m/s' },
          { label: '换算（×3.6）', value: speedKmh + ' km/h' }
        ]"
        :result="[
          { label: '1 m/s', value: '3.6 km/h' },
          { label: '参照物', value: refLabel }
        ]"
        :verify="[
          '参照物：判断物体运动或静止时，被选作标准的物体',
          '不能选研究对象本身作为参照物（自身永远相对自己静止）',
          '相对静止：同速同向运动的两个物体，彼此相对静止（云与车）',
          '通常默认以地面或地面上固定不动的物体为参照物'
        ]"
      />
    </aside>
  </div>
</template>

<style scoped>
.motion-panel {
  overflow: hidden;
}
/* 容器保持 viewBox 比例，配合动态 viewBox 使画面满铺、零留白 */
.motion-stage {
  width: 100%;
  aspect-ratio: 1000 / 520;
  max-height: 72vh;
  background: transparent;
}
.motion-svg {
  display: block;
  width: 100%;
  height: 100%;
  /* 关键：SVG 经 .motion-stage 包裹，不是 .lab-panel 直接子元素，
     必须自己浮到 ::before 黑板背景之上（否则被 z-index:0 的伪元素盖住，画面全空） */
  position: relative;
  z-index: 1;
}
.star {
  animation: ml-twinkle 2.6s ease-in-out infinite;
}
@keyframes ml-twinkle {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.95; }
}

/* ===== 移动端优化 ===== */
/* 平板/手机：取消 1000:520 的扁比例，改为按视口高度给足动画区，避免被压成细条 */
@media (max-width: 768px) {
  .motion-stage {
    aspect-ratio: auto;
    height: 42vh;
    min-height: 220px;
    max-height: 360px;
  }
}
/* 手机：隐藏 SVG 内结论卡片，避免遮挡居中汽车（判定信息已在下方数据面板呈现） */
@media (max-width: 640px) {
  .ml-card {
    display: none;
  }
}
</style>
