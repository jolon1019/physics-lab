<script setup>
import { boardFg, boardText } from '../../lib/boardText'

import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

// ===== 装置素材（cartoon 风格 PNG；用 /assets/lab/* 静态直链）=====
const standImg    = new Image(); standImg.src   = '/assets/lab/sancengzhijia.png'
const beakerImg   = new Image(); beakerImg.src  = '/assets/lab/shaobei.png'
const tubeImg     = new Image(); tubeImg.src    = '/assets/lab/shiguan.png'
const thermoImg   = new Image(); thermoImg.src  = '/assets/lab/wenduji.png'
const lampOffImg  = new Image(); lampOffImg.src = '/assets/lab/jiujingdeng-off.png'
const lampOnImg   = new Image(); lampOnImg.src  = '/assets/lab/jiujingdeng-on.png'

// 各素材不透明 bbox（用 PIL alpha.bbox() 测得），用于按需缩放时保持内容宽高比 & 底边对齐。
// 格式：[opaqueBotY, opaqueW, opaqueH]
//   opaqueBotY 源图像内不透明区域底部 y（像素），与 400×400 帧顶的距离
//   opaqueW/H  不透明区域的宽高
// 拿掉透明 padding 后只剩实际可见物件，按 opaqueW/H 算缩放，再用 opaqueBotY 把图实际底部对齐到 baseline。
const IMG_META = {
  stand:    [389, 226, 389],   // 三脚铁架台
  beaker:   [388, 291, 370],   // 烧杯
  tube:     [389, 125, 375],   // 试管
  thermo:   [388, 144, 384],   // 温度计
  lampOff:  [390, 253, 247],   // 酒精灯（关）
  lampOn:   [390, 253, 368],   // 酒精灯（开，含火焰）
}

// 放置素材图：把不透明底边对齐到 baseline，居中于 xCenter；按目标内容宽 targetContentW 缩放。
// 返回 {x, y, w, h}（逻辑坐标），未加载 / 参数缺失返回 null。name 用于编辑器命中测试。
function placeAsset(img, meta, xCenter, baseline, targetContentW, name) {
  if (xCenter == null || baseline == null || !targetContentW) return null
  if (!img.complete || !img.naturalWidth) return null
  const [opaqueBotY, opaqueW, opaqueH] = meta
  const scale = targetContentW / opaqueW
  const drawW = 400 * scale        // 整张 400×400 帧绘制宽（包含透明 padding）
  const drawH = 400 * scale        // 高
  const drawX = xCenter - drawW / 2
  const drawY = baseline - opaqueBotY * scale
  ctx.drawImage(img, drawX, drawY, drawW, drawH)
  const rect = { x: drawX, y: drawY, w: drawW, h: drawH, cx: xCenter, baseline }
  if (name) lastRects[name] = rect
  return rect
}

// ===== 摆放编辑器（editMode 下可拖动 / 滚轮缩放每个元件）=====
// 每个元件用绝对逻辑坐标 {x:中心x, baseline:底部y, w:内容宽} 描述，便于手动微调。
const editMode = ref(false)
const selected = ref('stand')          // 当前选中的元件
const layout = reactive({})            // 各元件坐标（drawSetup 直接使用）
const lastRects = {}                   // 每帧绘制后记录实际矩形，用于命中测试 & 高亮
// 编辑器内实时显示 / 复制用：随 layout 与画布尺寸自动更新
const layoutJson = computed(() => {
  const L = canvasRef.value ? dims() : { W: 0, H: 0 }
  return JSON.stringify(
    { _canvas: { W: Math.round(L.W), H: Math.round(L.H) }, layout: { ...layout } },
    null, 1
  )
})

// 按当前画布尺寸算默认布局（即原内联公式的显式坐标版）
function computeDefaults(L) {
  const cx = L.W * 0.27
  const baseY = L.H - 70
  const standW = Math.min(86, L.W * 0.13)
  const beakerW = Math.min(110, L.W * 0.16)
  const tubeW = Math.min(38, beakerW * 0.32)
  const thermoW = Math.min(26, beakerW * 0.22)
  const lampW = Math.min(46, L.W * 0.07)
  const beakerBottomY = baseY - 130
  const tubeCx = cx - 12
  const tubeBottomY = beakerBottomY + 4
  const thermoCx = cx + (tubeW / 2) + (thermoW / 2) + 2
  const thermoBottomY = tubeBottomY - 60
  const lampCx = Math.max(60, cx - standW * 0.85)
  return {
    stand:  { x: cx, baseline: baseY, w: standW },
    beaker: { x: cx, baseline: beakerBottomY, w: beakerW },
    tube:   { x: tubeCx, baseline: tubeBottomY, w: tubeW },
    thermo: { x: thermoCx, baseline: thermoBottomY, w: thermoW },
    lamp:   { x: lampCx, baseline: baseY, w: lampW },
  }
}
function applyDefaults() {
  const L = dims()
  Object.assign(layout, computeDefaults(L))
}

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

// 左侧实验装置（cartoon PNG 拼接）：铁架台 + 酒精灯 + 烧杯 + 试管 + 温度计
// 所有元件位置来自 layout（编辑模式下可手动拖动 / 缩放）
function drawSetup(L) {
  // 1) 三脚铁架台：底部贴 baseline（先画，最深）
  placeAsset(standImg, IMG_META.stand, layout.stand.x, layout.stand.baseline, layout.stand.w, 'stand')

  // 2) 烧杯
  const beakerRect = placeAsset(beakerImg, IMG_META.beaker, layout.beaker.x, layout.beaker.baseline, layout.beaker.w, 'beaker')

  // 3) 试管：底部浸入烧杯
  const tubeRect = placeAsset(tubeImg, IMG_META.tube, layout.tube.x, layout.tube.baseline, layout.tube.w, 'tube')

  // 4) 温度计：紧贴试管右侧
  const thermoRect = placeAsset(thermoImg, IMG_META.thermo, layout.thermo.x, layout.thermo.baseline, layout.thermo.w, 'thermo')

  // 5) 酒精灯（离立柱有一定间距）：底部贴 baseline
  const isOn = state.value === 'running' || state.value === 'done'
  const lampImg = isOn ? lampOnImg : lampOffImg
  const lampMeta = isOn ? IMG_META.lampOn : IMG_META.lampOff
  placeAsset(lampImg, lampMeta, layout.lamp.x, layout.lamp.baseline, layout.lamp.w, 'lamp')

  // 6) 汞柱动态显示：图片加载完成前不画（避免 null.y）
  if (thermoRect) {
    const thermoScale = thermoRect.w / 400
    const bulbY0 = thermoRect.y + 350 * thermoScale   // 汞泡顶
    const bulbY1 = thermoRect.y + 388 * thermoScale   // 汞泡底（=温度计可见底）
    const mercuryTopY = bulbY0 - (bulbY0 - (thermoRect.y + 20 * thermoScale)) * clamp((temp.value - Tmin) / (Tmax - Tmin), 0, 1)
    ctx.fillStyle = '#e0584f'
    ctx.fillRect(thermoRect.x + thermoRect.w / 2 - 3, mercuryTopY, 6, bulbY1 - mercuryTopY)
    ctx.strokeStyle = 'rgba(60,30,30,0.45)'
    ctx.lineWidth = 1
    ctx.strokeRect(thermoRect.x + thermoRect.w / 2 - 3, mercuryTopY, 6, bulbY1 - mercuryTopY)
  }

  // 7) 物质标签（在铁架台脚下）
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(isCrystal.value ? '海波' : '石蜡', layout.stand.x, layout.stand.baseline + 14)

  // 8) 编辑器高亮：选中元件画虚线框
  if (editMode.value && selected.value && lastRects[selected.value]) {
    const r = lastRects[selected.value]
    ctx.save()
    ctx.strokeStyle = '#ffcf33'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8)
    ctx.restore()
  }
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
  ctx.fillStyle = boardText(ctx.canvas)
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
  ctx.fillStyle = boardText(ctx.canvas)
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
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(isCrystal.value ? '海波 T–t 图像' : '石蜡 T–t 图像', gx + 10, gy + 8)
}

function render() {
  if (!ctx) return
  const L = dims()
  paintBoard(ctx, L.W, L.H, 'chalk')
  drawSetup(L)
  drawGraph(L)
}

// ===== 摆放编辑器：交互（拖动 / 滚轮缩放 / 方向键微调）=====
let dragging = false
let dragStart = null

function toLogical(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}
function hitTest(lx, ly) {
  // 逆向绘制顺序：后画的在上层
  const order = ['lamp', 'thermo', 'tube', 'beaker', 'stand']
  for (const name of order) {
    const r = lastRects[name]
    if (!r) continue
    if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) return name
  }
  return null
}
function onPointerDown(e) {
  if (!editMode.value) return
  const { x, y } = toLogical(e)
  const name = hitTest(x, y)
  if (name) {
    selected.value = name
    dragging = true
    dragStart = { name, lx: x, ly: y, x: layout[name].x, baseline: layout[name].baseline }
    try { canvasRef.value.setPointerCapture?.(e.pointerId) } catch (_) {}
  }
}
function onPointerMove(e) {
  if (!editMode.value || !dragging || !dragStart) return
  const { x, y } = toLogical(e)
  layout[dragStart.name].x = dragStart.x + (x - dragStart.lx)
  layout[dragStart.name].baseline = dragStart.baseline + (y - dragStart.ly)
}
function onPointerUp() {
  dragging = false
  dragStart = null
}
function onWheel(e) {
  if (!editMode.value || !selected.value) return
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.06 : 0.94
  layout[selected.value].w = Math.max(8, Math.min(400, layout[selected.value].w * factor))
}
function nudge(dx, dy) {
  if (!selected.value) return
  layout[selected.value].x += dx
  layout[selected.value].baseline += dy
}
function scaleSel(factor) {
  if (!selected.value) return
  layout[selected.value].w = Math.max(8, Math.min(400, layout[selected.value].w * factor))
}
function exportLayout() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(layoutJson.value).then(
      () => { hint.value = '已复制布局参数到剪贴板，可粘贴给我以固化默认值' },
      () => {}
    )
  }
}
function onKey(e) {
  if (!editMode.value || !selected.value) return
  const step = e.shiftKey ? 10 : 2
  switch (e.key) {
    case 'ArrowLeft':  layout[selected.value].x -= step; e.preventDefault(); break
    case 'ArrowRight': layout[selected.value].x += step; e.preventDefault(); break
    case 'ArrowUp':    layout[selected.value].baseline -= step; e.preventDefault(); break
    case 'ArrowDown':  layout[selected.value].baseline += step; e.preventDefault(); break
    case '+': case '=': scaleSel(1.05); break
    case '-': case '_': scaleSel(0.95); break
  }
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
  if (!editMode.value) applyDefaults()   // 非编辑态随画布自适应；编辑态保留手动微调
  render()
}

watch(material, () => {
  // 切换物质时重置
  if (state.value !== 'running') resetAll()
})

let resizeObs = null
onMounted(() => {
  setupCanvas()
  applyDefaults()          // 首次渲染前先算好默认布局
  render()
  window.addEventListener('keydown', onKey)
  if (window.ResizeObserver) {
    resizeObs = new ResizeObserver(resizeCanvas)
    resizeObs.observe(canvasRef.value.parentElement)
  }
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (resizeObs) resizeObs.disconnect()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel" style="padding:0;position:relative">
        <canvas
          ref="canvasRef"
          style="display:block;width:100%;height:520px;touch-action:none;border-radius:8px"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerUp"
          @wheel="onWheel"
        ></canvas>

        <!-- 摆放编辑器浮层 -->
        <div v-if="editMode" class="pos-editor">
          <div class="pe-head">
            <strong>摆放编辑器</strong>
            <span class="pe-tip">拖动元件移动 · 滚轮缩放</span>
          </div>
          <div class="pe-row">
            <label>元件</label>
            <select v-model="selected" class="pe-select">
              <option value="stand">铁架台</option>
              <option value="beaker">烧杯</option>
              <option value="tube">试管</option>
              <option value="thermo">温度计</option>
              <option value="lamp">酒精灯</option>
            </select>
          </div>
          <div class="pe-row pe-arrows">
            <button class="pe-btn" title="左移" @click="nudge(-2,0)">←</button>
            <button class="pe-btn" title="上移" @click="nudge(0,-2)">↑</button>
            <button class="pe-btn" title="下移" @click="nudge(0,2)">↓</button>
            <button class="pe-btn" title="右移" @click="nudge(2,0)">→</button>
          </div>
          <div class="pe-row">
            <button class="pe-btn" @click="scaleSel(0.95)">缩小 −</button>
            <button class="pe-btn" @click="scaleSel(1.05)">放大 +</button>
          </div>
          <div class="pe-row pe-vals">
            x={{ Math.round(layout[selected]?.x || 0) }} ·
            y={{ Math.round(layout[selected]?.baseline || 0) }} ·
            w={{ Math.round(layout[selected]?.w || 0) }}
          </div>
          <div class="pe-row">
            <button class="pe-btn pe-copy" @click="exportLayout">复制布局参数</button>
            <button class="pe-btn" @click="applyDefaults()">重置</button>
          </div>
          <pre class="pe-json">{{ layoutJson }}</pre>
        </div>
      </div>

      <div class="lab-actions">
        <div style="display:flex;gap:8px">
          <button class="btn" :class="{ 'btn-primary': material === 'sea' }" @click="material = 'sea'">海波（晶体）</button>
          <button class="btn" :class="{ 'btn-primary': material === 'wax' }" @click="material = 'wax'">石蜡（非晶体）</button>
        </div>
        <button v-if="state !== 'running'" class="btn btn-primary" @click="startRun">{{ startBtn }}</button>
        <button class="btn" @click="resetAll">重置</button>
        <button class="btn" :class="{ 'btn-primary': editMode }" @click="editMode = !editMode">{{ editMode ? '完成摆放' : '编辑摆放位置' }}</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
        <FullscreenBtn />
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

<style scoped>
.pos-editor {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 196px;
  background: #fffef5;
  border: 2px solid #111;
  border-radius: 8px;
  box-shadow: 4px 4px 0 #111;
  padding: 10px;
  font-size: 12px;
  color: #111;
  z-index: 6;
}
.pe-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
}
.pe-head strong {
  font-size: 13px;
  font-weight: 800;
}
.pe-tip {
  font-size: 10px;
  color: #666;
}
.pe-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.pe-row label {
  font-weight: 700;
}
.pe-select {
  flex: 1;
  border: 2px solid #111;
  border-radius: 6px;
  padding: 3px 4px;
  font-size: 12px;
  background: #fff;
}
.pe-arrows {
  justify-content: space-between;
}
.pe-btn {
  border: 2px solid #111;
  border-radius: 6px;
  background: #ffe14d;
  font-weight: 700;
  font-size: 12px;
  padding: 4px 8px;
  cursor: pointer;
  box-shadow: 2px 2px 0 #111;
}
.pe-btn:active {
  transform: translate(2px, 2px);
  box-shadow: 0 0 0 #111;
}
.pe-copy {
  background: #6fe0a8;
}
.pe-vals {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  background: #f3f1e3;
  border: 1px dashed #999;
  border-radius: 5px;
  padding: 4px 6px;
}
.pe-json {
  margin: 0;
  max-height: 150px;
  overflow: auto;
  font-size: 10px;
  line-height: 1.35;
  background: #1d2330;
  color: #d7f5e0;
  border-radius: 5px;
  padding: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
