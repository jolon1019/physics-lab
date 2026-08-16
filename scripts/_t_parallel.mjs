import { META, buildBranches } from '../src/circuit/components.js'
import { solveCircuit } from '../src/circuit/mna.js'

// 方案 P：两灯泡夹在左右竖母线之间，电池跨接顶部，开关串左母线
const comps = [
  { id: 'c0', type: 'battery', x: 344, y: 160 },
  { id: 'c1', type: 'switch', x: 300, y: 320, rot: 90 },
  { id: 'c2', type: 'bulb', x: 344, y: 240 },
  { id: 'c3', type: 'bulb', x: 344, y: 400 }
]
const links = [
  [[0, 'n'], [2, 'a']], // 电池n → L1 a（左母线上段）
  [[2, 'a'], [1, 'a']], // L1 a → 开关a（左母线）
  [[1, 'b'], [3, 'a']], // 开关b → L2 a（左母线）
  [[0, 'p'], [2, 'b']], // 电池p → L1 b（右母线上段）
  [[2, 'b'], [3, 'b']]  // L1 b → L2 b（右母线）
]

function rotatePt(lx, ly, rot) {
  const r = (rot * Math.PI) / 180
  const c = Math.cos(r), s = Math.sin(r)
  return { x: lx * c - ly * s, y: lx * s + ly * c }
}
function termWorld(comp, port) {
  const t = META[comp.type].terminals.find(p => p.id === port)
  const r = rotatePt(t.x, t.y, comp.rot || 0)
  return { x: comp.x + r.x, y: comp.y + r.y }
}
function orthPoints(ax, ay, bx, by) {
  const mx = (ax + bx) / 2
  if (Math.abs(ax - bx) < 1 || Math.abs(ay - by) < 1) return [[ax, ay], [bx, by]]
  return [[ax, ay], [mx, ay], [mx, by], [bx, by]]
}

// --- 电学求解 ---
const E = 6
const bs = []
for (const c of comps) {
  const params = { ...META[c.type].defaults }
  if (c.type === 'battery') params.E = E
  const list = buildBranches(c.type, c.id, params)
  list.forEach((br, i) => bs.push({ ...br, id: `c:${c.id}:${i}` }))
}
for (const [a, b] of links) {
  bs.push({ id: `w:${a[0]}-${a[1]}-${b[0]}-${b[1]}`, a: `${comps[a[0]].id}:${a[1]}`, b: `${comps[b[0]].id}:${b[1]}`, R: 1e-3 })
}
const sol = solveCircuit(bs)
console.log('ok=', sol.ok, 'isShort=', sol.isShort, 'err=', sol.error)
for (const c of comps) {
  const br = sol.branches.find(b => b.id === `c:${c.id}:0`)
  if (!br) { console.log(c.type, 'NO BRANCH'); continue }
  const I = Math.abs(br.I), U = Math.abs(br.Va - br.Vb), P = U * I
  console.log(c.type.padEnd(8), 'I=', I.toFixed(4), 'U=', U.toFixed(3), 'P=', P.toFixed(3))
}

// --- 几何检测：导线段是否穿入灯泡圆 / 是否重合 ---
const wirePts = links.map(([a, b]) => {
  const A = termWorld(comps[a[0]], a[1])
  const B = termWorld(comps[b[0]], b[1])
  return orthPoints(A.x, A.y, B.x, B.y)
})
const bulbs = comps.filter(c => c.type === 'bulb').map(c => ({ x: c.x, y: c.y, r: 22 }))
function segHitsCircle(p1, p2, cx, cy, r) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1]
  const len2 = dx * dx + dy * dy || 1e-9
  let t = ((cx - p1[0]) * dx + (cy - p1[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const px = p1[0] + t * dx, py = p1[1] + t * dy
  return Math.hypot(px - cx, py - cy) < r
}
let hit = 0
for (const wp of wirePts) {
  for (let i = 1; i < wp.length; i++) {
    for (const bl of bulbs) {
      if (segHitsCircle(wp[i - 1], wp[i], bl.x, bl.y, bl.r)) { hit++; console.log('导线穿入灯泡:', wp[i - 1], wp[i], '灯泡', bl) }
    }
  }
}
console.log('穿灯泡段数=', hit, '(应为0)')
console.log('导线折点数:', wirePts.map(w => w.length))
