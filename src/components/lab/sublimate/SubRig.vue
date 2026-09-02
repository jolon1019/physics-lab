<script setup>
/*
 * SubRig —— e-sublimate 装置主体（纯内联 SVG，零网络请求），结构与画风对齐 MeltFlask：
 * 热水浴模式：玻璃烧杯（渐变水 + 对流气泡 + 杯口白汽）+ 浸入水中的密封玻璃管（碘锤）
 * 直火模式：烧杯隐藏，铁架台夹持碘锤，下方由 MeltBurner 酒精灯火焰舔管底
 * 视觉状态由连续量驱动：subFrac（固态碘剩余 0..1，颗粒渐消渐少）、
 * liquidFrac（直火熔化液层 0..1）、vapor（紫色碘蒸气上升）、condensed（管顶凝华沉积）。
 * 坐标约定：w = 内容宽（映射 viewBox 220），baseline = 底部 y（落地点）。
 * viewBox 几何：baseline 410；管底 318（浸水/火焰舔底）；管顶塞 24；杯口 270，水面 300。
 */
import { computed, ref } from 'vue'

const props = defineProps({
  x: Number,
  baseline: Number,
  w: Number,
  mode: { type: String, default: 'bath' },   // bath 热水浴 | flame 酒精灯直火
  hot: Boolean,                              // 加热中（气泡 / 白汽 / 晶体微颤）
  subFrac: { type: Number, default: 1 },     // 0..1 固态碘剩余比例
  liquidFrac: { type: Number, default: 0 },  // 0..1 直火熔化液层
  vapor: Boolean,                            // 紫色碘蒸气上升中
  condensed: Boolean,                        // 管顶凝华沉积（实验完成且水浴）
})
const hover = ref(false)

const VBW = 220, VBH = 420
// 管内几何（viewBox 单位）：内底 314，内半宽 20，堆满高 34
const TUBE_BOT = 314
const PILE_H = 34

// 碘晶体：种子随机的固定散布（模块级生成一次，渲染稳定）
const GRAINS = (() => {
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const arr = []
  for (let layer = 0; layer < 5; layer++) {
    const n = 3 + layer * 2
    for (let i = 0; i < n; i++) {
      arr.push({
        fx: (i + 0.5 + (rnd() - 0.5) * 0.5) / n,
        fy: Math.min(layer / 5 + rnd() * 0.12, 0.95),
        r: 2.2 + rnd() * 1.3,
      })
    }
  }
  return arr
})()

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

const isBath = computed(() => props.mode === 'bath')
const f = computed(() => Math.max(0, Math.min(1, 1 - (props.subFrac || 0))))  // 已升华比例
const pileH = computed(() => PILE_H * (1 - f.value))
const liqH = computed(() => 22 * Math.max(0, Math.min(1, props.liquidFrac || 0)))

// 颗粒按 fy（0=堆顶）从上往下逐渐升华消失
function grainOpacity(g) {
  return Math.max(0, Math.min(1, (g.fy - f.value) * 4 + 0.15))
}
</script>

<template>
  <div
    class="sub-piece sub-rig-main"
    :class="{ 'is-hover': hover }"
    :style="posStyle"
    @pointerenter="hover = true"
    @pointerleave="hover = false"
  >
    <svg :viewBox="`0 0 ${VBW} ${VBH}`" :width="size.w" :height="size.h" xmlns="http://www.w3.org/2000/svg" aria-label="碘升华装置">
      <defs>
        <linearGradient id="sv-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(255,255,255,0.50)" />
          <stop offset="1" stop-color="rgba(222,235,244,0.14)" />
        </linearGradient>
        <linearGradient id="sv-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#c8e9fb" stop-opacity="0.94" />
          <stop offset="1" stop-color="#8cc7ea" stop-opacity="0.96" />
        </linearGradient>
        <radialGradient id="sv-grain" cx="0.35" cy="0.3" r="0.9">
          <stop offset="0" stop-color="#9a6ad0" />
          <stop offset="1" stop-color="#5b2f8a" />
        </radialGradient>
        <linearGradient id="sv-iron" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#4d5560" />
          <stop offset="1" stop-color="#2b313a" />
        </linearGradient>
        <radialGradient id="sv-vaporFill" cx="0.4" cy="0.35" r="0.9">
          <stop offset="0" stop-color="rgba(200,150,240,0.95)" />
          <stop offset="1" stop-color="rgba(120,60,170,0.25)" />
        </radialGradient>
        <clipPath id="sv-bathClip">
          <path d="M51 280 L55 390 Q56 403 70 404 L150 404 Q164 403 165 390 L169 280 Z" />
        </clipPath>
        <clipPath id="sv-tubeClip">
          <path d="M87 40 L87 308 Q87 318 110 318 Q133 318 133 308 L133 40 Z" />
        </clipPath>
      </defs>

      <!-- 地面软阴影 -->
      <ellipse cx="110" cy="414" rx="92" ry="6" fill="#000" opacity="0.10" />

      <!-- ===== 铁架台（仅直火模式，底座 + 立杆 + 横臂） ===== -->
      <g v-if="!isBath">
        <rect x="162" y="398" width="54" height="11" rx="3" fill="url(#sv-iron)" stroke="#20242a" stroke-width="1" />
        <rect x="184" y="64" width="7" height="336" rx="2.5" fill="url(#sv-iron)" stroke="#20242a" stroke-width="0.8" />
        <rect x="130" y="80" width="55" height="6" rx="2.5" fill="url(#sv-iron)" stroke="#20242a" stroke-width="0.8" />
      </g>

      <!-- ===== 烧杯（仅热水浴模式） ===== -->
      <g v-if="isBath">
        <!-- 杯体玻璃 -->
        <path
          d="M35 270 Q45 273 50 280 L55 390 Q56 403 70 404 L150 404 Q164 403 165 390 L170 280 Q175 273 185 270"
          fill="url(#sv-glass)"
        />
        <!-- 水（半透明，可透视管中碘） -->
        <g clip-path="url(#sv-bathClip)">
          <rect x="36" y="300" width="148" height="106" fill="url(#sv-water)" />
          <ellipse cx="110" cy="300" rx="60" ry="6.5" fill="#dcf1fc" opacity="0.9" />
          <path d="M54 299 Q110 293 166 299" fill="none" stroke="#f2fbff" stroke-width="1.6" opacity="0.9" />
          <ellipse cx="110" cy="400" rx="46" ry="5" fill="#7fb8dc" opacity="0.4" />
          <!-- 加热对流气泡（在管后方升起） -->
          <g v-if="hot">
            <circle class="sv-bubble b1" cx="58"  cy="396" r="2.6" fill="#fff" opacity="0.85" />
            <circle class="sv-bubble b2" cx="68"  cy="398" r="1.9" fill="#fff" opacity="0.85" />
            <circle class="sv-bubble b3" cx="152" cy="395" r="2.9" fill="#fff" opacity="0.85" />
            <circle class="sv-bubble b4" cx="162" cy="397" r="2.1" fill="#fff" opacity="0.85" />
            <circle class="sv-bubble b5" cx="63"  cy="399" r="1.5" fill="#fff" opacity="0.8" />
            <circle class="sv-bubble b6" cx="157" cy="399" r="1.6" fill="#fff" opacity="0.8" />
          </g>
        </g>
        <!-- 杯壁描边 + 杯口 -->
        <path
          d="M35 270 Q45 273 50 280 L55 390 Q56 403 70 404 L150 404 Q164 403 165 390 L170 280 Q175 273 185 270"
          fill="none" stroke="#5f7588" stroke-width="2" stroke-linecap="round"
        />
        <ellipse cx="110" cy="270" rx="75" ry="7.5" fill="rgba(255,255,255,0.35)" stroke="#5f7588" stroke-width="2" />
        <ellipse cx="110" cy="270" rx="68" ry="5.6" fill="none" stroke="#8ba1b3" stroke-width="1" />
        <path d="M52 290 Q50 340 58 388" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity="0.5" />
        <!-- 杯口白汽 -->
        <g v-if="hot" stroke="#aab8c4" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.85">
          <path class="sv-steam d1" d="M64 262 q 5 -7 0 -13 q -5 -6 0 -13" />
          <path class="sv-steam d2" d="M156 262 q 5 -7 0 -13 q -5 -6 0 -13" />
          <path class="sv-steam d3" d="M110 258 q 4 -6 0 -12 q -4 -6 0 -12" />
        </g>
      </g>

      <!-- ===== 密封玻璃管（碘锤） ===== -->
      <!-- 管身玻璃（半透明，水浴时透出后方水色） -->
      <path
        d="M87 40 L87 308 Q87 318 110 318 Q133 318 133 308 L133 40"
        fill="rgba(240,247,252,0.30)"
      />
      <!-- 管内内容（clip） -->
      <g clip-path="url(#sv-tubeClip)">
        <!-- 固态碘晶体堆（随升华渐消渐少，受热微颤） -->
        <g v-if="pileH > 1.5" class="sv-grains" :class="{ 'is-hot': hot }">
          <rect
            v-for="(g, i) in GRAINS" :key="'g' + i"
            :x="110 + (g.fx - 0.5) * 32 - g.r" :y="(TUBE_BOT - pileH + g.fy * pileH) - g.r"
            :width="g.r * 2" :height="g.r * 2"
            :opacity="grainOpacity(g)"
            fill="url(#sv-grain)"
            :transform="`rotate(45 ${110 + (g.fx - 0.5) * 32} ${TUBE_BOT - pileH + g.fy * pileH})`"
          />
        </g>
        <!-- 直火：底部液态碘（已熔化，紫红） -->
        <g v-if="!isBath && liqH > 0.8">
          <rect x="88" :y="TUBE_BOT - liqH" width="44" :height="liqH + 4" fill="rgba(150,60,160,0.85)" />
          <path d="M90 314.5 L130 314.5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" />
        </g>
        <!-- 紫色碘蒸气上升 -->
        <g v-if="vapor">
          <circle class="sv-vapor v1" cx="98"  cy="300" r="3.2" fill="url(#sv-vaporFill)" />
          <circle class="sv-vapor v2" cx="120" cy="306" r="2.6" fill="url(#sv-vaporFill)" />
          <circle class="sv-vapor v3" cx="106" cy="296" r="3.6" fill="url(#sv-vaporFill)" />
          <circle class="sv-vapor v4" cx="126" cy="302" r="2.9" fill="url(#sv-vaporFill)" />
          <circle class="sv-vapor v5" cx="94"  cy="304" r="2.4" fill="url(#sv-vaporFill)" />
          <circle class="sv-vapor v6" cx="112" cy="298" r="3.1" fill="url(#sv-vaporFill)" />
          <circle class="sv-vapor v7" cx="122" cy="294" r="2.5" fill="url(#sv-vaporFill)" />
          <circle class="sv-vapor v8" cx="100" cy="307" r="3.4" fill="url(#sv-vaporFill)" />
        </g>
        <!-- 管顶凝华沉积（紫黑晶体带） -->
        <g v-if="condensed">
          <rect x="87" y="42" width="46" height="13" fill="rgba(107,63,160,0.92)" />
          <rect
            v-for="i in 6" :key="'c' + i"
            :x="94 + (i - 1) * 6.4 - 2.2" :y="58 - 2.2" width="4.4" height="4.4"
            fill="url(#sv-grain)" :transform="`rotate(45 ${94 + (i - 1) * 6.4} 58)`"
          />
        </g>
      </g>
      <!-- 管身描边 + 高光 -->
      <path
        d="M87 40 L87 308 Q87 318 110 318 Q133 318 133 308 L133 40"
        fill="none" stroke="#5f7588" stroke-width="1.8" stroke-linecap="round"
      />
      <path d="M92 50 L92 300" stroke="#fff" stroke-opacity="0.5" stroke-width="1.8" fill="none" stroke-linecap="round" />

      <!-- 夹爪（直火模式，夹持管口下方） -->
      <g v-if="!isBath">
        <rect x="124" y="74" width="12" height="26" rx="3" fill="#4d5560" stroke="#20242a" stroke-width="1" />
        <circle cx="138" cy="86" r="4" fill="#59636f" stroke="#20242a" stroke-width="1" />
      </g>

      <!-- 顶部密封橡胶塞 -->
      <g>
        <rect x="81" y="24" width="58" height="17" rx="5" fill="#8a5a2b" stroke="rgba(60,40,20,0.6)" stroke-width="1.4" />
        <g stroke="rgba(60,40,20,0.35)" stroke-width="1">
          <line v-for="i in 7" :key="'s' + i" :x1="81 + i * 7" :y1="27" :x2="81 + i * 7" :y2="38" />
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.sub-rig-main { outline: none; }
.sub-rig-main.is-hover svg { filter: drop-shadow(0 0 2px rgba(255, 207, 51, 0.9)); }
</style>
