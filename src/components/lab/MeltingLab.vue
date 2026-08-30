<script setup>
import { boardFg, boardText } from '../../lib/boardText'

import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'
import MeltFlask  from './melt/MeltFlask.vue'
import MeltBurner from './melt/MeltBurner.vue'
import MeltThermo from './melt/MeltThermo.vue'
import MeltZoom   from './melt/MeltZoom.vue'
import './melt/melt.css'

const emit = defineEmits(['complete'])
const auth = useAuthStore()
const isAdmin = computed(() => auth.isAdmin)

// ===== 装置渲染（纯 SVG 组件，零网络请求）=====
// 视觉由连续量驱动：meltFrac（0..1 已熔化比例）让颗粒渐消、液池渐涨，
// 酒精灯点燃/熄灭走 transform+opacity 过渡，不再有 PNG 三态硬切换。

// 试管内容物熔化进度：按 (物质, 当前时间) 连续插值
// 海波：0~4s 固态升温；4~8s 熔化平台（进度 0→1）；之后全液
// 石蜡：全程缓慢软化，约 9s 完全熔化
const meltFrac = computed(() => {
  if (state.value === 'ready') return 0
  const t = tNow.value
  return isCrystal.value ? clamp((t - 4) / 4, 0, 1) : clamp(t / 9, 0, 1)
})

// ===== 摆放编辑器（editMode 下可拖动 / 滚轮缩放每个元件）=====
// 每个元件用绝对逻辑坐标 {x:中心x, baseline:底部y, w:内容宽} 描述，便于手动微调。
const editMode = ref(false)
const selected = ref('flask')          // 当前选中的元件
const layout = reactive({              // 各元件坐标（SVG 组件直接读取）
  flask:  { x: 0, baseline: 0, w: 0 },
  thermo: { x: 0, baseline: 0, w: 0 },
  lamp:   { x: 0, baseline: 0, w: 0 },
})
const LS_KEY = 'emelt-layout-v2'       // 已保存摆放的 localStorage 键（v2：SVG 新装置几何）
const savedLayout = ref(null)          // 用户保存过的固定布局（优先于自适应）
// 编辑器内实时显示 / 复制用：随 layout 与画布尺寸自动更新
const layoutJson = computed(() => {
  const L = canvasRef.value ? dims() : { W: 0, H: 0 }
  return JSON.stringify(
    { _canvas: { W: Math.round(L.W), H: Math.round(L.H) }, layout: { ...layout } },
    null, 1
  )
})

// 按当前画布尺寸算默认布局（SVG 装置几何见各组件注释）：
// flask 自带三脚架（viewBox 200×420，石棉网底距 baseline 186.5 单位），
// lamp 高 212 单位、火焰尖距 baseline 208 单位 —— 取 lampW 使火焰尖刚好舔到石棉网。
// thermo 底部（球泡）提到试管内容物上方（270 单位处），杆身略伸出管口，不遮挡物质变化
function computeDefaults(L) {
  const cx = L.W * 0.24
  const baseY = L.H - 70
  const flaskW = Math.min(185, L.W * 0.205)
  const s = flaskW / 200
  const lampW = Math.max(40, Math.min(120, (186.5 * s - 4) / 1.6))
  const thermoW = Math.min(24, flaskW * 0.13)
  return {
    flask:  { x: cx, baseline: baseY, w: flaskW },
    thermo: { x: cx, baseline: baseY - 275 * s, w: thermoW },
    lamp:   { x: cx, baseline: baseY, w: lampW },
  }
}
function applyDefaults() {
  const L = dims()
  // 已保存过则优先用保存值（固定摆放），否则按画布尺寸自适应
  Object.assign(layout, savedLayout.value || computeDefaults(L))
}
// 从 localStorage 读取已保存布局（仅在结构合法时启用）
function loadSaved() {
  try {
    const s = localStorage.getItem(LS_KEY)
    if (!s) return
    const o = JSON.parse(s)
    if (o && o.flask && o.thermo && o.lamp) savedLayout.value = o
  } catch (_) {}
}
// 保存当前摆放：写入 localStorage 并设为优先布局
function saveLayout() {
  try {
    const o = JSON.parse(JSON.stringify(layout))
    localStorage.setItem(LS_KEY, JSON.stringify(o))
    savedLayout.value = o
    hint.value = '已保存当前摆放，刷新或缩放后将保持'
  } catch (_) {}
}
// 重置：清除保存，恢复为按画布尺寸自适应
function resetLayout() {
  try { localStorage.removeItem(LS_KEY) } catch (_) {}
  savedLayout.value = null
  applyDefaults()
  hint.value = '已恢复为自适应默认布局'
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
  // 石蜡：用 rate 缩放时间，平滑上升（铺满整个计时区间）
  const tt = Math.min((t / DURATION) * rate, 1)
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
  const st = stageRef.value
  ctx = canvas.getContext('2d')
  // 画布铺满整个舞台（板面背景全幅），T-t 图等设计内容在渲染时居中平移绘制
  const w = Math.max(1, st.clientWidth)
  const h = Math.max(1, st.clientHeight)
  const d = dpr()
  canvas.width = Math.round(w * d)
  canvas.height = Math.round(h * d)
  canvas.style.width = w + 'px'
  canvas.style.height = h + 'px'
  ctx.setTransform(d, 0, 0, d, 0, 0)
}
function dims() {
  return { W: 900, H: 520 }
}
// 设计层等比缩放：画布与装置图共用 900×520 逻辑坐标，
// 最大 1.0（杜绝大屏放大感），宽屏时设计层在舞台内水平居中
const DESIGN_W = 900
const DESIGN_H = 520
const stageRef = ref(null)
const scaleRef = ref(null)
// 视口状态：设计层缩放与水平偏移（canvas 渲染与编辑态坐标换算共用）
const view = { s: 1, offX: 0 }
function layoutStage() {
  const st = stageRef.value, sc = scaleRef.value
  if (!st || !sc) return
  // 等比缩放，最大 1.0（杜绝大屏放大感）；宽屏时场景在面板内水平居中。
  // 任何分辨率下：场景相对布局一致、画面大小适中、酒精灯底部完整可见
  const s = Math.max(0.25, Math.min(st.clientWidth / DESIGN_W, 1))
  const offX = Math.max(0, (st.clientWidth - DESIGN_W * s) / 2)
  view.s = s
  view.offX = offX
  sc.style.transform = `scale(${s})`
  sc.style.left = `${offX}px`
  st.style.height = `${Math.round(DESIGN_H * s)}px`
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

// 左侧实验装置：现由 SVG 组件渲染（melt/*），仅在 canvas 画物质标签。
function drawSetup(L) {
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(isCrystal.value ? '海波' : '石蜡', layout.flask.x, layout.flask.baseline + 16)
}

// ===== 装置状态（供模板用） =====
const isOn    = computed(() => state.value === 'running' || state.value === 'done')
const isHot   = computed(() => isOn.value)               // 灯亮即有对流/微颤
const steamOn = computed(() => isOn.value && temp.value >= 58)

// ===== 试管放大观察 =====
const zoomOn = ref(false)
const zoomCaption = computed(() => {
  const mat = isCrystal.value ? '海波' : '石蜡'
  const f = meltFrac.value
  if (state.value === 'ready') return `${mat}：固态，待加热`
  if (isCrystal.value) {
    if (f <= 0.01) return `${mat}：吸热升温（固态）`
    if (f >= 0.99) return `${mat}：完全熔化（液态）`
    return `${mat}：熔化平台 · 固液共存`
  }
  if (f <= 0.01) return `${mat}：受热软化（固态）`
  if (f >= 0.99) return `${mat}：完全熔化（液态）`
  return `${mat}：逐渐软化熔化`
})

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
  const st = stageRef.value
  const W = st ? st.clientWidth : DESIGN_W
  const H = st ? st.clientHeight : DESIGN_H
  // 板面背景铺满整个舞台（任何分辨率下格子背景不留空）
  paintBoard(ctx, W, H, 'chalk')
  // 设计内容（装置标签 + T-t 图）居中平移绘制，与 SVG 装置层对齐
  ctx.save()
  ctx.translate(view.offX, 0)
  ctx.scale(view.s, view.s)
  const L = dims()
  drawSetup(L)
  drawGraph(L)
  ctx.restore()
}

// ===== 摆放编辑器：交互（拖动 / 滚轮缩放 / 方向键微调）=====
function toggleEditMode() {
  editMode.value = !editMode.value
  if (!editMode.value) selected.value = ''
}
// 每个装置组件 emit @pointerdown(name, e) → 这里路由；拖动改用 window-level 监听，绕开 SVG 自身 capture 的坑。
let dragging = false
let dragStart = null

function toLogical(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  // 画布铺满舞台，设计内容按 view.s 缩放并水平偏移：逆向映射回 900×520 逻辑坐标
  return { x: (e.clientX - rect.left - view.offX) / view.s, y: (e.clientY - rect.top) / view.s }
}
function onPiecePointerDown(name, e) {
  if (!editMode.value) return
  const { x, y } = toLogical(e)
  selected.value = name
  dragging = true
  dragStart = { name, lx: x, ly: y, x: layout[name].x, baseline: layout[name].baseline }
  // 不在 SVG 内部 setPointerCapture，改用 window 监听 pointermove/pointerup（更稳）
  window.addEventListener('pointermove', onWinPointerMove)
  window.addEventListener('pointerup',   onWinPointerUp,   { once: true })
  window.addEventListener('pointercancel', onWinPointerUp, { once: true })
}
function onWinPointerMove(e) {
  if (!dragging || !dragStart) return
  const { x, y } = toLogical(e)
  layout[dragStart.name].x = dragStart.x + (x - dragStart.lx)
  layout[dragStart.name].baseline = dragStart.baseline + (y - dragStart.ly)
}
function onWinPointerUp() {
  dragging = false
  dragStart = null
  window.removeEventListener('pointermove', onWinPointerMove)
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
  startLoop()
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

// rAF 仅在加热运行时启动：空闲时零重绘（旧版每帧全量重画黑板 + 图像，常驻开销大）
function startLoop() {
  if (raf != null) return
  lastT = performance.now()
  raf = requestAnimationFrame(loop)
}
function stopLoop() {
  if (raf != null) cancelAnimationFrame(raf)
  raf = null
  lastT = null
}
function loop(now) {
  if (state.value !== 'running') { raf = null; return }
  if (!lastT) lastT = now
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  tNow.value += dt * SLOWMO
  const t = tNow.value
  temp.value = modelTemp(material.value, t)
  points.value.push({ t, T: temp.value })
  if (tNow.value >= DURATION) {
    tNow.value = DURATION
    temp.value = T_END[material.value]
    stopRun()
    render()
    raf = null
    return
  }
  render()
  raf = requestAnimationFrame(loop)
}

function resizeCanvas() {
  if (!canvasRef.value) return
  layoutStage()     // 先定舞台尺寸（高度），再按最终尺寸重建画布
  setupCanvas()
  if (!editMode.value) applyDefaults()   // 非编辑态随画布自适应；编辑态保留手动微调
  render()
}

watch(material, () => {
  // 切换物质时重置
  if (state.value !== 'running') resetAll()
  render()
})

let resizeObs = null
let lastStageW = 0
let sizePoll = null
function onWinResize() { resizeCanvas() }
onMounted(() => {
  layoutStage()            // 先定舞台尺寸，画布按最终尺寸创建
  setupCanvas()
  loadSaved()              // 先读已保存的摆放
  applyDefaults()          // 首次渲染前算好布局（有保存则用保存值）
  render()
  lastStageW = stageRef.value ? stageRef.value.clientWidth : 0
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onWinResize)   // 兜底：RO 未触发时也重排
  if (window.ResizeObserver) {
    resizeObs = new ResizeObserver(resizeCanvas)
    resizeObs.observe(stageRef.value)   // 观察外层容器（缩放层宽度固定 900，观察它不会触发）
  }
  // 终极兜底：极少数环境（如嵌入式视口）RO 与 resize 事件都不可靠，
  // 低频轮询容器宽度，宽度变了立即重排，杜绝任何分辨率下位置漂移
  sizePoll = setInterval(() => {
    const st = stageRef.value
    if (!st) return
    const w = st.clientWidth
    if (w && Math.abs(w - lastStageW) > 1) {
      lastStageW = w
      resizeCanvas()
    }
  }, 400)
})
onBeforeUnmount(() => {
  stopLoop()
  if (resizeObs) resizeObs.disconnect()
  if (sizePoll) clearInterval(sizePoll)
  window.removeEventListener('resize', onWinResize)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pointermove', onWinPointerMove)
  window.removeEventListener('pointerup', onWinPointerUp)
  window.removeEventListener('pointercancel', onWinPointerUp)
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel" style="padding:0;position:relative">
        <!-- 外层容器：高度由 JS 按缩放比例设定；画布铺满舞台绘制板面，装置层按设计坐标居中缩放 -->
        <div class="melt-stage" ref="stageRef">
          <canvas
            class="logic-canvas" ref="canvasRef"
            style="position:absolute;inset:0;display:block;touch-action:none"
          ></canvas>
          <div class="melt-scale" ref="scaleRef">
        <!-- 装置区（SVG 组件层），绝对覆盖在 canvas 之上；lamp 最先画（位于脚架后方），thermo 最前 -->
        <div
          class="melt-rig"
          style="position:absolute;inset:0;height:520px"
          @wheel="onWheel"
        >
          <MeltBurner
            :x="layout.lamp.x" :baseline="layout.lamp.baseline" :w="layout.lamp.w"
            :on="isOn"
            :selected="selected === 'lamp'" :edit-mode="editMode"
            @pointerdown="(e) => onPiecePointerDown('lamp', e)"
          />
          <MeltFlask
            :x="layout.flask.x" :baseline="layout.flask.baseline" :w="layout.flask.w"
            :hot="isHot" :melt-frac="meltFrac" :material="material" :steam="steamOn"
            :selected="selected === 'flask'" :edit-mode="editMode"
            @pointerdown="(e) => onPiecePointerDown('flask', e)"
          />
          <MeltThermo
            :x="layout.thermo.x" :baseline="layout.thermo.baseline" :w="layout.thermo.w"
            :temp="temp" :t-min="Tmin" :t-max="Tmax"
            :selected="selected === 'thermo'" :edit-mode="editMode"
            @pointerdown="(e) => onPiecePointerDown('thermo', e)"
          />
        </div>

        <!-- 试管放大观察小框（在设计层内随场景等比缩放，任何分辨率下相对位置不变） -->
        <transition name="zoompop">
          <div v-if="zoomOn" class="melt-zoom">
            <div class="mz-head">
              <span>试管内部 ×2.2</span>
              <strong class="mz-temp">{{ temp.toFixed(1) }}℃</strong>
            </div>
            <MeltZoom :melt-frac="meltFrac" :material="material" :hot="isHot" />
            <div class="mz-caption">{{ zoomCaption }}</div>
          </div>
        </transition>
      </div>
        </div>

        <!-- 摆放编辑器浮层（在缩放层之外，保持可读尺寸） -->
        <div v-if="editMode" class="pos-editor">
          <div class="pe-head">
            <strong>摆放编辑器</strong>
            <span class="pe-tip">拖动元件移动 · 滚轮缩放</span>
          </div>
          <div class="pe-row">
            <label>元件</label>
            <select v-model="selected" class="pe-select">
              <option value="flask">烧杯+试管</option>
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
            <button class="pe-btn pe-save" @click="saveLayout">保存</button>
            <button class="pe-btn pe-copy" @click="exportLayout">复制参数</button>
            <button class="pe-btn" @click="resetLayout">重置</button>
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
        <button class="btn" :class="{ 'btn-primary': zoomOn }" @click="zoomOn = !zoomOn">🔍 放大观察</button>
        <button v-if="isAdmin" class="btn" :class="{ 'btn-primary': editMode }" @click="toggleEditMode">{{ editMode ? '完成摆放' : '编辑摆放位置' }}</button>
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
/* 外层容器：宽度铺满，高度由 JS 按 900:520 缩放比设定 */
.melt-stage {
  position: relative;
  width: 100%;
  height: 520px;
  overflow: hidden;
}
/* 设计层：固定 900×520 逻辑坐标，整体等比缩放（左上角为原点） */
.melt-scale {
  position: absolute;
  left: 0;
  top: 0;
  width: 900px;
  height: 520px;
  transform-origin: top left;
}
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
.pe-save {
  background: #ffd24d;
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

/* ===== 试管放大观察小框（装置与 T-t 图之间的空档，不遮挡任何设备） ===== */
.melt-zoom {
  position: absolute;
  left: 322px;
  top: 104px;
  width: 142px;
  padding: 9px 10px 8px;
  background: #fffef5;
  border: 2px solid #2a2a2a;
  border-radius: 8px;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.25);
  z-index: 6;
}
.mz-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  font-weight: 800;
  color: #2a2a2a;
}
.mz-temp {
  color: #e85a4f;
  font-size: 18px;
  font-weight: 900;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mz-caption {
  margin-top: 5px;
  font-size: 11px;
  font-weight: 700;
  color: #444;
}
.zoompop-enter-active,
.zoompop-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
  transform-origin: 0 100%;
}
.zoompop-enter-from,
.zoompop-leave-to {
  transform: scale(0.6);
  opacity: 0;
}
</style>
