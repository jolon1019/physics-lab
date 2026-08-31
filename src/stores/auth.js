import { defineStore } from 'pinia'
import * as api from '../lib/api'
import { useProgressStore } from './progress'

const TOKEN_KEY = 'physics-lab-token'

function loadToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: loadToken(),
    user: null, // { email, role, membership }
    showLogin: false,
    pendingRoute: null, // 登录后要跳转的页面
    error: '',
    paidExperiments: [] // 站点设置：会员专享实验 id 列表（公开接口拉取）
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    isAdmin: (s) => s.user?.role === 'admin',
    isMember: (s) => !!s.user && (s.user.membership === 'member' || s.user.role === 'admin'),
    // 会员专享实验：列表始终可见，游客与免费用户不可点击（字体置灰）
    isLocked: (s) => (expId) => s.paidExperiments.includes(expId) && !s.isMember,
  },
  actions: {
    // 应用启动时校验本地 token 是否仍有效
    async init() {
      if (!this.token) return
      try {
        const me = await api.getMe()
        if (me.user) {
          this.user = me.user
          // 拉取该登录用户的服务端进度（数据隔离）
          useProgressStore().loadForUser(true)
        } else {
          // token 失效（如后端重启清空内存会话）→ 清除，回落游客
          this.logout(false)
        }
      } catch {
        this.logout(false)
      }
    },
    async login(email, password) {
      this.error = ''
      const res = await api.login(email, password)
      this._applySession(res)
      return res
    },
    async register(email, password, code) {
      this.error = ''
      const res = await api.register(email, password, code)
      this._applySession(res)
      return res
    },
    _applySession(res) {
      this.token = res.token
      this.user = res.user
      try {
        localStorage.setItem(TOKEN_KEY, res.token)
      } catch {
        /* 忽略存储异常 */
      }
      this.closeLogin()
      // 拉取该登录用户的服务端进度（数据隔离）
      useProgressStore().loadForUser(true)
    },
    logout(persist = true) {
      if (this.token) api.logout().catch(() => {})
      this.token = ''
      this.user = null
      // 回落到游客本地进度
      useProgressStore().resetToGuest()
      if (persist) {
        try {
          localStorage.removeItem(TOKEN_KEY)
        } catch {
          /* 忽略 */
        }
      }
    },
    openLogin(pendingRoute = null) {
      this.pendingRoute = pendingRoute
      this.showLogin = true
    },
    closeLogin() {
      this.showLogin = false
      this.error = ''
    },
    async changePassword(oldPassword, newPassword) {
      this.error = ''
      const res = await api.changePassword(oldPassword, newPassword)
      return res
    },
    async adminListUsers() {
      return api.adminListUsers()
    },
    async adminResetPassword(email, newPassword) {
      return api.adminResetPassword(email, newPassword)
    },
    async adminSetRole(email, role) {
      return api.adminSetRole(email, role)
    },
    async adminSetMembership(email, membership) {
      return api.adminSetMembership(email, membership)
    },
    async adminGetSettings() {
      return api.adminGetSettings()
    },
    async adminSaveSettings(paidExperiments) {
      return api.adminSaveSettings(paidExperiments)
    },
    // 拉取公开设置（付费实验名单）：登录与否都需要
    async loadSettings() {
      try {
        const s = await api.getPublicSettings()
        this.paidExperiments = Array.isArray(s.paidExperiments) ? s.paidExperiments : []
      } catch {
        /* 拉取失败保持现状（离线/后端未升级时全部按免费处理） */
      }
    }
  }
})
