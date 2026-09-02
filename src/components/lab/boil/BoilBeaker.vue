<script setup>
/*
 * BoilBeaker —— e-boil 装置主体（纯内联 SVG，零网络请求），结构与画风对齐 MeltFlask / SubRig：
 * 三脚架 + 石棉网 + 玻璃烧杯（渐变水 + 气泡 + 白汽）+ 挂式温度计（红色液柱随温度实时升降）。
 * 气泡分两组（CSS 动画切换，与 rAF 无关）：
 *   heating —— 沸腾前：小气泡升起途中变小消失
 *   boiling —— 沸腾时：大气泡升起不断变大、直达水面破裂（配涟漪 + 白汽）
 * 坐标约定：w = 内容宽（映射 viewBox 220），baseline = 底部 y（三脚架落地点）。
 * viewBox 几何：baseline 410；石棉网底 331；烧杯底 322，杯口 190，水面 238。
 */
import { computed, ref } from 'vue'

const props = defineProps({
  x: Number,
  baseline: Number,
  w: Number,
  heating: Boolean,        // 加热中（沸腾前）
  boiling: Boolean,        // 沸腾中
  temp: { type: Number, default: 20 },          // 当前水温
  boilingPoint: { type: Number, default: 100 }, // 当前气压下沸点
})
const hover = ref(false)

const VBW = 220, VBH = 420
// 水域几何（viewBox 单位）：水底 318，水面 238
const WBOT = 316
const WSURF = 238

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

const isHot = computed(() => props.heating || props.boiling)
// 温度计液柱：量程 20~104℃（与 Tmin/Tmax 一致），管 y 140..302，球泡 308
const TH_TOP = 140, TH_BOT = 302, T_MIN = 20, T_MAX = 104
const thLevel = computed(() => {
  const f = Math.max(0, Math.min(1, ((props.temp ?? 20) - T_MIN) / (T_MAX - T_MIN)))
  return TH_BOT - (TH_BOT - TH_TOP) * f
})
</script>

<template>
  <div
    class="bf-piece bf-rig-main"
    :class="{ 'is-hover': hover }"
    :style="posStyle"
    @pointerenter="hover = true"
    @pointerleave="hover = false"
  >
    <svg :viewBox="`0 0 ${VBW} ${VBH}`" :width="size.w" :height="size.h" xmlns="http://www.w3.org/2000/svg" aria-label="水沸腾装置">
      <defs>
        <linearGradient id="bf-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(255,255,255,0.50)" />
          <stop offset="1" stop-color="rgba(222,235,244,0.14)" />
        </linearGradient>
        <linearGradient id="bf-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#c8e9fb" stop-opacity="0.94" />
          <stop offset="1" stop-color="#8cc7ea" stop-opacity="0.96" />
        </linearGradient>
        <linearGradient id="bf-iron" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#4d5560" />
          <stop offset="1" stop-color="#2b313a" />
        </linearGradient>
        <clipPath id="bf-cupClip">
          <path d="M51 200 L55 310 Q56 323 70 324 L150 324 Q164 323 165 310 L169 200 Z" />
        </clipPath>
      </defs>

      <!-- 地面软阴影 -->
      <ellipse cx="110" cy="414" rx="92" ry="6" fill="#000" opacity="0.10" />

      <!-- ===== 三脚架 ===== -->
      <g stroke="#3a424c" stroke-width="4" stroke-linecap="round">
        <line x1="72"  y1="330" x2="52"  y2="410" />
        <line x1="148" y1="330" x2="168" y2="410" />
        <line x1="110" y1="332" x2="110" y2="406" opacity="0.55" stroke-width="3" />
      </g>
      <ellipse cx="110" cy="330" rx="52" ry="6" fill="none" stroke="#3a424c" stroke-width="4" />

      <!-- ===== 石棉网 ===== -->
      <g>
        <rect x="42" y="324" width="136" height="6" rx="2" fill="rgba(92,92,98,0.95)" stroke="rgba(40,44,50,0.6)" stroke-width="0.8" />
        <g stroke="rgba(168,168,175,0.55)" stroke-width="1">
          <line v-for="i in 16" :key="'gz' + i" :x1="46 + (i - 1) * 8.5" :y1="324" :x2="46 + (i - 1) * 8.5" :y2="330" />
        </g>
      </g>

      <!-- ===== 烧杯 ===== -->
      <!-- 杯体玻璃 -->
      <path
        d="M35 190 Q45 193 50 200 L55 310 Q56 323 70 324 L150 324 Q164 323 165 310 L170 200 Q175 193 185 190"
        fill="url(#bf-glass)"
      />
      <!-- 水（裁剪在杯内壁） -->
      <g clip-path="url(#bf-cupClip)">
        <rect x="36" y="238" width="148" height="88" fill="url(#bf-water)" />
        <ellipse cx="110" cy="238" rx="60" ry="6" fill="#dcf1fc" opacity="0.9" />
        <ellipse cx="110" cy="320" rx="46" ry="5" fill="#7fb8dc" opacity="0.4" />

        <!-- 沸腾前：小气泡升起途中变小消失 -->
        <g v-if="heating && !boiling">
          <circle class="bf-pre p1" cx="78"  cy="312" r="2.6" fill="#fff" opacity="0.85" />
          <circle class="bf-pre p2" cx="96"  cy="314" r="2.1" fill="#fff" opacity="0.85" />
          <circle class="bf-pre p3" cx="124" cy="313" r="2.8" fill="#fff" opacity="0.85" />
          <circle class="bf-pre p4" cx="140" cy="315" r="2.2" fill="#fff" opacity="0.85" />
          <circle class="bf-pre p5" cx="110" cy="316" r="1.9" fill="#fff" opacity="0.8" />
        </g>
        <!-- 沸腾时：大气泡升起变大直达水面 + 水面破裂涟漪 -->
        <g v-if="boiling">
          <circle class="bf-boil b1" cx="76"  cy="314" r="3.4" fill="rgba(255,255,255,0.9)" stroke="rgba(210,235,248,0.8)" stroke-width="1" />
          <circle class="bf-boil b2" cx="94"  cy="316" r="2.9" fill="rgba(255,255,255,0.9)" stroke="rgba(210,235,248,0.8)" stroke-width="1" />
          <circle class="bf-boil b3" cx="112" cy="313" r="3.8" fill="rgba(255,255,255,0.9)" stroke="rgba(210,235,248,0.8)" stroke-width="1" />
          <circle class="bf-boil b4" cx="130" cy="315" r="3.1" fill="rgba(255,255,255,0.9)" stroke="rgba(210,235,248,0.8)" stroke-width="1" />
          <circle class="bf-boil b5" cx="86"  cy="316" r="2.7" fill="rgba(255,255,255,0.9)" stroke="rgba(210,235,248,0.8)" stroke-width="1" />
          <circle class="bf-boil b6" cx="142" cy="314" r="3.5" fill="rgba(255,255,255,0.9)" stroke="rgba(210,235,248,0.8)" stroke-width="1" />
          <circle class="bf-boil b7" cx="102" cy="312" r="3.3" fill="rgba(255,255,255,0.9)" stroke="rgba(210,235,248,0.8)" stroke-width="1" />
          <circle class="bf-boil b8" cx="120" cy="316" r="2.8" fill="rgba(255,255,255,0.9)" stroke="rgba(210,235,248,0.8)" stroke-width="1" />
        </g>
      </g>
      <!-- 水面涟漪（沸腾时，贴水面线） -->
      <g v-if="boiling">
        <ellipse class="bf-rip r1" cx="88"  cy="238" rx="10" ry="4" fill="none" stroke="#fff" stroke-width="1.4" />
        <ellipse class="bf-rip r2" cx="118" cy="238" rx="12" ry="4.5" fill="none" stroke="#fff" stroke-width="1.4" />
        <ellipse class="bf-rip r3" cx="102" cy="239" rx="8"  ry="3.2" fill="none" stroke="#fff" stroke-width="1.2" />
      </g>
      <!-- 杯壁描边 + 杯口（椭圆与杯身同宽，两端落在杯壁顶点） -->
      <path
        d="M35 190 Q45 193 50 200 L55 310 Q56 323 70 324 L150 324 Q164 323 165 310 L170 200 Q175 193 185 190"
        fill="none" stroke="#5f7588" stroke-width="2" stroke-linecap="round"
      />
      <ellipse cx="110" cy="190" rx="75" ry="7.5" fill="rgba(255,255,255,0.35)" stroke="#5f7588" stroke-width="2" />
      <ellipse cx="110" cy="190" rx="68" ry="5.6" fill="none" stroke="#8ba1b3" stroke-width="1" />
      <path d="M52 210 Q50 260 58 306" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity="0.5" />
      <!-- 杯口白汽 -->
      <g v-if="boiling" stroke="#aab8c4" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.85">
        <path class="bf-steam d1" d="M64 182 q 5 -7 0 -13 q -5 -6 0 -13" />
        <path class="bf-steam d2" d="M156 182 q 5 -7 0 -13 q -5 -6 0 -13" />
        <path class="bf-steam d3" d="M110 178 q 4 -6 0 -12 q -4 -6 0 -12" />
      </g>

      <!-- ===== 温度计（挂杯内右侧，顶部露出杯口） ===== -->
      <g>
        <!-- 玻璃管 -->
        <rect x="144" y="138" width="9" height="168" rx="4.5" fill="rgba(255,255,255,0.55)" stroke="rgba(70,82,102,0.75)" stroke-width="1.4" />
        <!-- 球泡 -->
        <circle cx="148.5" cy="309" r="6" fill="rgba(255,255,255,0.55)" stroke="rgba(70,82,102,0.75)" stroke-width="1.4" />
        <!-- 红色液柱（高度随温度实时变化） -->
        <rect x="147.2" :y="thLevel" width="2.6" :height="TH_BOT - thLevel + 4" rx="1.3" fill="#e0584f" />
        <circle cx="148.5" cy="309" r="3.4" fill="#e0584f" />
        <!-- 刻度 -->
        <g stroke="rgba(70,82,102,0.6)" stroke-width="1">
          <line v-for="T in [20, 40, 60, 80, 100]" :key="'tk' + T"
            x1="153" :y1="TH_BOT - (TH_BOT - TH_TOP) * ((T - T_MIN) / (T_MAX - T_MIN))" x2="157" :y2="TH_BOT - (TH_BOT - TH_TOP) * ((T - T_MIN) / (T_MAX - T_MIN))" />
        </g>
        <!-- 实时读数 -->
        <text x="157" y="134" font-size="13" font-weight="800" fill="#e0584f" font-family="ui-monospace, Menlo, monospace">{{ (temp ?? 20).toFixed(0) }}℃</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.bf-rig-main { outline: none; }
.bf-rig-main.is-hover svg { filter: drop-shadow(0 0 2px rgba(255, 207, 51, 0.9)); }
</style>
