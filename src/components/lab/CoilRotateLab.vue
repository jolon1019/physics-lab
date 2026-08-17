<script setup>
// 通电线圈在磁场中转动（教材 20.4 图 20.4-3 甲/乙/丙 + 换向器 20.4-4）—— 深色 2D SVG 互动动画
// 物理设定（与教材演示一致）：
//   - 转轴竖直（过线圈中心）；装置已绕竖直轴整体翻转 180°（电池固定原位不动）：
//     N（右，红）→ S（左，蓝），磁场 B 水平向左；B 与线圈电流 I 同时反向 → 受力 F 方向不变
//   - 线圈 abcd：a 左上、b 右上、c 右下、d 左下；电流 a→b→c→d 时左右两竖边受力等大反向
//     （右边向观者、左边背离），形成力矩使线圈"顺时针"（俯视）转动
//   - 图甲 θ=0°（线圈平面∥B）：力矩最大 → 顺时针转动，惯性越过平衡位置
//   - 图乙 θ=90°（平衡位置，线圈平面⊥B）：上、下边受力等大反向，合力矩为零 → 静止
//   - 图丙 θ>90°：受力阻碍转动 → 返回平衡位置；故通电线圈不能连续转动
//   - 手动换向 / 换向器（E、F 铜半环 + 电刷 A、B）：每次越过平衡位置改变电流方向 → 连续旋转
// 视角：斜二测投影（yaw 32°、俯角 20°），θ 增大 = 俯视顺时针
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])
let completed = false
function mark() {
  if (completed) return
  completed = true
  emit('complete')
}

/* ============ 可调参数 ============ */
const currentA = ref(1.0)      // 电流大小（A），影响力矩大小
const speedScale = ref(1.0)    // 演示速度倍率
const powered = ref(false)     // 开关闭合（通电）
const mode = ref('demo')       // demo=教材演示（甲乙丙+手动换向） comm=换向器自动
const scenario = ref('A')      // A 甲 / B 乙 / C 丙
const showForce = ref(true)    // 显示受力箭头
const showCur = ref(true)      // 显示电流
const hint = ref('依次选择 甲 / 乙 / 丙 并闭合开关，观察受力与转动；再试试「换向器」模式')

/* ============ 实时读数 ============ */
const liveTheta = ref('0°')
const liveCurrent = ref('— 断电 —')
const liveTorque = ref('—')
const liveState = ref('图甲：线圈平面与磁感线平行，闭合开关观察受力')
const liveNearFlip = ref(false)
const readoutTurns = ref('0.0 圈')

/* ============ 想想议议（教材页边问题） ============ */
const quizPick = ref('')
const quizDone = ref(false)
function pickQuiz(k) {
  if (quizDone.value) return
  quizPick.value = k
  if (k === 'A') quizDone.value = true
}

/* ============ 投影（斜二测） ============ */
const PSI = (32 * Math.PI) / 180
const EPS = (20 * Math.PI) / 180
const S = 52, CX = 450, CY = 268
function P(x, y, z) {
  const xh = x * Math.cos(PSI) + z * Math.sin(PSI)
  const d = -x * Math.sin(PSI) + z * Math.cos(PSI)
  return { x: CX + xh * S, y: CY - y * Math.cos(EPS) * S + d * Math.sin(EPS) * S }
}
function rot(p, th) { // 绕竖直轴（俯视顺时针为正）
  const c = Math.cos(th), s = Math.sin(th)
  return { x: p.x * c - p.z * s, y: p.y, z: p.x * s + p.z * c }
}

/* ============ 几何常量 ============ */
const W = 1.25, HH = 1.35            // 线圈半宽 / 半高
const CORNERS = { a: { x: -W, y: HH, z: 0 }, b: { x: W, y: HH, z: 0 }, c: { x: W, y: -HH, z: 0 }, d: { x: -W, y: -HH, z: 0 } }
const RC_DEMO = 0.26, RC_COMM = 0.30 // 滑环 / 换向器半径
const RING_Y1 = 2.06, RING_Y2 = 2.30, COMM_Y = 2.18

/* ============ 静态路径（磁极 / 导线，构建一次） ============ */
function bandPath(side, r) { // 弧形极靴（外方内弧，竖直壁），side=+1 → S（+x），-1 → N（-x）
  const yT = 1.6, yB = -1.6, phi = (38 * Math.PI) / 180
  const pts = []
  for (let i = 0; i <= 16; i++) { const a = -phi + (2 * phi * i) / 16; pts.push(P(side * r * Math.cos(a), yT, r * Math.sin(a))) }
  for (let i = 16; i >= 0; i--) { const a = -phi + (2 * phi * i) / 16; pts.push(P(side * r * Math.cos(a), yB, r * Math.sin(a))) }
  return 'M' + pts.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join('L') + 'Z'
}
const poleN_D = bandPath(1, 3.45), poleN_In = bandPath(1, 1.8)   // 装置翻转后 N 位于右侧
const poleS_D = bandPath(-1, 3.45), poleS_In = bandPath(-1, 1.8) // S 位于左侧
const nPos = P(2.62, 0.15, 0), sPos = P(-2.62, 0.15, 0)
const bLbl = P(-1.78, 0.33, 0)

// 磁感线（N→S，翻转后自右向左）三条 + B 标签
const bLines = [-0.95, 0, 0.95].map(y => {
  const a = P(1.62, y, 0), b = P(-1.62, y, 0)
  return { d: `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}` }
})

// 电 路 导 线（电池固定于底部原位，+ 左 − 右；导线取最短路径：左线贴 S 极外侧、右线贴 N 极外侧，无环绕交叉）
const wireL_D = 'M383,524 L302,524 Q286,524 286,508 L286,198 Q286,182 300,178 L415,164'
const wireR1_D = 'M485,160 L602,162 Q614,163 614,175 L614,524'
const wireR2_D = 'M572,524 L537,524'

/* ============ 运行时状态 ============ */
let theta = 0, angVel = 0
let manualSign = 1   // 电源极性（教材演示模式下的电流方向）
let curSign = 1      // 线圈中实际电流方向（换向器模式下由电刷接触决定）
let turnAcc = 0      // 换向器模式累计圈数
let flipFlashAt = -1
let msgFlashUntil = 0
const seen = { A: 0, B: 0, C: 0 }
let raf = null, lastT = 0, uiAcc = 0
let flowOff = 0

/* ============ 换向器接触逻辑（A 电刷位于方位角 180°、B 位于 0°） ============ */
function arcHas(start, span, ang) {
  let d = (ang - start) % (Math.PI * 2)
  if (d < 0) d += Math.PI * 2
  return d <= span
}
function contactSign(th) {
  const g = (14 * Math.PI) / 180, span = Math.PI - 2 * g
  if (arcHas(th + Math.PI / 2 + g, span, Math.PI)) return 1       // A→E、B→F
  if (arcHas(th + Math.PI / 2 + g + Math.PI, span, Math.PI)) return -1 // A→F、B→E
  return null                                                     // 半环间隙：保持
}

/* ============ DOM 工具 ============ */
const $ = id => document.getElementById(id)
function setD(id, d) { const el = $(id); if (el) el.setAttribute('d', d) }
function setT(id, t) { const el = $(id); if (el) el.setAttribute('transform', t) }
function setOff(id, o) { const el = $(id); if (el) el.setAttribute('stroke-dashoffset', o.toFixed(1)) }
function setShow(id, v) { const el = $(id); if (el) el.style.display = v ? '' : 'none' }

function ptStr(p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1) }

/* ============ 每帧渲染 ============ */
function render(now) {
  const ct = Math.cos(theta), st = Math.sin(theta)
  const ca = rot(CORNERS.a, theta), cb = rot(CORNERS.b, theta), cc = rot(CORNERS.c, theta), cd = rot(CORNERS.d, theta)
  const pa = P(ca.x, ca.y, ca.z), pb = P(cb.x, cb.y, cb.z), pc = P(cc.x, cc.y, cc.z), pd = P(cd.x, cd.y, cd.z)

  // 线圈 + 引线
  setD('coilPath', `M${ptStr(pa)} L${ptStr(pb)} L${ptStr(pc)} L${ptStr(pd)} Z`)
  setD('coilFlow', `M${ptStr(pa)} L${ptStr(pb)} L${ptStr(pc)} L${ptStr(pd)} Z`)
  const yA = mode.value === 'comm' ? COMM_Y : RING_Y1
  const yD = mode.value === 'comm' ? COMM_Y : RING_Y2
  const rc = mode.value === 'comm' ? RC_COMM : RC_DEMO
  const azA = mode.value === 'comm' ? theta + 2.967 : 2.967   // ≈170°
  const azD = mode.value === 'comm' ? theta + 4.782 : 3.316   // ≈190° / ≈274°
  const rA = P(rc * Math.cos(azA), yA, rc * Math.sin(azA))
  const rD = P(rc * Math.cos(azD), yD, rc * Math.sin(azD))
  setD('leadA', `M${ptStr(pa)} Q${((pa.x + rA.x) / 2 - 30).toFixed(1)},${(Math.min(pa.y, rA.y) - 30).toFixed(1)} ${ptStr(rA)}`)
  setD('leadB', `M${ptStr(pd)} Q${((pd.x + rD.x) / 2 - 30).toFixed(1)},${(Math.min(pd.y, rD.y) - 26).toFixed(1)} ${ptStr(rD)}`)

  // 角标 a b c d
  placeLabel('labA', pa); placeLabel('labB', pb); placeLabel('labC', pc); placeLabel('labD', pd)

  // 电流：沿线圈的流动虚线 + 左右边中点方向箭头
  const iOn = powered.value && showCur.value
  setShow('coilFlow', iOn); setShow('curA', iOn); setShow('curB', iOn)
  if (iOn) {
    flowOff -= (55 + 40 * currentA.value) * 0.016 * curSign
    setOff('coilFlow', flowOff)
    setOff('flowL', flowOff * 0.6); setOff('flowR1', flowOff * 0.6); setOff('flowR2', flowOff * 0.6)
    setShow('flowL', true); setShow('flowR1', true); setShow('flowR2', true)
    const mL = P((ca.x + cd.x) / 2, 0, (ca.z + cd.z) / 2)
    const mR = P((cb.x + cc.x) / 2, 0, (cb.z + cc.z) / 2)
    arrowAt('curA', mL.x, mL.y, pa.x - pd.x, pa.y - pd.y, curSign)
    arrowAt('curB', mR.x, mR.y, pc.x - pb.x, pc.y - pb.y, curSign)
  } else {
    setShow('flowL', false); setShow('flowR1', false); setShow('flowR2', false)
  }

  // 受力箭头（左右竖边：恒定 BIL，方向 ±视深；上、下边：∝|sinθ|，平衡位附近最明显）
  const fOn = powered.value && showForce.value
  const zx = 0.879, zy = 0.480 // 视深（+z）方向的屏幕单位向量
  const mL2 = P((ca.x + cd.x) / 2, 0, (ca.z + cd.z) / 2)
  const mR2 = P((cb.x + cc.x) / 2, 0, (cb.z + cc.z) / 2)
  drawForce('fRight', mR2.x, mR2.y, zx * curSign, zy * curSign, 58, fOn)
  drawForce('fLeft', mL2.x, mL2.y, -zx * curSign, -zy * curSign, 58, fOn)
  const mT = P((ca.x + cb.x) / 2, (CORNERS.a.y + CORNERS.b.y) / 2, (ca.z + cb.z) / 2)
  const mB2 = P((cc.x + cd.x) / 2, (CORNERS.c.y + CORNERS.d.y) / 2, (cc.z + cd.z) / 2)
  const sLen = 58 * Math.abs(st)
  drawForce('fTop', mT.x, mT.y, 0, -curSign * st, sLen, fOn && Math.abs(st) > 0.35)
  drawForce('fBot', mB2.x, mB2.y, 0, curSign * st, sLen, fOn && Math.abs(st) > 0.35)

  // 转动方向弧（跟随线圈）
  let dir = 0
  if (Math.abs(angVel) > 0.18) dir = Math.sign(angVel)
  else if (powered.value) { const a = curSign * ct; if (Math.abs(a) > 0.08) dir = Math.sign(a) }
  const arcEl = $('rotArc'), lblEl = $('rotLbl')
  if (dir !== 0 && arcEl) {
    const pts = []
    for (let i = 0; i <= 12; i++) { const az = theta + dir * (0.62 + (1.9 * i) / 12); pts.push(P(1.55 * Math.cos(az), -1.32, 1.55 * Math.sin(az))) }
    setD('rotArc', 'M' + pts.map(ptStr).join('L'))
    setShow('rotArc', true)
    if (lblEl) { lblEl.setAttribute('x', pts[6].x); lblEl.setAttribute('y', pts[6].y + 18); lblEl.textContent = dir > 0 ? '顺时针' : '逆时针' }
  } else setShow('rotArc', false)

  // 换向器半环（随线圈转动）
  if (mode.value === 'comm') {
    const g = (14 * Math.PI) / 180
    setD('commE', arcD(RC_COMM, COMM_Y, theta + Math.PI / 2 + g, Math.PI - 2 * g))
    setD('commF', arcD(RC_COMM, COMM_Y, theta + Math.PI * 1.5 + g, Math.PI - 2 * g))
    const flash = now - flipFlashAt < 350
    for (const id of ['brushA', 'brushB']) { const el = $(id); if (el) el.setAttribute('fill', flash ? '#ffe08a' : '#caa25a') }
  }
}
function arcD(r, y, a0, span) {
  const pts = []
  for (let i = 0; i <= 12; i++) { const a = a0 + (span * i) / 12; pts.push(P(r * Math.cos(a), y, r * Math.sin(a))) }
  return 'M' + pts.map(ptStr).join('L')
}
function placeLabel(id, p) {
  const dx = p.x - CX, dy = p.y - CY, L = Math.hypot(dx, dy) || 1
  const el = $(id)
  if (el) el.setAttribute('transform', `translate(${(p.x + (dx / L) * 17).toFixed(1)},${(p.y + (dy / L) * 17).toFixed(1)})`)
}
function arrowAt(id, x, y, vx, vy, sign) {
  const L = Math.hypot(vx, vy) || 1
  let deg = (Math.atan2(vy / L, vx / L) * 180) / Math.PI
  if (sign < 0) deg += 180
  setT(id, `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${deg.toFixed(1)})`)
}
function drawForce(id, x, y, ux, uy, len, show) {
  const el = $(id)
  if (!el) return
  if (!show || len < 4) { el.style.display = 'none'; return }
  const L = Math.hypot(ux, uy) || 1
  const deg = (Math.atan2(uy / L, ux / L) * 180) / Math.PI
  el.style.display = ''
  setT(id, `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${deg.toFixed(1)})`)
  const ln = el.querySelector('line')
  if (ln) ln.setAttribute('x2', len.toFixed(1))
  const tx = el.querySelector('text')
  if (tx) tx.setAttribute('x', (len * 0.45).toFixed(1))
}

/* ============ 物理 ============ */
function phys(h) {
  if (!powered.value) {
    angVel *= Math.max(0, 1 - 1.4 * h)
    if (Math.abs(angVel) < 0.02) angVel = 0
  } else {
    if (mode.value === 'comm') {
      const s = contactSign(theta)
      if (s !== null && s !== curSign) { flipFlashAt = performance.now() }
      if (s !== null) curSign = s
    } else curSign = manualSign
    const K = 6, c = 1.08
    const alpha = K * currentA.value * curSign * Math.cos(theta) - c * angVel
    angVel += alpha * h
    if (mode.value === 'comm') turnAcc += Math.abs(angVel * h) / (Math.PI * 2)
    seen[scenario.value] += h
  }
  theta += angVel * h
}

/* ============ 讲解文案 ============ */
function sceneTitle() {
  return scenario.value === 'A' ? '图甲' : scenario.value === 'B' ? '图乙' : '图丙'
}
function updateTexts() {
  const ct = Math.cos(theta), st = Math.sin(theta)
  let deg = ((theta * 180) / Math.PI) % 360
  if (deg < 0) deg += 360
  liveTheta.value = deg.toFixed(0) + '°'

  // 电流 / 力矩读数
  liveCurrent.value = powered.value ? (curSign > 0 ? 'a→b→c→d' : 'd→c→b→a') : '— 断电 —'
  if (!powered.value) liveTorque.value = '—'
  else if (Math.abs(ct) < 0.09) liveTorque.value = '0 · 平衡位置'
  else liveTorque.value = curSign * ct > 0 ? '顺时针' : '逆时针'
  readoutTurns.value = turnAcc.toFixed(1) + ' 圈'

  // 换向提示发光
  liveNearFlip.value = powered.value && mode.value === 'demo' && Math.abs(ct) < 0.2 && Math.abs(angVel) > 0.25

  // 主讲解
  let info = ''
  if (msgFlashUntil > performance.now()) {
    info = `<span class="hl-e">✓ 已改变电流方向！</span>力矩随之翻转，推动线圈继续转动`
  } else if (!powered.value) {
    if (scenario.value === 'A') info = `<span class="hl-r">图甲</span>：线圈平面与磁感线<span class="hl-b">平行</span>。闭合开关，左右两竖边受力等大反向 → 形成力矩使线圈<span class="hl-e">顺时针</span>转动`
    else if (scenario.value === 'B') info = `<span class="hl-r">图乙</span>：平衡位置（线圈平面与磁感线<span class="hl-b">垂直</span>）。闭合开关，看线圈是否运动…`
    else info = `<span class="hl-r">图丙</span>：线圈已冲过平衡位置。闭合开关，观察此刻受力方向…`
  } else if (mode.value === 'comm') {
    info = `<span class="hl-e">换向器工作</span>：线圈每越过平衡位置，E、F 铜半环就与电刷 A、B <span class="hl-i">自动换接</span>、电流方向自动改变 → <span class="hl-e">连续转动</span>（已转 ${turnAcc.toFixed(1)} 圈）`
  } else if (Math.abs(ct) < 0.12 && Math.abs(angVel) <= 0.3) {
    info = `停在<span class="hl-r">平衡位置</span>（图乙）：上、下两个边受力<span class="hl-i">大小一样、方向相反</span>，合力矩为零 —— <span class="hl-n">通电线圈不能连续转动</span>`
  } else if (Math.abs(ct) < 0.12) {
    info = `线圈由于<span class="hl-e">惯性</span>越过平衡位置…越过之后受力将<span class="hl-i">阻碍</span>转动，最后返回平衡位置`
  } else if (scenario.value === 'A' && ct > 0.05 && angVel >= -0.05) {
    info = `左右两竖边受力等大反向（<span class="hl-n">F = BIL</span>）→ 力矩最大，线圈沿<span class="hl-e">顺时针</span>方向转动（图甲）`
  } else if (curSign * ct * angVel < -0.02 && Math.abs(angVel) > 0.2) {
    info = `线圈越过平衡位置后，所受的力<span class="hl-i">阻碍它沿顺时针方向转动</span>（图丙）→ 线圈将返回平衡位置`
  } else {
    info = `线圈摆动中…力矩 M ∝ cosθ，在平衡位置附近来回振荡、逐渐衰减`
  }
  const ib = $('infoB')
  if (ib) ib.innerHTML = info

  // 状态行
  if (!powered.value) liveState.value = '开关断开 · ' + sceneTitle()
  else if (mode.value === 'comm') liveState.value = `换向器模式 · 连续转动中（${turnAcc.toFixed(1)} 圈）`
  else if (Math.abs(ct) < 0.12 && Math.abs(angVel) <= 0.3) liveState.value = '静止于平衡位置（图乙）· 不能连续转动'
  else if (Math.abs(ct) < 0.12) liveState.value = '惯性越过平衡位置'
  else if (curSign * ct * angVel < -0.02 && Math.abs(angVel) > 0.2) liveState.value = '受力阻碍转动（图丙）'
  else liveState.value = '通电受力转动中（' + sceneTitle() + '）'

  // 完成判定：三个场景各通电观察过 ≥0.6s，或换向器转过 ≥1.5 圈
  if (!completed && ((seen.A > 0.6 && seen.B > 0.6 && seen.C > 0.6) || turnAcc > 1.5)) {
    hint.value = '已观察甲/乙/丙受力情况（或换向器连续转动），实验完成！'
    mark()
  }
}

/* ============ 电池极性 / 开关图形 ============ */
function syncBattery() {
  const left = mode.value === 'comm' ? 1 : manualSign
  const bp = $('battP'), bn = $('battN')
  if (bp) bp.textContent = left > 0 ? '+' : '−'
  if (bn) bn.textContent = left > 0 ? '−' : '+'
}
function syncSwitch() {
  setT('swBladeG', powered.value ? '' : 'rotate(-42 572 524)')
  const b = $('btnPower')
  if (b) b.classList.toggle('on', powered.value)
}

/* ============ 交互 ============ */
function setScenario(k) {
  scenario.value = k
  powered.value = false
  mode.value = 'demo'
  manualSign = 1; curSign = 1
  angVel = 0
  theta = k === 'A' ? 0 : k === 'B' ? Math.PI / 2 : 2.356 // 135°
  syncBattery(); syncSwitch(); updateTexts()
}
function togglePower() {
  powered.value = !powered.value
  if (powered.value) mark0()
  syncSwitch(); updateTexts()
}
function mark0() { /* 通电即开始计时观察 */ }
function flipCurrent() {
  if (mode.value !== 'demo') return
  manualSign = -manualSign
  if (powered.value) msgFlashUntil = performance.now() + 2200
  syncBattery(); updateTexts()
}
function toggleMode() {
  mode.value = mode.value === 'demo' ? 'comm' : 'demo'
  if (mode.value === 'comm') { manualSign = 1; syncBattery() }
  updateTexts()
}
function toggleForceV() { showForce.value = !showForce.value }
function toggleCurV() { showCur.value = !showCur.value }
function reset() {
  setScenario('A')
  turnAcc = 0
  for (const k of ['A', 'B', 'C']) seen[k] = 0
  hint.value = '依次选择 甲 / 乙 / 丙 并闭合开关，观察受力与转动；再试试「换向器」模式'
}

/* ============ 主循环 ============ */
function animate(now) {
  raf = requestAnimationFrame(animate)
  let dt = (now - lastT) / 1000
  lastT = now
  if (!(dt > 0)) dt = 0.016
  if (dt > 0.05) dt = 0.05
  let t = dt * speedScale.value
  while (t > 0) { const h = Math.min(0.02, t); t -= h; phys(h) }
  render(now)
  uiAcc += dt
  if (uiAcc > 0.12) { uiAcc = 0; updateTexts() }
}
onMounted(() => {
  lastT = performance.now()
  syncBattery(); syncSwitch(); updateTexts()
  raf = requestAnimationFrame(animate)
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})

/* ============ 公式面板 ============ */
const formulaRows = computed(() => [
  { label: '磁场 B', value: 'N → S（翻转后向左）' },
  { label: '电流 I', value: currentA.value.toFixed(1) + ' A' },
  { label: '有效边受力 F', value: 'F = B·I·L' },
  { label: '力矩 M', value: 'M ∝ cosθ（θ 为偏离图甲的角度）' }
])
const verifyList = [
  '图甲（平面∥B）：左右两竖边受力等大反向，形成力矩 → 线圈顺时针转动',
  '图乙（平衡位置，平面⊥B）：上、下两边受力等大反向、合力矩为零 → 线圈静止',
  '线圈靠惯性越过平衡位置后，受力阻碍转动 → 最终返回平衡位置，故不能连续转动',
  '换向器：线圈两端连 E、F 铜半环随线圈转动，电刷 A、B 接电源；每越过平衡位置电流方向自动改变 → 连续转动（电动机原理）'
]
</script>

<template>
  <div class="lab-stage">
    <!-- 左：动画舞台 -->
    <div class="lab-left">
      <div class="lab-panel board-dark" style="padding:0;overflow:hidden;position:relative">
        <div class="lab-container">
          <div class="lab-title">⚡ 通电线圈在磁场中转动 — 电动机原理</div>

          <div class="legend">
            <div><span class="l-f"></span>力 F（左、右竖边）</div>
            <div><span class="l-f2"></span>力 F（上、下边·平衡位）</div>
            <div><span class="l-i"></span>电流 I 及方向</div>
            <div><span class="l-b"></span>磁感线 B（N→S）</div>
            <div><span class="l-r"></span>转动方向（画面视角）</div>
            <div class="flip-note">↺ 装置已翻转 180°（电池固定）：B 与 I 同时反向 → 受力方向不变</div>
          </div>

          <svg class="stage-svg" viewBox="0 0 920 600" preserveAspectRatio="xMidYMid meet" aria-label="通电线圈在磁场中转动互动演示">
            <defs>
              <linearGradient id="gN" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#a01c12" /><stop offset="0.55" stop-color="#e0352b" /><stop offset="1" stop-color="#7a120b" />
              </linearGradient>
              <linearGradient id="gS" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#123a8a" /><stop offset="0.55" stop-color="#4d8dff" /><stop offset="1" stop-color="#0c2a66" />
              </linearGradient>
              <marker id="mB" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#6ab7ff" /></marker>
              <marker id="mArc" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#4dd8ff" /></marker>
              <marker id="mF" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ff5b6e" /></marker>
              <marker id="mF2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#c586ff" /></marker>
            </defs>

            <!-- 地面阴影 -->
            <ellipse cx="450" cy="346" rx="150" ry="24" fill="rgba(0,0,0,0.30)" />

            <!-- 磁感线（N→S） -->
            <g>
              <path v-for="(l, i) in bLines" :key="'bl' + i" :d="l.d" stroke="rgba(106,183,255,0.55)" stroke-width="2" marker-end="url(#mB)" fill="none" />
              <path v-for="(l, i) in bLines" :key="'bf' + i" :d="l.d" class="bflow" stroke="rgba(150,210,255,0.5)" stroke-width="2" fill="none" />
              <text :x="bLbl.x" :y="bLbl.y" fill="#6ab7ff" font-size="15" font-weight="800" font-style="italic">B</text>
            </g>

            <!-- 转轴（竖直） -->
            <line x1="450" y1="344" x2="450" y2="150" stroke="#8a93a6" stroke-width="3.5" stroke-linecap="round" />

            <!-- 磁极（外方内弧极靴） -->
            <path :d="poleN_D" fill="url(#gN)" stroke="#5c0d07" stroke-width="2" />
            <path :d="poleN_In" fill="rgba(0,0,0,0.28)" stroke="rgba(255,200,190,0.30)" stroke-width="1.5" />
            <path :d="poleS_D" fill="url(#gS)" stroke="#081f4d" stroke-width="2" />
            <path :d="poleS_In" fill="rgba(0,0,0,0.28)" stroke="rgba(200,220,255,0.30)" stroke-width="1.5" />
            <text :x="nPos.x" :y="nPos.y" text-anchor="middle" fill="#fff" font-size="30" font-weight="900" style="paint-order:stroke;stroke:rgba(0,0,0,0.35);stroke-width:4">N</text>
            <text :x="sPos.x" :y="sPos.y" text-anchor="middle" fill="#fff" font-size="30" font-weight="900" style="paint-order:stroke;stroke:rgba(0,0,0,0.35);stroke-width:4">S</text>

            <!-- 滑环（教材演示模式：两全环，电流方向恒定） -->
            <g v-show="mode === 'demo'">
              <ellipse cx="450" cy="167.3" rx="13.5" ry="4.6" fill="none" stroke="#d98e3f" stroke-width="3.2" />
              <ellipse cx="450" cy="155.6" rx="13.5" ry="4.6" fill="none" stroke="#b06a2a" stroke-width="3.2" />
            </g>
            <!-- 换向器（E、F 铜半环，随线圈转动） -->
            <g v-show="mode === 'comm'">
              <path id="commE" fill="none" stroke="#d98e3f" stroke-width="4.6" stroke-linecap="round" />
              <path id="commF" fill="none" stroke="#9c5a2a" stroke-width="4.6" stroke-linecap="round" />
              <text x="376" y="150" text-anchor="end" fill="#e8b06a" font-size="11.5" font-weight="700">换向器 E、F 半环</text>
              <line x1="378" y1="153" x2="428" y2="161" stroke="rgba(232,176,106,0.45)" stroke-width="1" />
            </g>

            <!-- 电刷 A、B -->
            <rect id="brushA" x="415" y="156" width="15" height="17" rx="3" fill="#caa25a" stroke="#8a6a30" stroke-width="1.5" />
            <rect id="brushB" x="470" y="152" width="15" height="17" rx="3" fill="#caa25a" stroke="#8a6a30" stroke-width="1.5" />
            <text x="421" y="186" fill="#ffd9a0" font-size="11" font-weight="800">A</text>
            <text x="474" y="146" fill="#ffd9a0" font-size="11" font-weight="800">B</text>

            <!-- 电 路：导线 + 电源 + 开关 -->
            <g>
              <path id="wireL" :d="wireL_D" stroke="#cfd6e2" stroke-width="3.5" fill="none" stroke-linejoin="round" stroke-linecap="round" />
              <path id="wireR1" :d="wireR1_D" stroke="#cfd6e2" stroke-width="3.5" fill="none" stroke-linejoin="round" stroke-linecap="round" />
              <path id="wireR2" :d="wireR2_D" stroke="#cfd6e2" stroke-width="3.5" fill="none" stroke-linejoin="round" stroke-linecap="round" />
              <path id="flowL" :d="wireL_D" stroke="#ffcf7a" stroke-width="2.2" fill="none" stroke-dasharray="6 12" style="display:none" />
              <path id="flowR1" :d="wireR1_D" stroke="#ffcf7a" stroke-width="2.2" fill="none" stroke-dasharray="6 12" style="display:none" />
              <path id="flowR2" :d="wireR2_D" stroke="#ffcf7a" stroke-width="2.2" fill="none" stroke-dasharray="6 12" style="display:none" />
              <!-- 电源 -->
              <rect x="383" y="512" width="12" height="24" rx="2" fill="#9aa3b2" />
              <rect x="525" y="512" width="12" height="24" rx="2" fill="#9aa3b2" />
              <rect x="395" y="496" width="130" height="56" rx="8" fill="#242c3a" stroke="#46536a" stroke-width="2" />
              <rect x="403" y="504" width="34" height="40" rx="3" fill="none" stroke="#5a6b85" stroke-width="2" />
              <rect x="443" y="504" width="34" height="40" rx="3" fill="none" stroke="#5a6b85" stroke-width="2" />
              <text x="487" y="530" text-anchor="middle" fill="#9fb0c8" font-size="12.5" font-weight="800">电源</text>
              <text id="battP" x="389" y="508" text-anchor="middle" fill="#ffd166" font-size="15" font-weight="900">+</text>
              <text id="battN" x="531" y="508" text-anchor="middle" fill="#7fd0ff" font-size="15" font-weight="900">−</text>
              <!-- 开关（底部水平串接在电池− 回路上，导线最短路径） -->
              <circle cx="614" cy="524" r="4.5" fill="#cfd6e2" />
              <circle cx="572" cy="524" r="4.5" fill="#cfd6e2" />
              <g id="swBladeG">
                <line x1="572" y1="524" x2="614" y2="524" stroke="#e6ebf2" stroke-width="4.5" stroke-linecap="round" />
              </g>
              <text x="593" y="507" text-anchor="middle" fill="#9fb0c8" font-size="12" font-weight="700">开关</text>
              <rect x="552" y="496" width="92" height="54" fill="transparent" style="cursor:pointer" @click="togglePower">
                <title>{{ powered ? '断开开关' : '闭合开关' }}</title>
              </rect>
            </g>

            <!-- 线圈引线 + 线圈 abcd -->
            <path id="leadA" fill="none" stroke="#caa05a" stroke-width="3" />
            <path id="leadB" fill="none" stroke="#caa05a" stroke-width="3" />
            <path id="coilPath" fill="rgba(255,190,120,0.05)" stroke="#f0a852" stroke-width="5.5" stroke-linejoin="round" style="filter:drop-shadow(0 0 6px rgba(255,170,80,0.35))" />
            <path id="coilFlow" fill="none" stroke="#ffcf7a" stroke-width="2.6" stroke-dasharray="7 11" style="display:none" />
            <g id="curA" style="display:none"><path d="M0,-4.5 L9,0 L0,4.5 Z" fill="#ffb74d" /></g>
            <g id="curB" style="display:none"><path d="M0,-4.5 L9,0 L0,4.5 Z" fill="#ffb74d" /></g>
            <g class="corner-lbl" id="labA"><circle r="8" /><text text-anchor="middle" dy="3.5">a</text></g>
            <g class="corner-lbl" id="labB"><circle r="8" /><text text-anchor="middle" dy="3.5">b</text></g>
            <g class="corner-lbl" id="labC"><circle r="8" /><text text-anchor="middle" dy="3.5">c</text></g>
            <g class="corner-lbl" id="labD"><circle r="8" /><text text-anchor="middle" dy="3.5">d</text></g>

            <!-- 受力箭头 -->
            <g id="fRight" style="display:none"><line x1="0" y1="0" x2="58" y2="0" stroke="#ff5b6e" stroke-width="4" marker-end="url(#mF)" /><text y="-9" fill="#ff8090" font-size="13" font-weight="800">F</text></g>
            <g id="fLeft" style="display:none"><line x1="0" y1="0" x2="58" y2="0" stroke="#ff5b6e" stroke-width="4" marker-end="url(#mF)" /><text y="-9" fill="#ff8090" font-size="13" font-weight="800">F</text></g>
            <g id="fTop" style="display:none"><line x1="0" y1="0" x2="40" y2="0" stroke="#c586ff" stroke-width="4" marker-end="url(#mF2)" /><text y="-9" fill="#d5a8ff" font-size="13" font-weight="800">F</text></g>
            <g id="fBot" style="display:none"><line x1="0" y1="0" x2="40" y2="0" stroke="#c586ff" stroke-width="4" marker-end="url(#mF2)" /><text y="-9" fill="#d5a8ff" font-size="13" font-weight="800">F</text></g>

            <!-- 转动方向弧 -->
            <path id="rotArc" fill="none" stroke="#4dd8ff" stroke-width="2.6" opacity="0.9" marker-end="url(#mArc)" style="display:none" />
            <text id="rotLbl" fill="#4dd8ff" font-size="12" font-weight="800" text-anchor="middle"></text>
          </svg>

          <!-- 底部控制栏 -->
          <div class="panel">
            <div class="col" style="min-width:196px">
              <div class="lbl">教材场景（图 20.4-3）</div>
              <div class="chips">
                <span class="chip" :class="{ on: scenario === 'A' }" @click="setScenario('A')">甲·受力转动</span>
                <span class="chip" :class="{ on: scenario === 'B' }" @click="setScenario('B')">乙·平衡位置</span>
                <span class="chip" :class="{ on: scenario === 'C' }" @click="setScenario('C')">丙·受力阻碍</span>
              </div>
            </div>

            <div class="col" style="min-width:170px">
              <div class="lbl">操作</div>
              <div class="btns">
                <button id="btnPower" class="btn" @click="togglePower">{{ powered ? '⏻ 断电' : '⚡ 通电' }}</button>
                <button class="btn btn-flip" :class="{ 'btn-glow': liveNearFlip, disabled: mode === 'comm' }" @click="flipCurrent" title="在线圈每次越过平衡位置时点击，改变电流方向可让线圈继续转动">⇄ 手动换向<span v-if="liveNearFlip" class="flip-now">·现在点！</span></button>
              </div>
              <div class="btns">
                <button class="btn" :class="{ on: mode === 'comm' }" @click="toggleMode" title="E、F 铜半环 + 电刷 A、B，越过平衡位置自动改变电流方向">换向器模式</button>
              </div>
            </div>

            <div class="info">
              <div class="info-title">📖 观察与解释</div>
              <div class="info-body" id="infoB">选择场景并闭合开关（点击图中开关也可以），观察线圈的受力与转动</div>
            </div>

            <div class="col" style="min-width:76px">
              <div class="lbl">显示</div>
              <div class="btns">
                <button class="btn" :class="{ on: showForce }" @click="toggleForceV">受力</button>
                <button class="btn" :class="{ on: showCur }" @click="toggleCurV">电流</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="lab-actions">
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
        <div class="btn-group">
          <button class="btn btn-sm" @click="reset">重置</button>
        </div>
      </div>
    </div>

    <!-- 右：变量 + 数据 + 公式 + 想想议议 + 教材对照 -->
    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>可调变量</strong>
          <span>实时联动</span>
        </div>
        <div class="lab-params">
          <ParamSlider v-model="currentA" :min="0.5" :max="2" :step="0.1" :precision="1" label="电流大小 I" unit=" A" hint="电流越大，受力 F=BIL 越大，摆动越快" />
          <ParamSlider v-model="speedScale" :min="0.3" :max="2" :step="0.1" :precision="1" label="演示速度" unit=" ×" hint="数值越大演示越快" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实时数据</strong>
          <span>只读输出</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat">
            <span>线圈位置 θ</span>
            <strong>{{ liveTheta }}</strong>
          </div>
          <div class="lab-stat accent">
            <span>电流方向</span>
            <strong style="font-size:12px">{{ liveCurrent }}</strong>
          </div>
          <div class="lab-stat">
            <span>力矩方向</span>
            <strong style="font-size:12px">{{ liveTorque }}</strong>
          </div>
          <div class="lab-stat">
            <span>换向器累计</span>
            <strong>{{ readoutTurns }}</strong>
          </div>
          <div class="lab-stat success" style="grid-column:1/-1">
            <span>当前状态</span>
            <strong style="font-size:12px;white-space:normal">{{ liveState }}</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="磁场对通电导线的作用"
        formula="F = B·I·L　　M ∝ cosθ"
        desc="左、右两竖边电流方向相反，在磁场中受力等大反向形成力矩；线圈偏离图甲的角度 θ 越小力矩越大，平衡位置（图乙）力矩为零。"
        :rows="formulaRows"
        :result="[
          { label: '电流方向', value: liveCurrent },
          { label: '力矩方向', value: liveTorque }
        ]"
        :verify="verifyList"
      />

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>想想议议</strong>
          <span>教材页边问题</span>
        </div>
        <div class="quiz-box">
          <p class="quiz-q">如果电流的方向和磁场的方向<strong>都变得相反</strong>，通电导线受力的方向会怎样？</p>
          <div class="quiz-opts">
            <button class="btn" :class="{ on: quizPick === 'A' }" @click="pickQuiz('A')">保持不变</button>
            <button class="btn" :class="{ on: quizPick === 'B' }" @click="pickQuiz('B')">也变得相反</button>
            <button class="btn" :class="{ on: quizPick === 'C' }" @click="pickQuiz('C')">变为与两者垂直</button>
          </div>
          <p v-if="quizPick" class="quiz-a" :class="quizPick === 'A' ? 'ok' : 'no'">
            <template v-if="quizPick === 'A'">✔ 正确！F = I·L×B，I 与 B 同时取负号：(−I)L×(−B) = I·L×B，受力方向不变。</template>
            <template v-else>✘ 再想想：两个负号相乘会相互抵消（−I × −B = I × B），所以受力方向不变。</template>
          </p>
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>教材对照（20.4 电动机）</strong>
          <span>演示步骤</span>
        </div>
        <ol class="ref-list">
          <li><strong>图乙·平衡位置</strong>：闭合开关，线圈不动 —— 上、下两个边受力大小一样、方向相反。</li>
          <li><strong>图甲·受力转动</strong>：闭合开关，线圈沿顺时针方向转动，并由于惯性越过平衡位置。</li>
          <li><strong>图丙·受力阻碍</strong>：冲过平衡位置后闭合开关，线圈逆时针转动 —— 受力阻碍它沿顺时针方向转动，最后返回平衡位置。</li>
          <li><strong>结论</strong>：线圈不能连续转动。若在越过平衡位置后改变电流方向，线圈将继续转动 —— 实际电动机由<strong>换向器</strong>（E、F 铜半环 + 电刷 A、B）自动完成。</li>
          <li><strong>装置翻转 180°</strong>：电池固定原位不动，磁体与线圈整体翻转、导线按最短路径重新连接 —— 磁场 B 与线圈电流 I <strong>同时反向</strong>，受力 F 方向不变，线圈仍照常转动（印证"想想议议"结论）。</li>
        </ol>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.lab-container {
  width: 100%;
  height: 100%;
  min-height: 500px;
  background: transparent;
  border-radius: 16px;
  position: relative;
  overflow: hidden;
  user-select: none;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
}
.lab-container svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: calc(100% - 80px);
}
.lab-title {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  color: #f0f4f8;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 2px;
  text-shadow: 0 0 20px rgba(120, 180, 255, 0.5);
  z-index: 30;
  white-space: nowrap;
}
.legend {
  position: absolute;
  top: 40px;
  left: 14px;
  font-size: 10px;
  color: rgba(140, 180, 220, 0.75);
  line-height: 2;
  z-index: 20;
}
.legend span { display: inline-block; width: 22px; height: 3px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
.flip-note {
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px dashed rgba(56, 189, 248, 0.25);
  color: rgba(125, 211, 252, 0.85);
  font-size: 9.5px;
  line-height: 1.5;
  max-width: 168px;
}
.l-f { background: #ff5b6e; }
.l-f2 { background: #c586ff; }
.l-i { background: repeating-linear-gradient(90deg, #ffb74d, #ffb74d 4px, transparent 4px, transparent 8px); }
.l-b { background: #6ab7ff; }
.l-r { background: #4dd8ff; }
/* 磁感线流动 */
.bflow { stroke-dasharray: 10 14; animation: bflow 1.1s linear infinite; }
@keyframes bflow { to { stroke-dashoffset: -48; } }
/* 线圈角标 */
.corner-lbl circle { fill: rgba(20, 26, 38, 0.75); stroke: #f0a852; stroke-width: 1.5; }
.corner-lbl text { fill: #ffd9a0; font-size: 12px; font-weight: 800; }
/* 底部控制栏（与凸透镜实验室一致） */
.panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 80px;
  background: linear-gradient(180deg, rgba(5,8,16,0.98), rgba(3,5,12,0.99));
  border-top: 1px solid rgba(30,50,80,0.6);
  display: flex;
  padding: 10px 14px;
  gap: 12px;
  z-index: 40;
  align-items: center;
}
.col { display: flex; flex-direction: column; gap: 8px; }
.lbl {
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  padding: 4px 9px;
  background: rgba(56,189,248,0.12);
  border: 1px solid rgba(56,189,248,0.3);
  color: #38bdf8;
  font-size: 10px;
  font-weight: 700;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}
.chip:hover { background: rgba(56,189,248,0.25); border-color: rgba(56,189,248,0.6); transform: translateY(-1px); }
.chip.on { background: rgba(74,222,128,0.18); border-color: rgba(74,222,128,0.5); color: #4ade80; }
.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 0 12px;
  border-left: 1px solid rgba(30,50,80,0.5);
  border-right: 1px solid rgba(30,50,80,0.5);
  min-width: 0;
}
.info-title {
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.info-body { color: #e2e8f0; font-size: 12px; line-height: 1.6; }
.hl-r { color: #f87171; font-weight: 800; }
.hl-b { color: #60a5fa; font-weight: 800; }
.hl-e { color: #4ade80; font-weight: 800; }
.hl-i { color: #fbbf24; font-weight: 800; }
.hl-n { color: #ef4444; font-weight: 800; }
.btns { display: flex; gap: 6px; flex-wrap: wrap; }
.btn {
  padding: 4px 10px;
  background: rgba(100,116,139,0.12);
  border: 1px solid rgba(100,116,139,0.25);
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn.on { background: rgba(74,222,128,0.15); border-color: rgba(74,222,128,0.4); color: #4ade80; }
.btn:hover { background: rgba(100,116,139,0.22); }
.btn.disabled { opacity: 0.4; pointer-events: none; }
/* 手动换向按钮：接近平衡位置时发光提示 */
.btn-flip { border-color: #c0742a; color: #f0c98a; }
.btn-glow { animation: flipPulse 0.85s ease-in-out infinite; }
@keyframes flipPulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(255, 209, 102, 0.5), 0 0 10px 1px rgba(255, 209, 102, 0.55); }
  50% { box-shadow: 0 0 0 3px rgba(255, 209, 102, 0.85), 0 0 18px 4px rgba(255, 209, 102, 0.9); }
}
.flip-now { margin-left: 4px; font-weight: 800; color: #ffd166; }
/* 想想议议 */
.quiz-box { padding: 10px 12px; display: grid; gap: 8px; }
.quiz-q { margin: 0; font-size: 12.5px; color: var(--text); line-height: 1.6; }
.quiz-opts { display: flex; gap: 6px; flex-wrap: wrap; }
.quiz-a { margin: 0; font-size: 12px; line-height: 1.6; }
.quiz-a.ok { color: var(--success); font-weight: 700; }
.quiz-a.no { color: var(--danger, #f87171); }
/* 教材对照 */
.ref-list { margin: 0; padding: 8px 18px 12px 24px; font-size: 12px; color: var(--text); line-height: 1.7; }
.ref-list li { margin-bottom: 4px; }
.ref-list strong { color: var(--accent-strong); }
</style>