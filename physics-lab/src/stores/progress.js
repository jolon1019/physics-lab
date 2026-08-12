import { defineStore } from 'pinia'

function load() {
  try {
    return JSON.parse(localStorage.getItem('physics-lab-progress')) || {}
  } catch {
    return {}
  }
}

export const useProgressStore = defineStore('progress', {
  state: () => ({
    records: load(),
    sessions: 0,
    lastVisit: ''
  }),
  getters: {
    completedCount() {
      return Object.values(this.records).filter((r) => r.completed).length
    },
    accuracy() {
      const all = Object.values(this.records)
      const total = all.reduce((s, r) => s + (r.attempts || 0), 0)
      const correct = all.reduce((s, r) => s + (r.correct || 0), 0)
      return total ? Math.round((correct / total) * 100) : 0
    }
  },
  actions: {
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
    },
    persist() {
      localStorage.setItem('physics-lab-progress', JSON.stringify(this.records))
    }
  }
})