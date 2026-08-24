<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { GRADES, findExperiment } from '../data/experiments'
import { useProgressStore } from '../stores/progress'
import { useLayoutStore } from '../stores/layout'

const route = useRoute()
const progress = useProgressStore()
const layout = useLayoutStore()

const openGrades = ref(new Set())

function totalCount() {
  return GRADES.reduce((s, g) => s + g.experiments.length, 0)
}

function syncOpen() {
  const id = route.params.id
  const hit = id ? findExperiment(id) : null
  if (hit) {
    openGrades.value.add(hit.grade.grade)
  } else {
    openGrades.value.add(GRADES[0].grade)
  }
  openGrades.value = new Set(openGrades.value)
}

function toggleGrade(gradeId) {
  const s = new Set(openGrades.value)
  s.has(gradeId) ? s.delete(gradeId) : s.add(gradeId)
  openGrades.value = s
}

// 折叠态下点击年级序号：展开目录并定位到该年级
function expandTo(g) {
  layout.setNav(false)
  if (!openGrades.value.has(g.grade)) toggleGrade(g.grade)
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
  <nav class="side-nav" :class="{ 'is-rail': layout.navCollapsed }" aria-label="实验导航">
    <div class="side-nav-head">
      <template v-if="!layout.navCollapsed">
        <strong>实验目录</strong>
        <span class="meta-label">共 {{ totalCount() }} 个实验</span>
      </template>
      <button
        class="nav-toggle"
        :aria-expanded="!layout.navCollapsed"
        :aria-label="layout.navCollapsed ? '展开实验目录' : '收起实验目录'"
        :title="layout.navCollapsed ? '展开目录' : '收起目录'"
        @click="layout.toggleNav()"
      >
        <span class="nav-toggle-icon">{{ layout.navCollapsed ? '»' : '«' }}</span>
      </button>
    </div>

    <!-- 展开态：完整目录树 -->
    <template v-if="!layout.navCollapsed">
      <div v-for="(g, gi) in GRADES" :key="g.grade" class="nav-module">
        <button class="nav-module-btn" :class="{ open: openGrades.has(g.grade) }" @click="toggleGrade(g.grade)">
          <span class="rail-index">{{ String(gi + 1).padStart(2, '0') }}</span>
          <span class="nav-module-label">{{ g.label }}</span>
          <span class="nav-caret">{{ openGrades.has(g.grade) ? '−' : '+' }}</span>
        </button>

        <div v-if="openGrades.has(g.grade)" class="nav-exps">
          <RouterLink
            v-for="e in g.experiments"
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

      <div class="side-nav-foot">
        <RouterLink to="/" class="side-nav-link" :class="{ 'router-link-active': route.path === '/' }">首页</RouterLink>
        <RouterLink to="/record" class="side-nav-link" :class="{ 'router-link-active': route.path === '/record' }">学习记录</RouterLink>
      </div>
    </template>

    <!-- 折叠态：仅保留年级序号的窄轨快捷入口 -->
    <template v-else>
      <div class="rail-grades">
        <button
          v-for="(g, gi) in GRADES"
          :key="g.grade"
          class="rail-grade"
          :title="g.label"
          :aria-label="g.label"
          @click="expandTo(g)"
        >
          <span class="rail-index">{{ String(gi + 1).padStart(2, '0') }}</span>
        </button>
      </div>
    </template>
  </nav>
</template>
