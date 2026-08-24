<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FormulaPanel from './FormulaPanel.vue'
import FullscreenBtn from './FullscreenBtn.vue'
import { paintBoard } from '../../lib/boardBg'
import { boardText } from '../../lib/boardText'

const emit = defineEmits(['complete'])

// ===== 教材实验：探究重力的大小跟质量的关系（钩码挂弹簧测力计） =====
const HOOKS = ref(0)     // 钩码数 0~5（每个 100g，质量已知）
const MASS_PER = 0.1     // 每个钩码质量 kg
const G_CONST = 10       // g = 10 N/kg（初中近似；精确 9.8）
const FMAX = 8           // 测力计量程 N（弹性限度）
const PX_PER_N = 15      // 每 N 伸长 px
const L0 = 60            // 弹簧原长 px
let completed = false

const m = computed(() => HOOKS.value * MASS_PER)     // 总质量 kg
const G = computed(() => m.value * G_CONST)          // 重力 N = 测力计示数（静止时）
const F = computed(() => G.value)                    // 读数
const overLimit = computed(() => F.value > FMAX)
const x = computed(() => F.value * PX_PER_N)         // 伸长量 px

// 实验记录表（质量 m、重力 G）
const records = ref([])
function recordRow() {
  records.value.push({
    id: records.value.length + 1,
    mKg: m.value,
    m: m.value.toFixed(1),
    G: G.value.toFixed(1),
  })
  mark()
}
function clearRecords() {
  records.value = []
}
// 自动归纳：各组 G/m 是否恒为 g
const conclusion = computed(() => {
  if (records.value.length < 2) return []
  const ratios = records.value.map((r) => r.G / r.mKg)
  const maxR = Math.max(...ratios)
  const minR = Math.min(...ratios)
  const tips = []
  if (maxR - minR < 1e-6) {
    tips.push(`各组 G/m 均 = ${ratios[0].toFixed(1)} N/kg → 重力与质量成正比`)
    tips.push(`g = G/m = ${ratios[0].toFixed(1)} N/kg，即 G = m·g`)
  } else {
    tips.push('继续测量更多组质量与重力，寻找规律')
  }
  return tips
})

function mark() {
  if (!completed) {
    completed = true
    emit('complete')
  }
}
watch(HOOKS, mark)

// ===== canvas 绘制 =====
const canvasRef = ref(null)
let ctx = null
let raf = null
const dpr = () => Math.min(window.devicePixelRatio || 1, 2)

function setupCanvas() {
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.round(rect.width * dpr())
  canvas.height = Math.round(rect.height * dpr())
  ctx = canvas.getContext('2d')
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0)
}
function dims() {
  const canvas = canvasRef.value
  return { W: canvas.width / dpr(), H: canvas.height / dpr() }
}

function drawSpring(topX, topY, len, coils, color) {
  const botY = topY + len
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(topX, topY)
  const seg = len / (coils * 2)
  for (let i = 0; i < coils * 2; i++) {
    const y = topY + seg * (i + 0.5)
    const dir = i % 2 === 0 ? 1 : -1
    ctx.lineTo(topX + dir * 14, y)
  }
  ctx.lineTo(topX, botY)
  ctx.stroke()
  return botY
}

function render() {
  if (!ctx) return
  const { W, H } = dims()
  paintBoard(ctx, W, H, 'chalk')

  const cx = W * 0.4
  const supportY = 40
  // 支架
  ctx.fillStyle = '#7a828c'
  ctx.fillRect(cx - 90, supportY - 14, 180, 14)
  ctx.strokeStyle = '#5b6068'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx, supportY)
  ctx.lineTo(cx, supportY + 6)
  ctx.stroke()

  // ===== 弹簧测力计：外壳 + 刻度窗(0~8N 每0.5N) + 指针 + 挂钩（挂砝码） =====
  const DYN_W = 56
  const shellTop = supportY + 6
  const y0 = shellTop + 24             // 0 N 刻度线 y
  const shellBot = y0 + FMAX * PX_PER_N + 22
  const winX = cx - DYN_W / 2 + 10
  const winW = DYN_W - 26

  // 外壳（圆筒）
  ctx.fillStyle = '#f7f4ec'
  ctx.strokeStyle = '#2b3a4a'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.roundRect(cx - DYN_W / 2, shellTop, DYN_W, shellBot - shellTop, 10)
  ctx.fill(); ctx.stroke()
  // 顶部固定端盖（挂支架）
  ctx.fillStyle = '#2b3a4a'
  ctx.fillRect(cx - DYN_W / 2, shellTop, DYN_W, 12)
  // 底部端盖（连弹簧）
  ctx.fillStyle = '#1f2c39'
  ctx.fillRect(cx - DYN_W / 2, shellBot - 10, DYN_W, 10)

  // 刻度窗（白底，精确刻度 0~8N 每 0.5N）
  ctx.fillStyle = '#f6fafd'
  ctx.fillRect(winX, y0 - 14, winW + 10, FMAX * PX_PER_N + 26)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let n = 0; n <= FMAX; n++) {
    for (let h = 0; h < 2; h++) {
      const v = n + h * 0.5
      if (v > FMAX) continue
      const y = y0 + v * PX_PER_N
      const major = h === 0
      ctx.strokeStyle = major ? '#2b3a4a' : '#7d8a9a'
      ctx.lineWidth = major ? 1.6 : 0.9
      ctx.beginPath()
      ctx.moveTo(winX + 3, y)
      ctx.lineTo(winX + 3 + (major ? 12 : 6), y)
      ctx.stroke()
      if (major) {
        ctx.fillStyle = boardText(ctx.canvas)
        ctx.fillText(String(v), winX + 20, y)
      }
    }
  }
  // 弹性限度虚线（8N）
  const ylim = y0 + FMAX * PX_PER_N
  ctx.strokeStyle = '#d23b3b'
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(winX - 2, ylim)
  ctx.lineTo(winX + winW + 14, ylim)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#d23b3b'
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.fillText('弹性限度', winX + winW + 18, ylim)

  // 红色指针（随读数移动，超限顶格）
  const py = y0 + Math.min(F.value, FMAX) * PX_PER_N
  ctx.strokeStyle = '#d92135'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(winX - 4, py)
  ctx.lineTo(winX + winW + 6, py)
  ctx.stroke()

  // 弹簧（外壳下方：顶部连外壳底，随钩码重力伸长）
  const springColor = overLimit.value ? '#d23b3b' : '#3a6ea5'
  const springTopY = shellBot + 6
  const springLen = L0 + x.value
  drawSpring(cx, springTopY, springLen, 12, springColor)

  // 挂钩（弹簧下端，挂砝码）
  const botY = springTopY + springLen
  ctx.strokeStyle = springColor
  ctx.beginPath()
  ctx.moveTo(cx, botY)
  ctx.lineTo(cx, botY + 10)
  ctx.stroke()
  // 挂钩弯头
  ctx.beginPath()
  ctx.arc(cx, botY + 14, 5, 0, Math.PI * 2)
  ctx.stroke()

  // 砝码（金色，竖直堆叠挂在挂钩下，每个 100g）
  const HW = 46
  const HH = 16
  const GAP = 19
  for (let i = 0; i < HOOKS.value; i++) {
    const y = botY + 12 + i * GAP
    ctx.fillStyle = '#ffd166'
    ctx.strokeStyle = '#8a5d1a'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(cx - HW / 2, y, HW, HH, 4)
    ctx.fill(); ctx.stroke()
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.roundRect(cx - HW / 2 + 4, y + 2, HW - 8, 3, 1.5)
    ctx.fill()
    // 中部刻痕
    ctx.strokeStyle = '#8a5d1a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx - HW / 2 + 6, y + HH / 2)
    ctx.lineTo(cx + HW / 2 - 6, y + HH / 2)
    ctx.stroke()
    // 质量标注（白字深描边）
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('100g', cx, y + HH / 2 + 0.5)
  }

  // 读数标注（指针右侧，显示重力）
  ctx.fillStyle = '#d92135'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`重力 G = ${G.value.toFixed(1)} N`, winX + winW + 22, Math.min(py + 8, ylim + 12))

  if (overLimit.value) {
    ctx.fillStyle = '#d23b3b'
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('超过弹性限度！换用更大量程的测力计', W / 2, H - 18)
  }
}

function loop() {
  render()
  raf = requestAnimationFrame(loop)
}
function resizeCanvas() {
  if (!canvasRef.value) return
  setupCanvas()
  render()
}

let resizeObs = null
onMounted(() => {
  setupCanvas()
  render()
  if (window.ResizeObserver) {
    resizeObs = new ResizeObserver(resizeCanvas)
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
      <div class="lab-panel" style="padding: 0">
        <canvas
          ref="canvasRef"
          style="display: block; width: 100%; height: 520px; background: transparent; border-radius: 8px"
        ></canvas>
      </div>
      <div class="lab-actions">
        <span class="feedback ok">把钩码挂在弹簧测力计上，静止时示数 = 重力 G；改变钩码个数改变质量 m，记录多组 (m, G) 探究关系</span>
        <FullscreenBtn />
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>钩码质量（已知质量）</strong><span>每个 100g</span></div>
        <div class="lab-params" style="padding: 8px 12px">
          <div class="param-group">
            <span>钩码数量（改变质量）</span>
            <div class="hook-btns">
              <button v-for="n in [0, 1, 2, 3, 4, 5]" :key="n" class="btn btn-sm" :class="{ 'btn-primary': HOOKS === n }" @click="HOOKS = n">
                {{ n }} 个
              </button>
            </div>
            <p style="font-size: 11px; color: var(--text-dim)">
              质量 m = {{ m.toFixed(1) }} kg，重力 G = m·g = {{ G.toFixed(1) }} N
            </p>
          </div>
        </div>
      </div>

      <!-- 实验记录表 -->
      <div class="lab-panel">
        <div class="lab-panel-head">
          <strong>实验记录表</strong>
          <span>{{ records.length }} 组</span>
        </div>
        <div class="record-actions">
          <button class="btn btn-sm btn-primary" @click="recordRow">＋ 记录本次数据</button>
          <button class="btn btn-sm" @click="clearRecords" :disabled="records.length === 0">清空</button>
        </div>
        <table class="record-table" v-if="records.length">
          <thead>
            <tr><th>#</th><th>质量 m (kg)</th><th>重力 G (N)</th><th>G/m (N/kg)</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in records" :key="r.id">
              <td>{{ r.id }}</td>
              <td>{{ r.m }}</td>
              <td>{{ r.G }}</td>
              <td>{{ (r.G / r.mKg).toFixed(1) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="record-empty">选择钩码数后点「记录本次数据」</div>
        <!-- 结论 -->
        <div class="record-concl" v-if="conclusion.length">
          <div class="concl-title">📌 结论</div>
          <p v-for="(c, i) in conclusion" :key="i">{{ c }}</p>
        </div>
      </div>

      <FormulaPanel
        title="重力与质量"
        formula="G = m · g"
        :rows="[
          { label: '质量 m（钩码）', value: m.toFixed(1) + ' kg' },
          { label: 'g', value: G_CONST + ' N/kg' }
        ]"
        :result="[{ label: '重力 G = mg', value: G.toFixed(1) + ' N' }]"
        :verify="[
          '把物体挂在弹簧测力计上，静止时测力计示数 = 物体重力大小',
          '改变钩码个数改变质量 m，记录每组 (m, G)',
          '各组 G/m 恒为 g → 重力与质量成正比：G = m·g'
        ]"
      />
    </aside>
  </div>
</template>

<style scoped>
.hook-btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

/* 实验记录表 */
.record-actions {
  display: flex;
  gap: 8px;
  padding: 10px 12px 4px;
}
.record-table {
  width: 100%;
  margin-top: 6px;
  border-collapse: collapse;
  font-size: 12px;
}
.record-table th,
.record-table td {
  padding: 6px 8px;
  border: 1px solid var(--line);
  text-align: center;
}
.record-table th {
  background: var(--surface-3);
  font-weight: 800;
}
.record-empty {
  padding: 14px 12px;
  font-size: 12px;
  color: var(--text-dim);
  text-align: center;
}
.record-concl {
  margin: 10px 12px 12px;
  padding: 10px 12px;
  border: 2px dashed var(--success);
  border-radius: var(--radius-sm);
  background: var(--success-bg);
  font-size: 12px;
  color: var(--text-h);
}
.concl-title {
  font-weight: 800;
  margin-bottom: 4px;
}
.record-concl p {
  line-height: 1.7;
}
</style>
