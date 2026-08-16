// 验证新串联布局：元件贴在矩形四边，几何上无重合段、无短路
import { META, orthPoints, buildBranches } from '../src/circuit/components.js'
import { solveCircuit } from '../src/circuit/mna.js'

function rotatePt(lx, ly, rot) {
  const r = (rot * Math.PI) / 180
  const c = Math.cos(r), s = Math.sin(r)
  return { x: lx * c - ly * s, y: lx * s + ly * c }
}
const comps = [
  { type: 'battery', x: 360, y: 160, rot: 0 }, // 0 电池（上边左）
  { type: 'switch', x: 640, y: 160, rot: 0 },  // 1 开关（上边右）
  { type: 'bulb', x: 360, y: 480, rot: 0 },    // 2 灯泡左（下边左）
  { type: 'bulb', x: 640, y: 480, rot: 0 }     // 3 灯泡右（下边右）
]
const links = [
  [[0, 'p'], [1, 'a']], // 电池+ → 开关左（上边中段横线）
  [[1, 'b'], [3, 'b']], // 开关右 → 右灯泡右（右边竖线）
  [[3, 'a'], [2, 'b']], // 右灯泡左 → 左灯泡右（下边横线）
  [[2, 'a'], [0, 'n']]  // 左灯泡左 → 电池−（左边竖线）
]
function tw(c, port) {
  const t = META[c.type].terminals.find(p => p.id === port)
  const r = rotatePt(t.x, t.y, c.rot || 0)
  return { x: c.x + r.x, y: c.y + r.y }
}
const wires = links.map(([a, b]) => {
  const A = tw(comps[a[0]], a[1]), B = tw(comps[b[0]], b[1])
  return { a: `${a[0]}.${a[1]}`, b: `${b[0]}.${b[1]}`, pts: orthPoints(A.x, A.y, B.x, B.y) }
})
console.log('=== 新串联导线折点 ===')
for (const w of wires) console.log(`${w.a} -> ${w.b}: ${w.pts.map(p => `(${p[0]},${p[1]})`).join(' ')}`)
function segs(p) { const o = []; for (let i = 1; i < p.length; i++) o.push([p[i-1], p[i]]); return o }
const all = []
wires.forEach((w, wi) => segs(w.pts).forEach((s, si) => all.push({ wi, si, ...s })))
const hz = s => Math.abs(s[0][1]-s[1][1]) < 0.5, vt = s => Math.abs(s[0][0]-s[1][0]) < 0.5
function ov(a, b) {
  if (hz(a) && hz(b) && Math.abs(a[0][1]-b[0][1]) < 0.5) {
    const [a1,a2]=[Math.min(a[0][0],a[1][0]),Math.max(a[0][0],a[1][0])]
    const [b1,b2]=[Math.min(b[0][0],b[1][0]),Math.max(b[0][0],b[1][0])]
    const lo=Math.max(a1,b1), hi=Math.min(a2,b2); return hi-lo>1?`水平重合 x∈[${lo},${hi}]`:null
  }
  if (vt(a) && vt(b) && Math.abs(a[0][0]-b[0][0]) < 0.5) {
    const [a1,a2]=[Math.min(a[0][1],a[1][1]),Math.max(a[0][1],a[1][1])]
    const [b1,b2]=[Math.min(b[0][1],b[1][1]),Math.max(b[0][1],b[1][1])]
    const lo=Math.max(a1,b1), hi=Math.min(a2,b2); return hi-lo>1?`竖直重合 y∈[${lo},${hi}]`:null
  }
  return null
}
let f = false
for (let i=0;i<all.length;i++) for (let j=i+1;j<all.length;j++){ const r=ov(all[i],all[j]); if(r){f=true;console.log(`重叠: 导线${all[i].wi}段${all[i].si} 与 导线${all[j].wi}段${all[j].si}: ${r}`)} }
console.log(f ? '存在重叠!' : '✓ 无重合段')

// MNA 验证是串联且非短路
const bs = []
comps.forEach((c, i) => {
  const params = { ...META[c.type].defaults }
  if (c.type === 'battery') params.E = 6
  const list = buildBranches(c.type, 'c'+(i+1), params)
  list.forEach((br, k) => bs.push({ ...br, id: `c:c${i+1}:${k}` }))
})
links.forEach(([a, b]) => bs.push({ id: `w`, a: `c${a[0]+1}:${a[1]}`, b: `c${b[0]+1}:${b[1]}`, R: 1e-3 }))
const sol = solveCircuit(bs)
console.log('MNA ok=', sol.ok, 'isShort=', sol.isShort)
for (let i=0;i<comps.length;i++){ const br = sol.branches.find(x=>x.id===`c:c${i+1}:0`); console.log(comps[i].type, 'I=', br?br.I.toFixed(4):'—') }
