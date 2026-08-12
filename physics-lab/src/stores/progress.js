import { defineStore } from 'pinia'
import { getProgress, saveProgress } from '../lib/api'
import { useAuthStore } from './auth'

// 进度数据结构：{ records: { [expId]: {...} }, sessions, lastVisit }
function emptyProgress() {
  return { records: {}, sessions: 0, lastVisit: '' }
}
// 游客（未登录）进度存本地，键固定
function loadGuest() {
  try {
    const raw = JSON.parse(localStorage.getItem('physics-lab-progress') || '{}')
    const base = raw && typeof raw === 'object' ? raw : {}
    // 归一化：兼容旧结构（可能缺 records 字段），避免 getter 读取到 undefined 崩溃
    return {
      records: base.records && typeof base.records === 'object' ? base.records : {},
      sessions: Number.isFinite(base.sessions) ? base.sessions : 0,
      lastVisit: typeof base.lastVisit === 'string' ? base.lastVisit : ''
    }
  } catch {
    return emptyProgress()
  }
}

export const useProgressStore = defineStore('progress', {
  state: () => ({
    records: {},
    sessions: 0,
    lastVisit: '',
    loading: false
  }),
  getters: {
    completedCount() {
      return Object.values(this.records || {}).filter((r) => r && r.completed).length
    },
    accuracy() {
      const all = Object.values(this.records || {})
      const total = all.reduce((s, r) => s + (r && r.attempts || 0), 0)
      const correct = all.reduce((s, r) => s + (r && r.correct || 0), 0)
      return total ? Math.round((correct / total) * 100) : 0
    }
  },
  actions: {
    // 登录状态变化时由 auth store 调用：
    //   isAuthed=true  → 从服务端拉取「该用户」的进度（隔离）
    //   isAuthed=false → 回落到本地游客进度
    async loadForUser(isAuthed) {
      this.loading = true
      try {
        if (isAuthed) {
          const data = await getProgress()
          const p = data.progress || emptyProgress()
          this.records = p.records || {}
          this.sessions = p.sessions || 0
          this.lastVisit = p.lastVisit || ''
          return
        }
      } catch (e) {
        // 服务端取数失败，回落本地，保证可用
      } finally {
        this.loading = false
      }
      const g = loadGuest()
      this.records = g.records
      this.sessions = g.sessions
      this.lastVisit = g.lastVisit
    },
    // 登出后回落游客本地进度
    resetToGuest() {
      const g = loadGuest()
      this.records = g.records
      this.sessions = g.sessions
      this.lastVisit = g.lastVisit
    },
    // 已登录 → 写服务端（按用户隔离）；游客 → 写本地
    async persist() {
      const auth = useAuthStore()
      if (auth.isLoggedIn) {
        try {
          await saveProgress({
            records: this.records,
            sessions: this.sessions,
            lastVisit: this.lastVisit
          })
        } catch (e) {
          /* 保存失败忽略，下次操作会重试 */
        }
        return
      }
      try {
        localStorage.setItem(
          'physics-lab-progress',
          JSON.stringify({
            records: this.records,
            sessions: this.sessions,
            lastVisit: this.lastVisit
          })
        )
      } catch (e) {
        /* 忽略存储异常 */
      }
    },
    startSession() {
      this.sessions += 1
      this.lastVisit = new Date().toLocaleDateString()
      this.persist()
    },
    recordAnswer(expId, correct) {
      if (!this.records[expId]) {
        this.records[expId] = { attempts: 0, correct: 0, completed: false, latest: '' }
      }
      const r = this.records[expId]
      r.attempts += 1
      if (correct) r.correct += 1
      r.latest = new Date().toLocaleString()
      this.persist()
    },
    markCompleted(expId) {
      if (!this.records[expId]) {
        this.records[expId] = { attempts: 0, correct: 0, completed: false, latest: '' }
      }
      this.records[expId].completed = true
      this.persist()
    }
  }
})
