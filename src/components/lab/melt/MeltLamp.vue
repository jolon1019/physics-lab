<template>
  <div
    class="melt-piece melt-lamp"
    :class="[{ 'is-on': on, 'is-off': !on, 'is-hover': hover, 'is-selected': selected, 'is-disabled': !interactive }]"
    :style="posStyle"
    :data-edit-mode="editMode ? 'true' : 'false'"
    @pointerenter="hover = true"
    @pointerleave="hover = false"
    @click.stop="onClick"
    @pointerdown="emit('pointerdown', $event)"
  >
    <svg viewBox="0 0 100 200" :width="size.w" :height="size.h" xmlns="http://www.w3.org/2000/svg" aria-label="酒精灯">
      <!-- 命中盒（不可见） -->
      <rect class="melt-piece-hit" :x="-4" :y="-4" :width="VBW + 8" :height="VBH + 8" fill="transparent" />
      <!-- 火焰：仅 on 时显示 -->
      <g v-if="on" class="flame">
        <path class="flame-outer"
          d="M50 78 C 30 60 28 36 50 14 C 72 36 70 60 50 78 Z"
          :fill="colors.outer" />
        <path class="flame-mid"
          d="M50 78 C 38 64 36 44 50 28 C 64 44 62 64 50 78 Z"
          :fill="colors.mid" />
        <path class="flame-inner"
          d="M50 76 C 44 68 43 56 50 46 C 57 56 56 68 50 76 Z"
          :fill="colors.inner" />
      </g>
      <!-- 灯体：玻璃瓶 -->
      <path
        d="M30 110 L36 100 L36 86 L64 86 L64 100 L70 110 L74 130 L78 178 L22 178 L26 130 Z"
        :fill="bottleFill" :stroke="colors.stroke" :stroke-width="2.2" stroke-linejoin="round" />
      <!-- 瓶内液体（黄） -->
      <path
        d="M28 140 L72 140 L77 178 L23 178 Z"
        fill="#f5c14b" opacity="0.55" />
      <!-- 瓶颈高光 -->
      <path d="M40 92 L40 100" :stroke="colors.stroke" stroke-width="1.4" stroke-linecap="round" />
      <!-- 灯芯管 -->
      <rect x="46" y="86" width="8" height="22" fill="#2a2a2a" />
      <!-- 灯芯头 -->
      <rect x="48" y="80" width="4" height="6" fill="#1a1a1a" />
      <!-- 瓶底反光高光 -->
      <ellipse cx="50" cy="172" rx="18" ry="3" fill="#fff" opacity="0.35" />
      <!-- 标签 "酒精" -->
      <text x="50" y="155" text-anchor="middle" font-size="9" font-weight="700" fill="#2a2a2a" opacity="0.7">酒精</text>
    </svg>
    <div v-if="hover && tip" class="melt-tip" :style="{ left: size.w / 2 + 'px', top: '0px' }">{{ tip }}</div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  x: { type: Number, required: true },
  baseline: { type: Number, required: true },
  w: { type: Number, default: 60 },
  on: { type: Boolean, default: false },
  interactive: { type: Boolean, default: true },  // 课点击切换
  selected: { type: Boolean, default: false },
  editMode: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle', 'pointerdown'])

const VBW = 100, VBH = 200
const hover = ref(false)

const colors = {
  stroke: '#2a2a2a',
  outer: '#f97316',
  mid: '#fbbf24',
  inner: '#fef3c7',
}
const bottleFill = '#dde6ef'

const size = computed(() => {
  // 灯按 w 缩放，高 = w * (VBH / VBW) = 2w
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
const tip = computed(() => {
  if (!props.interactive) return ''
  return props.on ? '点击关闭酒精灯' : '点击点燃酒精灯'
})

function onClick() {
  if (props.editMode) return      // 编辑模式下点击只用来选中/拖动，不切换 on/off
  if (!props.interactive) return
  emit('toggle', !props.on)
}
</script>
