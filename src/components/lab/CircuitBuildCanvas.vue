<script setup>
// 自由搭建台：实物图元件可拖拽，端子间拖动连线，闭合后电子流动画。
// 内部坐标 1000×640，SVG 自适应缩放（响应式）；指针坐标经 getScreenCTM 反算。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { META, buildArt, routeWire, terminalNormal } from '../../circuit/components'
import { curveWire, pathFromPolyline, polylineLength, pointOnPolyline } from '../../circuit/smoothWire'
import { PNG_URL, PNG_SIZE, PNG_TERMINAL_Y } from '../../circuit/pngAssets'
import { useCircuitStore } from '../../stores/circuit'
import BlackBoardBg from './BlackBoardBg.vue'

const store = useCircuitStore()
const svgRef = ref(null)

const dragComp = ref(null) // { id, offX, offY }
const pendingTerm = ref(null) // 已选中的首个接线柱 { comp, term }，等待第二次点击
const mousePos = ref({ x: 0, y: 0 }) // 鼠标在 SVG 坐标，用于连线预览

const phase = ref(0)
let raf = null
let last = 0

function toSvg(evt) {
  const svg = svgRef.value
  const pt = svg.createSVGPoint()
  pt.x = evt.clientX
  pt.y = evt.clientY
  const m = svg.getScreenCTM().inverse()
  const p = pt.matrixTransform(m)
  return { x: p.x, y: p.y }
}

function terminalWorldPos(compId, term) {
  return store.terminalWorld(`${compId}:${term}`)
}

const pendingPos = computed(() =>
  pendingTerm.value ? terminalWorldPos(pendingTerm.value.comp, pendingTerm.value.term) : { x: 0, y: 0 }
)

function artState(c) {
  const r = store.readouts[c.id] || {}
  const p = c.params
  const reading =
    c.type === 'bulb' && r.I ? r.I.toFixed(2) + 'A' : c.type === 'ammeter' || c.type === 'voltmeter' ? r.reading : ''
  return {
    id: c.id,
    glow: r.glow || 0,
    open: r.open,
    frac: p.frac,
    V: c.type === 'battery' ? store.sourceVoltage : p.E,
    R: p.R,
    reading
  }
}

// ---------- PNG 元件渲染 ----------
// 用同一套 PNG 素材（与 OhmLab 一致）替换矢量 buildArt，保留 META 端子坐标使导线对齐不变。
// 返回 SVG 标记字符串，用 v-html 注入到组件 <g> 内（与原 buildArt 同模式）。
// 灯泡辉光使用根 SVG 里定义的径向渐变 #g-bulb-glow / #g-bulb-core。
function pngArtHtml(type, st) {
  if (type === 'resistor') return buildArt(type, st) // 暂无 PNG，沿用矢量
  const sz = PNG_SIZE[type] || { w: 100, h: 100 }
  // 端子行 y 对齐：多状态图（开关开/合）需把"端子行"对齐到元件中心 (0,0)，否则切换时整张图
  // 上下跳。用 PNG 原始坐标里的端子 y 中心按本框 contain 比例换算偏移。详见 pngAssets.js。
  const scale = Math.min(sz.w, sz.h) / 400
  const dy = type === 'switch' ? (st.open ? (PNG_TERMINAL_Y.switchClosed - PNG_TERMINAL_Y.switchOpen) * scale : 0) : 0
  const ix = -sz.w / 2
  const iy = -sz.h / 2 + dy
  const url = type === 'switch' ? (st.open ? PNG_URL.switchOpen : PNG_URL.switchClosed) : PNG_URL[type]
  const img = `<image href="${url}" x="${ix}" y="${iy}" width="${sz.w}" height="${sz.h}" />`
  let extra = ''
  if (type === 'bulb') {
    const g = st.glow || 0
    if (g > 0.04) {
      const r = 30 + g * 40
      const a = 0.2 + g * 0.5
      extra += `<circle cx="0" cy="0" r="${r}" fill="url(#g-bulb-glow)" opacity="${a.toFixed(3)}" />`
      extra += `<circle cx="0" cy="0" r="14" fill="url(#g-bulb-core)" opacity="${(g * 0.6).toFixed(3)}" />`
    }
  } else if (type === 'switch') {
    const closed = !st.open
    extra += `<text x="0" y="-42" font-size="11" font-weight="700" fill="${closed ? 'var(--bb-green)' : 'var(--bb-amber)'}" text-anchor="middle" font-family="system-ui">${closed ? '闭合' : '断开'}</text>`
  } else if (type === 'battery') {
    const v = st.V != null ? st.V.toFixed(1) : '6.0'
    extra += `<text x="0" y="42" font-size="10" font-weight="700" fill="var(--bb-fg-dim)" text-anchor="middle" font-family="system-ui">电源 ${v} V</text>`
  } else if (type === 'rheostat') {
    const frac = typeof st.frac === 'number' ? st.frac : 0.5
    const sx = -28 + frac * 56
    extra += `<polygon points="${sx.toFixed(1)},-44 ${(sx + 5).toFixed(1)},-34 ${(sx - 5).toFixed(1)},-34" fill="#ff5b67" stroke="#c23b46" stroke-width="1" />`
    const rOhm = Math.round(frac * 20)
    extra += `<text x="0" y="40" font-size="10" font-weight="700" fill="var(--bb-blue)" text-anchor="middle" font-family="system-ui">R=${rOhm} Ω</text>`
  } else if (type === 'ammeter' || type === 'voltmeter') {
    // PNG 是笔记本形态：屏幕在 PNG 上半（y≈30-180），下方"A/V"铭牌 + 3 端子底座。
    // 数字读数放在屏幕内部（PNG y≈110 黑色显示区），按本框 contain 比例换算。
    const readingY = -90 * scale
    const txt = st.reading || (type === 'ammeter' ? '0.00A' : '0.00V')
    extra += `<text x="0" y="${readingY.toFixed(2)}" font-size="14" font-weight="800" fill="var(--bb-red)" text-anchor="middle" font-family="ui-monospace,monospace">${txt}</text>`
    // 屏幕底部"A"/"V"标签保留 PNG 自带的，不再画额外标签
  }
  return img + extra
}

function normOf(compId, term) {
  const c = store.compById(compId)
  return terminalNormal(c ? c.type : 'bulb', term, c ? c.rot : 0)
}
function wirePathD(w) {
  // 使用避让布线结果（绕开元件与其它导线的折线），再平滑成「带弧度的真实导线」
  const rt = store.wireRoutes.get(w.id)
  let pts
  if (rt && rt.length >= 2) pts = rt
  else {
    // fallback：端子法向弯折
    const a = terminalWorldPos(w.a.comp, w.a.term)
    const b = terminalWorldPos(w.b.comp, w.b.term)
    const na = normOf(w.a.comp, w.a.term)
    const nb = normOf(w.b.comp, w.b.term)
    pts = routeWire(a.x, a.y, na[0], na[1], b.x, b.y, nb[0], nb[1])
  }
  return pathFromPolyline(curveWire(pts))
}

// 每条导线承载的电流（由 animatedBranches 汇总），用于「通电变黄」高亮
const wireCurrent = computed(() => {
  const m = {}
  for (const br of store.animatedBranches) {
    if (br.kind === 'wire' && br.wireId) m[br.wireId] = (m[br.wireId] || 0) + Math.abs(br.I)
  }
  return m
})
// 该导线是否「通电」：仿真运行中 + 闭合回路 + 有电流
function isLive(id) {
  return store.running && store.status.closed && (wireCurrent.value[id] || 0) >= 0.02
}

const electrons = computed(() => {
  const out = []
  const ph = phase.value
  for (const br of store.animatedBranches) {
    if (br.I < 0.02) continue
    const rp = curveWire(br.points)
    const speed = Math.min(1.3, 0.1 + br.I * 0.22)
    const total = polylineLength(rp)
    const n = Math.max(2, Math.round(total / 46))
    for (let i = 0; i < n; i++) {
      const t = ((i / n + ph * speed) % 1 + 1) % 1
      const p = pointOnPolyline(rp, t)
      out.push({ x: p[0], y: p[1], a: Math.min(1, 0.45 + br.I * 0.4) })
    }
  }
  return out
})

function onCompDown(evt, c) {
  if (store.tool === 'erase') {
    store.removeComponent(c.id)
    return
  }
  pendingTerm.value = null // 点击元件本体视为离开连线流程
  if (store.tool === 'rotate') {
    store.rotate(c.id)
    return
  }
  store.select(c.id)
  const pos = toSvg(evt)
  // 记录起点：单击（几乎不移动）视为"切换开关"，拖动则移动元件
  dragComp.value = { id: c.id, offX: pos.x - c.x, offY: pos.y - c.y, sx: pos.x, sy: pos.y, moved: false }
  svgRef.value.setPointerCapture(evt.pointerId)
}

// 单击接线柱：第一次点击记为"待连"，第二次点击与待连端子连通（同元件/同端子取消）
function onTermClick(evt, c, t) {
  evt.stopPropagation()
  if (store.tool === 'erase') {
    store.removeWiresAt(c.id, t.id)
    return
  }
  if (!pendingTerm.value) {
    pendingTerm.value = { comp: c.id, term: t.id }
    mousePos.value = terminalWorldPos(c.id, t.id)
    return
  }
  const first = pendingTerm.value
  pendingTerm.value = null
  // 同一端子重复点击、或同一元件两端 → 视为取消，不连线
  if (first.comp === c.id && first.term === t.id) return
  if (first.comp === c.id) return
  store.connect(first, { comp: c.id, term: t.id })
}

function onWireDown(evt, w) {
  evt.stopPropagation()
  if (store.tool === 'erase') store.removeWire(w.id)
}

// 右键单击电线 → 删除
function onWireContext(evt, w) {
  evt.preventDefault()
  evt.stopPropagation()
  store.removeWire(w.id)
}

function onBgDown(evt) {
  if (evt && evt.button !== 0) return // 仅左键取消选择/待连
  store.select(null)
  pendingTerm.value = null
}

function onBgContext(evt) {
  evt.preventDefault()
  pendingTerm.value = null
}

function onMove(evt) {
  if (dragComp.value) {
    const pos = toSvg(evt)
    // 超过阈值判定为拖动，否则保持"未移动"→ 抬起时按开关处理
    if (Math.hypot(pos.x - dragComp.value.sx, pos.y - dragComp.value.sy) > 4) dragComp.value.moved = true
    store.moveComponent(dragComp.value.id, pos.x - dragComp.value.offX, pos.y - dragComp.value.offY)
    mousePos.value = pos
  } else if (pendingTerm.value) {
    mousePos.value = toSvg(evt)
  }
}

function onUp(evt) {
  if (dragComp.value) {
    const dc = dragComp.value
    dragComp.value = null
    // 未拖动且为开关 → 切换开合状态
    if (!dc.moved) {
      const c = store.compById(dc.id)
      if (c && c.type === 'switch') store.toggleSwitch(c.id)
    }
    try {
      svgRef.value.releasePointerCapture(evt.pointerId)
    } catch (e) {}
  }
}

function onDrop(evt) {
  const type = evt.dataTransfer.getData('text/circuit-type')
  if (!type) return
  const pos = toSvg(evt)
  const x = Math.max(60, Math.min(940, pos.x))
  const y = Math.max(60, Math.min(580, pos.y))
  const id = store.addComponent(type, x, y)
  store.select(id)
}

function loop(ts) {
  if (!last) last = ts
  const dt = Math.min((ts - last) / 1000, 0.05)
  last = ts
  if (store.running) phase.value = (phase.value + dt * 0.5) % 1
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="build-wrap" :class="{ 'tool-erase': store.tool === 'erase' }">
    <BlackBoardBg variant="chalk" />
    <svg
      ref="svgRef"
      class="build-svg"
      viewBox="0 0 1000 640"
      preserveAspectRatio="xMidYMid meet"
      @dragover.prevent
      @drop="onDrop"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <defs>
        <radialGradient id="g-bulb-glow">
          <stop offset="0" stop-color="#ffe9a0" stop-opacity="0.9"/>
          <stop offset="0.5" stop-color="#ffc046" stop-opacity="0.35"/>
          <stop offset="1" stop-color="#ffc046" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="g-bulb-core">
          <stop offset="0" stop-color="#fff6cc" stop-opacity="1"/>
          <stop offset="1" stop-color="#fff6cc" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="1000" height="640" fill="transparent" pointer-events="all" @pointerdown="onBgDown($event)" @contextmenu.prevent="onBgContext" />

      <!-- 导线（带弧度的真实导线样式；通电后变为红色） -->
      <path
        v-for="w in store.wires"
        :key="w.id"
        :d="wirePathD(w)"
        class="wire"
        :class="{ 'wire-live': isLive(w.id) }"
        @pointerdown="onWireDown($event, w)"
        @contextmenu.stop.prevent="onWireContext($event, w)"
      />

      <!-- 连线预览（点击首个接线柱后，跟随鼠标） -->
      <path
        v-if="pendingTerm"
        :d="`M ${pendingPos.x} ${pendingPos.y} L ${mousePos.x} ${mousePos.y}`"
        class="wire-draft"
      />

      <!-- 电子流动（电流方向；通电时为红色） -->
      <circle v-for="(e, i) in electrons" :key="'e' + i" :cx="e.x" :cy="e.y" r="4.4" class="electron" :opacity="e.a" />

      <!-- 元件 -->
      <g
        v-for="c in store.components"
        :key="c.id"
        :transform="`translate(${c.x},${c.y}) rotate(${c.rot || 0})`"
        :class="{ 'is-switch': c.type === 'switch' }"
        @pointerdown="onCompDown($event, c)"
      >
        <rect
          v-if="c.id === store.selectedId"
          x="-64"
          y="-54"
          width="128"
          height="108"
          rx="10"
          class="sel-outline"
        />
        <g v-html="pngArtHtml(c.type, artState(c))"></g>
        <circle
          v-for="t in META[c.type].terminals"
          :key="t.id"
          :cx="t.x"
          :cy="t.y"
          r="7"
          class="term"
          :class="{
            pending: pendingTerm && pendingTerm.comp === c.id && pendingTerm.term === t.id,
            armed: !!pendingTerm
          }"
          @pointerdown.stop
          @click.stop="onTermClick($event, c, t)"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.build-wrap {
  position: relative;
  width: 100%;
  background: transparent;
  border: 2px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}
.build-svg {
  display: block;
  position: relative;
  z-index: 1;
  width: 100%;
  height: clamp(380px, 56vh, 600px);
  touch-action: none;
}
.tool-erase .build-svg {
  cursor: not-allowed;
}
.wire {
  fill: none;
  stroke: #5b6470;
  stroke-width: 3.5;
  stroke-linejoin: round;
  stroke-linecap: round;
  transition: stroke 0.25s ease, filter 0.25s ease, stroke-width 0.25s ease;
}
/* 接通电源、回路有电流时：导线变为红色（不使用高亮/发光） */
.wire-live {
  stroke: #ff3b4d;
  stroke-width: 4;
}
.wire-draft {
  fill: none;
  stroke: #56b6ff;
  stroke-width: 3;
  stroke-dasharray: 7 6;
  stroke-linecap: round;
}
.electron {
  fill: #ff3b4d;
}
.sel-outline {
  fill: none;
  stroke: #ffd34d;
  stroke-width: 2;
  stroke-dasharray: 6 5;
}
.term {
  fill: #cdd6e2;
  stroke: #0e1116;
  stroke-width: 2;
  cursor: pointer;
  transition: r 0.1s ease, fill 0.1s ease;
}
.is-switch {
  cursor: pointer;
}
.term:hover {
  fill: #56b6ff;
}
/* 已有待连端子时：其余接线柱高亮为"可连"态 */
.term.armed {
  fill: #8fe0a0;
}
/* 已选中的首个接线柱 */
.term.pending {
  fill: #ffd34d;
  stroke: #0e1116;
  r: 9;
}
</style>
