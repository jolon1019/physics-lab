<script setup>
import { boardFg, boardText } from '../../lib/boardText'

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'
import FormulaPanel from './FormulaPanel.vue'
import TempCups from './temp/TempCups.vue'
import TempThermo from './temp/TempThermo.vue'
import TempZoom from './temp/TempZoom.vue'
import './temp/temp.css'

const emit = defineEmits(['complete'])

// ===== 装置渲染（纯 SVG 组件，零网络请求），视觉架构与 e-melt / e-sublimate / e-boil 完全一致 =====
// 白汽为 CSS 动画（与 rAF 无关），温度计液柱/位置为响应式 SVG 绑定 + CSS transition，
// canvas 只负责板面背景与标题，空闲时零重绘。

// ===== 三个水杯（冷/温/热水，固定真实温度便于读数练习）=====
const cups = [
  { name: '冷水', temp: 18, color: '#9ccee8', deep: '#6fa8cc', steam: false },
  { name: '温水', temp: 53, color: '#f3cc9f', deep: '#d8a56e', steam: false },
  { name: '热水', temp: 87, color: '#e79a86', deep: '#cf6f58', steam: true }
]
// 水杯中心在设计层（900×520）中的 x 坐标（TempCups 放置在 left:30）
const CUP_X = [110, 270, 430]

const selected = ref(0)
const readings = reactive([null, null, null])
const results = reactive([null, null, null]) // true / false / null
const submitted = ref(false)
const done = ref(false)
const hint = ref('点击左侧某个水杯，温度计会移过去浸入水中，请在右侧读出温度')
const zoomOn = ref(false)

const curCup = computed(() => cups[selected.value])

function selectCup(i) {
  if (selected.value === i) return
  selected.value = i
  hint.value = `正在测量${cups[i].name}：视线与汞柱上表面相平，读数时估读到 0.1℃`
}

// ===== 放大观察 =====
const zoomCaption = computed(() => {
  const t = curCup.value.temp
  if (t >= 70) return `${curCup.value.name}：液柱升得很高，注意视线相平`
  if (t >= 35) return `${curCup.value.name}：液柱位置适中，估读到 0.1℃`
  return `${curCup.value.name}：液柱偏低，注意分辨刻度`
})

// ===== 读数要点面板 =====
const measureRows = computed(() => [
  { label: '当前测量', value: curCup.value.name },
  { label: '该杯真实温度', value: `${curCup.value.temp} ℃` }
])
const formulaResults = computed(() => {
  if (!submitted.value) return []
  return cups.map((c, i) => ({
    label: c.name,
    value: results[i] === true ? '✓ 读数正确' : '✗ 有偏差'
  }))
})
const verifySteps = [
  '玻璃泡要全部浸入被测液体，不碰容器底和壁',
  '待温度计示数稳定后再读数',
  '读数时视线与液柱上表面相平，不能俯视或仰视',
  '估读到分度值（1℃）的下一位，如 53.0℃'
]

// ===== Canvas（只画板面背景与标题）=====
const canvasRef = ref(null)
let ctx = null
const dpr = () => Math.min(window.devicePixelRatio || 1, 2)

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
// 设计层等比缩放（与 e-melt / e-boil 相同约定）：最大 1.0，宽屏水平居中
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
  ctx.fillStyle = boardFg(ctx.canvas)
  ctx.font = '700 15px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('温度计的读数练习', L.W / 2, 18)
  ctx.fillStyle = boardText(ctx.canvas)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillText('点击水杯切换测量 · 液柱稳定后读数', L.W / 2, 42)
  ctx.restore()
}

// ===== 校验 =====
function submit() {
  submitted.value = true
  let allOk = true
  for (let i = 0; i < cups.length; i++) {
    const r = Number(readings[i])
    const ok = !isNaN(r) && Math.abs(r - cups[i].temp) <= 1
    results[i] = ok
    if (!ok) allOk = false
  }
  if (allOk) {
    hint.value = '全部读数正确！读数时视线与液柱上表面相平、估读到分度值下一位。'
    if (!done.value) {
      done.value = true
      emit('complete')
    }
  } else {
    hint.value = '有读数偏差，注意：视线相平、估读到分度值下一位，热水的汞柱更高。'
  }
}

function resetAll() {
  submitted.value = false
  for (let i = 0; i < 3; i++) {
    readings[i] = null
    results[i] = null
  }
  hint.value = '点击左侧某个水杯，温度计会移过去浸入水中，请在右侧读出温度'
}

const allFilled = computed(() => readings.every((r) => r !== null && r !== ''))

function resizeCanvas() {
  if (!canvasRef.value) return
  layoutStage()
  setupCanvas()
  render()
}

let resizeObs = null
let lastStageW = 0
let sizePoll = null
function onWinResize() { resizeCanvas() }
onMounted(() => {
  layoutStage()
  setupCanvas()
  render()
  lastStageW = stageRef.value ? stageRef.value.clientWidth : 0
  window.addEventListener('resize', onWinResize)
  if (window.ResizeObserver) {
    resizeObs = new ResizeObserver(resizeCanvas)
    resizeObs.observe(stageRef.value)
  }
  // 兜底轮询（同 e-melt / e-boil）：极端环境下 RO/resize 不可靠时防位置漂移
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
        <div class="tp-stage" ref="stageRef">
          <canvas
            class="logic-canvas" ref="canvasRef"
            style="position:absolute;inset:0;display:block;touch-action:none"
          ></canvas>
          <div class="tp-scale" ref="scaleRef">
            <!-- 装置区（SVG 组件层） -->
            <div class="tp-rig">
              <TempCups :cups="cups" :selected="selected" @select="selectCup" />
              <TempThermo :temp="curCup.temp" :x="CUP_X[selected]" />
            </div>

            <!-- 放大读数小框（设计层内随场景等比缩放） -->
            <transition name="zoompop">
              <div v-if="zoomOn" class="tp-zoom">
                <div class="tz-head">
                  <span>温度计液柱 ×3.7</span>
                  <strong class="tz-temp">{{ curCup.temp.toFixed(1) }}℃</strong>
                </div>
                <TempZoom :temp="curCup.temp" />
                <div class="tz-caption">{{ zoomCaption }}</div>
              </div>
            </transition>
          </div>
        </div>
      </div>

      <div class="lab-actions">
        <button class="btn btn-primary" @click="submit" :disabled="!allFilled">记录并校验读数</button>
        <button class="btn" @click="resetAll">重置</button>
        <button class="btn" :class="{ 'btn-primary': zoomOn }" @click="zoomOn = !zoomOn">放大观察</button>
        <span class="feedback" :class="done ? 'ok' : 'no'">{{ hint }}</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>读数记录</strong>
          <span>估读到 0.1℃</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat" v-for="(c, i) in cups" :key="i">
            <span>{{ c.name }}（真实约 {{ c.temp }}℃）</span>
            <strong style="display:flex;align-items:center;gap:8px">
              <input
                type="number"
                step="0.1"
                v-model="readings[i]"
                placeholder="读数"
                style="width:74px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;font-size:14px"
              />
              <span v-if="submitted && results[i] === true" style="color:var(--ok)">✓</span>
              <span v-else-if="submitted && results[i] === false" style="color:var(--danger)">✗</span>
              <span v-else style="color:var(--text-dim)">℃</span>
            </strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="读数要点"
        formula="视线 ↔ 液柱上表面 相平"
        desc="玻璃泡要全部浸入液体、不碰容器底和壁；待示数稳定后读数。"
        :rows="measureRows"
        :result="formulaResults"
        :verify="verifySteps"
      />
    </aside>
  </div>
</template>

<style scoped>
/* 外层容器：宽度铺满，高度由 JS 按 900:520 缩放比设定（与 e-melt / e-boil 相同） */
.tp-stage {
  position: relative;
  width: 100%;
  height: 520px;
  overflow: hidden;
}
/* 设计层：固定 900×520 逻辑坐标，整体等比缩放（左上角为原点） */
.tp-scale {
  position: absolute;
  left: 0;
  top: 0;
  width: 900px;
  height: 520px;
  transform-origin: top left;
}

/* ===== 放大读数小框（样式同 e-boil 的放大框） ===== */
.tp-zoom {
  position: absolute;
  left: 560px;
  top: 110px;
  width: 240px;
  padding: 9px 10px 8px;
  background: #fffef5;
  border: 2px solid #2a2a2a;
  border-radius: 8px;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.25);
  z-index: 6;
}
.tz-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  font-weight: 800;
  color: #2a2a2a;
}
.tz-temp {
  color: #e0584f;
  font-size: 18px;
  font-weight: 900;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tz-caption {
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
