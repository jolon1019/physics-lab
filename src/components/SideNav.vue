<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { SUBJECTS, findExperiment, gradesBySubject } from '../data/experiments'
import { useProgressStore } from '../stores/progress'
import { useLayoutStore } from '../stores/layout'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const progress = useProgressStore()
const layout = useLayoutStore()
const auth = useAuthStore()

const subject = ref('physics')
const openGrades = ref(new Set())

const grades = computed(() => gradesBySubject(subject.value))

// 「免费实验」分组：存在会员专享且当前用户非会员（游客/免费用户）时，
// 在年级列表最上方聚合当前学科的全部免费实验（学科 tab 切换时同步跟随，数学物理分开）
const FREE_KEY = '__free__'
const freeGrade = computed(() => {
  if (!auth.paidExperiments.length || auth.isMember) return null
  const exps = grades.value.flatMap((g) => g.experiments).filter((e) => !auth.paidExperiments.includes(e.id))
  return exps.length ? { grade: FREE_KEY, label: '免费实验', experiments: exps, free: true } : null
})
const navGrades = computed(() => (freeGrade.value ? [freeGrade.value, ...grades.value] : grades.value))

// 默认展开：有免费分组 → 只展开免费分组；否则展开第一个年级
function defaultOpen() {
  const s = new Set()
  if (freeGrade.value) s.add(FREE_KEY)
  else if (grades.value.length) s.add(grades.value[0].grade)
  return s
}

function totalCount() {
  return grades.value.reduce((s, g) => s + g.experiments.length, 0)
}

function pickSubject(id) {
  if (subject.value === id) return
  subject.value = id
  openGrades.value = defaultOpen()
}

function syncOpen() {
  const id = route.params.id
  const hit = id ? findExperiment(id) : null
  if (hit) {
    subject.value = hit.grade.subject || 'physics'
    if (freeGrade.value && freeGrade.value.experiments.some((e) => e.id === id)) {
      // 免费实验：只保证免费分组展开，不自动展开其所属年级
      if (!openGrades.value.has(FREE_KEY)) {
        openGrades.value = new Set([...openGrades.value, FREE_KEY])
      }
    } else if (!openGrades.value.has(hit.grade.grade)) {
      // 直达实验：展开它所在的年级
      openGrades.value = new Set([hit.grade.grade])
    }
  } else {
    openGrades.value = defaultOpen()
  }
}

// 免费分组异步出现时（付费名单加载完成）：非实验页重新应用默认展开；
// 实验页仅在该实验属于免费分组时补充展开免费分组。不改 subject，
// 避免在实验页手动切学科 tab 时 freeGrade 重算把学科弹回实验所属学科
function reapplyDefault() {
  if (!freeGrade.value) return
  const id = route.params.id
  if (!id) {
    openGrades.value = defaultOpen()
  } else if (freeGrade.value.experiments.some((e) => e.id === id)) {
    if (!openGrades.value.has(FREE_KEY)) {
      openGrades.value = new Set([...openGrades.value, FREE_KEY])
    }
  }
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

// 会员专享实验：列表可见，但非会员/游客不可点击（管理员与会员可进）
function isLocked(expId) {
  return auth.isLocked(expId)
}

watch(
  () => route.params.id,
  () => syncOpen()
)

// 付费名单异步加载完成后免费分组才出现：仅在首页等非实验页重新应用默认展开。
// 实验页不调 syncOpen——否则切学科 tab 时 freeGrade 重算会把 subject 弹回实验所属学科
watch(freeGrade, reapplyDefault)

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
      <div class="subject-tabs" role="tablist" aria-label="学科分类">
        <button
          v-for="s in SUBJECTS"
          :key="s.id"
          class="subject-tab"
          :class="{ active: subject === s.id }"
          role="tab"
          :aria-selected="subject === s.id"
          @click="pickSubject(s.id)"
        >
          {{ s.label }}
        </button>
      </div>

      <div v-for="(g, gi) in navGrades" :key="g.grade" class="nav-module" :class="{ 'is-free': g.free }">
        <button class="nav-module-btn" :class="{ open: openGrades.has(g.grade) }" @click="toggleGrade(g.grade)">
          <span class="rail-index">{{ String(gi + 1).padStart(2, '0') }}</span>
          <span class="nav-module-label">{{ g.label }}</span>
          <span class="nav-caret">{{ openGrades.has(g.grade) ? '−' : '+' }}</span>
        </button>

        <div v-if="openGrades.has(g.grade)" class="nav-exps">
          <template v-for="e in g.experiments" :key="e.id">
            <!-- 会员专享且无权限：可点击进入实验页，展示会员门禁界面 -->
            <RouterLink
              v-if="isLocked(e.id)"
              :to="`/experiment/${e.id}`"
              class="nav-exp locked"
              :class="{ active: isActive(e.id) }"
              title="会员专享实验，点击查看详情"
            >
              <span class="nav-exp-state">{{ isDone(e.id) ? '✓' : '' }}</span>
              <span class="nav-exp-title">{{ e.title }}</span>
            </RouterLink>
            <RouterLink
              v-else
              :to="`/experiment/${e.id}`"
              class="nav-exp"
              :class="{ active: isActive(e.id) }"
            >
              <span class="nav-exp-state">{{ isDone(e.id) ? '✓' : '' }}</span>
              <span class="nav-exp-title">{{ e.title }}</span>
            </RouterLink>
          </template>
        </div>
      </div>
    </template>

    <!-- 折叠态：仅保留年级序号的窄轨快捷入口 -->
    <template v-else>
      <div class="rail-grades">
        <button
          v-for="(g, gi) in navGrades"
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
