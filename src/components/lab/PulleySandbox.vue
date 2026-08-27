<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

/* ================= 物理模型（单绳等张力 · 教科书标准） =================
   - 一根绳张力处处相等 ⇒ 提升时所有动滑轮随重物同步上升 h（绳长守恒），
     但各动滑轮可独立摆放（各自 x / 静止高度 y0），吊绳汇聚悬挂同一重物。
   - 定滑轮逐个独立安装在顶部横梁上，可各自横向拖动，与动滑轮双向防重合。
   - 绳按之字形自动绕线：绕过动滑轮走下缘（+2 承担段），绕过定滑轮走上缘（仅改向）。
     固定头系动滑轮框 → n = 2M+1；系横梁/地面 → n = 2M。
   - F理 = (G物 + ΣG动)/n ；每处半绕摩擦 +0.04 N → F实
   - s = n·h（测力计行程按同一比例尺渲染）；η = G物·h / (F实·s) */

const G_PER_HOOK = 0.5
const G_MOVABLE = 0.4
const FRICTION_PER_WHEEL = 0.04

const MAXF = 5   // 定滑轮上限
const MAXM = 5   // 动滑轮上限

let uid = 1
const fixedWs = ref([])      // [{id, x}] 定滑轮（横梁）
const movs = ref([])         // [{id, x, y0}] 动滑轮（独立摆放，y0=静止时轮心高度）
const anchorX = ref(300)     // 固定头锚点 x
const anchorGround = ref(false) // 固定头系于地面？（false = 顶部横梁）
const tieMovable = ref(false) // 固定头系于动滑轮框？
const redirectOn = ref(false) // 加装改向轮（向下拉）
const hooks = ref(6)
const pullDist = ref(0)
const trials = ref([])
const completed = ref(false)
const feedback = ref('')
const selId = ref(null)      // 选中的定滑轮 id
const selMov = ref(null)     // 选中的动滑轮 id

/* ---------- 增删 ---------- */
function addFixed() {
  if (fixedWs.value.length >= MAXF) { flash('最多 ' + MAXF + ' 个定滑轮'); return }
  const used = fixedWs.value.map(w => w.x)
  // 新定滑轮默认放在最右定滑轮右侧 GAP_MIN 处（最右 = 锚点与动滑轮的较大者），向右找空位
  const rightMost = Math.max(anchorX.value, ...used, ...movs.value.map(m => m.x))
  fixedWs.value.push({ id: uid++, x: clampBeamX(rightMost + GAP_MIN, used) })
}
function removeFixed(id) {
  fixedWs.value = fixedWs.value.filter(w => w.id !== id)
  if (selId.value === id) selId.value = null
  // 奇数段绕法需要至少一个定滑轮改向，否则自动回落到偶数段
  if (!fixedWs.value.length && tieMovable.value) { tieMovable.value = false; redirectOn.value = false }
  // 定滑轮减少后可能无法容纳现有动滑轮数：自动裁掉多出的
  const cap = fixedWs.value.length + (tieMovable.value ? 0 : 1)
  if (Mv.value > cap) {
    movs.value = movs.value.slice(0, cap)
    flash(`定滑轮不足，已自动减少动滑轮至 ${cap} 只以保持单绳绕行成立`)
  }
  resetLift()
}
function addMovable() {
  if (movs.value.length >= MAXM) { flash('最多 ' + MAXM + ' 个动滑轮'); return }
  const cap = Nf.value + (tieMovable.value ? 0 : 1)
  if (movs.value.length + 1 > cap) {
    flash(`单绳之字绕法配对不足：当前 ${Nf.value} 个定滑轮最多带 ${cap} 只动滑轮${tieMovable.value ? '（奇数段）' : ''}，请先加定滑轮`)
    return
  }
  // 新动滑轮默认放在最右动滑轮右侧 56px、低 34px（阶梯错位减少绳段交叉）；自动避开所有轮
  const base = movs.value.length
    ? movs.value.reduce((a, b) => (b.x > a.x ? b : a))
    : { x: fixedWs.value.length ? Math.max(...fixedWs.value.map(w => w.x)) + 60 : 560, y0: 184 }
  const [nx, ny] = clampMovPos(base.x + 56, base.y0 + 34, null)
  movs.value.push({ id: uid++, x: nx, y0: ny })
  resetLift()
}
function removeMov(id) {
  movs.value = movs.value.filter(m => m.id !== id)
  if (selMov.value === id) selMov.value = null
  resetLift()
}

function flash(msg) { feedback.value = msg; setTimeout(() => { if (feedback.value === msg) feedback.value = '' }, 2200) }
function resetLift() { pullDist.value = 0 }

function setTie(v) {
  if (!movs.value.length) { flash('先添加动滑轮再选固定头系法'); return }
  if (v && Nf.value < movs.value.length) {
    flash(`奇数段（固定头系框）要求定滑轮数 ≥ 动滑轮数：当前 ${Nf.value}/${movs.value.length}`)
    return
  }
  tieMovable.value = v
  if (!v) redirectOn.value = false
  resetLift()
}
function setAnchorGround(v) {
  if (tieMovable.value) return   // 系框模式下无独立固定头
  anchorGround.value = v
  resetLift()
}
function setRedirect(v) {
  redirectOn.value = v && tieMovable.value && movs.value.length > 0
  resetLift()
}
function setCfg(xs, mv, tie, rd) {
  fixedWs.value = xs.map(x => ({ id: uid++, x }))
  movs.value = mv.map(p => ({ id: uid++, ...p }))
  anchorX.value = xs.length ? clampBeamX(xs[0] - 85, [xs[0]]) : 300
  anchorGround.value = false
  tieMovable.value = tie
  redirectOn.value = rd && tie && mv.length > 0
  selId.value = null
  selMov.value = null
  trials.value = []
  completed.value = false
  resetLift()
}

/* ================= 物理量 ================= */
const gLoad = computed(() => +(hooks.value * G_PER_HOOK).toFixed(1))
const Mv = computed(() => movs.value.length)
const Nf = computed(() => fixedWs.value.length)
/* 费力用法：固定头系地面 + 仅 1 只动滑轮 + 无定滑轮。
   绳：地锚 → 翻动滑轮上缘 → 绳端直挂重物；测力计勾轮轴上拉。
   轮升 d ⇒ 重物升 2d（绳长守恒），F = 2G物 + G动 + 摩擦 —— 费力省距离 */
const effortMode = computed(() => anchorGround.value && Mv.value === 1 && Nf.value === 0)
const nSeg = computed(() => (Mv.value === 0 ? 1 : 2 * Mv.value + (tieMovable.value ? 1 : 0)))
const fIdeal = computed(() => {
  if (effortMode.value) return 2 * gLoad.value + Mv.value * G_MOVABLE
  return (gLoad.value + Mv.value * G_MOVABLE) / nSeg.value
})
// 半绕处数：每只动滑轮 1 处下缘半绕 + 每个定滑轮 1 处上缘半绕 + 改向轮
// 无任何滑轮时测力计直接吊重物：无摩擦接触点，F = G 精确成立
const contactsN = computed(() => {
  if (effortMode.value) return 1
  if (Mv.value === 0) return Nf.value
  return Mv.value + Nf.value + (redirectOn.value ? 1 : 0)
})
const fMeas = computed(() => +(fIdeal.value + contactsN.value * FRICTION_PER_WHEEL).toFixed(2))
const effDist = computed(() => effortMode.value ? pullDist.value / 2 : nSeg.value * pullDist.value)
const wUse = computed(() => pullDist.value > 0 ? +(gLoad.value * pullDist.value / 100).toFixed(3) : null)
const wTot = computed(() => pullDist.value > 0 ? +(fMeas.value * effDist.value / 100).toFixed(3) : null)
const eta = computed(() => {
  if (!wUse.value || !wTot.value) return null
  return Math.min(100, Math.round((wUse.value / wTot.value) * 1000) / 10)
})

function recordTrial() {
  if (pullDist.value <= 0 || eta.value === null) {
    feedback.value = '请先拖动测力计提升一段高度 h > 0 再记录'
    return
  }
  trials.value.push({
    id: Date.now(),
    n: trials.value.length + 1,
    cfg: `${Mv.value}动${Nf.value}定${redirectOn.value ? '+改向' : ''}${effortMode.value ? '·费力' : ''}`,
    g: gLoad.value,
    f: fMeas.value,
    h: pullDist.value,
    s: effDist.value,
    wu: wUse.value.toFixed(2),
    wt: wTot.value.toFixed(2),
    eta: eta.value
  })
  feedback.value = ''
  if (!completed.value && trials.value.length >= 3) {
    completed.value = true
    emit('complete')
  }
}
function clearTrials() { trials.value = []; completed.value = false }

const conclusions = computed(() => {
  const out = []
  if (effortMode.value) {
    out.push(`费力用法（固定头系地 + 单动滑轮）：绳端挂重物、测力计勾动滑轮上拉 — 轮受向上拉力 F 与两段向下绳拉力平衡`)
    out.push(`F = 2×G物 + G动 + 摩擦 = 2×${gLoad.value} + ${(Mv.value * G_MOVABLE).toFixed(1)} + ${FRICTION_PER_WHEEL} = ${fMeas.value} N > G物 —— 费力`)
    out.push(`测力计只移 s = h/2 = ${effDist.value} cm，重物却升 h = ${pullDist.value} cm = 2s —— 省距离必费力气（功的原理）`)
    if (pullDist.value > 0 && wUse.value !== null && wTot.value !== null) {
      out.push(`W有 = ${wUse.value} J，W总 = ${wTot.value} J，η = ${eta.value}%；额外功 = 提动滑轮（只升 h/2）+ 摩擦`)
    }
    out.push('对照：同一只动滑轮改为"重物挂轮下、上拉绳端"（系横梁）即变省力用法 F=(G物+G动)/2 —— 力与距离的对称互换')
    return out
  }
  if (Mv.value === 0) {
    if (Nf.value === 0) {
      out.push(`无滑轮基准实验：测力计直接吊重物，拉力 F = G = ${gLoad.value} N（读数精确等于物重，无摩擦无额外功）`)
      out.push(`提升 h = ${pullDist.value} cm 时绳端 s = h（n=1），W有 = W总，η = 100% —— 这是效率的理论上限`)
      out.push('加入定滑轮只改变力的方向（F≈G）；加入动滑轮才开始省力，但η随之下降')
      return out
    }
    out.push(`仅定滑轮：实质是等臂杠杆，n=1，F≈G 不省力也不费距离（s=h）；${Nf.value} 个定滑轮只逐级改变力的方向`)
    out.push(`F=${fMeas.value} N 与 G=${gLoad.value} N 的差来自各处摩擦做的额外功`)
    out.push('添加动滑轮后每只承担 2 段绳，才能开始省力')
    return out
  }
  out.push(`固定头系于${tieMovable.value ? '动滑轮框' : (anchorGround.value ? '地面' : '横梁')} → n = ${nSeg.value}${tieMovable.value ? '（2M+1：固定头段本身也承担）' : '（2M：偶数段）'}；多余定滑轮只改向、不改变 n`)
  out.push(`F理 = (${gLoad.value} + ${(Mv.value * G_MOVABLE).toFixed(1)})/n = ${fIdeal.value.toFixed(2)} N；实际克服 ${contactsN.value} 处摩擦 → F实 = ${fMeas.value} N`)
  out.push(`s = n·h = ${effDist.value} cm —— 省力必费距离，功的原理决定 η < 100%`)
  if (pullDist.value > 0 && wUse.value !== null && wTot.value !== null) {
    const wExtra = +(wTot.value - wUse.value).toFixed(3)
    out.push(`额外功 W额 = ${wExtra} J ≈ 提起动滑轮的功 ${(Mv.value * G_MOVABLE * pullDist.value / 100).toFixed(3)} J + 摩擦功`)
  }
  if (gLoad.value < 2 * Mv.value * G_MOVABLE) {
    out.push('物重太轻、动滑轮自重占比大 → η 明显偏低；增大物重或减少动滑轮可提高 η')
  } else if (Mv.value >= 2) {
    out.push('动滑轮越多越省力，但额外功也越多，η 反而下降——"省力"与"高效"是矛盾的')
  } else {
    out.push('尝试增大钩码数：有用功占比增大，η 升高（趋近极限 100%）')
  }
  return out
})

/* ================= 画布与几何 ================= */
const canvasRef = ref(null)
let ctx = null
let raf = null
let dragging = null          // {kind:'gauge'|'asm'|'fixed'|'anchor', obj?}
let dragStartY = 0
let dragStartVal = 0
let dragOffX = 0
let prevH = 0
let rotationAngle = 0
let hitZones = []

const W = 900, H = 520
const BEAM_Y = 46
const FIX_Y = 88             // 定滑轮 cy
const R = 20                 // 轮半径
const KS = 2.4               // px/cm
const EFF_DROP0 = 96         // 费力用法：静止时绳端吊重物的下垂距离(px)
const GAPEFF = 96            // 动滑轮默认静止高度参考（FIX_Y 下方）
const GAP_MIN = 58           // 同排轮心最小间距
const WHEEL_CLR = 2 * R + 8  // 任意两轮最小圆心距（防重合 + 走绳空隙）
const BOUND_L = 132, BOUND_R = 768

/* 动滑轮独立位置：m.y0 为静止（h=0）轮心 y；提升 h 后轮心 y = m.y0 - KS*h
   费力用法：测力计勾轮轴上拉，轮只升 h/2（重物升 2×轮升） */
function curY(m) { return effortMode.value ? m.y0 - KS * pullDist.value / 2 : movY(m, pullDist.value) }
function movY(m, h) { return m.y0 - KS * h }
function loadTopY(h) {  // 负载吊环顶部：挂在最低动滑轮下方
  let low = 0
  for (const m of movs.value) low = Math.max(low, movY(m, h))
  return low + R + 34
}
function loadX() {      // 负载悬挂于各动滑轮质心
  if (!movs.value.length) return 380
  return movs.value.reduce((s, m) => s + m.x, 0) / movs.value.length
}

/* 2D 防重合：动滑轮落位约束（相对其它动滑轮 + 定滑轮 + 改向轮列） */
function clampMovPos(x, y0, excludeId) {
  let nx = Math.max(148, Math.min(818, Math.round(x)))
  let ny = Math.max(FIX_Y + 52, Math.min(H - 258, Math.round(y0)))
  const obs = []
  for (const m of movs.value) if (m.id !== excludeId) obs.push([m.x, m.y0])
  for (const w of fixedWs.value) obs.push([w.x, FIX_Y])
  if (redirectOn.value) obs.push([834, BEAM_Y + 34])
  for (let it = 0; it < 60; it++) {
    let px = 0, py = 0, hitAny = false
    for (const [ox, oy] of obs) {
      const dx = nx - ox, dy = ny - oy
      const d = Math.hypot(dx, dy)
      if (d < WHEEL_CLR) {
        hitAny = true
        if (d < 0.01) { px += WHEEL_CLR; continue }
        const push = WHEEL_CLR - d
        px += dx / d * push
        py += dy / d * push
      }
    }
    if (!hitAny) break
    nx = Math.max(148, Math.min(818, nx + px))
    ny = Math.max(FIX_Y + 52, Math.min(H - 258, ny + py))
  }
  return [nx, ny]
}

/* 定滑轮落位：与既有定滑轮同排间距约束；与动滑轮按 2D 圆距约束 */
function clampBeamX(x, others, excludeId) {
  let nx = Math.max(BOUND_L + 10, Math.min(BOUND_R - 10, x))
  const rowMates = fixedWs.value.filter(w => w.id !== excludeId).map(w => w.x)
    .concat(others || [])
  for (let it = 0; it < 40; it++) {
    let pushed = false
    for (const u of rowMates) {
      if (Math.abs(u - nx) < GAP_MIN) {
        nx += (nx <= u ? -(GAP_MIN - Math.abs(u - nx)) : (GAP_MIN - Math.abs(u - nx)))
        pushed = true
      }
    }
    for (const m of movs.value) {
      const dy = FIX_Y - m.y0
      if (Math.abs(dy) < WHEEL_CLR) {
        const req = Math.sqrt(WHEEL_CLR * WHEEL_CLR - dy * dy)
        const dx = nx - m.x
        if (Math.abs(dx) < req) { nx = m.x + (dx >= 0 ? req : -req); pushed = true }
      }
    }
    nx = Math.max(BOUND_L + 10, Math.min(BOUND_R - 10, nx))
    if (!pushed) break
  }
  return Math.round(nx)
}

/* ---------- 拖拽路由 ---------- */
let _gaugeCache = { x: 200, y: 300 }

function setupCanvas() {
  const c = canvasRef.value
  ctx = c.getContext('2d')
  c.width = 1800; c.height = 1040
  ctx.setTransform(2, 0, 0, 2, 0, 0)
}
function screenToCanvas(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top) * (H / rect.height)
  }
}
function zoneAt(p) {
  return hitZones.find(z => Math.abs(p.x - z.x) < z.rx && Math.abs(p.y - z.y) < z.ry) || null
}
function onPointerDown(e) {
  const p = screenToCanvas(e)
  const z = zoneAt(p)
  if (!z) { selId.value = null; selMov.value = null; return }
  dragging = z
  dragStartY = p.y
  dragStartVal = pullDist.value
  if (z.kind === 'fixed') { dragOffX = p.x - z.obj.x; selId.value = z.obj.id; selMov.value = null }
  else if (z.kind === 'anchor') dragOffX = p.x - anchorX.value
  else if (z.kind === 'mwheel') {
    selMov.value = z.obj.id; selId.value = null
    // 记录抓取点相对轮心（当前绘制位置）的偏移
    z.gx = p.x - z.obj.x
    z.gy = p.y - curY(z.obj)
  }
  else if (z.kind === 'gauge') { selId.value = null; selMov.value = null }
  canvasRef.value.setPointerCapture(e.pointerId)
  canvasRef.value.style.cursor = 'grabbing'
}
function onPointerMove(e) {
  const p = screenToCanvas(e)
  if (!dragging) {
    canvasRef.value.style.cursor = zoneAt(p) ? 'grab' : 'default'
    return
  }
  if (dragging.kind === 'gauge') {
    // 下拉配置：向下拖 = 提升；上拉配置：向上拖 = 提升
    const dir = finalDirIsUp() ? -1 : 1
    pullDist.value = Math.max(0, Math.min(hMax.value, Math.round(dragStartVal + dir * (p.y - dragStartY) * 0.35)))
  } else if (dragging.kind === 'fixed') {
    dragging.obj.x = clampBeamX(p.x - dragOffX, [], dragging.obj.id)
  } else if (dragging.kind === 'anchor') {
    anchorX.value = clampAnchor(p.x - dragOffX)
  } else if (dragging.kind === 'mwheel') {
    // 单独拖动该动滑轮（x 与静止高度 y0 均可，自动防重合）
    const m = dragging.obj
    const cx = p.x - dragging.gx
    const rise = effortMode.value ? KS * pullDist.value / 2 : KS * pullDist.value
    const cy0 = p.y - dragging.gy + rise
    let [nx, ny0] = clampMovPos(cx, cy0, m.id)
    if (effortMode.value && ny0 < 260) ny0 = 260   // 费力用法：轮上方须留测力计行程
    m.x = nx; m.y0 = ny0
  }
}
function onPointerUp() {
  dragging = null
  canvasRef.value.style.cursor = 'grab'
}
function clampAnchor(x) {
  let nx = Math.max(BOUND_L, Math.min(BOUND_R, Math.round(x)))
  const rest = fixedWs.value.map(w => w.x)
  for (const u of rest) {
    if (Math.abs(u - nx) < GAP_MIN - 8) nx = nx <= u ? u - (GAP_MIN - 8) : u + (GAP_MIN - 8)
  }
  return Math.max(BOUND_L, Math.min(BOUND_R, nx))
}

// 行程上限：实验要求最多 20cm；同时保证测力计不出画布 / 轮子不撞定滑轮排 / 负载不落地
const H_CAP = 20
const hMax = computed(() => {
  // 费力用法：轮升 h/2。约束：测力计顶部不出画布、重物顶不撞动滑轮
  if (effortMode.value) {
    const y0 = movs.value[0].y0
    return Math.max(2, Math.min(H_CAP, Math.floor(Math.min((y0 - 186) / (KS / 2), 2 * (EFF_DROP0 - 26) / KS))))
  }
  const per = nSeg.value * KS
  if (Mv.value === 0) return H_CAP
  const minY0 = Math.min(...movs.value.map(m => m.y0))
  let cap = H_CAP
  if (finalDirIsUp()) {
    // 上拉：测力计随 h 上移 + 整体同步上移（双重占用），且最高轮不得撞入定滑轮排
    const exit0 = movs.value[movs.value.length - 1].y0
    cap = Math.min(H_CAP, (exit0 - 147) / (KS + per), (minY0 - (FIX_Y + WHEEL_CLR)) / KS)
  } else {
    // 下拉：轮子不撞梁，负载不落地
    const loadTop0 = loadTopY(0)
    cap = Math.min(H_CAP, (minY0 - (FIX_Y + WHEEL_CLR)) / KS, (H - 70 - loadTop0 - hooks.value * 18) / KS)
  }
  return Math.max(2, Math.min(H_CAP, Math.floor(cap)))
})
function finalDirIsUp() {
  if (effortMode.value) return true   // 测力计勾轮轴上方，向上拉
  if (Mv.value === 0) return Nf.value === 0   // 无滑轮直接吊：向上拉测力计提升
  const F = Nf.value, M = Mv.value
  // 奇数段：末端从最后一只动滑轮右缘向上出（改向轮可转为下拉）
  // 偶数段：末端从最后一个"配对定滑轮或末动滑轮"出：
  //   F >= M → 末出为定滑轮（下拉）；F < M → 末出为动滑轮（上拉）
  if (!tieMovable.value) return F < M ? !redirectOn.value : false
  return !redirectOn.value
}
function downStartBase() {
  return FIX_Y   // 下拉自由段出口 y（末只定滑轮同一水平线）
}

/* ================= 绘制素材 ================= */
function strokePath(pts, color, width) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 6
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1] + 1.5)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1] + 1.5)
  ctx.stroke()
  ctx.strokeStyle = color || '#3a2a1a'; ctx.lineWidth = width || 3.5
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.stroke()
}
function strokeArc(cx, cy, r, a0, a1, ccw, color) {
  ctx.strokeStyle = color || '#3a2a1a'; ctx.lineWidth = 3.5
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1, ccw); ctx.stroke()
}
function drawPulley(cx, cy, r, angle, ringed) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle)
  const pg = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.05, 0, 0, r)
  pg.addColorStop(0, '#f2f5f9'); pg.addColorStop(0.3, '#dde4ec')
  pg.addColorStop(0.6, '#c2ccd8'); pg.addColorStop(0.85, '#98a5b5'); pg.addColorStop(1, '#78869a')
  ctx.fillStyle = pg
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#55617a'; ctx.lineWidth = 2.2
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = 'rgba(70,80,100,0.5)'; ctx.lineWidth = 1.4
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 / 8) * i
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2)
    ctx.lineTo(Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68)
    ctx.stroke()
  }
  ctx.fillStyle = '#414d66'
  ctx.beginPath(); ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}
function drawBracket(cx, yTop, yWheel) {
  ctx.strokeStyle = '#5a6478'; ctx.lineWidth = 3.2
  ctx.beginPath(); ctx.moveTo(cx, yTop); ctx.lineTo(cx, yWheel - R - 4); ctx.stroke()
  ctx.fillStyle = '#59647a'
  ctx.fillRect(cx - 8, yTop - 4, 16, 7)
  ctx.fillStyle = '#6b7789'
  ctx.beginPath(); ctx.moveTo(cx - 6, yWheel - R - 3); ctx.lineTo(cx + 6, yWheel - R - 3); ctx.lineTo(cx, yWheel - R + 3); ctx.closePath(); ctx.fill()
}
function drawRing(x, y, r) {
  ctx.strokeStyle = '#7c8899'; ctx.lineWidth = 3.5
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
}
function drawLink(x, y1, y2) {
  ctx.strokeStyle = '#6a7688'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke()
}
function drawWeight(cx, topY, cnt) {
  const w = 42, hh = 15, gap = 3
  drawRing(cx, topY - 12, 4.5)
  drawLink(cx, topY - 8, topY)
  for (let i = 0; i < cnt; i++) {
    const y = topY + i * (hh + gap)
    const g = ctx.createLinearGradient(cx - w / 2, y, cx + w / 2, y + hh)
    g.addColorStop(0, '#d4a838'); g.addColorStop(0.18, '#f6da58')
    g.addColorStop(0.5, '#efc73a'); g.addColorStop(0.85, '#d2a02a'); g.addColorStop(1, '#9c7418')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.roundRect(cx - w / 2, y, w, hh, 3); ctx.fill()
    ctx.strokeStyle = '#8a6f24'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(cx - w / 2, y, w, hh, 3); ctx.stroke()
  }
}
function drawGauge(x, cy, forceVal) {
  const gw = 28, gh = 48
  drawRing(x, cy - gh / 2 - 5, 3.5)
  const g = ctx.createLinearGradient(x - gw / 2, cy, x + gw / 2, cy)
  g.addColorStop(0, '#dfe4ea'); g.addColorStop(0.5, '#f6f8fa'); g.addColorStop(1, '#c9cfd6')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.roundRect(x - gw / 2, cy - gh / 2, gw, gh, 6); ctx.fill()
  ctx.strokeStyle = '#59647a'; ctx.lineWidth = 1.3
  ctx.beginPath(); ctx.roundRect(x - gw / 2, cy - gh / 2, gw, gh, 6); ctx.stroke()
  ctx.fillStyle = '#101c14'
  ctx.beginPath(); ctx.roundRect(x - gw / 2 + 3.5, cy - 10, gw - 7, 20, 3); ctx.fill()
  ctx.fillStyle = '#39ff88'
  ctx.font = '700 10px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.shadowColor = '#39ff88'; ctx.shadowBlur = 5
  ctx.fillText(forceVal.toFixed(1), x - 3, cy - 1)
  ctx.shadowBlur = 0
  ctx.font = '700 7px system-ui, sans-serif'
  ctx.fillText('N', x + 7, cy + 4)
  drawRing(x, cy + gh / 2 + 5, 3.5)
}
function drawArrow(x1, y1, x2, y2, color) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy)
  if (len < 1) return
  const ux = dx / len, uy = dy / len
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - ux * 9 - uy * 5, y2 - uy * 9 + ux * 5)
  ctx.lineTo(x2 - ux * 9 + uy * 5, y2 - uy * 9 - ux * 5)
  ctx.closePath(); ctx.fill()
}
function drawLabel(text, x, y, color, align, baseline, size) {
  ctx.fillStyle = color || '#4b5563'
  ctx.font = `700 ${size || 12}px system-ui, sans-serif`
  ctx.textAlign = align || 'center'; ctx.textBaseline = baseline || 'middle'
  ctx.fillText(text, x, y)
}
function drawBeam() {
  ctx.fillStyle = '#67707e'
  ctx.beginPath(); ctx.roundRect(100, BEAM_Y - 14, W - 200, 16, 4); ctx.fill()
  ctx.strokeStyle = '#4a5260'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.roundRect(100, BEAM_Y - 14, W - 200, 16, 4); ctx.stroke()
  drawLabel('顶部横梁', 122, BEAM_Y - 26, '#5b6570', 'left', 'middle', 11)
}
function drawGround() {
  ctx.fillStyle = '#8b8f96'
  ctx.fillRect(0, 500, W, H - 500)
  ctx.strokeStyle = '#777c84'; ctx.lineWidth = 1
  for (let x = 0; x < W; x += 26) {
    ctx.beginPath(); ctx.moveTo(x, 500); ctx.lineTo(x - 12, H); ctx.stroke()
  }
}
// 动滑轮吊架：底部吊钩环（绳绕轮体，负载经吊绳挂于钩下）
function drawMovHook(mx, my) {
  drawRing(mx, my + R + 6, 3.5)
}
function drawMovWheel(m, h) {
  const mx = m.x, my = movY(m, h)
  drawPulley(mx, my, R, rotationAngle, 'm')
  drawMovHook(mx, my)
  if (selMov.value === m.id) {
    ctx.strokeStyle = '#dc7a26'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(mx, my, R + 6, 0, Math.PI * 2); ctx.stroke()
  }
  hitZones.push({ kind: 'mwheel', obj: m, x: mx, y: my, rx: R + 10, ry: R + 10 })
}

/* ================= 主渲染 ================= */
function render() {
  if (!ctx) return
  paintBoard(ctx, W, H, 'chalk')
  hitZones = []
  const delta = pullDist.value - prevH
  rotationAngle += delta * 0.09
  prevH = pullDist.value
  drawGround()
  drawBeam()

  const badges = []
  const ropeC = '#3a2a1a', freeC = '#7a2a2a'

  const fxSorted = [...fixedWs.value].sort((a, b) => a.x - b.x)
  const h = pullDist.value

  // 固定头锚点（系横梁=顶部锚座；系地面=地面锚墩），可横向拖动
  if (Mv.value > 0 && !tieMovable.value) {
    if (anchorGround.value) {
      const gy0 = H - 22
      ctx.fillStyle = '#59647a'
      ctx.beginPath(); ctx.roundRect(anchorX.value - 16, gy0 - 9, 32, 10, 2); ctx.fill()
      ctx.strokeStyle = '#59647a'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(anchorX.value, gy0 - 9); ctx.lineTo(anchorX.value, gy0 - 30); ctx.stroke()
      ctx.strokeStyle = '#7c8899'
      ctx.beginPath(); ctx.arc(anchorX.value, gy0 - 33, 3.5, 0, Math.PI * 2); ctx.stroke()
      hitZones.push({ kind: 'anchor', x: anchorX.value, y: gy0 - 20, rx: 20, ry: 26 })
      drawLabel('固定头(地)', anchorX.value, gy0 - 52, '#dc7a26', 'center', 'middle', 10)
    } else {
      ctx.strokeStyle = '#59647a'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(anchorX.value, BEAM_Y - 6); ctx.lineTo(anchorX.value, BEAM_Y + 14); ctx.stroke()
      ctx.fillStyle = '#59647a'
      ctx.beginPath(); ctx.roundRect(anchorX.value - 10, BEAM_Y - 10, 20, 9, 2); ctx.fill()
      ctx.strokeStyle = '#7c8899'
      ctx.beginPath(); ctx.arc(anchorX.value, BEAM_Y + 17, 3.5, 0, Math.PI * 2); ctx.stroke()
      hitZones.push({ kind: 'anchor', x: anchorX.value, y: BEAM_Y + 4, rx: 18, ry: 20 })
      drawLabel('固定头', anchorX.value, BEAM_Y + 34, '#dc7a26', 'center', 'middle', 10)
    }
  }

  /* ---- 场景分支 ---- */
  if (Mv.value === 0) {
    // 无任何滑轮：测力计直接吊重物（真实物理）——F = G 精确成立，s = h，η = 100%
    if (Nf.value === 0) {
      const baseTop = FIX_Y + 170                      // 静止时重物顶部
      const wTop = baseTop - KS * h                    // 上拖测力计 → 重物同步上升
      const wx = 450
      const gyc = wTop - 29 - 8                        // 测力计中心（挂环衔接重物顶环）
      strokePath([[wx, wTop - 14], [wx, wTop]], ropeC) // 测力计下挂环 → 重物顶环（零弯折直线）
      drawWeight(wx, wTop, hooks.value)
      const gAx0 = wx - 62
      const wyMid = wTop + hooks.value * 18 / 2
      drawArrow(gAx0, wTop - 6, gAx0, wyMid + 22, '#2563eb')
      drawLabel('G', gAx0, wyMid + 34, '#2563eb', 'center', 'top', 13)
      drawGauge(wx, gyc, fMeas.value)
      const axp = wx + 34
      drawArrow(axp, gyc + 26, axp, gyc - 26, '#dc2626')
      drawLabel(`拉力 ${fMeas.value} N`, axp + 6, gyc, '#dc2626', 'left', 'middle', 12)
      drawLabel(`F = G = ${gLoad.value} N（无滑轮无摩擦，读数恒等于物重）`, wx + 92, gyc - 26, '#0f8a4a', 'left', 'middle', 11.5)
      drawLabel(`h = ${h} cm　s = h = ${effDist.value} cm`, wx - 62, (baseTop + wTop) / 2, '#0f8a4a', 'center', 'middle', 12)
      hitZones.push({ kind: 'gauge', x: wx, y: gyc, rx: 30, ry: 46 })
      _gaugeCache = { x: wx, y: gyc }
      ctx.fillStyle = '#4b5563'
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText('无滑轮基准：向上拖测力计提升重物，F 读数 = G物（加滑轮后观察 F 如何变化）', 30, H - 74)
      return
    }
    // 纯定滑轮链：钩码挂最左滑轮左侧，逐个翻越，末端下垂接测力计
    const list = fxSorted.length ? fxSorted : []
    const firstX = list.length ? list[0].x : 380
    for (let i = 0; i < list.length; i++) {
      drawBracket(list[i].x, BEAM_Y, FIX_Y)
      drawPulley(list[i].x, FIX_Y, R, rotationAngle)
    }
    list.forEach(w => hitZones.push({ kind: 'fixed', obj: w, x: w.x, y: FIX_Y, rx: R + 12, ry: R + 12 }))
    const wSideX = firstX - R
    const wTop = FIX_Y + 150 - KS * h
    strokePath([[wSideX, FIX_Y], [wSideX, wTop - 15]], ropeC)
    drawWeight(wSideX, wTop, hooks.value)
    // G 箭头（重力方向向下）
    const gAx0 = wSideX - 30
    const wyMid = wTop + hooks.value * 18 / 2
    drawArrow(gAx0, wTop - 6, gAx0, wyMid + 22, '#2563eb')
    drawLabel('G', gAx0, wyMid + 34, '#2563eb', 'center', 'top', 13)
    let curX = wSideX
    for (let i = 0; i < list.length; i++) {
      const cxp = list[i].x
      strokePath([[curX, FIX_Y], [cxp - R, FIX_Y]], ropeC)
      strokeArc(cxp, FIX_Y, R + 1, Math.PI, Math.PI * 2, false)
      curX = cxp + R
    }
    // 自由段竖直下垂（绳不弯折）：出口 x 即测力计 x
    const gx = curX
    const gy = Math.min(H - 80, FIX_Y + 34 + 29 + nSeg.value * KS * h)
    strokePath([[curX, FIX_Y], [gx, gy - 29]], freeC)
    finishSingle(gx, gy)
    hitZones.push({ kind: 'gauge', x: gx, y: gy, rx: 30, ry: 46 })
    _gaugeCache = { x: gx, y: gy }
    drawInfo(h)
    return
  }

  /* ---- 费力用法（系地面 + 仅1动滑轮）：绳端挂重物、测力计勾轮轴 ----
     绳：地锚 → 动滑轮左缘 → 翻上缘 → 右缘 → 竖直下挂重物；测力计勾轮轴上拉。
     轮升 d ⇒ 重物升 2d（绳长守恒）；F = 2G物 + G动 + 摩擦 —— 费力省距离 */
  if (effortMode.value) {
    const m = movs.value[0]
    const mx = m.x
    const my = m.y0 - (KS / 2) * h
    const aYg = H - 55
    // 绳左段（地锚 → 左缘）+ 上缘半绕 + 绳右段（右缘 → 重物）
    strokePath([[anchorX.value, aYg], [mx - R - 1, my]], ropeC)
    strokeArc(mx, my, R + 1, Math.PI, 0, false)
    const ltE = Math.max(my + 26, m.y0 + EFF_DROP0 - KS * h)
    strokePath([[mx + R + 1, my], [mx + R + 1, ltE - 14]], ropeC)
    badges.push({ x: (anchorX.value + mx - R) / 2, y: (aYg + my) / 2, idx: 1 })
    badges.push({ x: mx + R + 13, y: (my + ltE) / 2, idx: 2 })
    drawWeight(mx + R + 1, ltE, hooks.value)
    // G 箭头
    const gAx0 = mx + R + 37
    const wyMid = ltE + hooks.value * 18 / 2
    drawArrow(gAx0, ltE - 6, gAx0, wyMid + 22, '#2563eb')
    drawLabel('G', gAx0, wyMid + 34, '#2563eb', 'center', 'top', 13)
    // 动滑轮轮体 + 选中环 + 命中区
    drawPulley(mx, my, R, rotationAngle, 'm')
    if (selMov.value === m.id) {
      ctx.strokeStyle = '#dc7a26'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(mx, my, R + 6, 0, Math.PI * 2); ctx.stroke()
    }
    hitZones.push({ kind: 'mwheel', obj: m, x: mx, y: my, rx: R + 10, ry: R + 10 })
    // 测力计勾在轮轴上方（短提绳连接），向上拉
    const gyc = my - R - 16 - 29
    drawLink(mx, my - R - 2, gyc + 29)
    drawGauge(mx, gyc, fMeas.value)
    hitZones.push({ kind: 'gauge', x: mx, y: gyc, rx: 30, ry: 46 })
    _gaugeCache = { x: mx, y: gyc }
    const axp = mx + 32
    drawArrow(axp, gyc + 26, axp, gyc - 26, '#dc2626')
    drawLabel(`拉力 ${fMeas.value} N`, axp + 6, gyc, '#dc2626', 'left', 'middle', 12)
    drawLabel(`s = ${effDist.value} cm`, axp + 6, gyc + 22, '#0f8a4a', 'left', 'middle', 12)
    drawLabel('费力用法：F = 2G物+G动，重物升 h = 2×测力计行程', mx - 46, gyc - 32, '#0f8a4a', 'right', 'middle', 11.5)
    // h 标注（重物位移）
    drawLabel(`h = ${h} cm`, mx - 150, (m.y0 + EFF_DROP0 + ltE) / 2, '#0f8a4a', 'center', 'middle', 12)
    for (const b of badges) {
      ctx.fillStyle = '#0f8a4a'
      ctx.beginPath(); ctx.arc(b.x, b.y, 7.5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(String(b.idx), b.x, b.y + 0.5)
    }
    drawInfo(h)
    return
  }

  /* ---- 标准滑轮组（动滑轮独立摆放 · 之字穿绕） ---- */
  const F = Nf.value, M = Mv.value
  const pos = m => [m.x, movY(m, h)]

  // 定滑轮：支架 → 轮体 → 选中环 → 命中区
  fxSorted.forEach((w) => {
    drawBracket(w.x, BEAM_Y, FIX_Y)
    drawPulley(w.x, FIX_Y, R, rotationAngle)
    if (w.id === selId.value) {
      ctx.strokeStyle = '#dc7a26'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(w.x, FIX_Y, R + 6, 0, Math.PI * 2); ctx.stroke()
    }
    hitZones.push({ kind: 'fixed', obj: w, x: w.x, y: FIX_Y, rx: R + 12, ry: R + 12 })
  })

  // 动滑轮：轮体 + 底部吊钩 → 选中环 → 命中区（每只独立）
  movs.value.forEach(m => drawMovWheel(m, h))

  // 负载：吊绳从每只动滑轮吊钩汇聚到吊环，重物挂于环下
  const lx = loadX(), ltY = loadTopY(h)
  drawRing(lx, ltY, 5)
  for (const m of movs.value) {
    const [mx, my] = pos(m)
    strokePath([[mx, my + R + 10], [lx, ltY - 5]], '#7c8899')
  }
  drawLink(lx, ltY + 5, ltY + 17)
  drawWeight(lx, ltY + 17, hooks.value)

  let bearing = 0
  let exitPt = null, exitUp = false
  let lastColR = Math.max(400, ...movs.value.map(m => m.x), ...fxSorted.map(w => w.x))
  // 徽章规则：绳段两端只要有一端连着"动滑轮块"（锚点/顶环/动滑轮）即承担段
  const badgeSeg = (a, b, srcKind, dstMovable) => {
    const bears = dstMovable || srcKind !== 'f'
    strokePath([a, b], ropeC)
    if (bears) badges.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, idx: ++bearing })
  }

  /* ---- 之字穿绕（自适应侧向：按空间序配对，绳段尽量不压轮盘、测力计挂点避轮） ---- */
  const mS = [...movs.value].sort((a, b) => a.x - b.x)
  const usedF = new Set()
  const segHitsDisc = (ax, ay, bx, by, cx, cy, r) => {
    const dx = bx - ax, dy = by - ay
    const L2 = dx * dx + dy * dy || 1
    let t = ((cx - ax) * dx + (cy - ay) * dy) / L2
    t = Math.max(0, Math.min(1, t))
    const px = ax + dx * t - cx, py = ay + dy * t - cy
    return px * px + py * py < r * r
  }
  // 为动滑轮 m 挑选下一个定滑轮：优先出绳同侧，且连线不扫过任何轮盘；无合格者返回 null（留给改向链）
  const pickFixed = (m, outSide) => {
    const [mx, my] = pos(m)
    const pen = w => Math.abs(w.x - mx) + (outSide !== 0 && Math.sign(w.x - mx) !== outSide ? 500 : 0)
    const cands = fxSorted.filter(w => !usedF.has(w.id)).sort((a, b) => pen(a) - pen(b))
    for (const w of cands) {
      let bad = false
      for (const o of mS) {
        if (o === m) continue
        const [ox, oy] = pos(o)
        if (segHitsDisc(mx + outSide * (R + 1), my, w.x, FIX_Y, ox, oy, R + 2)) { bad = true; break }
      }
      for (const o of fxSorted) {
        if (o === w) continue
        if (segHitsDisc(mx + outSide * (R + 1), my, w.x, FIX_Y, o.x, FIX_Y, R + 2)) { bad = true; break }
      }
      if (!bad) { usedF.add(w.id); return w }
    }
    // 单绳必须继续前进：全部会擦边时也强制取最近（仅极端摆放下发生）
    if (cands.length) { usedF.add(cands[0].id); return cands[0] }
    return null
  }
  // 出绳侧竖直带避让：测力计不与定滑轮/其绳弧重叠（向外逐档找空位）
  const freeExitX = (baseX) => {
    const blocked = s => fxSorted.some(w => Math.abs(w.x - (baseX + s)) < 2 * R + 18)
    if (!blocked(0)) return baseX
    for (const s of [26, -26, 52, -52, 82, -82, 116, -116]) if (!blocked(s)) return baseX + s
    return baseX
  }
  // 多余定滑轮 → 改向链（不承担，仅改变方向；bearingFirst：上出自由段改经改向轮时该段本身承担）
  const redirectChain = (bearingFirst) => {
    let first = true
    for (const w of fxSorted) {
      if (usedF.has(w.id)) continue
      usedF.add(w.id)
      strokePath([exitPt, [w.x - R, FIX_Y]], bearingFirst && first ? ropeC : freeC)
      if (bearingFirst && first) badges.push({ x: (exitPt[0] + w.x - R) / 2, y: (exitPt[1] + FIX_Y) / 2, idx: ++bearing })
      strokeArc(w.x, FIX_Y, R + 1, Math.PI, Math.PI * 2, false)
      exitPt = [w.x + R, FIX_Y]
      exitUp = false
      first = false
    }
  }

  if (!tieMovable.value) {
    /* 偶数段 n=2M：固定头(梁/地) → 依次"绕动滑轮下缘 - 翻定滑轮上缘"之字穿绕 */
    const aY = anchorGround.value ? H - 55 : BEAM_Y + 19
    let prev = [anchorX.value, aY]
    let prevKind = 'anchor'
    for (let j = 0; j < M; j++) {
      const m = mS[j]
      const [mx, my] = pos(m)
      const inSide = Math.sign(prev[0] - mx) || -1
      badgeSeg(prev, [mx + inSide * (R + 1), my], prevKind, true)
      strokeArc(mx, my, R + 1, Math.PI, 0, true)
      const outSide = -inSide
      if (j < F) {
        const f = pickFixed(m, outSide)
        if (f) {
          const s = Math.sign(f.x - mx)
          badgeSeg([mx + outSide * (R + 1), my], [f.x - s * (R + 1), FIX_Y], 'm', true)
          strokeArc(f.x, FIX_Y, R + 1, Math.PI, Math.PI * 2, false)
          prev = [f.x + s * (R + 1), FIX_Y]
          prevKind = 'f'
          continue
        }
      }
      // 定滑轮用尽（F<M）：从本动滑轮出绳侧向上出（横向避开定滑轮带）
      exitPt = [freeExitX(mx + outSide * (R + 1)), my]
      exitUp = true
      prevKind = 'm'
    }
    if (!exitUp) { exitPt = [...prev]; exitUp = false }   // 全部配对成功：末只定滑轮右缘出绳
    redirectChain(false)   // 剩余定滑轮 → 改向链（不承担）
  } else {
    /* 奇数段 n=2M+1：系首动滑轮顶环 → 折返定滑轮 → "动滑轮 ↔ 定滑轮"交替，禁止动滑轮直连 */
    const m0 = mS[0]
    const [mx0, my0] = pos(m0)
    drawRing(mx0, my0 - R - 8, 4)
    let prev = [mx0, my0 - R - 10]
    let prevKind = 'ring'
    let lastOut = -1
    if (F > 0) {
      const fa = pickFixed(m0, 0)   // 离首动滑轮最近的定滑轮折返
      const s = Math.sign(fa.x - mx0) || 1
      badgeSeg(prev, [fa.x - s * (R + 1), FIX_Y], prevKind, true)
      strokeArc(fa.x, FIX_Y, R + 1, Math.PI, Math.PI * 2, false)
      badgeSeg([fa.x + s * (R + 1), FIX_Y], [mx0 + s * (R + 1), my0], 'f', true)
      strokeArc(mx0, my0, R + 1, Math.PI, 0, true)
      prev = [mx0 - s * (R + 1), my0]
      lastOut = -s
      prevKind = 'm'
    } else {
      // 兜底（UI 已阻止无定滑轮时选系框）：直接绕 m0 上出
      badgeSeg(prev, [mx0 - (R + 1), my0], prevKind, true)
      strokeArc(mx0, my0, R + 1, Math.PI, 0, true)
      prev = [mx0 + (R + 1), my0]
      lastOut = 1
      prevKind = 'm'
    }
    for (let j = 1; j < M; j++) {
      const mFrom = mS[j - 1]
      const [mfx, mfy] = pos(mFrom)
      const m = mS[j]
      const [mx, my] = pos(m)
      // 上行：m_{j-1} 出绳侧 → 定滑轮（绳必须经定滑轮，不能动滑轮直连）
      const f = pickFixed(mFrom, lastOut)
      if (f) {
        const sf = Math.sign(f.x - mfx) || 1
        badgeSeg([mfx + lastOut * (R + 1), mfy], [f.x - sf * (R + 1), FIX_Y], 'm', true)
        strokeArc(f.x, FIX_Y, R + 1, Math.PI, Math.PI * 2, false)
        // 下行入 m_j：从面向定滑轮的一侧进入
        const se = Math.sign(f.x - mx) || 1
        badgeSeg([f.x + sf * (R + 1), FIX_Y], [mx + se * (R + 1), my], 'f', true)
        strokeArc(mx, my, R + 1, Math.PI, 0, true)
        prev = [mx - se * (R + 1), my]
        lastOut = -se
      } else {
        // 无定滑轮可用（理论不发生，F≥M 已约束）：直连兜底
        const inSide = Math.sign(prev[0] - mx) || -1
        badgeSeg(prev, [mx + inSide * (R + 1), my], prevKind, true)
        strokeArc(mx, my, R + 1, Math.PI, 0, true)
        prev = [mx - inSide * (R + 1), my]
        lastOut = -inSide
      }
      prevKind = 'm'
    }
    // 末只动滑轮出绳侧上出（自由段承担第 n 段；余下定滑轮转改向链）
    const mL = mS[M - 1]
    exitPt = [freeExitX(mL.x + lastOut * (R + 1)), movY(mL, h)]
    exitUp = true
    redirectChain(true)
  }

  /* ---- 改向轮（可选）与自由端 ----
     物理约束：绳在两滑轮之间必须为直线。因此测力计自由段一律竖直（出口 x = 测力计 x），
     唯一允许的弯折发生在改向轮处。 */
  let gx, gy
  const per = nSeg.value * KS * h
  const EXIT_GAP = 34   // 出口点到测力计挂环的最短直段
  if (exitUp && redirectOn.value) {
    // 改向轮与出口同列优先（入绳竖直）；被定滑轮挡住时右移，入绳退化为直线斜段
    const mxR = exitPt[0]
    let exX = mxR + R
    for (const f of fxSorted) {
      if (Math.abs(f.x - exX) < 2 * R + 10) exX = f.x + 2 * R + 10
    }
    exX = Math.min(W - 96, exX)
    const exY = BEAM_Y + 34
    drawBracket(exX, BEAM_Y, exY)
    strokePath([exitPt, [exX - R, exY]], ropeC)          // 入绳：一条直线
    strokeArc(exX, exY, R, Math.PI, Math.PI * 2, false, ropeC)
    drawPulley(exX, exY, R, rotationAngle)
    gx = exX + R                                          // 出绳竖直下行
    gy = Math.min(H - 80, exY + EXIT_GAP + 29 + per)
    strokePath([[exX + R, exY], [gx, gy - 29]], freeC)
    badges.push({ x: mxR + 13, y: (exitPt[1] + exY) / 2, idx: ++bearing })
  } else if (exitUp) {
    // 自由段竖直向上：这是 n 的最后一段承担绳
    gx = exitPt[0]
    gy = Math.max(84, exitPt[1] - EXIT_GAP - 29 - per)
    strokePath([exitPt, [gx, gy + 29]], freeC)
    badges.push({ x: gx + 13, y: (exitPt[1] + gy + 29) / 2, idx: ++bearing })
  } else {
    // 自由段竖直向下（不承担，仅施力方向）：出口 x 即测力计 x
    gx = exitPt[0]
    gy = Math.min(H - 80, exitPt[1] + EXIT_GAP + 29 + per)
    strokePath([exitPt, [gx, gy - 29]], freeC)
  }

  /* ---- 徽章 / 测力计 / 标注 ---- */
  for (const b of badges) {
    ctx.fillStyle = '#0f8a4a'
    ctx.beginPath(); ctx.arc(b.x, b.y, 7.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(String(b.idx), b.x, b.y + 0.5)
  }

  drawGauge(gx, gy, fMeas.value)
  hitZones.push({ kind: 'gauge', x: gx, y: gy, rx: 32, ry: 48 })
  _gaugeCache = { x: gx, y: gy }
  const axp = gx + 32
  if (gy < H - 60 && gy > 70) {
    if (!exitUp || redirectOn.value) drawArrow(axp, gy - 26, axp, gy + 26, '#dc2626')
    else drawArrow(axp, gy + 26, axp, gy - 26, '#dc2626')
    drawLabel(`拉力 ${fMeas.value} N`, axp + 6, gy, '#dc2626', 'left', 'middle', 12)
  }

  // G 箭头（重力方向向下，位于负载左侧）
  const gAx = lx - 44
  const wyB = ltY + 17 + hooks.value * 18 - 3
  drawArrow(gAx, ltY + 13, gAx, wyB + 14, '#2563eb')
  drawLabel('G', gAx, wyB + 26, '#2563eb', 'center', 'top', 13)

  // h/s/n 标注（h：负载从静止位到当前的位移）
  drawLabel(`h = ${h} cm`, lx - 92, (loadTopY(0) + ltY) / 2, '#0f8a4a', 'center', 'middle', 12)
  drawLabel(`s = ${effDist.value} cm`, gx, gy - 44, '#0f8a4a', 'center', 'middle', 12)
  const [nRefX, nRefY] = pos(mS[0])
  drawLabel(nText(), Math.max(lastColR, nRefX) + 46, (FIX_Y + nRefY) / 2, '#0f8a4a', 'left', 'middle', 12)

  drawInfo(h)
}

function nText() {
  return Mv.value === 0 ? `n = 1` : `n = ${nSeg.value} 段承担（${tieMovable.value ? '固定头系框' : anchorGround.value ? '固定头系地' : '固定头系梁'}）`
}

function finishSingle(gx, gy) {
  drawGauge(gx, gy, fMeas.value)
  const axp = gx + 32
  drawArrow(axp, gy - 26, axp, gy + 26, '#dc2626')
  drawLabel(`拉力 ${fMeas.value} N`, axp + 6, gy, '#dc2626', 'left', 'middle', 12)
  drawLabel('定滑轮不省力：F ≈ G，s = h', gx, gy - 52, '#0f8a4a', 'center', 'bottom', 11.5)
}

function drawInfo(h) {
  const fy = H - 74
  ctx.fillStyle = '#4b5563'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(`G物=${gLoad.value}N　G动总=${(Mv.value * G_MOVABLE).toFixed(1)}N　n=${nSeg.value}　F实=${fMeas.value}N`, 30, fy)
  ctx.fillText(`物体升 h=${h}cm → 绳端 s=n·h=${effDist.value}cm　·　每只动滑轮可单独拖放 · 拖测力计升降重物 · 绿色①②…为承担段`, 30, fy + 18)
}

let renderError = null
function loop() {
  try { render() } catch (e) { if (!renderError) { renderError = e; console.error('[PulleySandbox render]', e) } }
  raf = requestAnimationFrame(loop)
}
function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render()
}

onMounted(() => {
  setupCanvas()
  // 初始：1 定 + 1 动，固定头系横梁（偶数段）
  setCfg([320], [{ x: 470, y0: 184 }], false, false)
  anchorX.value = 240
  // 调试句柄：供自动化测试读取真实布局状态
  window.__pulleySandbox = {
    get fixedXs() { return fixedWs.value.map(w => w.x) },
    get movPos() { return movs.value.map(m => ({ x: m.x, y0: m.y0 })) },
    get M() { return movs.value.length },
    get selMov() { return selMov.value },
    get h() { return pullDist.value },
    get effort() { return effortMode.value },
    get fMeas() { return fMeas.value },
    get effDist() { return effDist.value },
    get eta() { return eta.value },
    get anchorGround() { return anchorGround.value },
    get renderError() { return renderError ? String(renderError && renderError.stack || renderError) : null }
  }
  if (window.ResizeObserver) {
    new ResizeObserver(resizeCanvas).observe(canvasRef.value.parentElement)
  }
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  delete window.__pulleySandbox
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="canvas-wrap">
        <canvas
          class="logic-canvas lab-canvas" ref="canvasRef"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
        ></canvas>
        <div class="mode-fabs">
          <button class="btn" @click="addFixed">＋定滑轮</button>
          <button class="btn" @click="addMovable">＋动滑轮</button>
          <span v-if="selId !== null" class="del-chip">
            已选中定滑轮
            <button class="btn danger-mini" @click="removeFixed(selId)">删除</button>
          </span>
          <span v-else-if="selMov !== null" class="del-chip">
            已选中动滑轮
            <button class="btn danger-mini" @click="removeMov(selMov)">删除</button>
          </span>
        </div>
      </div>
      <div class="lab-actions">
        <span class="feedback" :class="completed ? 'ok' : 'no'">
          {{ completed ? '✓ 已完成三组效率对比' : (feedback || '点动滑轮/定滑轮可选中删除 · 拖动摆放（双向防重合）· 拖测力计升降 · 绿色①②…为承担段') }}
        </span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>器材清单</strong><span>防重合已启用</span></div>
        <div class="inv-grid">
          <div class="inv-row">
            <span class="mini-label">定滑轮 × {{ Nf }}</span>
            <button class="btn" @click="addFixed">＋</button>
          </div>
          <div class="inv-row">
            <span class="mini-label">动滑轮 × {{ Mv }}</span>
            <button class="btn" :disabled="!Mv" @click="Mv && removeMov(movs[Mv - 1].id)">－</button>
            <button class="btn" @click="addMovable">＋</button>
          </div>
        </div>
        <div class="row-btns">
          <span class="mini-label">固定头：</span>
          <button class="btn" :class="{ 'btn-primary': !tieMovable && !anchorGround }" :disabled="!Mv" @click="setTie(false); setAnchorGround(false)">系横梁</button>
          <button class="btn" :class="{ 'btn-primary': !tieMovable && anchorGround }" :disabled="!Mv" @click="setTie(false); setAnchorGround(true)">系地面</button>
          <button class="btn" :class="{ 'btn-primary': tieMovable }" :disabled="!Mv || !Nf" :title="!Nf ? '奇数段绕法需要至少一个定滑轮' : ''" @click="setTie(true)">系动滑轮框</button>
        </div>
        <p v-if="effortMode" class="hint-line" style="color:#b4530a">当前为<b>费力用法</b>：绳端挂重物、测力计勾动滑轮上拉 — F = 2G物+G动（费力），但重物升 h = 2×测力计行程（省距离）。改回系横梁即变省力用法</p>
        <div v-if="Mv > 0 && tieMovable" class="row-btns">
          <span class="mini-label">改向：</span>
          <button class="btn" :class="{ 'btn-primary': !redirectOn }" @click="setRedirect(false)">向上拉</button>
          <button class="btn" :class="{ 'btn-primary': redirectOn }" @click="setRedirect(true)">加改向轮下拉</button>
        </div>
        <p class="hint-line">同一根绳张力处处相等 → 提升时所有动滑轮随重物同步上升 h，但每只可单独拖放摆放（自动防重合）；固定头可系顶部横梁或地面锚墩（n 不变），负载由吊绳汇聚悬挂于各动滑轮之下</p>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实验参数</strong></div>
        <div class="lab-params">
          <ParamSlider v-model="hooks" :min="1" :max="8" :step="1" :precision="0"
            label="钩码个数" unit=" 个" :hint="`G物 = ${gLoad} N`" />
          <ParamSlider v-model="pullDist" :min="0" :max="hMax" :step="1" :precision="0"
            label="提升高度 h" unit=" cm"
            :hint="effortMode ? `画布行程限制：本次最多 ${hMax} cm（测力计升 s = h/2 ≤ ${hMax / 2} cm）` : `画布行程限制：本次最多 ${hMax} cm（s = ${nSeg}·h ≤ ${hMax * nSeg} cm）`" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>机械效率测算</strong></div>
        <div class="stat-grid">
          <div><i>{{ effortMode ? 'n 绕轮段数(费力)' : 'n 承担段数' }}</i><b>{{ nSeg }}</b></div>
          <div><i>F 理想</i><b>{{ fIdeal.toFixed(2) }} N</b></div>
          <div><i>F 实际</i><b>{{ fMeas.toFixed(2) }} N</b></div>
          <div><i>s 绳端距离</i><b>{{ effDist }} cm</b></div>
          <div><i>W 有用</i><b>{{ wUse === null ? '—' : wUse + ' J' }}</b></div>
          <div><i>W 总</i><b>{{ wTot === null ? '—' : wTot + ' J' }}</b></div>
          <div class="eta"><i>机械效率 η</i><b>{{ eta === null ? '—' : eta + '%' }}</b></div>
          <div><i>摩擦处数</i><b>{{ contactsN }}</b></div>
          <div><i>定/动配对</i><b style="font-size:12px">{{ Math.min(Nf, Mv) }} 对</b></div>
        </div>
        <p class="formula-line">{{ effortMode ? '费力用法：F = 2G物+G动+摩擦　h物 = 2s　η = G物·h/(F·s)' : 'F = (G物+ΣG动)/n + 摩擦　η = G物·h/(F·s)' }}</p>
        <p class="hint-line">F理 是"只提升物体和动滑轮"的理论计算值；实际拉动还要克服 {{ contactsN }} 处绳与轮的摩擦（每处半绕 +{{ FRICTION_PER_WHEEL }}N）。实验中弹簧测力计的读数就是 F实——用 F实 计算并记录 η，F理 仅作对比：两者差距 = 摩擦产生的额外功，这正是 η < 100% 的原因</p>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>实验结论</strong></div>
        <ul class="concl-list"><li v-for="(c, i) in conclusions" :key="i">{{ c }}</li></ul>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>数据记录</strong>
          <span>{{ trials.length }} 组</span>
          <button class="btn btn-record" v-if="trials.length" @click="clearTrials">清空</button>
          <button class="btn btn-primary btn-record" @click="recordTrial">记录本次数据</button>
        </div>
        <table class="trial-table">
          <thead>
            <tr><th>#</th><th>配置</th><th>G/N</th><th>F/N</th><th>h/cm</th><th>s/cm</th><th>W有/J</th><th>W总/J</th><th>η%</th></tr>
          </thead>
          <tbody>
            <tr v-for="t in trials" :key="t.id">
              <td>{{ t.n }}</td><td>{{ t.cfg }}</td><td>{{ t.g.toFixed(1) }}</td><td>{{ t.f.toFixed(2) }}</td>
              <td>{{ t.h }}</td><td>{{ t.s }}</td><td>{{ t.wu }}</td><td>{{ t.wt }}</td><td>{{ t.eta }}</td>
            </tr>
            <tr v-if="!trials.length"><td colspan="9" class="empty">提升一段高度后记录，共 3 组完成实验</td></tr>
          </tbody>
        </table>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.canvas-wrap {
  position: relative;
  display: flex;
  justify-content: center;
}
.lab-canvas {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: calc(100vh - 250px);
  border-radius: 8px;
  cursor: grab;
}
.mode-fabs {
  position: absolute;
  z-index: 5;
  display: flex;
  gap: 6px;
  align-items: center;
  top: 10px;
  right: 12px;
}
.mode-fabs .btn {
  padding: 5px 11px;
  font-size: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
}
.del-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(217, 33, 53, 0.08);
  border: 1px solid rgba(217, 33, 53, 0.35);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 12px;
  color: var(--danger, #d92135);
}
.danger-mini {
  padding: 2px 8px;
  font-size: 11px;
  color: #fff;
  background: rgba(217, 33, 53, 0.75);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.inv-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.inv-row {
  display: flex;
  gap: 6px;
  align-items: center;
  background: var(--surface-2);
  border-radius: 6px;
  padding: 5px 8px;
}
.inv-row .btn { padding: 2px 10px; }
.row-btns {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 6px;
}
.mini-label { font-size: 11.5px; color: var(--muted); }
.hint-line {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted);
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.stat-grid div {
  background: var(--surface-2);
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat-grid i { font-style: normal; font-size: 11px; color: var(--muted); }
.stat-grid b { font-family: var(--mono); font-size: 14px; }
.stat-grid .eta b { color: var(--accent); font-size: 16px; }
.formula-line {
  margin: 8px 2px 0;
  font-size: 12px;
  color: var(--muted);
  font-family: var(--mono);
}
.concl-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.7;
}
.btn-record {
  margin-left: auto;
  padding: 4px 12px;
  font-size: 12px;
}
.trial-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}
.trial-table th,
.trial-table td {
  border: 1px solid var(--line);
  padding: 4px 5px;
  text-align: center;
}
.trial-table th {
  background: rgba(90, 120, 200, 0.12);
  font-weight: 700;
}
.trial-table .empty { color: var(--muted); }
.btn[disabled] { opacity: 0.45; cursor: not-allowed; }
</style>
