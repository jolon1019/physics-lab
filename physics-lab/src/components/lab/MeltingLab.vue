<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

// ===== 可调变量 =====
const material = ref('sea') // 'sea' 海波(晶体) | 'wax' 石蜡(非晶体)
const heatRate = ref(50) // 加热功率 0~100，影响升温快慢

// ===== 物理模型（温度—时间）=====
const T_START = { sea: 40, wax: 50 }
const MELT = 48 // 海波熔点
const T_END = { sea: 60, wax: 68 }
const Tmax = 72
const Tmin = 30
const DURATION = 14 // 动画总时长（慢放后的“屏显秒”）
const SLOWMO = 1.6

// 海波：0~4s 升温到 48；4~8s 熔化平台；8~12s 液升温到 60；之后保持
// 石蜡：50→68 平滑上升（无平台）
function modelTemp(mat, t) {
  const rate = 0.5 + (heatRate.value / 100) * 1.2
  if (mat === 'sea') {
    if (t < 4) return T_START.sea + (MELT - T_START.sea) * (t / 4)
    if (t < 8) return MELT
    if (t < 12) return MELT + (T_END.sea - MELT) * ((t - 8) / 4)
    return T_END.sea
  }
  // 石蜡：用 rate 缩放时间，平滑上升
  const tt = Math.min(t * rate, 1)
  return T_START.wax + (T_END.wax - T_START.wax) * Math.pow(tt, 0.85)
}

// ===== 状态 =====
const state = ref('ready') // ready | running | done
const tNow = ref(0)
const temp = ref(T_START.sea)
const points = ref([]) // {t, T}
let completed = false
const hint = ref('选择物质后点击「开始加热」，观察温度—时间图像的形成')
const startBtn = ref('开始加热')

const isCrystal = computed(() => material.value === 'sea')

// ===== 公式面板 =====
const formulaRows = computed(() => [
  { label: '当前物质', value: isCrystal.value ? '海波（晶体）' : '石蜡（非晶体）' },
  { label: '当前温度', value: `${temp.value.toFixed(1)} ℃` },
  { label: '计时', value: `${tNow.value.toFixed(1)} s` }
])
const formulaResults = computed(() => {
  if (state.value !== 'done') return []
  if (isCrystal.value) {
    return [
      { label: '是否有固定熔点', value: '有' },
      { label: '熔点', value: `${MELT} ℃` },
      { label: '熔化时温度变化', value: '保持不变' }
    ]
  }
  return [
    { label: '是否有固定熔点', value: '无' },
    { label: '熔点', value: '—' },
    { label: '熔化时温度变化', value: '持续上升' }
  ]
})
const verifySteps = computed(() => [
  isCrystal.value
    ? '海波是晶体：升温到 48℃ 后温度不变（熔化平台），固液共存'
    : '石蜡是非晶体：整个熔化过程温度持续上升，没有平台',
  '晶体熔化条件：达到熔点且持续吸热（熄灭酒精灯即停止熔化）',
  '在坐标系中描点连线，得到温度—时间图像',
  '对比可知：晶体图像有水平段，非晶体图像平滑上升'
])

// ===== Canvas（左侧装置 + 右侧 T-t 图）=====
const canvasRef = ref(null)
let ctx = null
let raf = null
let lastT = null
const dpr = () => Math.min(window.devicePixelRatio || 1, 2)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

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

// 左侧实验装置：铁架台 + 烧杯 + 水浴 + 试管 + 温度计 + 酒精灯
function drawSetup(L) {
  const cx = L.W * 0.27
  const baseY = L.H - 70
  // 铁架台底座
  ctx.fillStyle = '#8a8f98'
  rr(cx - 60, baseY, 120, 12, 4)
  ctx.fill()
  ctx.fillRect(cx - 4, baseY - 150, 8, 150)
  // 酒精灯
  const lampX = cx - 70
  const lampY = baseY + 6
  ctx.fillStyle = '#c4453d'
  rr(lampX, lampY, 34, 28, 6)
  ctx.fill()
  ctx.fillStyle = '#7a7a7a'
  rr(lampX + 12, lampY - 8, 10, 8, 3)
  ctx.fill()
  // 火焰（加热时）
  if (state.value === 'running' || state.value === 'done') {
    ctx.fillStyle = '#f5a623'
    ctx.beginPath()
    ctx.moveTo(lampX + 17, lampY - 8)
    ctx.quadraticCurveTo(lampX + 26, lampY - 26, lampX + 17, lampY - 34)
    ctx.quadraticCurveTo(lampX + 8, lampY - 26, lampX + 17, lampY - 8)
    ctx.fill()
  }
  // 烧杯（水浴）
  const bw = 120
  const bx = cx - bw / 2 + 4
  const by = baseY - 110
  const bh = 96
  ctx.fillStyle = 'rgba(180,210,235,0.55)'
  rr(bx, by, bw, bh, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(80,90,110,0.6)'
  ctx.lineWidth = 2
  rr(bx, by, bw, bh, 8)
  ctx.stroke()
  // 水浴水面波纹
  ctx.strokeStyle = 'rgba(90,140,200,0.5)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let x = bx + 6; x < bx + bw - 6; x += 6) {
    const yy = by + 14 + Math.sin((x + (state.value === 'running' ? performance.now() / 200 : 0)) / 10) * 2
    if (x === bx + 6) ctx.moveTo(x, yy)
    else ctx.lineTo(x, yy)
  }
  ctx.stroke()
  // 试管（装固体）
  const tw = 26
  const tx = cx - tw / 2 + 4
  const ty = by - 6
  const th = 70
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  rr(tx, ty, tw, th, 6)
  ctx.fill()
  ctx.strokeStyle = 'rgba(80,90,110,0.7)'
  ctx.lineWidth = 2
  rr(tx, ty, tw, th, 6)
  ctx.stroke()
  // 固体（熔化状态：晶体在平台期为固液共存）
  const melted = isCrystal.value ? tNow.value >= 4 && tNow.value < 8 : tNow.value > 6
  ctx.fillStyle = melted ? '#e0b34f' : '#caa24a'
  rr(tx + 4, ty + th - 30, tw - 8, 26, 4)
  ctx.fill()
  if (melted) {
    ctx.fillStyle = 'rgba(224,179,79,0.5)'
    ctx.fillRect(tx + 4, ty + 18, tw - 8, th - 46)
  }
  // 温度计插入试管
  const tgx = tx + tw / 2
  const tgy0 = ty - 40
  const tgy1 = ty + th - 18
  ctx.strokeStyle = 'rgba(80,90,110,0.7)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(tgX(tgx), tgy0)
  ctx.lineTo(tgX(tgx), tgy1)
  ctx.stroke()
  // 汞柱位置
  const f = clamp((temp.value - Tmin) / (Tmax - Tmin), 0, 1)
  const my = tgy1 - (tgy1 - tgy0) * f
  ctx.strokeStyle = '#e0584f'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(tgX(tgx), my)
  ctx.lineTo(tgX(tgx), tgy1)
  ctx.stroke()
  // 标签
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(isCrystal.value ? '海波' : '石蜡', cx, baseY + 20)
}
function tgX(x) {
  return x
}

// 右侧 T-t 图
function drawGraph(L) {
  const gx = L.W * 0.52
  const gy = 70
  const gw = L.W * 0.42
  const gh = L.H - 160
  // 背景
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  rr(gx, gy, gw, gh, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,100,120,0.4)'
  ctx.lineWidth = 1.5
  rr(gx, gy, gw, gh, 8)
  ctx.stroke()
  const padL = 38
  const padB = 28
  const px0 = gx + padL
  const py0 = gy + gh - padB
  const px1 = gx + gw - 12
  const py1 = gy + 14
  const X = (t) => px0 + (t / DURATION) * (px1 - px0)
  const Y = (T) => py0 - ((T - Tmin) / (Tmax - Tmin)) * (py0 - py1)
  // 坐标轴
  ctx.strokeStyle = 'rgba(70,70,80,0.8)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(px0, py1)
  ctx.lineTo(px0, py0)
  ctx.lineTo(px1, py0)
  ctx.stroke()
  // 刻度
  ctx.fillStyle = '#3a3026'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let t = 0; t <= DURATION; t += 2) {
    ctx.fillText(String(t), X(t), py0 + 6)
  }
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let T = Tmin; T <= Tmax; T += 10) {
    ctx.fillText(String(T), px0 - 6, Y(T))
    ctx.strokeStyle = 'rgba(120,120,130,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px0, Y(T))
    ctx.lineTo(px1, Y(T))
    ctx.stroke()
  }
  // 轴名
  ctx.fillStyle = '#3a3026'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('时间 t / s', (px0 + px1) / 2, py0 + 14)
  ctx.save()
  ctx.translate(gx + 12, (py0 + py1) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('温度 T / ℃', 0, 0)
  ctx.restore()
  // 熔点参考线（晶体）
  if (isCrystal.value) {
    ctx.strokeStyle = 'rgba(224,88,79,0.5)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(px0, Y(MELT))
    ctx.lineTo(px1, Y(MELT))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#e0584f'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('熔点 48℃', px0 + 4, Y(MELT) - 2)
  }
  // 曲线
  if (points.value.length > 1) {
    ctx.strokeStyle = isCrystal.value ? '#e0584f' : '#3b6fd4'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    points.value.forEach((p, i) => {
      const xx = X(p.t)
      const yy = Y(p.T)
      if (i === 0) ctx.moveTo(xx, yy)
      else ctx.lineTo(xx, yy)
    })
    ctx.stroke()
    // 当前点
    const last = points.value[points.value.length - 1]
    ctx.fillStyle = isCrystal.value ? '#e0584f' : '#3b6fd4'
    ctx.beginPath()
    ctx.arc(X(last.t), Y(last.T), 4, 0, Math.PI * 2)
    ctx.fill()
  }
  // 标题
  ctx.fillStyle = '#3a3026'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(isCrystal.value ? '海波 T–t 图像' : '石蜡 T–t 图像', gx + 10, gy + 8)
}

function render() {
  if (!ctx) return
  const L = dims()
  ctx.fillStyle = '#f2f0ec'
  ctx.fillRect(0, 0, L.W, L.H)
  drawSetup(L)
  drawGraph(L)
}

// ===== 控制 =====
function startRun() {
  if (state.value === 'running') return
  state.value = 'running'
  tNow.value = 0
  temp.value = T_START[material.value]
  points.value = []
  completed = false
  startBtn.value = '重新加热'
  hint.value = isCrystal.value
    ? '海波升温到 48℃ 后将出现“熔化平台”——温度不变、固液共存'
    : '石蜡全程温度持续上升，没有平台'
  lastT = performance.now()
}

function stopRun() {
  state.value = 'done'
  if (!completed) {
    completed = true
    hint.value = isCrystal.value
      ? '完成！海波在 48℃ 保持平台（有固定熔点），熔化时持续吸热、温度不变。'
      : '完成！石蜡全程温度持续上升，无固定熔点。'
    emit('complete')
  } else {
    hint.value = '再次实验结束，可切换物质对比晶体与非晶体的图像差异。'
  }
}

function resetAll() {
  state.value = 'ready'
  tNow.value = 0
  temp.value = T_START[material.value]
  points.value = []
  completed = false
  startBtn.value = '开始加热'
  hint.value = '选择物质后点击「开始加热」，观察温度—时间图像的形成'
}

function loop(now) {
  if (!lastT) lastT = now
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  if (state.value === 'running') {
    tNow.value += dt * SLOWMO
    const t = tNow.value
    temp.value = modelTemp(material.value, t)
    points.value.push({ t, T: temp.value })
    if (tNow.value >= DURATION) {
      tNow.value = DURATION
      temp.value = T_END[material.value]
      stopRun()
    }
  }
  render()
  raf = requestAnimationFrame(loop)
}

function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render()
}

watch(material, () => {
  // 切换物质时重置
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
          style="display:block;width:100%;height:520px;background:#f2f0ec;touch-action:none;border-radius:8px"
        ></canvas>
      </div>

      <div class="lab-actions">
        <div style="display:flex;gap:8px">
          <button class="btn" :class="{ 'btn-primary': material === 'sea' }" @click="material = 'sea'">海波（晶体）</button>
          <button class="btn" :class="{ 'btn-primary': material === 'wax' }" @click="material = 'wax'">石蜡（非晶体）</button>
        </div>
        <button v-if="state !== 'running'" class="btn btn-primary" @click="startRun">{{ startBtn }}</button>
        <button class="btn" @click="resetAll">重置</button>
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
          <ParamSlider v-model="heatRate" :min="20" :max="100" :step="5" label="加热功率" unit="%" hint="功率越大升温越快，仅影响动画节奏" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实时数据</strong>
          <span>自动记录</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat">
            <span>当前物质</span>
            <strong>{{ isCrystal ? '海波（晶体）' : '石蜡（非晶体）' }}</strong>
          </div>
          <div class="lab-stat accent">
            <span>当前温度</span>
            <strong>{{ temp.toFixed(1) }} ℃</strong>
          </div>
          <div class="lab-stat success">
            <span>计时</span>
            <strong>{{ tNow.toFixed(1) }} s</strong>
          </div>
          <div class="lab-stat" v-if="isCrystal">
            <span>熔点</span>
            <strong>48 ℃</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="公式与结论"
        formula="晶体有熔点，熔化时 T 不变"
        desc="晶体（海波）熔化时温度保持不变、固液共存；非晶体（石蜡）无固定熔点，温度持续上升。熔化需达到熔点且持续吸热。"
        :rows="formulaRows"
        :result="formulaResults"
        :verify="verifySteps"
      />
    </aside>
  </div>
</template>
