<template>
  <div
    class="melt-piece melt-stand"
    :class="{ 'is-hover': hover, 'is-selected': selected }"
    :style="posStyle"
    :data-edit-mode="editMode ? 'true' : 'false'"
    @pointerenter="hover = true"
    @pointerleave="hover = false"
    @pointerdown="emit('pointerdown', $event)"
  >
    <svg viewBox="0 0 160 200" :width="size.w" :height="size.h" xmlns="http://www.w3.org/2000/svg" aria-label="铁架台">
      <rect class="melt-piece-hit" :x="-6" :y="-6" :width="VBW + 12" :height="VBH + 12" fill="transparent" />
      <!-- 立柱 -->
      <rect :x="VBW / 2 - 3" y="14" width="6" :height="VBH - 30" :fill="colors.iron" :stroke="colors.stroke" stroke-width="1.6" rx="1.2" />
      <!-- 底座 -->
      <ellipse :cx="VBW / 2" :cy="VBH - 10" rx="68" ry="8" :fill="colors.iron" :stroke="colors.stroke" stroke-width="2" />
      <ellipse :cx="VBW / 2" :cy="VBH - 12" rx="64" ry="5" :fill="colors.ironLight" />
      <!-- 螺丝帽 -->
      <circle :cx="VBW / 2" :cy="VBH - 12" r="2.4" :fill="colors.stroke" />
      <!-- 横杆（夹具臂） -->
      <rect :x="20" :y="clampY" :width="VBW - 40" height="6" :fill="colors.iron" :stroke="colors.stroke" stroke-width="1.6" rx="1" />
      <!-- 横杆右端固定夹 -->
      <rect :x="VBW - 28" :y="clampY - 6" width="10" height="18" :fill="colors.iron" :stroke="colors.stroke" stroke-width="1.6" rx="1" />
      <!-- 试管夹（U 形铁夹抱向 tube 中心） -->
      <g :stroke="colors.stroke" stroke-width="1.8" fill="none" stroke-linejoin="round">
        <path :d="clampArmD" />
      </g>
      <circle :cx="68" :cy="clampY" r="2.4" :fill="colors.stroke" />
    </svg>
    <div v-if="hover && tip" class="melt-tip" :style="{ left: size.w / 2 + 'px', top: '0px' }">{{ tip }}</div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  x: { type: Number, required: true },
  baseline: { type: Number, required: true },
  w: { type: Number, default: 140 },
  selected: { type: Boolean, default: false },
  editMode: { type: Boolean, default: false },
})
const emit = defineEmits(['pointerdown'])

const VBW = 160, VBH = 200
const hover = ref(false)
const colors = {
  stroke: '#2a2a2a',
  iron: '#4a4f5a',
  ironLight: '#7d8392',
}
const clampY = 38  // 横杆高度
// 试管夹（U 形铁夹）路径，按 clampY 计算，避免字面量被当字符串
const clampArmD = computed(() =>
  `M68 ${clampY} L48 ${clampY - 2} ` +
  `M48 ${clampY - 2} Q 42 ${clampY - 2} 42 ${clampY + 4} ` +
  `M42 ${clampY + 4} L42 ${clampY + 16} ` +
  `M48 ${clampY - 2} L48 ${clampY + 8}`
)

const size = computed(() => {
  const w = props.w
  const h = w * (VBH / VBW)
  return { w, h }
})
const posStyle = computed(() => ({
  left: (props.x - size.value.w / 2) + 'px',
  top:  (props.baseline - size.value.h) + 'px',
  width: size.value.w + 'px',
  height: size.value.h + 'px',
}))
const tip = computed(() => '铁架台：固定支撑试管')
</script>
