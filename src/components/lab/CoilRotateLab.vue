<script setup>
// 通电线圈在磁场中转动（人教版九年级 20.4-3）—— three.js 3D 版本
// 物理设定（轴系）：
//   - 转轴 = 竖直 Y 轴（像旋转门绕中轴转），线圈为竖直矩形框，绕 Y 轴转动
//   - 磁场 B：水平，由 N(-X) 指向 S(+X)，磁铁在左右两侧
//   - 线圈左/右两条竖直边为有效边，受力 F = I·L×B 始终沿 ±Z（朝向/背离观察者）
//   - 转至 乙（线圈侧立、法线∥B）时力偶矩为 0（平衡位）；转过 乙 后受力反向
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
const W = 1.1 // 线圈半宽（左右有效边到中轴距离）
const H = 1.4 // 线圈半高
const MAG_X = 3.0 // 磁铁中心 x

/* ============ three.js 运行时 ============ */
const containerRef = ref(null)
let renderer, scene, camera, controls, coilGroup, fLeft, fRight
let electrons = [] // 沿线圈流动的电子小球
let electronT = [] // 各电子的路径参数 t∈[0,1)
let raf = null
let clock = null
let resizeObs = null

// 实时读数（由动画循环写回，节流）
const liveTheta = ref(0)
const liveState = ref('图甲：线圈正对（受力最大）')
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

/* ============ 在两点间建一根圆柱（线圈框） ============ */
function addBar(p1, p2, radius, mat) {
  const dir = new THREE.Vector3().subVectors(p2, p1)
  const len = dir.length()
  const geo = new THREE.CylinderGeometry(radius, radius, len, 14)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(p1).add(p2).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  return mesh
}

/* ============ 沿折线取点（用于电子流） ============ */
function pointOnLoop(corners, t) {
  // corners: 闭合折线（首尾相同），返回参数 t∈[0,1) 处世界(局部)坐标
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

  // 转轴（竖直 Y 轴）
  const axleMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.6, roughness: 0.4 })
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.6, 16), axleMat)
  scene.add(axle)

  // 磁铁：N（红，左 -X）/ S（蓝，右 +X）
  const nMat = new THREE.MeshStandardMaterial({ color: 0xd92135, roughness: 0.55 })
  const sMat = new THREE.MeshStandardMaterial({ color: 0x145fd2, roughness: 0.55 })
  const magGeo = new THREE.BoxGeometry(0.9, 3.0, 2.2)
  const magN = new THREE.Mesh(magGeo, nMat)
  magN.position.set(-MAG_X, 0, 0)
  const magS = new THREE.Mesh(magGeo, sMat)
  magS.position.set(MAG_X, 0, 0)
  scene.add(magN, magS)
  const nLabel = makeLabel('N', '#ffffff')
  nLabel.position.set(-MAG_X, 1.9, 0)
  const sLabel = makeLabel('S', '#ffffff')
  sLabel.position.set(MAG_X, 1.9, 0)
  scene.add(nLabel, sLabel)

  // 磁场 B：水平由 N 指向 S（+X），多条箭头
  const bMat = 0x5a8ad0
  for (const yy of [-1.1, 0, 1.1]) {
    for (const zz of [-0.8, 0, 0.8]) {
      const origin = new THREE.Vector3(-MAG_X + 0.7, yy, zz)
      const arr = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, 2 * MAG_X - 1.4, bMat, 0.32, 0.22)
      arr.line.material.transparent = true
      arr.line.material.opacity = 0.5
      scene.add(arr)
    }
  }
  const bLabel = makeLabel('B', '#9fc0ff')
  bLabel.position.set(0, 1.7, 1.2)
  scene.add(bLabel)

  // 线圈（旋转组）
  coilGroup = new THREE.Group()
  scene.add(coilGroup)
  const coilMat = new THREE.MeshStandardMaterial({ color: 0xc0742a, metalness: 0.5, roughness: 0.45 })
  const cTL = new THREE.Vector3(-W, H, 0)
  const cTR = new THREE.Vector3(W, H, 0)
  const cBR = new THREE.Vector3(W, -H, 0)
  const cBL = new THREE.Vector3(-W, -H, 0)
  coilGroup.add(addBar(cTL, cTR, 0.06, coilMat))
  coilGroup.add(addBar(cTR, cBR, 0.06, coilMat))
  coilGroup.add(addBar(cBR, cBL, 0.06, coilMat))
  coilGroup.add(addBar(cBL, cTL, 0.06, coilMat))
  // 顶点标号 a/b/c/d
  const labA = makeLabel('a', '#ffe2b0')
  labA.position.set(-W - 0.45, H + 0.2, 0)
  labA.scale.set(0.55, 0.32, 1)
  const labB = makeLabel('b', '#ffe2b0')
  labB.position.set(W + 0.45, H + 0.2, 0)
  labB.scale.set(0.55, 0.32, 1)
  const labC = makeLabel('c', '#ffe2b0')
  labC.position.set(W + 0.45, -H - 0.2, 0)
  labC.scale.set(0.55, 0.32, 1)
  const labD = makeLabel('d', '#ffe2b0')
  labD.position.set(-W - 0.45, -H - 0.2, 0)
  labD.scale.set(0.55, 0.32, 1)
  coilGroup.add(labA, labB, labC, labD)

  // 电流方向小箭头（左右有效边中部，沿 Y）
  const iMat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x3a1c00 })
  const coneGeo = new THREE.ConeGeometry(0.12, 0.3, 14)
  const iL = new THREE.Mesh(coneGeo, iMat)
  iL.position.set(-W, 0, 0)
  iL.rotation.x = 0 // 默认锥尖 +Y
  const iR = new THREE.Mesh(coneGeo, iMat)
  iR.position.set(W, 0, 0)
  iR.rotation.x = Math.PI // 锥尖 -Y
  coilGroup.add(iL, iR)

  // 电子流小球（沿线圈框跑）
  const eGeo = new THREE.SphereGeometry(0.085, 12, 12)
  const eMat = new THREE.MeshStandardMaterial({ color: 0xffb74d, emissive: 0x6a3a00, emissiveIntensity: 0.8 })
  const corners = [cTL, cTR, cBR, cBL, cTL.clone()]
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Mesh(eGeo, eMat)
    coilGroup.add(s)
    electrons.push(s)
    electronT.push(i / 12)
  }
  coilGroup.userData.corners = corners

  // 受力箭头（子物体，沿 ±Z；绕 Y 旋转不改变 Z 轴，故世界方向恒为 ±Z）
  const fColor = 0xff5566
  fLeft = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-W, 0, 0), 1.35, fColor, 0.45, 0.32)
  fRight = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(W, 0, 0), 1.35, fColor, 0.45, 0.32)
  coilGroup.add(fLeft, fRight)
  const fLabL = makeLabel('F', '#ff8090')
  fLabL.position.set(-W, 0.2, -1.7)
  fLabL.scale.set(0.5, 0.3, 1)
  const fLabR = makeLabel('F', '#ff8090')
  fLabR.position.set(W, 0.2, 1.7)
  fLabR.scale.set(0.5, 0.3, 1)
  coilGroup.add(fLabL, fLabR)

  // 滑环（换向器示意）
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xcdd6e2, metalness: 0.7, roughness: 0.3 })
  const ringGeo = new THREE.TorusGeometry(0.28, 0.07, 12, 28)
  const ringT = new THREE.Mesh(ringGeo, ringMat)
  ringT.position.y = H + 0.35
  ringT.rotation.x = Math.PI / 2
  const ringB = new THREE.Mesh(ringGeo, ringMat)
  ringB.position.y = -H - 0.35
  ringB.rotation.x = Math.PI / 2
  coilGroup.add(ringT, ringB)

  // 应用初始电流方向
  applyCurrentDirection()

  clock = new THREE.Clock()
  animate()
}

/* ============ 电流方向：影响电子流向 + 受力箭头方向 ============ */
function applyCurrentDirection() {
  const flip = reverseCurrent.value ? 1 : -1
  // 左有效边受力方向（局部 ±Z），右有效边相反
  fLeft.setDirection(new THREE.Vector3(0, 0, flip))
  fRight.setDirection(new THREE.Vector3(0, 0, -flip))
}

/* ============ 动画循环 ============ */
function animate() {
  raf = requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.05)
  if (playing.value) {
    coilGroup.rotation.y += 0.9 * speedScale.value * dt
  }
  // 电子流动
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
  let deg = (coilGroup.rotation.y * 180) / Math.PI
  deg = ((deg % 360) + 360) % 360
  const norm = deg > 180 ? deg - 360 : deg
  liveTheta.value = Math.round(norm)
  if (Math.abs(norm) < 12) liveState.value = '图甲：线圈正对（受力最大）'
  else if (Math.abs(Math.abs(norm) - 90) < 12) liveState.value = '图乙：线圈侧立（平衡位，力偶矩≈0）'
  else if (Math.abs(norm - 180) < 12) liveState.value = '图丙：线圈背面（受力反向）'
  else liveState.value = '转动中…'
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
  if (coilGroup) coilGroup.rotation.y = 0
  liveTheta.value = 0
  liveState.value = '图甲：线圈正对（受力最大）'
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
const formula = '力偶矩 M = NBIS·sinθ （θ 为线圈平面法线与 B 夹角）'
const verifyList = [
  '线圈在 乙（侧立，法线∥B）时力偶矩为零，是平衡位置；甲/丙时力偶矩不为零',
  '甲 → 乙：力偶矩方向使线圈加速转动',
  '过 乙 后（丙），导体位置互换、电流相对 B 不变 → 受力方向反向，阻碍继续转动',
  '无换向器时线圈只能来回振荡；直流电动机靠换向器在 乙 附近翻转电流，使其连续转动'
]
</script>

<template>
  <div class="lab-stage">
    <!-- 左：3D 场景 -->
    <div class="lab-left">
      <div class="lab-panel" style="padding: 0; min-height: 0; flex: 1; background: transparent">
        <div ref="containerRef" class="coil-3d" aria-label="通电线圈在磁场中转动 3D 演示">
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

    <!-- 右：公式 + 三张参考卡 -->
    <aside class="lab-right">
      <FormulaPanel
        title="通电线圈在磁场中受力"
        :formula="formula"
        :rows="[
          { label: '磁场方向 B', value: '由 N 指向 S（水平向左）' },
          { label: '电流方向 I', value: liveCurrent },
          { label: '受力 F = BIL', value: '垂直 B 与 I 所在平面（沿 ±Z）' },
          { label: '线圈状态', value: '甲=正对、乙=侧立平衡、丙=背面' }
        ]"
        :result="[{ label: '当前位置', value: liveState }]"
        :verify="verifyList"
      />

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>图甲 / 乙 / 丙 关键位置</strong>
          <span>对照教材 20.4-3</span>
        </div>
        <div class="ref-cards">
          <div class="ref-card">
            <svg viewBox="0 0 200 110" class="ref-svg">
              <rect x="14" y="20" width="22" height="70" fill="#145fd2" rx="3" />
              <rect x="164" y="20" width="22" height="70" fill="#d92135" rx="3" />
              <text x="25" y="62" text-anchor="middle" fill="#fff" font-size="18" font-weight="900">S</text>
              <text x="175" y="62" text-anchor="middle" fill="#fff" font-size="18" font-weight="900">N</text>
              <line x1="40" y1="65" x2="160" y2="65" stroke="#7a6045" stroke-dasharray="2 3" stroke-width="1.5" />
              <g transform="rotate(-28 100 55)">
                <rect x="55" y="35" width="90" height="40" fill="none" stroke="#c0742a" stroke-width="3" stroke-linejoin="round" />
                <line x1="35" y1="35" x2="35" y2="75" stroke="#d92135" stroke-width="2.5" stroke-linecap="round" />
                <polygon points="31,33 39,33 35,25" fill="#d92135" />
                <line x1="165" y1="75" x2="165" y2="35" stroke="#d92135" stroke-width="2.5" stroke-linecap="round" />
                <polygon points="161,77 169,77 165,85" fill="#d92135" />
                <text x="32" y="28" text-anchor="end" font-size="11" font-weight="800" fill="#d92135">F</text>
                <text x="170" y="92" text-anchor="start" font-size="11" font-weight="800" fill="#d92135">F</text>
              </g>
              <text x="100" y="103" text-anchor="middle" font-size="11" font-weight="800" fill="#3a3026">图甲（正对）</text>
            </svg>
          </div>
          <div class="ref-card">
            <svg viewBox="0 0 200 110" class="ref-svg">
              <rect x="14" y="20" width="22" height="70" fill="#145fd2" rx="3" />
              <rect x="164" y="20" width="22" height="70" fill="#d92135" rx="3" />
              <text x="25" y="62" text-anchor="middle" fill="#fff" font-size="18" font-weight="900">S</text>
              <text x="175" y="62" text-anchor="middle" fill="#fff" font-size="18" font-weight="900">N</text>
              <line x1="40" y1="55" x2="160" y2="55" stroke="#7a6045" stroke-dasharray="2 3" stroke-width="1.5" />
              <g transform="rotate(0 100 55)">
                <rect x="55" y="35" width="90" height="40" fill="none" stroke="#c0742a" stroke-width="3" stroke-linejoin="round" />
                <text x="100" y="55" text-anchor="middle" font-size="9" font-weight="700" fill="#3a3026" opacity="0.55">F=0</text>
              </g>
              <text x="100" y="103" text-anchor="middle" font-size="11" font-weight="800" fill="#3a3026">图乙（平衡位）</text>
            </svg>
          </div>
          <div class="ref-card">
            <svg viewBox="0 0 200 110" class="ref-svg">
              <rect x="14" y="20" width="22" height="70" fill="#145fd2" rx="3" />
              <rect x="164" y="20" width="22" height="70" fill="#d92135" rx="3" />
              <text x="25" y="62" text-anchor="middle" fill="#fff" font-size="18" font-weight="900">S</text>
              <text x="175" y="62" text-anchor="middle" fill="#fff" font-size="18" font-weight="900">N</text>
              <line x1="40" y1="65" x2="160" y2="65" stroke="#7a6045" stroke-dasharray="2 3" stroke-width="1.5" />
              <g transform="rotate(28 100 55)">
                <rect x="55" y="35" width="90" height="40" fill="none" stroke="#c0742a" stroke-width="3" stroke-linejoin="round" />
                <line x1="35" y1="75" x2="35" y2="35" stroke="#d92135" stroke-width="2.5" stroke-linecap="round" />
                <polygon points="31,77 39,77 35,85" fill="#d92135" />
                <line x1="165" y1="35" x2="165" y2="75" stroke="#d92135" stroke-width="2.5" stroke-linecap="round" />
                <polygon points="161,33 169,33 165,25" fill="#d92135" />
                <text x="32" y="92" text-anchor="end" font-size="11" font-weight="800" fill="#d92135">F</text>
                <text x="170" y="28" text-anchor="start" font-size="11" font-weight="800" fill="#d92135">F</text>
              </g>
              <text x="100" y="103" text-anchor="middle" font-size="11" font-weight="800" fill="#3a3026">图丙（背面）</text>
            </svg>
          </div>
        </div>
        <p class="ref-hint">注意：图丙处 ab 边已从"上端"换到"下端"，但电流方向相对 B 没变 → 受力方向反向，阻碍继续转动。</p>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>操作要点</strong></div>
        <ul class="op-list">
          <li>点击「▶ 播放」看线圈绕竖直轴连续转动：甲（正对）→ 乙（侧立平衡）→ 丙（背面）→ 乙 → 甲，循环演示</li>
          <li>用鼠标拖拽场景可自由改变视角，从 3/4 角度看清磁场、受力方向与线圈转动</li>
          <li>切换「反向电流」再播放：两侧受力方向整体翻转，物理图像对称</li>
          <li>「↺ 复位」让线圈回到图甲位置</li>
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
