<template>
  <div
    class="melt-piece melt-tube"
    :class="['phase-' + phase, { 'is-hover': hover, 'is-selected': selected }]"
    :style="posStyle"
    :data-edit-mode="editMode ? 'true' : 'false'"
    @pointerenter="hover = true"
    @pointerleave="hover = false"
  >
    <svg viewBox="0 0 100 360" :width="size.w" :height="size.h" xmlns="http://www.w3.org/2000/svg" :aria-label="`试管 ${phase}`">
      <rect class="melt-piece-hit" :x="-6" :y="-6" :width="VBW + 12" :height="VBH + 12" fill="transparent" />

      <!-- 试管轮廓 + 顶盖 -->
      <path
        d="M30 30 L30 320 A 20 20 0 0 0 70 320 L70 30"
        :class="['melt-glass-fill', { 'tube-fill-empty': phase === 'kong' }]"
      />
      <!-- 顶盖椭圆 -->
      <ellipse cx="50" cy="30" rx="20" ry="6" :fill="colors.cap" :stroke="colors.stroke" stroke-width="2" />
      <ellipse cx="50" cy="30" rx="20" ry="6" fill="none" :stroke="colors.stroke" stroke-width="2" />
      <!-- 管壁高光 -->
      <path d="M36 60 L36 300" stroke="#fff" stroke-opacity="0.55" stroke-width="2.5" fill="none" stroke-linecap="round" />

      <!-- 内容区：用 clipPath 限定在管内 -->
      <clipPath :id="clipId">
        <path d="M30 36 L30 320 A 20 20 0 0 0 70 320 L70 36 Z" />
      </clipPath>

      <g :clip-path="`url(#${clipId})`">
        <!-- 晶粒（gu / rong 残余） -->
        <g v-if="phase === 'gu' || phase === 'rong'">
          <g :fill="colors.crystal" stroke="rgba(0,0,0,0.45)" stroke-width="0.6">
            <circle cx="42" cy="298" r="4" />
            <circle cx="50" cy="304" r="3.5" />
            <circle cx="58" cy="298" r="4" />
            <circle cx="46" cy="290" r="3" />
            <circle cx="54" cy="288" r="3" />
            <circle cx="38" cy="306" r="3" />
            <circle cx="62" cy="306" r="3" />
            <circle cx="50" cy="280" r="3" />
          </g>
          <!-- 高光小点 -->
          <g fill="#cfd4dc" opacity="0.85">
            <circle cx="40.5" cy="296.5" r="0.9" />
            <circle cx="48.5" cy="302.5" r="0.8" />
            <circle cx="56.5" cy="296.5" r="0.9" />
            <circle cx="48.5" cy="278.5" r="0.8" />
          </g>
        </g>

        <!-- 液体（rong / feiteng） -->
        <g v-if="phase === 'rong' || phase === 'feiteng'">
          <rect x="28" :y="waterTop" width="44" :height="340 - waterTop" :fill="colors.water" opacity="0.78" />
          <rect x="28" :y="waterTop" width="44" :height="3" :fill="colors.waterLine" />

          <!-- rong：底部少量小气泡上升 -->
          <g v-if="phase === 'rong'">
            <circle class="bubble b1" cx="44" cy="290" r="2" fill="#fff" opacity="0.85" />
            <circle class="bubble b2" cx="54" cy="295" r="1.8" fill="#fff" opacity="0.85" />
            <circle class="bubble b3" cx="50" cy="288" r="1.4" fill="#fff" opacity="0.85" />
          </g>

          <!-- feiteng：大量沸腾气泡（覆盖管内大部分） -->
          <g v-if="phase === 'feiteng'">
            <circle class="boil-bubble b1" cx="42" cy="220" r="3.2" fill="#fff" opacity="0.95" />
            <circle class="boil-bubble b2" cx="58" cy="240" r="2.6" fill="#fff" opacity="0.95" />
            <circle class="boil-bubble b3" cx="46" cy="190" r="3.8" fill="#fff" opacity="0.95" />
            <circle class="boil-bubble b4" cx="56" cy="160" r="2.4" fill="#fff" opacity="0.95" />
            <circle class="boil-bubble b1" cx="50" cy="130" r="3" fill="#fff" opacity="0.95" />
            <circle class="boil-bubble b3" cx="44" cy="100" r="2.4" fill="#fff" opacity="0.95" />
          </g>

          <!-- rong 残余：液体上方少量晶粒 -->
          <g v-if="phase === 'rong'">
            <g :fill="colors.crystal" stroke="rgba(0,0,0,0.45)" stroke-width="0.5" opacity="0.7">
              <circle cx="42" cy="294" r="2.4" />
              <circle cx="58" cy="296" r="2.4" />
              <circle cx="50" cy="300" r="2.2" />
            </g>
          </g>
        </g>
      </g>

      <!-- 蒸汽：仅 feiteng 时在管口上方 -->
      <g v-if="phase === 'feiteng'" stroke="#9ab2c4" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.85">
        <path class="steam-puff d1" d="M42 22 q 3 -5 0 -10 q -3 -5 0 -10" />
        <path class="steam-puff d2" d="M50 22 q 3 -5 0 -10 q -3 -5 0 -10" />
        <path class="steam-puff d3" d="M58 22 q 3 -5 0 -10 q -3 -5 0 -10" />
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
  w: { type: Number, default: 56 },
  phase: { type: String, default: 'kong' },   // 'kong' | 'gu' | 'rong' | 'feiteng'
  temp: { type: Number, default: 25 },
  selected: { type: Boolean, default: false },
  editMode: { type: Boolean, default: false },
})
const emit = defineEmits(['pointerdown'])

const VBW = 100, VBH = 360
const hover = ref(false)
const colors = {
  stroke: '#2a2a2a',
  cap: '#3a3f48',
  crystal: '#6a6e7a',
  water: '#6db5e2',
  waterLine: '#9bcae6',
}
const clipId = `tubeClip-${Math.random().toString(36).slice(2, 8)}`

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

// 液面 y：管内顶 y=36、底 y=320（圆弧底到 y=320）
const waterTop = computed(() => {
  if (props.phase === 'rong')   return 200   // 1/3 高度
  if (props.phase === 'feiteng') return 120  // 2/3 高度
  return 320
})

const tip = computed(() => {
  const t = props.temp.toFixed(1) + '℃'
  return {
    kong:    `试管：空 · ${t}`,
    gu:      `试管：晶体（未达熔点）· ${t}`,
    rong:    `试管：融化中 · ${t}`,
    feiteng: `试管：沸腾 · ${t}`,
  }[props.phase] || '试管'
})
</script>
