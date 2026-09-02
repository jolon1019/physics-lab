<script setup>
import { boardText } from '../../lib/boardText'

import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'
import MeltBurner from './melt/MeltBurner.vue'
import SubRig  from './sublimate/SubRig.vue'
import SubZoom from './sublimate/SubZoom.vue'
import './sublimate/sublimate.css'
import './melt/melt.css'

const emit = defineEmits(['complete'])
const auth = useAuthStore()
const isAdmin = computed(() => auth.isAdmin)

// ===== 装置渲染（纯 SVG 组件，零网络请求），视觉架构与 e-melt 完全一致 =====
// 视觉由连续量驱动：subFrac（固态碘剩余）让晶体堆渐消、liquidFrac（熔化液层）、
// 蒸气/白汽/气泡走 CSS 动画，不再有整幅 canvas 重绘装置。

// ===== 摆放坐标（与画布尺寸自适应，几何配对：火焰尖刚好舔到管底）=====
const layout = reactive({
  rig:  { x: 0, baseline: 0, w: 0 },
  lamp: { x: 0, baseline: 0, w: 0 },
})

function computeDefaults(L) {
  const cx = L.W * 0.26
  const baseY = L.H - 70
  const rigW = Math.min(185, L.W * 0.2)
  // 管底(viewBox y=318)距 baseline(y=410) 92 单位；MeltBurner 火焰尖距其 baseline 208/130 单位宽
  const s = rigW / 220
  const lampW = Math.max(40, Math.min(120, (92 * s - 4) / 1.6))
  return {
    rig:  { x: cx, baseline: baseY, w: rigW },
    lamp: { x: cx, baseline: baseY, w: lampW },
  }
}
function applyDefaults() {
  Object.assign(layout, computeDefaults(dims()))
}

// ===== 可调变量 =====
const method = ref('bath') // 'bath' 热水浴(正确) | 'flame' 酒精灯直火
const waterTemp = ref(100) // 热水浴水温 70~100℃，必须低于碘熔点才升华
const IODINE_MELT = 113.5  // 碘熔点 ≈ 113.5℃

const isBath = computed(() => method.value === 'bath')

// ===== 物理模型（管内温度—时间）=====
const T0 = 60          // 起始温度
const Tmax = 142       // 直火末温
const Tmin = 50
const DURATION = 9     // 动画总时长（屏显秒）
// 热水浴：指数逼近水温（≤100℃ < 熔点 → 全程升华）
// 酒精灯直火：快速升超熔点 → 碘先熔化再汽化
function modelTemp(t) {
  if (isBath.value) {
    const target = waterTemp.value
    return T0 + (target - T0) * (1 - Math.exp(-t / 1.3))
  }
  return T0 + 80 * Math.pow(t / DURATION, 0.8)
}

// ===== 状态 =====
const state = ref('ready') // ready | running | done
const tNow = ref(0)
const temp = ref(T0)
const points = ref([]) // {t, T}
let completed = false
const hint = ref('选择加热方式后点击「开始」，观察碘是直接变气体（升华）还是先熔化')
const startBtn = ref('开始')

// ===== 装置状态（供模板用）=====
const isHot = computed(() => state.value === 'running')
const subFrac = computed(() => {
  if (state.value === 'ready') return 1
  const t = tNow.value
  return isBath.value ? Math.max(0.12, 1 - (t / 8) * 0.88) : Math.max(0.2, 1 - (t / 6) * 0.8)
})
const liquidFrac = computed(() => {
  if (isBath.value) return 0
  return Math.max(0, Math.min(1, (temp.value - IODINE_MELT) / 12))
})
const vaporOn = computed(() => isHot.value && tNow.value > 0.5)
const condensed = computed(() => state.value === 'done' && isBath.value)

const conclusion = computed(() => {
  if (state.value !== 'done') return null
  return isBath.value
    ? { title: '升华 + 凝华', ok: true, text: '热水(<113.5℃)使碘直接由固态变气态（升华），冷却后蒸气在冷端直接变固态（凝华）。' }
    : { title: '错误：先熔化', ok: false, text: '直火温度远超碘熔点，碘先熔化成液体，无法证明“固态直接变气态”。应使用热水浴。' }
})

// ===== 放大观察 =====
const zoomOn = ref(false)
const zoomCaption = computed(() => {
  if (state.value === 'ready') return '碘：固态（紫黑色晶体）'
  if (isBath.value) {
    if (state.value === 'done') return '冷却凝华：蒸气在管顶直接变回固态碘'
    return '升华中 · 固态直接变紫色蒸气'
  }
  if (liquidFrac.value > 0.05) return '警告：温度超熔点，碘已先熔化成液态'
  return '受热升温（尚未达到熔点 113.5℃）'
})

// ===== 公式面板 =====
const formulaRows = computed(() => [
  { label: '加热方式', value: isBath.value ? `热水浴 ≈ ${waterTemp.value}℃` : '酒精灯直火' },
  { label: '管内温度', value: `${temp.value.toFixed(1)} ℃` },
  { label: '计时', value: `${tNow.value.toFixed(1)} s` }
])
const formulaResults = computed(() => {
  if (state.value !== 'done') return []
  if (isBath.value) {
    return [
      { label: '是否熔化', value: '无（水温 < 熔点）' },
      { label: '发生的物态变化', value: '升华 + 凝华' },
      { label: '管顶现象', value: '紫黑色晶体沉积' }
    ]
  }
  return [
    { label: '是否先熔化', value: '是（温度超熔点）' },
    { label: '能否证明升华', value: '不能' },
    { label: '正确做法', value: '改用热水浴' }
  ]
})
const verifySteps = computed(() => [
  '热水浴 100℃ < 碘熔点 113.5℃ → 碘不熔化，直接升华成紫色蒸气',
  '紫色蒸气上升，在较冷的管顶凝华成紫黑色固态碘',
  '酒精灯直火远超熔点，碘先熔化成液态，无法证明“固态直接变气态”',
  '升华：固 → 气（吸热）；凝华：气 → 固（放热）'
])

// ===== Canvas（左侧只画板面背景与标签，右侧 T-t 图）=====
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
// 设计层等比缩放（与 e-melt 相同约定）：最大 1.0，宽屏水平居中
const DESIGN_W = 900
const DESIGN_H = 520
const stageRef = ref(null)
const scaleRef = ref(null)
const view = { s: 1, offX: 0 }
function layoutStage() {
  const st = stageRef.value, sc = scaleRef.value
  if (!st || !sc) return
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

// 左侧装置标签（装置本体由 SVG 组件渲染）
function drawSetup(L) {
  const rigH = layout.rig.w * (420 / 220)
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('密封玻璃管（碘锤）', layout.rig.x, layout.rig.baseline - rigH - 12)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillText(isBath.value ? `热水浴 ≈ ${waterTemp.value}℃` : '酒精灯直火', layout.rig.x, layout.rig.baseline + 16)
}

// 右侧 T-t 图（与 e-melt 的温度—时间图像同款样式）
function drawGraph(L) {
  const gx = L.W * 0.5
  const gy = 70
  const gw = L.W * 0.44
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
  for (let t = 0; t <= DURATION; t += 1) {
    ctx.fillText(String(t), X(t), py0 + 6)
  }
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let T = 60; T <= 140; T += 20) {
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
  // 熔点参考线（红虚线）
  ctx.strokeStyle = 'rgba(224,88,79,0.5)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.moveTo(px0, Y(IODINE_MELT))
  ctx.lineTo(px1, Y(IODINE_MELT))
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#e0584f'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText('碘熔点 113.5℃', px0 + 4, Y(IODINE_MELT) - 2)
  // 曲线
  if (points.value.length > 1) {
    ctx.strokeStyle = isBath.value ? '#6b3fa0' : '#e0584f'
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
    ctx.fillStyle = isBath.value ? '#6b3fa0' : '#e0584f'
    ctx.beginPath()
    ctx.arc(X(last.t), Y(last.T), 4, 0, Math.PI * 2)
    ctx.fill()
  }
  // 标题
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('管内温度 T–t 图像', gx + 10, gy + 8)
}

function render() {
  if (!ctx) return
  const st = stageRef.value
  const W = st ? st.clientWidth : DESIGN_W
  const H = st ? st.clientHeight : DESIGN_H
  paintBoard(ctx, W, H, 'chalk')
  ctx.save()
  ctx.translate(view.offX, 0)
  ctx.scale(view.s, view.s)
  const L = dims()
  drawSetup(L)
  drawGraph(L)
  ctx.restore()
}

// ===== 控制 =====
function startRun() {
  if (state.value === 'running') return
  state.value = 'running'
  tNow.value = 0
  temp.value = T0
  points.value = []
  completed = false
  startBtn.value = '重新开始'
  hint.value = isBath.value
    ? '加热中…水温低于熔点，观察紫色碘蒸气上升（固态直接变气态）'
    : '加热中…注意碘是否先熔化（变成液体）'
  lastT = performance.now()
  startLoop()
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
  temp.value = T0
  points.value = []
  completed = false
  startBtn.value = '开始'
  hint.value = '选择加热方式后点击「开始」，观察碘是直接变气体（升华）还是先熔化'
  render()
}

// rAF 仅在加热运行时启动：空闲时零重绘（蒸气/气泡/白汽均为 CSS 动画，与 rAF 无关）
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
  tNow.value += dt * 1.4
  const t = tNow.value
  temp.value = modelTemp(t)
  points.value.push({ t, T: temp.value })
  if (tNow.value >= DURATION) {
    tNow.value = DURATION
    temp.value = modelTemp(DURATION)
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
  layoutStage()
  setupCanvas()
  applyDefaults()
  render()
}

watch(method, () => {
  if (state.value !== 'running') resetAll()
})
watch(waterTemp, () => {
  if (state.value !== 'running') render()
})

let resizeObs = null
let lastStageW = 0
let sizePoll = null
function onWinResize() { resizeCanvas() }
onMounted(() => {
  layoutStage()
  setupCanvas()
  applyDefaults()
  render()
  lastStageW = stageRef.value ? stageRef.value.clientWidth : 0
  window.addEventListener('resize', onWinResize)
  if (window.ResizeObserver) {
    resizeObs = new ResizeObserver(resizeCanvas)
    resizeObs.observe(stageRef.value)
  }
  // 兜底轮询（同 e-melt）：极端环境下 RO/resize 不可靠时防位置漂移
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
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel" style="padding:0;position:relative">
        <!-- 外层容器：高度由 JS 按缩放比例设定；画布铺满舞台绘制板面，装置层按设计坐标居中缩放 -->
        <div class="sub-stage" ref="stageRef">
          <canvas
            class="logic-canvas" ref="canvasRef"
            style="position:absolute;inset:0;display:block;touch-action:none"
          ></canvas>
          <div class="sub-scale" ref="scaleRef">
            <!-- 装置区（SVG 组件层）：lamp 在最底层（直火模式），碘锤装置在其上 -->
            <div
              class="sub-rig"
              style="position:absolute;inset:0;height:520px"
            >
              <MeltBurner
                v-if="!isBath"
                :x="layout.lamp.x" :baseline="layout.lamp.baseline" :w="layout.lamp.w"
                :on="isHot"
              />
              <SubRig
                :x="layout.rig.x" :baseline="layout.rig.baseline" :w="layout.rig.w"
                :mode="method" :hot="isHot"
                :sub-frac="subFrac" :liquid-frac="liquidFrac"
                :vapor="vaporOn" :condensed="condensed"
              />
            </div>

            <!-- 放大观察小框（设计层内随场景等比缩放，位置避开装置与图像） -->
            <transition name="zoompop">
              <div v-if="zoomOn" class="sub-zoom">
                <div class="sz-head">
                  <span>碘锤内部 ×2.2</span>
                  <strong class="sz-temp">{{ temp.toFixed(1) }}℃</strong>
                </div>
                <SubZoom :mode="method" :sub-frac="subFrac" :liquid-frac="liquidFrac" :vapor="vaporOn" :condensed="condensed" />
                <div class="sz-caption">{{ zoomCaption }}</div>
              </div>
            </transition>
          </div>
        </div>

        <!-- 摆放编辑器入口（管理员）：复用 e-melt 的微调交互由编辑器完成，这里仅保留提示 -->
        <div v-if="isAdmin" class="admin-tip">管理员提示：装置几何在 SubRig.vue 内联，可参照 MeltFlask 的摆放编辑器方案扩展</div>
      </div>

      <div class="lab-actions">
        <div style="display:flex;gap:8px">
          <button class="btn" :class="{ 'btn-primary': isBath }" @click="method = 'bath'">热水浴（正确）</button>
          <button class="btn" :class="{ 'btn-primary': !isBath }" @click="method = 'flame'">酒精灯直火</button>
        </div>
        <button v-if="state !== 'running'" class="btn btn-primary" @click="startRun">{{ startBtn }}</button>
        <button class="btn" @click="resetAll">重置</button>
        <button class="btn" :class="{ 'btn-primary': zoomOn }" @click="zoomOn = !zoomOn">放大观察</button>
        <span class="feedback" :class="completed && isBath ? 'ok' : 'no'">{{ hint }}</span>
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
          <ParamSlider v-model="waterTemp" :min="70" :max="100" :step="5" label="热水浴水温" unit=" ℃" hint="水温必须低于碘熔点 113.5℃ 才能升华；直火模式下不可调" :disabled="!isBath" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实时数据</strong>
          <span>自动记录</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat">
            <span>加热方式</span>
            <strong>{{ isBath ? `热水浴 ≈ ${waterTemp}℃` : '酒精灯直火' }}</strong>
          </div>
          <div class="lab-stat accent">
            <span>管内温度</span>
            <strong>{{ temp.toFixed(1) }} ℃</strong>
          </div>
          <div class="lab-stat success">
            <span>计时</span>
            <strong>{{ tNow.toFixed(1) }} s</strong>
          </div>
          <div class="lab-stat">
            <span>碘的状态</span>
            <strong>{{ zoomCaption }}</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="公式与结论"
        formula="升华：固 → 气（吸热）　凝华：气 → 固（放热）"
        desc="升华是固态直接变成气态（吸热），凝华是气态直接变成固态（放热）。碘的熔点是 113.5℃，热水浴温度低于熔点，碘直接升华；直火温度远超熔点，碘先熔化，无法证明升华。"
        :rows="formulaRows"
        :result="formulaResults"
        :verify="verifySteps"
      />
    </aside>
  </div>
</template>

<style scoped>
/* 外层容器：宽度铺满，高度由 JS 按 900:520 缩放比设定（与 e-melt 相同） */
.sub-stage {
  position: relative;
  width: 100%;
  height: 520px;
  overflow: hidden;
}
/* 设计层：固定 900×520 逻辑坐标，整体等比缩放（左上角为原点） */
.sub-scale {
  position: absolute;
  left: 0;
  top: 0;
  width: 900px;
  height: 520px;
  transform-origin: top left;
}

/* ===== 碘锤放大观察小框（装置与 T-t 图之间的空档，样式同 e-melt 的放大框） ===== */
.sub-zoom {
  position: absolute;
  left: 298px;
  top: 118px;
  width: 142px;
  padding: 9px 10px 8px;
  background: #fffef5;
  border: 2px solid #2a2a2a;
  border-radius: 8px;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.25);
  z-index: 6;
}
.sz-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  font-weight: 800;
  color: #2a2a2a;
}
.sz-temp {
  color: #6b3fa0;
  font-size: 18px;
  font-weight: 900;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sz-caption {
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

.admin-tip {
  position: absolute;
  left: 10px;
  bottom: 8px;
  font-size: 11px;
  color: rgba(120, 130, 145, 0.75);
  pointer-events: none;
}
</style>
