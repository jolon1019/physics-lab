import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { findExpId } from '../data/experiments'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    // 网站首页：试卷资料库
    path: '/',
    name: 'home',
    component: () => import('../views/PapersView.vue'),
    meta: { title: '试卷资料库' }
  },
  {
    // 实验平台首页（独立入口）
    path: '/lab',
    name: 'lab',
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
  // 旧地址统一跳转到首页
  { path: '/papers', redirect: '/' },
  { path: '/resources', redirect: '/' },
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

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // 需要登录但未登录：打开登录弹窗，并记住登录后要去的页面
  if (to.meta.requiresAuth) {
    if (!auth.token) {
      auth.openLogin(to.fullPath)
      return { path: '/lab' }
    }
  }
  // 进入实验页前确保付费实验名单已加载，否则门禁失效
  if (to.name === 'experiment' && !auth.paidExperiments.length) {
    await auth.loadSettings()
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

// 首屏 PV 由百度统计 hm.js 自动上报，这里跳过首次避免重复计数
let baiduFirstNav = true
router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 自主自学实验平台` : '自主自学实验平台'
  // SPA 路由切换手动上报 PV（history 模式下 hm.js 不会自动统计）
  if (baiduFirstNav) {
    baiduFirstNav = false
  } else if (window._hmt) {
    window._hmt.push(['_trackPageview', to.fullPath])
  }
})

export default router