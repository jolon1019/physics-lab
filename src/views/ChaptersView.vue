<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { GRADES } from '../data/experiments'
import { useProgressStore } from '../stores/progress'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const progress = useProgressStore()
const auth = useAuthStore()

const grade = computed(() => GRADES.find((g) => g.grade === route.params.grade) || GRADES[0])

function progressOf(expId) {
  return progress.records[expId] || null
}
</script>

<template>
  <RouterLink to="/" style="color:var(--accent);font-size:14px">← 返回首页</RouterLink>

  <h2 class="page-title">{{ grade.label }}</h2>
  <p class="page-sub">选择任一实验，进入实验学习</p>

  <div class="exp-grid">
    <template v-for="e in grade.experiments" :key="e.id">
      <!-- 会员专享且无权限：卡片可见但不可点击 -->
      <div v-if="auth.isLocked(e.id)" class="card exp-item locked" title="会员专享实验，开通会员后可用">
        <div class="exp-body">
          <h3>{{ e.title }} <span class="lock-chip">会员</span></h3>
          <p>{{ e.type }}实验 · {{ e.level }}</p>
        </div>
        <div class="exp-right">
          <ProgressBadge :record="progressOf(e.id)" />
        </div>
      </div>
      <RouterLink
        v-else
        :to="`/experiment/${e.id}`"
        class="card exp-item"
      >
        <div class="exp-body">
          <h3>{{ e.title }}</h3>
          <p>{{ e.type }}实验 · {{ e.level }}</p>
        </div>
        <div class="exp-right">
          <ProgressBadge :record="progressOf(e.id)" />
        </div>
      </RouterLink>
    </template>
  </div>
</template>

<style scoped>
.exp-item.locked {
  cursor: not-allowed;
  opacity: 0.6;
}
.lock-chip {
  font-size: 11px;
  font-weight: 800;
  padding: 1px 8px;
  border-radius: 9px;
  background: var(--accent-soft, #ffe9a8);
  color: var(--accent-strong, #b8860b);
  vertical-align: middle;
  white-space: nowrap;
}
</style>
