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
    user: null, // { email, role }
    showLogin: false,
    pendingRoute: null, // 登录后要跳转的页面
    error: ''
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    isAdmin: (s) => s.user?.role === 'admin'
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
    async register(email, password) {
      this.error = ''
      const res = await api.register(email, password)
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
    }
  }
})
