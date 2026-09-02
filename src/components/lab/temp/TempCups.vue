<script setup>
/*
 * TempCups —— e-temp 三杯水装置（纯内联 SVG，零网络请求），画风对齐 BoilBeaker / SubRig：
 * 玻璃杯（渐变水 + 杯口椭圆 + 高光）+ 热水杯白汽（CSS 动画）+ 选中描边发光。
 * 坐标约定：viewBox 0 0 480 240；杯心 cx 80/240/400，杯口 y=65，杯底 y=220，水面 y=127。
 * 放置：设计层 left 30 / top 235 → 杯底落 design y=455（桌脚基线）。
 */
const props = defineProps({
  cups: { type: Array, required: true },
  selected: { type: Number, default: 0 },
})
const emit = defineEmits(['select'])

const CX = [80, 240, 400]
const RIM = 65
const BOT = 220
const WSURF = 127

function cupPath(cx) {
  return `M ${cx - 55} ${RIM} Q ${cx - 48} 67 ${cx - 45} 74 L ${cx - 40} 206 Q ${cx - 39} ${BOT} ${cx - 25} ${BOT} L ${cx + 25} ${BOT} Q ${cx + 39} ${BOT} ${cx + 40} 206 L ${cx + 45} 74 Q ${cx + 48} 67 ${cx + 55} ${RIM}`
}
function clipPath(cx) {
  return `M ${cx - 51} 69 L ${cx - 45} 205 Q ${cx - 44} 216 ${cx - 32} 216 L ${cx + 32} 216 Q ${cx + 44} 216 ${cx + 45} 205 L ${cx + 51} 69 Z`
}
</script>

<template>
  <div class="tp-piece" style="left: 30px; top: 235px">
    <svg viewBox="0 0 480 240" width="480" height="240" xmlns="http://www.w3.org/2000/svg" aria-label="三杯水">
      <defs>
        <linearGradient v-for="(c, i) in cups" :key="'g' + i" :id="'tp-w' + i" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="c.color" stop-opacity="0.95" />
          <stop offset="1" :stop-color="c.deep" stop-opacity="0.96" />
        </linearGradient>
        <clipPath v-for="(cx, i) in CX" :key="'c' + i" :id="'tp-clip' + i">
          <path :d="clipPath(cx)" />
        </clipPath>
      </defs>

      <g v-for="(c, i) in cups" :key="i" class="tp-cup" :class="{ 'is-sel': i === selected }">
        <!-- 地面软阴影 -->
        <ellipse :cx="CX[i]" cy="227" rx="62" ry="5.5" fill="#000" opacity="0.10" />
        <!-- 水（裁剪在杯内壁） -->
        <g :clip-path="`url(#tp-clip${i})`">
          <rect :x="CX[i] - 52" :y="WSURF" width="104" :height="BOT - WSURF" :fill="`url(#tp-w${i})`" />
          <ellipse :cx="CX[i]" :cy="WSURF" rx="48" ry="4.5" fill="#fff" opacity="0.35" />
        </g>
        <!-- 杯体玻璃 + 描边 -->
        <path :d="cupPath(CX[i])" fill="rgba(228, 236, 244, 0.18)" />
        <path class="cup-edge" :d="cupPath(CX[i])" fill="none" stroke="#5f7588" stroke-width="2" stroke-linecap="round" />
        <!-- 杯口椭圆（与杯口同宽，两端落在杯壁顶点） -->
        <ellipse :cx="CX[i]" :cy="RIM" rx="55" ry="7" fill="rgba(255, 255, 255, 0.35)" stroke="#5f7588" stroke-width="2" />
        <ellipse :cx="CX[i]" :cy="RIM" rx="48" ry="5.2" fill="none" stroke="#8ba1b3" stroke-width="1" />
        <!-- 壁面高光 -->
        <path :d="`M ${CX[i] - 48} 88 Q ${CX[i] - 50} 145 ${CX[i] - 41} 198`" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.45" />
        <!-- 热水白汽 -->
        <g v-if="c.steam" stroke="#aab8c4" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.85">
          <path class="tp-steam d1" :d="`M ${CX[i] - 30} 56 q 5 -7 0 -13 q -5 -6 0 -13`" />
          <path class="tp-steam d2" :d="`M ${CX[i] + 30} 56 q 5 -7 0 -13 q -5 -6 0 -13`" />
          <path class="tp-steam d3" :d="`M ${CX[i]} 52 q 4 -6 0 -12 q -4 -6 0 -12`" />
        </g>
        <!-- 名称（选中时变蓝 + ▼ 指示，避免与温度计刻度重叠） -->
        <text :x="CX[i]" y="236" text-anchor="middle" font-size="13" font-weight="700" :style="i === selected ? 'fill: #6ea8ff' : 'fill: var(--bb-fg-dim, #c7d0c8)'" font-family="system-ui, sans-serif">{{ i === selected ? '▼ ' : '' }}{{ c.name }}{{ i === selected ? ' · 测量中' : '' }}</text>
        <!-- 点击热区 -->
        <rect :x="CX[i] - 58" y="30" width="116" height="196" fill="transparent" style="pointer-events: all; cursor: pointer" @click="emit('select', i)" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.tp-cup.is-sel { filter: drop-shadow(0 0 4px rgba(110, 168, 255, 0.55)); }
.tp-cup.is-sel .cup-edge { stroke: #6ea8ff; stroke-width: 2.6; }
</style>
