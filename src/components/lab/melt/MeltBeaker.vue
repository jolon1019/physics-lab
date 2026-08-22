<template>
  <div
    class="melt-piece melt-beaker"
    :class="[{ 'is-hot': hot, 'is-hover': hover, 'is-selected': selected }]"
    :style="posStyle"
    :data-edit-mode="editMode ? 'true' : 'false'"
    @pointerenter="hover = true"
    @pointerleave="hover = false"
    @pointerdown="emit('pointerdown', $event)"
  >
    <svg viewBox="0 0 200 150" :width="size.w" :height="size.h" xmlns="http://www.w3.org/2000/svg" aria-label="烧杯">
      <rect class="melt-piece-hit" :x="-6" :y="-6" :width="VBW + 12" :height="VBH + 12" fill="transparent" />
      <!-- 烧杯外：左壁 + 底 + 右壁 + 嘴 -->
      <path
        d="M30 28 L34 36 L34 130 Q 34 142 46 142 L154 142 Q 166 142 166 130 L166 36 L170 28 L160 22 L150 30 L50 30 L40 22 Z"
        class="melt-glass-fill"
      />
      <!-- 杯壁高光（左） -->
      <path d="M40 40 L40 130" stroke="#fff" stroke-opacity="0.55" stroke-width="2" fill="none" />
      <!-- 水位：按 waterLevel 决定 fill 高度 -->
      <clipPath id="beakerClip">
        <path d="M34 36 L34 130 Q 34 142 46 142 L154 142 Q 166 142 166 130 L166 36 Z" />
      </clipPath>
      <g clip-path="url(#beakerClip)">
        <rect x="20" :y="waterY" width="160" height="120" :fill="waterFill" />
        <rect x="20" :y="waterY" width="160" height="3" :fill="waterLine" />
        <!-- 加热时水中气泡 -->
        <template v-if="hot">
          <circle class="bubble b1" cx="58"  cy="132" r="3.4" fill="#fff" opacity="0.85" />
          <circle class="bubble b2" cx="92"  cy="135" r="2.4" fill="#fff" opacity="0.85" />
          <circle class="bubble b3" cx="118" cy="130" r="3.0" fill="#fff" opacity="0.85" />
          <circle class="bubble b4" cx="138" cy="133" r="2.0" fill="#fff" opacity="0.85" />
        </template>
      </g>
      <!-- 刻度：3 条短线 -->
      <g :stroke="colors.line" stroke-width="1.2" opacity="0.6">
        <line x1="166" y1="62" x2="174" y2="62" />
        <line x1="166" y1="92" x2="174" y2="92" />
        <line x1="166" y1="122" x2="174" y2="122" />
      </g>
      <!-- 加热时杯口蒸汽 -->
      <g v-if="hot" stroke="#9ab2c4" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.9">
        <path class="steam-puff d1" d="M70 22 q 4 -6 0 -12 q -4 -6 0 -12" />
        <path class="steam-puff d2" d="M100 22 q 4 -6 0 -12 q -4 -6 0 -12" />
        <path class="steam-puff d3" d="M130 22 q 4 -6 0 -12 q -4 -6 0 -12" />
      </g>
    </svg>
    <div v-if="hover && tip" class="melt-tip" :style="{ left: size.w / 2 + 'px', top: '0px' }">{{ tip }}</div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  x: { type: Number, required: true },
  baseline: { type: Number, required: true },
  w: { type: Number, default: 110 },
  hot: { type: Boolean, default: false },          // 加热中
  waterLevel: { type: Number, default: 0.65 },    // 0..1，水位比例（杯内总高 96px）
  selected: { type: Boolean, default: false },
  editMode: { type: Boolean, default: false },
})
const emit = defineEmits(['pointerdown'])

const VBW = 200, VBH = 150
const hover = ref(false)
const colors = { line: '#22324a' }

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

// 水位 y：杯内顶 y=36，杯内底 y=130，水位从 36→130 按比例
const waterY = computed(() => 36 + (1 - props.waterLevel) * (130 - 36))
const waterFill = 'url(#beakerWaterGrad)'
const waterLine = '#9bcae6'

const tip = computed(() => `烧杯：水温 ${(20 + (props.hot ? 55 : 0)).toFixed(0)}℃${props.hot ? '（沸腾中）' : ''}`)
</script>
