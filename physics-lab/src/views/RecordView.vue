<script setup>
import { computed } from 'vue'
import { useProgressStore } from '../stores/progress'

const progress = useProgressStore()

const summary = computed(() => {
  const all = Object.entries(progress.records).map(([id, r]) => ({ id, ...r }))
  const weakExpIds = all
    .filter((r) => r.attempts > 0 && r.correct / r.attempts < 0.6)
    .map((r) => r.id)
  return { all, weakExpIds }
})
</script>

<template>
  <h2 class="page-title">学习记录</h2>
  <p class="page-sub">你的学习轨迹与薄弱环节</p>

  <section class="stats-grid">
    <div class="card stat-card">
      <div class="num">{{ progress.completedCount }}</div>
      <div class="label">已通过实验</div>
    </div>
    <div class="card stat-card">
      <div class="num">{{ progress.accuracy }}%</div>
      <div class="label">答题正确率</div>
    </div>
    <div class="card stat-card">
      <div class="num">{{ summary.weakExpIds.length }}</div>
      <div class="label">薄弱实验</div>
    </div>
    <div class="card stat-card">
      <div class="num">{{ progress.sessions }}</div>
      <div class="label">累计进入次数</div>
    </div>
  </section>

  <section class="card" style="padding:20px;margin-bottom:24px">
    <h3 style="margin-bottom:12px">薄弱实验（正确率 &lt; 60%）</h3>
    <div v-if="summary.weakExpIds.length" class="exp-grid">
      <RouterLink
        v-for="id in summary.weakExpIds"
        :key="id"
        :to="`/experiment/${id}`"
        class="card exp-item"
      >
        <div class="exp-icon">⭐</div>
        <div class="exp-body"><h3 style="font-size:15px">实验 {{ id }}</h3></div>
        <div class="exp-right"><span class="btn btn-sm">去巩固</span></div>
      </RouterLink>
    </div>
    <p v-else class="empty">暂无薄弱实验，继续保持！</p>
  </section>

  <section class="card" style="padding:20px">
    <h3 style="margin-bottom:12px">做题记录</h3>
    <div v-if="summary.all.length" class="exp-grid">
      <div v-for="r in summary.all" :key="r.id" class="card exp-item">
        <div class="exp-icon">{{ r.completed ? '✅' : '📝' }}</div>
        <div class="exp-body">
          <h3 style="font-size:15px">实验 {{ r.id }}</h3>
          <p>答题 {{ r.attempts }} 次，正确 {{ r.correct }} 次 · {{ r.latest }}</p>
        </div>
        <div class="exp-right">
          <span class="btn btn-sm">{{ r.completed ? '已通过' : '进行中' }}</span>
        </div>
      </div>
    </div>
    <p v-else class="empty">还没有做题记录，快去学一个实验吧</p>
  </section>
</template>