<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  label: { type: String, default: '' },
  unit: { type: String, default: '' },
  hint: { type: String, default: '' },
  precision: { type: Number, default: 2 }
})

const emit = defineEmits(['update:modelValue'])

const display = computed(() => props.modelValue.toFixed(props.precision) + props.unit)

function onChange(e) {
  emit('update:modelValue', Number(e.target.value))
}
</script>

<template>
  <div style="padding:12px 14px">
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:13px;font-weight:600;color:var(--text-h)">{{ label }}</span>
      <span style="font-size:14px;font-weight:700;color:var(--accent);font-family:var(--mono)">{{ display }}</span>
    </div>
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      @input="onChange"
      style="width:100%;accent-color:var(--accent);cursor:pointer"
    />
    <p v-if="hint" style="font-size:11px;color:var(--text-dim);margin-top:4px">{{ hint }}</p>
  </div>
</template>