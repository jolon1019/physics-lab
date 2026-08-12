<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])

const canvasRef = ref(null)
let ctx = null
let raf = null
let dpr = 1
let flickerT = 0

const W = 860
const H = 460
const groundY = 330

const speed = ref(2) // 车速 m/s
const cloudSpeed = ref(2) // 白云速度 m/s（默认与车相同 → 相对静止）
const reference = ref('ground') // ground | car | cloud

// 车/云的连续位置（始终单向增大，从左向右行驶、循环，绝不反向）
let carPos = 470
let cloudPos = 512
let wheelAngle = 0

// 屏幕循环轨道：物体始终从左向右行驶，超出右界则从左侧重新进入
const TRACK_LEFT = -90
const TRACK_RIGHT = W + 90
const TRACK_SPAN = TRACK_RIGHT - TRACK_LEFT
// 把连续位置映射到屏幕 X（左→右循环）
function trackX(pos) {
  return mod(pos - TRACK_LEFT, TRACK_SPAN) + TRACK_LEFT
}
// 记录汽车的屏幕 X，供尾气粒子定位
let carScreenXCur = 470

// 现成精美车模：内嵌侧视小车 SVG，运行时作为图片绘制（叠加旋转车轮）
// 车身整体水平镜像，使长车头（引擎盖）朝右、前大灯在右，车头明确朝右
const CAR_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 220 120' width='220' height='120'>" +
  "<defs><linearGradient id='bd' x1='0' y1='34' x2='0' y2='104' gradientUnits='userSpaceOnUse'>" +
  "<stop offset='0' stop-color='#ff8a7d'/><stop offset='0.5' stop-color='#e6454d'/><stop offset='1' stop-color='#a51d27'/>" +
  "</linearGradient></defs>" +
  "<g transform='translate(220,0) scale(-1,1)'>" +
  "<path d='M14 98 L14 76 Q14 68 24 68 L70 68 L96 40 Q102 34 114 34 L146 34 Q158 34 166 44 L196 68 Q206 70 206 80 L206 98 Z' fill='url(#bd)'/>" +
  "<path d='M14 88 L206 88 L206 98 L14 98 Z' fill='#8c1620' opacity='0.55'/>" +
  "<path d='M76 66 L96 46 L110 46 L110 66 Z' fill='#bfe3ff'/>" +
  "<path d='M114 46 L144 46 L160 66 L114 66 Z' fill='#bfe3ff'/>" +
  "<path d='M74 68 L96 44 L112 44 L112 68 Z' fill='none' stroke='#16212c' stroke-width='3'/>" +
  "<path d='M114 44 L146 44 L162 68 L114 68 Z' fill='none' stroke='#16212c' stroke-width='3'/>" +
  "<line x1='112' y1='46' x2='112' y2='88' stroke='#8c1620' stroke-width='2'/>" +
  "<circle cx='58' cy='96' r='17' fill='#15181f'/>" +
  "<circle cx='162' cy='96' r='17' fill='#15181f'/>" +
  "</g>" +
  // 镜像后的车灯：黄色前大灯在右、红色尾灯在左
  "<ellipse cx='204' cy='76' rx='5' ry='4' fill='#fff3c4'/>" +
  "<rect x='11' y='74' width='5' height='8' rx='1' fill='#ff5252'/>" +
  "</svg>"
let carImg = null

// 固定在地面上的景物（车道线、路灯），以地面为参照物时不动
const LANES = [180, 420, 660, 900]
const LAMPS = [320, 780]
const MOD = 1100

// 尾气粒子
const puffs = []

const seen = { ground: false, car: false, cloud: false }
let completed = false

const hint = ref('切换参照物，观察同一物体是运动还是静止')

// 运动状态取决于各物体相对参照物的速度是否相同
const EPS = 0.001
const relState = (a, b) => (Math.abs(a - b) < EPS ? '静止' : '运动')

const verdict = computed(() => {
  const cs = speed.value
  const ws = cloudSpeed.value
  if (reference.value === 'ground') {
    return {
      car: cs > 0 ? '运动' : '静止',
      person: cs > 0 ? '运动' : '静止',
      cloud: ws > 0 ? '运动' : '静止',
      ground: '静止'
    }
  }
  if (reference.value === 'car') {
    return {
      car: '静止',
      person: '静止',
      cloud: relState(ws, cs),
      ground: cs > 0 ? '向后运动' : '静止'
    }
  }
  // 以白云为参照物：白云恒静止；车/人是否静止取决于白云速度是否等于车速
  return {
    car: relState(cs, ws),
    person: relState(cs, ws),
    cloud: '静止',
    ground: ws > 0 ? '向后运动' : '静止'
  }
})

const speedKmh = computed(() => (speed.value * 3.6).toFixed(1))
const cloudKmh = computed(() => (cloudSpeed.value * 3.6).toFixed(1))

const refLabel = computed(() =>
  reference.value === 'car' ? '车厢' : reference.value === 'cloud' ? '白云' : '地面'
)

// 切换参照物时重置运动学状态：非地面参照下参照物居中、单向循环不反向
function resetMotion(r) {
  if (r === 'ground') {
    carPos = 470
    cloudPos = 512
  } else {
    carPos = 470
    cloudPos = 512
  }
}

function pickReference(r) {
  reference.value = r
  resetMotion(r)
  seen[r] = true
  if (r === 'cloud') {
    hint.value = '以白云为参照物：白云速度 = 车速时，车和人相对白云静止；调高白云速度，车相对白云向前运动'
  } else if (r === 'car') {
    hint.value = '以车厢为参照物：车内人静止；白云是否静止，取决于白云速度是否等于车速'
  } else {
    hint.value = '以地面为参照物：汽车、车内人、白云都在运动（速度相同则同步移动）'
  }
  const got = Object.values(seen).filter(Boolean).length
  if (got >= 2 && !completed) {
    completed = true
    hint.value = '参照物不同，运动状态不同；同速同向的两个物体相对静止 —— 实验完成！'
    emit('complete')
  }
}

function reset() {
  reference.value = 'ground'
  resetMotion('ground')
  seen.ground = seen.car = seen.cloud = false
  hint.value = '切换参照物，观察同一物体是运动还是静止'
}

function setupCanvas() {
  const canvas = canvasRef.value
  dpr = window.devicePixelRatio || 1
  ctx = canvas.getContext('2d')
  resizeCanvas()
}

let resizeObs = null

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  const rect = canvas.getBoundingClientRect()
  const cw = Math.max(200, rect.width)
  const ch = Math.max(200, rect.height)
  const scale = Math.min((cw * dpr) / W, (ch * dpr) / H)
  canvas.width = Math.max(1, Math.round(cw * dpr))
  canvas.height = Math.max(1, Math.round(ch * dpr))
  canvas.style.height = ''
  ctx.setTransform(scale, 0, 0, scale, (cw * dpr - W * scale) / 2, (ch * dpr - H * scale) / 2)
}

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name) || fallback
}

function mod(x, n) {
  return ((x % n) + n) % n
}

// 将坐标环绕到屏幕内 [−60, W+60]，用于非地面参照时让另一物体循环而不反向
function wrapX(v) {
  const span = W + 120
  return (((v + 60) % span) + span) % span - 60
}

function drawClouds() {
  const clouds = [
    { y: 58, s: 1.0, sp: 0.14 },
    { y: 112, s: 0.72, sp: 0.2 }
  ]
  for (const c of clouds) {
    const px = mod(c.y * 9 + flickerT * c.sp, W + 260) - 130
    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    ctx.beginPath()
    ctx.arc(px, c.y, 27 * c.s, 0, Math.PI * 2)
    ctx.arc(px + 26 * c.s, c.y - 13 * c.s, 21 * c.s, 0, Math.PI * 2)
    ctx.arc(px + 52 * c.s, c.y + 2 * c.s, 23 * c.s, 0, Math.PI * 2)
    ctx.arc(px + 30 * c.s, c.y + 10 * c.s, 20 * c.s, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawHills(worldOffset) {
  // 远山（视差 0.25，随参照系缓慢移动）
  const off = worldOffset * 0.25
  ctx.fillStyle = 'rgba(150,185,215,0.6)'
  for (const hx of [110, 430, 750]) {
    const px = mod(hx - off, MOD) - 160
    if (px > -180 && px < W + 180) {
      ctx.beginPath()
      ctx.arc(px, 360, 150, Math.PI, 0)
      ctx.fill()
    }
  }
}

function drawLamp(x) {
  // 灯杆（带底座）
  ctx.fillStyle = '#5a6672'
  ctx.fillRect(x - 10, groundY - 6, 20, 8)
  ctx.fillRect(x - 4, groundY - 66, 8, 62)
  // 灯臂与灯头
  ctx.fillRect(x - 4, groundY - 82, 34, 8)
  ctx.fillRect(x + 18, groundY - 82, 10, 14)
  // 灯光光晕
  ctx.save()
  ctx.shadowColor = '#ffd98a'
  ctx.shadowBlur = 14
  ctx.fillStyle = '#ffd98a'
  ctx.beginPath()
  ctx.arc(x + 23, groundY - 70, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawScene() {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#cfe6fa')
  g.addColorStop(0.55, '#eaf4fd')
  g.addColorStop(1, '#f6f1e6')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // 依据参照物计算各物体屏幕位置：非地面参照时，参照物居中、世界连续滚动、
  // 另一物体环绕循环——均“不再改变方向（反向）”
  let worldOffset, carScreenX, cloudScreenX
  if (reference.value === 'ground') {
    worldOffset = 0
    carScreenX = trackX(carPos)
    cloudScreenX = trackX(cloudPos)
  } else if (reference.value === 'car') {
    worldOffset = carPos - 470
    carScreenX = 470
    cloudScreenX = wrapX((cloudPos - carPos) + 470)
  } else {
    worldOffset = cloudPos - 512
    cloudScreenX = 512
    carScreenX = wrapX((carPos - cloudPos) + 512)
  }
  carScreenXCur = carScreenX

  drawClouds()
  drawHills(worldOffset)

  // 柏油路面
  const rg = ctx.createLinearGradient(0, groundY, 0, groundY + 34)
  rg.addColorStop(0, '#9c9da2')
  rg.addColorStop(1, '#6d6e74')
  ctx.fillStyle = rg
  ctx.fillRect(0, groundY, W, 34)
  // 路缘白线
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.fillRect(0, groundY + 3, W, 3)
  ctx.fillRect(0, groundY + 29, W, 3)

  // 车道虚线（地面系固定）
  for (const lane of LANES) {
    const px = mod(lane - worldOffset, MOD) - 120
    if (px > -90 && px < W + 90) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillRect(px, groundY + 15, 64, 6)
    }
  }

  // 路边草地
  const gg = ctx.createLinearGradient(0, groundY + 34, 0, H)
  gg.addColorStop(0, '#82b262')
  gg.addColorStop(1, '#5d8a44')
  ctx.fillStyle = gg
  ctx.fillRect(0, groundY + 34, W, H - groundY - 34)
  // 草叶纹理
  ctx.strokeStyle = 'rgba(70,120,50,0.35)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 70; i++) {
    const gx = (i * 37) % W
    const gy = groundY + 42 + ((i * 53) % 62)
    ctx.beginPath()
    ctx.moveTo(gx, gy)
    ctx.lineTo(gx + 3, gy - 9)
    ctx.stroke()
  }

  for (const lp of LAMPS) {
    const px = mod(lp - worldOffset, MOD) - 120
    if (px > -90 && px < W + 90) drawLamp(px)
  }

  drawCar(carScreenX)
  drawCloud(cloudScreenX, groundY - 165 + Math.sin(flickerT * 0.06) * 6)

  // 尾气粒子（固定在汽车屏幕位置后方，随屏向左飘散）
  for (const p of puffs) {
    ctx.fillStyle = `rgba(205,208,216,${Math.max(0, p.a)})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawCar(x) {
  const bounce = Math.sin(flickerT * 0.22) * 1.4
  const CW = 160
  const s = CW / 220
  const CH = 120 * s
  const carLeft = x - CW / 2
  const carTop = groundY - 96 * s - bounce
  const wheelY = groundY - bounce

  // 车底阴影（落在路面上）
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.beginPath()
  ctx.ellipse(x, wheelY + 6, 78, 9, 0, 0, Math.PI * 2)
  ctx.fill()

  // 车身（现成内嵌 SVG 车模）
  if (carImg && carImg.complete && carImg.naturalWidth) {
    ctx.drawImage(carImg, carLeft, carTop, CW, CH)
  } else {
    ctx.fillStyle = '#e6454d'
    ctx.fillRect(carLeft + 10, carTop + CH * 0.32, CW - 20, CH * 0.55)
  }

  // 车内人（车窗中的小乘客）
  const dx = x - 8
  const dy = carTop + 56 * s
  ctx.fillStyle = '#33465a'
  ctx.beginPath()
  ctx.moveTo(dx - 6, dy + 12)
  ctx.quadraticCurveTo(dx, dy - 4, dx + 6, dy + 12)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#f0c9a0'
  ctx.beginPath()
  ctx.arc(dx, dy - 2, 5, 0, Math.PI * 2)
  ctx.fill()

  // 车轮（旋转：轮胎 + 轮辋 + 辐条 + 中心盖）
  for (const wx of [x - 38, x + 38]) {
    ctx.fillStyle = '#15181f'
    ctx.beginPath()
    ctx.arc(wx, wheelY, 13, 0, Math.PI * 2)
    ctx.fill()
    const rg = ctx.createRadialGradient(wx - 3, wheelY - 3, 2, wx, wheelY, 11)
    rg.addColorStop(0, '#eef1f5')
    rg.addColorStop(1, '#9aa1ab')
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.arc(wx, wheelY, 10.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    ctx.translate(wx, wheelY)
    ctx.rotate(wheelAngle)
    ctx.strokeStyle = '#5b626d'
    ctx.lineWidth = 2.2
    for (let a = 0; a < 5; a++) {
      const ang = a * (Math.PI * 2 / 5)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(ang) * 9, Math.sin(ang) * 9)
      ctx.stroke()
    }
    ctx.restore()
    ctx.fillStyle = '#c9d1d9'
    ctx.beginPath()
    ctx.arc(wx, wheelY, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#0c0e12'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(wx, wheelY, 13, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawCloud(x, y) {
  if (x < -90 || x > W + 90) return
  const drift = Math.sin(flickerT * 0.05) * 3

  // 柔和投影（增加体积感，区别于背景装饰云）
  ctx.fillStyle = 'rgba(150,162,180,0.28)'
  ctx.beginPath()
  ctx.ellipse(x + 4 + drift, y + 20, 50, 15, 0, 0, Math.PI * 2)
  ctx.fill()

  // 白云本体（多圆叠加）
  ctx.fillStyle = 'rgba(255,255,255,0.98)'
  ctx.beginPath()
  ctx.arc(x - 32 + drift, y + 6, 18, 0, Math.PI * 2)
  ctx.arc(x - 8 + drift, y - 10, 25, 0, Math.PI * 2)
  ctx.arc(x + 20 + drift, y - 6, 21, 0, Math.PI * 2)
  ctx.arc(x + 40 + drift, y + 6, 16, 0, Math.PI * 2)
  ctx.arc(x + 4 + drift, y + 12, 23, 0, Math.PI * 2)
  ctx.fill()

  // 底部阴影，增强立体感
  ctx.fillStyle = 'rgba(206,216,230,0.55)'
  ctx.beginPath()
  ctx.ellipse(x + 2 + drift, y + 16, 42, 8, 0, 0, Math.PI)
  ctx.fill()
}

function render() {
  if (!ctx) return
  drawScene()

  const textH = cssVar('--text-h', '#111')
  const textCol = cssVar('--text', '#555')
  const accent = cssVar('--accent', '#ff3b4d')

  ctx.textAlign = 'left'
  ctx.fillStyle = textH
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText('运动的描述 · 参照物', 40, 40)
  ctx.fillStyle = textCol
  ctx.font = '13px sans-serif'
  ctx.fillText('白云有独立速度：换一个参照物，再看谁动谁静', 40, 64)

  // 结论卡片（右上角，缩小，避免遮挡画面主体）
  const cardW = 250
  const cardH = 116
  const cardX = W - cardW - 16
  const cardY = 14
  ctx.fillStyle = 'rgba(255,254,249,0.92)'
  ctx.strokeStyle = textH
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect ? ctx.roundRect(cardX, cardY, cardW, cardH, 10) : ctx.rect(cardX, cardY, cardW, cardH)
  ctx.fill()
  ctx.stroke()

  ctx.font = '700 12px sans-serif'
  ctx.fillStyle = accent
  ctx.fillText('参照物：' + refLabel.value, cardX + 16, cardY + 24)
  ctx.fillStyle = textH
  ctx.font = '12px sans-serif'
  ctx.fillText(`汽车：${verdict.value.car}`, cardX + 16, cardY + 46)
  ctx.fillText(`车内人：${verdict.value.person}`, cardX + 16, cardY + 64)
  ctx.fillText(`白云：${verdict.value.cloud}`, cardX + 16, cardY + 82)
  ctx.fillText(`地面景物：${verdict.value.ground}`, cardX + 16, cardY + 100)
}

function loop() {
  flickerT += 1
  const vCar = 0.7 + speed.value * 0.35 // 视觉速度
  const vCloud = 0.7 + cloudSpeed.value * 0.35
  // 始终从左向右，纯单向递增、循环，绝不反向
  carPos += vCar
  cloudPos += vCloud
  wheelAngle += vCar * 0.05

  // 尾气粒子（从车尾后方冒出，向左飘散）
  if (flickerT % 12 === 0) {
    puffs.push({ x: carScreenXCur - 80, y: groundY - 26, a: 0.3, r: 3.5 })
  }
  for (const p of puffs) {
    p.x -= 1.4
    p.a -= 0.02
    p.r += 0.35
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    if (puffs[i].a <= 0) puffs.splice(i, 1)
  }

  render()
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  setupCanvas()
  carImg = new Image()
  carImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(CAR_SVG)
  if (window.ResizeObserver) {
    resizeObs = new ResizeObserver(() => resizeCanvas())
    resizeObs.observe(canvasRef.value.parentElement)
  }
  raf = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (resizeObs) resizeObs.disconnect()
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel" style="padding:0">
        <canvas ref="canvasRef" style="display:block;width:100%"></canvas>
      </div>

      <div class="lab-actions">
        <button class="btn" :class="{ 'btn-primary': reference === 'ground' }" @click="pickReference('ground')">以地面为参照物</button>
        <button class="btn" :class="{ 'btn-primary': reference === 'car' }" @click="pickReference('car')">以车厢为参照物</button>
        <button class="btn" :class="{ 'btn-primary': reference === 'cloud' }" @click="pickReference('cloud')">以白云为参照物</button>
        <button class="btn" @click="reset">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>可调变量</strong>
          <span>实时联动</span>
        </div>
        <div class="lab-params">
          <ParamSlider
            v-model="speed"
            :min="1"
            :max="10"
            :step="0.5"
            label="车速 v"
            unit=" m/s"
            hint="速度只影响快慢，不影响运动/静止的判断"
          />
          <ParamSlider
            v-model="cloudSpeed"
            :min="0"
            :max="10"
            :step="0.5"
            label="白云速度 w"
            unit=" m/s"
            hint="与车速相同时，白云与车相对静止；不同则彼此运动"
          />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实时数据</strong>
          <span>只读输出</span>
        </div>
        <div class="lab-readout">
          <div class="lab-stat">
            <span>参照物</span>
            <strong style="font-size:13px">{{ refLabel }}</strong>
          </div>
          <div class="lab-stat accent">
            <span>车速（换算）</span>
            <strong>{{ speed }} m/s = {{ speedKmh }} km/h</strong>
          </div>
          <div class="lab-stat accent">
            <span>白云速度（换算）</span>
            <strong>{{ cloudSpeed }} m/s = {{ cloudKmh }} km/h</strong>
          </div>
          <div class="lab-stat success">
            <span>车内人</span>
            <strong style="font-size:13px">{{ verdict.person }}（相对参照物）</strong>
          </div>
          <div class="lab-stat">
            <span>白云</span>
            <strong style="font-size:13px">{{ verdict.cloud }}（相对参照物）</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="运动的描述"
        formula="v = s / t"
        desc="机械运动：物体位置的变化。判断运动还是静止，要看它相对于参照物的位置是否改变。"
        :rows="[
          { label: '车速 v', value: speed + ' m/s' },
          { label: '换算（×3.6）', value: speedKmh + ' km/h' }
        ]"
        :result="[
          { label: '1 m/s', value: '3.6 km/h' },
          { label: '参照物', value: refLabel }
        ]"
        :verify="[
          '参照物：判断物体运动或静止时，被选作标准的物体',
          '不能选研究对象本身作为参照物（自身永远相对自己静止）',
          '相对静止：同速同向运动的两个物体，彼此相对静止（云与车）',
          '通常默认以地面或地面上固定不动的物体为参照物'
        ]"
      />
    </aside>
  </div>
</template>