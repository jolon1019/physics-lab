<script setup>
// 通电线圈在磁场中转动（直流电动机结构 · 直接供电 · 换向器可选）—— three.js 3D 版本
// 物理设定（轴系）：
//   - 转轴 = 水平 Z 轴，线圈为矩形开口导体，绕 Z 轴转动（转子）
//   - 磁场 B：由 N(-X) 指向 S(+X)，外方内弧磁极（外缘正方块、内弧面包裹线圈）提供径向场（气隙非闭合）
//   - 线圈两条有效边位于 ±X（磁极之间），电流沿 ±Z，受力 F = I·L×B 沿 ±Y（绕 Z 轴形成力矩）
//   - 换向器（轴上 E/F 半环 + 静止电刷）可选：
//       · 关（手动换向演示）：电流方向恒定，线圈摆到平衡位即停；需在侧立位点「⇄ 手动换向」维持旋转
//       · 开（自动换向）：线圈越过平衡位时电流自动翻转 → 连续旋转（真实直流电机行为）
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
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
const playing = ref(false)
const reverseCurrent = ref(false) // 电流反向 → 受力方向也随之反向（手动模式即手动换向；自动模式即翻转整体转向）
const commutatorOn = ref(false) // 换向器开关：关=手动换向演示，开=自动连续旋转
const speedScale = ref(1) // 演示速度倍率

/* ============ 几何常量（three 世界单位） ============ */
const W = 0.55 // 线圈有效边到中轴(X)距离（半宽）
const D = 0.8 // 线圈半深（Z 方向）
const POLE_RIN = 1.0 // 磁极内弧面半径（包裹线圈，留气隙）——较旧版增大以降低对展示的干扰并拉开间距
const POLE_ROUT = 1.9 // 磁极外缘半径
const POLE_PHI = (38 * Math.PI) / 180 // 极弧半张角（较旧版 60° 减小，弧度更收敛、降低对展示的干扰）
const MAG_X = (POLE_RIN * Math.cos(POLE_PHI) + POLE_ROUT) / 2 // 磁极中心 X（用于标签/参考）
const shaftR = 0.14
const shaftLen = 8.0 // 转子轴贯穿两端轴承座（z: -4.0 ~ +4.0），末端伸到换向器处
const COMM_Z = 3.5 // 换向器 z（移至转轴末端、明显越过 +Z 轴承座，电刷不再压在轴承座上）
const rC = 0.22 // 换向器半径
const K = 2.0 // 力矩系数
const ROOT_Y = 1.9 // 整体抬高 3D 平面高度，确保动画中平面始终可见、不被遮挡

/* ============ three.js 运行时 ============ */
const containerRef = ref(null)
let renderer, scene, camera, controls, root, coilGroup, fLeft, fRight, iL, iR
let coilLeadA = null, coilLeadB = null
let electrons = [] // 沿线圈流动的电子小球
let electronT = [] // 各电子的路径参数 t∈[0,1)
let raf = null
let lastTime = 0
let resizeObs = null
let angle = 0.6 // 初始小偏角，便于观察摆向平衡位的过程
let angVel = 0

// 实时读数（由动画循环写回，节流）
const liveTheta = ref(0)
const liveState = ref('开口线圈：偏离平衡位，受摆动力矩')
const liveCurrent = ref('正向')
const liveNearFlip = ref(false) // 线圈接近侧立位（θ≈±90°），提示此刻手动换向可维持旋转

/* ============ 标签精灵 ============ */
function makeLabel(text, color = '#ffffff', bg = null) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 72
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, c.width, c.height)
  if (bg) {
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.roundRect(8, 8, 112, 56, 10)
    ctx.fill()
  }
  ctx.fillStyle = color
  ctx.font = 'bold 52px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 64, 38)
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  const sp = new THREE.Sprite(mat)
  sp.scale.set(0.9, 0.5, 1)
  return sp
}

/* ============ 在两点间建一根圆柱（线圈框 / 导线 / 引线） ============ */
function addBar(p1, p2, radius, mat) {
  const dir = new THREE.Vector3().subVectors(p2, p1)
  const len = dir.length()
  const geo = new THREE.CylinderGeometry(radius, radius, len, 14)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(p1).add(p2).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  return mesh
}

/* ============ 导线（通电变色，默认金黄） ============ */
function makeWire(p1, p2, color = 0xffd166) {
  const dir = new THREE.Vector3().subVectors(p2, p1)
  const len = dir.length()
  const geo = new THREE.CylinderGeometry(0.05, 0.05, len, 12)
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.12 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(p1).add(p2).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  return mesh
}

/* ============ 外方内弧极靴（外缘正方块·内弧面包裹线圈），沿 Z 拉伸 ============ */
function makePoleShoe(isN) {
  const rIn = POLE_RIN, rOut = POLE_ROUT, phi = POLE_PHI
  const tipX = rIn * Math.cos(phi) // 弧两端 x
  const tipY = rIn * Math.sin(phi) // 弧两端 y
  const square = rOut - tipX // 外缘正方块边长（宽=高 → 正方形）
  const shape = new THREE.Shape()
  // 下弧端 → 内弧面（包裹线圈的弧形面，绕转子轴）→ 外缘正方块 → 闭合
  shape.moveTo(tipX, -tipY)
  shape.absarc(0, 0, rIn, -phi, phi, false) // 内弧面（凹向线圈）
  shape.lineTo(rOut, square / 2) // 外缘上角
  shape.lineTo(rOut, -square / 2) // 外缘下角
  shape.lineTo(tipX, -tipY) // 回到下弧端
  shape.closePath()
  const depth = 2.4
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  geo.translate(0, 0, -depth / 2)
  const color = isN ? 0xd92135 : 0x145fd2
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.55 }))
  mesh.rotation.y = isN ? Math.PI : 0 // N 极翻到 -X 侧，S 极在 +X 侧
  return mesh
}

/* ============ 沿折线取点（用于电子流） ============ */
function pointOnLoop(corners, t) {
  let total = 0
  const segs = []
  for (let i = 0; i < corners.length - 1; i++) {
    const d = corners[i].distanceTo(corners[i + 1])
    segs.push(d)
    total += d
  }
  let dist = (t % 1) * total
  if (dist < 0) dist += total
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i] || i === segs.length - 1) {
      const k = segs[i] ? dist / segs[i] : 0
      return new THREE.Vector3().lerpVectors(corners[i], corners[i + 1], k)
    }
    dist -= segs[i]
  }
  return corners[0].clone()
}

function buildScene() {
  const el = containerRef.value
  const w = el.clientWidth || 720
  const h = el.clientHeight || 460

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h)
  el.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0e1320)

  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
  camera.position.set(5.8, 3.0, 7.8)
  camera.lookAt(0, 0.3, 0)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 4
  controls.maxDistance = 18
  controls.target.set(0, 0.3, 0)

  // 灯光
  scene.add(new THREE.AmbientLight(0xffffff, 0.75))
  const dir = new THREE.DirectionalLight(0xffffff, 0.9)
  dir.position.set(6, 9, 6)
  scene.add(dir)
  const dir2 = new THREE.DirectionalLight(0xbcd0ff, 0.35)
  dir2.position.set(-6, 3, -4)
  scene.add(dir2)

  // 整体抬高：所有几何放进 root，root 上移 ROOT_Y
  root = new THREE.Group()
  root.position.y = ROOT_Y
  scene.add(root)

  // 地面网格（景深参考，随 root 抬高）
  const grid = new THREE.GridHelper(20, 20, 0x2a3350, 0x1c2236)
  grid.position.y = -2.6
  root.add(grid)

  // 转子轴（沿 Z，贯穿两端轴承座）
  const axleMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.6, roughness: 0.4 })
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 20), axleMat)
  shaft.rotation.x = Math.PI / 2
  shaft.position.z = 0
  root.add(shaft)

  // 外方内弧磁极：N（红，左 -X）/ S（蓝，右 +X）；外缘正方块、内弧面包裹线圈，分离 = 非闭合
  const poleN = makePoleShoe(true)
  const poleS = makePoleShoe(false)
  root.add(poleN, poleS)
  const nLabel = makeLabel('N', '#ffffff')
  nLabel.position.set(-MAG_X, 1.7, 0)
  const sLabel = makeLabel('S', '#ffffff')
  sLabel.position.set(MAG_X, 1.7, 0)
  root.add(nLabel, sLabel)

  // 定子轴承座 ×2（带轴构造）：位于轴两端，固定支撑转子轴（仅几何，标注文字已移除）
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x394763, roughness: 0.7 })
  for (const sz of [2.8, -2.8]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.5), seatMat)
    seat.position.set(0, -1.1, sz)
    root.add(seat)
    const hole = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftR + 0.06, shaftR + 0.06, 0.6, 16),
      new THREE.MeshStandardMaterial({ color: 0x10141f, roughness: 0.9 })
    )
    hole.rotation.x = Math.PI / 2
    hole.position.set(0, 0, sz)
    root.add(hole)
  }

  // 线圈（旋转组，绕 Z）
  coilGroup = new THREE.Group()
  root.add(coilGroup)
  const coilMat = new THREE.MeshStandardMaterial({ color: 0xc0742a, metalness: 0.5, roughness: 0.45 })

  // 开口线圈：4 点矩形（XZ 平面），不闭合
  const pA = new THREE.Vector3(W, 0, D) // +X, +Z 端
  const pB = new THREE.Vector3(W, 0, -D) // +X, -Z 端
  const pC = new THREE.Vector3(-W, 0, -D) // -X, -Z 端
  const pD = new THREE.Vector3(-W, 0, D) // -X, +Z 端
  const curve = new THREE.CatmullRomCurve3([pA, pB, pC, pD], false)
  const coilGeo = new THREE.TubeGeometry(curve, 80, 0.07, 10, false)
  coilGroup.add(new THREE.Mesh(coilGeo, coilMat))

  // 顶点标号 a/b/c/d
  const labA = makeLabel('a', '#ffe2b0'); labA.position.set(W + 0.3, 0.25, D); labA.scale.set(0.5, 0.3, 1)
  const labB = makeLabel('b', '#ffe2b0'); labB.position.set(W + 0.3, -0.25, -D); labB.scale.set(0.5, 0.3, 1)
  const labC = makeLabel('c', '#ffe2b0'); labC.position.set(-W - 0.3, -0.25, -D); labC.scale.set(0.5, 0.3, 1)
  const labD = makeLabel('d', '#ffe2b0'); labD.position.set(-W - 0.3, 0.25, D); labD.scale.set(0.5, 0.3, 1)
  coilGroup.add(labA, labB, labC, labD)

  // 线圈延长线（平行轴 Z，引向转轴末端的换向器）+ 接到 E/F 半环的短接
  coilLeadA = makeWire(pA, new THREE.Vector3(W, 0, COMM_Z), 0xffd166)
  coilLeadB = makeWire(pD, new THREE.Vector3(-W, 0, COMM_Z), 0xffd166)
  const stubA = makeWire(new THREE.Vector3(W, 0, COMM_Z), new THREE.Vector3(0.12, rC - 0.02, COMM_Z), 0xffd166)
  const stubB = makeWire(new THREE.Vector3(-W, 0, COMM_Z), new THREE.Vector3(-0.12, -(rC - 0.02), COMM_Z), 0xffd166)
  coilGroup.add(coilLeadA, coilLeadB, stubA, stubB)

  // 换向器（随线圈转动，位于转轴末端）：E/F 两铜半环（留绝缘缝）+ 绝缘毂
  const commMat = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.7, roughness: 0.35 })
  const commGap = 0.16 // 半环间绝缘缝（弧度）
  const lenC = 0.55
  const commE = new THREE.Mesh(new THREE.CylinderGeometry(rC, rC, lenC, 28, 1, false, commGap / 2, Math.PI - commGap), commMat)
  const commF = new THREE.Mesh(new THREE.CylinderGeometry(rC, rC, lenC, 28, 1, false, Math.PI + commGap / 2, Math.PI - commGap), commMat)
  commE.rotation.x = Math.PI / 2
  commF.rotation.x = Math.PI / 2
  commE.position.set(0, 0, COMM_Z)
  commF.position.set(0, 0, COMM_Z)
  coilGroup.add(commE, commF)
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(rC * 0.5, rC * 0.5, lenC * 1.05, 16),
    new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.9 })
  )
  hub.rotation.x = Math.PI / 2
  hub.position.set(0, 0, COMM_Z)
  coilGroup.add(hub)
  const labE = makeLabel('E', '#ffe2b0'); labE.position.set(0, rC + 0.2, COMM_Z); labE.scale.set(0.5, 0.3, 1)
  const labF = makeLabel('F', '#ffe2b0'); labF.position.set(0, -(rC + 0.2), COMM_Z); labF.scale.set(0.5, 0.3, 1)
  coilGroup.add(labE, labF)

  // 电流方向小箭头（有效边中部，沿 ±Z）
  const iMat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x3a1c00 })
  const coneGeo = new THREE.ConeGeometry(0.12, 0.3, 14)
  iL = new THREE.Mesh(coneGeo, iMat)
  iL.position.set(-W, 0, 0) // 锥尖默认 +Y，由 applyCurrentDirection 调向
  iR = new THREE.Mesh(coneGeo, iMat)
  iR.position.set(W, 0, 0)
  coilGroup.add(iL, iR)

  // 电子流小球（沿线圈框跑；用闭合路径便于取点）
  const eGeo = new THREE.SphereGeometry(0.075, 12, 12)
  const eMat = new THREE.MeshStandardMaterial({ color: 0xffb74d, emissive: 0x6a3a00, emissiveIntensity: 0.8 })
  const corners = [pA, pB, pC, pD, pA.clone()]
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Mesh(eGeo, eMat)
    coilGroup.add(s)
    electrons.push(s)
    electronT.push(i / 12)
  }
  coilGroup.userData.corners = corners

  // 受力箭头（子物体，沿 ±Y；绕 Z 旋转随组，反映 Lorentz 力方向）
  const fColor = 0xff5566
  fLeft = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(-W, 0, 0), 1.0, fColor, 0.4, 0.28)
  fRight = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(W, 0, 0), 1.0, fColor, 0.4, 0.28)
  coilGroup.add(fLeft, fRight)
  const fLabL = makeLabel('F', '#ff8090'); fLabL.position.set(-W, -1.2, 0); fLabL.scale.set(0.5, 0.3, 1)
  const fLabR = makeLabel('F', '#ff8090'); fLabR.position.set(W, 1.2, 0); fLabR.scale.set(0.5, 0.3, 1)
  coilGroup.add(fLabL, fLabR)

  // 静止电刷（不随线圈转）：从换向器上/下引出，接到电源（导线随电刷固定，不再断开）
  const brushMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 })
  const brushPos = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.42), brushMat)
  brushPos.position.set(0, rC + 0.14, COMM_Z)
  root.add(brushPos)
  const brushNeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.42), brushMat)
  brushNeg.position.set(0, -(rC + 0.14), COMM_Z)
  root.add(brushNeg)
  const labBrush = makeLabel('电刷', '#cdd6e2'); labBrush.position.set(0.6, rC + 0.14, COMM_Z); labBrush.scale.set(1.1, 0.6, 1)
  root.add(labBrush)

  // 外接电源 + 开关（置于换向器一侧，与外电路同侧，z 取正值）
  const supply = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.9, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x394763, roughness: 0.7 })
  )
  supply.position.set(0, -1.7, 4.3)
  root.add(supply)
  const labSupply = makeLabel('电源', '#cdd6e2')
  labSupply.position.set(0, -1.0, 4.3)
  root.add(labSupply)
  // + / - 端子
  const termPos = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), new THREE.MeshStandardMaterial({ color: 0xff5a5a }))
  termPos.position.set(0.5, -1.15, 4.3)
  const termNeg = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), new THREE.MeshStandardMaterial({ color: 0x5a7bff }))
  termNeg.position.set(-0.5, -1.15, 4.3)
  root.add(termPos, termNeg)
  const labP = makeLabel('+', '#ff9a9a'); labP.position.set(0.5, -0.85, 4.3); root.add(labP)
  const labN = makeLabel('−', '#9ab0ff'); labN.position.set(-0.5, -0.85, 4.3); root.add(labN)

  // 开关（底座 + 两触点 + 拨杆）
  const swBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), new THREE.MeshStandardMaterial({ color: 0x2b3550 }))
  swBase.position.set(0, -1.7, 3.9)
  root.add(swBase)
  const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa6bd })
  const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 10), postMat)
  postL.position.set(-0.45, -1.5, 3.9)
  const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 10), postMat)
  postR.position.set(0.45, -1.5, 3.9)
  root.add(postL, postR)
  const leverBar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: 0xd7dcea }))
  leverBar.position.set(0, -1.28, 3.9)
  root.add(leverBar)

  // 导线：电源+ → 上电刷；电源− → 下电刷（电刷静止，导线不再随线圈转动而断开）
  const wPos = makeWire(new THREE.Vector3(0.5, -1.15, 4.3), new THREE.Vector3(0, rC + 0.25, COMM_Z), 0xffd166)
  const wNeg = makeWire(new THREE.Vector3(-0.5, -1.15, 4.3), new THREE.Vector3(0, -(rC + 0.25), COMM_Z), 0xffd166)
  root.add(wPos, wNeg)

  // 应用初始电流方向
  applyCurrentDirection()

  lastTime = performance.now()
  animate()
}

/* ============ 电流方向：影响电子流向 + 电流箭头 + 受力箭头方向 ============ */
function applyCurrentDirection() {
  const flip = reverseCurrent.value ? -1 : 1
  // 左有效边(-X)受力方向（局部 ±Y），右有效边(+X)相反
  fLeft.setDirection(new THREE.Vector3(0, -flip, 0))
  fRight.setDirection(new THREE.Vector3(0, flip, 0))
  // 电流箭头：+X 边沿 +Z（flip>0 时），-X 边沿 -Z
  iR.rotation.x = flip > 0 ? Math.PI / 2 : -Math.PI / 2
  iL.rotation.x = flip > 0 ? -Math.PI / 2 : Math.PI / 2
}

/* ============ 动画循环 ============ */
function animate() {
  raf = requestAnimationFrame(animate)
  const now = performance.now()
  let dt = (now - lastTime) / 1000
  lastTime = now
  if (!(dt > 0)) dt = 0.016
  if (dt > 0.05) dt = 0.05

  // 物理积分
  if (playing.value) {
    const base = reverseCurrent.value ? -1 : 1
    if (commutatorOn.value) {
      // 换向器自动换向：力矩始终沿同一方向驱动 → 连续旋转
      const alpha = K * Math.abs(Math.cos(angle)) * base
      angVel += alpha * dt * speedScale.value
      angVel *= 0.999 // 轻微阻尼
      angle += angVel * dt * speedScale.value
    } else {
      // 无自动换向：恒定电流 → 摆向平衡位，需手动换向维持
      const alpha = -K * Math.cos(angle) * base
      angVel += alpha * dt * speedScale.value
      angVel *= 0.992 // 阻尼，最终静止于平衡位
      angle += angVel * dt * speedScale.value
    }
    coilGroup.rotation.z = angle
  }

  // 电子流动（沿闭合路径取点）
  const corners = coilGroup.userData.corners
  const dir = reverseCurrent.value ? -1 : 1
  const eSpeed = 0.06 * (playing.value ? speedScale.value : 0.4)
  for (let i = 0; i < electrons.length; i++) {
    electronT[i] = (electronT[i] + dir * eSpeed * dt) % 1
    if (electronT[i] < 0) electronT[i] += 1
    const p = pointOnLoop(corners, electronT[i])
    electrons[i].position.copy(p)
  }

  // 实时读数
  let deg = (angle * 180) / Math.PI
  deg = ((deg % 360) + 360) % 360
  const norm = deg > 180 ? deg - 360 : deg
  liveTheta.value = Math.round(norm)
  if (commutatorOn.value) {
    liveState.value = '换向器自动换向：线圈持续旋转'
  } else if (Math.abs(norm + 90) < 12) liveState.value = '平衡位：线圈正对（法线∥B，力矩≈0，稳定）'
  else if (Math.abs(norm) < 12) liveState.value = '线圈侧立（法线⊥B，力矩最大）'
  else if (Math.abs(norm - 180) < 12) liveState.value = '线圈背面（法线∥−B，不稳定平衡）'
  else liveState.value = '摆动中…'
  // 接近侧立位（θ≈±90°）且处于手动模式时提示手动换向
  liveNearFlip.value = !commutatorOn.value && Math.abs(Math.abs(norm) - 90) < 9

  controls.update()
  renderer.render(scene, camera)
}

/* ============ 控件 ============ */
function play() {
  playing.value = true
  mark()
}
function pause() {
  playing.value = false
}
function togglePlay() {
  playing.value = !playing.value
  if (playing.value) mark()
}
function reset() {
  playing.value = false
  angle = 0.6
  angVel = 0
  if (coilGroup) coilGroup.rotation.z = angle
  liveTheta.value = Math.round((0.6 * 180) / Math.PI)
  liveState.value = '开口线圈：偏离平衡位，受摆动力矩'
}
function toggleCommutator() {
  commutatorOn.value = !commutatorOn.value
  liveCurrent.value = commutatorOn.value ? '自动换向' : (reverseCurrent.value ? '反向' : '正向')
  mark()
}
watch(reverseCurrent, () => {
  if (!commutatorOn.value) liveCurrent.value = reverseCurrent.value ? '反向' : '正向'
  applyCurrentDirection()
  mark()
})

/* ============ 挂载 / 卸载 ============ */
function onResize() {
  if (!renderer || !containerRef.value) return
  const w = containerRef.value.clientWidth || 720
  const h = containerRef.value.clientHeight || 460
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
onMounted(() => {
  buildScene()
  resizeObs = new ResizeObserver(onResize)
  resizeObs.observe(containerRef.value)
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (resizeObs) resizeObs.disconnect()
  if (controls) controls.dispose()
  if (renderer) {
    renderer.dispose()
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
  }
})

/* ============ 公式与结果 ============ */
const formula = '力矩 τ = −K·cosθ·I （无换向器：摆到平衡位静止；有换向器：自动翻转 → 连续旋转）'
const verifyList = [
  '换向器关：电流方向恒定，线圈受恒定力矩只摆到平衡位（法线∥B）即停，需手动点「⇄ 手动换向」维持旋转',
  '换向器开：线圈越过平衡位（θ≈±90°）时电流被自动翻转，力矩始终同向 → 连续旋转（真实直流电机行为）',
  '平衡位（θ≈0，法线∥B）：有效边力矩为 0 且稳定；侧立位（θ≈±90°）力矩最大',
  '换向器 = 轴上 E/F 两铜半环 + 静止电刷：线圈两端接 E/F，电源经电刷接到换向器，导线随电刷固定不再断开'
]
</script>

<template>
  <div class="lab-stage">
    <!-- 左：3D 场景 -->
    <div class="lab-left">
      <div class="lab-panel" style="padding: 0; min-height: 0; flex: 1; background: transparent">
        <div ref="containerRef" class="coil-3d" aria-label="通电线圈在磁场中转动 3D 演示（直流电动机结构）">
          <div class="scene-hint">拖拽旋转视角 · 滚轮缩放</div>
        </div>
      </div>

      <div class="lab-actions">
        <span class="r-readout">
          <span class="r-readout-item">偏角 θ <strong>{{ liveTheta }}°</strong></span>
          <span class="r-readout-item">电流 <strong>{{ liveCurrent }}</strong></span>
          <span class="r-readout-item">演示速度 <strong>{{ speedScale.toFixed(1) }}×</strong></span>
        </span>
        <button class="btn" @click="togglePlay">{{ playing ? '⏸ 暂停' : '▶ 播放' }}</button>
        <button class="btn" @click="reset">↺ 复位</button>
        <button class="btn btn-comm" :class="{ 'btn-on': commutatorOn }" @click="toggleCommutator">
          换向器：{{ commutatorOn ? '开' : '关' }}
        </button>
        <button v-if="!commutatorOn" class="btn btn-flip" :class="{ 'btn-glow': liveNearFlip }" @click="reverseCurrent = !reverseCurrent" title="在每次经过侧立位（θ≈±90°）时点击，翻转电流方向即可让线圈持续旋转">
          ⇄ 手动换向<span v-if="liveNearFlip" class="flip-now">· 现在点！</span>
        </button>
        <button v-else class="btn" @click="reverseCurrent = !reverseCurrent" title="翻转整体旋转方向">
          ↺ 反向旋转
        </button>
        <ParamSlider v-model="speedScale" :min="0.5" :max="2" :step="0.1" :precision="1" label="演示速度" unit="×" hint="数值越大演示越快" />
      </div>
      <div class="state-line">当前：<strong>{{ liveState }}</strong></div>
      <div v-if="!commutatorOn" class="manual-hint">
        <span class="manual-hint-ico">💡</span>
        <span><strong>手动换向演示：</strong>换向器关闭时，恒定电流下线圈只会摆到平衡位（θ≈0）停住。想让它持续旋转，就在每次经过<strong>侧立位（θ≈±90°，按钮会发光提示「现在点！」）</strong>时点击 <strong>⇄ 手动换向</strong> 翻转电流方向——力矩随之翻转、推动线圈继续前进，便一圈圈转下去。这正是换向器自动完成的工作（手摇换向演示）。</span>
      </div>
      <div v-else class="auto-hint">
        <span class="auto-hint-ico">⚙️</span>
        <span><strong>换向器已接入：</strong>线圈越过平衡位（θ≈±90°）时电流被自动翻转，力矩始终同向 → <strong>线圈连续旋转</strong>（真实直流电机行为）。电源经静止电刷接到轴上 E/F 半环，导线随电刷固定、动画中不再断开。</span>
      </div>
    </div>

    <!-- 右：公式 + 结构要点卡 -->
    <aside class="lab-right">
      <FormulaPanel
        title="直流电动机结构（直接供电 · 换向器可选）"
        :formula="formula"
        :rows="[
          { label: '磁场方向 B', value: '由 N 指向 S（水平径向）' },
          { label: '电流方向 I', value: liveCurrent },
          { label: '受力 F = BIL', value: '沿 ±Y（绕 Z 轴形成力矩）' },
          { label: '线圈状态', value: commutatorOn ? '经换向器·电刷供电' : '开口导体 · 直连电源' }
        ]"
        :result="[{ label: '当前位置', value: liveState }]"
        :verify="verifyList"
      />

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>结构要点（对照教材 20.4）</strong>
          <span>换向器可选</span>
        </div>
        <div class="ref-cards">
          <div class="ref-card">
            <svg viewBox="0 0 200 110" class="ref-svg">
              <rect x="45" y="28" width="92" height="54" fill="none" stroke="#c0742a" stroke-width="3" stroke-linejoin="round" />
              <text x="45" y="20" text-anchor="middle" font-size="11" font-weight="800" fill="#c0742a">a</text>
              <text x="137" y="20" text-anchor="middle" font-size="11" font-weight="800" fill="#c0742a">b</text>
              <text x="45" y="94" text-anchor="middle" font-size="11" font-weight="800" fill="#c0742a">d</text>
              <text x="137" y="94" text-anchor="middle" font-size="11" font-weight="800" fill="#c0742a">c</text>
              <line x1="45" y1="28" x2="22" y2="28" stroke="#ffd166" stroke-width="2.5" />
              <line x1="45" y1="82" x2="22" y2="82" stroke="#ffd166" stroke-width="2.5" />
              <text x="16" y="58" text-anchor="middle" font-size="10" font-weight="700" fill="#ffd166" transform="rotate(-90 16 58)">引线</text>
              <text x="91" y="108" text-anchor="middle" font-size="11" font-weight="800" fill="#3a3026">开口线圈（不闭合）</text>
            </svg>
          </div>
          <div class="ref-card">
            <svg viewBox="0 0 200 110" class="ref-svg">
              <!-- N 极：外缘正方块 + 内弧面（凹向中心包裹线圈） -->
              <path d="M54,33 L22,33 L22,77 L54,77 Q80,55 54,33 Z" fill="#d92135" />
              <text x="38" y="59" text-anchor="middle" fill="#fff" font-size="16" font-weight="900">N</text>
              <!-- S 极 -->
              <path d="M146,33 L178,33 L178,77 L146,77 Q120,55 146,33 Z" fill="#145fd2" />
              <text x="162" y="59" text-anchor="middle" fill="#fff" font-size="16" font-weight="900">S</text>
              <line x1="100" y1="20" x2="100" y2="90" stroke="#7a6045" stroke-dasharray="3 3" stroke-width="1.5" />
              <text x="100" y="106" text-anchor="middle" font-size="10.5" font-weight="800" fill="#3a3026">外方内弧磁极（气隙非闭合）</text>
            </svg>
          </div>
          <div class="ref-card">
            <svg viewBox="0 0 200 110" class="ref-svg">
              <!-- 换向器：两半环 + 电刷 -->
              <rect x="60" y="40" width="80" height="30" rx="6" fill="#394763" />
              <text x="100" y="35" text-anchor="middle" font-size="10" font-weight="800" fill="#394763">电源</text>
              <circle cx="78" cy="40" r="3" fill="#ff5a5a" />
              <circle cx="122" cy="40" r="3" fill="#5a7bff" />
              <line x1="78" y1="40" x2="84" y2="62" stroke="#ffd166" stroke-width="2.5" />
              <line x1="122" y1="40" x2="116" y2="62" stroke="#ffd166" stroke-width="2.5" />
              <rect x="80" y="60" width="40" height="10" rx="3" fill="#b87333" />
              <text x="100" y="80" text-anchor="middle" font-size="9" font-weight="700" fill="#b87333">E</text>
              <rect x="80" y="72" width="40" height="10" rx="3" fill="#9c5a2a" />
              <text x="100" y="92" text-anchor="middle" font-size="9" font-weight="700" fill="#9c5a2a">F</text>
              <text x="100" y="106" text-anchor="middle" font-size="10.5" font-weight="800" fill="#3a3026">换向器+电刷（可选）</text>
            </svg>
          </div>
        </div>
        <p class="ref-hint">
          换向器关：电流恒定，线圈只摆到平衡位（θ≈0）即停，可手动点「⇄ 手动换向」维持旋转。<br />
          换向器开：线圈越过平衡位（θ≈±90°）电流自动翻转 → 连续旋转。线圈两端接轴上 E/F 半环，电源经静止电刷接到换向器，导线随电刷固定、不再断开。
        </p>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>操作要点</strong></div>
        <ul class="op-list">
          <li>点击「▶ 播放」观察线圈在磁场中受力；默认换向器<strong>关</strong>，线圈从偏角摆向平衡位（θ≈0）后静止</li>
          <li>想让线圈<strong>一直转</strong>：先点「换向器：关→开」开启自动换向，线圈即连续旋转；或在关闭态下每次经过侧立位（按钮发光「现在点！」、θ≈±90°）时点击「⇄ 手动换向」翻转电流（手摇换向）</li>
          <li>用鼠标拖拽场景可自由改变视角，从 3/4 角度看清外方内弧磁极、气隙、轴上换向器 E/F 与静止电刷</li>
          <li>「↺ 复位」让线圈回到小偏角起始位，重新观察摆动</li>
        </ul>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.coil-3d {
  position: relative;
  width: 100%;
  height: 460px;
  border-radius: 12px;
  overflow: hidden;
  background: #0e1320;
}
.scene-hint {
  position: absolute;
  left: 10px;
  bottom: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  pointer-events: none;
  user-select: none;
}
.state-line {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text);
}
.state-line strong {
  color: var(--accent-strong);
}
.ref-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 10px 12px;
}
.ref-card {
  border: 1.5px solid var(--line);
  border-radius: 8px;
  background: var(--surface-3);
  padding: 6px;
}
.ref-svg {
  display: block;
  width: 100%;
  height: auto;
}
.ref-hint {
  margin: 4px 12px 12px;
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.5;
  font-style: italic;
}
/* 手动换向提示横幅（换向器关时显示） */
.manual-hint {
  display: flex;
  gap: 8px;
  margin: 10px 2px 4px;
  padding: 10px 12px;
  border: 1.5px dashed #c0742a;
  border-radius: 10px;
  background: rgba(192, 116, 42, 0.10);
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text);
}
.manual-hint-ico {
  font-size: 15px;
  line-height: 1.3;
  flex: 0 0 auto;
}
.manual-hint strong {
  color: var(--accent-strong);
}
/* 自动换向提示横幅（换向器开时显示） */
.auto-hint {
  display: flex;
  gap: 8px;
  margin: 10px 2px 4px;
  padding: 10px 12px;
  border: 1.5px solid #2e8b57;
  border-radius: 10px;
  background: rgba(46, 139, 87, 0.12);
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text);
}
.auto-hint-ico {
  font-size: 15px;
  line-height: 1.3;
  flex: 0 0 auto;
}
.auto-hint strong {
  color: #4fd28a;
}
/* 手动换向按钮：接近侧立位（θ≈±90°）时发光，提示此刻点击可维持旋转 */
.btn-flip {
  border-color: #c0742a;
  color: #f0c98a;
}
.btn-glow {
  animation: flipPulse 0.85s ease-in-out infinite;
}
@keyframes flipPulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(255, 209, 102, 0.5), 0 0 10px 1px rgba(255, 209, 102, 0.55); }
  50% { box-shadow: 0 0 0 3px rgba(255, 209, 102, 0.85), 0 0 18px 4px rgba(255, 209, 102, 0.9); }
}
.flip-now {
  margin-left: 4px;
  font-weight: 800;
  color: #ffd166;
}
/* 换向器开关按钮（开态高亮） */
.btn-comm {
  border-color: #5a7bff;
  color: #aebfff;
}
.btn-comm.btn-on {
  border-color: #2e8b57;
  color: #4fd28a;
  background: rgba(46, 139, 87, 0.15);
}
.op-list {
  margin: 0;
  padding: 8px 18px 12px;
  font-size: 12px;
  color: var(--text);
  line-height: 1.7;
}
.r-readout {
  display: flex;
  gap: 8px;
  flex: 1;
  flex-wrap: wrap;
}
.r-readout-item {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 4px 10px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  font-size: 12px;
  color: var(--muted-2);
}
.r-readout-item strong {
  font-family: var(--mono);
  font-size: 14px;
  color: var(--accent-strong);
}
@media (max-width: 1180px) {
  .lab-stage { grid-template-columns: 1fr; }
  .lab-left { height: auto; }
}
</style>
