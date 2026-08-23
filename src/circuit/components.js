// 电路元件字典：端子定义、默认参数、支路模型（供 MNA 求解），以及
// 「实物图」与「电路图符号」两套 SVG 渲染。
// 坐标约定：本地坐标以元件中心 (0,0) 为原点，搭建台会把 <g> 平移/旋转到元件位置。

export const RHEO_MAX = 20 // 滑动变阻器最大阻值 (Ω)

// 调色板顺序（电池固定排首位，符合"先有电源"的认知）
export const COMP_TYPES = ['battery', 'switch', 'bulb', 'resistor', 'rheostat', 'ammeter', 'voltmeter']

export const META = {
  battery: {
    label: '电池',
    color: '#ff5b67',
    terminals: [
      { id: 'p', x: 44, y: 0, name: '+' },
      { id: 'n', x: -44, y: 0, name: '−' }
    ],
    defaults: { E: 6 }
  },
  switch: {
    label: '开关',
    color: '#7fd1a0',
    terminals: [
      { id: 'a', x: -44, y: 0, name: '' },
      { id: 'b', x: 44, y: 0, name: '' }
    ],
    defaults: { open: false }
  },
  bulb: {
    label: '灯泡',
    color: '#ffd34d',
    terminals: [
      { id: 'a', x: -44, y: 0, name: '' },
      { id: 'b', x: 44, y: 0, name: '' }
    ],
    defaults: { R: 8 }
  },
  resistor: {
    label: '电阻',
    color: '#56b6ff',
    terminals: [
      { id: 'a', x: -44, y: 0, name: '' },
      { id: 'b', x: 44, y: 0, name: '' }
    ],
    defaults: { R: 10 }
  },
  rheostat: {
    label: '滑动变阻器',
    color: '#56b6ff',
    terminals: [
      { id: 'A', x: -44, y: 0, name: 'A' },
      { id: 'B', x: 44, y: 0, name: 'B' },
      { id: 'C', x: 0, y: -32, name: 'C' }
    ],
    defaults: { frac: 0.5 }
  },
  ammeter: {
    label: '电流表',
    color: '#56b6ff',
    terminals: [
      { id: 'a', x: -44, y: 0, name: '' },
      { id: 'b', x: 44, y: 0, name: '' }
    ],
    defaults: {}
  },
  voltmeter: {
    label: '电压表',
    color: '#56b6ff',
    terminals: [
      { id: 'a', x: -44, y: 0, name: '' },
      { id: 'b', x: 44, y: 0, name: '' }
    ],
    defaults: {}
  }
}

// 根据元件类型构造支路列表（供 MNA）。a/b 为端子全键 `${compId}:${portId}`。
export function buildBranches(type, compId, params) {
  const k = (p) => `${compId}:${p}`
  if (type === 'battery') return [{ a: k('p'), b: k('n'), E: params.E || 6 }]
  if (type === 'switch') return [{ a: k('a'), b: k('b'), R: params.open ? 1e9 : 1e-3 }]
  if (type === 'bulb' || type === 'resistor') return [{ a: k('a'), b: k('b'), R: params.R || 10 }]
  if (type === 'ammeter') return [{ a: k('a'), b: k('b'), R: 1e-3 }]
  if (type === 'voltmeter') return [{ a: k('a'), b: k('b'), R: 1e6 }]
  if (type === 'rheostat') {
    const frac = typeof params.frac === 'number' ? params.frac : 0.5
    return [
      { a: k('A'), b: k('C'), R: Math.max(0.01, frac * RHEO_MAX) },
      { a: k('C'), b: k('B'), R: Math.max(0.01, (1 - frac) * RHEO_MAX) }
    ]
  }
  return []
}

// ---------- 实物图渲染（返回 SVG 内部标记字符串） ----------
// state: { id, glow, open, frac, V, I, reading, selected }
export function buildArt(type, state = {}) {
  const id = state.id || 'x'
  const glow = state.glow || 0
  switch (type) {
    case 'battery':
      return `
        <defs><linearGradient id="bat${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#5a6473"/><stop offset="1" stop-color="#2c333f"/>
        </linearGradient></defs>
        <rect x="-34" y="-24" width="68" height="48" rx="9" fill="url(#bat${id})" stroke="#1c222c" stroke-width="2"/>
        <rect x="30" y="-11" width="14" height="22" rx="3" fill="#e2e8f0" stroke="#9aa3b0"/>
        <rect x="-44" y="-11" width="14" height="22" rx="3" fill="#b6bfcc" stroke="#7c8493"/>
        <text x="-8" y="-4" font-size="12" font-weight="700" fill="#ffd9dc" text-anchor="middle" font-family="system-ui">电池</text>
        <text x="-8" y="14" font-size="12" font-weight="700" fill="#ff8a93" text-anchor="middle" font-family="system-ui">${state.V != null ? state.V.toFixed(1) : '6.0'}V</text>
        <text x="44" y="-16" font-size="13" font-weight="800" fill="#ff5b67" text-anchor="middle" font-family="system-ui">+</text>
        <text x="-44" y="-16" font-size="15" font-weight="800" fill="#cfd6df" text-anchor="middle" font-family="system-ui">−</text>`
    case 'switch': {
      const closed = !state.open
      const lx = -44, ly = 0, rx = 44, ry = 0
      const lever = closed
        ? `<line x1="${lx}" y1="${ly}" x2="${rx}" y2="${ry}" stroke="#7fd1a0" stroke-width="5" stroke-linecap="round"/>`
        : `<line x1="${lx}" y1="${ly}" x2="${rx - 14}" y2="${ry - 22}" stroke="#ffb454" stroke-width="5" stroke-linecap="round"/>`
      return `
        <line x1="-44" y1="0" x2="-26" y2="0" stroke="#cfd6df" stroke-width="4"/>
        <line x1="26" y1="0" x2="44" y2="0" stroke="#cfd6df" stroke-width="4"/>
        <circle cx="${lx}" cy="${ly}" r="5" fill="#cfd6df"/>
        <circle cx="${rx}" cy="${ry}" r="5" fill="#cfd6df"/>
        ${lever}
        <text x="0" y="-30" font-size="11" font-weight="700" fill="${closed ? '#7fd1a0' : '#ffb454'}" text-anchor="middle" font-family="system-ui">${closed ? '闭合' : '断开'}</text>`
    }
    case 'bulb': {
      const on = glow > 0.04
      const fill = on
        ? `rgba(255,225,110,${0.45 + glow * 0.55})`
        : 'rgba(150,140,110,0.45)'
      const halo = on
        ? `<circle cx="0" cy="0" r="${26 + glow * 30}" fill="rgba(255,224,120,${0.12 + glow * 0.4})"/>`
        : ''
      return `
        ${halo}
        <line x1="-44" y1="0" x2="-22" y2="0" stroke="#cfd6df" stroke-width="4"/>
        <line x1="22" y1="0" x2="44" y2="0" stroke="#cfd6df" stroke-width="4"/>
        <circle cx="0" cy="0" r="22" fill="${fill}" stroke="#d8a93a" stroke-width="2.4"/>
        <circle cx="-6" cy="-6" r="6" fill="rgba(255,255,255,${on ? 0.7 : 0.3})"/>
        <path d="M -12 6 L -4 -2 L 2 6 L 10 -4" fill="none" stroke="${on ? '#caa23a' : '#6b6043'}" stroke-width="2" stroke-linejoin="round"/>
        ${state.reading ? `<text x="0" y="40" font-size="11" font-weight="700" fill="var(--bb-amber)" text-anchor="middle" font-family="system-ui">${state.reading}</text>` : ''}`
    }
    case 'resistor':
      return `
        <line x1="-44" y1="0" x2="-26" y2="0" stroke="#cfd6df" stroke-width="4"/>
        <line x1="26" y1="0" x2="44" y2="0" stroke="#cfd6df" stroke-width="4"/>
        <rect x="-26" y="-13" width="52" height="26" rx="4" fill="#cdd9e8" stroke="#5b86b3" stroke-width="2"/>
        <rect x="-20" y="-13" width="5" height="26" fill="#5b86b3"/>
        <rect x="-6" y="-13" width="5" height="26" fill="#5b86b3"/>
        <rect x="14" y="-13" width="5" height="26" fill="#5b86b3"/>
        <text x="0" y="-20" font-size="11" font-weight="700" fill="var(--bb-blue)" text-anchor="middle" font-family="system-ui">${state.R != null ? state.R : 10}Ω</text>`
    case 'rheostat': {
      const frac = typeof state.frac === 'number' ? state.frac : 0.5
      const sliderX = -44 + frac * 88
      return `
        <line x1="-44" y1="0" x2="-30" y2="0" stroke="#cfd6df" stroke-width="4"/>
        <line x1="30" y1="0" x2="44" y2="0" stroke="#cfd6df" stroke-width="4"/>
        <rect x="-30" y="-9" width="60" height="18" rx="9" fill="#e7edf5" stroke="#5b86b3" stroke-width="2"/>
        <path d="M -28 0 L -20 -6 L -12 6 L -4 -6 L 4 6 L 12 -6 L 20 6 L 28 0" fill="none" stroke="#3f6f9c" stroke-width="2.4" stroke-linejoin="round"/>
        <line x1="0" y1="-32" x2="0" y2="-9" stroke="#cfd6df" stroke-width="3"/>
        <circle cx="0" cy="-32" r="4" fill="#cfd6df"/>
        <polygon points="${sliderX - 7},-9 ${sliderX + 7},-9 ${sliderX},4" fill="#ff7a85" stroke="#c23b46" stroke-width="1.5"/>
        <text x="0" y="22" font-size="10" font-weight="700" fill="var(--bb-blue)" text-anchor="middle" font-family="system-ui">R=${(frac * RHEO_MAX).toFixed(0)}Ω</text>`
    }
    case 'ammeter':
    case 'voltmeter': {
      const isA = type === 'ammeter'
      const needle = isA ? (state.reading ? Math.max(-50, Math.min(50, parseFloat(state.reading) * 18)) : 0) : 0
      return `
        <line x1="-44" y1="0" x2="-28" y2="0" stroke="#cfd6df" stroke-width="4"/>
        <line x1="28" y1="0" x2="44" y2="0" stroke="#cfd6df" stroke-width="4"/>
        <circle cx="0" cy="0" r="28" fill="#1b2533" stroke="#56b6ff" stroke-width="2.6"/>
        <circle cx="0" cy="0" r="22" fill="#f3f7fb"/>
        <line x1="0" y1="0" x2="${needle ? Math.sin((needle * Math.PI) / 180) * 16 : 0}" y2="${-Math.cos((needle * Math.PI) / 180) * 16}" stroke="#c23b46" stroke-width="2"/>
        <circle cx="0" cy="0" r="2.4" fill="#c23b46"/>
        <text x="0" y="2" font-size="13" font-weight="800" fill="#1b3a5c" text-anchor="middle" font-family="system-ui">${isA ? 'A' : 'V'}</text>
        ${state.reading ? `<text x="0" y="44" font-size="11" font-weight="700" fill="#bfe3ff" text-anchor="middle" font-family="system-ui">${state.reading}</text>` : ''}`
    }
    default:
      return ''
  }
}

// ---------- 电路图符号渲染（标准符号，自动生成电路图时使用） ----------
export function schematicArt(type, state = {}) {
  const lit = state.glow && state.glow > 0.05
  switch (type) {
    case 'battery':
      return `
        <line x1="-44" y1="0" x2="-14" y2="0" stroke="#ff8a93" stroke-width="3"/>
        <line x1="14" y1="0" x2="44" y2="0" stroke="#ff8a93" stroke-width="3"/>
        <line x1="-14" y1="-14" x2="-14" y2="14" stroke="#ff5b67" stroke-width="3.4"/>
        <line x1="-4" y1="-7" x2="-4" y2="7" stroke="#ff5b67" stroke-width="6"/>
        <text x="0" y="26" font-size="11" font-weight="700" fill="#ff8a93" text-anchor="middle" font-family="system-ui">${state.V != null ? state.V.toFixed(1) : '6.0'}V</text>`
    case 'switch': {
      const closed = !state.open
      return `
        <line x1="-44" y1="0" x2="-14" y2="0" stroke="#aeb6c2" stroke-width="3"/>
        <line x1="14" y1="0" x2="44" y2="0" stroke="#aeb6c2" stroke-width="3"/>
        <circle cx="-14" cy="0" r="3" fill="#aeb6c2"/><circle cx="14" cy="0" r="3" fill="#aeb6c2"/>
        ${closed
          ? `<line x1="-14" y1="0" x2="14" y2="0" stroke="#7fd1a0" stroke-width="3.4" stroke-linecap="round"/>`
          : `<line x1="-14" y1="0" x2="10" y2="-18" stroke="#ffb454" stroke-width="3.4" stroke-linecap="round"/>`}`
    }
    case 'bulb':
      return `
        <line x1="-44" y1="0" x2="-18" y2="0" stroke="#aeb6c2" stroke-width="3"/>
        <line x1="18" y1="0" x2="44" y2="0" stroke="#aeb6c2" stroke-width="3"/>
        <circle cx="0" cy="0" r="18" fill="${lit ? 'rgba(255,224,120,0.5)' : '#11161d'}" stroke="#ffd34d" stroke-width="2.6"/>
        <path d="M -9 0 L 0 -9 L 0 9 L 9 0" fill="none" stroke="#ffd34d" stroke-width="2.2"/>`
    case 'resistor':
      return `
        <line x1="-44" y1="0" x2="-26" y2="0" stroke="#aeb6c2" stroke-width="3"/>
        <line x1="26" y1="0" x2="44" y2="0" stroke="#aeb6c2" stroke-width="3"/>
        <rect x="-26" y="-11" width="52" height="22" fill="#11161d" stroke="#56b6ff" stroke-width="2.6"/>
        <text x="0" y="30" font-size="11" font-weight="700" fill="#9fd4ff" text-anchor="middle" font-family="system-ui">${state.R != null ? state.R : 10}Ω</text>`
    case 'rheostat': {
      const frac = typeof state.frac === 'number' ? state.frac : 0.5
      return `
        <line x1="-44" y1="0" x2="-26" y2="0" stroke="#aeb6c2" stroke-width="3"/>
        <line x1="26" y1="0" x2="44" y2="0" stroke="#aeb6c2" stroke-width="3"/>
        <rect x="-26" y="-11" width="52" height="22" fill="#11161d" stroke="#56b6ff" stroke-width="2.6"/>
        <line x1="-26" y1="-16" x2="26" y2="-16" stroke="#ff7a85" stroke-width="2.4"/>
        <line x1="${frac * 52 - 26}" y1="-16" x2="${frac * 52 - 26}" y2="0" stroke="#ff7a85" stroke-width="2.4"/>
        <text x="0" y="30" font-size="10" font-weight="700" fill="#9fd4ff" text-anchor="middle" font-family="system-ui">${(frac * RHEO_MAX).toFixed(0)}Ω</text>`
    }
    case 'ammeter':
    case 'voltmeter': {
      const isA = type === 'ammeter'
      return `
        <line x1="-44" y1="0" x2="-20" y2="0" stroke="#aeb6c2" stroke-width="3"/>
        <line x1="20" y1="0" x2="44" y2="0" stroke="#aeb6c2" stroke-width="3"/>
        <circle cx="0" cy="0" r="20" fill="#11161d" stroke="#56b6ff" stroke-width="2.6"/>
        <text x="0" y="4" font-size="14" font-weight="800" fill="#9fd4ff" text-anchor="middle" font-family="system-ui">${isA ? 'A' : 'V'}</text>`
    }
    default:
      return ''
  }
}

// ---------- 几何辅助：正交走线（Manhattan 路由） ----------
// 任意两点的连线都走直角（先水平到中点，再垂直，再水平），
// 让自由搭建的导线和自动生成的电路图都呈干净的"电路图"风格。
export function orthPoints(ax, ay, bx, by) {
  const mx = (ax + bx) / 2
  if (Math.abs(ax - bx) < 1 || Math.abs(ay - by) < 1) return [[ax, ay], [bx, by]]
  return [
    [ax, ay],
    [mx, ay],
    [mx, by],
    [bx, by]
  ]
}

export function orthPath(ax, ay, bx, by) {
  const p = orthPoints(ax, ay, bx, by)
  return p.map((pt, i) => (i === 0 ? `M ${pt[0]} ${pt[1]}` : `L ${pt[0]} ${pt[1]}`)).join(' ')
}

// ---------- 接线柱法向正交路由（弯折走线） ----------
// 返回某接线柱（本地端子 id + 元件旋转）在世界坐标下的"引线出口方向"：
// 导线应从该方向垂直离开接线柱，使连线像规范电路图一样从元件边缘引出。
export function terminalNormal(type, termId, rot = 0) {
  const m = META[type]
  const t = (m && m.terminals.find((p) => p.id === termId)) || { x: 44, y: 0 }
  const dx = Math.sign(t.x)
  const dy = Math.sign(t.y)
  const a = ((rot || 0) * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const nx = dx * ca - dy * sa
  const ny = dx * sa + dy * ca
  if (Math.abs(nx) >= Math.abs(ny)) return [Math.sign(nx) || 1, 0]
  return [0, Math.sign(ny) || 1]
}

// 两接线柱之间的弯折走线：先沿 A 的法向离开（引线），再走一条直角折线抵达 B。
// 若两端已在同一水平/竖直线上则直接走直线；若 B 在 A 的"反方向"侧则先竖(横)后横(竖)，
// 避免沿 A 的法向把导线穿回元件身上。返回折线点数组 [[x,y], ...]
export function routeWire(ax, ay, anx, any, bx, by, bnx, bny, stub = 18) {
  if (Math.abs(ax - bx) < 2 || Math.abs(ay - by) < 2) return [[ax, ay], [bx, by]]
  const p1 = [ax + anx * stub, ay + any * stub]
  let corner
  if (anx !== 0) {
    corner = Math.sign(bx - ax) !== Math.sign(anx) ? [p1[0], by] : [bx, p1[1]]
  } else {
    corner = Math.sign(by - ay) !== Math.sign(any) ? [bx, p1[1]] : [p1[0], by]
  }
  return [[ax, ay], p1, corner, [bx, by]]
}

export function routeWirePath(ax, ay, anx, any, bx, by, bnx, bny, stub) {
  const p = routeWire(ax, ay, anx, any, bx, by, bnx, bny, stub)
  return p.map((pt, i) => (i === 0 ? `M ${pt[0]} ${pt[1]}` : `L ${pt[0]} ${pt[1]}`)).join(' ')
}


// 沿折线按进度 t∈[0,1] 取点（电子流动画用）
export function pointOnPolyline(pts, t) {
  if (pts.length === 2) {
    return [pts[0][0] + (pts[1][0] - pts[0][0]) * t, pts[0][1] + (pts[1][1] - pts[0][1]) * t]
  }
  let total = 0
  const segs = []
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    segs.push(d)
    total += d
  }
  let dist = t * total
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? dist / segs[i] : 0
      return [
        pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f
      ]
    }
    dist -= segs[i]
  }
  return pts[pts.length - 1]
}
