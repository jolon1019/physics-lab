// 真实导线样式的曲线工具
// --------------------------------------------------------------
// 自由搭建台的导线原本是「正交折线 + 90° 硬拐角」，看起来像直尺连线。
// 本模块把折线转换成「带弧度的真实导线」：每一段导线都会自然下垂成弧线
// （类似真实导线/电缆的松弛感），拐角处再用 Chaikin 平滑成圆角，整条线
// 不再是直线段拼接。即使一段导线本身是直的，也会被「弓」成一条可见的弧。
// 同时提供 pointOnPolyline / polylineLength，让电子流动画严格贴合同一曲线。

// 把折线的每一段「弓」成抛物线弧：两端不动，中段按 sag 下垂；
// 下垂量随线段长度增大（但封顶），保证长导线弧线明显、短线段不过度。
function densifyBowed(pts, { sagAbs = 26, subStep = 12 } = {}) {
  if (!pts || pts.length < 2) return pts ? pts.map((p) => [p[0], p[1]]) : []
  const out = [[pts[0][0], pts[0][1]]]
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (len < 1) continue
    // 垂直于导线方向（决定下垂偏向）
    const px = -dy / len
    const py = dx / len
    const sag = Math.min(sagAbs, len * 0.26)
    const steps = Math.max(2, Math.round(len / subStep))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const bow = Math.sin(t * Math.PI) * sag // 端点 0，中点最大
      out.push([a[0] + dx * t + px * bow, a[1] + dy * t + py * bow])
    }
  }
  return out
}

// Chaikin 角点平滑（一轮），把直角拐角变成圆角
function chaikin(pts, iter = 1) {
  let p = pts
  for (let k = 0; k < iter; k++) {
    if (p.length < 3) break
    const out = [p[0]]
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i]
      const b = p[i + 1]
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    out.push(p[p.length - 1])
    p = out
  }
  return p
}

// 折线 → 真实导线曲线（密集点列）
export function curveWire(pts, opts) {
  const bowed = densifyBowed(pts, opts)
  return chaikin(bowed, 1)
}

// 密集点列 → SVG path（M/L 折线，因足够密，肉眼为平滑曲线）
export function pathFromPolyline(pts) {
  if (!pts || pts.length < 1) return ''
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`
  return d
}

export function polylineLength(pts) {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return L
}

// 沿点列按弧长进度 t∈[0,1] 取点（电子严格贴线）
export function pointOnPolyline(pts, t) {
  if (!pts || pts.length < 2) return pts && pts[0] ? pts[0] : [0, 0]
  const segs = []
  let L = 0
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    segs.push(l)
    L += l
  }
  if (L < 1e-6) return pts[0]
  let target = (((t % 1) + 1) % 1) * L
  let acc = 0
  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i] >= target) {
      const f = segs[i] < 1e-6 ? 0 : (target - acc) / segs[i]
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]
    }
    acc += segs[i]
  }
  return pts[pts.length - 1]
}
