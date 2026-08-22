<template>
  <div
    class="melt-piece melt-thermo"
    :class="{ 'is-hover': hover, 'is-selected': selected }"
    :style="posStyle"
    :data-edit-mode="editMode ? 'true' : 'false'"
    @pointerenter="hover = true"
    @pointerleave="hover = false"
    @pointerdown="emit('pointerdown', $event)"
  >
    <svg viewBox="0 0 60 290" :width="size.w" :height="size.h" xmlns="http://www.w3.org/2000/svg" aria-label="温度计">
      <rect class="melt-piece-hit" :x="-6" :y="-6" :width="VBW + 12" :height="VBH + 12" fill="transparent" />
      <!-- 玻璃管身 -->
      <path
        d="M24 20 L24 248 A 18 18 0 0 0 36 248 L36 20"
        class="melt-glass-fill"
      />
      <!-- 玻璃球：先填充再描边 -->
      <circle cx="30" cy="260" r="18" class="melt-glass-fill" />
      <!-- 管壁高光 -->
      <path d="M27 30 L27 240" stroke="#fff" stroke-opacity="0.55" stroke-width="1.6" fill="none" stroke-linecap="round" />
      <!-- 顶帽 -->
      <ellipse cx="30" cy="14" rx="10" ry="4" :fill="colors.cap" :stroke="colors.stroke" stroke-width="1.6" />
      <!-- 汞泡（球内红圆） -->
      <circle cx="30" cy="260" r="13" :fill="colors.mercury" />
      <ellipse cx="26" cy="256" rx="3.5" ry="2" fill="#fff" opacity="0.55" />
      <!-- 汞柱（管内） -->
      <rect :x="26" :y="mercuryTop" width="8" :height="bulbTopY - mercuryTop" :fill="colors.mercury" rx="1" />
      <!-- 刻度线 + 数字 -->
      <g :stroke="colors.line" stroke-width="1.4" opacity="0.7" font-size="6" font-weight="700" font-family="system-ui" fill="#22324a">
        <g v-for="(T, i) in ticks" :key="i">
          <line :x1="36" :y1="yFor(T) - 0.5" :x2="42" :y2="yFor(T) - 0.5" />
          <text :x="44" :y="yFor(T) + 1.6">{{ T }}</text>
        </g>
      </g>
    </svg>
    <!-- 实时读数（数字显示在管右侧） -->
    <div class="thermo-readout" :style="{ left: size.w + 4 + 'px', top: (size.h * 0.25) + 'px' }">
      <span class="num">{{ Math.round(temp) }}</span><span class="unit">℃</span>
    </div>
    <div v-if="hover && tip" class="melt-tip" :style="{ left: size.w / 2 + 'px', top: '0px' }">{{ tip }}</div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  x: { type: Number, required: true },
  baseline: { type: Number, required: true },
  w: { type: Number, default: 30 },
  temp: { type: Number, default: 25 },
  tMin: { type: Number, default: 30 },
  tMax: { type: Number, default: 72 },
  selected: { type: Boolean, default: false },
  editMode: { type: Boolean, default: false },
})
const emit = defineEmits(['pointerdown'])

const VBW = 60, VBH = 290
const hover = ref(false)
const colors = {
  stroke: '#2a2a2a',
  cap: '#3a3f48',
  mercury: '#e85a4f',
  line: '#22324a',
}

const ticks = [30, 40, 50, 60, 70]

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

// 管内 y 区间 20..248，球顶 y≈242
const TUBE_TOP_Y = 20
const TUBE_BOT_Y = 248
const BULB_TOP_Y = 242
const yFor = (T) => TUBE_BOT_Y - (T - props.tMin) / (props.tMax - props.tMin) * (TUBE_BOT_Y - TUBE_TOP_Y)
const bulbTopY = BULB_TOP_Y
const mercuryTop = computed(() => {
  const T = Math.max(props.tMin, Math.min(props.tMax, props.temp))
  return TUBE_BOT_Y - (T - props.tMin) / (props.tMax - props.tMin) * (TUBE_BOT_Y - TUBE_TOP_Y)
})

const tip = computed(() => `温度计：${props.temp.toFixed(1)} ℃`)
</script>

<style scoped>
.thermo-readout {
  position: absolute;
  background: #fff7c2;
  border: 2px solid #2a2a2a;
  border-radius: 5px;
  padding: 2px 6px;
  font: 700 13px/1.1 system-ui, sans-serif;
  color: #2a2a2a;
  box-shadow: 2px 2px 0 #2a2a2a;
  white-space: nowrap;
  pointer-events: none;
}
.thermo-readout .num { color: #e85a4f; font-size: 15px; margin-right: 1px; }
.thermo-readout .unit { font-size: 10px; opacity: 0.7; }
</style>
