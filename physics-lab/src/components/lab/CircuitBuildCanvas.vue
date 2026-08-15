<script setup>
// 自由搭建台：实物图元件可拖拽，端子间拖动连线，闭合后电子流动画。
// 内部坐标 1000×640，SVG 自适应缩放（响应式）；指针坐标经 getScreenCTM 反算。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { META, buildArt, routeWirePath, terminalNormal, pointOnPolyline } from '../../circuit/components'
import { useCircuitStore } from '../../stores/circuit'

const store = useCircuitStore()
const svgRef = ref(null)

const dragComp = ref(null) // { id, offX, offY }
const wireDraft = ref(null) // { from:{comp,term}, x, y }
const hoverTerm = ref(null) // { comp, term }

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

function terminalAt(evt) {
  const pos = toSvg(evt)
  for (const c of store.components) {
    for (const t of META[c.type].terminals) {
      const w = terminalWorldPos(c.id, t.id)
      if (Math.hypot(pos.x - w.x, pos.y - w.y) <= 12) return { comp: c.id, term: t.id }
    }
  }
  return null
}

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

function normOf(compId, term) {
  const c = store.compById(compId)
  return terminalNormal(c ? c.type : 'bulb', term, c ? c.rot : 0)
}
function wirePathD(w) {
  const a = terminalWorldPos(w.a.comp, w.a.term)
  const b = terminalWorldPos(w.b.comp, w.b.term)
  const na = normOf(w.a.comp, w.a.term)
  const nb = normOf(w.b.comp, w.b.term)
  return routeWirePath(a.x, a.y, na[0], na[1], b.x, b.y, nb[0], nb[1])
}

function polylineLen(pts) {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return s
}

const electrons = computed(() => {
  const out = []
  const ph = phase.value
  for (const br of store.animatedBranches) {
    if (br.I < 0.02) continue
    const speed = Math.min(1.3, 0.1 + br.I * 0.22)
    const total = polylineLen(br.points)
    const n = Math.max(2, Math.round(total / 46))
    for (let i = 0; i < n; i++) {
      const t = ((i / n + ph * speed) % 1 + 1) % 1
      const p = pointOnPolyline(br.points, t)
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

function onTermDown(evt, c, t) {
  evt.stopPropagation()
  if (store.tool === 'erase') {
    store.removeWiresAt(c.id, t.id)
    return
  }
  const w = terminalWorldPos(c.id, t.id)
  wireDraft.value = { from: { comp: c.id, term: t.id }, x: w.x, y: w.y }
  svgRef.value.setPointerCapture(evt.pointerId)
}

function onWireDown(evt, w) {
  evt.stopPropagation()
  if (store.tool === 'erase') store.removeWire(w.id)
}

function onBgDown() {
  store.select(null)
  wireDraft.value = null
}

function onMove(evt) {
  if (dragComp.value) {
    const pos = toSvg(evt)
    // 超过阈值判定为拖动，否则保持"未移动"→ 抬起时按开关处理
    if (Math.hypot(pos.x - dragComp.value.sx, pos.y - dragComp.value.sy) > 4) dragComp.value.moved = true
    store.moveComponent(dragComp.value.id, pos.x - dragComp.value.offX, pos.y - dragComp.value.offY)
  } else if (wireDraft.value) {
    const pos = toSvg(evt)
    wireDraft.value.x = pos.x
    wireDraft.value.y = pos.y
    hoverTerm.value = terminalAt(evt)
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
  } else if (wireDraft.value) {
    const target = terminalAt(evt)
    if (target && !(target.comp === wireDraft.value.from.comp && target.term === wireDraft.value.from.term)) {
      store.connect(wireDraft.value.from, target)
    }
    wireDraft.value = null
    hoverTerm.value = null
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
  <div class="build-wrap" :class="{ 'tool-erase': store.tool === 'erase', 'tool-wire': store.tool === 'wire' }">
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
        <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.6" fill="#222a36" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="1000" height="640" fill="url(#dots)" @pointerdown="onBgDown" />

      <!-- 导线 -->
      <path
        v-for="w in store.wires"
        :key="w.id"
        :d="wirePathD(w)"
        class="wire"
        @pointerdown="onWireDown($event, w)"
      />

      <!-- 连线草稿 -->
      <path
        v-if="wireDraft"
        :d="`M ${terminalWorldPos(wireDraft.from.comp, wireDraft.from.term).x} ${terminalWorldPos(wireDraft.from.comp, wireDraft.from.term).y} L ${wireDraft.x} ${wireDraft.y}`"
        class="wire-draft"
      />

      <!-- 电子流动 -->
      <circle v-for="(e, i) in electrons" :key="'e' + i" :cx="e.x" :cy="e.y" r="3.2" class="electron" :opacity="e.a" />

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
          x="-56"
          y="-44"
          width="112"
          height="88"
          rx="10"
          class="sel-outline"
        />
        <g v-html="buildArt(c.type, artState(c))"></g>
        <circle
          v-for="t in META[c.type].terminals"
          :key="t.id"
          :cx="t.x"
          :cy="t.y"
          r="7"
          class="term"
          :class="{
            hot:
              (wireDraft && hoverTerm && hoverTerm.comp === c.id && hoverTerm.term === t.id) ||
              (wireDraft && wireDraft.from.comp === c.id && wireDraft.from.term === t.id)
          }"
          @pointerdown="onTermDown($event, c, t)"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.build-wrap {
  width: 100%;
  background: #0e1116;
  border: 2px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}
.build-svg {
  display: block;
  width: 100%;
  height: clamp(380px, 56vh, 600px);
  touch-action: none;
}
.tool-wire .build-svg {
  cursor: crosshair;
}
.tool-erase .build-svg {
  cursor: not-allowed;
}
.wire {
  fill: none;
  stroke: #5b6470;
  stroke-width: 3;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.wire-draft {
  fill: none;
  stroke: #56b6ff;
  stroke-width: 3;
  stroke-dasharray: 7 6;
  stroke-linecap: round;
}
.electron {
  fill: #50e0ff;
  filter: drop-shadow(0 0 4px rgba(80, 224, 255, 0.8));
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
  cursor: crosshair;
  transition: r 0.1s ease, fill 0.1s ease;
}
.is-switch {
  cursor: pointer;
}
.term:hover {
  fill: #56b6ff;
}
.term.hot {
  fill: #ff7a85;
  r: 9;
}
</style>
