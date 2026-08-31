// 导线折线工具
// --------------------------------------------------------------
// 自由搭建台的导线由「避让布线折线 + 用户关节点」生成。
// 导线直接渲染原始折线（stroke-linejoin:round 圆角接头），不做样条平滑：
// 正交布线在 90° 拐角做 Catmull-Rom 会外凸过冲十几像素，
// 使接线点 / 关节 / 电子偏离肉眼可见的导线。
// pointOnPolyline / polylineLength / polylineDirAt 对同一折线按弧长取样，
// 与渲染路径（M/L 直线段）严格重合。
// catmullRomSpline 保留供「有拖拽关节时」的平滑降级使用。

// Catmull-Rom 过点样条：曲线精确经过每个输入点（端子、关节、布线拐点），
// 弯曲方向完全由相邻控制点的位置决定 —— 关节拖到哪边，导线就往哪边弯，
// 不再是固定单侧弓弯。关节点永远落在曲线上，圆点吸附零偏差。
export function catmullRomSpline(pts, { seg = 16 } = {}) {
  if (!pts || pts.length < 2) return pts ? pts.map((p) => p.slice()) : []
  if (pts.length === 2) {
    // 两点：直线加密即可
    const [a, b] = pts
    const out = []
    for (let s = 0; s < seg; s++) {
      const t = s / seg
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
    out.push(b.slice())
    return out
  }
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || pts[i + 1]
    for (let s = 0; s < seg; s++) {
      const t = s / seg
      const t2 = t * t
      const t3 = t2 * t
      const x =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
      const y =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      out.push([x, y])
    }
  }
  out.push(pts[pts.length - 1].slice())
  return out
}

// 把用户拖拽的关节点插入折线（不改变两端接线柱，连接关系不变）。
// joints: [[x,y],[x,y]]，依次插入到整条折线弧长的 1/3、2/3 处；
// 未拖拽过的关节（null/undefined）不插入，保持原避让布线形状。
export function applyJoints(pts, joints) {
  if (!pts || pts.length < 2) return pts
  const list = (joints || []).filter((j) => Array.isArray(j))
  if (!list.length) return pts
  const ts = list.length >= 2 ? [1 / 3, 2 / 3] : [1 / 2]
  const targets = list.slice(0, 2).map((p, i) => ({ t: ts[i], p })).sort((a, b) => a.t - b.t)
  // 弧长累计表
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  }
  const L = cum[cum.length - 1]
  if (L < 1e-6) return pts
  const out = [pts[0].slice()]
  let k = 0
  for (let i = 1; i < pts.length; i++) {
    const segLen = cum[i] - cum[i - 1]
    while (k < targets.length && cum[i] >= targets[k].t * L) {
      if (segLen > 1e-6) out.push([targets[k].p[0], targets[k].p[1]])
      k++
    }
    out.push(pts[i].slice())
  }
  return out
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

// 弧长进度 t 处折线的走向（主轴单位向量）：搭接支线据此垂直进入目标线，避免顺线重合
export function polylineDirAt(pts, t) {
  if (!pts || pts.length < 2) return [1, 0]
  const segs = []
  let L = 0
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    segs.push(l)
    L += l
  }
  if (L < 1e-6) return [1, 0]
  let target = (((t % 1) + 1) % 1) * L
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const dx = pts[i + 1][0] - pts[i][0]
      const dy = pts[i + 1][1] - pts[i][1]
      return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1]
    }
    target -= segs[i]
  }
  return [1, 0]
}
