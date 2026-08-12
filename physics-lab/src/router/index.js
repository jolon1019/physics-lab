import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { findExpId } from '../data/experiments'

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: { title: '物理实验平台' }
  },
  {
    path: '/chapters/:grade',
    name: 'chapters',
    component: () => import('../views/ChaptersView.vue'),
    meta: { title: '章节实验' }
  },
  {
    path: '/experiment/:id',
    name: 'experiment',
    component: () => import('../views/ExperimentView.vue'),
    meta: { title: '实验详情' }
  },
  {
    path: '/record',
    name: 'record',
    component: () => import('../views/RecordView.vue'),
    meta: { title: '学习记录' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  // 支持 liziwuli 风格 ?experiment=slug 直达
  const slug = to.query.experiment
  if (slug) {
    const id = findExpId(String(slug))
    if (id) {
      return { name: 'experiment', params: { id }, query: {} }
    }
  }
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 物理实验平台` : '物理实验平台'
})

export default router