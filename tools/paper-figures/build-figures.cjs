/* 汉光九上期中 13 幅几何配图程序化重绘：SVG → Playwright(msedge) 3x 截图 PNG
 * 输出: d:/project/physics-lab/public/figures/hg-q*.png
 * 规则: 正向计算+反向验证端点；不添加原图没有的记号 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const OUTDIR = path.join(__dirname, '..', '..', 'public', 'figures')
const SERIF = "'Times New Roman',SimSun,serif"

const r = (n) => Math.round(n * 100) / 100
const line = (x1, y1, x2, y2, o = {}) =>
  `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${o.c || '#000'}" stroke-width="${o.w || 1.6}"${o.d ? ` stroke-dasharray="${o.d}"` : ''}${o.ar ? ' marker-end="url(#arw)"' : ''}/>`
const pl = (pts, o = {}) =>
  `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + r(p[0]) + ',' + r(p[1])).join(' ')}" fill="none" stroke="${o.c || '#000'}" stroke-width="${o.w || 1.8}" stroke-linejoin="round" stroke-linecap="round"${o.d ? ` stroke-dasharray="${o.d}"` : ''}/>`
const qpath = (x1, y1, cx, cy, x2, y2, o = {}) =>
  `<path d="M${r(x1)},${r(y1)} Q${r(cx)},${r(cy)} ${r(x2)},${r(y2)}" fill="none" stroke="${o.c || '#000'}" stroke-width="${o.w || 1.8}"${o.d ? ` stroke-dasharray="${o.d}"` : ''}/>`
const arc = (x1, y1, rr, x2, y2, o = {}) =>
  `<path d="M${r(x1)},${r(y1)} A${rr},${rr} 0 0 ${o.s == null ? 1 : o.s} ${r(x2)},${r(y2)}" fill="none" stroke="${o.c || '#000'}" stroke-width="${o.w || 1.5}"/>`
const txt = (x, y, s, o = {}) =>
  `<text x="${r(x)}" y="${r(y)}" text-anchor="${o.a || 'middle'}" font-size="${o.fs || 14}"${o.it ? ' font-style="italic"' : ''}${o.fw ? ` font-weight="${o.fw}"` : ''}${o.c ? ` fill="${o.c}"` : ''}>${s}</text>`
const dot = (x, y, rr = 3.2) => `<circle cx="${r(x)}" cy="${r(y)}" r="${rr}" fill="#000"/>`
const hollow = (x, y, rr = 3.5) => `<circle cx="${r(x)}" cy="${r(y)}" r="${rr}" fill="#fff" stroke="#000" stroke-width="1.4"/>`
const mlab = (x, y, n, o = {}) => txt(x, y, `M<tspan dy="3.5" font-size="${(o.fs || 14) * 0.72}">${n}</tspan>`, o)

function svgWrap(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="background:#fff;font-family:${SERIF}">
<defs><marker id="arw" viewBox="0 0 10 8" refX="9" refY="4" markerWidth="9" markerHeight="7.2" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#000"/></marker></defs>
${body}</svg>`
}
// 曲线采样: f(x)->y(数学坐标,y向上), 变换 tx,ty
const curve = (f, x0, x1, n, tx, ty, o = {}) => {
  const pts = []
  for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; pts.push([tx(x), ty(f(x))]) }
  return pl(pts, o)
}

/* ---------- q4 中心对称 ---------- */
function q4() {
  const O = [320, 220], s = 0.9
  const A = [O[0] - 155 * s, O[1] - 115 * s], B = [O[0] - 210 * s, O[1] + 110 * s], C = [O[0] - 85 * s, O[1]]
  const P = (p) => [2 * O[0] - p[0], 2 * O[1] - p[1]]
  const A2 = P(A), B2 = P(B), C2 = P(C)
  let b = ''
  b += line(A[0], A[1], A2[0], A2[1], { d: '6 4', w: 1.3 })
  b += line(B[0], B[1], B2[0], B2[1], { d: '6 4', w: 1.3 })
  b += line(C[0], C[1], C2[0], C2[1], { d: '6 4', w: 1.3 })
  b += pl([A, B, C, A]) + pl([A2, B2, C2, A2])
  for (const p of [A, B, C, A2, B2, C2]) b += dot(p[0], p[1])
  b += dot(O[0], O[1])
  b += txt(A[0] - 10, A[1] - 8, 'A', { a: 'end', it: 1 })
  b += txt(B[0] - 10, B[1] + 16, 'B', { a: 'end', it: 1 })
  b += txt(C[0] - 10, C[1] + 5, 'C', { a: 'end', it: 1 })
  b += txt(A2[0] + 10, A2[1] + 16, 'A′', { a: 'start', it: 1 })
  b += txt(B2[0] + 10, B2[1] - 8, 'B′', { a: 'start', it: 1 })
  b += txt(C2[0] + 10, C2[1] + 5, 'C′', { a: 'start', it: 1 })
  b += txt(O[0] - 10, O[1] - 8, 'O', { a: 'end', it: 1 })
  return svgWrap(640, 440, b)
}

/* ---------- q6 圆周角 ---------- */
function q6() {
  const cx = 215, cy = 200, R = 140
  const P = (deg) => [cx + R * Math.cos((deg * Math.PI) / 180), cy - R * Math.sin((deg * Math.PI) / 180)]
  const A = P(90), B = P(225), C = P(285), D = P(15)
  let b = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#000" stroke-width="1.8"/>`
  b += pl([A, B, C, D, A])
  b += line(cx, cy, B[0], B[1]) + line(cx, cy, D[0], D[1])
  for (const p of [A, B, C, D]) b += dot(p[0], p[1], 2.8)
  b += dot(cx, cy, 2.8)
  b += txt(cx - 12, cy - 8, 'O', { a: 'end', it: 1 })
  b += txt(A[0] - 4, A[1] - 10, 'A', { it: 1 })
  b += txt(B[0] - 10, B[1] + 12, 'B', { a: 'end', it: 1 })
  b += txt(C[0] - 4, C[1] + 18, 'C', { it: 1 })
  b += txt(D[0] + 10, D[1] - 4, 'D', { a: 'start', it: 1 })
  // C 处 105° 角标: 屏幕角 195°→300°, r=26
  const a1 = (195 * Math.PI) / 180, a2 = (300 * Math.PI) / 180, rc = 26
  b += arc(C[0] + rc * Math.cos(a1), C[1] + rc * Math.sin(a1), rc, C[0] + rc * Math.cos(a2), C[1] + rc * Math.sin(a2))
  const bis = (247.5 * Math.PI) / 180
  b += txt(C[0] + 46 * Math.cos(bis), C[1] + 46 * Math.sin(bis) + 5, '105°', { fs: 13 })
  // A 处小弧: 屏幕角 37.5°→112.5°, r=22
  const b1 = (37.5 * Math.PI) / 180, b2 = (112.5 * Math.PI) / 180, ra = 22
  b += arc(A[0] + ra * Math.cos(b1), A[1] + ra * Math.sin(b1), ra, A[0] + ra * Math.cos(b2), A[1] + ra * Math.sin(b2))
  return svgWrap(440, 420, b)
}

/* ---------- q8 网格三角形外心 ---------- */
function q8() {
  const cell = 52, ox = 55, oy = 40
  const px = (c) => ox + c * cell, py = (rw) => oy + rw * cell
  let b = ''
  for (let i = 0; i <= 5; i++) b += line(px(i), py(0), px(i), py(5), { d: '4 3', w: 1, c: '#555' })
  for (let i = 0; i <= 5; i++) b += line(px(0), py(i), px(5), py(i), { d: '4 3', w: 1, c: '#555' })
  // 实测: A(2,1) B(1,4) C(5,4), 候选外心 D(3,4) E(2,3) F(3,3) G(3,5), 网格 5x5
  const A = [px(2), py(1)], B = [px(1), py(4)], C = [px(5), py(4)]
  const D = [px(3), py(4)], E = [px(2), py(3)], F = [px(3), py(3)], G = [px(3), py(5)]
  b += pl([A, B, C, A], { w: 2 })
  for (const p of [A, B, C, D, E, F, G]) b += dot(p[0], p[1])
  b += txt(A[0] + 8, A[1] - 9, 'A', { a: 'start', it: 1 })
  b += txt(B[0] - 12, B[1] + 12, 'B', { a: 'end', it: 1 })
  b += txt(C[0] + 10, C[1] + 2, 'C', { a: 'start', it: 1 })
  b += txt(D[0] - 8, D[1] + 20, 'D', { a: 'end', it: 1 })
  b += txt(E[0] - 10, E[1] + 16, 'E', { a: 'end', it: 1 })
  b += txt(F[0] + 10, F[1] + 14, 'F', { a: 'start', it: 1 })
  b += txt(G[0] + 9, G[1] + 4, 'G', { a: 'start', it: 1 })
  return svgWrap(400, 360, b)
}

/* ---------- q10 旋转扇形 ---------- */
function q10() {
  const S = 130, ox = 60, base = 250
  const px = (x) => ox + x * S, py = (y) => base - y * S
  const B = [px(0), py(0)], C = [px(2.173), py(0)], A = [px(1.932), py(0.518)]
  const B2 = [px(3.864), py(0)], C2 = [px(1.982), py(1.088)]
  let b = pl([A, B, C, A]) + pl([A, B2, C2, A])
  b += line(C[0], C[1], B2[0], B2[1], { d: '6 4', w: 1.3 })
  for (const p of [A, B, C, B2, C2]) b += dot(p[0], p[1])
  b += txt(B[0] - 8, B[1] + 16, 'B', { a: 'end', it: 1 })
  b += txt(C[0], C[1] + 18, 'C', { it: 1 })
  b += txt(A[0] - 8, A[1] - 8, 'A', { a: 'end', it: 1 })
  b += txt(B2[0] + 8, B2[1] + 16, 'B′', { a: 'start', it: 1 })
  b += txt(C2[0] + 12, C2[1] - 6, 'C′', { a: 'start', it: 1 })
  return svgWrap(620, 300, b)
}

/* ---------- q11 双曲线+抛物线 4 选项 ---------- */
function q11() {
  let b = ''
  const defs = [
    { k: -1, para: (x) => x * x + 0.55, name: 'A' },
    { k: 1, para: (x) => -x * x + 0.55, name: 'B' },
    { k: 1, para: (x) => -x * x - 0.45, name: 'C' },
    { k: 1, para: (x) => x * x - 0.45, name: 'D' },
  ]
  defs.forEach((d, i) => {
    const X = 15 + i * 195, Y = 8
    const ox = X + 95, oy = Y + 95
    const tx = (x) => ox + 30 * x, ty = (y) => oy - 30 * y
    let g = ''
    g += line(ox - 75, oy, ox + 75, oy, { ar: 1, w: 1.4 })
    g += line(ox, oy + 80, ox, oy - 80, { ar: 1, w: 1.4 })
    g += txt(ox + 84, oy + 5, 'x', { it: 1, fs: 13, a: 'start' })
    g += txt(ox + 9, oy - 76, 'y', { it: 1, fs: 13, a: 'start' })
    g += txt(ox - 9, oy + 15, 'O', { it: 1, fs: 13, a: 'end' })
    // 双曲线 k/x: 两支 x∈[0.4,2.5] 与 [-2.5,-0.4]
    g += curve((x) => d.k / x, 0.4, 2.5, 40, tx, ty, { w: 1.8 })
    g += curve((x) => d.k / x, -2.5, -0.4, 40, tx, ty, { w: 1.8 })
    // 抛物线 x∈[-1.45,1.45]
    g += curve(d.para, -1.45, 1.45, 60, tx, ty, { w: 1.8 })
    b += `<g>${g}</g>`
    b += txt(X + 95, Y + 180, d.name, { fs: 17, fw: 700 })
  })
  return svgWrap(800, 195, b)
}

/* ---------- q12 抛物线 y=x²-5x-6 ---------- */
function q12() {
  const sx = 40, sy = 22
  const px = (x) => 117 + 40 * x, py = (y) => 65 - y * sy
  let b = ''
  b += line(px(-1.8), py(0), px(7.55), py(0), { ar: 1, w: 1.4 })
  b += line(px(0), py(-12.9), px(0), py(1.9), { ar: 1, w: 1.4 })
  b += curve((x) => x * x - 5 * x - 6, -1.6, 6.6, 120, px, py)
  // 直线 C(0,-6)→B(6,0)→D(7,1) 即 y=x-6
  const C = [px(0), py(-6)], B = [px(6), py(0)], D = [px(7), py(1)], A = [px(-1), py(0)]
  b += line(C[0], C[1], D[0], D[1])
  for (const p of [A, B, C, D]) b += dot(p[0], p[1], 2.8)
  b += txt(A[0] - 6, A[1] - 8, 'A', { a: 'end', it: 1 })
  b += txt(B[0], B[1] + 18, 'B', { it: 1 })
  b += txt(C[0] - 10, C[1] + 6, 'C', { a: 'end', it: 1 })
  b += txt(D[0] + 10, D[1] - 2, 'D', { a: 'start', it: 1 })
  b += txt(px(0) - 10, py(0) + 16, 'O', { a: 'end', it: 1 })
  b += txt(A[0], A[1] + 18, '−1', { fs: 12 })
  b += txt(B[0], B[1] + 34, '6', { fs: 12 })
  // 刻度短线
  b += line(A[0], py(0) - 4, A[0], py(0) + 4, { w: 1.2 })
  b += line(B[0], py(0) - 4, B[0], py(0) + 4, { w: 1.2 })
  return svgWrap(440, 355, b)
}

/* ---------- q16 一次函数+反比例 ---------- */
function q16() {
  const sx = 40, sy = 38
  const px = (x) => 92 + 40 * x, py = (y) => 282 - 38 * y
  let b = ''
  b += line(px(-0.95), py(0), px(9.75), py(0), { ar: 1, w: 1.4 })
  b += line(px(0), py(-1.2), px(0), py(6.8), { ar: 1, w: 1.4 })
  b += txt(px(9.75) + 13, py(0) + 4, 'x', { it: 1, a: 'start' })
  b += txt(px(0) + 11, py(6.8) + 2, 'y', { it: 1, a: 'start' })
  b += txt(px(0) - 10, py(0) + 16, 'O', { a: 'end', it: 1 })
  // 直线 l: y=4.5-0.5x，两端延伸（左端过 y 轴至 (-1,5)，右端穿过 x 轴交点 (9,0)）
  b += line(px(-1), py(5), px(9.55), py(-0.28))
  b += txt(px(-1) - 12, py(5) + 4, 'l', { it: 1, fs: 16, a: 'end' })
  // AC∥y 轴，C(0.5,1)，水平线 C→B(7,1)→G(8,1)
  const A = [px(0.5), py(4.25)], C = [px(0.5), py(1)], B = [px(7), py(1)], G = [px(8), py(1)]
  b += line(A[0], A[1], C[0], C[1])
  b += line(C[0], C[1], G[0], G[1])
  // C 处直角(开口右上)
  const u = 0.25
  b += pl([[C[0] + u * sx, C[1]], [C[0] + u * sx, C[1] - u * sy], [C[0], C[1] - u * sy]], { w: 1.4 })
  // M1..M6 空心小圈在线段 AB 上（y=4.5-0.5x）；M1 标签在正下方，M2~M6 在正上方
  const M = [[1, 4], [2, 3.5], [3, 3], [4, 2.5], [5, 2], [6, 1.5]]
  M.forEach(([x, y], i) => {
    const X = px(x), Y = py(y)
    b += hollow(X, Y, 4)
    if (i === 0) b += mlab(X, Y + 30, 1, { fs: 18 })
    else b += mlab(X - 3, Y - 16, i + 1, { fs: 18 })
  })
  // 双曲线 k=6：自 (1.05,5.71) 下降，在 M1/M2 间穿过 l，经 M2~M6 下方于 (6,1) 并入水平线
  b += curve((x) => 6 / x, 1.05, 6, 80, px, py)
  // 标签：A 在点右上方，B 在水平线上方，G 在水平线右端下方
  b += txt(A[0] + 14, A[1] - 28, 'A', { it: 1, fs: 16 })
  b += txt(C[0] - 2, C[1] + 22, 'C', { it: 1, fs: 16 })
  b += txt(B[0] + 6, B[1] - 18, 'B', { it: 1, fs: 16 })
  b += txt(G[0] + 4, G[1] + 12, 'G', { it: 1, fs: 16 })
  return svgWrap(510, 345, b)
}

/* ---------- q18 网格坐标系 △ABC ---------- */
function q18() {
  const c = 44, O = [280, 280]
  const px = (x) => O[0] + x * c, py = (y) => O[1] - y * c
  let b = ''
  for (let i = -5; i <= 5; i++) {
    b += line(px(i), py(-5), px(i), py(5), { d: '4 3', w: 1, c: '#555' })
    b += line(px(-5), py(i), px(5), py(i), { d: '4 3', w: 1, c: '#555' })
  }
  b += line(px(-5.4), py(0), px(5.6), py(0), { ar: 1, w: 1.5 })
  b += line(px(0), py(-5.4), px(0), py(5.6), { ar: 1, w: 1.5 })
  b += txt(px(5.6) + 8, py(0) + 5, 'x', { it: 1, a: 'start' })
  b += txt(px(0) + 12, py(5.6) + 2, 'y', { it: 1, a: 'start' })
  b += txt(px(0) - 10, py(0) + 16, 'O', { a: 'end', it: 1 })
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue
    b += txt(px(i), py(0) + 18, String(i).replace('-', '−'), { fs: 12 })
    b += txt(px(0) - 10, py(i) + 5, String(i).replace('-', '−'), { fs: 12, a: 'end' })
  }
  const A = [px(1), py(1)], B = [px(5), py(3)], C = [px(3), py(4)]
  b += pl([A, B, C, A], { w: 2 })
  for (const p of [A, B, C]) b += dot(p[0], p[1])
  b += txt(A[0] - 8, A[1] + 16, 'A', { a: 'end', it: 1 })
  b += txt(B[0] + 12, B[1] + 5, 'B', { a: 'start', it: 1 })
  b += txt(C[0], C[1] - 10, 'C', { it: 1 })
  return svgWrap(560, 560, b)
}

/* ---------- q19 图2 水温加热 (仅加热段直线, 无曲线) ---------- */
function q19() {
  const sx = 30, sy = 2.4, ox = 60, oy = 285
  const px = (x) => ox + x * sx, py = (y) => oy - y * sy
  let b = ''
  b += line(ox, oy, ox + 9 * sx, oy, { ar: 1, w: 1.5 })
  b += line(ox, oy + 15, ox, 30, { ar: 1, w: 1.5 })
  b += txt(ox + 9 * sx, oy + 20, 'x/min', { it: 1, a: 'end', fs: 14 })
  b += txt(ox + 12, 38, 'y/℃', { a: 'start', fs: 14 })
  b += txt(ox - 10, oy + 16, 'O', { a: 'end', it: 1 })
  // 加热段 (0,20)→(5,100) 实线
  b += line(px(0), py(20), px(5), py(100), { w: 2 })
  // 虚线导引: 100 水平 + 20 水平
  b += line(px(0), py(100), px(5), py(100), { d: '6 4', w: 1.3 })
  b += line(px(0), py(20), px(8), py(20), { d: '6 4', w: 1.3 })
  b += txt(ox - 8, py(100) + 5, '100', { a: 'end', fs: 13 })
  b += txt(ox - 8, py(20) + 5, '20', { a: 'end', fs: 13 })
  return svgWrap(420, 330, b)
}

/* ---------- q20 摩天轮示意图 ---------- */
function q20() {
  const cx = 215, cy = 165, R = 120
  const P = (deg) => [cx + R * Math.cos((deg * Math.PI) / 180), cy - R * Math.sin((deg * Math.PI) / 180)]
  const Pm = (deg, rr) => [cx + rr * Math.cos((deg * Math.PI) / 180), cy - rr * Math.sin((deg * Math.PI) / 180)]
  let b = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#000" stroke-width="1.8"/>`
  // 实测: 6 根辐条, Q~P 跨 60°, 相邻间隔 12°
  for (const deg of [250, 262, 274, 286, 298, 310]) { const p = P(deg); b += line(cx, cy, p[0], p[1]) }
  // 相邻辐条间等分角弧标记 (5 个, 半径 0.8R)
  for (let i = 0; i < 5; i++) {
    const a = 250 + 12 * i
    const p1 = Pm(a + 3, R * 0.8), p2 = Pm(a + 9, R * 0.8)
    b += arc(p1[0], p1[1], R * 0.8, p2[0], p2[1], { w: 1.3 })
  }
  const Q = P(250), Pp = P(310)
  b += dot(cx, cy, 2.8)
  b += txt(cx - 12, cy - 10, 'O', { a: 'end', it: 1 })
  b += txt(Q[0] - 10, Q[1] + 6, 'Q', { a: 'end', it: 1 })
  b += txt(Pp[0] + 10, Pp[1] + 8, 'P', { a: 'start', it: 1 })
  // O 竖直向下到地面, 过圆最低点小刻度
  b += line(cx, cy, cx, 302)
  b += line(cx - 5, cy + R, cx + 5, cy + R, { w: 1.2 })
  b += line(95, 302, 345, 302)
  b += txt(352, 307, '地面', { a: 'start', fs: 14 })
  return svgWrap(440, 350, b)
}

/* ---------- q21 直线+双曲线 ---------- */
function q21() {
  const u = 36, ox = 201, oy = 308
  const px = (x) => ox + x * u, py = (y) => oy - y * u
  let b = ''
  b += line(40, oy, px(7.7), oy, { ar: 1, w: 1.5 })
  b += line(ox, py(-3.7), ox, py(8.2), { ar: 1, w: 1.5 })
  b += txt(px(7.7) + 6, oy + 6, 'x', { it: 1, a: 'start' })
  b += txt(ox + 12, py(8.2) + 2, 'y', { it: 1, a: 'start' })
  b += txt(ox - 10, oy + 16, 'O', { a: 'end', it: 1 })
  // 直线 y=x+1: x∈[-4,6.9]
  b += line(px(-4), py(-3), px(6.9), py(7.9), { w: 1.8 })
  // 双曲线 y=6/x: QI 支实线, QIII 支淡
  b += curve((x) => 6 / x, 0.78, 7.3, 60, px, py, { w: 1.8 })
  b += curve((x) => 6 / x, -4.2, -1.6, 40, px, py, { w: 1.8 })
  const A = [px(2), py(3)], B = [px(-3), py(-2)]
  b += dot(A[0], A[1]) + dot(B[0], B[1])
  // 虚线导引
  b += line(A[0], A[1], A[0], oy, { d: '5 3', w: 1.2 })
  b += line(ox, A[1], A[0], A[1], { d: '5 3', w: 1.2 })
  b += line(B[0], B[1], ox, B[1], { d: '5 3', w: 1.2 })
  b += line(B[0], B[1], B[0], oy, { d: '5 3', w: 1.2 })
  // 刻度 (原图仅标 2 与 −2)
  b += txt(A[0], oy + 18, '2', { fs: 13 })
  b += txt(ox - 10, B[1] + 5, '−2', { fs: 13, a: 'end' })
  b += line(A[0], oy - 4, A[0], oy + 4, { w: 1.2 })
  b += txt(A[0] + 10, A[1] - 6, 'A', { a: 'start', it: 1 })
  b += txt(B[0] - 9, B[1] + 14, 'B', { a: 'end', it: 1 })
  return svgWrap(500, 460, b)
}

/* ---------- q23 U形尺测圆弧 5 面板 ---------- */
function q23() {
  let b = ''
  // (1) U 形尺: 外 x 20..140, 内 44..116, 0 在 y=250, 38px/cm
  {
    const X = 0
    const tick = (y) => `${line(X + 44, y, X + 37, y, { w: 1.2 })}${line(X + 116, y, X + 123, y, { w: 1.2 })}`
    let g = `<path d="M${X + 20},18 L${X + 20},262 Q${X + 80},300 ${X + 140},262 L${X + 140},18 Z" fill="none" stroke="#000" stroke-width="1.6"/>`
    g += `<path d="M${X + 44},18 L${X + 44},250 Q${X + 80},276 ${X + 116},250 L${X + 116},18 Z" fill="#fff" stroke="#000" stroke-width="1.6"/>`
    for (let k = 0; k <= 6; k++) {
      const y = 250 - 38 * k
      g += tick(y)
      g += txt(X + 30, y + 4, k, { fs: 11 })
      g += txt(X + 130, y + 4, k, { fs: 11 })
    }
    b += g
    b += txt(X + 80, 358, '（1）', { fs: 15 })
  }
  b += line(168, 170, 196, 170, { ar: 1, w: 2 })
  // (2) 矩形 + 下垂弧, B、C 直角
  {
    const X = 200
    const A = [X + 60, 80], B = [X + 60, 260], C = [X + 200, 260], D = [X + 200, 80]
    let g = pl([A, B]) + pl([C, D]) + pl([D, A])
    g += line(B[0], B[1], C[0], C[1], { d: '6 4', w: 1.3 })
    g += qpath(B[0], B[1], X + 130, 300, C[0], C[1])
    g += pl([[B[0] + 12, B[1]], [B[0] + 12, B[1] - 12], [B[0], B[1] - 12]], { w: 1.3 })
    g += pl([[C[0] - 12, C[1]], [C[0] - 12, C[1] - 12], [C[0], C[1] - 12]], { w: 1.3 })
    g += txt(A[0] - 4, A[1] - 10, 'A', { a: 'end', it: 1 })
    g += txt(B[0] - 4, B[1] + 18, 'B', { a: 'end', it: 1 })
    g += txt(C[0] + 4, C[1] + 18, 'C', { a: 'start', it: 1 })
    g += txt(D[0] + 4, D[1] - 10, 'D', { a: 'start', it: 1 })
    b += g
    b += txt(X + 130, 358, '（2）', { fs: 15 })
  }
  // (3) 30px/单位: 圆 (2,3) r=√13, 竖弦 x=0/x=4
  {
    const X = 440, u = 30
    const px = (x) => X + 20 + x * u, py = (y) => 260 - y * u
    const cx = px(2), cy = py(3), rr = Math.sqrt(13) * u
    let g = `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rr)}" fill="none" stroke="#000" stroke-width="1.7"/>`
    const A = [px(0), py(6)], B = [px(0), py(0)], C = [px(4), py(0)], D = [px(4), py(6)]
    g += line(A[0], A[1], B[0], B[1]) + line(D[0], D[1], C[0], C[1])
    g += line(cx, cy, D[0], D[1])
    g += line(cx, cy, cx + rr, cy)
    g += txt(A[0] - 8, A[1] - 6, 'A', { a: 'end', it: 1 })
    g += txt(B[0] - 8, B[1] + 12, 'B', { a: 'end', it: 1 })
    g += txt(C[0] + 8, C[1] + 14, 'C', { a: 'start', it: 1 })
    g += txt(D[0] + 8, D[1] - 6, 'D', { a: 'start', it: 1 })
    b += g
    b += txt(X + 110, 358, '（3）', { fs: 15 })
  }
  // (4) 26px/单位: 圆心 (5.125,1) r=5.125, 切线 x=0 切点 P(0,1)
  {
    const X = 690, u = 26
    const px = (x) => X + 10 + x * u, py = (y) => 235 - y * u
    const cx = px(5.125), cy = py(1), rr = 5.125 * u
    let g = `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rr)}" fill="none" stroke="#000" stroke-width="1.7"/>`
    const A = [px(0), py(6)], Pp = [px(0), py(1)], B = [px(0), py(0)]
    const D = [px(4), py(6)], C = [px(4), py(0)]
    g += line(A[0], A[1], B[0], B[1])
    g += line(D[0], D[1], C[0], C[1])
    g += qpath(B[0], B[1], (B[0] + C[0]) / 2, 247, C[0], C[1])
    g += line(Pp[0], Pp[1], C[0], C[1])
    g += dot(cx, cy, 2.6)
    g += txt(A[0] - 8, A[1] - 6, 'A', { a: 'end', it: 1 })
    g += txt(Pp[0] - 8, Pp[1] + 5, 'P', { a: 'end', it: 1 })
    g += txt(B[0] - 8, B[1] + 14, 'B', { a: 'end', it: 1 })
    g += txt(D[0], D[1] - 8, 'D', { it: 1 })
    g += txt(C[0], C[1] + 16, 'C', { it: 1 })
    b += g
    b += txt(X + 143, 358, '（4）', { fs: 15 })
  }
  // (5) 30px/单位: 圆心 (1.625,3) r≈2.577, 过 P(0,5) Q(0,1) R(4,2)
  {
    const X = 1000, u = 30
    const px = (x) => X + 15 + x * u, py = (y) => 235 - y * u
    const cx = px(1.625), cy = py(3), rr = 2.577 * u
    let g = `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rr)}" fill="none" stroke="#000" stroke-width="1.7"/>`
    const A = [px(0), py(6)], Pp = [px(0), py(5)], Q = [px(0), py(1)], B = [px(0), py(0)]
    const D = [px(4), py(6)], R = [px(4), py(2)], C = [px(4), py(0)]
    g += line(A[0], A[1], B[0], B[1])
    g += line(D[0], D[1], C[0], C[1])
    g += qpath(B[0], B[1], (B[0] + C[0]) / 2, 255, C[0], C[1])
    g += line(cx, cy, R[0], R[1])
    g += dot(cx, cy, 2.6)
    g += txt(A[0] - 8, A[1] - 6, 'A', { a: 'end', it: 1 })
    g += txt(Pp[0] - 8, Pp[1] + 5, 'P', { a: 'end', it: 1 })
    g += txt(Q[0] - 8, Q[1] + 5, 'Q', { a: 'end', it: 1 })
    g += txt(B[0] - 8, B[1] + 14, 'B', { a: 'end', it: 1 })
    g += txt(D[0], D[1] - 8, 'D', { it: 1 })
    g += txt(R[0] + 10, R[1] + 5, 'R', { a: 'start', it: 1 })
    g += txt(C[0], C[1] + 16, 'C', { it: 1 })
    b += g
    b += txt(X + 90, 358, '（5）', { fs: 15 })
  }
  return svgWrap(1180, 372, b)
}

/* ---------- q24 中点旋转 两面板 ---------- */
function q24() {
  const u = 34, base = 330
  const py = (y) => base - y * u
  let b = ''
  const panel = (ox, isFig2) => {
    const px = (x) => ox + (x + 4) * u
    const A = [px(0), py(4)], B = [px(-4), py(0)], C = [px(4), py(0)]
    const N = [px(0), py(0)]
    let g = pl([A, B, C, A], { w: 1.8 })
    if (!isFig2) {
      const D = [px(-1.5), py(2.5)], E = [px(1.5), py(2.5)], M = [px(0), py(2.5)]
      const P = [px(1.25), py(1.25)]
      g += line(D[0], D[1], E[0], E[1]) + line(D[0], D[1], C[0], C[1])
      g += line(M[0], M[1], P[0], P[1]) + line(P[0], P[1], N[0], N[1])
      for (const p of [D, E, M, P, N]) g += dot(p[0], p[1])
      g += txt(D[0] - 10, D[1] + 5, 'D', { a: 'end', it: 1 })
      g += txt(E[0] + 10, E[1] + 5, 'E', { a: 'start', it: 1 })
      g += txt(M[0], M[1] - 10, 'M', { it: 1 })
      g += txt(P[0] + 10, P[1] + 6, 'P', { a: 'start', it: 1 })
    } else {
      const D = [px(-0.185), py(1.886)], E = [px(2.114), py(3.815)], M = [px(0.964), py(2.851)]
      const P = [px(1.907), py(0.943)], N = [px(0), py(0)]
      g += line(A[0], A[1], D[0], D[1]) + line(A[0], A[1], E[0], E[1]) + line(D[0], D[1], E[0], E[1])
      g += line(D[0], D[1], C[0], C[1]) + line(E[0], E[1], C[0], C[1])
      g += line(B[0], B[1], D[0], D[1])
      g += line(M[0], M[1], P[0], P[1]) + line(P[0], P[1], N[0], N[1]) + line(M[0], M[1], N[0], N[1])
      for (const p of [D, E, M, P, N]) g += dot(p[0], p[1])
      g += txt(D[0] - 10, D[1] + 6, 'D', { a: 'end', it: 1 })
      g += txt(M[0] - 9, M[1] - 8, 'M', { a: 'end', it: 1 })
      g += txt(E[0] + 10, E[1] - 4, 'E', { a: 'start', it: 1 })
      g += txt(P[0] + 10, P[1] - 4, 'P', { a: 'start', it: 1 })
    }
    g += txt(N[0], N[1] + 17, 'N', { it: 1 })
    g += txt(A[0], A[1] - 9, 'A', { it: 1 })
    g += txt(B[0] - 2, B[1] + 18, 'B', { it: 1 })
    g += txt(C[0] + 8, C[1] + 18, 'C', { it: 1 })
    return g
  }
  b += panel(30, false)
  b += panel(360, true)
  b += txt(30 + 136, 372, '图1', { fs: 15 })
  b += txt(360 + 136, 372, '图2', { fs: 15 })
  return svgWrap(680, 390, b)
}

/* ---------- 主流程 ----------
 * 复用方法: 复制本文件为 build-figures-<paperId>.cjs, 保留 helpers,
 * 替换各 q*() 绘制函数与 FIGS 映射即可 (绘制方法见 SOP.md)。 */
const FIGS = {
  'hg-q4': q4, 'hg-q6': q6, 'hg-q8': q8, 'hg-q10': q10, 'hg-q11': q11,
  'hg-q12': q12, 'hg-q16': q16, 'hg-q18': q18, 'hg-q19': q19, 'hg-q20': q20,
  'hg-q21': q21, 'hg-q23': q23, 'hg-q24': q24,
}

;(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 3 })
  for (const [name, fn] of Object.entries(FIGS)) {
    const svgPath = path.join(__dirname, name + '.svg')
    fs.writeFileSync(svgPath, fn())
    await page.goto('file:///' + svgPath.replace(/\\/g, '/'))
    await page.waitForTimeout(250)
    await page.locator('svg').screenshot({ path: path.join(OUTDIR, name + '.png') })
    console.log('ok', name)
  }
  await browser.close()
  console.log('all done')
})()
