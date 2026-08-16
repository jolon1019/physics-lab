// 统一黑板背景绘制（canvas 用）。视觉与 components/lab/BlackBoardBg.vue 完全一致：
// - chalk 绿粉笔板（电路 / 力学 / 声 / 热学等）
// - dark  深空板（光学：透镜 / 平面镜 / 反射）
// - light 浅色纸面（与浅色页面背景一致，可经 boardTheme 自由切换）
// 木框（inset box-shadow）由全局样式 .lab-left > .lab-panel 提供，这里只画表面底色 + 粉笔网格。
// 坐标使用逻辑像素（已 setTransform(dpr) 的画布直接传 W/H 逻辑尺寸即可）。
import { boardTheme } from './boardTheme'

export const BOARD = {
  chalk: {
    // 由中心偏上向外辐射的绿板渐变
    surface: ['#214034', '#163025', '#0f211a'],
    grid: 'rgba(225,238,228,0.05)'
  },
  dark: {
    surface: ['#14263a', '#0c1726', '#070d18'],
    grid: 'rgba(150,190,230,0.045)'
  },
  light: {
    surface: ['#fbfaf7', '#f4f1ea', '#ece7da'],
    grid: 'rgba(60,50,40,0.05)'
  }
}

// 在画布上铺满黑板底色（覆盖整屏，作为实验元素的统一背景）。
export function paintBoard(ctx, W, H, variant = 'chalk') {
  // 'chalk' 表示「跟随浅色切换的默认板」：light 模式下渲染浅色纸面；dark 为固定深空板，不参与切换
  const v = variant === 'chalk' && boardTheme.variant === 'light' ? 'light' : variant
  const b = BOARD[v] || BOARD.chalk
  const g = ctx.createRadialGradient(W / 2, -H * 0.12, 0, W / 2, -H * 0.12, Math.max(W, H) * 1.25)
  g.addColorStop(0, b.surface[0])
  g.addColorStop(0.55, b.surface[1])
  g.addColorStop(1, b.surface[2])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // 粉笔网格
  ctx.save()
  ctx.strokeStyle = b.grid
  ctx.lineWidth = 1
  const s = 46
  ctx.beginPath()
  for (let y = s; y < H; y += s) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(W, y + 0.5)
  }
  for (let x = s; x < W; x += s) {
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, H)
  }
  ctx.stroke()
  ctx.restore()
}
