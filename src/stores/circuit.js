import { defineStore } from 'pinia'
import { META, buildBranches, RHEO_MAX, orthPoints, terminalNormal, routeWire } from '../circuit/components'
import { routeAllWires, routeTapWire } from '../circuit/wireRouter'
import { applyJoints, catmullRomSpline, pointOnPolyline, polylineDirAt } from '../circuit/smoothWire'
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
  // 并联：教材式（图15.3-2）——电池+开关在上边干路，两灯泡在中央竖直排列。
  // 下灯泡不从电源端子引线，而是从左右两条主干导线的「中点」T 形搭接（更符合实际接线习惯）
  parallel: {
    comps: [
      { type: 'battery', x: 320, y: 150 },
      { type: 'switch', x: 680, y: 150 },
      { type: 'bulb', x: 500, y: 370 },
      { type: 'bulb', x: 500, y: 535 }
    ],
    links: [
      [[0, 'p'], [1, 'a']], // 电池正极 → 开关左端（上边干路横线）
      [[0, 'n'], [2, 'a']], // 左主干线：电池负极 → 上灯泡左端
      [[1, 'b'], [2, 'b']]  // 右主干线：开关右端 → 上灯泡右端
    ],
    taps: [
      { from: [3, 'a'], to: 1 }, // 下灯泡左端 ← 搭接左主干线中点（T 形接线口）
      { from: [3, 'b'], to: 2 }  // 下灯泡右端 ← 搭接右主干线中点
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
        // 搭接导线（tap）：电气上锚定到目标导线的 a 端（导线电阻≈0，等价于接到其中点）
        let bKey = `${w.b.comp}:${w.b.term}`
        if (w.tap) {
          const tw = state.wires.find((x) => x.id === w.tap.wire)
          if (!tw) continue
          bKey = `${tw.a.comp}:${tw.a.term}`
        }
        bs.push({ id: `w:${w.id}`, a: `${w.a.comp}:${w.a.term}`, b: bKey, R: 1e-3 })
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
              base.glow = Math.max(0, Math.min(1, base.P / 1.2))
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
    // 导线避让布线结果：wireId → 折线点 [[x,y],...]（正交、绕开元件与其它导线）
    wireRoutes: (state) => routeAllWires(state.components, state.wires),
    // 每条导线的「基础折线」（避让布线；缺失时按端子法向弯折兜底），wireId → pts
    // 搭接导线不参与避让布线（其终点浮动在目标导线中点，在 wirePaths 中单独计算）
    wireBaseRoutes(state) {
      const normal = state.wires.filter((w) => !w.tap)
      const routes = routeAllWires(state.components, normal)
      const out = new Map()
      for (const w of normal) {
        const rt = routes.get(w.id)
        if (rt && rt.length >= 2) {
          out.set(w.id, rt)
          continue
        }
        const A = this.terminalWorld(`${w.a.comp}:${w.a.term}`)
        const B = this.terminalWorld(`${w.b.comp}:${w.b.term}`)
        const na = this.normOf(`${w.a.comp}:${w.a.term}`)
        const nb = this.normOf(`${w.b.comp}:${w.b.term}`)
        out.set(w.id, routeWire(A.x, A.y, na[0], na[1], B.x, B.y, nb[0], nb[1]))
      }
      return out
    },
    // 每条导线的最终折线（含用户拖拽的关节点），画布与电子流动画共用，保证二者贴合同一条曲线
    // 搭接导线（tap）：终点取目标导线最终折线的中点（正交走线接入），形成 T 形接线口
    wirePaths(state) {
      const base = this.wireBaseRoutes
      const out = new Map()
      const tapped = []
      for (const w of state.wires) {
        if (w.tap) {
          tapped.push(w)
          continue
        }
        out.set(w.id, applyJoints(base.get(w.id) || [], w.joints))
      }
      for (const w of tapped) {
        const tp = out.get(w.tap.wire)
        const A = this.terminalWorld(`${w.a.comp}:${w.a.term}`)
        const t = typeof w.tap.t === 'number' ? w.tap.t : 0.5
        if (!tp || tp.length < 2) {
          out.set(w.id, [[A.x, A.y], [A.x, A.y]])
          continue
        }
        // 接线点必须落在「画出来」的线上：若目标导线有拖拽关节则对曲线做平滑后取点，
        // 否则直接在折线上取点 —— 与画布渲染 wireSmoothPts 逻辑完全一致
        const targetWire = state.wires.find((x) => x.id === w.tap.wire)
        const targetDragged = targetWire && targetWire.joints && targetWire.joints.some((j) => Array.isArray(j))
        const tapCurve = targetDragged ? catmullRomSpline(tp) : tp
        const mid = pointOnPolyline(tapCurve, t)
        // 障碍折线：排除目标导线自身（终点在其上）；共享端子的降级为软障碍
        const hard = []
        const soft = []
        for (const [wid, pts] of out) {
          if (wid === w.tap.wire) continue
          const x = state.wires.find((v) => v.id === wid)
          const shares =
            x && ((x.a.comp === w.a.comp && x.a.term === w.a.term) || (x.b.comp === w.a.comp && x.b.term === w.a.term))
          ;(shares ? soft : hard).push(pts)
        }
        // 垂直于主干线在该点的走向进入，形成 T 形搭接，避免顺线重合
        const dir = polylineDirAt(tapCurve, t)
        const nbList = dir[0] !== 0 ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]
        const pts = routeTapWire(this.components, hard, soft, w.a.comp, w.a.term, { x: mid[0], y: mid[1] }, nbList)
        // 末端沿进入方向再穿入主干线芯线 4px：T 形接头完全咬合，平滑后也不留细缝
        if (pts.length >= 2) {
          const [px, py] = pts[pts.length - 2]
          const dx = mid[0] - px
          const dy = mid[1] - py
          const L = Math.hypot(dx, dy) || 1
          pts[pts.length - 1] = [mid[0] + (dx / L) * 4, mid[1] + (dy / L) * 4]
        }
        out.set(w.id, applyJoints(pts, w.joints))
      }
      return out
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
          // 导线：使用含关节点的最终折线（与画布渲染完全一致，电子贴线流动）
          // 注意：支路 id 为 `w:${wireId}`，而 wirePaths 以原始 wireId 为键
          const wireId = b.id.startsWith('w:') ? b.id.slice(2) : b.id
          const rt = this.wirePaths.get(wireId)
          if (rt && rt.length >= 2) {
            pts = rt
          } else {
            const na = this.normOf(b.a)
            const nb = this.normOf(b.b)
            pts = routeWire(A.x, A.y, na[0], na[1], B.x, B.y, nb[0], nb[1])
          }
          // 与画布渲染一致：若该导线有拖拽关节则做 Catmull-Rom 平滑，电子贴合同一条曲线
          const w = this.wires.find((x) => x.id === wireId)
          if (w && w.joints && w.joints.some((j) => Array.isArray(j))) {
            pts = catmullRomSpline(pts)
          }
          if (b.Va < b.Vb) pts = pts.slice().reverse() // 常规电流由高电势流向低电势
          arr.push({ points: pts, I: Math.abs(b.I), kind, compId, wireId })
          continue
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
      this.wires.push({ id: 'w' + this.seq++, a, b, joints: [] })
    },
    // 设置导线关节点位置（idx: 0/1）；关节只影响走线形状，不改接线关系
    setJoint(wireId, idx, x, y) {
      const w = this.wires.find((v) => v.id === wireId)
      if (!w) return
      if (!Array.isArray(w.joints)) w.joints = []
      w.joints[idx] = [Math.max(16, Math.min(984, x)), Math.max(16, Math.min(624, y))]
    },
    removeWire(id) {
      // 同时移除搭接在被删导线上的支线
      this.wires = this.wires.filter((w) => w.id !== id && !(w.tap && w.tap.wire === id))
    },
    // —— 改接：把导线某一端（end: 'a'|'b'）拿起，接到新的接线柱 ——
    rewire(wireId, end, to) {
      const w = this.wires.find((v) => v.id === wireId)
      if (!w || !to || (end !== 'a' && end !== 'b')) return false
      const cur = w[end]
      const other = end === 'a' ? w.b : w.a
      // 与连线规则一致：不允许同元件互连；也不允许接到另一端同一端子（等于缩成一条线）
      if (to.comp === other.comp) return false
      if (to.comp === cur.comp && to.term === cur.term) return false
      // 目标连接已存在（其它导线）则拒绝，避免重复
      const dup = this.wires.some(
        (x) =>
          x.id !== wireId &&
          ((x.a.comp === to.comp && x.a.term === to.term && x.b.comp === other.comp && x.b.term === other.term) ||
            (x.a.comp === other.comp && x.a.term === other.term && x.b.comp === to.comp && x.b.term === to.term))
      )
      if (dup) return false
      w[end] = { comp: to.comp, term: to.term }
      w.joints = [] // 端点变了，原关节位置作废，重新布线
      return true
    },
    // —— 搭接：把一个接线柱接到某条导线的中点（T 形接线口），电气上并入该导线节点 ——
    tapWire(from, targetWireId) {
      const tw = this.wires.find((v) => v.id === targetWireId)
      if (!tw || !from || tw.tap) return false // 不允许搭接到"支线"上，保持拓扑简单
      if (from.comp === tw.a.comp || from.comp === tw.b.comp) return false
      const anchor = { comp: tw.a.comp, term: tw.a.term }
      const dup = this.wires.some(
        (w) =>
          (w.a.comp === from.comp && w.a.term === from.term && w.b.comp === anchor.comp && w.b.term === anchor.term) ||
          (w.a.comp === anchor.comp && w.a.term === anchor.term && w.b.comp === from.comp && w.b.term === from.term)
      )
      if (dup) return false
      // 接线点语义：导线上一旦有搭接点，该点即成为这条线的"接线点"，
      // 后续支线必须接到同一接线点（不另开新点），所有支线汇于一点
      const exist = this.wires.find((x) => x.tap && x.tap.wire === targetWireId)
      this.wires.push({
        id: 'w' + this.seq++,
        a: { comp: from.comp, term: from.term },
        b: { ...anchor },
        tap: { wire: targetWireId, t: exist ? exist.tap.t : 0.5 },
        joints: []
      })
      return true
    },
    // —— 导线颜色（绝缘皮颜色）——
    setWireColor(id, color) {
      const w = this.wires.find((v) => v.id === id)
      if (w) w.color = color
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
      const wireIds = []
      for (const [a, b] of sc.links) {
        this.connect({ comp: ids[a[0]], term: a[1] }, { comp: ids[b[0]], term: b[1] })
        wireIds.push(this.wires[this.wires.length - 1].id)
      }
      // 场景预设的"中间搭接"：支线从指定端子 T 形接到某条主干线的中点
      for (const tp of sc.taps || []) {
        this.tapWire({ comp: ids[tp.from[0]], term: tp.from[1] }, wireIds[tp.to])
      }
    }
  }
})
