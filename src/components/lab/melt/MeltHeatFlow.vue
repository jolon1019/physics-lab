<template>
  <svg class="melt-heat-flow" :viewBox="viewBox" :width="dims.w" :height="dims.h" :style="posStyle" xmlns="http://www.w3.org/2000/svg" aria-label="热流">
    <defs>
      <marker id="heatArrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="rgba(232, 90, 79, 0.7)" />
      </marker>
    </defs>
    <path
      class="heat-flow-path"
      :d="pathD"
      marker-end="url(#heatArrow)"
    />
  </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // 装置区容器尺寸（逻辑坐标 px）
  W: { type: Number, required: true },
  H: { type: Number, required: true },
  // 关键点（画布逻辑坐标）
  lampFlameX: { type: Number, required: true },
  lampFlameY: { type: Number, required: true },   // 火焰顶 y
  beakerX:    { type: Number, required: true },
  beakerTopY: { type: Number, required: true },
  tubeX:      { type: Number, required: true },
  tubeMidY:   { type: Number, required: true },
  active:     { type: Boolean, default: true },
})

// viewBox 等比覆盖 W×H，width/height 自动 fit
const dims = computed(() => ({ w: props.W, h: props.H }))
const posStyle = computed(() => ({ left: '0px', top: '0px', width: props.W + 'px', height: props.H + 'px' }))
const viewBox = computed(() => `0 0 ${props.W} ${props.H}`)

// 3 段折线：火焰顶 → 烧杯底 → 试管底侧 → 试管中部
const pathD = computed(() => {
  const p = props
  // 简单折线：L1 火焰顶直下到烧杯顶，L2 横向到试管正下方，L3 上升到试管中部
  return `M ${p.lampFlameX} ${p.lampFlameY} ` +
         `L ${p.lampFlameX} ${p.beakerTopY - 6} ` +
         `Q ${p.lampFlameX} ${p.beakerTopY - 2} ${p.beakerX} ${p.beakerTopY} ` +
         `L ${p.tubeX} ${p.beakerTopY - 2} ` +
         `L ${p.tubeX} ${p.tubeMidY}`
})
</script>

<style scoped>
.melt-heat-flow { position: absolute; pointer-events: none; }
.melt-heat-flow { opacity: 1; transition: opacity 0.3s; }
</style>
