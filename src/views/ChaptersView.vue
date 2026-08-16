<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { GRADES, findExperiment } from '../data/experiments'
import { useProgressStore } from '../stores/progress'

const route = useRoute()
const progress = useProgressStore()

const grade = computed(() => GRADES.find((g) => g.grade === route.params.grade) || GRADES[0])

function progressOf(expId) {
  return progress.records[expId] || null
}
function findBadge(expId) {
  return findExperiment(expId)
}
</script>

<template>
  <RouterLink to="/" style="color:var(--accent);font-size:14px">← 返回首页</RouterLink>

  <h2 class="page-title">{{ grade.label }}</h2>
  <p class="page-sub">选择任一章节，进入实验学习</p>

  <div v-for="c in grade.chapters" :key="c.id" class="grade-section">
    <h3 class="grade-title" style="font-size:18px">{{ c.title }}</h3>
    <div class="exp-grid">
      <RouterLink
        v-for="e in c.experiments"
        :key="e.id"
        :to="`/experiment/${e.id}`"
        class="card exp-item"
      >
        <div class="exp-body">
          <h3>{{ e.title }}</h3>
          <p>第 {{ grade.chapters.findIndex(x => x.id === c.id) + 1 }} 章 · {{ e.type }}实验 · {{ e.level }}</p>
        </div>
        <div class="exp-right">
          <ProgressBadge :record="progressOf(e.id)" :exp="e" :grade="grade" :chapter="c" />
        </div>
      </RouterLink>
    </div>
  </div>
</template>