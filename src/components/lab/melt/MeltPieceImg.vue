<script setup>
/*
 * MeltPieceImg —— e-melt 装置的 PNG 图片容器。
 * 用法与 MeltLamp/MeltBeaker/MeltTube 一样：传入 (x, baseline, w) + opaque-bbox meta，
 * 内部按 placeAsset 公式换算成 400×400 frame 的 left/top/width，居中、底边对齐 baseline。
 * 透明 padding 由 <img> 的 alpha 通道自然透出画板，无白色边框。
 * 转发原生 pointerdown 给父级 onPiecePointerDown，沿用现有编辑器的拖动/滚轮/方向键。
 */
import { computed, ref } from 'vue'

const props = defineProps({
  src:     { type: String, required: true },
  // [opaqueBotY, opaqueW, opaqueH] —— 源 400×400 帧内不透明 bbox
  meta:    { type: Array,  required: true },
  x:       Number,
  baseline:Number,
  w:       Number,
  selected:Boolean,
  editMode:Boolean,
  alt:     { type: String, default: '' },
})
const emit = defineEmits(['pointerdown'])
const hover = ref(false)

// 目标内容宽 = props.w；opaqueW = meta[1]；scale = w / opaqueW
const scale = computed(() => props.w / props.meta[1])
// 整张 400×400 帧的绘制边长（方帧）
const frame = computed(() => 400 * scale.value)
// 不透明内容的底部贴 baseline ⇒ frame 顶 y = baseline - opaqueBotY*scale
const left = computed(() => props.x - frame.value / 2)
const top  = computed(() => props.baseline - props.meta[0] * scale.value)

const style = computed(() => ({
  position: 'absolute',
  left:   left.value  + 'px',
  top:    top.value   + 'px',
  width:  frame.value + 'px',
  height: frame.value + 'px',
}))

function onDown(e) { emit('pointerdown', e) }
</script>

<template>
  <div
    class="melt-piece is-img"
    :data-edit-mode="editMode ? 'true' : 'false'"
    :class="{ 'is-selected': selected, 'is-hover': hover && editMode }"
    :style="style"
    @pointerdown="onDown"
    @pointerenter="hover = true"
    @pointerleave="hover = false"
  >
    <img :src="src" :alt="alt" draggable="false" />
  </div>
</template>

<style scoped>
.melt-piece.is-img { outline: none; }
.melt-piece.is-img img {
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;     /* 让 wrapper 收 pointerdown，避免 img 吞事件 */
  user-select: none;
  -webkit-user-drag: none;
}
</style>
