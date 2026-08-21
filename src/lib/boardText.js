// 画板上的文字配色解析器（通用所有实验）。
// 画板背景可能是：深绿黑板(chalk) / 深空板(board-dark) / 浅色纸面(light)，
// 画布文字无法用 CSS 直接上色，故在绘制时按「画布所在面板」的 CSS 变量取色，
// 保证文字在任意背景下都可读：深色背景→浅色文字，浅色背景→深色文字。
//
// 用法（在 lab 组件内，ctx 已就绪）：
//   ctx.fillStyle = boardFg(ctx.canvas)     // 标题/高亮文字（最亮）
//   ctx.fillStyle = boardText(ctx.canvas)   // 正文/标签文字（次级亮）
//
// 变量定义在 src/style.css：--bb-fg（亮）、--bb-fg-dim（次级亮），
// 随 [data-board-theme="light"] 与 .board-dark 自动切换。

function resolve(name, fallback, el) {
  if (typeof document === 'undefined' || !document.documentElement) return fallback
  // 优先从画布元素读取：它能继承所在面板（.board-dark 等）与作用域内的变量覆盖
  const source = el && el.nodeType === 1 ? el : document.documentElement
  const v = getComputedStyle(source).getPropertyValue(name)
  return v && v.trim() ? v.trim() : fallback
}

// 标题 / 高亮文字：最亮
export function boardFg(el) {
  return resolve('--bb-fg', '#f2f5f0', el)
}

// 正文 / 标签文字：次级亮（在深色背景上仍清晰，浅色背景上转深）
export function boardText(el) {
  return resolve('--bb-fg-dim', '#c7d0c8', el)
}
