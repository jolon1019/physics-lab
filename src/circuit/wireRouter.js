// 导线避让自动布线器（≤2 个 90° 弯的简洁正交路由）
// --------------------------------------------------------------
// 自由搭建台里，导线连接两个接线柱。当元件被拖动时，端子世界坐标随之变化，
// 导线本就会跟着移动（wirePathD 每次都按 terminalWorld 重新算）。但直线/迷宫式
// 折线很容易与"别的元件"或"别的导线"重叠交叉。
//
// 这里用一套轻量的「候选折线」路由做避让，核心约束是：整条导线最多只有
// 两个 90° 弯（即最多 3 段）：
//   1. 两端子法向决定了导线的进出口方向（导线从元件边缘正交引出）；
//   2. 同向（都水平 / 都垂直）的两个端子用一条「横-竖-横」(或「竖-横-竖」)
//      的折线连接——中段的横/竖"过桥"线可以左右/上下平移来挑一条不撞障碍的车道；
//   3. 垂直（一横一竖）的两个端子用一条「L」形折线（1 个弯）连接；
//   4. 顺序布线：后布的线主动绕开先布的线（挑不同的过桥车道），结果稳定不抖；
//   5. 找不到完全空旷的车道时，退而求其次选"碰撞最少 / 最短"的，保证仍是 ≤2 弯。
//
// 与所连元件自身不视为障碍（否则连线无法离开端子），但会绕开所有其它元件。

import { META, terminalNormal } from './components'

const W = 1000
const H = 640
const STUB = 16 // 端子引线长度（沿法向干净离开元件）
const CLEAR_COMP = 11 // 元件周围避让净距（并入外接盒）
const CLEAR_WIRE = 7 // 导线之间最小净距（避免贴在一起）
const LANE = 16 // 平行导线换道间距

function rotatePt(lx, ly, rot) {
  const r = ((rot || 0) * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: lx * c - ly * s, y: lx * s + ly * c }
}

function terminalWorld(c, port) {
  const t = (META[c.type].terminals || []).find((p) => p.id === port)
  if (!t) return { x: c.x, y: c.y }
  const r = rotatePt(t.x, t.y, c.rot || 0)
  return { x: c.x + r.x, y: c.y + r.y }
}

// 元件未旋转时的外接半尺寸（世界坐标）。端子在 ±44 / ±32，盒略大于接线柱范围。
function compHalf(type) {
  switch (type) {
    case 'rheostat':
      return { hx: 56, hy: 44 }
    case 'resistor':
      return { hx: 46, hy: 20 }
    case 'battery':
      return { hx: 50, hy: 40 }
    default:
      return { hx: 48, hy: 40 }
  }
}

// 元件旋转后的世界 AABB（已含避让余量）
function compAABB(c) {
  const h = compHalf(c.type)
  const corners = [
    [-h.hx, -h.hy],
    [h.hx, -h.hy],
    [h.hx, h.hy],
    [-h.hx, h.hy]
  ].map(([lx, ly]) => {
    const p = rotatePt(lx, ly, c.rot || 0)
    return { x: c.x + p.x, y: c.y + p.y }
  })
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  return {
    minX: Math.min(...xs) - CLEAR_COMP,
    maxX: Math.max(...xs) + CLEAR_COMP,
    minY: Math.min(...ys) - CLEAR_COMP,
    maxY: Math.max(...ys) + CLEAR_COMP
  }
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-9) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function pointInRect(x, y, r) {
  return x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY
}

// 轴对齐线段 vs 已膨胀矩形（精确）
function segHitsRect(x1, y1, x2, y2, r) {
  if (pointInRect(x1, y1, r) || pointInRect(x2, y2, r)) return true
  const minx = Math.min(x1, x2)
  const maxx = Math.max(x1, x2)
  const miny = Math.min(y1, y2)
  const maxy = Math.max(y1, y2)
  if (Math.abs(x1 - x2) < 1e-6) {
    // 竖线
    return x1 >= r.minX && x1 <= r.maxX && maxy >= r.minY && miny <= r.maxY
  }
  if (Math.abs(y1 - y2) < 1e-6) {
    // 横线
    return y1 >= r.minY && y1 <= r.maxY && maxx >= r.minX && minx <= r.maxX
  }
  return false
}

// 轴对齐线段 vs 已布导线折线（按 CLEAR_WIRE 净距判接近）
function segNearWire(x1, y1, x2, y2, wire, clear) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const n = Math.max(1, Math.ceil(len / 5))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const px = x1 + (x2 - x1) * t
    const py = y1 + (y2 - y1) * t
    for (let j = 1; j < wire.length; j++) {
      if (
        distToSeg(px, py, wire[j - 1][0], wire[j - 1][1], wire[j][0], wire[j][1]) < clear
      ) {
        return true
      }
    }
  }
  return false
}

// 一条候选折线是否与障碍（元件盒 + 已布导线）冲突
function pathCollides(pts, rects, wires) {
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1]
    const [x2, y2] = pts[i]
    for (const r of rects) {
      if (segHitsRect(x1, y1, x2, y2, r)) return true
    }
    for (const w of wires) {
      if (segNearWire(x1, y1, x2, y2, w, CLEAR_WIRE)) return true
    }
  }
  return false
}

// 去掉共线中间点（含极短段），保证折线简洁
function simplify(pts) {
  if (pts.length <= 2) return pts.slice()
  const out = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1]
    const b = pts[i]
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.5) out.push(b)
  }
  if (out.length < 2) return [pts[0], pts[pts.length - 1]]
  const cleaned = [out[0]]
  for (let i = 1; i < out.length; i++) {
    const a = cleaned[cleaned.length - 1]
    const b = out[i]
    const c = out[i + 1]
    if (!c) {
      cleaned.push(b)
      break
    }
    const d1x = Math.sign(b[0] - a[0])
    const d1y = Math.sign(b[1] - a[1])
    const d2x = Math.sign(c[0] - b[0])
    const d2y = Math.sign(c[1] - b[1])
    if (d1x === d2x && d1y === d2y) continue // b 共线，跳过
    cleaned.push(b)
  }
  return cleaned
}

function pathLen(pts) {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return s
}

// 生成「过桥」坐标候选（横/竖母线位置），并过滤掉会让导线 U 形折返的非法值
function crossbarCandidates(A, B, nA, nB, axis) {
  const set = new Set()
  const a = axis === 'x' ? A.x : A.y
  const b = axis === 'x' ? B.x : B.y
  const dir = axis === 'x' ? 'x' : 'y'
  set.add(a)
  set.add(b)
  set.add((a + b) / 2)
  for (let k = 1; k <= 6; k++) {
    set.add(a + k * LANE)
    set.add(a - k * LANE)
    set.add(b + k * LANE)
    set.add(b - k * LANE)
    set.add((a + b) / 2 + k * LANE)
    set.add((a + b) / 2 - k * LANE)
  }
  const out = []
  for (const v of set) {
    if (axis === 'x') {
      // 保证 A 端先沿 nA.x 离场、B 端最后沿 nB.x 进场（不折返）
      if ((v - A.x) * nA.x >= -0.01 && (B.x - v) * nB.x >= -0.01) out.push(v)
    } else {
      if ((v - A.y) * nA.y >= -0.01 && (B.y - v) * nB.y >= -0.01) out.push(v)
    }
  }
  return out
}

// 组装一条折线（含端子引线），pts 顺序：A → P1 → … → B
function buildPath(kind, A, nA, B, nB, cb) {
  if (kind === 'hzv') {
    // 横-竖-横（两条端子都水平）：过桥母线为竖线 x = cb
    const P1 = [A.x + nA[0] * STUB, A.y]
    const P2 = [B.x - nB[0] * STUB, B.y]
    return simplify([[A.x, A.y], P1, [cb, A.y], [cb, B.y], P2, [B.x, B.y]])
  }
  if (kind === 'vhv') {
    // 竖-横-竖（两条端子都垂直）：过桥母线为横线 y = cb
    const P1 = [A.x, A.y + nA[1] * STUB]
    const P2 = [B.x, B.y - nB[1] * STUB]
    return simplify([[A.x, A.y], P1, [A.x, cb], [B.x, cb], P2, [B.x, B.y]])
  }
  // L 形（一横一竖）：拐点在 (B.x, A.y) 或 (A.x, B.y)
  if (kind === 'L-hv') {
    // A 横出、B 竖进 → 拐点 (B.x, A.y)
    const P1 = [A.x + nA[0] * STUB, A.y]
    const P2 = [B.x, B.y - nB[1] * STUB]
    return simplify([[A.x, A.y], P1, [B.x, A.y], P2, [B.x, B.y]])
  }
  // A 竖出、B 横进 → 拐点 (A.x, B.y)
  const P1 = [A.x, A.y + nA[1] * STUB]
  const P2 = [B.x - nB[0] * STUB, B.y]
  return simplify([[A.x, A.y], P1, [A.x, B.y], P2, [B.x, B.y]])
}

function routeOneWire(w, comps, wires) {
  const ca = comps.find((c) => c.id === w.a.comp)
  const cb = comps.find((c) => c.id === w.b.comp)
  if (!ca || !cb) return [[0, 0], [0, 0]]
  const A = terminalWorld(ca, w.a.term)
  const B = terminalWorld(cb, w.b.term)
  const nA = terminalNormal(ca.type, w.a.term, ca.rot || 0)
  const nB = terminalNormal(cb.type, w.b.term, cb.rot || 0)
  if (Math.hypot(B.x - A.x, B.y - A.y) < 1) return [[A.x, A.y], [B.x, B.y]]

  const rects = comps.filter((c) => c.id !== w.a.comp && c.id !== w.b.comp).map(compAABB)

  const aH = nA[0] !== 0 // A 端为水平法向
  const bH = nB[0] !== 0 // B 端为水平法向

  let candidates = []
  if (aH && bH) {
    // 两条都水平 → 横-竖-横，过桥竖线 x 取候选车道
    const xs = crossbarCandidates(A, B, nA, nB, 'x')
    for (const x of xs) candidates.push({ kind: 'hzv', cb: x })
  } else if (!aH && !bH) {
    // 两条都垂直 → 竖-横-竖，过桥横线 y 取候选车道
    const ys = crossbarCandidates(A, B, nA, nB, 'y')
    for (const y of ys) candidates.push({ kind: 'vhv', cb: y })
  } else if (aH && !bH) {
    // A 横、B 竖 → L(横-竖)，拐点 (B.x, A.y)
    candidates.push({ kind: 'L-hv', cb: 0 })
  } else {
    // A 竖、B 横 → L(竖-横)，拐点 (A.x, B.y)
    candidates.push({ kind: 'L-vh', cb: 0 })
  }

  // 评分：优先"完全不撞"；同级优先拐点在两端子中点的（最短/最居中）；再比总长
  let best = null
  let bestScore = Infinity
  for (const c of candidates) {
    const pts = buildPath(c.kind, A, nA, B, nB, c.cb)
    const hit = pathCollides(pts, rects, wires)
    const mid = c.kind === 'hzv' ? Math.abs(c.cb - (A.x + B.x) / 2)
      : c.kind === 'vhv' ? Math.abs(c.cb - (A.y + B.y) / 2)
      : 0
    const score = (hit ? 100000 : 0) + mid * 4 + pathLen(pts) * 0.05
    if (score < bestScore) {
      bestScore = score
      best = pts
    }
  }
  return best || [[A.x, A.y], [B.x, B.y]]
}

// 主入口：返回 Map<wireId, [[x,y], ...]>（每条导线最多 2 个 90° 弯）
export function routeAllWires(comps, wires) {
  const map = new Map()
  for (const w of wires) {
    // 顺序布线：后布的线会主动避开先布好的导线折线
    const routed = []
    for (const id of map.keys()) routed.push(map.get(id))
    const pts = routeOneWire(w, comps, routed)
    map.set(w.id, pts && pts.length >= 2 ? pts : [[0, 0], [0, 0]])
  }
  return map
}

export function toPathD(pts) {
  if (!pts || pts.length < 2) return ''
  return pts
    .map((p, i) =>
      i === 0 ? `M ${p[0].toFixed(1)} ${p[1].toFixed(1)}` : `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`
    )
    .join(' ')
}
