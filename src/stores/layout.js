import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'phy-nav-collapsed'

export const useLayoutStore = defineStore('layout', () => {
  const navCollapsed = ref(localStorage.getItem(STORAGE_KEY) === '1')

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, navCollapsed.value ? '1' : '0')
    } catch (e) {
      /* localStorage 不可用时静默降级 */
    }
  }

  function toggleNav() {
    navCollapsed.value = !navCollapsed.value
    persist()
  }

  function setNav(value) {
    navCollapsed.value = value
    persist()
  }

  return { navCollapsed, toggleNav, setNav }
})
