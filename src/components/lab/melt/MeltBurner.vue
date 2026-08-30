<script setup>
/*
 * MeltBurner —— e-melt 酒精灯（纯内联 SVG，零网络请求）。
 * 写实造型：扁圆玻璃瓶身 + 玫瑰色酒精 + 瓷质灯帽 + 棉芯，
 * 火焰外焰橙 / 内焰黄 / 焰底蓝，点燃与熄灭用 transform + opacity 平滑过渡，
 * 燃烧时 CSS 微颤（flicker），避免旧版两张 PNG 硬切换。
 * 坐标约定：w = 内容宽（映射 viewBox 130），baseline = 底部 y（瓶底落地点）。
 */
import { computed, ref } from 'vue'

const props = defineProps({
  x: Number,
  baseline: Number,
  w: Number,
  on: Boolean,           // 是否点燃
  selected: Boolean,
  editMode: Boolean,
})
const emit = defineEmits(['pointerdown'])
const hover = ref(false)

const VBW = 130, VBH = 212

const size = computed(() => {
  const w = props.w
  return { w, h: w * (VBH / VBW) }
})
const posStyle = computed(() => ({
  left: (props.x - size.value.w / 2) + 'px',
  top: (props.baseline - size.value.h) + 'px',
  width: size.value.w + 'px',
  height: size.value.h + 'px',
}))

function onDown(e) { emit('pointerdown', e) }
</script>

<template>
  <div
    class="melt-piece melt-burner"
    :class="{ 'is-on': on, 'is-hover': hover && editMode, 'is-selected': selected }"
    :style="posStyle"
    :data-edit-mode="editMode ? 'true' : 'false'"
    @pointerenter="hover = true"
    @pointerleave="hover = false"
    @pointerdown="onDown"
  >
    <svg :viewBox="`0 0 ${VBW} ${VBH}`" :width="size.w" :height="size.h" xmlns="http://www.w3.org/2000/svg" aria-label="酒精灯">
      <defs>
        <linearGradient id="mb-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(255,255,255,0.55)" />
          <stop offset="1" stop-color="rgba(222,233,240,0.18)" />
        </linearGradient>
        <linearGradient id="mb-flameOut" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffb066" />
          <stop offset="0.65" stop-color="#f97f1f" />
          <stop offset="1" stop-color="#f2660f" />
        </linearGradient>
        <linearGradient id="mb-flameMid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffe38a" />
          <stop offset="1" stop-color="#ffc23e" />
        </linearGradient>
        <radialGradient id="mb-glow" cx="0.5" cy="0.55" r="0.6">
          <stop offset="0" stop-color="rgba(255,166,66,0.4)" />
          <stop offset="1" stop-color="rgba(255,166,66,0)" />
        </radialGradient>
        <radialGradient id="mb-flameBlue" cx="0.5" cy="0.5" r="0.55">
          <stop offset="0" stop-color="rgba(96,168,255,0.85)" />
          <stop offset="1" stop-color="rgba(96,168,255,0)" />
        </radialGradient>
        <clipPath id="mb-body">
          <path d="M52 92 L52 104 C 30 112, 20 134, 20 154 C 20 184, 40 200, 65 200 C 90 200, 110 184, 110 154 C 110 134, 100 112, 78 104 L78 92 Z" />
        </clipPath>
      </defs>

      <!-- 地面软阴影 + 火光映地 -->
      <ellipse cx="65" cy="207" rx="42" ry="4.5" fill="#000" opacity="0.10" />
      <ellipse class="mb-pool" cx="65" cy="205" rx="36" ry="5" fill="#ff9d42" />

      <!-- 玻璃瓶身 -->
      <path
        d="M52 92 L52 104 C 30 112, 20 134, 20 154 C 20 184, 40 200, 65 200 C 90 200, 110 184, 110 154 C 110 134, 100 112, 78 104 L78 92"
        fill="url(#mb-glass)"
      />
      <!-- 瓶内酒精 -->
      <g clip-path="url(#mb-body)">
        <rect x="14" y="136" width="102" height="70" fill="#f4bcc7" opacity="0.55" />
        <ellipse cx="65" cy="136" rx="42" ry="5" fill="#f9d9de" opacity="0.85" />
      </g>
      <path
        d="M52 92 L52 104 C 30 112, 20 134, 20 154 C 20 184, 40 200, 65 200 C 90 200, 110 184, 110 154 C 110 134, 100 112, 78 104 L78 92"
        fill="none" stroke="#5f7588" stroke-width="2" stroke-linecap="round"
      />
      <!-- 瓶身高光 -->
      <path d="M31 122 C 25 136, 25 160, 35 178" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.5" />
      <path d="M99 126 C 103 138, 103 152, 98 163" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity="0.3" />

      <!-- 火焰（点燃时显现） -->
      <g class="mb-flame">
        <ellipse cx="65" cy="36" rx="27" ry="32" fill="url(#mb-glow)" />
        <path class="mb-flicker f1" d="M65 70 C 45 58, 40 32, 65 4 C 90 32, 85 58, 65 70 Z" fill="url(#mb-flameOut)" />
        <path class="mb-flicker f2" d="M65 66 C 53 57, 50 38, 65 20 C 80 38, 77 57, 65 66 Z" fill="url(#mb-flameMid)" />
        <path class="mb-flicker f3" d="M65 62 C 59 55, 58 44, 65 36 C 72 44, 71 55, 65 62 Z" fill="#fff8dc" />
        <ellipse cx="65" cy="63" rx="9" ry="6.5" fill="url(#mb-flameBlue)" />
      </g>

      <!-- 棉芯 -->
      <rect x="61" y="52" width="8" height="24" rx="3.5" fill="#efe8d4" stroke="#c9c0a6" stroke-width="1" />
      <path d="M61.5 58 L73 58 M61.5 63 L73 63" stroke="#d8d0b8" stroke-width="0.9" />
      <ellipse cx="65" cy="53" rx="4" ry="1.8" fill="#6b6154" />

      <!-- 瓷灯帽 -->
      <rect x="49" y="70" width="32" height="26" rx="3" fill="#59636f" stroke="#39404b" stroke-width="1.6" />
      <path d="M55 74 L55 92 M61 74 L61 93 M69 74 L69 93 M75 74 L75 92" stroke="#434c57" stroke-width="1" opacity="0.8" />
      <ellipse cx="65" cy="70" rx="16" ry="4.5" fill="#75808d" stroke="#39404b" stroke-width="1.4" />
    </svg>
  </div>
</template>

<style scoped>
.melt-burner { outline: none; }
.melt-burner svg { display: block; pointer-events: none; user-select: none; }
.melt-burner.is-hover svg { filter: drop-shadow(0 0 2px rgba(255, 207, 51, 0.9)); }

/* 火焰：平滑点燃 / 熄灭 */
.mb-flame {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  transition: opacity 0.4s ease, transform 0.55s cubic-bezier(0.34, 1.45, 0.64, 1);
}
.melt-burner:not(.is-on) .mb-flame {
  opacity: 0;
  transform: scale(0.25, 0.12) translateY(14px);
}
.melt-burner.is-on .mb-flame { opacity: 1; transform: scale(1, 1); }

/* 燃烧微颤 */
@keyframes mbFlicker {
  0%, 100% { transform: scale(1, 1); }
  30% { transform: scale(0.96, 1.05); }
  60% { transform: scale(1.04, 0.96); }
  80% { transform: scale(0.98, 1.03); }
}
.mb-flicker { transform-box: fill-box; transform-origin: 50% 100%; }
.melt-burner.is-on .mb-flicker.f1 { animation: mbFlicker 1.7s ease-in-out infinite; }
.melt-burner.is-on .mb-flicker.f2 { animation: mbFlicker 1.3s 0.25s ease-in-out infinite; }
.melt-burner.is-on .mb-flicker.f3 { animation: mbFlicker 1.1s 0.5s ease-in-out infinite; }

/* 地面火光 */
.mb-pool { opacity: 0; transition: opacity 0.5s ease; }
.melt-burner.is-on .mb-pool { opacity: 0.22; }
</style>
