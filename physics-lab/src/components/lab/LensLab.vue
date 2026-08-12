<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

const canvasRef = ref(null)
let ctx = null
let raf = null
let dpr = 1
let flickerT = 0

// 可调变量
const focalLength = ref(110) // 当前焦距（像素）
const objectHeight = ref(90) // 物体高度（像素）

// 目标物距（用户拖动），当前显示物距（平滑插值）
let uTarget = 220
let u = 220

const seen = { far: false, mid: false, near: false }
let notified = false
const hint = ref('拖动蜡烛调整物距，观察实像与虚像的变化')
const stageName = ref('')
const readout = ref({ u: '2.00 f', v: '2.00 f', m: '1.00', state: 'u > 2f：倒立缩小实像' })

function stageOf(du) {
  const f = focalLength.value
  if (du > 2 * f) return 'far'
  if (du > f) return 'mid'
  return 'near'
}

function imagePara(uu) {
  const f = focalLength.value
  const v = (uu * f) / (uu - f)
  const m = v / uu
  return { v, m }
}

// 公式面板：代入变量实时数值
const formulaRows = computed(() => {
  const f = focalLength.value
  const { v, m } = imagePara(u)
  return [
    { label: '焦距 f', value: `${f} px` },
    { label: '物距 u', value: `${u.toFixed(0)} px = ${(u / f).toFixed(2)} f` },
    { label: '解像距 v = uf/(u−f)', value: `${v.toFixed(1)} px = ${(v / f).toFixed(2)} f` },
    { label: '放大率 |m| = v/u', value: Math.abs(m).toFixed(2) }
  ]
})

// 公式验证：1/u + 1/v = 1/f
const formulaResults = computed(() => {
  const f = focalLength.value
  const { v } = imagePara(u)
  const lhs = 1 / u + 1 / v
  const rhs = 1 / f
  const ok = Math.abs(lhs - rhs) < 1e-6
  return [
    { label: '1/u + 1/v', value: `1/${u.toFixed(0)} + 1/${v.toFixed(0)} = ${lhs.toFixed(6)}` },
    { label: '1/f', value: `1/${f} = ${rhs.toFixed(6)}` },
    { label: ok ? '✅ 高斯成像公式成立' : '推导中…', value: ok ? '相等' : '…' }
  ]
})

const verifySteps = computed(() => {
  const f = focalLength.value
  const { v, m } = imagePara(u)
  const isVirtual = v < 0
  return [
    '由成像公式 1/u + 1/v = 1/f 解出 v，再代入放大率 m = v/u',
    `本次代入：1/${u.toFixed(0)} + 1/${v.toFixed(0)} = 1/${f}，两边相等即验证公式`,
    isVirtual
      ? 'v < 0 表示虚像（与物同侧、正立放大），光屏上承接不到'
      : `v > 0 表示实像（倒立），|m| = ${Math.abs(m).toFixed(2)}${Math.abs(m) >= 1 ? '（放大或等大）' : '（缩小）'}`
  ]
})

// 逻辑坐标系（绘制用，实际按容器×DPR 缩放）
const width = 860
const heightPx = 460

function setupCanvas() {
  const canvas = canvasRef.value
  dpr = window.devicePixelRatio || 1
  ctx = canvas.getContext('2d')
  resizeCanvas()
}

let resizeObs = null

// 逻辑坐标系恒为 W×H；内部像素 = 显示尺寸 × DPR，防止拉宽变形
function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  const rect = canvas.getBoundingClientRect()
  const cw = Math.max(200, rect.width)
  const ch = (cw * heightPx) / width
  const scale = (cw * dpr) / width // 逻辑像素 → 物理像素
  canvas.width = Math.round(cw * dpr)
  canvas.height = Math.round(ch * dpr)
  canvas.style.height = `${ch}px`
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
}

const center = 315
const axisY = 248

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name) || fallback
}

function render() {
  if (!ctx) return
  const W = width
  const H = heightPx

  const card = cssVar('--card', '#fff')
  const lineCol = cssVar('--border', '#ccc')
  const textCol = cssVar('--text', '#555')
  const textH = cssVar('--text-h', '#111')
  const accent = cssVar('--accent', '#4f6ef7')

  // 背景渐变
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, card)
  g.addColorStop(1, card)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // 细腻网格
  ctx.strokeStyle = lineCol
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 1
  for (let x = 30; x < W; x += 30) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = 20; y < H; y += 20) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // 光轴
  ctx.strokeStyle = lineCol
  ctx.lineWidth = 1.5
  ctx.setLineDash([7, 5])
  ctx.beginPath()
  ctx.moveTo(30, axisY)
  ctx.lineTo(W - 30, axisY)
  ctx.stroke()
  ctx.setLineDash([])

  const f = focalLength.value // 当前焦距（像素）
  const h = objectHeight.value // 当前物体高度（像素）

  // 焦点标记
  const labelF = (dx, label, color) => {
    ctx.fillStyle = color
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(label, center + dx, axisY + 24)
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(center + dx, axisY, 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  labelF(+f, 'F', accent)
  labelF(-f, 'F', accent)
  labelF(+2 * f, '2F', textCol)
  labelF(-2 * f, '2F', textCol)

  // 凸透镜（发光双曲线，大小随焦距微调）
  const lensH = Math.min(132, 80 + f * 0.5)
  ctx.save()
  ctx.shadowColor = accent
  ctx.shadowBlur = 14
  ctx.strokeStyle = accent
  ctx.lineWidth = 2.6
  ctx.beginPath()
  ctx.moveTo(center, axisY - lensH)
  ctx.quadraticCurveTo(center + 20, axisY - lensH * 0.75, center, axisY - lensH * 0.55)
  ctx.moveTo(center, axisY + lensH)
  ctx.quadraticCurveTo(center + 20, axisY + lensH * 0.75, center, axisY + lensH * 0.55)
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(160,175,255,0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(center, axisY - lensH)
  ctx.quadraticCurveTo(center - 20, axisY - lensH * 0.75, center, axisY - lensH * 0.55)
  ctx.moveTo(center, axisY + lensH)
  ctx.quadraticCurveTo(center - 20, axisY + lensH * 0.75, center, axisY + lensH * 0.55)
  ctx.stroke()
  ctx.restore()

  const ox = center - u
  const oTop = axisY - h
  drawCandle(ox, axisY, h, flickerT)

  // 成像
  const { v, m } = imagePara(u)
  const virtual = v < 0
  const iTop = axisY - h * Math.abs(m)
  const ix = center + v

  // 先画光路（带辉光动画）
  drawRays({ ox, oTop, ix, iTop, virtual, h })

  ctx.save()
  if (virtual) ctx.setLineDash([5, 5])
  drawImage(ix, axisY, h * Math.abs(m), virtual, accent)
  ctx.restore()

  // 更新读数和状态
  const st = stageOf(u)
  stageName.value =
    st === 'far' ? 'u > 2f：倒立缩小实像' : st === 'mid' ? 'f < u < 2f：倒立放大实像' : 'u < f：正立放大虚像'
  readout.value = {
    u: `${(u / f).toFixed(2)} f`,
    v: virtual ? `-${(Math.abs(v) / f).toFixed(2)} f` : `${(Math.abs(v) / f).toFixed(2)} f`,
    m: Math.abs(m).toFixed(2),
    state: stageName.value
  }

  // 顶栏文字
  ctx.fillStyle = textH
  ctx.font = 'bold 15px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`物距 u = ${(u / f).toFixed(2)} f · 焦距 f = ${f}px`, 40, 40)
  ctx.fillStyle = st === 'near' ? '#d97706' : accent
  ctx.fillText(stageName.value, 40, 64)
  ctx.fillStyle = textCol
  ctx.font = '13px sans-serif'
  ctx.fillText(
    virtual ? '虚像：光屏上承接不到，透过透镜观察' : `像距 v = ${(Math.abs(v) / f).toFixed(2)} f · 放大率 |m| = ${Math.abs(m).toFixed(2)}`,
    40,
    86
  )
  ctx.fillStyle = textCol
  ctx.font = '13px sans-serif'
  ctx.fillText('拖动蜡烛调整物距 ✋', W - 180, 40)
}

function drawCandle(x, baseY, h, t) {
  // 底座
  ctx.fillStyle = '#8b7355'
  const base = (w, hh, oy) => {
    ctx.beginPath()
    ctx.roundRect ? ctx.roundRect(x - w / 2, baseY + oy, w, hh, 3) : ctx.rect(x - w / 2, baseY + oy, w, hh)
    ctx.fill()
  }
  base(54, 8, -8)
  base(34, 6, -2)

  // 蜡烛身（渐变）
  const cg = ctx.createLinearGradient(x - 8, 0, x + 8, 0)
  cg.addColorStop(0, '#d84f4f')
  cg.addColorStop(0.5, '#ff6b6b')
  cg.addColorStop(1, '#c0392b')
  ctx.fillStyle = cg
  ctx.beginPath()
  ctx.moveTo(x - 8, baseY)
  ctx.lineTo(x - 8, baseY - h)
  ctx.lineTo(x + 8, baseY - h)
  ctx.lineTo(x + 8, baseY)
  ctx.closePath()
  ctx.fill()

  // 烛芯
  ctx.strokeStyle = '#5a4632'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, baseY - h)
  ctx.lineTo(x, baseY - h - 6)
  ctx.stroke()

  // 火焰（摇曳 + 发光）
  const fl = Math.sin(t * 0.012 + x * 0.01) * 1.5
  ctx.save()
  ctx.shadowColor = '#ff9f43'
  ctx.shadowBlur = 16
  const fg = ctx.createRadialGradient(x, baseY - h - 12 + fl, 1, x, baseY - h - 12 + fl, 10)
  fg.addColorStop(0, 'rgba(255,255,220,1)')
  fg.addColorStop(0.35, 'rgba(255,200,90,0.95)')
  fg.addColorStop(1, 'rgba(255,120,40,0)')
  ctx.fillStyle = fg
  ctx.beginPath()
  ctx.ellipse(x, baseY - h - 12 + fl, 5, 8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.restore()

  // 光晕
  ctx.save()
  const halo = ctx.createRadialGradient(x, baseY - h - 12, 4, x, baseY - h - 12, 40)
  halo.addColorStop(0, 'rgba(255,180,80,0.25)')
  halo.addColorStop(1, 'rgba(255,180,80,0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(x, baseY - h - 12, 40, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawImage(x, baseY, h, dashed, accent) {
  ctx.save()
  const col = dashed ? '#d97706' : accent
  ctx.strokeStyle = col
  ctx.lineWidth = 2
  ctx.setLineDash(dashed ? [6, 4] : [])
  ctx.strokeRect(x - 7, baseY - h, 14, h)
  ctx.setLineDash([])
  ctx.shadowColor = col
  ctx.shadowBlur = dashed ? 8 : 12
  ctx.fillStyle = col
  ctx.globalAlpha = dashed ? 0.35 : 0.55
  ctx.fillRect(x - 7, baseY - h, 14, h)
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = col
  ctx.fillText(dashed ? '虚像' : '实像', x, baseY - h - 12)
  ctx.restore()
}

function glowLine(points, color, width) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
  ctx.stroke()
  ctx.restore()
}

// 流动光点（沿光路运动）
function flowDot(from, to, offset, color) {
  const t = ((flickerT * 0.9 + offset) % 120) / 120
  const x = from[0] + (to[0] - from[0]) * t
  const y = from[1] + (to[1] - from[1]) * t
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = 8
  ctx.fillStyle = color
  ctx.globalAlpha = 0.8
  ctx.beginPath()
  ctx.arc(x, y, 2.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.restore()
}

function drawRays({ ox, oTop, ix, iTop, virtual }) {
  const f = focalLength.value
  const r1 = 'rgba(120,150,255,0.75)'
  const r2 = 'rgba(255,170,80,0.75)'
  const r3 = 'rgba(80,220,140,0.75)'

  const segs = []
  // 光线1：平行 → 右焦点 → 像点
  segs.push([
    [ox, oTop],
    [center + f, oTop],
    [ix, iTop],
    r1
  ])
  // 光线2：过光心 → 像点
  segs.push([
    [ox, oTop],
    [ix, iTop],
    r2
  ])
  if (!virtual) {
    segs.push([
      [ox, oTop],
      [ox - Math.max(0, f - u), iTop],
      r3
    ])
  }

  for (const [p0, p1, col] of segs) {
    glowLine([p0, p1], col, 1.8)
    flowDot(p0, p1, p0[0] * 0.1, col)
  }
  void r3
}

function onPointerDown(e) {
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  const toLogical = width / rect.width // 显示像素 → 逻辑像素
  canvas.setPointerCapture(e.pointerId)
  const move = (ev) => {
    const x = (ev.clientX - rect.left) * toLogical
    const rel = center - x
    uTarget = Math.min(Math.max(rel, 70), 360)
    checkSeen(uTarget)
  }
  move(e)
  const up = () => {
    canvas.releasePointerCapture(e.pointerId)
    canvas.removeEventListener('pointermove', move)
    canvas.removeEventListener('pointerup', up)
  }
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
}

function checkSeen(du) {
  seen[stageOf(du)] = true
  if (seen.far && seen.mid && seen.near && !notified) {
    notified = true
    hint.value = '已观察三种成像情况！实验完成 ✅'
    emit('complete')
  } else {
    hint.value = '拖动蜡烛调整物距，观察实像与虚像的变化'
  }
}

function reset() {
  uTarget = 220
  seen.far = false
  seen.mid = false
  seen.near = false
  notified = false
  hint.value = '拖动蜡烛调整物距，观察实像与虚像的变化'
}

function loop() {
  // 平滑缓动跟随（liziwuli 风格），临界点附近减速
  const diff = uTarget - u
  u += diff * 0.18
  if (Math.abs(diff) < 0.3) u = uTarget
  flickerT += 1
  render()
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  setupCanvas()
  if (window.ResizeObserver) {
    resizeObs = new ResizeObserver(() => resizeCanvas())
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
          @pointerdown="onPointerDown"
          style="touch-action:none;cursor:ew-resize;display:block;width:100%;background:var(--surface)"
        ></canvas>
      </div>

      <div class="lab-actions">
        <span class="feedback" :class="notified ? 'ok' : 'no'">{{ hint }}</span>
        <button class="btn btn-sm" @click="reset">↺ 重置</button>
      </div>

      <FormulaPanel
        title="🧮 公式与结果"
        formula="1/u + 1/v = 1/f　　|m| = v/u"
        desc="u 物距、v 像距、f 焦距。拖动蜡烛或调节焦距，下方数值实时更新并自动验证公式。"
        :rows="formulaRows"
        :result="formulaResults"
        :verify="verifySteps"
      />
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>⚙ 可调变量</strong>
          <span>实时联动</span>
        </div>
        <div class="lab-params">
          <ParamSlider v-model="focalLength" :min="60" :max="180" :step="2" label="焦距 f" unit=" px" hint="改变焦距，F 与 2F 标记随之移动" />
          <ParamSlider v-model="objectHeight" :min="50" :max="150" :step="2" label="物体高度 h" unit=" px" hint="改变蜡烛高度，观察像的大小变化" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>📊 实时数据</strong>
          <span>只读输出</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat">
            <span>物距 u</span>
            <strong>{{ readout.u }}</strong>
          </div>
          <div class="lab-stat accent">
            <span>像距 v</span>
            <strong>{{ readout.v }}</strong>
          </div>
          <div class="lab-stat">
            <span>放大率 |m|</span>
            <strong>{{ readout.m }}</strong>
          </div>
          <div class="lab-stat success">
            <span>成像状态</span>
            <strong style="font-size:13px">{{ readout.state }}</strong>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>