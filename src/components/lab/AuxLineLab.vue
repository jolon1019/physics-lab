<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'
import { svgPoint } from '../../lib/svgCoord'

const emit = defineEmits(['complete'])

/* ===== 画布：viewBox 900×520 ===== */
const VW = 900, VH = 520
const fmt = (n) => (Math.round(n * 10) / 10).toString()

/* ===== 模式：补（倍长中线）· 折（角平分线）· 切（高线）· 移（梯形）===== */
const mode = ref('double')
const animT = ref(0)
let animRaf = null
const acted = reactive({ double: false, fold: false, split: false, trapezoid: false })
let done = false

function markActed(key) {
  acted[key] = true
  if (Object.values(acted).every(Boolean) && !done) {
    done = true
    emit('complete')
  }
}
function animate(dur) {
  if (animRaf) cancelAnimationFrame(animRaf)
  const t0 = performance.now()
  const step = (now) => {
    const t = Math.min((now - t0) / dur, 1)
    animT.value = 1 - Math.pow(1 - t, 3)
    if (t < 1) animRaf = requestAnimationFrame(step)
  }
  animRaf = requestAnimationFrame(step)
}
function pick(m) {
  mode.value = m
  animT.value = 0
}

/* ===== 自由点（题目给定，可拖动）===== */
const dp = reactive({ A: { x: 450, y: 120 }, B: { x: 320, y: 270 }, C: { x: 600, y: 270 } })
const fp = reactive({ A: { x: 180, y: 430 }, t: 250 })
const ap = reactive({ A: { x: 430, y: 120 }, B: { x: 210, y: 430 }, C: { x: 700, y: 420 } })
const tz = reactive({ topW: 280, botW: 480, h: 180 })

let dragging = null
const svgEl = ref(null)
function onDown(name, e) {
  e.preventDefault()
  dragging = name
  const move = (ev) => {
    if (!dragging || !svgEl.value) return
    const p = svgPoint(svgEl.value, ev.clientX, ev.clientY)
    if (dragging.startsWith('dp-') || dragging.startsWith('ap-')) {
      const o = dragging.startsWith('dp-') ? dp : ap
      const k = dragging.slice(3)
      // 倍长中线模式：E = 2M − A 会向下延伸一倍，y 上限收紧保证 E 不出画布
      const yMax = dragging.startsWith('dp-') ? 280 : VH - 100
      o[k].x = Math.max(80, Math.min(VW - 80, Math.round(p.x)))
      o[k].y = Math.max(70, Math.min(yMax, Math.round(p.y)))
      if (dragging.startsWith('ap-')) markActed('split')
    } else if (dragging === 'fp-D') {
      const s = (32 * Math.PI) / 180
      const vx = Math.cos(s), vy = -Math.sin(s)
      fp.t = Math.max(90, Math.min(340, Math.round((p.x - fp.A.x) * vx + (p.y - fp.A.y) * vy)))
    }
  }
  const up = () => {
    dragging = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/* ===== 模式 1：倍长中线（补）===== */
const dbl = computed(() => {
  const { A, B, C } = dp
  const M = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 }
  const E = { x: 2 * M.x - A.x, y: 2 * M.y - A.y }
  const t = animT.value
  const P = { x: A.x + (E.x - A.x) * t, y: A.y + (E.y - A.y) * t }
  return { A, B, C, M, E, P, t }
})
function actDouble() {
  animate(900)
  markActed('double')
}

/* ===== 模式 2：角平分线 × 平行线（折）===== */
const BISECT = 32, RAY_AC = 64
const fold = computed(() => {
  const { A, t } = fp
  const rad = (d) => (d * Math.PI) / 180
  const B = { x: A.x + 470 * Math.cos(rad(0)), y: A.y - 470 * Math.sin(rad(0)) }
  const C = { x: A.x + 420 * Math.cos(rad(RAY_AC)), y: A.y - 420 * Math.sin(rad(RAY_AC)) }
  const D = { x: A.x + t * Math.cos(rad(BISECT)), y: A.y - t * Math.sin(rad(BISECT)) }
  const s = (t * Math.sin(rad(BISECT))) / Math.sin(rad(RAY_AC))
  const E = { x: A.x + s * Math.cos(rad(RAY_AC)), y: A.y - s * Math.sin(rad(RAY_AC)) }
  const at = animT.value
  const P = { x: D.x + (E.x - D.x) * at, y: D.y + (E.y - D.y) * at }
  return { A, B, C, D, E, P, at }
})
function actFold() {
  animate(800)
  markActed('fold')
}

/* ===== 模式 3：高线切割（切）===== */
const alt = computed(() => {
  const { A, B, C } = ap
  const len = Math.max(Math.hypot(C.x - B.x, C.y - B.y), 0.001)
  const ux = (C.x - B.x) / len, uy = (C.y - B.y) / len
  const proj = (A.x - B.x) * ux + (A.y - B.y) * uy
  const H = { x: B.x + ux * proj, y: B.y + uy * proj }
  const onSeg = proj >= 0 && proj <= len
  const BH = Math.min(Math.max(proj, 0), len)
  const HC = len - BH
  const h = Math.abs((C.x - B.x) * (A.y - B.y) - (C.y - B.y) * (A.x - B.x)) / len
  return { A, B, C, H, onSeg, BH, HC, h, s1: (BH * h) / 2, s2: (HC * h) / 2, total: (len * h) / 2 }
})

/* ===== 模式 4：梯形转化（移）===== */
const trap = computed(() => {
  const D = { x: 150, y: 440 }
  const C = { x: 150 + tz.botW, y: 440 }
  const A = { x: 150 + 130, y: 440 - tz.h }
  const B = { x: 150 + 130 + tz.topW, y: 440 - tz.h }
  const v = { x: D.x - A.x, y: D.y - A.y }
  const t = animT.value
  const Bp = { x: B.x + v.x, y: B.y + v.y }
  const slideA = { x: A.x + v.x * t, y: A.y + v.y * t }
  const slideB = { x: B.x + v.x * t, y: B.y + v.y * t }
  const H1 = { x: A.x, y: D.y }, H2 = { x: B.x, y: D.y }
  const area = ((tz.topW + tz.botW) / 2) * tz.h
  return { D, C, A, B, Bp, slideA, slideB, H1, H2, t, area }
})

function actSlide() { animate(900); markActed('trapezoid') }
function actHeights() { animate(800); markActed('trapezoid') }

/* ===== 右侧面板 ===== */
const MODES = {
  double: { name: '补 · 倍长中线', act: '以 M 为中心，把 AD 旋转 180°' },
  fold: { name: '折 · 角平分线', act: '过 D 作 DE ∥ AB' },
  altitude: { name: '切 · 高线', act: '拖动 A，看垂足与面积' },
  trapezoid: { name: '移 · 梯形', act: '平移腰 / 作高' }
}
const rows = computed(() => {
  if (mode.value === 'double') {
    return [
      { label: '动作', value: 'E 为 A 关于 M 的对称点（DE = DA）' },
      { label: '全等', value: '△EMB ≌ △AMC（SAS）' },
      { label: '转移结论', value: 'BE = AC，BE ∥ AC' },
      { label: '用途', value: '把对边 AC 转移到 B 旁，凑出可解的 △ABE' }
    ]
  }
  if (mode.value === 'fold') {
    const f = fold.value
    return [
      { label: '角平分线', value: '∠BAD = ∠DAE = 32°' },
      { label: '内错角', value: `∠ADE = ∠BAD（DE ∥ AB）= 32°` },
      { label: '结论', value: '∠DAE = ∠ADE ⇒ AE = DE（等腰）' },
      { label: '当前 DE', value: fmt(Math.hypot(f.E.x - f.D.x, f.E.y - f.D.y)) }
    ]
  }
  if (mode.value === 'altitude') {
    const a = alt.value
    return [
      { label: '高 AH', value: a.h.toFixed(1) },
      { label: 'S₁（左直角△）', value: a.s1.toFixed(0) },
      { label: 'S₂（右直角△）', value: a.s2.toFixed(0) },
      { label: 'S₁ + S₂', value: (a.s1 + a.s2).toFixed(0) + ' = ½·BC·AH = ' + a.total.toFixed(0) },
      { label: '垂足位置', value: a.onSeg ? 'BC 之间（锐角/直角情形）' : 'BC 延长线上（钝角情形）' }
    ]
  }
  return [
    { label: '上底 / 下底 / 高', value: `${tz.topW} / ${tz.botW} / ${tz.h}` },
    { label: '梯形面积', value: ((tz.topW + tz.botW) / 2) * tz.h + '' },
    { label: '平移腰 →', value: `平行四边形 + 三角形（底 ${tz.botW - 130 - tz.topW}）` },
    { label: '作高 →', value: `矩形 ${tz.topW}×${tz.h} + 两个直角三角形` }
  ]
})
const results = computed(() => [
  { label: '看到中点', value: '倍长中线（补）/ 中位线' },
  { label: '看到角平分线', value: '+平行线 → 折出等腰' },
  { label: '看到高', value: '切直角三角形 / 面积法' },
  { label: '看到梯形', value: '平移腰 / 作高 → 移成熟悉图形' }
])

onBeforeUnmount(() => { if (animRaf) cancelAnimationFrame(animRaf) })
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel al-panel" style="padding: 0">
        <svg ref="svgEl" class="al-svg" :viewBox="`0 0 ${VW} ${VH}`" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="辅助线实验室：补折切移四种变换">
          <!-- ===== 模式 1：倍长中线（补）===== -->
          <g v-if="mode === 'double'">
            <polygon class="tri" :points="`${dp.A.x},${dp.A.y} ${dp.B.x},${dp.B.y} ${dp.C.x},${dp.C.y}`" />
            <g v-if="dbl.t >= 1">
              <polygon class="shade shade-a" :points="`${dbl.A.x},${dbl.A.y} ${dbl.M.x},${dbl.M.y} ${dp.C.x},${dp.C.y}`" />
              <polygon class="shade shade-b" :points="`${dbl.E.x},${dbl.E.y} ${dbl.M.x},${dbl.M.y} ${dp.B.x},${dp.B.y}`" />
              <line class="aux" :x1="dbl.E.x" :y1="dbl.E.y" :x2="dp.B.x" :y2="dp.B.y" />
            </g>
            <line class="median" :x1="dp.A.x" :y1="dp.A.y" :x2="dbl.P.x" :y2="dbl.P.y" />
            <circle class="cpoint" :cx="dbl.M.x" :cy="dbl.M.y" r="6" />
            <text class="lbl" :x="dbl.M.x" :y="dbl.M.y + 24" text-anchor="middle">M（中点）</text>
            <g v-for="(k, i) in ['A', 'B', 'C']" :key="'dv' + i">
              <circle class="fpoint" :cx="dp[k].x" :cy="dp[k].y" r="10" @pointerdown.prevent="onDown('dp-' + k, $event)" />
              <text class="flbl" :x="dp[k].x + (i === 0 ? 0 : i === 1 ? -16 : 16)" :y="dp[k].y + (i === 0 ? -14 : 22)" text-anchor="middle">{{ k }}</text>
            </g>
            <g v-if="dbl.t >= 1">
              <circle class="aux-point" :cx="dbl.E.x" :cy="dbl.E.y" r="8" />
              <text class="aux-lbl" :x="dbl.E.x + 14" :y="dbl.E.y - 8">E</text>
              <text class="mark-t" :x="(dbl.A.x + dbl.E.x) / 2 - 40" :y="(dbl.A.y + dbl.E.y) / 2">DE = DA</text>
              <text class="mark-t ok" :x="(dbl.E.x + dp.B.x) / 2 + 34" :y="(dbl.E.y + dp.B.y) / 2">BE = AC</text>
            </g>
          </g>

          <!-- ===== 模式 2：角平分线（折）===== -->
          <g v-else-if="mode === 'fold'">
            <line class="ray" :x1="fp.A.x" :y1="fp.A.y" :x2="fold.B.x" :y2="fold.B.y" />
            <line class="ray" :x1="fp.A.x" :y1="fp.A.y" :x2="fold.C.x" :y2="fold.C.y" />
            <line class="bisect" :x1="fp.A.x" :y1="fp.A.y" :x2="fold.D.x" :y2="fold.D.y" />
            <line class="degrow" :x1="fold.D.x" :y1="fold.D.y" :x2="fold.P.x" :y2="fold.P.y" />
            <g v-if="fold.at >= 1">
              <line class="aux" :x1="fold.D.x" :y1="fold.D.y" :x2="fold.E.x" :y2="fold.E.y" />
              <polygon class="shade shade-a" :points="`${fp.A.x},${fp.A.y} ${fold.D.x},${fold.D.y} ${fold.E.x},${fold.E.y}`" />
              <circle class="aux-point" :cx="fold.E.x" :cy="fold.E.y" r="8" />
              <text class="aux-lbl" :x="fold.E.x + 12" :y="fold.E.y + 20">E</text>
              <text class="mark-t ok" :x="(fold.D.x + fold.E.x) / 2 + 4" :y="(fold.D.y + fold.E.y) / 2 - 12" text-anchor="middle">AE = DE</text>
            </g>
            <circle class="fpoint" :cx="fold.D.x" :cy="fold.D.y" r="9" @pointerdown.prevent="onDown('fp-D', $event)" />
            <text class="flbl" :x="fold.D.x" :y="fold.D.y + 26" text-anchor="middle">D（可拖动）</text>
            <text class="lbl" :x="fold.B.x - 16" :y="fold.B.y - 10">B</text>
            <text class="lbl" :x="fold.C.x + 10" :y="fold.C.y - 8">C</text>
            <text class="lbl" :x="fp.A.x - 22" :y="fp.A.y + 20">A</text>
          </g>

          <!-- ===== 模式 3：高线切割（切）===== -->
          <g v-else-if="mode === 'altitude'">
            <line class="thin" :x1="alt.B.x" :y1="alt.B.y" :x2="alt.C.x" :y2="alt.C.y" />
            <line v-if="!alt.onSeg" class="thin ext" :x1="alt.B.x" :y1="alt.B.y" :x2="alt.H.x" :y2="alt.H.y" />
            <g v-if="alt.onSeg">
              <polygon class="shade shade-a" :points="`${ap.A.x},${ap.A.y} ${alt.B.x},${alt.B.y} ${alt.H.x},${alt.H.y}`" />
              <polygon class="shade shade-b" :points="`${ap.A.x},${ap.A.y} ${alt.C.x},${alt.C.y} ${alt.H.x},${alt.H.y}`" />
            </g>
            <line class="chord" :x1="ap.A.x" :y1="ap.A.y" :x2="alt.B.x" :y2="alt.B.y" />
            <line class="chord" :x1="ap.A.x" :y1="ap.A.y" :x2="alt.C.x" :y2="alt.C.y" />
            <line class="om" :x1="ap.A.x" :y1="ap.A.y" :x2="alt.H.x" :y2="alt.H.y" />
            <rect class="right" :x="alt.H.x - 9" :y="alt.H.y - 9" width="9" height="9"
              :transform="`rotate(${((Math.atan2(alt.B.y - alt.H.y, alt.B.x - alt.H.x) * 180) / Math.PI).toFixed(1)} ${alt.H.x} ${alt.H.y})`" />
            <circle class="aux-point" :cx="alt.H.x" :cy="alt.H.y" r="7" />
            <text class="aux-lbl" :x="alt.H.x + 10" :y="alt.H.y + 22">H</text>
            <text class="area-t ta" :x="(ap.A.x + alt.B.x + alt.H.x) / 3" :y="(ap.A.y + alt.B.y + alt.H.y) / 3" text-anchor="middle">S₁ = {{ alt.s1.toFixed(0) }}</text>
            <text v-if="alt.onSeg" class="area-t tb" :x="(ap.A.x + alt.C.x + alt.H.x) / 3" :y="(ap.A.y + alt.C.y + alt.H.y) / 3" text-anchor="middle">S₂ = {{ alt.s2.toFixed(0) }}</text>
            <g v-for="(k, i) in ['A', 'B', 'C']" :key="'av' + i">
              <circle class="fpoint" :cx="ap[k].x" :cy="ap[k].y" r="10" @pointerdown.prevent="onDown('ap-' + k, $event)" />
              <text class="flbl" :x="ap[k].x + (i === 0 ? 0 : i === 1 ? -16 : 16)" :y="ap[k].y + (i === 0 ? -14 : 22)" text-anchor="middle">{{ k }}</text>
            </g>
          </g>

          <!-- ===== 模式 4：梯形转化（移）===== -->
          <g v-else>
            <polygon class="trapezoid" :points="`${trap.A.x},${trap.A.y} ${trap.B.x},${trap.B.y} ${trap.C.x},${trap.C.y} ${trap.D.x},${trap.D.y}`" />
            <g v-if="trap.t > 0">
              <line class="chord slide" :x1="trap.slideA.x" :y1="trap.slideA.y" :x2="trap.slideB.x" :y2="trap.slideB.y" />
              <g v-if="trap.t >= 1">
                <polygon class="shade shade-a" :points="`${trap.A.x},${trap.A.y} ${trap.B.x},${trap.B.y} ${trap.Bp.x},${trap.Bp.y} ${trap.D.x},${trap.D.y}`" />
                <polygon class="shade shade-b" :points="`${trap.Bp.x},${trap.Bp.y} ${trap.B.x},${trap.B.y} ${trap.C.x},${trap.C.y}`" />
                <circle class="aux-point" :cx="trap.Bp.x" :cy="trap.Bp.y" r="7" />
                <text class="aux-lbl" :x="trap.Bp.x" :y="trap.Bp.y - 10" text-anchor="middle">B′</text>
                <text class="mark-t" :x="(trap.D.x + trap.Bp.x) / 2" :y="trap.D.y + 26" text-anchor="middle">DB′ = AB</text>
                <text class="mark-t ok" :x="(trap.Bp.x + trap.C.x) / 2" :y="trap.D.y + 26" text-anchor="middle">B′C = 下底−上底</text>
              </g>
            </g>
            <g v-for="(k, i) in ['D', 'C', 'A', 'B']" :key="'tv' + i">
              <circle class="fpoint" :cx="trap[k].x" :cy="trap[k].y" r="9" />
              <text class="flbl" :x="trap[k].x + (k === 'D' ? -16 : k === 'C' ? 14 : 0)" :y="trap[k].y + (i < 2 ? 24 : -12)" text-anchor="middle">{{ k }}</text>
            </g>
          </g>

          <!-- 图例 -->
          <g class="al-legend">
            <rect x="20" :y="VH - 34" width="330" height="26" rx="6" />
            <text x="32" :y="VH - 16">● 实心 = 题目给定的点　○ 空心 = 辅助线产生的点</text>
          </g>
        </svg>
      </div>

      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': mode === 'double' }" @click="pick('double')">补 · 倍长中线</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'fold' }" @click="pick('fold')">折 · 角平分线</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'altitude' }" @click="pick('altitude')">切 · 高线</button>
        <button class="btn" :class="{ 'btn-primary': mode === 'trapezoid' }" @click="pick('trapezoid')">移 · 梯形</button>
        <FullscreenBtn />
      </div>
      <div class="lab-actions act-row">
        <button v-if="mode === 'double'" class="btn btn-primary" @click="actDouble()">⟳ 以 M 为中心，把 AD 旋转 180°</button>
        <button v-if="mode === 'fold'" class="btn btn-primary" @click="actFold()">∥ 过 D 作 DE ∥ AB</button>
        <template v-if="mode === 'trapezoid'">
          <button class="btn btn-primary" @click="actSlide()">⇄ 平移腰 AB</button>
          <button class="btn btn-primary" @click="actHeights()">↓ 作两条高</button>
        </template>
        <span v-if="mode === 'altitude'" class="feedback no">拖动 A / B / C：无论怎么变形，S₁ + S₂ = ½·BC·AH 始终成立</span>
        <span v-if="mode === 'double'" class="feedback no">先拖歪三角形，再点动作——全等与转移始终成立</span>
        <span v-if="mode === 'fold'" class="feedback no">D 可沿角平分线拖动：腰在变，AE = DE 不变</span>
        <span v-if="mode === 'trapezoid'" class="feedback no">两种标准转化，殊途同归于 (上底+下底)×高÷2</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>{{ MODES[mode].name }}</strong><span>{{ MODES[mode].act }}</span></div>
        <div v-if="mode === 'trapezoid'" class="lab-params">
          <ParamSlider v-model="tz.topW" :min="140" :max="320" :step="10" label="上底 AB" />
          <ParamSlider v-model="tz.botW" :min="340" :max="560" :step="10" label="下底 DC" />
          <ParamSlider v-model="tz.h" :min="120" :max="200" :step="10" label="高" />
        </div>
        <div v-else-if="mode === 'double'" class="lab-readout">
          <div class="lab-stat"><span>全等</span><strong style="font-size:13px">△EMB ≌ △AMC（SAS）</strong></div>
          <div class="lab-stat accent"><span>转移</span><strong style="font-size:13px">BE = AC（对边搬家）</strong></div>
        </div>
        <div v-else-if="mode === 'fold'" class="lab-readout">
          <div class="lab-stat"><span>三个相等的角</span><strong style="font-size:13px">∠BAD = ∠DAE = ∠ADE</strong></div>
          <div class="lab-stat accent"><span>等腰</span><strong style="font-size:13px">AE = DE</strong></div>
        </div>
        <div v-else class="lab-readout">
          <div class="lab-stat"><span>高 AH</span><strong>{{ alt.h.toFixed(0) }}</strong></div>
          <div class="lab-stat accent"><span>S₁ + S₂</span><strong>{{ (alt.s1 + alt.s2).toFixed(0) }} = ½·BC·AH</strong></div>
        </div>
        <p class="usage" v-if="mode === 'double'">先拖动 A、B、C 把三角形拖"歪"，再点动作按钮——无论形状如何，全等和转移始终成立。</p>
        <p class="usage" v-if="mode === 'fold'">D 是角平分线上的自由点：拖动它，等腰三角形的"腰"跟着变，但 AE = DE 不变。</p>
        <p class="usage" v-if="mode === 'altitude'">把 A 拖过 B 或 C 的外侧：垂足跑到延长线上（钝角情形），面积关系照样成立。</p>
        <p class="usage" v-if="mode === 'trapezoid'">两个按钮是两种标准转化：平移腰凑平行四边形，作高凑矩形 + 直角三角形。</p>
      </div>

      <FormulaPanel
        title="辅助线的视觉逻辑"
        formula="补 · 折 · 切 · 移 = 旋 · 反 · 割 · 平"
        desc="辅助线不是背出来的套路，而是认得出的变换：倍长中线是以中点为中心的旋转（补成平行四边形）；角平分线加平行线是折叠（折出等腰）；高线是切割（斜三角形变两个直角三角形）；平移腰/作高是平移（梯形变三角形+特殊四边形）。"
        :rows="rows"
        :result="results"
        :verify="[
          '看到中点 → 联想倍长中线（补）或中位线',
          '看到角平分线 + 平行线 → 必出等腰三角形（折）',
          '看到高 → 直角三角形 + 勾股 + 面积法（切）',
          '看到梯形 → 平移腰或作高（移），转化为三角形 + 特殊四边形'
        ]"
      />
    </aside>
  </div>
</template>

<style scoped>
.al-panel { background: transparent; }
.al-svg {
  position: relative; z-index: 1;
  display: block; width: 100%; height: auto; max-height: 100%;
  aspect-ratio: 900 / 520;
  touch-action: pan-y; user-select: none;
}
.tri { fill: rgba(184, 121, 21, 0.16); stroke: var(--bb-amber); stroke-width: 3; stroke-linejoin: round; }
.trapezoid { fill: rgba(20, 95, 210, 0.10); stroke: var(--bb-blue); stroke-width: 3; stroke-linejoin: round; }
.median { stroke: var(--bb-red); stroke-width: 3.5; stroke-linecap: round; }
.bisect { stroke: var(--bb-red); stroke-width: 2.6; }
.degrow { stroke: var(--bb-blue); stroke-width: 3.5; stroke-linecap: round; }
.aux { stroke: var(--bb-purple); stroke-width: 3.5; stroke-linecap: round; }
.thin { stroke: var(--bb-fg); stroke-width: 2.4; }
.thin.ext { stroke-dasharray: 7 5; opacity: 0.7; }
.chord { stroke: var(--bb-amber); stroke-width: 4; stroke-linecap: round; }
.chord.slide { stroke: var(--bb-purple); }
.om { stroke: var(--bb-red); stroke-width: 2.4; stroke-dasharray: 8 5; }
.right { fill: none; stroke: var(--bb-red); stroke-width: 1.8; }
.shade { opacity: 0.45; }
.shade-a { fill: rgba(70, 168, 232, 0.4); }
.shade-b { fill: rgba(13, 155, 97, 0.4); }
.cpoint { fill: var(--bb-fg); stroke: #fff; stroke-width: 2; }
.fpoint { fill: var(--bb-fg); stroke: #fff; stroke-width: 2.5; cursor: grab; }
.fpoint:hover { fill: var(--bb-amber); }
.aux-point { fill: none; stroke: var(--bb-purple); stroke-width: 3; }
.flbl, .aux-lbl { font-size: 15px; font-weight: 900; font-family: var(--mono); pointer-events: none; }
.flbl { fill: var(--bb-fg); }
.aux-lbl { fill: var(--bb-purple); }
.lbl { fill: var(--bb-fg-dim); font-size: 14px; font-weight: 700; pointer-events: none; }
.mark-t { fill: var(--bb-purple); font-size: 14px; font-weight: 800; font-family: var(--mono); pointer-events: none; }
.mark-t.ok { fill: var(--bb-green); }
.area-t { font-size: 15px; font-weight: 900; font-family: var(--mono); pointer-events: none; }
.area-t.ta { fill: var(--bb-blue); }
.area-t.tb { fill: var(--bb-green); }
.ray { stroke: var(--bb-fg); stroke-width: 2.6; }
.act-row { flex-wrap: wrap; }
.al-legend rect { fill: var(--bb-surface, rgba(255,255,255,0.85)); stroke: var(--bb-fg-dim); stroke-width: 1.4; }
.al-legend text { font-size: 13px; font-weight: 700; font-family: var(--mono); fill: var(--bb-fg-dim); }
.usage { margin: 10px 0 0; font-size: 13px; line-height: 1.6; color: var(--text-2); }
</style>
