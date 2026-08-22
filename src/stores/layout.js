import { defineStore } from 'pinia'
import { ref } from 'vue'

const NAV_KEY = 'phy-nav-collapsed'
const TOPBAR_KEY = 'phy-topbar-hidden'

export const useLayoutStore = defineStore('layout', () => {
  const navCollapsed = ref(localStorage.getItem(NAV_KEY) === '1')
  // 顶栏整体收起（连同左侧目录一起隐藏，给实验区腾高度）
  const topbarHidden = ref(localStorage.getItem(TOPBAR_KEY) === '1')

  function persistNav() {
    try {
      localStorage.setItem(NAV_KEY, navCollapsed.value ? '1' : '0')
    } catch (e) {
      /* localStorage 不可用时静默降级 */
    }
  }

  function persistTopbar() {
    try {
      localStorage.setItem(TOPBAR_KEY, topbarHidden.value ? '1' : '0')
    } catch (e) {
      /* localStorage 不可用时静默降级 */
    }
  }

  function toggleNav() {
    navCollapsed.value = !navCollapsed.value
    persistNav()
  }

  function setNav(value) {
    navCollapsed.value = value
    persistNav()
  }

  function toggleTopbar() {
    topbarHidden.value = !topbarHidden.value
    persistTopbar()
  }

  function setTopbar(value) {
    topbarHidden.value = value
    persistTopbar()
  }

  return { navCollapsed, topbarHidden, toggleNav, setNav, toggleTopbar, setTopbar }
})
