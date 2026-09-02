<script setup>
/*
 * BoilZoom —— e-boil 放大观察内容（纯内联 SVG），结构对齐 SubZoom：
 * 烧杯内部放大视图：加热点产生气泡。
 * 沸腾前：气泡上升途中变小消失；沸腾时：气泡上升变大、到水面破裂（涟漪）。
 * viewBox 120×170：水底 152，水面 34。
 */
import { computed } from 'vue'

const props = defineProps({
  heating: Boolean,
  boiling: Boolean,
})

const WBOT = 150
const WSURF = 34
</script>

<template>
  <svg viewBox="0 0 120 170" width="120" height="170" xmlns="http://www.w3.org/2000/svg" aria-label="烧杯内部放大">
    <defs>
      <linearGradient id="bz-water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#c8e9fb" stop-opacity="0.95" />
        <stop offset="1" stop-color="#8cc7ea" stop-opacity="0.97" />
      </linearGradient>
      <clipPath id="bz-clip">
        <rect x="16" y="26" width="88" height="134" rx="8" />
      </clipPath>
    </defs>

    <!-- 水 -->
    <g clip-path="url(#bz-clip)">
      <rect x="14" y="34" width="92" height="128" fill="url(#bz-water)" />
      <path d="M18 34 L102 34" stroke="#f2fbff" stroke-width="2" opacity="0.9" />

      <!-- 沸腾前：小气泡中途变小消失 -->
      <g v-if="heating && !boiling">
        <circle class="bf-pre p1" cx="42" cy="144" r="3.4" fill="#fff" opacity="0.85" />
        <circle class="bf-pre p2" cx="60" cy="148" r="2.8" fill="#fff" opacity="0.85" />
        <circle class="bf-pre p3" cx="78" cy="145" r="3.6" fill="#fff" opacity="0.85" />
        <circle class="bf-pre p5" cx="52" cy="150" r="2.4" fill="#fff" opacity="0.8" />
      </g>
      <!-- 沸腾时：大气泡上升变大到水面破裂 + 涟漪 -->
      <g v-if="boiling">
        <circle class="bf-boil b1" cx="40" cy="146" r="4"   fill="rgba(255,255,255,0.9)" stroke="rgba(210,235,248,0.8)" stroke-width="1.2" />
        <circle class="bf-boil b2" cx="58" cy="148" r="3.4" fill="rgba(255,255,255,0.9)" stroke="rgba(210,235,248,0.8)" stroke-width="1.2" />
        <circle class="bf-boil b3" cx="76" cy="145" r="4.4" fill="rgba(255,255,255,0.9)" stroke="rgba(210,235,248,0.8)" stroke-width="1.2" />
        <circle class="bf-boil b4" cx="88" cy="147" r="3.6" fill="rgba(255,255,255,0.9)" stroke="rgba(210,235,248,0.8)" stroke-width="1.2" />
        <circle class="bf-boil b7" cx="50" cy="143" r="3.8" fill="rgba(255,255,255,0.9)" stroke="rgba(210,235,248,0.8)" stroke-width="1.2" />
      </g>
    </g>

    <!-- 水面涟漪（沸腾时） -->
    <g v-if="boiling">
      <ellipse class="bf-rip r1" cx="46" cy="34" rx="11" ry="4" fill="none" stroke="#fff" stroke-width="1.6" />
      <ellipse class="bf-rip r2" cx="72" cy="34" rx="13" ry="4.5" fill="none" stroke="#fff" stroke-width="1.6" />
    </g>

    <!-- 杯壁轮廓 -->
    <rect x="16" y="26" width="88" height="134" rx="8" fill="none" stroke="#5f7588" stroke-width="2" />
  </svg>
</template>
