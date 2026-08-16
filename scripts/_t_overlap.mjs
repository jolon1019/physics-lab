// 复用 store 里的几何逻辑，复算串联场景每根导线的折点，检查重合/交叉
import { META, orthPoints } from '../src/circuit/components.js'

function rotatePt(lx, ly, rot) {
  const r = (rot * Math.PI) / 180
  const c = Math.cos(r), s = Math.sin(r)
  return { x: lx * c - ly * s, y: lx * s + ly * c }
}

// 串联场景（与 SCENES.series 一致）
const comps = [
  { type: 'battery', x: 800, y: 140, rot: 0 },
  { type: 'switch', x: 380, y: 140, rot: 0 },
  { type: 'bulb', x: 424, y: 460, rot: 90 },
  { type: 'bulb', x: 844, y: 460, rot: 90 }
]
const links = [
  [[0, 'p'], [3, 'a']],
  [[3, 'b'], [2, 'b']],
  [[2, 'a'], [1, 'b']],
  [[1, 'a'], [0, 'n']]
]

function terminalWorld(c, port) {
  const t = META[c.type].terminals.find(p => p.id === port)
  const r = rotatePt(t.x, t.y, c.rot || 0)
  return { x: c.x + r.x, y: c.y + r.y }
}

const idOf = i => 'c' + (i + 1)

const wires = links.map(([a, b]) => {
  const A = terminalWorld(comps[a[0]], a[1])
  const B = terminalWorld(comps[b[0]], b[1])
  return { a: `${idOf(a[0])}.${a[1]}`, b: `${idOf(b[0])}.${b[1]}`, pts: orthPoints(A.x, A.y, B.x, B.y) }
})

console.log('=== 串联每根导线折点 ===')
for (const w of wires) {
  console.log(`${w.a} -> ${w.b}: ${w.pts.map(p => `(${p[0]},${p[1]})`).join(' ')}`)
}

// 检查水平段(y 固定)与竖直段(x 固定)是否与其他导线的水平/竖直段重合
function segments(pts) {
  const segs = []
  for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]])
  return segs
}
const all = []
wires.forEach((w, wi) => segments(w.pts).forEach((s, si) => all.push({ wi, si, ...s })))

function horiz(s) { return Math.abs(s[0][1] - s[1][1]) < 0.5 }
function vert(s) { return Math.abs(s[0][0] - s[1][0]) < 0.5 }

function overlap(a, b) {
  if (horiz(a) && horiz(b) && Math.abs(a[0][1] - b[0][1]) < 0.5) {
    const [a1, a2] = [Math.min(a[0][0], a[1][0]), Math.max(a[0][0], a[1][0])]
    const [b1, b2] = [Math.min(b[0][0], b[1][0]), Math.max(b[0][0], b[1][0])]
    const lo = Math.max(a1, b1), hi = Math.min(a2, b2)
    return hi - lo > 1 ? `水平重合 x∈[${lo},${hi}] y=${a[0][1]}` : null
  }
  if (vert(a) && vert(b) && Math.abs(a[0][0] - b[0][0]) < 0.5) {
    const [a1, a2] = [Math.min(a[0][1], a[1][1]), Math.max(a[0][1], a[1][1])]
    const [b1, b2] = [Math.min(b[0][1], b[1][1]), Math.max(b[0][1], b[1][1])]
    const lo = Math.max(a1, b1), hi = Math.min(a2, b2)
    return hi - lo > 1 ? `竖直重合 y∈[${lo},${hi}] x=${a[0][0]}` : null
  }
  return null
}

console.log('\n=== 重合检测 ===')
let found = false
for (let i = 0; i < all.length; i++) {
  for (let j = i + 1; j < all.length; j++) {
    const r = overlap(all[i], all[j])
    if (r) { found = true; console.log(`导线${all[i].wi}段${all[i].si} 与 导线${all[j].wi}段${all[j].si}: ${r}`) }
  }
}
if (!found) console.log('无重合段')
