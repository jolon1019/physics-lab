<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])
const labRef = ref(null)

// ==================== 参数 ====================
const focalLength = ref(20)   // 焦距 cm
const uDist = ref(70)         // 物距 cm
const screenDist = ref(28)    // 光屏位置 cm
const objectHeight = ref(90)  // 物体高度 px

const showRay = ref(true)
const showScr = ref(true)
const autoAlign = ref(false)

const hint = ref('拖动 F 形光源改变物距，拖动光屏寻找清晰实像')
const readout = ref({ u: '3.50f', v: '1.40f', m: '0.40', state: 'u > 2f：倒立缩小实像' })

const seenZones = { far: false, mid: false, near: false }
let experimentDone = false

// ==================== 常量（参考代码） ====================
const LENS_X = 460
const PX_CM = 3.0
const CY = 310
// 光具台设计尺寸（所有绝对定位均基于此坐标系）
const BENCH_W = 920
const BENCH_H = 520

// 台面等比缩放：容器多大就整体缩到多大，内部逻辑坐标不变
const wrapRef = ref(null)
const benchRef = ref(null)
let BSCALE = 1
function layoutBench() {
  const w = wrapRef.value, b = benchRef.value
  if (!w || !b) return
  const s = Math.max(0.2, Math.min(w.clientWidth / BENCH_W, w.clientHeight / BENCH_H))
  BSCALE = s
  b.style.transform = `translate(-50%, -50%) scale(${s})`
}
const OFF_TOP = -46
const OFF_MID = -4
const OFF_BOT = 46

const toL = cm => LENS_X - cm * PX_CM
const toR = cm => LENS_X + cm * PX_CM

// ==================== 物理计算 ====================
function imageDist(u) {
  const f = focalLength.value
  if (Math.abs(u - f) < 1) return Infinity
  return u > f ? (u * f) / (u - f) : -(u * f) / (f - u)
}

function stageOf(u) {
  const f = focalLength.value
  if (u > 2 * f) return 'far'
  if (u > f) return 'mid'
  return 'near'
}

// ==================== 参考代码渲染 ====================
let rayVisible = true, scrVisible = true, autoAlignMode = false
let dragObj = false, dragScr = false

function render() {
  const u = uDist.value
  const f = focalLength.value
  let v = screenDist.value

  let vT = imageDist(u)

  if (autoAlignMode && isFinite(vT) && u > f) {
    v = Math.round(Math.max(5, Math.min(140, vT)))
    screenDist.value = v
  }

  const objX = toL(u)
  const scrX = toR(v)
  const absM = isFinite(vT) ? Math.abs(vT / u) : 0

  // 透镜位置
  const lensEl = document.getElementById('labLens')
  const lensLabel = document.getElementById('labLensL')
  const oLabel = document.getElementById('labOL')
  if (lensEl) lensEl.style.left = LENS_X + 'px'
  if (lensLabel) lensLabel.style.left = LENS_X + 'px'
  if (oLabel) oLabel.style.left = LENS_X + 'px'

  // 焦点标记
  const fl = toL(f), fr = toR(f)
  const dfl = toL(2 * f), dfr = toR(2 * f)
  for (const id of ['fL', 'fLT']) { const el = document.getElementById(id); if (el) el.style.left = fl + 'px' }
  for (const id of ['fR', 'fRT']) { const el = document.getElementById(id); if (el) el.style.left = fr + 'px' }
  for (const id of ['dL', 'dLT']) { const el = document.getElementById(id); if (el) el.style.left = dfl + 'px' }
  for (const id of ['dR', 'dRT']) { const el = document.getElementById(id); if (el) el.style.left = dfr + 'px' }

  // F 形光源
  const fObj = document.getElementById('labFObj')
  if (fObj) {
    fObj.style.left = (objX - 26) + 'px'
    fObj.style.top = (CY - 50) + 'px'
  }

  // 光屏
  const scr = document.getElementById('labScreen')
  const scrL = document.getElementById('labScreenL')
  if (scr) { scr.style.display = scrVisible ? 'block' : 'none'; scr.style.left = scrX + 'px' }
  if (scrL) { scrL.style.display = scrVisible ? 'block' : 'none'; scrL.style.left = scrX + 'px' }

  // F 形象
  const fImg = document.getElementById('labFImg')
  const hV = document.getElementById('hintV')
  const hN = document.getElementById('hintN')
  let info = ''

  if (Math.abs(u - f) < 1.2 || !isFinite(vT)) {
    if (fImg) fImg.style.opacity = '0'
    if (hV) hV.classList.remove('show')
    if (hN) hN.classList.add('show')
    info = `<span class="hl-n">不成像</span><br>u ≈ f = ${f}cm，光线近似平行`
  } else if (u > f) {
    if (hV) hV.classList.remove('show')
    if (hN) hN.classList.remove('show')
    const imgX = toR(vT)

    if (fImg) {
      fImg.style.left = (imgX - 26 * absM) + 'px'
      fImg.style.top = (CY - 50 * absM) + 'px'
      fImg.style.width = (52 * absM) + 'px'
      fImg.style.height = (100 * absM) + 'px'
      fImg.style.transform = 'scale(1, -1)'
      fImg.style.transformOrigin = 'center center'
    }

    const onF = Math.abs(v - vT) < 3
    if (fImg) fImg.style.opacity = onF ? 0.95 : 0.15

    if (u > 2 * f) info = `<span class="hl-r">实像</span> <span class="hl-i">倒立</span> <span class="hl-s">缩小</span><br>u=${u}cm > 2f=${2 * f}cm | v=${vT.toFixed(1)}cm`
    else if (Math.abs(u - 2 * f) < 2) info = `<span class="hl-r">实像</span> <span class="hl-i">倒立</span> <span class="hl-e">等大</span><br>u≈2f=${2 * f}cm | v≈${vT.toFixed(1)}cm`
    else info = `<span class="hl-r">实像</span> <span class="hl-i">倒立</span> <span class="hl-l">放大</span><br>f=${f}<u=${u}<2f=${2 * f} | v=${vT.toFixed(1)}cm`

    info += onF ? `<br><span style="color:#4ade80;font-size:11px">✓ 光屏清晰</span>` : `<br><span style="color:#f87171;font-size:11px">✗ 偏离${Math.abs(v - vT).toFixed(1)}cm</span>`
  } else {
    if (hN) hN.classList.remove('show')
    if (hV) hV.classList.add('show')
    const imgX = toL(Math.abs(vT))

    if (fImg) {
      fImg.style.left = (imgX - 26 * absM) + 'px'
      fImg.style.top = (CY - 50 * absM) + 'px'
      fImg.style.width = (52 * absM) + 'px'
      fImg.style.height = (100 * absM) + 'px'
      fImg.style.transform = 'scale(1, 1)'
      fImg.style.opacity = 0.9
    }

    info = `<span class="hl-v">虚像</span> <span class="hl-u">正立</span> <span class="hl-l">放大</span><br>u=${u}cm < f=${f}cm | |v|=${Math.abs(vT).toFixed(1)}cm`
  }

  const infoB = document.getElementById('infoB')
  if (infoB) infoB.innerHTML = info

  // 绘制光线
  const rayBox = document.getElementById('rayBox')
  if (rayBox) {
    rayBox.innerHTML = ''
    if (rayVisible && isFinite(vT)) drawPaths(u, f, vT, objX)
  }

  // 更新读数
  const isReal = vT > 0
  const m = Math.abs(vT / u)
  const st = stageOf(u)
  readout.value = {
    u: `${(u / f).toFixed(2)}f`,
    v: isReal ? `${(vT / f).toFixed(2)}f` : `-${(Math.abs(vT) / f).toFixed(2)}f`,
    m: m.toFixed(2),
    state: Math.abs(u - f) < 1.2 ? 'u ≈ f：不成像'
      : st === 'far' ? 'u > 2f：倒立缩小实像'
      : st === 'mid' ? 'f < u < 2f：倒立放大实像'
      : 'u < f：正立放大虚像'
  }
}

function drawRay(x1, y1, x2, y2, cls) {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return
  const ang = Math.atan2(dy, dx) * 180 / Math.PI
  const el = document.createElement('div')
  el.className = 'ray ' + cls
  el.style.left = x1 + 'px'
  el.style.top = (y1 - 1.25) + 'px'
  el.style.width = len + 'px'
  el.style.transform = `rotate(${ang}deg)`
  document.getElementById('rayBox').appendChild(el)
}

function drawPaths(u, f, vT, objX) {
  const isReal = u > f
  const frX = toR(f)
  const absV = Math.abs(vT)
  const imgX = isReal ? toR(vT) : toL(absV)
  const m = Math.abs(vT / u)

  const yT = CY + OFF_TOP
  const yM = CY + OFF_MID
  const yB = CY + OFF_BOT

  let iyT, iyM, iyB
  if (isReal) {
    iyT = CY - OFF_TOP * m
    iyM = CY - OFF_MID * m
    iyB = CY - OFF_BOT * m
  } else {
    iyT = CY + OFF_TOP * m
    iyM = CY + OFF_MID * m
    iyB = CY + OFF_BOT * m
  }

  // 顶部点
  drawRay(objX, yT, LENS_X, yT, 'ray-in')
  if (isReal) {
    drawRay(LENS_X, yT, imgX, iyT, 'ray-out')
    drawRay(imgX, iyT, imgX + 50, iyT + (iyT - yT) * 50 / (imgX - LENS_X), 'ray-out')
  } else {
    const s1 = (CY - yT) / (frX - LENS_X)
    drawRay(LENS_X, yT, LENS_X + 100, yT + s1 * 100, 'ray-out')
    drawRay(LENS_X, yT, imgX, iyT, 'ray-vir')
  }
  drawRay(objX, yT, LENS_X, CY, 'ray-in')
  if (isReal) {
    drawRay(LENS_X, CY, imgX, iyT, 'ray-out')
    drawRay(imgX, iyT, imgX + 50, iyT + (iyT - CY) * 50 / (imgX - LENS_X), 'ray-out')
  } else {
    const s2 = (CY - yT) / (LENS_X - objX)
    drawRay(LENS_X, CY, LENS_X + 100, CY + s2 * 100, 'ray-out')
    drawRay(LENS_X, CY, imgX, iyT, 'ray-vir')
  }

  // 中部点
  if (isReal) {
    drawRay(objX, yM, imgX, iyM, 'ray-axis')
    drawRay(imgX, iyM, imgX + 60, iyM, 'ray-axis')
  } else {
    drawRay(objX, yM, LENS_X, yM, 'ray-axis')
    drawRay(LENS_X, yM, LENS_X + 80, yM, 'ray-axis')
    drawRay(LENS_X, yM, imgX, iyM, 'ray-vir')
  }

  // 底部点
  drawRay(objX, yB, LENS_X, yB, 'ray-in')
  if (isReal) {
    drawRay(LENS_X, yB, imgX, iyB, 'ray-out')
    drawRay(imgX, iyB, imgX + 50, iyB + (iyB - yB) * 50 / (imgX - LENS_X), 'ray-out')
  } else {
    const s3 = (CY - yB) / (frX - LENS_X)
    drawRay(LENS_X, yB, LENS_X + 100, yB + s3 * 100, 'ray-out')
    drawRay(LENS_X, yB, imgX, iyB, 'ray-vir')
  }
  drawRay(objX, yB, LENS_X, CY, 'ray-in')
  if (isReal) {
    drawRay(LENS_X, CY, imgX, iyB, 'ray-out')
    drawRay(imgX, iyB, imgX + 50, iyB + (iyB - CY) * 50 / (imgX - LENS_X), 'ray-out')
  } else {
    const s4 = (CY - yB) / (LENS_X - objX)
    drawRay(LENS_X, CY, LENS_X + 100, CY + s4 * 100, 'ray-out')
    drawRay(LENS_X, CY, imgX, iyB, 'ray-vir')
  }
}

function drawRuler() {
  const box = document.getElementById('labRuler')
  if (!box) return
  box.innerHTML = ''
  for (let cm = 0; cm <= 150; cm += 5) {
    const xl = toL(cm), xr = toR(cm)
    if (xl >= 20) addTick(box, xl, cm)
    if (xr <= 880) addTick(box, xr, cm)
  }
  const c = document.createElement('div')
  c.className = 'tick major'
  c.style.left = LENS_X + 'px'
  c.style.height = '14px'
  c.style.background = 'rgba(100,200,255,0.7)'
  box.appendChild(c)
}

function addTick(box, x, cm) {
  const t = document.createElement('div')
  t.className = 'tick ' + (cm % 10 === 0 ? 'major' : 'minor')
  t.style.left = x + 'px'
  box.appendChild(t)
  if (cm % 10 === 0 && cm > 0) {
    const n = document.createElement('div')
    n.className = 'num'
    n.style.left = x + 'px'
    n.textContent = cm
    box.appendChild(n)
  }
}

function setPreset(val) {
  uDist.value = val
  const f = focalLength.value
  if (Math.abs(val - f) < 2) screenDist.value = 60
  else if (val > f) {
    const vt = (val * f) / (val - f)
    screenDist.value = Math.round(Math.max(5, Math.min(140, vt)))
  } else screenDist.value = 30
  render()
}

function toggleRay() {
  rayVisible = !rayVisible
  render()
}
function toggleScr() {
  scrVisible = !scrVisible
  render()
}
function toggleAuto() {
  autoAlignMode = !autoAlignMode
  autoAlign.value = autoAlignMode
  render()
}

function reset() {
  uDist.value = 70
  screenDist.value = 28
  focalLength.value = 20
  seenZones.far = false
  seenZones.mid = false
  seenZones.near = false
  experimentDone = false
  hint.value = '拖动 F 形光源改变物距，拖动光屏寻找清晰实像'
  render()
}

// ==================== 公式面板 ====================
const formulaRows = computed(() => {
  const u = uDist.value
  const v = imageDist(u)
  return [
    { label: '焦距 f', value: `${focalLength.value} cm` },
    { label: '物距 u', value: `${u.toFixed(0)} cm = ${(u / focalLength.value).toFixed(2)}f` },
    { label: '像距 v', value: `${v.toFixed(1)} cm = ${(v / focalLength.value).toFixed(2)}f` },
    { label: '放大率 |m|', value: Math.abs(v / u).toFixed(2) }
  ]
})

const formulaResults = computed(() => {
  const u = uDist.value
  const v = imageDist(u)
  const f = focalLength.value
  if (!isFinite(v)) return [{ label: 'u ≈ f', value: '不成像' }]
  const lhs = 1 / u + 1 / v
  const rhs = 1 / f
  return [
    { label: '1/u + 1/v', value: `1/${u} + 1/${v.toFixed(1)} = ${lhs.toFixed(4)}` },
    { label: '1/f', value: `1/${f} = ${rhs.toFixed(4)}` },
    { label: Math.abs(lhs - rhs) < 0.001 ? '公式成立 ✓' : '…', value: Math.abs(lhs - rhs) < 0.001 ? '相等' : '推导中' }
  ]
})

// ==================== 生命周期 ====================
onMounted(() => {
  drawRuler()
  render()

  // 交互事件
  const lab = labRef.value
  if (!lab) return

  document.getElementById('labFObj').addEventListener('pointerdown', e => {
    dragObj = true
    e.preventDefault()
  })
  document.getElementById('labScreen').addEventListener('pointerdown', e => {
    dragScr = true
    e.preventDefault()
  })

  document.addEventListener('pointermove', e => {
    if (!dragObj && !dragScr) return
    const b = benchRef.value
    if (!b) return
    // 屏幕坐标 → 台面设计坐标（÷ 缩放比）
    const brect = b.getBoundingClientRect()
    const x = (e.clientX - brect.left) / (BSCALE || 1)
    if (dragObj) {
      const u = Math.max(8, Math.min(140, Math.round((LENS_X - x) / PX_CM)))
      uDist.value = u
      if (autoAlignMode) {
        const f = focalLength.value
        if (u > f + 1) {
          const vt = (u * f) / (u - f)
          screenDist.value = Math.round(Math.max(5, Math.min(140, vt)))
        }
      }
      render()
      checkSeen()
    }
    if (dragScr) {
      const v = Math.max(5, Math.min(140, Math.round((x - LENS_X) / PX_CM)))
      screenDist.value = v
      render()
    }
  })
  document.addEventListener('pointerup', () => {
    dragObj = false
    dragScr = false
  })

  // 台面缩放自适应
  layoutBench()
  if (window.ResizeObserver && wrapRef.value) {
    new ResizeObserver(layoutBench).observe(wrapRef.value)
  }
  window.addEventListener('resize', layoutBench)
})

watch([uDist, focalLength, screenDist], () => render())

function checkSeen() {
  seenZones[stageOf(uDist.value)] = true
  if (seenZones.far && seenZones.mid && seenZones.near && !experimentDone) {
    experimentDone = true
    hint.value = '已观察三种成像情况，实验完成！'
    emit('complete')
  } else {
    hint.value = '拖动 F 形光源改变物距，拖动光屏寻找清晰实像'
  }
}
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel board-dark" style="padding:0;overflow:hidden;position:relative">
        <!-- 完全复制参考案例的 HTML 结构 -->
        <div class="lab-container" ref="labRef" id="labContainer">
          <div class="lab-title">凸透镜成像 — 块状F形LED光源</div>

          <div class="legend">
            <div><span class="l-in"></span>入射光（物→透镜）</div>
            <div><span class="l-out"></span>折射光（透镜→像）</div>
            <div><span class="l-vir"></span>反向延长线（虚像）</div>
            <div><span class="l-axis"></span>主轴光线</div>
          </div>

          <!-- 光具台：固定 920×520 设计坐标，外层按容器等比缩放（窄屏不跑位不裁剪） -->
          <div class="bench-wrap" ref="wrapRef">
            <div class="bench" ref="benchRef">
          <div class="axis"></div>
          <div class="ruler" id="labRuler"></div>

          <div class="focus" id="fL" style="left:0"></div>
          <div class="focus-t" id="fLT" style="left:0">F</div>
          <div class="focus" id="fR" style="left:0"></div>
          <div class="focus-t" id="fRT" style="left:0">F</div>
          <div class="df" id="dL" style="left:0"></div>
          <div class="df-t" id="dLT" style="left:0">2F</div>
          <div class="df" id="dR" style="left:0"></div>
          <div class="df-t" id="dRT" style="left:0">2F</div>
          <div class="o-label" id="labOL" style="left:0">O</div>

          <div class="lens" id="labLens" style="left:0"></div>
          <div class="lens-label" id="labLensL" style="left:0">凸透镜</div>

          <svg class="f-obj" id="labFObj" width="52" height="100" viewBox="0 0 52 100" style="left:0;top:0">
            <defs>
              <filter id="redGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="6" result="blur1"/>
                <feGaussianBlur stdDeviation="12" result="blur2"/>
                <feMerge>
                  <feMergeNode in="blur2"/>
                  <feMergeNode in="blur1"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <rect x="6" y="4" width="10" height="92" rx="2" fill="#ff5252" filter="url(#redGlow)"/>
            <rect x="8" y="4" width="6" height="92" rx="1" fill="#ff1744"/>
            <rect x="6" y="4" width="42" height="10" rx="2" fill="#ff5252" filter="url(#redGlow)"/>
            <rect x="6" y="6" width="42" height="6" rx="1" fill="#ff1744"/>
            <rect x="6" y="36" width="32" height="10" rx="2" fill="#ff5252" filter="url(#redGlow)"/>
            <rect x="6" y="38" width="32" height="6" rx="1" fill="#ff1744"/>
          </svg>

          <div class="screen" id="labScreen" style="left:0"></div>
          <div class="screen-label" id="labScreenL" style="left:0">光屏</div>

          <svg class="f-img" id="labFImg" width="52" height="100" viewBox="0 0 52 100" style="left:0;top:0">
            <defs>
              <filter id="greenGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="6" result="blur1"/>
                <feGaussianBlur stdDeviation="12" result="blur2"/>
                <feMerge>
                  <feMergeNode in="blur2"/>
                  <feMergeNode in="blur1"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <rect x="6" y="4" width="10" height="92" rx="2" fill="#69f0ae" filter="url(#greenGlow)"/>
            <rect x="8" y="4" width="6" height="92" rx="1" fill="#00e676"/>
            <rect x="6" y="4" width="42" height="10" rx="2" fill="#69f0ae" filter="url(#greenGlow)"/>
            <rect x="6" y="6" width="42" height="6" rx="1" fill="#00e676"/>
            <rect x="6" y="36" width="32" height="10" rx="2" fill="#69f0ae" filter="url(#greenGlow)"/>
            <rect x="6" y="38" width="32" height="6" rx="1" fill="#00e676"/>
          </svg>

          <div id="rayBox"></div>
            </div>
          </div>

          <div class="hint hint-v" id="hintV">
            撤去光屏，从右侧透过透镜观察<br>
            可见<span style="color:#60a5fa">正立、放大的虚像</span>（与F光源在透镜同侧）
          </div>
          <div class="hint hint-n" id="hintN">
            注意：物距 u ≈ f，光线经透镜后近似平行<br>
            无法会聚成像
          </div>

          <!-- 底部控制栏（精简） -->
          <div class="panel">
            <div class="col" style="min-width:150px">
              <div class="lbl">典型场景</div>
              <div class="chips">
                <span class="chip" @click="setPreset(100)">u＞2f</span>
                <span class="chip" @click="setPreset(40)">u＝2f</span>
                <span class="chip" @click="setPreset(30)">f＜u＜2f</span>
                <span class="chip" @click="setPreset(20)">u≈f</span>
                <span class="chip" @click="setPreset(12)">u＜f</span>
              </div>
            </div>

            <div class="info" style="flex:1;border:none;padding:0 10px">
              <div class="info-title">成像分析</div>
              <div class="info-body" id="infoB">
                调节物距，观察块状F光源上中下三道光路经凸透镜后的成像
              </div>
            </div>

            <div class="col" style="min-width:90px">
              <div class="lbl">显示控制</div>
              <div class="btns">
                <button class="btn" :class="{ on: rayVisible }" @click="toggleRay()">光线</button>
                <button class="btn" :class="{ on: scrVisible }" @click="toggleScr()">光屏</button>
              </div>
              <div class="btns" style="margin-top:4px">
                <button class="btn" :class="{ on: autoAlignMode }" @click="toggleAuto()">自动对齐</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="lab-actions">
        <span class="feedback" :class="experimentDone ? 'ok' : 'no'">{{ hint }}</span>
        <div class="btn-group">
          <button class="btn btn-sm" @click="reset">重置</button>
        </div>
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
          <ParamSlider v-model="focalLength" :min="12" :max="35" :step="1" label="焦距 f" unit=" cm" hint="改变焦距，F 与 2F 标记随之移动" />
          <ParamSlider v-model="uDist" :min="8" :max="140" :step="1" label="物距 u" unit=" cm" hint="拖动滑块改变物距" />
          <ParamSlider v-model="screenDist" :min="5" :max="140" :step="1" label="像距 v" unit=" cm" hint="拖动滑块移动光屏" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实时数据</strong>
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

      <FormulaPanel
        title="公式与结果"
        formula="1/u + 1/v = 1/f　　|m| = v/u"
        desc="u 物距、v 像距、f 焦距。拖动光源或调节焦距，下方数值实时更新并自动验证公式。"
        :rows="formulaRows"
        :result="formulaResults"
      />
    </aside>
  </div>
</template>

<style scoped>
/* ========== 完全复制参考案例的 CSS ========== */

/* 光具台等比缩放容器：
   wrap 铺满整个容器，bench 固定 920×520 设计尺寸、由 JS 设置 scale，
   任何屏幕宽度下光学布局都与桌面版完全一致（仅整体等比缩放，不跑位不裁剪） */
.bench-wrap {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.bench {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 920px;
  height: 520px;
  transform-origin: center center;
}
/* 拖拽热区：允许指针拖动而不触发页面滚动 */
#labFObj, #labScreen { touch-action: none; cursor: grab; }
#labFObj:active, #labScreen:active { cursor: grabbing; }

.lab-container {
  width: 100%;
  height: 100%;
  min-height: 500px;
  background: transparent;
  border-radius: 16px;
  position: relative;
  overflow: hidden;
  user-select: none;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
}
.lab-title {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  color: #f0f4f8;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
  text-shadow: 0 0 20px rgba(255, 100, 100, 0.5);
  z-index: 30;
  white-space: nowrap;
}
.axis {
  position: absolute;
  top: 310px;
  left: 20px;
  right: 20px;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(100,150,200,0.5) 5%, rgba(100,150,200,0.5) 95%, transparent);
  z-index: 1;
}
.ruler {
  position: absolute;
  top: 314px;
  left: 20px;
  right: 20px;
  height: 24px;
  pointer-events: none;
  z-index: 2;
}
.lens {
  position: absolute;
  top: 250px;
  width: 16px;
  height: 120px;
  background: linear-gradient(180deg, 
    rgba(100,200,255,0.1) 0%, 
    rgba(100,200,255,0.4) 20%, 
    rgba(100,200,255,0.7) 50%, 
    rgba(100,200,255,0.4) 80%, 
    rgba(100,200,255,0.1) 100%);
  border: 2px solid rgba(100,200,255,0.6);
  border-radius: 50%;
  transform: translateX(-50%);
  box-shadow: 0 0 40px rgba(100,200,255,0.3), inset 0 0 30px rgba(100,200,255,0.2);
  z-index: 10;
}
.lens-label {
  position: absolute;
  top: 230px;
  transform: translateX(-50%);
  color: #7dd3fc;
  font-size: 12px;
  font-weight: 700;
  text-shadow: 0 0 10px rgba(100,200,255,0.6);
  z-index: 10;
}
.o-label {
  position: absolute;
  top: 316px;
  transform: translateX(-50%);
  color: rgba(100,150,200,0.6);
  font-size: 13px;
  font-weight: 700;
  z-index: 2;
}
.focus {
  position: absolute;
  top: 306px;
  width: 10px;
  height: 10px;
  background: #fbbf24;
  border-radius: 50%;
  transform: translateX(-50%);
  box-shadow: 0 0 12px #fbbf24, 0 0 25px rgba(251,191,36,0.5);
  z-index: 5;
}
.focus-t {
  position: absolute;
  top: 322px;
  transform: translateX(-50%);
  color: #fbbf24;
  font-size: 12px;
  font-weight: 700;
  z-index: 5;
}
.df {
  position: absolute;
  top: 307px;
  width: 6px;
  height: 6px;
  background: #f87171;
  border-radius: 50%;
  transform: translateX(-50%);
  box-shadow: 0 0 10px #f87171;
  z-index: 5;
}
.df-t {
  position: absolute;
  top: 322px;
  transform: translateX(-50%);
  color: #f87171;
  font-size: 11px;
  font-weight: 700;
  z-index: 5;
}
.f-obj {
  position: absolute;
  z-index: 20;
  cursor: grab;
  filter: drop-shadow(0 0 25px rgba(255,40,40,1)) drop-shadow(0 0 50px rgba(255,20,20,0.7));
}
.f-obj:active { cursor: grabbing; }
.screen {
  position: absolute;
  top: 245px;
  width: 10px;
  height: 130px;
  background: linear-gradient(180deg, #e2e8f0, #cbd5e1, #e2e8f0);
  border-radius: 5px;
  transform: translateX(-50%);
  box-shadow: 0 0 25px rgba(255,255,255,0.15), 4px 0 10px rgba(0,0,0,0.5);
  z-index: 12;
  cursor: grab;
}
.screen:active { cursor: grabbing; }
.screen-label {
  position: absolute;
  top: 225px;
  transform: translateX(-50%);
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  z-index: 12;
}
.f-img {
  position: absolute;
  z-index: 8;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
.ray {
  position: absolute;
  height: 2.5px;
  transform-origin: left center;
  pointer-events: none;
  z-index: 3;
  border-radius: 1px;
}
.ray-in {
  background: linear-gradient(90deg, rgba(255,220,100,0.95), rgba(255,220,100,0.3));
  box-shadow: 0 0 6px rgba(255,220,100,0.4);
}
.ray-out {
  background: linear-gradient(90deg, rgba(100,200,255,0.95), rgba(100,200,255,0.3));
  box-shadow: 0 0 6px rgba(100,200,255,0.4);
}
.ray-vir {
  background: repeating-linear-gradient(90deg, rgba(180,180,200,0.6), rgba(180,180,200,0.6) 5px, transparent 5px, transparent 10px);
  height: 2px;
}
.ray-axis {
  background: linear-gradient(90deg, rgba(150,150,180,0.7), rgba(150,150,180,0.2));
  height: 2px;
}
.panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 80px;
  background: linear-gradient(180deg, rgba(5,8,16,0.98), rgba(3,5,12,0.99));
  border-top: 1px solid rgba(30,50,80,0.6);
  display: flex;
  padding: 10px 16px;
  gap: 12px;
  z-index: 40;
  align-items: center;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lbl {
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.slider-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.slider-wrap input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 130px;
  height: 6px;
  background: linear-gradient(90deg, #1e293b, #334155);
  border-radius: 3px;
  outline: none;
}
.slider-wrap input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: linear-gradient(145deg, #38bdf8, #0284c7);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 12px rgba(56,189,248,0.6);
  border: 2px solid rgba(255,255,255,0.2);
}
.val {
  color: #f8fafc;
  font-size: 13px;
  font-weight: 700;
  min-width: 55px;
  text-align: center;
  background: rgba(100,116,139,0.15);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(100,116,139,0.25);
  font-family: monospace;
}
.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 0 14px;
  border-left: 1px solid rgba(30,50,80,0.5);
  border-right: 1px solid rgba(30,50,80,0.5);
}
.info-title {
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.info-body {
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.6;
}
.hl-r { color: #4ade80; font-weight: 800; }
.hl-v { color: #fbbf24; font-weight: 800; }
.hl-i { color: #f87171; font-weight: 800; }
.hl-u { color: #60a5fa; font-weight: 800; }
.hl-s { color: #fb923c; font-weight: 800; }
.hl-l { color: #c084fc; font-weight: 800; }
.hl-e { color: #34d399; font-weight: 800; }
.hl-n { color: #ef4444; font-weight: 800; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  padding: 4px 10px;
  background: rgba(56,189,248,0.12);
  border: 1px solid rgba(56,189,248,0.3);
  color: #38bdf8;
  font-size: 10px;
  font-weight: 700;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}
.chip:hover {
  background: rgba(56,189,248,0.25);
  border-color: rgba(56,189,248,0.6);
  transform: translateY(-1px);
}
.btns { display: flex; gap: 6px; }
.btn {
  padding: 4px 10px;
  background: rgba(100,116,139,0.12);
  border: 1px solid rgba(100,116,139,0.25);
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn.on {
  background: rgba(74,222,128,0.15);
  border-color: rgba(74,222,128,0.4);
  color: #4ade80;
}
.btn:hover { background: rgba(100,116,139,0.22); }
.hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 16px 30px;
  background: rgba(0,0,0,0.85);
  border-radius: 14px;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  line-height: 1.7;
  opacity: 0;
  transition: opacity 0.4s;
  pointer-events: none;
  z-index: 25;
}
.hint.show { opacity: 1; }
.hint-v { color: #fbbf24; border: 1px solid rgba(251,191,36,0.4); }
.hint-n { color: #ef4444; border: 1px solid rgba(239,68,68,0.4); }
.legend {
  position: absolute;
  top: 44px;
  left: 16px;
  font-size: 10px;
  color: rgba(100,150,200,0.5);
  line-height: 2;
  z-index: 20;
}
.legend span { display: inline-block; width: 22px; height: 3px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
.l-in { background: rgba(255,220,100,0.9); }
.l-out { background: rgba(100,200,255,0.9); }
.l-vir { background: repeating-linear-gradient(90deg, rgba(180,180,200,0.6), rgba(180,180,200,0.6) 4px, transparent 4px, transparent 8px); height: 2px; }
.l-axis { background: rgba(150,150,180,0.6); height: 2px; }
#rayBox { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 3; pointer-events: none; }

/* ========== 移动端适配 ==========
   标题/面板改为文档流，光具台按 920:520 比例占满宽度，
   等比缩放后整机布局完整可见，不再裁剪不跑位 */
@media (max-width: 720px) {
  .lab-container {
    min-height: 0;
    height: auto;
    display: flex;
    flex-direction: column;
  }
  .lab-title {
    position: static;
    transform: none;
    font-size: 13px;
    letter-spacing: 1px;
    white-space: nowrap;
    padding: 10px 8px 4px;
  }
  .legend {
    top: 56px;
    left: 10px;
    font-size: 9px;
    line-height: 1.8;
  }
  .bench-wrap {
    position: relative;
    inset: auto;
    width: 100%;
    height: 220px;
    height: auto;
    aspect-ratio: 920 / 520;
    min-height: 200px;
  }
  .panel {
    position: static;
    height: auto;
    flex-wrap: wrap;
    padding: 8px 12px;
    gap: 8px;
  }
  .info {
    flex: 1 1 100%;
    order: 3;
    border: none;
    border-top: 1px solid rgba(30,50,80,0.5);
    padding: 6px 2px 0;
  }
}
</style>
<!-- 非 scoped 样式：用于动态创建的 DOM 元素（drawRay/drawRuler 运行时 createElement，
     不会带 scoped 的 data-v 属性，样式必须放在全局块才能生效） -->
<style>
.tick {
  position: absolute;
  top: 0;
  width: 1px;
  background: rgba(100,150,200,0.4);
}
.tick.major { height: 10px; background: rgba(100,150,200,0.7); }
.tick.minor { height: 5px; }
.num {
  position: absolute;
  top: 12px;
  transform: translateX(-50%);
  color: rgba(100,150,200,0.6);
  font-size: 9px;
  font-family: monospace;
}
.ray {
  position: absolute;
  height: 2.5px;
  transform-origin: left center;
  pointer-events: none;
  z-index: 3;
  border-radius: 1px;
}
.ray-in {
  background: linear-gradient(90deg, rgba(255,220,100,0.95), rgba(255,220,100,0.3));
  box-shadow: 0 0 6px rgba(255,220,100,0.4);
}
.ray-out {
  background: linear-gradient(90deg, rgba(100,200,255,0.95), rgba(100,200,255,0.3));
  box-shadow: 0 0 6px rgba(100,200,255,0.4);
}
.ray-vir {
  background: repeating-linear-gradient(90deg, rgba(180,180,200,0.6), rgba(180,180,200,0.6) 5px, transparent 5px, transparent 10px);
  height: 2px;
}
.ray-axis {
  background: linear-gradient(90deg, rgba(150,150,180,0.7), rgba(150,150,180,0.2));
  height: 2px;
}
</style>