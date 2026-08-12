<script setup>
import { computed, onMounted } from 'vue'
import { useProgressStore } from './stores/progress'
import { GRADES } from './data/experiments'
import SideNav from './components/SideNav.vue'

const progress = useProgressStore()
onMounted(() => {
  progress.startSession()
})

const totalExps = computed(() =>
  GRADES.reduce((s, g) => s + g.chapters.reduce((x, c) => x + c.experiments.length, 0), 0)
)
const totalChapters = computed(() => GRADES.reduce((s, g) => s + g.chapters.length, 0))
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-block">
        <div class="brand-mark" aria-hidden="true"></div>
        <div class="brand-text">
          <p class="eyebrow">人教版初中物理</p>
          <h1>物理实验平台</h1>
        </div>
        <RouterLink to="/record" class="progress-chip">⑤ 已通过 {{ progress.completedCount }} 个实验</RouterLink>
      </div>

      <div class="source-strip">
        <div>
          <span>年级册次</span>
          <strong>{{ GRADES.length }} 册</strong>
        </div>
        <div>
          <span>章节</span>
          <strong>{{ totalChapters }} 章</strong>
        </div>
        <div>
          <span>实验</span>
          <strong>{{ totalExps }} 个</strong>
        </div>
        <RouterLink to="/record" class="strip-link">
          <span>答题正确率</span>
          <strong>{{ progress.accuracy }}%</strong>
        </RouterLink>
      </div>
    </header>

    <div class="workspace">
      <SideNav />
      <main class="main-grid">
        <RouterView />
      </main>
    </div>

    <footer class="app-footer">人教版初中物理同步实验 · 学生自主学习平台</footer>
  </div>
</template>
