<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { GRADES, findExperiment } from '../data/experiments'
import { useProgressStore } from '../stores/progress'

const route = useRoute()
const progress = useProgressStore()

const openGrades = ref(new Set())
const openChapters = ref(new Set())

function totalCount() {
  return GRADES.reduce(
    (s, g) => s + g.chapters.reduce((x, c) => x + c.experiments.length, 0),
    0
  )
}

function locateGradeOfChapter(chapterId) {
  for (const g of GRADES) {
    if (g.chapters.some((c) => c.id === chapterId)) return g.grade
  }
  return null
}

function syncOpen() {
  const id = route.params.id
  const hit = id ? findExperiment(id) : null
  if (hit) {
    openGrades.value.add(hit.grade.grade)
    openChapters.value.add(hit.chapter.id)
  } else {
    openGrades.value.add(GRADES[0].grade)
    openChapters.value.add(GRADES[0].chapters[0].id)
  }
  openGrades.value = new Set(openGrades.value)
  openChapters.value = new Set(openChapters.value)
}

function toggleGrade(gradeId) {
  const s = new Set(openGrades.value)
  s.has(gradeId) ? s.delete(gradeId) : s.add(gradeId)
  openGrades.value = s
}

function toggleChapter(chapterId) {
  const s = new Set(openChapters.value)
  s.has(chapterId) ? s.delete(chapterId) : s.add(chapterId)
  openChapters.value = s
}

function isActive(expId) {
  return route.params.id === expId
}

function isDone(expId) {
  return !!(progress.records[expId] && progress.records[expId].completed)
}

watch(
  () => route.params.id,
  () => syncOpen()
)

onMounted(syncOpen)
</script>

<template>
  <nav class="side-nav" aria-label="实验导航">
    <div class="side-nav-head">
      <strong>实验目录</strong>
      <span class="meta-label">共 {{ totalCount() }} 个实验</span>
    </div>

    <div v-for="(g, gi) in GRADES" :key="g.grade" class="nav-module">
      <button class="nav-module-btn" :class="{ open: openGrades.has(g.grade) }" @click="toggleGrade(g.grade)">
        <span class="rail-index">{{ String(gi + 1).padStart(2, '0') }}</span>
        <span class="nav-module-label">{{ g.label }}</span>
        <span class="nav-caret">{{ openGrades.has(g.grade) ? '−' : '+' }}</span>
      </button>

      <div v-if="openGrades.has(g.grade)" class="nav-chapters">
        <div v-for="c in g.chapters" :key="c.id">
          <button class="nav-chapter-btn" :class="{ open: openChapters.has(c.id) }" @click="toggleChapter(c.id)">
            <span class="nav-chapter-label">{{ c.title }}</span>
            <span class="nav-caret">{{ openChapters.has(c.id) ? '−' : '+' }}</span>
          </button>

          <div v-if="openChapters.has(c.id)" class="nav-exps">
            <RouterLink
              v-for="e in c.experiments"
              :key="e.id"
              :to="`/experiment/${e.id}`"
              class="nav-exp"
              :class="{ active: isActive(e.id) }"
            >
              <span class="nav-exp-state">{{ isDone(e.id) ? '✓' : '' }}</span>
              <span class="nav-exp-title">{{ e.title }}</span>
            </RouterLink>
          </div>
        </div>
      </div>
    </div>

    <div class="side-nav-foot">
      <RouterLink to="/" class="side-nav-link" :class="{ 'router-link-active': route.path === '/' }">首页</RouterLink>
      <RouterLink to="/record" class="side-nav-link" :class="{ 'router-link-active': route.path === '/record' }">学习记录</RouterLink>
    </div>
  </nav>
</template>
