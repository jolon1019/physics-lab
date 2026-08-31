<script setup>
// 自由搭建台：实物图元件可拖拽，端子间拖动连线，闭合后电子流动画。
// 内部坐标 1000×640，SVG 自适应缩放（响应式）；指针坐标经 getScreenCTM 反算。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { META } from '../../circuit/components'
import { catmullRomSpline, pathFromPolyline, polylineLength, pointOnPolyline } from '../../circuit/smoothWire'
import { componentArtSvg } from '../../circuit/componentArt'
import { useCircuitStore } from '../../stores/circuit'
import BlackBoardBg from './BlackBoardBg.vue'

const store = useCircuitStore()
const svgRef = ref(null)

const dragComp = ref(null) // { id, offX, offY }
const dragJoint = ref(null) // { id, idx } 正在拖拽的导线关节
const dragSlider = ref(null) // 正在拖拽的滑动变阻器滑片（元件 id）
const activeWireId = ref(null) // 当前点选的导线：只有被点中的导线才显示关节点
const pendingTerm = ref(null) // 已选中的首个接线柱 { comp, term }，等待第二次点击
const pendingRewire = ref(null) // 已拿起的线头 { wireId, end }，点接线柱完成改接
const pendingTapWire = ref(null) // 待搭接的导线 id：先点中点接线口，再点接线柱
const mousePos = ref({ x: 0, y: 0 }) // 鼠标在 SVG 坐标，用于连线预览

// 导线绝缘皮可选颜色
const WIRE_COLORS = ['#e2382a', '#f0a63a', '#43a35f', '#3d84d8', '#6b7686']

const phase = ref(0)
let raf = null
let last = 0

function toSvg(evt) {
  const svg = svgRef.value
  const pt = svg.createSVGPoint()
  pt.x = evt.clientX
  pt.y = evt.clientY
  const m = svg.getScreenCTM().inverse()
  const p = pt.matrixTransform(m)
  return { x: p.x, y: p.y }
}

function terminalWorldPos(compId, term) {
  return store.terminalWorld(`${compId}:${term}`)
}

const pendingPos = computed(() =>
  pendingTerm.value ? terminalWorldPos(pendingTerm.value.comp, pendingTerm.value.term) : { x: 0, y: 0 }
)

function artState(c) {
  const r = store.readouts[c.id] || {}
  const p = c.params
  const reading =
    c.type === 'bulb' && r.I ? r.I.toFixed(2) + 'A' : c.type === 'ammeter' || c.type === 'voltmeter' ? r.reading : ''
  return {
    id: c.id,
    glow: r.glow || 0,
    open: r.open,
    frac: p.frac,
    V: c.type === 'battery' ? store.sourceVoltage : p.E,
    R: p.R,
    reading
  }
}

// ---------- 矢量元件渲染 ----------
// 用 componentArt.js 的写实矢量图（替代原 PNG），端子坐标 (±44) 不变，导线对齐不受影响。
// 返回 SVG 标记字符串，用 v-html 注入到组件 <g> 内（与 buildArt 同模式）。
// 灯泡辉光使用根 SVG 里定义的径向渐变 #g-bulb-glow / #g-bulb-core。
function pngArtHtml(type, st) {
  const art = componentArtSvg(type, {
    open: !!st.open,
    frac: typeof st.frac === 'number' ? st.frac : 0.5,
    resistance: st.resistance
  })
  let extra = ''
  if (type === 'bulb') {
    const g = st.glow || 0
    if (g > 0.04) {
      // 辉光中心对准玻璃泡（局部 (0,-22)）：更大半径 + 更高不透明度，明亮更醒目
      const r = 34 + g * 56
      const a = 0.32 + g * 0.68
      extra += `<circle cx="0" cy="-22" r="${r}" fill="url(#g-bulb-glow)" opacity="${a.toFixed(3)}" />`
      extra += `<circle cx="0" cy="-22" r="${17 + g * 7}" fill="url(#g-bulb-core)" opacity="${(0.3 + g * 0.7).toFixed(3)}" />`
      // 高功率时叠加一层热色光晕，模拟灯丝白炽
      if (g > 0.5) {
        extra += `<circle cx="0" cy="-22" r="${9 + g * 5}" fill="#ffd873" opacity="${((g - 0.5) * 1.4).toFixed(3)}" />`
      }
    }
  } else if (type === 'switch') {
    const closed = !st.open
    extra += `<text x="0" y="-42" font-size="11" font-weight="700" fill="${closed ? 'var(--bb-green)' : 'var(--bb-amber)'}" text-anchor="middle" font-family="system-ui">${closed ? '闭合' : '断开'}</text>`
  } else if (type === 'battery') {
    const v = st.V != null ? st.V.toFixed(1) : '6.0'
    extra += `<text x="0" y="42" font-size="10" font-weight="700" fill="var(--bb-fg-dim)" text-anchor="middle" font-family="system-ui">电源 ${v} V</text>`
  } else if (type === 'rheostat') {
    // 滑片已由 componentArt 矢量绘出（位置由 frac 驱动），此处只画 Ω 标签
    const rOhm = Math.round((typeof st.frac === 'number' ? st.frac : 0.5) * 20)
    extra += `<text x="0" y="40" font-size="10" font-weight="700" fill="var(--bb-blue)" text-anchor="middle" font-family="system-ui">R=${rOhm} Ω</text>`
  } else if (type === 'ammeter' || type === 'voltmeter') {
    // 表体上部深色屏（局部 y ≈ -38..-4），数字读数画在屏内
    const txt = st.reading || (type === 'ammeter' ? '0.00A' : '0.00V')
    extra += `<text x="0" y="-21" font-size="13" font-weight="800" fill="#ff5b67" text-anchor="middle" font-family="ui-monospace,monospace">${txt}</text>`
  }
  return art + extra
}

// 导线最终 path：store.wirePaths 已含避让布线 + 用户关节点。
// - 若用户尚未拖动任何关节：直接渲染原始折线（stroke-linejoin:round 圆角），
//   正交布线拐角保持方正，无 Catmull-Rom 过冲
// - 若至少一个关节已拖拽：对整根线做 Catmull-Rom 过点样条，得到自然平滑曲线，
//   关节永远落在曲线上（用户拖到哪边就弯向哪边）
// 接线点/关节/电子全部使用和 canvas 渲染同一个曲线，保证几何完全重合，无悬空。
function wireSmoothPts(w) {
  const pts = store.wirePaths.get(w.id)
  if (!pts || pts.length < 2) return []
  const hasDragged = w.joints && w.joints.some(j => Array.isArray(j))
  return hasDragged ? catmullRomSpline(pts) : pts
}
function wirePathD(w) {
  return pathFromPolyline(wireSmoothPts(w))
}

// 关节圆点位置：已拖拽的关节本身就是样条控制点（精确在线上）；
// 未拖拽的在最终样条曲线上按弧长 1/3、2/3 取样（而非折线上，避免圆点悬空）
function jointDots(w) {
  const out = []
  const smooth = wireSmoothPts(w)
  for (let i = 0; i < 2; i++) {
    const saved = Array.isArray(w.joints) && w.joints[i]
    if (saved) {
      out.push(saved)
      continue
    }
    out.push(pointOnPolyline(smooth, i === 0 ? 1 / 3 : 2 / 3))
  }
  return out
}

// 每条导线承载的电流（由 animatedBranches 汇总），用于「通电变黄」高亮
const wireCurrent = computed(() => {
  const m = {}
  for (const br of store.animatedBranches) {
    if (br.kind === 'wire' && br.wireId) m[br.wireId] = (m[br.wireId] || 0) + Math.abs(br.I)
  }
  return m
})

// ---------- 导线选中态辅助：中点 / 端点 / 搭接点 / 颜色 ----------
function wireMid(w) {
  return pointOnPolyline(wireSmoothPts(w), 0.5)
}
// 导线的"接线点"：已有搭接时为接线点位置（所有支线的汇合点），否则为线中点。
// 后续连线必须接到这个点 —— 接线口、预览线、T 点圆点三者始终重合。
function junctionPos(w) {
  const x = store.wires.find((v) => v.tap && v.tap.wire === w.id)
  if (!x) return null
  const smooth = wireSmoothPts(x)
  if (smooth.length) return { x: smooth[smooth.length - 1][0], y: smooth[smooth.length - 1][1] }
  return null
}
function wirePort(w) {
  return junctionPos(w) || wireMid(w)
}
function wireEndPos(w, end) {
  return store.terminalWorld(`${w[end].comp}:${w[end].term}`)
}
function wireStyle(w) {
  return w.color ? { '--wire-color': w.color } : undefined
}
// 其他导线搭接到本线上的接点位置：取支线渲染曲线的终点（与可见导线严格一致）
function tapDotsOn(w) {
  const out = []
  for (const x of store.wires) {
    if (!x.tap || x.tap.wire !== w.id) continue
    const smooth = wireSmoothPts(x)
    if (smooth.length) out.push(smooth[smooth.length - 1])
  }
  return out
}
// 连线/改接/搭接的预览虚线起点
const previewLine = computed(() => {
  let from = null
  if (pendingTerm.value) {
    from = pendingPos.value
  } else if (pendingRewire.value) {
    const w = store.wires.find((x) => x.id === pendingRewire.value.wireId)
    if (w) from = wireEndPos(w, pendingRewire.value.end)
  } else if (pendingTapWire.value) {
    const w = store.wires.find((x) => x.id === pendingTapWire.value)
    if (w) from = wirePort(w)
  }
  if (!from) return ''
  return `M ${from.x} ${from.y} L ${mousePos.value.x} ${mousePos.value.y}`
})
// 该导线是否「通电」：仿真运行中 + 闭合回路 + 有电流
function isLive(id) {
  return store.running && store.status.closed && (wireCurrent.value[id] || 0) >= 0.02
}

const electrons = computed(() => {
  const out = []
  const ph = phase.value
  for (const br of store.animatedBranches) {
    if (br.I < 0.02) continue
    const rp = br.points // 与渲染一致的原始折线，电子严格贴线
    const speed = Math.min(1.3, 0.1 + br.I * 0.22)
    const total = polylineLength(rp)
    const n = Math.max(2, Math.round(total / 46))
    for (let i = 0; i < n; i++) {
      const t = ((i / n + ph * speed) % 1 + 1) % 1
      const p = pointOnPolyline(rp, t)
      out.push({ x: p[0], y: p[1], a: Math.min(1, 0.45 + br.I * 0.4) })
    }
  }
  return out
})

function onCompDown(evt, c) {
  pendingTerm.value = null // 点击元件本体视为离开连线流程
  pendingRewire.value = null
  pendingTapWire.value = null
  activeWireId.value = null
  store.select(c.id)
  const pos = toSvg(evt)
  // 记录起点：单击（几乎不移动）视为"切换开关"，拖动则移动元件
  dragComp.value = { id: c.id, offX: pos.x - c.x, offY: pos.y - c.y, sx: pos.x, sy: pos.y, moved: false }
  svgRef.value.setPointerCapture(evt.pointerId)
}

// 单击接线柱：完成改接/搭接，或进入普通连线流程（同元件/同端子取消）
function onTermClick(evt, c, t) {
  evt.stopPropagation()
  // 已拿起线头 → 改接到该接线柱
  if (pendingRewire.value) {
    const pr = pendingRewire.value
    pendingRewire.value = null
    store.rewire(pr.wireId, pr.end, { comp: c.id, term: t.id })
    return
  }
  // 待搭接导线 → 接到该接线柱
  if (pendingTapWire.value) {
    const tw = pendingTapWire.value
    pendingTapWire.value = null
    store.tapWire({ comp: c.id, term: t.id }, tw)
    return
  }
  if (!pendingTerm.value) {
    pendingTerm.value = { comp: c.id, term: t.id }
    mousePos.value = terminalWorldPos(c.id, t.id)
    return
  }
  const first = pendingTerm.value
  pendingTerm.value = null
  // 同一端子重复点击、或同一元件两端 → 视为取消，不连线
  if (first.comp === c.id && first.term === t.id) return
  if (first.comp === c.id) return
  store.connect(first, { comp: c.id, term: t.id })
}

function onWireDown(evt, w) {
  evt.stopPropagation()
  // 点选导线：仅该导线显示关节点（再点其他导线/空白处切换或取消）
  activeWireId.value = w.id
}

// 按下关节点：开始拖拽（橡皮工具下点关节 = 删除该导线）
function onJointDown(evt, w, idx) {
  evt.stopPropagation()
  dragJoint.value = { id: w.id, idx }
  try {
    svgRef.value.setPointerCapture(evt.pointerId)
  } catch (e) {}
}

// 滑动变阻器滑片：手柄局部 x（与加长版 artRheostat 的 rodX 公式一致，范围 -45..45）
function rheoHandleX(c) {
  return -45 + 90 * (typeof c.params.frac === 'number' ? c.params.frac : 0.5)
}

// 拿起线头：进入改接状态（预览线跟随鼠标；点接线柱完成，拖到接线柱上松开亦可，点空白取消）
function onEndDown(evt, w, end) {
  evt.stopPropagation()
  pendingRewire.value = { wireId: w.id, end }
  mousePos.value = wireEndPos(w, end)
  try {
    svgRef.value.setPointerCapture(evt.pointerId)
  } catch (e) {}
}

// 中点接线口：先点接线柱→再点接口，或先点接口→再点接线柱，完成 T 形搭接。
// 已有接线点的导线，接线口吸附到接线点；新支线一律汇入该点。
function onTapPortDown(evt, w) {
  evt.stopPropagation()
  if (pendingTerm.value) {
    const from = pendingTerm.value
    pendingTerm.value = null
    store.tapWire(from, w.id)
    return
  }
  pendingTapWire.value = pendingTapWire.value === w.id ? null : w.id
  const p = wirePort(w)
  mousePos.value = { x: p.x, y: p.y }
}

// 按下滑片：开始拖拽调阻值（不移动元件本体）
function onRheoDown(evt, c) {
  evt.stopPropagation()
  dragSlider.value = c.id
  try {
    svgRef.value.setPointerCapture(evt.pointerId)
  } catch (e) {}
}

// 右键单击电线 → 删除
function onWireContext(evt, w) {
  evt.preventDefault()
  evt.stopPropagation()
  store.removeWire(w.id)
}

// 工具条删除导线（同时清理其搭接支线与选中态）
function onWireDelete(id) {
  store.removeWire(id)
  if (activeWireId.value === id) activeWireId.value = null
}

function onBgDown(evt) {
  if (evt && evt.button !== 0) return // 仅左键取消选择/待连
  store.select(null)
  pendingTerm.value = null
  pendingRewire.value = null
  pendingTapWire.value = null
  activeWireId.value = null
}

function onBgContext(evt) {
  evt.preventDefault()
  pendingTerm.value = null
}

function onMove(evt) {
  // 拖拽滑动变阻器滑片：世界坐标 → 元件局部坐标（考虑旋转），映射为 frac
  if (dragSlider.value) {
    const c = store.compById(dragSlider.value)
    if (c) {
      const pos = toSvg(evt)
      const th = ((c.rot || 0) * Math.PI) / 180
      const dx = pos.x - c.x
      const dy = pos.y - c.y
      const lx = dx * Math.cos(th) + dy * Math.sin(th)
      const frac = Math.max(0, Math.min(1, (lx + 45) / 90))
      store.setParam(c.id, 'frac', frac)
    }
    return
  }
  // 拖拽导线关节：只改形状，不动接线柱
  if (dragJoint.value) {
    const pos = toSvg(evt)
    store.setJoint(dragJoint.value.id, dragJoint.value.idx, pos.x, pos.y)
    return
  }
  if (dragComp.value) {
    const pos = toSvg(evt)
    // 超过阈值判定为拖动，否则保持"未移动"→ 抬起时按开关处理
    if (Math.hypot(pos.x - dragComp.value.sx, pos.y - dragComp.value.sy) > 4) dragComp.value.moved = true
    store.moveComponent(dragComp.value.id, pos.x - dragComp.value.offX, pos.y - dragComp.value.offY)
    mousePos.value = pos
  } else if (pendingRewire.value || pendingTerm.value || pendingTapWire.value) {
    mousePos.value = toSvg(evt)
  }
}

function onUp(evt) {
  // 线头改接：拖到接线柱上松开即完成；未落在接线柱上则取消（也可用"点线头→点接线柱"两段式）
  if (pendingRewire.value) {
    const pr = pendingRewire.value
    pendingRewire.value = null
    try {
      const el = document.elementFromPoint(evt.clientX, evt.clientY)
      const termEl = el && el.closest ? el.closest('.term') : null
      if (termEl && termEl.dataset.comp) {
        store.rewire(pr.wireId, pr.end, { comp: termEl.dataset.comp, term: termEl.dataset.term })
      }
    } catch (e) {}
    try {
      svgRef.value.releasePointerCapture(evt.pointerId)
    } catch (e) {}
    return
  }
  if (dragSlider.value) {
    dragSlider.value = null
    try {
      svgRef.value.releasePointerCapture(evt.pointerId)
    } catch (e) {}
    return
  }
  if (dragJoint.value) {
    dragJoint.value = null
    try {
      svgRef.value.releasePointerCapture(evt.pointerId)
    } catch (e) {}
    return
  }
  if (dragComp.value) {
    const dc = dragComp.value
    dragComp.value = null
    // 未拖动且为开关 → 切换开合状态
    if (!dc.moved) {
      const c = store.compById(dc.id)
      if (c && c.type === 'switch') store.toggleSwitch(c.id)
    }
    try {
      svgRef.value.releasePointerCapture(evt.pointerId)
    } catch (e) {}
  }
}

function onDrop(evt) {
  const type = evt.dataTransfer.getData('text/circuit-type')
  if (!type) return
  const pos = toSvg(evt)
  const x = Math.max(60, Math.min(940, pos.x))
  const y = Math.max(60, Math.min(580, pos.y))
  const id = store.addComponent(type, x, y)
  store.select(id)
}

function loop(ts) {
  if (!last) last = ts
  const dt = Math.min((ts - last) / 1000, 0.05)
  last = ts
  if (store.running) phase.value = (phase.value + dt * 0.5) % 1
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="build-wrap">
    <BlackBoardBg variant="chalk" />
    <svg
      ref="svgRef"
      class="build-svg"
      viewBox="0 0 1000 640"
      preserveAspectRatio="xMidYMid meet"
      @dragover.prevent
      @drop="onDrop"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <defs>
        <radialGradient id="g-bulb-glow">
          <stop offset="0" stop-color="#ffe9a0" stop-opacity="0.9"/>
          <stop offset="0.5" stop-color="#ffc046" stop-opacity="0.35"/>
          <stop offset="1" stop-color="#ffc046" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="g-bulb-core">
          <stop offset="0" stop-color="#fff6cc" stop-opacity="1"/>
          <stop offset="1" stop-color="#fff6cc" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="1000" height="640" fill="transparent" pointer-events="all" @pointerdown="onBgDown($event)" @contextmenu.prevent="onBgContext" />

      <!-- 导线：三层描边模拟真实绝缘导线圆管质感（暗边 + 绝缘皮 + 高光），颜色可换、通电芯线提亮；
           点选导线后：2 个关节点 + 中点接线口（T 形搭接）+ 两端线头手柄（拿起改接）+ 工具条（颜色/删除） -->
      <g
        v-for="w in store.wires"
        :key="w.id"
        :class="{ 'is-live': isLive(w.id) }"
      >
        <path
          :d="wirePathD(w)"
          class="wire-edge"
          :style="wireStyle(w)"
          @pointerdown="onWireDown($event, w)"
          @contextmenu.stop.prevent="onWireContext($event, w)"
        />
        <path
          :d="wirePathD(w)"
          class="wire-core"
          :style="wireStyle(w)"
          @pointerdown="onWireDown($event, w)"
          @contextmenu.stop.prevent="onWireContext($event, w)"
        />
        <path :d="wirePathD(w)" class="wire-sheen" />

        <template v-if="activeWireId === w.id">
          <!-- 工具条：绝缘皮颜色 + 删除（位于导线中点上方） -->
          <g :transform="`translate(${wireMid(w)[0]}, ${wireMid(w)[1] - 36})`" class="wire-toolbar" @pointerdown.stop>
            <rect x="-86" y="-14" width="172" height="28" rx="14" class="wt-bg" />
            <circle
              v-for="(c, ci) in WIRE_COLORS"
              :key="'wc' + ci"
              :cx="-62 + ci * 24"
              cy="0"
              r="7.5"
              class="wt-swatch"
              :fill="c"
              :class="{ on: w.color === c }"
              @pointerdown.stop="store.setWireColor(w.id, c)"
            />
            <g class="wt-del" @pointerdown.stop="onWireDelete(w.id)">
              <circle cx="64" cy="0" r="9" />
              <path d="M 60.8 -3.2 L 67.2 3.2 M 67.2 -3.2 L 60.8 3.2" class="wt-x" />
            </g>
          </g>
          <!-- 中点接线口：与接线柱配合完成 T 形搭接；已有接线点时吸附到接线点 -->
          <circle
            :cx="wirePort(w).x"
            :cy="wirePort(w).y"
            r="8"
            class="tap-port"
            :class="{ pending: pendingTapWire === w.id }"
            @pointerdown.stop="onTapPortDown($event, w)"
            @contextmenu.stop.prevent
          />
          <!-- 关节命中区（大透明圆，方便触屏）+ 可见金属关节 -->
          <circle
            v-for="(jp, ji) in jointDots(w)"
            :key="'jh' + ji"
            :cx="jp[0]"
            :cy="jp[1]"
            r="13"
            class="joint-hit"
            @pointerdown.stop="onJointDown($event, w, ji)"
            @contextmenu.stop.prevent="onWireContext($event, w)"
          />
          <circle v-for="(jp, ji) in jointDots(w)" :key="'jd' + ji" :cx="jp[0]" :cy="jp[1]" r="5.5" class="joint-dot" />
          <!-- 两端线头手柄：拿起后可改接到其他接线柱 -->
          <circle
            v-for="end in ['a', 'b']"
            :key="'eh' + end"
            :cx="wireEndPos(w, end).x"
            :cy="wireEndPos(w, end).y"
            r="10"
            class="end-handle"
            @pointerdown.stop="onEndDown($event, w, end)"
          />
        </template>
      </g>

      <!-- T 形接点：顶层渲染，永远盖在所有导线之上，接头不缺角 -->
      <template v-for="w in store.wires" :key="'tdl' + w.id">
        <circle v-for="(jp, ti) in tapDotsOn(w)" :key="'tp' + ti" :cx="jp[0]" :cy="jp[1]" r="5.5" class="tap-dot" />
      </template>

      <!-- 连线/改接/搭接预览（跟随鼠标） -->
      <path v-if="previewLine" :d="previewLine" class="wire-draft" />

      <!-- 电子流动（电流方向；通电时为红色） -->
      <circle v-for="(e, i) in electrons" :key="'e' + i" :cx="e.x" :cy="e.y" r="4.4" class="electron" :opacity="e.a" />

      <!-- 元件 -->
      <g
        v-for="c in store.components"
        :key="c.id"
        :transform="`translate(${c.x},${c.y}) rotate(${c.rot || 0})`"
        :class="{ 'is-switch': c.type === 'switch' }"
        @pointerdown="onCompDown($event, c)"
      >
        <template v-if="c.id === store.selectedId">
          <rect x="-64" y="-54" width="128" height="108" rx="10" class="sel-outline" />
          <!-- 选中态浮动操作钮：逆旋转保持图标水平；删除在右上、旋转在左上 -->
          <g :transform="`rotate(${-(c.rot || 0)})`">
            <g class="ctx-btn" @pointerdown.stop="store.rotate(c.id)">
              <circle cx="-54" cy="-68" r="11" />
              <path d="M -54 -73.5 A 5.5 5.5 0 1 0 -48.5 -68" class="ctx-arc" />
              <path d="M -51 -66.4 L -48.5 -68 L -51.4 -70.4" class="ctx-arc" />
            </g>
            <g class="ctx-btn" @pointerdown.stop="store.removeComponent(c.id)">
              <circle cx="54" cy="-68" r="11" />
              <path d="M 49.8 -72.2 L 58.2 -63.8 M 58.2 -72.2 L 49.8 -63.8" class="ctx-x" />
            </g>
          </g>
        </template>
        <g v-html="pngArtHtml(c.type, artState(c))"></g>
        <!-- 滑动变阻器滑片手柄：覆盖滑杆上方，横向拖拽实时调阻值 -->
        <rect
          v-if="c.type === 'rheostat'"
          :x="rheoHandleX(c) - 18"
          y="-44"
          width="36"
          height="34"
          class="rheo-handle"
          @pointerdown.stop="onRheoDown($event, c)"
        />
        <circle
          v-for="t in META[c.type].terminals"
          :key="t.id"
          :cx="t.x"
          :cy="t.y"
          r="7"
          class="term"
          :class="{
            pending: pendingTerm && pendingTerm.comp === c.id && pendingTerm.term === t.id,
            armed: !!pendingTerm || !!pendingRewire || !!pendingTapWire
          }"
          :data-comp="c.id"
          :data-term="t.id"
          @pointerdown.stop
          @click.stop="onTermClick($event, c, t)"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.build-wrap {
  position: relative;
  width: 100%;
  background: transparent;
  border: 2px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}
.build-svg {
  display: block;
  position: relative;
  z-index: 1;
  width: 100%;
  height: clamp(380px, 56vh, 600px);
  touch-action: none;
}
/* ---------- 真实导线：三层描边模拟绝缘圆管（暗轮廓 + 皮线 + 顶部高光） ---------- */
.wire-edge {
  fill: none;
  stroke: #0d1117;
  stroke-width: 9;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.wire-core {
  fill: none;
  stroke: var(--wire-color, #4a5462);
  stroke-width: 6.6;
  stroke-linejoin: round;
  stroke-linecap: round;
  transition: stroke 0.25s ease;
}
.wire-sheen {
  fill: none;
  stroke: rgba(255, 255, 255, 0.22);
  stroke-width: 2.2;
  stroke-linecap: round;
  pointer-events: none;
}
/* 接通电源、回路有电流时：芯线提亮（保留用户选择的颜色） */
.is-live .wire-edge {
  stroke: #4c0703;
}
.is-live .wire-core {
  stroke: var(--wire-color, #e2382a);
  filter: brightness(1.3);
}
.is-live .wire-sheen {
  stroke: rgba(255, 255, 255, 0.32);
}
/* 导线关节：金属圆点 + 大命中区；悬停提示可拖 */
.joint-hit {
  fill: transparent;
  cursor: grab;
}
.joint-hit:active {
  cursor: grabbing;
}
.joint-dot {
  fill: #d7dee8;
  stroke: #10151c;
  stroke-width: 2;
  pointer-events: none;
}
.is-live .joint-dot {
  fill: #f2d9b0;
}
.wire-draft {
  fill: none;
  stroke: #56b6ff;
  stroke-width: 3;
  stroke-dasharray: 7 6;
  stroke-linecap: round;
}
/* ---------- 导线选中态：工具条 / 中点接线口 / 线头手柄 / T 形接点 ---------- */
.wire-toolbar {
  cursor: default;
}
.wt-bg {
  fill: #1d242e;
  stroke: #4a5462;
  stroke-width: 1.2;
}
.wt-swatch {
  stroke: #10151c;
  stroke-width: 1.5;
  cursor: pointer;
}
.wt-swatch.on {
  stroke: #ffd34d;
  stroke-width: 2.6;
}
.wt-del {
  cursor: pointer;
}
.wt-del circle {
  fill: #2a1518;
  stroke: #ff8a93;
  stroke-width: 1.4;
}
.wt-del:hover circle {
  fill: #43252a;
}
.wt-x {
  fill: none;
  stroke: #ff8a93;
  stroke-width: 2.2;
  stroke-linecap: round;
}
.tap-dot {
  fill: #d7dee8;
  stroke: #10151c;
  stroke-width: 1.6;
  pointer-events: none;
}
.is-live .tap-dot {
  fill: #f2d9b0;
}
.tap-port {
  fill: #1d242e;
  stroke: #56b6ff;
  stroke-width: 2;
  cursor: pointer;
}
.tap-port.pending {
  fill: #ffd34d;
  stroke: #0e1116;
}
.end-handle {
  fill: rgba(86, 182, 255, 0.18);
  stroke: #56b6ff;
  stroke-width: 2;
  cursor: grab;
}
.end-handle:active {
  cursor: grabbing;
}
.electron {
  fill: #ff3b4d;
}
.sel-outline {
  fill: none;
  stroke: #ffd34d;
  stroke-width: 2;
  stroke-dasharray: 6 5;
}
/* 选中元件的浮动操作钮：删除（右上红叉）/ 旋转（左上蓝弧箭头） */
.ctx-btn {
  cursor: pointer;
}
.ctx-btn circle {
  fill: #1d242e;
  stroke: #4a5462;
  stroke-width: 1.5;
}
.ctx-btn:hover circle {
  stroke: #ffd34d;
}
.ctx-x {
  fill: none;
  stroke: #ff8a93;
  stroke-width: 2.2;
  stroke-linecap: round;
}
.ctx-arc {
  fill: none;
  stroke: #56b6ff;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.term {
  fill: #cdd6e2;
  stroke: #0e1116;
  stroke-width: 2;
  cursor: pointer;
  transition: r 0.1s ease, fill 0.1s ease;
}
/* 滑动变阻器滑片拖拽手柄（透明命中区） */
.rheo-handle {
  fill: transparent;
  cursor: ew-resize;
}
.is-switch {
  cursor: pointer;
}
.term:hover {
  fill: #56b6ff;
}
/* 已有待连端子时：其余接线柱高亮为"可连"态 */
.term.armed {
  fill: #8fe0a0;
}
/* 已选中的首个接线柱 */
.term.pending {
  fill: #ffd34d;
  stroke: #0e1116;
  r: 9;
}
</style>
