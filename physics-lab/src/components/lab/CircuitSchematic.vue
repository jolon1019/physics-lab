<script setup>
// 自动生成的电路图：与搭建台共享同一份 netlist，渲染为标准电路符号 + 正交走线。
// 连接关系正确建立（闭合回路）后自动点亮，并标注"已生成电路图"。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { META, schematicArt, routeWirePath, terminalNormal, pointOnPolyline } from '../../circuit/components'
import { useCircuitStore } from '../../stores/circuit'

const store = useCircuitStore()
const phase = ref(0)
let raf = null
let last = 0

function terminalWorldPos(compId, term) {
  return store.terminalWorld(`${compId}:${term}`)
}
function artState(c) {
  const r = store.readouts[c.id] || {}
  const p = c.params
  return {
    id: c.id,
    glow: r.glow || 0,
    open: r.open,
    frac: p.frac,
    V: c.type === 'battery' ? store.sourceVoltage : p.E,
    R: p.R,
    reading: r.reading
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
      out.push({ x: p[0], y: p[1], a: Math.min(1, 0.4 + br.I * 0.4) })
    }
  }
  return out
})

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
  <div class="schem-wrap">
    <svg class="schem-svg" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="1000" height="640" fill="#0b0e13" rx="10" />
      <path v-for="w in store.wires" :key="w.id" :d="wirePathD(w)" class="s-wire" />
      <circle v-for="(e, i) in electrons" :key="'e' + i" :cx="e.x" :cy="e.y" r="3" class="s-electron" :opacity="e.a" />
      <g
        v-for="c in store.components"
        :key="c.id"
        :transform="`translate(${c.x},${c.y}) rotate(${c.rot || 0})`"
        :class="{ 's-switch': c.type === 'switch' }"
        @pointerdown="c.type === 'switch' ? store.toggleSwitch(c.id) : null"
      >
        <g v-html="schematicArt(c.type, artState(c))"></g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.schem-wrap {
  display: block;
}
.schem-svg {
  display: block;
  width: 100%;
  height: clamp(300px, 44vh, 460px);
  border: 2px solid var(--line);
  border-radius: var(--radius);
}
.s-wire {
  fill: none;
  stroke: #6b7686;
  stroke-width: 3;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.s-switch {
  cursor: pointer;
}
.s-electron {
  fill: #50e0ff;
}
</style>
