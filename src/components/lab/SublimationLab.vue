<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'

const emit = defineEmits(['complete'])

// ===== 可调变量（方法）=====
const method = ref('bath') // 'bath' 热水浴(正确) | 'flame' 酒精灯直火(错误)
const WATER_TEMP = 100 // 热水浴温度 ≈ 100℃
const IODINE_MELT = 113.5 // 碘熔点 ≈ 113.5℃

const isBath = computed(() => method.value === 'bath')

// ===== 状态 =====
const state = ref('ready') // ready | running | done
const tNow = ref(0)
const particles = ref([]) // 蒸气/沉积粒子
let completed = false
const hint = ref('选择加热方式后点击「开始」，观察碘是直接变气体（升华）还是先熔化')
const startBtn = ref('开始')
const warn = ref('')

const conclusion = computed(() => {
  if (state.value !== 'done') return null
  return isBath.value
    ? { title: '升华 + 凝华', ok: true, text: '热水(<113.5℃)使碘直接由固态变气态（升华），冷却后蒸气在冷端直接变固态（凝华）。' }
    : { title: '错误：先熔化', ok: false, text: '直火温度远超碘熔点，碘先熔化成液体，无法证明“固态直接变气态”。应使用热水浴。' }
})

// ===== Canvas =====
const canvasRef = ref(null)
let ctx = null
let raf = null
let lastT = null
const dpr = () => Math.min(window.devicePixelRatio || 1, 2)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const rand = (a, b) => a + Math.random() * (b - a)

function setupCanvas() {
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.round(rect.width * dpr())
  canvas.height = Math.round(rect.height * dpr())
  ctx = canvas.getContext('2d')
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0)
}
function dims() {
  const canvas = canvasRef.value
  return { W: canvas.width / dpr(), H: canvas.height / dpr() }
}
function rr(x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    return
  }
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 玻璃管（碘锤）几何
function tubeGeom(L) {
  const cx = L.W * 0.32
  const top = 80
  const bot = L.H - 150
  const w = 56
  return { cx, top, bot, w, x: cx - w / 2 }
}

function drawApparatus(L) {
  const g = tubeGeom(L)
  const running = state.value === 'running' || state.value === 'done'

  // 加热源：水浴 或 酒精灯
  if (isBath.value) {
    const bx = g.cx - 70
    const by = g.bot - 10
    const bw = 140
    const bh = 96
    ctx.fillStyle = 'rgba(180,210,235,0.5)'
    rr(bx, by, bw, bh, 8)
    ctx.fill()
    ctx.strokeStyle = 'rgba(80,90,110,0.6)'
    ctx.lineWidth = 2
    rr(bx, by, bw, bh, 8)
    ctx.stroke()
    ctx.fillStyle = '#3a3026'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`热水 ≈ ${WATER_TEMP}℃`, g.cx, by + bh + 6)
  } else {
    const lampX = g.cx - 17
    const lampY = g.bot + 24
    ctx.fillStyle = '#c4453d'
    rr(lampX, lampY, 34, 28, 6)
    ctx.fill()
    ctx.fillStyle = '#7a7a7a'
    rr(lampX + 12, lampY - 8, 10, 8, 3)
    ctx.fill()
    if (running) {
      ctx.fillStyle = '#f5a623'
      ctx.beginPath()
      ctx.moveTo(g.cx, lampY - 8)
      ctx.quadraticCurveTo(g.cx + 9, lampY - 26, g.cx, lampY - 34)
      ctx.quadraticCurveTo(g.cx - 9, lampY - 26, g.cx, lampY - 8)
      ctx.fill()
    }
    ctx.fillStyle = '#3a3026'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('酒精灯直火', g.cx, lampY + 34)
  }

  // 玻璃管
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  rr(g.x, g.top, g.w, g.bot - g.top, 10)
  ctx.fill()
  ctx.strokeStyle = 'rgba(80,90,110,0.7)'
  ctx.lineWidth = 2.5
  rr(g.x, g.top, g.w, g.bot - g.top, 10)
  ctx.stroke()

  // 底部固态碘（随实验消耗）
  const solidFrac = isBath.value
    ? clamp(1 - tNow.value / 8, 0.15, 1)
    : clamp(1 - tNow.value / 6, 0.2, 1)
  const solidH = 26 * solidFrac
  ctx.fillStyle = '#6b3fa0'
  rr(g.x + 8, g.bot - solidH - 4, g.w - 16, solidH, 4)
  ctx.fill()

  // 直火时：底部出现液态碘（紫红，已熔化）
  if (!isBath.value && running) {
    const liqH = 16 * clamp(tNow.value / 6, 0, 1)
    ctx.fillStyle = 'rgba(150,60,160,0.85)'
    rr(g.x + 10, g.bot - liqH - 2, g.w - 20, liqH, 6)
    ctx.fill()
  }

  // 顶部沉积的固态碘（凝华，仅水浴且冷却后明显）
  if (isBath.value && state.value === 'done') {
    ctx.fillStyle = '#6b3fa0'
    rr(g.x + 8, g.top + 6, g.w - 16, 18, 4)
    ctx.fill()
  }

  // 紫色碘蒸气粒子
  for (const p of particles.value) {
    if (p.settled) {
      ctx.fillStyle = '#6b3fa0'
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillStyle = 'rgba(120,60,170,0.7)'
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 标签
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('密封玻璃管（碘锤）', g.cx, g.bot + 44)
}

function drawCompare(L) {
  // 右下角：水浴温度 vs 碘熔点 对比条
  const x = L.W * 0.6
  const y = L.H - 150
  const w = L.W * 0.34
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  rr(x, y, w, 110, 10)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,100,120,0.3)'
  ctx.lineWidth = 1
  rr(x, y, w, 110, 10)
  ctx.stroke()
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('温度判据', x + 12, y + 10)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillText(`水浴温度 ≈ ${WATER_TEMP}℃`, x + 12, y + 36)
  ctx.fillText(`碘熔点 ≈ ${IODINE_MELT}℃`, x + 12, y + 56)
  const ok = WATER_TEMP < IODINE_MELT
  ctx.fillStyle = ok ? '#2faf6b' : '#e0584f'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.fillText(ok ? `${WATER_TEMP}℃ < ${IODINE_MELT}℃ → 升华` : `${WATER_TEMP}℃ > ${IODINE_MELT}℃ → 熔化`, x + 12, y + 82)
}

function render() {
  if (!ctx) return
  const L = dims()
  paintBoard(ctx, L.W, L.H, 'chalk')
  drawApparatus(L)
  drawCompare(L)
}

// ===== 控制 =====
function startRun() {
  if (state.value === 'running') return
  state.value = 'running'
  tNow.value = 0
  particles.value = []
  completed = false
  startBtn.value = '重新开始'
  warn.value = ''
  lastT = performance.now()
  hint.value = isBath.value
    ? '加热中…观察紫色碘蒸气上升（固态直接变气态）'
    : '加热中…注意碘是否先熔化（变成液体）'
}

function stopRun() {
  state.value = 'done'
  if (!completed) {
    completed = true
    if (isBath.value) {
      hint.value = '完成！碘在低于熔点时被加热，直接升华成紫色蒸气，冷却后凝华成固态碘。'
      emit('complete')
    } else {
      hint.value = '完成，但方式错误：直火使碘先熔化，无法证明升华。请改用热水浴。'
    }
  } else {
    hint.value = '再次实验结束，可切换加热方式对比。'
  }
}

function resetAll() {
  state.value = 'ready'
  tNow.value = 0
  particles.value = []
  completed = false
  startBtn.value = '开始'
  warn.value = ''
  hint.value = '选择加热方式后点击「开始」，观察碘是直接变气体（升华）还是先熔化'
}

function loop(now) {
  if (!lastT) lastT = now
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  const g = tubeGeom(dims())
  if (state.value === 'running' || state.value === 'done') {
    tNow.value += dt * 1.4
    // 产生蒸气
    if (state.value === 'running' && isBath.value && tNow.value < 8) {
      if (Math.random() < 0.4) {
        particles.value.push({
          x: g.cx + rand(-14, 14),
          y: g.bot - 30,
          vy: rand(30, 55),
          settled: false,
          targetY: rand(g.top + 10, g.top + 40)
        })
      }
    }
    // 更新粒子
    for (const p of particles.value) {
      if (!p.settled) {
        p.y -= p.vy * dt
        if (p.y <= p.targetY) {
          p.y = p.targetY
          p.settled = true
        }
      }
    }
    if (tNow.value >= 9) stopRun()
  }
  render()
  raf = requestAnimationFrame(loop)
}

function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render()
}

watch(method, () => {
  if (state.value !== 'running') resetAll()
})

let resizeObs = null
onMounted(() => {
  setupCanvas()
  render()
  if (window.ResizeObserver) {
    resizeObs = new ResizeObserver(resizeCanvas)
    resizeObs.observe(canvasRef.value.parentElement)
  }
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (resizeObs) resizeObs.disconnect()
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel" style="padding:0">
        <canvas
          ref="canvasRef"
          style="display:block;width:100%;height:520px;touch-action:none;border-radius:8px"
        ></canvas>
      </div>

      <div class="lab-actions">
        <div style="display:flex;gap:8px">
          <button class="btn" :class="{ 'btn-primary': isBath }" @click="method = 'bath'">热水浴（正确）</button>
          <button class="btn" :class="{ 'btn-primary': !isBath }" @click="method = 'flame'">酒精灯直火</button>
        </div>
        <button v-if="state !== 'running'" class="btn btn-primary" @click="startRun">{{ startBtn }}</button>
        <button class="btn" @click="resetAll">重置</button>
        <span class="feedback" :class="completed && isBath ? 'ok' : 'no'">{{ hint }}</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>关键判据</strong>
          <span>碘熔点 113.5℃</span>
        </div>
        <p style="font-size:14px;line-height:1.7;color:var(--text)">
          热水浴温度约 <b>100℃</b>，<b>低于</b>碘熔点 113.5℃，碘<b>不熔化</b>而直接升华成紫色蒸气；若用酒精灯直火（远超熔点），碘会先<b>熔化</b>，无法证明升华。
        </p>
      </div>

      <div class="lab-panel" v-if="conclusion">
        <div class="lab-panel-head">
          <strong>实验结论</strong>
        </div>
        <p style="font-size:14px;line-height:1.7" :style="{ color: conclusion.ok ? 'var(--ok)' : 'var(--danger)' }">
          <b>{{ conclusion.title }}</b>：{{ conclusion.text }}
        </p>
      </div>

      <FormulaPanel
        title="公式与概念"
        formula="升华：固→气（吸热）"
        desc="升华是固态直接变成气态（吸热），凝华是气态直接变成固态（放热）。碘在低于熔点的热水中直接升华，冷却后在冷端凝华成固态碘。"
        :rows="[
          { label: '水浴温度', value: WATER_TEMP + ' ℃' },
          { label: '碘熔点', value: IODINE_MELT + ' ℃' },
          { label: '现象', value: isBath ? '固态→气态（升华）' : '固态→液态（熔化）' }
        ]"
        :result="conclusion ? [{ label: '结论', value: conclusion.title }] : []"
        :verify="[
          '热水浴使碘升华而不熔化，证明“固态直接变气态”',
          '移开热源冷却，蒸气在冷端凝华成固态碘',
          '不可用酒精灯直火：温度超熔点会先熔化，不能证明升华'
        ]"
      />
    </aside>
  </div>
</template>
