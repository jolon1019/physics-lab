<script setup>
// 通电线圈在磁场中转动（直流电动机结构 · 含换向器 · 去除外接电源/电刷/轴承座）—— three.js 3D 版本
// 物理设定（轴系）：
//   - 转轴 = 水平 Z 轴，线圈为矩形开口导体，绕 Z 轴转动（转子）
//   - 磁场 B：由 N(-X) 指向 S(+X)，外方内弧磁极（外缘正方块、内弧面包裹线圈）提供径向场（气隙非闭合）
//   - 线圈两条有效边位于 ±X（磁极之间），电流沿 ±Z，受力 F = I·L×B 沿 ±Y（绕 Z 轴形成力矩）
//   - 换向器（轴上 E/F 两铜半环）保留为转子结构件；本演示不含外接电源与电刷，故用「通电」按钮概念性供电、
//     以「⇄ 手动换向」演示换向器自动完成的「过平衡位翻转电流 → 连续旋转」工作（手摇换向）
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
const playing = ref(false) // 是否通电（energized）
const reverseCurrent = ref(false) // 电流反向 → 受力方向也随之反向（手动换向 / 翻转整体转向）
const speedScale = ref(1) // 演示速度倍率

/* ============ 几何常量（three 世界单位） ============ */
const POLE_RIN = 1.0 // 磁极内弧面半径（包裹线圈，留气隙）
const POLE_ROUT = 1.9 // 磁极外缘半径
const POLE_PHI = (38 * Math.PI) / 180 // 极弧半张角
const POLE_DEPTH = 2.4 // 磁极 Z 向拉伸厚度（线圈 Z 向宽度与之对齐）
const MAG_X = (POLE_RIN * Math.cos(POLE_PHI) + POLE_ROUT) / 2 // 磁极中心 X（用于标签/参考）
const MAG_W = POLE_ROUT - POLE_RIN * Math.cos(POLE_PHI) // 磁极 X 向（径向）宽度 = 外缘−内弧端
const W = MAG_W / 2 // 线圈有效边到中轴(X)距离（半宽）= 磁极 X 宽一半 → 线圈 X 宽(2W)与磁极一致
const D = POLE_DEPTH / 2 // 线圈半深（Z）= 磁极 Z 厚一半 → 线圈 Z 宽(2D)与磁极一致
const shaftR = 0.14
const shaftLen = 10.0 // 转子轴（z: -5.0 ~ +5.0），末端伸到换向器处
const COMM_Z = 3.8 // 换向器 z（轴上转子部件；外接电源/电刷已移除，换向器仅作结构展示 + 线圈两端接线点）
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
const liveState = ref('线圈：偏离平衡位，受摆动力矩')
const liveCurrent = ref('正向')
const liveNearFlip = ref(false) // 通电且线圈接近侧立位（θ≈±90°），提示此刻手动换向可维持旋转

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
  const depth = POLE_DEPTH
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

  // 转子轴（沿 Z）
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

  // 线圈（旋转组，绕 Z）
  coilGroup = new THREE.Group()
  root.add(coilGroup)
  const coilMat = new THREE.MeshStandardMaterial({ color: 0xc0742a, metalness: 0.5, roughness: 0.45 })

  // 开口线圈：4 点矩形（XZ 平面），不闭合；X 宽(2W)=磁极 X 宽、Z 厚(2D)=磁极 Z 厚
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

  // 线圈延长线（平行轴 Z，引向转轴末端的换向器）+ 接到 E/F 半环的短接（转子内部接线，随线圈转）
  coilLeadA = makeWire(pA, new THREE.Vector3(W, 0, COMM_Z), 0xffd166)
  coilLeadB = makeWire(pD, new THREE.Vector3(-W, 0, COMM_Z), 0xffd166)
  const stubA = makeWire(new THREE.Vector3(W, 0, COMM_Z), new THREE.Vector3(0.12, rC - 0.02, COMM_Z), 0xffd166)
  const stubB = makeWire(new THREE.Vector3(-W, 0, COMM_Z), new THREE.Vector3(-0.12, -(rC - 0.02), COMM_Z), 0xffd166)
  coilGroup.add(coilLeadA, coilLeadB, stubA, stubB)

  // 换向器（随线圈转动，位于转轴末端）：E/F 两铜半环（留绝缘缝）+ 绝缘毂（本演示为转子结构件，不含电刷/外接电源）
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
    new THREE.CylinderGeometry(0.16, 0.16, lenC * 1.05, 16),
    new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.9 })
  )
  hub.rotation.x = Math.PI / 2
  hub.position.set(0, 0, COMM_Z)
  coilGroup.add(hub)
  const labE = makeLabel('E', '#ffe2b0'); labE.position.set(0, rC + 0.2, COMM_Z); labE.scale.set(0.5, 0.3, 1)
  const labF = makeLabel('F', '#ffe2b0'); labF.position.set(0, -(rC + 0.2), COMM_Z); labF.scale.set(0.5, 0.3, 1)
  coilGroup.add(labE, labF)
  // 换向器部件标识（静止标签，不随线圈转）
  const labComm = makeLabel('换向器', '#cdd6e2'); labComm.position.set(1.05, 0, COMM_Z); labComm.scale.set(1.4, 0.8, 1)
  root.add(labComm)

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

  // 物理积分（通电时）
  if (playing.value) {
    const base = reverseCurrent.value ? -1 : 1
    // 无自动换向（无电刷）：恒定电流 → 摆向平衡位，需手动换向维持
    const alpha = -K * Math.cos(angle) * base
    angVel += alpha * dt * speedScale.value
    angVel *= 0.992 // 阻尼，最终静止于平衡位
    angle += angVel * dt * speedScale.value
    coilGroup.rotation.z = angle
  }

  // 电子流动（沿闭合路径取点）
  const corners = coilGroup.userData.corners
  const dir = reverseCurrent.value ? -1 : 1
  const eSpeed = playing.value ? 0.06 * speedScale.value : 0
  for (let i = 0; i < electrons.length; i++) {
    if (playing.value) {
      electronT[i] = (electronT[i] + dir * eSpeed * dt) % 1
      if (electronT[i] < 0) electronT[i] += 1
    }
    const p = pointOnLoop(corners, electronT[i])
    electrons[i].position.copy(p)
  }

  // 实时读数
  let deg = (angle * 180) / Math.PI
  deg = ((deg % 360) + 360) % 360
  const norm = deg > 180 ? deg - 360 : deg
  liveTheta.value = Math.round(norm)
  if (Math.abs(norm + 90) < 12) liveState.value = '平衡位：线圈正对（法线∥B，力矩≈0，稳定）'
  else if (Math.abs(norm) < 12) liveState.value = '线圈侧立（法线⊥B，力矩最大）'
  else if (Math.abs(norm - 180) < 12) liveState.value = '线圈背面（法线∥−B，不稳定平衡）'
  else liveState.value = '摆动中…'
  // 通电且接近侧立位（θ≈±90°）时提示手动换向
  liveNearFlip.value = playing.value && Math.abs(Math.abs(norm) - 90) < 9

  controls.update()
  renderer.render(scene, camera)
}

/* ============ 控件 ============ */
function togglePower() {
  playing.value = !playing.value
  liveCurrent.value = reverseCurrent.value ? '反向' : '正向'
  if (playing.value) mark()
}
function reset() {
  playing.value = false
  angle = 0.6
  angVel = 0
  if (coilGroup) coilGroup.rotation.z = angle
  liveTheta.value = Math.round((0.6 * 180) / Math.PI)
  liveState.value = '线圈：偏离平衡位，受摆动力矩'
}
watch(reverseCurrent, () => {
  liveCurrent.value = reverseCurrent.value ? '反向' : '正向'
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
const formula = '力矩 τ = −K·cosθ·I （恒定电流：摆到平衡位静止；手动换向可维持旋转）'
const verifyList = [
  '「通电」后线圈受恒定力矩，只摆到平衡位（法线∥B）即停',
  '想让线圈持续旋转：每次经过侧立位（θ≈±90°，按钮发光「现在点！」）点「⇄ 手动换向」翻转电流 → 力矩翻转、推动线圈继续前进（手摇换向，即换向器自动完成的工作）',
  '平衡位（θ≈0，法线∥B）：力矩为 0 且稳定；侧立位（θ≈±90°）力矩最大',
  '换向器 = 轴上 E/F 两铜半环（本演示不含电刷/外接电源，仅作转子结构件展示）；真实电机中线圈两端接 E/F，电源经电刷接到换向器，过平衡位自动翻转电流 → 连续旋转'
]
</script>

<template>
  <div class="lab-stage">
    <!-- 左：3D 场景 -->
    <div class="lab-left">
      <div class="lab-panel" style="padding: 0; min-height: 0; flex: 1; background: transparent">
        <div ref="containerRef" class="coil-3d" aria-label="通电线圈在磁场中转动 3D 演示（直流电动机结构 · 含换向器）">
          <div class="scene-hint">拖拽旋转视角 · 滚轮缩放</div>
        </div>
      </div>

      <div class="lab-actions">
        <span class="r-readout">
          <span class="r-readout-item">偏角 θ <strong>{{ liveTheta }}°</strong></span>
          <span class="r-readout-item">电流 <strong>{{ liveCurrent }}</strong></span>
          <span class="r-readout-item">演示速度 <strong>{{ speedScale.toFixed(1) }}×</strong></span>
        </span>
        <button class="btn" @click="togglePower">{{ playing ? '⏻ 断电' : '⚡ 通电' }}</button>
        <button class="btn btn-flip" :class="{ 'btn-glow': liveNearFlip }" @click="reverseCurrent = !reverseCurrent" title="在每次经过侧立位（θ≈±90°）时点击，翻转电流方向即可让线圈持续旋转">
          ⇄ 手动换向<span v-if="liveNearFlip" class="flip-now">· 现在点！</span>
        </button>
        <button class="btn" @click="reset">↺ 复位</button>
        <ParamSlider v-model="speedScale" :min="0.5" :max="2" :step="0.1" :precision="1" label="演示速度" unit="×" hint="数值越大演示越快" />
      </div>
      <div class="state-line">当前：<strong>{{ liveState }}</strong></div>
      <div v-if="playing" class="manual-hint">
        <span class="manual-hint-ico">💡</span>
        <span><strong>手动换向演示：</strong>通电后恒定电流下线圈只会摆到平衡位（θ≈0）停住。想让它持续旋转，就在每次经过<strong>侧立位（θ≈±90°，按钮会发光提示「现在点！」）</strong>时点击 <strong>⇄ 手动换向</strong> 翻转电流方向——力矩随之翻转、推动线圈继续前进，便一圈圈转下去。这正是换向器自动完成的工作（手摇换向演示）。</span>
      </div>
    </div>

    <!-- 右：公式 + 结构要点卡 -->
    <aside class="lab-right">
      <FormulaPanel
        title="直流电动机结构（含换向器 · 无外接电源/电刷）"
        :formula="formula"
        :rows="[
          { label: '磁场方向 B', value: '由 N 指向 S（水平径向）' },
          { label: '电流方向 I', value: liveCurrent },
          { label: '受力 F = BIL', value: '沿 ±Y（绕 Z 轴形成力矩）' },
          { label: '线圈状态', value: playing ? '通电·开口导体' : '断电·静止' }
        ]"
        :result="[{ label: '当前位置', value: liveState }]"
        :verify="verifyList"
      />

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>结构要点（对照教材 20.4）</strong>
          <span>含换向器</span>
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
              <!-- 换向器：轴上两铜半环 E/F（结构件） -->
              <rect x="96" y="34" width="8" height="40" fill="#222831" />
              <rect x="70" y="44" width="60" height="11" rx="4" fill="#b87333" />
              <text x="100" y="52" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">E</text>
              <rect x="70" y="59" width="60" height="11" rx="4" fill="#9c5a2a" />
              <text x="100" y="67" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">F</text>
              <text x="100" y="30" text-anchor="middle" font-size="10.5" font-weight="800" fill="#3a3026">换向器（转子结构件）</text>
              <text x="100" y="106" text-anchor="middle" font-size="10" font-weight="800" fill="#3a3026">轴上 E/F 两铜半环</text>
            </svg>
          </div>
        </div>
        <p class="ref-hint">
          通电：恒定电流下线圈只摆到平衡位（θ≈0）即停，点「⇄ 手动换向」可维持旋转（手摇换向）。<br />
          换向器是轴上 E/F 两铜半环，本演示不含电刷/外接电源，仅展示该结构件；真实电机中电源经电刷接到换向器，线圈过平衡位（θ≈±90°）电流被自动翻转 → 连续旋转。
        </p>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>操作要点</strong></div>
        <ul class="op-list">
          <li>点击「⚡ 通电」线圈受磁场力开始摆动；默认从偏角摆向平衡位（θ≈0）后静止</li>
          <li>想让线圈<strong>一直转</strong>：每次经过侧立位（按钮发光「现在点！」、θ≈±90°）时点击「⇄ 手动换向」翻转电流（手摇换向，即换向器自动完成的工作）</li>
          <li>用鼠标拖拽场景可自由改变视角，从 3/4 角度看清外方内弧磁极、气隙、轴上换向器 E/F</li>
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
/* 手动换向提示横幅（通电时显示） */
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
