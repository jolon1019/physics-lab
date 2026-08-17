<script setup>
// 通电线圈在磁场中转动（直流电动机结构 · 直接供电 · 无滑环）—— three.js 3D 版本
// 物理设定（轴系）：
//   - 转轴 = 水平 Z 轴，线圈为矩形开口导体，绕 Z 轴转动（转子）
//   - 磁场 B：由 N(-X) 指向 S(+X)，四边形磁极提供径向场（气隙非闭合）
//   - 线圈两条有效边位于 ±X（磁极之间），电流沿 ±Z，受力 F = I·L×B 沿 ±Y（绕 Z 轴形成力矩）
//   - 无换向器：电流方向恒定，线圈摆到平衡位（法线∥B）即停，不会连续转动
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
const reverseCurrent = ref(false) // 电流反向 → 受力方向也随之反向
const speedScale = ref(1) // 演示速度倍率

/* ============ 几何常量（three 世界单位） ============ */
const W = 0.55 // 线圈有效边到中轴(X)距离（半宽）
const D = 0.8 // 线圈半深（Z 方向）
const MAG_X = 2.6 // 磁极中心 X
const shaftR = 0.14
const shaftLen = 5.6 // 转子轴贯穿两端轴承座（z: -2.8 ~ +2.8）
const commZ = 2.3 // 电源接线处 z（线圈延长线末端）
const K = 2.0 // 力矩系数

/* ============ three.js 运行时 ============ */
const containerRef = ref(null)
let renderer, scene, camera, controls, coilGroup, fLeft, fRight, iL, iR
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

/* ============ 四边形（梯形）极靴，沿 Z 拉伸 ============ */
function makePoleShoe(isN) {
  const ri = 1.5, ro = 2.1, h = 2.6, depth = 2.2
  const shape = new THREE.Shape()
  shape.moveTo(ri, h / 2)
  shape.lineTo(ro, (h / 2) * 1.12)
  shape.lineTo(ro, -(h / 2) * 1.12)
  shape.lineTo(ri, -h / 2)
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  geo.translate(0, 0, -depth / 2)
  const color = isN ? 0xd92135 : 0x145fd2
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.55 }))
  const sign = isN ? -1 : 1
  mesh.position.set(sign * MAG_X, 0, 0)
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
  camera.position.set(5.6, 3.4, 7.2)
  camera.lookAt(0, 0, 0)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 4
  controls.maxDistance = 18
  controls.target.set(0, 0, 0)

  // 灯光
  scene.add(new THREE.AmbientLight(0xffffff, 0.75))
  const dir = new THREE.DirectionalLight(0xffffff, 0.9)
  dir.position.set(6, 9, 6)
  scene.add(dir)
  const dir2 = new THREE.DirectionalLight(0xbcd0ff, 0.35)
  dir2.position.set(-6, 3, -4)
  scene.add(dir2)

  // 地面网格（景深参考）
  const grid = new THREE.GridHelper(20, 20, 0x2a3350, 0x1c2236)
  grid.position.y = -2.2
  scene.add(grid)

  // 转子轴（沿 Z，贯穿两端轴承座）
  const axleMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.6, roughness: 0.4 })
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 20), axleMat)
  shaft.rotation.x = Math.PI / 2
  shaft.position.z = 0
  scene.add(shaft)

  // 四边形磁极：N（红，左 -X）/ S（蓝，右 +X），分离 = 非闭合
  const poleN = makePoleShoe(true)
  const poleS = makePoleShoe(false)
  scene.add(poleN, poleS)
  const nLabel = makeLabel('N', '#ffffff')
  nLabel.position.set(-MAG_X, 1.9, 0)
  const sLabel = makeLabel('S', '#ffffff')
  sLabel.position.set(MAG_X, 1.9, 0)
  scene.add(nLabel, sLabel)

  // 定子轴承座 ×2（带轴构造）：位于轴两端，固定支撑转子轴
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x394763, roughness: 0.7 })
  for (const sz of [2.8, -2.8]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.5), seatMat)
    seat.position.set(0, -1.1, sz)
    scene.add(seat)
    const hole = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftR + 0.06, shaftR + 0.06, 0.6, 16),
      new THREE.MeshStandardMaterial({ color: 0x10141f, roughness: 0.9 })
    )
    hole.rotation.x = Math.PI / 2
    hole.position.set(0, 0, sz)
    scene.add(hole)
    const lab = makeLabel('定子轴承座', '#cdd6e2')
    lab.position.set(0, -2.45, sz)
    lab.scale.set(1.5, 0.8, 1)
    scene.add(lab)
  }

  // 线圈（旋转组，绕 Z）
  coilGroup = new THREE.Group()
  scene.add(coilGroup)
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

  // 线圈延长线（平行轴 Z，直连电源）：从线圈两端引到 commZ
  coilLeadA = makeWire(pA, new THREE.Vector3(W, 0, commZ), 0xffd166)
  coilLeadB = makeWire(pD, new THREE.Vector3(-W, 0, commZ), 0xffd166)
  coilGroup.add(coilLeadA, coilLeadB)

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

  // 外接电源 + 开关（置于换向器一侧，与外电路同侧，z 取正值）
  const supply = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.9, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x394763, roughness: 0.7 })
  )
  supply.position.set(0, -1.7, 3.6)
  scene.add(supply)
  const labSupply = makeLabel('电源', '#cdd6e2')
  labSupply.position.set(0, -1.0, 3.6)
  scene.add(labSupply)
  // + / - 端子
  const termPos = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), new THREE.MeshStandardMaterial({ color: 0xff5a5a }))
  termPos.position.set(-0.5, -1.15, 3.6)
  const termNeg = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), new THREE.MeshStandardMaterial({ color: 0x5a7bff }))
  termNeg.position.set(0.5, -1.15, 3.6)
  scene.add(termPos, termNeg)
  const labP = makeLabel('+', '#ff9a9a'); labP.position.set(-0.5, -0.85, 3.6); scene.add(labP)
  const labN = makeLabel('−', '#9ab0ff'); labN.position.set(0.5, -0.85, 3.6); scene.add(labN)

  // 开关（底座 + 两触点 + 拨杆）
  const swBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), new THREE.MeshStandardMaterial({ color: 0x2b3550 }))
  swBase.position.set(0, -1.7, 2.7)
  scene.add(swBase)
  const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa6bd })
  const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 10), postMat)
  postL.position.set(-0.45, -1.5, 2.7)
  const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 10), postMat)
  postR.position.set(0.45, -1.5, 2.7)
  scene.add(postL, postR)
  const leverBar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: 0xd7dcea }))
  leverBar.position.set(0, -1.28, 2.7)
  scene.add(leverBar)

  // 导线：电源+ → 线圈延长线①末端；电源− → 线圈延长线②末端（直连，无滑环）
  const wirePos = makeWire(new THREE.Vector3(0.5, -1.15, 3.6), new THREE.Vector3(W, 0, commZ), 0xffd166)
  const wireNeg = makeWire(new THREE.Vector3(-0.5, -1.15, 3.6), new THREE.Vector3(-W, 0, commZ), 0xffd166)
  scene.add(wirePos, wireNeg)

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

  // 物理积分（无换向器：力矩使线圈摆向平衡位，不会连续转动）
  if (playing.value) {
    const sign = reverseCurrent.value ? -1 : 1
    const alpha = -K * Math.cos(angle) * sign
    angVel += alpha * dt * speedScale.value
    angVel *= 0.992 // 阻尼，最终静止于平衡位
    angle += angVel * dt * speedScale.value
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
  if (Math.abs(norm + 90) < 12) liveState.value = '平衡位：线圈正对（法线∥B，力矩≈0，稳定）'
  else if (Math.abs(norm) < 12) liveState.value = '线圈侧立（法线⊥B，力矩最大）'
  else if (Math.abs(norm - 180) < 12) liveState.value = '线圈背面（法线∥−B，不稳定平衡）'
  else liveState.value = '摆动中…'

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
const formula = '力矩 τ = −K·cosθ·I （θ 为线圈法线与 B 夹角；无换向器 → 摆到平衡位静止）'
const verifyList = [
  '无换向器时电流方向恒定：线圈受恒定力矩只能摆到平衡位（法线∥B）即停，不会连续转动',
  '平衡位（θ≈0，法线∥B）：有效边力矩为 0 且稳定',
  '切换「反向电流」再播放：两侧受力方向整体翻转，线圈摆向另一侧平衡位',
  '本结构刻意去掉换向器，用于反衬「换向器（铜半环 + 电刷）是连续转动的必要条件」'
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
          <span class="r-readout-item">电流方向 <strong>{{ liveCurrent }}</strong></span>
          <span class="r-readout-item">演示速度 <strong>{{ speedScale.toFixed(1) }}×</strong></span>
        </span>
        <button class="btn" @click="togglePlay">{{ playing ? '⏸ 暂停' : '▶ 播放' }}</button>
        <button class="btn" @click="reset">↺ 复位</button>
        <button class="btn" @click="reverseCurrent = !reverseCurrent">{{ reverseCurrent ? '→ 正向电流' : '↺ 反向电流' }}</button>
        <ParamSlider v-model="speedScale" :min="0.5" :max="2" :step="0.1" :precision="1" label="演示速度" unit="×" hint="数值越大演示越快" />
      </div>
      <div class="state-line">当前：<strong>{{ liveState }}</strong></div>
    </div>

    <!-- 右：公式 + 结构要点卡 -->
    <aside class="lab-right">
      <FormulaPanel
        title="直流电动机结构（直接供电 · 无滑环）"
        :formula="formula"
        :rows="[
          { label: '磁场方向 B', value: '由 N 指向 S（水平径向）' },
          { label: '电流方向 I', value: liveCurrent },
          { label: '受力 F = BIL', value: '沿 ±Y（绕 Z 轴形成力矩）' },
          { label: '线圈状态', value: '开口导体 · 直连电源 · 无滑环' }
        ]"
        :result="[{ label: '当前位置', value: liveState }]"
        :verify="verifyList"
      />

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>结构要点（对照教材 20.4）</strong>
          <span>去掉换向器</span>
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
              <polygon points="22,38 56,28 56,82 22,72" fill="#d92135" />
              <text x="37" y="58" text-anchor="middle" fill="#fff" font-size="16" font-weight="900">N</text>
              <polygon points="178,38 144,28 144,82 178,72" fill="#145fd2" />
              <text x="163" y="58" text-anchor="middle" fill="#fff" font-size="16" font-weight="900">S</text>
              <line x1="100" y1="22" x2="100" y2="88" stroke="#7a6045" stroke-dasharray="3 3" stroke-width="1.5" />
              <text x="100" y="108" text-anchor="middle" font-size="11" font-weight="800" fill="#3a3026">四边形磁极（气隙非闭合）</text>
            </svg>
          </div>
          <div class="ref-card">
            <svg viewBox="0 0 200 110" class="ref-svg">
              <rect x="78" y="18" width="44" height="26" fill="#394763" rx="3" />
              <text x="100" y="35" text-anchor="middle" fill="#cdd6e2" font-size="11" font-weight="700">电源</text>
              <circle cx="89" cy="13" r="3" fill="#ff5a5a" />
              <circle cx="111" cy="13" r="3" fill="#5a7bff" />
              <line x1="89" y1="44" x2="72" y2="68" stroke="#ffd166" stroke-width="2.5" />
              <line x1="111" y1="44" x2="128" y2="68" stroke="#ffd166" stroke-width="2.5" />
              <rect x="55" y="66" width="90" height="22" fill="none" stroke="#c0742a" stroke-width="3" />
              <text x="100" y="108" text-anchor="middle" font-size="11" font-weight="800" fill="#3a3026">直连供电（无滑环）</text>
            </svg>
          </div>
        </div>
        <p class="ref-hint">注意：本结构无换向器，电流方向恒定 → 线圈只能绕平衡位摆动并停在 θ≈0（法线∥B），无法连续旋转；这正是教材要说明的「换向器之必要」。</p>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>操作要点</strong></div>
        <ul class="op-list">
          <li>点击「▶ 播放」看开口线圈在磁场中受恒定电流：从偏角摆向平衡位（θ≈0）后静止，演示「无换向器不能连续转」</li>
          <li>用鼠标拖拽场景可自由改变视角，从 3/4 角度看清四边形磁极、气隙、线圈与延长线</li>
          <li>切换「反向电流」再播放：两侧受力方向整体翻转，物理图像对称</li>
          <li>「↺ 复位」让线圈回到小偏角起始位</li>
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
