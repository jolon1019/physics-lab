<script setup>
import { GRADES } from '../data/experiments'
import { useProgressStore } from '../stores/progress'

const progress = useProgressStore()
const gradeLinks = { grade8a: '/chapters/grade8a', grade8b: '/chapters/grade8b', grade9: '/chapters/grade9' }
</script>

<template>
  <section style="background:var(--accent-bg);border:1px solid var(--accent-border);border-radius:16px;padding:32px;margin-bottom:32px">
    <h1 style="font-size:28px">同步课本的物理实验，自主探究练起来</h1>
    <p style="margin-top:8px;color:var(--text)">覆盖人教版八、九年级全部实验 · 仿真操作 + 巩固练习 + 学习记录</p>
  </section>

  <section class="stats-grid">
    <div class="card stat-card">
      <div class="num">{{ GRADES.length }}</div>
      <div class="label">年级册次</div>
    </div>
    <div class="card stat-card">
      <div class="num">{{ GRADES.reduce((s, g) => s + g.chapters.length, 0) }}</div>
      <div class="label">章节实验</div>
    </div>
    <div class="card stat-card">
      <div class="num">{{ GRADES.reduce((s, g) => s + g.chapters.reduce((x, c) => x + c.experiments.length, 0), 0) }}</div>
      <div class="label">已完成 {{ progress.completedCount }} 个</div>
    </div>
    <div class="card stat-card">
      <div class="num">{{ progress.accuracy }}%</div>
      <div class="label">答题正确率</div>
    </div>
  </section>

  <div v-for="grade in GRADES" :key="grade.grade" class="grade-section">
    <h2 class="grade-title">{{ grade.label }}</h2>
    <p class="grade-sub">共 {{ grade.chapters.length }} 章，{{ grade.chapters.reduce((s, c) => s + c.experiments.length, 0) }} 个实验</p>
    <div class="chapter-grid">
      <RouterLink
        v-for="c in grade.chapters"
        :key="c.id"
        :to="`/chapters/${grade.grade}`"
        class="card chapter-card"
      >
        <h3>{{ c.title }}</h3>
        <p>{{ c.experiments.map(e => e.title).join('、') }}</p>
        <span :class="['tag', c.experiments.some(e => e.level === '核心') ? 'tag-core' : 'tag-basic']">
          {{ c.experiments.length }} 个实验
        </span>
      </RouterLink>
    </div>
  </div>
</template>