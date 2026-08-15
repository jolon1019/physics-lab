<script setup>
// 元件库：每个元件以"实物图"呈现，支持拖拽到画布，也支持点击添加（触屏/无障碍回退）
import { META, COMP_TYPES, buildArt } from '../../circuit/components'
import { useCircuitStore } from '../../stores/circuit'

const store = useCircuitStore()

function onDragStart(e, type) {
  e.dataTransfer.setData('text/circuit-type', type)
  e.dataTransfer.effectAllowed = 'copy'
}

function onClick(type) {
  const id = store.addComponent(type, 500 + (Math.random() * 140 - 70), 320 + (Math.random() * 140 - 70))
  store.select(id)
}
</script>

<template>
  <div class="palette">
    <p class="palette-title">元件库</p>
    <div class="pal-grid">
      <button
        v-for="t in COMP_TYPES"
        :key="t"
        class="pal-item"
        draggable="true"
        :title="META[t].label + '（拖到画布 / 点击添加）'"
        @dragstart="onDragStart($event, t)"
        @click="onClick(t)"
      >
        <svg viewBox="-60 -52 120 104" class="pal-art" v-html="buildArt(t, {})"></svg>
        <span>{{ META[t].label }}</span>
      </button>
    </div>
    <p class="pal-hint">把元件拖到右侧画布；点击元件可拖动，拖动端子间的连线即可接通电路。</p>
  </div>
</template>

<style scoped>
.palette {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.palette-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-h);
  letter-spacing: 0.04em;
}
.pal-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.pal-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: var(--surface-2);
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  cursor: grab;
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 700;
  transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease;
}
.pal-item:hover {
  border-color: var(--accent);
  background: var(--surface-3);
  transform: translateY(-2px);
}
.pal-item:active {
  cursor: grabbing;
}
.pal-art {
  width: 100%;
  height: 52px;
  pointer-events: none;
}
.pal-hint {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-dim);
}
</style>
