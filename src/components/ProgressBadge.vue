<script setup>
defineProps({
  record: { type: Object, default: null }
})
</script>

<template>
  <span v-if="record && record.completed" class="status" style="color:var(--success);font-weight:600">✓ 已通过</span>
  <span v-else-if="record && record.attempts" class="status">已答题 {{ record.attempts }} 次</span>
  <span v-else class="status">未开始</span>
</template>