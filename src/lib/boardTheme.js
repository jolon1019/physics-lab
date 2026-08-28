import { reactive, watch } from 'vue'

// 实验画板背景主题：'chalk' 绿粉笔板 | 'light' 浅色纸面（默认）。
// 'dark'（光学深空板）由各实验显式使用，不参与此切换。
// 切换时：① 把当前值写到 <html data-board-theme>，让全局 CSS 变量（--bb-surface / --bb-frame / --bb-grid）即时换肤；
//         ② 派发 window resize，触发监听 resize 的画板（setupCanvas 后重绘）即时重绘，保证静态画板也跟随。
export const boardTheme = reactive({ variant: 'light' })

watch(
  () => boardTheme.variant,
  (v) => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-board-theme', v)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'))
  },
  { immediate: true }
)

export function toggleBoardVariant() {
  boardTheme.variant = boardTheme.variant === 'chalk' ? 'light' : 'chalk'
}
