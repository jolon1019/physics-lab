import { defineStore } from 'pinia'
import { META, buildBranches, RHEO_MAX, orthPoints, terminalNormal, routeWire } from '../circuit/components'
import { solveCircuit } from '../circuit/mna'

// 旋转本地坐标 (lx,ly) rot 度
function rotatePt(lx, ly, rot) {
  const r = (rot * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: lx * c - ly * s, y: lx * s + ly * c }
}

// 场景预设：以"元件下标 + 端子"描述连接，loadScene 时实例化
const SCENES = {
  // 串联：教材式矩形回路——电池+开关在上边、两灯泡在下边，四元件贴在矩形四边
  series: {
    comps: [
      { type: 'battery', x: 360, y: 160 },
      { type: 'switch', x: 640, y: 160 },
      { type: 'bulb', x: 360, y: 480 },
      { type: 'bulb', x: 640, y: 480 }
    ],
    links: [
      [[0, 'p'], [1, 'a']], // 电池正极 → 开关左端（上边中段横线）
      [[1, 'b'], [3, 'b']], // 开关右端 → 右灯泡右端（右边竖线）
      [[3, 'a'], [2, 'b']], // 右灯泡左端 → 左灯泡右端（下边横线）
      [[2, 'a'], [0, 'n']]  // 左灯泡左端 → 电池负极（左边竖线）
    ]
  },
  // 并联：教材式（图15.3-2）——开关串在干路（电池+ → 开关 → 右母线），两灯泡上下叠放、夹在左右两条竖母线之间，真正并联
  parallel: {
    comps: [
      { type: 'battery', x: 360, y: 180 },
      { type: 'switch', x: 520, y: 180 },
      { type: 'bulb', x: 560, y: 240 },
      { type: 'bulb', x: 560, y: 400 }
    ],
    links: [
      [[0, 'p'], [1, 'a']], // 电池正极 → 开关左端（干路：上边横线左段）
      [[1, 'b'], [2, 'b']], // 开关右端 → 上灯泡右端（右母线上段）
      [[1, 'b'], [3, 'b']], // 开关右端 → 下灯泡右端（右母线）
      [[2, 'b'], [3, 'b']], // 上灯泡右端 → 下灯泡右端（右母线竖线）
      [[0, 'n'], [2, 'a']], // 电池负极 → 上灯泡左端（左母线上段）
      [[0, 'n'], [3, 'a']]  // 电池负极 → 下灯泡左端（左母线下段）
    ]
  },
  rheostat: {
    comps: [
      { type: 'battery', x: 500, y: 470 },
      { type: 'rheostat', x: 330, y: 160 },
      { type: 'bulb', x: 670, y: 160 }
    ],
    links: [
      [[0, 'p'], [2, 'b']],
      [[2, 'a'], [1, 'B']],
      [[1, 'A'], [0, 'n']]
    ]
  },
  ohm: {
    comps: [
      { type: 'battery', x: 500, y: 470 },
      { type: 'switch', x: 456, y: 315, rot: 90 },
      { type: 'resistor', x: 500, y: 160 }
    ],
    links: [
      [[0, 'n'], [1, 'b']],
      [[1, 'a'], [2, 'a']],
      [[2, 'b'], [0, 'p']]
    ]
  },
  free: { comps: [], links: [] }
}

export const useCircuitStore = defineStore('circuit', {
  state: () => ({
    components: [],
    wires: [],
    tool: 'select', // select | wire | erase | rotate
    selectedId: null,
    running: true,
    scenario: 'series',
    sourceVoltage: 6,
    seq: 1,
    showSchematic: true
  }),
  getters: {
    compById: (state) => (id) => state.components.find((c) => c.id === id),
    terminalWorld: (state) => (key) => {
      const [cid, port] = key.split(':')
      const c = state.components.find((x) => x.id === cid)
      if (!c) return { x: 0, y: 0 }
      const t = META[c.type].terminals.find((p) => p.id === port)
      if (!t) return { x: c.x, y: c.y }
      const r = rotatePt(t.x, t.y, c.rot || 0)
      return { x: c.x + r.x, y: c.y + r.y }
    },
    // 构造 MNA 支路：元件支路 + 导线支路(极小电阻)
    branches: (state) => {
      const bs = []
      for (const c of state.components) {
        const params = { ...META[c.type].defaults, ...c.params }
        if (c.type === 'battery') params.E = state.sourceVoltage
        const list = buildBranches(c.type, c.id, params)
        list.forEach((br, i) => bs.push({ ...br, id: `c:${c.id}:${i}` }))
      }
      for (const w of state.wires) {
        bs.push({ id: `w:${w.id}`, a: `${w.a.comp}:${w.a.term}`, b: `${w.b.comp}:${w.b.term}`, R: 1e-3 })
      }
      return bs
    },
    solution: (state) => solveCircuit(state.branches),
    maxCurrent() {
      return this.solution.branches.reduce((m, b) => Math.max(m, Math.abs(b.I)), 0)
    },
    hasBattery: (state) => state.components.some((c) => c.type === 'battery'),
    status() {
      const sol = this.solution
      if (!sol.ok) return { closed: false, short: false, msg: sol.error || '未形成闭合回路' }
      if (sol.isShort) return { closed: true, short: true, msg: sol.error }
      if (this.maxCurrent < 0.02) {
        return {
          closed: false,
          short: false,
          msg: this.hasBattery ? '开关断开或电路开路，暂无电流' : '请放入电池（电源）'
        }
      }
      return { closed: true, short: false, msg: '' }
    },
    // 每个元件的读数 / 发光 / 表盘读数
    readouts() {
      const sol = this.solution
      const out = {}
      for (const c of this.components) {
        const base = { type: c.type, I: 0, U: 0, P: 0, glow: 0, reading: '', open: c.params.open }
        if (c.type === 'battery') {
          const br = sol.branches.find((b) => b.id === `c:${c.id}:0`)
          base.I = br ? Math.abs(br.I) : 0
          base.U = this.sourceVoltage
        } else if (c.type === 'rheostat') {
          const Va = sol.nodeV[`${c.id}:A`] || 0
          const Vb = sol.nodeV[`${c.id}:B`] || 0
          base.U = Math.abs(Va - Vb)
          base.I = base.U / RHEO_MAX
          base.P = base.U * base.I
        } else {
          const br = sol.branches.find((b) => b.id === `c:${c.id}:0`)
          if (br) {
            base.I = Math.abs(br.I)
            base.U = Math.abs(br.Va - br.Vb)
            if (c.type === 'bulb' || c.type === 'resistor') {
              base.P = base.U * base.I
              base.glow = Math.max(0, Math.min(1, base.P / 2))
            } else if (c.type === 'ammeter') {
              base.reading = base.I.toFixed(2) + 'A'
            } else if (c.type === 'voltmeter') {
              base.reading = base.U.toFixed(2) + 'V'
            }
          }
        }
        out[c.id] = base
      }
      return out
    },
    // 接线柱法向：供导线弯折走线使用
    normOf: (state) => (key) => {
      const [cid, port] = key.split(':')
      const c = state.components.find((x) => x.id === cid)
      return c ? terminalNormal(c.type, port, c.rot || 0) : [1, 0]
    },
    // 供电子流动画：每条非电池支路的折线点与电流方向
    animatedBranches() {
      const sol = this.solution
      if (!sol.ok) return []
      const arr = []
      for (const b of sol.branches) {
        let compId = null
        let kind = 'wire'
        if (b.id.startsWith('c:')) {
          compId = b.id.slice(2).split(':')[0]
          const comp = this.compById(compId)
          if (comp && comp.type === 'battery') continue
          kind = 'comp'
        }
        const A = this.terminalWorld(b.a)
        const B = this.terminalWorld(b.b)
        let pts
        if (kind === 'wire') {
          // 导线：沿接线柱法向弯折走线
          const na = this.normOf(b.a)
          const nb = this.normOf(b.b)
          pts = routeWire(A.x, A.y, na[0], na[1], B.x, B.y, nb[0], nb[1])
        } else {
          // 元件本体：直线穿过（电子在元件内部流动）
          pts = orthPoints(A.x, A.y, B.x, B.y)
        }
        if (b.Va < b.Vb) pts = pts.slice().reverse() // 常规电流由高电势流向低电势
        arr.push({ points: pts, I: Math.abs(b.I), kind, compId })
      }
      return arr
    }
  },
  actions: {
    addComponent(type, x, y) {
      const id = 'c' + this.seq++
      this.components.push({ id, type, x, y, rot: 0, params: { ...META[type].defaults } })
      return id
    },
    moveComponent(id, x, y) {
      const c = this.compById(id)
      if (c) {
        c.x = x
        c.y = y
      }
    },
    removeComponent(id) {
      this.components = this.components.filter((c) => c.id !== id)
      this.wires = this.wires.filter((w) => w.a.comp !== id && w.b.comp !== id)
      if (this.selectedId === id) this.selectedId = null
    },
    connect(a, b) {
      if (!a || !b || a.comp === b.comp) return
      const dup = this.wires.some(
        (w) =>
          (w.a.comp === a.comp && w.a.term === a.term && w.b.comp === b.comp && w.b.term === b.term) ||
          (w.a.comp === b.comp && w.a.term === b.term && w.b.comp === a.comp && w.b.term === a.term)
      )
      if (dup) return
      this.wires.push({ id: 'w' + this.seq++, a, b })
    },
    removeWire(id) {
      this.wires = this.wires.filter((w) => w.id !== id)
    },
    removeWiresAt(compId, term) {
      this.wires = this.wires.filter(
        (w) => !((w.a.comp === compId && w.a.term === term) || (w.b.comp === compId && w.b.term === term))
      )
    },
    toggleSwitch(id) {
      const c = this.compById(id)
      if (c && c.type === 'switch') c.params.open = !c.params.open
    },
    rotate(id) {
      const c = this.compById(id)
      if (c) c.rot = ((c.rot || 0) + 90) % 360
    },
    setParam(id, key, val) {
      const c = this.compById(id)
      if (c) c.params[key] = val
    },
    setVoltage(v) {
      this.sourceVoltage = v
    },
    select(id) {
      this.selectedId = id
    },
    setTool(t) {
      this.tool = t
    },
    setRunning(v) {
      this.running = v
    },
    clear() {
      this.components = []
      this.wires = []
      this.selectedId = null
    },
    loadScene(key) {
      this.clear()
      this.scenario = key
      const sc = SCENES[key]
      if (!sc) return
      const ids = sc.comps.map((c) => this.addComponent(c.type, c.x, c.y))
      sc.comps.forEach((c, i) => {
        if (c.rot) this.components.find((x) => x.id === ids[i]).rot = c.rot
      })
      for (const [a, b] of sc.links) {
        this.connect({ comp: ids[a[0]], term: a[1] }, { comp: ids[b[0]], term: b[1] })
      }
    }
  }
})
