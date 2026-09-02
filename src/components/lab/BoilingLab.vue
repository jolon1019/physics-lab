<script setup>
import { boardText } from '../../lib/boardText'

import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'
import MeltBurner from './melt/MeltBurner.vue'
import BoilBeaker from './boil/BoilBeaker.vue'
import BoilZoom from './boil/BoilZoom.vue'
import './boil/boil.css'
import './melt/melt.css'

const emit = defineEmits(['complete'])

// ===== 装置渲染（纯 SVG 组件，零网络请求），视觉架构与 e-melt / e-sublimate 完全一致 =====
// 气泡/涟漪/白汽均为 CSS 动画（与 rAF 无关），温度计液柱为响应式 SVG 绑定，
// canvas 只负责板面背景 + 标签 + 右侧 T–t 图像。

// ===== 摆放坐标（与画布尺寸自适应，几何配对：火焰尖刚好舔到石棉网底）=====
const layout = reactive({
  beaker: { x: 0, baseline: 0, w: 0 },
  lamp:   { x: 0, baseline: 0, w: 0 },
})

function computeDefaults(L) {
  const cx = L.W * 0.26
  const baseY = L.H - 70
  const bw = Math.min(190, L.W * 0.21)
  // 石棉网底(viewBox y=331)距 baseline(y=410) 79 单位；MeltBurner 火焰尖距其 baseline 208/130 单位宽
  const s = bw / 220
  const lampW = Math.max(40, Math.min(120, (79 * s - 4) / 1.6))
  return {
    beaker: { x: cx, baseline: baseY, w: bw },
    lamp:   { x: cx, baseline: baseY, w: lampW },
  }
}
function applyDefaults() {
  Object.assign(layout, computeDefaults(dims()))
}

// ===== 可调变量 =====
const altitude = ref(0) // 海拔 0~3000 m
const heatRate = ref(50) // 加热功率

// 沸点随海拔（气压）变化：海拔越高、气压越低、沸点越低
const boilingPoint = computed(() => 100 - altitude.value / 285)
const T_START = 20
const Tmin = 20
const Tmax = 104
const SLOWMO = 1.5
const DUR = 13

// ===== 状态 =====
const state = ref('ready') // ready | heating | boiling | done
const tNow = ref(0)
const temp = ref(T_START)
const points = ref([]) // {t, T}
let completed = false
const hint = ref('点击「开始加热」，观察水沸腾前后气泡与温度的变化')
const startBtn = ref('开始加热')

const isBoiling = computed(() => state.value === 'boiling' || state.value === 'done')

// ===== 放大观察 =====
const zoomOn = ref(false)
const zoomCaption = computed(() => {
  if (state.value === 'ready') return '水：常温，未见气泡'
  if (state.value === 'heating') return '沸腾前：气泡上升途中变小（消失）'
  if (state.value === 'boiling') return '沸腾时：气泡上升变大，到水面破裂'
  return `沸腾结束：温度停在 ${boilingPoint.value.toFixed(0)}℃`
})

// ===== 公式面板 =====
const formulaRows = computed(() => [
  { label: '海拔高度', value: `${altitude.value} m` },
  { label: '当前沸点', value: `${boilingPoint.value.toFixed(1)} ℃` },
  { label: '当前温度', value: `${temp.value.toFixed(1)} ℃` },
  { label: '计时', value: `${tNow.value.toFixed(1)} s` }
])
const formulaResults = computed(() => {
  if (!isBoiling.value) return []
  return [
    { label: '是否沸腾', value: '是' },
    { label: '沸点', value: `${boilingPoint.value.toFixed(1)} ℃` },
    { label: '沸腾时温度变化', value: '保持不变' }
  ]
})
const verifySteps = computed(() => [
  '沸腾前：气泡自下而上变小（遇冷收缩）',
  '沸腾时：气泡变大并上升到水面破裂，剧烈汽化',
  '沸腾时持续吸热，但温度保持在沸点不变',
  '沸点随气压变化：海拔越高、气压越低、沸点越低'
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
  const bh = layout.beaker.w * (420 / 220)
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(`水 · 沸点 ${boilingPoint.value.toFixed(0)}℃`, layout.beaker.x, layout.beaker.baseline + 16)
}

// 右侧 T-t 图（与 e-melt / e-sublimate 的图像同款样式）
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
  const X = (t) => px0 + (t / DUR) * (px1 - px0)
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
  for (let t = 0; t <= DUR; t += 1) {
    ctx.fillText(String(t), X(t), py0 + 6)
  }
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let T = Tmin; T <= Tmax; T += 20) {
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
  // 沸点参考线（红虚线，随海拔联动）
  ctx.strokeStyle = 'rgba(224,88,79,0.5)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.moveTo(px0, Y(boilingPoint.value))
  ctx.lineTo(px1, Y(boilingPoint.value))
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#e0584f'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`沸点 ${boilingPoint.value.toFixed(0)}℃`, px0 + 4, Y(boilingPoint.value) - 2)
  // 曲线 + 当前点
  if (points.value.length > 1) {
    ctx.strokeStyle = '#e0584f'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    points.value.forEach((p, i) => {
      const xx = X(p.t)
      const yy = Y(p.T)
      if (i === 0) ctx.moveTo(xx, yy)
      else ctx.lineTo(xx, yy)
    })
    ctx.stroke()
    const last = points.value[points.value.length - 1]
    ctx.fillStyle = '#e0584f'
    ctx.beginPath()
    ctx.arc(X(last.t), Y(last.T), 4, 0, Math.PI * 2)
    ctx.fill()
  }
  // 标题
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('水沸腾 T–t 图像', gx + 10, gy + 8)
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
  if (state.value === 'heating' || state.value === 'boiling') return
  state.value = 'heating'
  tNow.value = 0
  temp.value = T_START
  points.value = []
  completed = false
  startBtn.value = '重新加热'
  hint.value = '加热中…注意观察沸腾前、沸腾时气泡的不同'
  startLoop()
}

function stopRun() {
  state.value = 'done'
  if (!completed) {
    completed = true
    hint.value = `完成！水达到沸点 ${boilingPoint.value.toFixed(0)}℃ 后持续沸腾，温度保持${boilingPoint.value.toFixed(0)}℃不变。`
    emit('complete')
  } else {
    hint.value = '再次实验结束。改变海拔可看到沸点变化。'
  }
}

function resetAll() {
  state.value = 'ready'
  tNow.value = 0
  temp.value = T_START
  points.value = []
  completed = false
  startBtn.value = '开始加热'
  hint.value = '点击「开始加热」，观察水沸腾前后气泡与温度的变化'
  render()
}

// rAF 仅在加热运行时启动：空闲时零重绘（气泡/涟漪/白汽均为 CSS 动画，与 rAF 无关）
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
  if (state.value !== 'heating' && state.value !== 'boiling') { raf = null; return }
  if (!lastT) lastT = now
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  tNow.value += dt * SLOWMO
  const Tb = boilingPoint.value
  // 加热功率越高，到达沸点越快
  const heatTime = 4 + ((100 - heatRate.value) / 100) * 9
  const f = Math.min(tNow.value / heatTime, 1)
  if (f < 1) {
    temp.value = T_START + (Tb - T_START) * f
    state.value = 'heating'
  } else {
    temp.value = Tb
    if (state.value !== 'boiling') {
      state.value = 'boiling'
      hint.value = '沸腾了！气泡变大上升到水面破裂，温度保持在沸点。'
    }
  }
  points.value.push({ t: Math.min(tNow.value, DUR), T: temp.value })
  if (tNow.value >= DUR) {
    tNow.value = DUR
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

watch(altitude, () => {
  if (state.value === 'ready' || state.value === 'done') {
    temp.value = T_START
    render()
  }
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
        <div class="bf-stage" ref="stageRef">
          <canvas
            class="logic-canvas" ref="canvasRef"
            style="position:absolute;inset:0;display:block;touch-action:none"
          ></canvas>
          <div class="bf-scale" ref="scaleRef">
            <!-- 装置区（SVG 组件层）：lamp 在最底层，烧杯装置在其上 -->
            <div class="bf-rig" style="position:absolute;inset:0;height:520px">
              <MeltBurner
                :x="layout.lamp.x" :baseline="layout.lamp.baseline" :w="layout.lamp.w"
                :on="state === 'heating' || state === 'boiling'"
              />
              <BoilBeaker
                :x="layout.beaker.x" :baseline="layout.beaker.baseline" :w="layout.beaker.w"
                :heating="state === 'heating'" :boiling="state === 'boiling' || state === 'done'"
                :temp="temp" :boiling-point="boilingPoint"
              />
            </div>

            <!-- 放大观察小框（设计层内随场景等比缩放，位置避开装置与图像） -->
            <transition name="zoompop">
              <div v-if="zoomOn" class="bf-zoom">
                <div class="bz-head">
                  <span>烧杯内部 ×2.2</span>
                  <strong class="bz-temp">{{ temp.toFixed(1) }}℃</strong>
                </div>
                <BoilZoom :heating="state === 'heating'" :boiling="state === 'boiling' || state === 'done'" />
                <div class="bz-caption">{{ zoomCaption }}</div>
              </div>
            </transition>
          </div>
        </div>

      <div class="lab-actions">
        <button v-if="state === 'ready' || state === 'done'" class="btn btn-primary" @click="startRun">{{ startBtn }}</button>
        <button v-else class="btn btn-primary" disabled>加热中…</button>
        <button class="btn" @click="resetAll">重置</button>
        <button class="btn" :class="{ 'btn-primary': zoomOn }" @click="zoomOn = !zoomOn">放大观察</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>可调变量</strong>
          <span>海拔影响沸点</span>
        </div>
        <div class="lab-params">
          <ParamSlider v-model="altitude" :min="0" :max="3000" :step="100" label="海拔高度" unit=" m" hint="海拔越高、气压越低，沸点越低" />
          <ParamSlider v-model="heatRate" :min="20" :max="100" :step="5" label="加热功率" unit="%" hint="功率越大，升温越快、越早沸腾" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实时数据</strong>
          <span>自动记录</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat accent">
            <span>当前沸点</span>
            <strong>{{ boilingPoint.toFixed(1) }} ℃</strong>
          </div>
          <div class="lab-stat" :class="{ success: isBoiling }">
            <span>当前温度</span>
            <strong>{{ temp.toFixed(1) }} ℃</strong>
          </div>
          <div class="lab-stat" v-if="isBoiling">
            <span>状态</span>
            <strong>沸腾中</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="公式与结论"
        formula="沸腾：持续吸热，温度不变"
        desc="沸腾是液体内部和表面同时发生的剧烈汽化。沸腾时持续吸热但温度不变；沸点随气压变化（高海拔、低气压、沸点低）。条件：达到沸点+持续吸热。"
        :rows="formulaRows"
        :result="formulaResults"
        :verify="verifySteps"
      />
    </aside>
  </div>
</template>

<style scoped>
/* 外层容器：宽度铺满，高度由 JS 按 900:520 缩放比设定（与 e-melt 相同） */
.bf-stage {
  position: relative;
  width: 100%;
  height: 520px;
  overflow: hidden;
}
/* 设计层：固定 900×520 逻辑坐标，整体等比缩放（左上角为原点） */
.bf-scale {
  position: absolute;
  left: 0;
  top: 0;
  width: 900px;
  height: 520px;
  transform-origin: top left;
}

/* ===== 烧杯内部放大观察小框（样式同 e-sublimate 的放大框） ===== */
.bf-zoom {
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
.bz-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  font-weight: 800;
  color: #2a2a2a;
}
.bz-temp {
  color: #e0584f;
  font-size: 18px;
  font-weight: 900;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.bz-caption {
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
