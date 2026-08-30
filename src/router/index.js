import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { findExpId } from '../data/experiments'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: { title: '自主自学实验平台' }
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
    meta: { title: '学习记录', requiresAuth: true }
  },
  {
    path: '/resources',
    name: 'resources',
    component: () => import('../views/ResourcesView.vue'),
    meta: { title: '试卷资料库' }
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../views/AdminView.vue'),
    meta: { title: '管理后台', requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  // 需要登录但未登录：打开登录弹窗，并记住登录后要去的页面
  if (to.meta.requiresAuth) {
    const auth = useAuthStore()
    if (!auth.token) {
      auth.openLogin(to.fullPath)
      return { path: '/' }
    }
  }
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
  document.title = to.meta.title ? `${to.meta.title} · 自主自学实验平台` : '自主自学实验平台'
})

export default router