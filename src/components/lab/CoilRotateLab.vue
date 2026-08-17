<script setup>
// 通电线圈在磁场中转动（直流电动机原理 · 开口线圈 · 简化演示）—— three.js 3D 版本
// 物理设定（轴系）：
//   - 转轴 = 水平 Z 轴，线圈为矩形开口导体，绕 Z 轴转动（转子）
//   - 磁场 B：由 N(-X) 指向 S(+X)，外方内弧磁极（外缘正方块、内弧面包裹线圈）提供径向场（气隙非闭合）
//   - 线圈两条有效边位于 ±X（磁极之间），电流沿 ±Z，受力 F = I·L×B 沿 ±Y（绕 Z 轴形成力矩）
//   - 无换向器：恒定电流下线圈只摆到平衡位（θ≈0）即停；在侧立位（θ≈±90°）点「⇄ 手动换向」翻转电流可维持旋转
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
const playing = ref(false) // 通电/断电
const reverseCurrent = ref(false) // 电流反向 → 受力方向也随之反向（手动换向即可维持旋转）
const speedScale = ref(1) // 演示速度倍率

/* ============ 几何常量（three 世界单位） ============ */
const W = 0.475 // 线圈有效边到中轴(X)距离（半宽）；线圈 X 宽 = 2W，与磁极 X 宽(MAG_W)一致
const D = 1.2 // 线圈半深（Z 方向）；线圈 Z 宽 = 2D，与磁极沿轴拉伸深度一致，线圈正好填满磁极面
const POLE_RIN = 1.0 // 磁极内弧面半径（包裹线圈，留气隙）
const POLE_PHI = (46 * Math.PI) / 180 // 极弧半张角（较旧版增大 → 磁极更高、更挺拔）
const tipX = POLE_RIN * Math.cos(POLE_PHI) // 弧两端 x
const tipY = POLE_RIN * Math.sin(POLE_PHI) // 弧两端 y
const MAG_W = 0.95 // 磁极径向厚度（X 方向外缘正方块宽）；线圈 X 宽 = 2W = MAG_W
const MAG_H = 0.95 // 磁极半高（Y 方向，较旧版增大 → 磁极更高）
const POLE_DEPTH = 2.4 // 磁极沿 Z 拉伸深度；线圈 Z 宽 = 2D = POLE_DEPTH
const MAG_X = tipX + MAG_W // 磁极中心 X（用于标签/参考）
const shaftR = 0.14
const shaftLen = 10.0 // 转子轴贯穿两端轴承座（z: -5.0 ~ +5.0）
const K = 2.0 // 力矩系数
const ROOT_Y = 1.9 // 整体抬高 3D 平面高度，确保动画中平面始终可见、不被遮挡

/* ============ three.js 运行时 ============ */
const containerRef = ref(null)
let renderer, scene, camera, controls, root, coilGroup, fLeft, fRight, iL, iR
let electrons = [] // 沿线圈流动的电子小球
let electronT = [] // 各电子的路径参数 t∈[0,1)
let raf = null
let lastTime = 0
let resizeObs = null
let angle = 0.6 // 初始小偏角，便于观察摆向平衡位的过程
let angVel = 0

// 实时读数（由动画循环写回，节流）
const liveTheta = ref(0)
const liveState = ref('未通电：线圈不受力')
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

/* ============ 外方内弧极靴（外缘正方块·内弧面包裹线圈），沿 Z 拉伸 ============ */
function makePoleShoe(isN) {
  const rIn = POLE_RIN, phi = POLE_PHI
  const tx = tipX, ty = tipY
  const outX = tx + MAG_W // 外缘 X
  const shape = new THREE.Shape()
  // 下弧端 → 内弧面（包裹线圈的弧形面，绕转子轴）→ 外缘正方块（宽 MAG_W、高 2·MAG_H）→ 闭合
  shape.moveTo(tx, -ty)
  shape.absarc(0, 0, rIn, -phi, phi, false) // 内弧面（凹向线圈）
  shape.lineTo(outX, MAG_H) // 外缘上角
  shape.lineTo(outX, -MAG_H) // 外缘下角
  shape.lineTo(tx, -ty) // 回到下弧端
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth: POLE_DEPTH, bevelEnabled: false })
  geo.translate(0, 0, -POLE_DEPTH / 2)
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
  nLabel.position.set(-MAG_X, MAG_H + 0.35, 0)
  const sLabel = makeLabel('S', '#ffffff')
  sLabel.position.set(MAG_X, MAG_H + 0.35, 0)
  root.add(nLabel, sLabel)

  // 定子轴承座 ×2（带轴构造）：位于轴两端，固定支撑转子轴（仅几何，标注文字已移除）
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x394763, roughness: 0.7 })
  for (const sz of [3.5, -3.5]) {
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
  // 初始未通电：隐藏电流箭头与受力箭头
  setEnergized(false)

  lastTime = performance.now()
  animate()
}

/* ============ 通电/断电 控制电流箭头与受力箭头的可见性 ============ */
function setEnergized(on) {
  if (iL) iL.visible = on
  if (iR) iR.visible = on
  if (fLeft) fLeft.visible = on
  if (fRight) fRight.visible = on
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

  // 物理积分（无换向器：恒定电流 → 摆向平衡位，需手动换向维持）
  if (playing.value) {
    const base = reverseCurrent.value ? -1 : 1
    const alpha = -K * Math.cos(angle) * base
    angVel += alpha * dt * speedScale.value
    angVel *= 0.992 // 阻尼，最终静止于平衡位
    angle += angVel * dt * speedScale.value
    coilGroup.rotation.z = angle
  }

  // 电子流动（沿闭合路径取点；仅通电时流动）
  const corners = coilGroup.userData.corners
  const dir = reverseCurrent.value ? -1 : 1
  const eSpeed = 0.06 * (playing.value ? speedScale.value : 0)
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
  if (!playing.value) {
    liveState.value = '未通电：线圈不受力，静止待机'
  } else if (Math.abs(norm) < 12) {
    liveState.value = '平衡位（法线∥B）：力矩≈0，稳定；恒定电流下将停在此处'
  } else if (Math.abs(Math.abs(norm) - 90) < 12) {
    liveState.value = '侧立位（法线⊥B）：力矩最大，此刻点「⇄ 手动换向」可维持旋转'
  } else {
    liveState.value = '通电摆动中…'
  }
  // 接近侧立位（θ≈±90°）且通电时提示手动换向
  liveNearFlip.value = playing.value && Math.abs(Math.abs(norm) - 90) < 9

  controls.update()
  renderer.render(scene, camera)
}

/* ============ 控件 ============ */
function togglePower() {
  playing.value = !playing.value
  setEnergized(playing.value)
  if (playing.value) mark()
}
function reset() {
  playing.value = false
  setEnergized(false)
  angle = 0.6
  angVel = 0
  if (coilGroup) coilGroup.rotation.z = angle
  liveTheta.value = Math.round((0.6 * 180) / Math.PI)
  liveState.value = '未通电：线圈不受力，静止待机'
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
const formula = '力矩 τ = −K·cosθ·I （通电：线圈受摆动力矩，摆向平衡位；每次经过侧立位点「⇄ 手动换向」可维持旋转）'
const verifyList = [
  '通电：电流方向恒定，线圈受恒定力矩只摆到平衡位（θ≈0）即停',
  '想持续旋转：每次经过侧立位（θ≈±90°，按钮发光「现在点！」）点「⇄ 手动换向」翻转电流 → 线圈继续转（手摇换向演示）',
  '平衡位（θ≈0，法线∥B）：有效边力矩为 0 且稳定；侧立位（θ≈±90°）力矩最大',
  '开口线圈：两端不闭合，直接置于 N/S 磁极间，电流沿 ±Z，受力 F=BIL 沿 ±Y'
]
</script>

<template>
  <div class="lab-stage">
    <!-- 左：3D 场景 -->
    <div class="lab-left">
      <div class="lab-panel" style="padding: 0; min-height: 0; flex: 1; background: transparent">
        <div ref="containerRef" class="coil-3d" aria-label="通电线圈在磁场中转动 3D 演示（开口线圈）">
          <div class="scene-hint">拖拽旋转视角 · 滚轮缩放</div>
        </div>
      </div>

      <div class="lab-actions">
        <span class="r-readout">
          <span class="r-readout-item">偏角 θ <strong>{{ liveTheta }}°</strong></span>
          <span class="r-readout-item">电流 <strong>{{ liveCurrent }}</strong></span>
          <span class="r-readout-item">演示速度 <strong>{{ speedScale.toFixed(1) }}×</strong></span>
        </span>
        <button class="btn btn-power" :class="{ 'btn-on': playing }" @click="togglePower">{{ playing ? '⏻ 断电' : '⚡ 通电' }}</button>
        <button class="btn" @click="reset">↺ 复位</button>
        <button class="btn btn-flip" :class="{ 'btn-glow': liveNearFlip }" @click="reverseCurrent = !reverseCurrent" title="在每次经过侧立位（θ≈±90°）时点击，翻转电流方向即可让线圈持续旋转">
          ⇄ 手动换向<span v-if="liveNearFlip" class="flip-now">· 现在点！</span>
        </button>
        <ParamSlider v-model="speedScale" :min="0.5" :max="2" :step="0.1" :precision="1" label="演示速度" unit="×" hint="数值越大演示越快" />
      </div>
      <div class="state-line">当前：<strong>{{ liveState }}</strong></div>
      <div class="manual-hint">
        <span class="manual-hint-ico">💡</span>
        <span><strong>通电受力演示：</strong>点「⚡ 通电」后，恒定电流下线圈只摆到平衡位（θ≈0）便停住。想让它<strong>持续旋转</strong>，就在每次经过<strong>侧立位（θ≈±90°，按钮会发光提示「现在点！」）</strong>时点击 <strong>⇄ 手动换向</strong> 翻转电流方向——力矩随之翻转、推动线圈继续前进，便一圈圈转下去。这正是换向器自动完成的工作（手摇换向演示）。</span>
      </div>
    </div>

    <!-- 右：公式 + 结构要点卡 -->
    <aside class="lab-right">
      <FormulaPanel
        title="通电线圈在磁场中转动（开口线圈）"
        :formula="formula"
        :rows="[
          { label: '磁场方向 B', value: '由 N 指向 S（水平径向）' },
          { label: '电流方向 I', value: liveCurrent },
          { label: '受力 F = BIL', value: '沿 ±Y（绕 Z 轴形成力矩）' },
          { label: '线圈状态', value: '开口导体 · 置于 N/S 间' }
        ]"
        :result="[{ label: '当前位置', value: liveState }]"
        :verify="verifyList"
      />

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>结构要点（对照教材 20.4）</strong>
          <span>开口线圈演示</span>
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
            <svg viewBox="0 0 200 120" class="ref-svg">
              <!-- N 极（左）/ S 极（右） -->
              <path d="M44,36 L16,36 L16,84 L44,84 Q66,60 44,36 Z" fill="#d92135" />
              <text x="30" y="62" text-anchor="middle" fill="#fff" font-size="15" font-weight="900">N</text>
              <path d="M156,36 L184,36 L184,84 L156,84 Q134,60 156,36 Z" fill="#145fd2" />
              <text x="170" y="62" text-anchor="middle" fill="#fff" font-size="15" font-weight="900">S</text>
              <!-- 线圈两有效边 + 上下端（虚线） -->
              <line x1="92" y1="40" x2="92" y2="80" stroke="#c0742a" stroke-width="3" />
              <line x1="108" y1="40" x2="108" y2="80" stroke="#c0742a" stroke-width="3" />
              <line x1="92" y1="40" x2="108" y2="40" stroke="#c0742a" stroke-width="3" stroke-dasharray="3 2" />
              <line x1="92" y1="80" x2="108" y2="80" stroke="#c0742a" stroke-width="3" stroke-dasharray="3 2" />
              <!-- 受力 F：左有效边向下、右有效边向上 -->
              <line x1="92" y1="50" x2="92" y2="74" stroke="#ff5566" stroke-width="3" />
              <polygon points="92,78 88,70 96,70" fill="#ff5566" />
              <line x1="108" y1="70" x2="108" y2="46" stroke="#ff5566" stroke-width="3" />
              <polygon points="108,42 104,50 112,50" fill="#ff5566" />
              <!-- 电流 I（沿上边） -->
              <line x1="94" y1="34" x2="106" y2="34" stroke="#ff8a3d" stroke-width="2.5" />
              <polygon points="106,34 101,31 101,37" fill="#ff8a3d" />
              <text x="100" y="114" text-anchor="middle" font-size="10" font-weight="800" fill="#3a3026">通电：I → 受力 F=BIL（绕轴转）</text>
            </svg>
          </div>
        </div>
        <p class="ref-hint">
          通电：电流恒定，线圈只摆到平衡位（θ≈0）即停，可手动点「⇄ 手动换向」维持旋转。<br />
          线圈宽度与磁极一致、磁极高度已增大；线圈两端不闭合、直接置于 N/S 磁极间，电流沿 ±Z、受力沿 ±Y。
        </p>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>操作要点</strong></div>
        <ul class="op-list">
          <li>点击「⚡ 通电」观察线圈在磁场中受力；线圈从偏角摆向平衡位（θ≈0）后静止</li>
          <li>想让线圈<strong>一直转</strong>：每次经过侧立位（按钮发光「现在点！」、θ≈±90°）时点击「⇄ 手动换向」翻转电流（手摇换向），力矩随之翻转推动线圈继续前进</li>
          <li>用鼠标拖拽场景可自由改变视角，从 3/4 角度看清外方内弧磁极、气隙与线圈</li>
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
/* 手动换向提示横幅 */
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
/* 通电按钮（开态高亮） */
.btn-power {
  border-color: #ffb02e;
  color: #ffd98a;
}
.btn-power.btn-on {
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
