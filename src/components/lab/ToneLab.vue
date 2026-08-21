<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'
import { createTone } from '../../lib/audio'
import { paintBoard } from '../../lib/boardBg'
import FullscreenBtn from './FullscreenBtn.vue'

const emit = defineEmits(['complete'])

const canvasRef = ref(null)
let ctx = null
let raf = null
let dpr = 1
let flickerT = 0

const W = 860
const H = 400

const freq = ref(440)
const amp = ref(70)
const instrument = ref('tuning')

const INST = {
  tuning: { label: '音叉', harm: [1] },
  piano: { label: '钢琴', harm: [1, 0.45, 0.25, 0.12] },
  flute: { label: '长笛', harm: [1, 0.28, 0.12] }
}

const seen = { freq: false, amp: false, timbre: false }
let completed = false

// 音效
const muted = ref(false)
const playing = ref(false)
let tone = null

const INST_HARM = { tuning: [1], piano: [1, 0.45, 0.25, 0.12], flute: [1, 0.28, 0.12] }

const hint = ref('调节频率与振幅，再切换乐器，观察波形变化')

const pitch = computed(() =>
  freq.value >= 700 ? '高音（尖细）' : freq.value <= 150 ? '低音（低沉）' : '中音'
)
const loudness = computed(() =>
  amp.value >= 70 ? '响（震耳欲聋）' : amp.value >= 35 ? '适中' : '轻（轻声细语）'
)
const period = computed(() => 1 / freq.value)
const wavelength = computed(() => 340 / freq.value)

function startTone() {
  tone?.stop()
  if (muted.value) {
    tone = null
    return
  }
  tone = createTone({
    freq: freq.value,
    volume: 0.04 + (amp.value / 100) * 0.32,
    harmonics: INST_HARM[instrument.value]
  })
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) startTone()
  else {
    tone?.stop()
    tone = null
  }
}

function toggleMute() {
  muted.value = !muted.value
  if (muted.value) {
    tone?.stop()
    tone = null
  } else if (playing.value) {
    startTone()
  }
}

watch(freq, () => {
  if (freq.value !== 440) seen.freq = true
  if (tone) tone.setFreq(freq.value)
  tryComplete()
})
watch(amp, () => {
  if (amp.value !== 70) seen.amp = true
  if (tone) tone.setVolume(0.04 + (amp.value / 100) * 0.32)
  tryComplete()
})
watch(instrument, () => {
  if (instrument.value !== 'tuning') seen.timbre = true
  if (tone) startTone()
  tryComplete()
})

function tryComplete() {
  const done = seen.freq && seen.amp && seen.timbre
  if (done && !completed) {
    completed = true
    hint.value = '音调=频率(疏密)、响度=振幅(高低)、音色=波形形状 —— 实验完成！'
    emit('complete')
  } else if (!done) {
    const parts = []
    if (!seen.freq) parts.push('调频率')
    if (!seen.amp) parts.push('调振幅')
    if (!seen.timbre) parts.push('切乐器')
    hint.value = '继续探索：' + parts.join('、')
  }
}

function reset() {
  freq.value = 440
  amp.value = 70
  instrument.value = 'tuning'
  seen.freq = seen.amp = seen.timbre = false
  tone?.stop()
  tone = null
  playing.value = false
  hint.value = '调节频率与振幅，再切换乐器，观察波形变化'
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

const C = {
  bg0: '#0a0d14',
  bg1: '#0e1320',
  grid: 'rgba(140,165,210,0.09)',
  axis: 'rgba(150,170,210,0.4)',
  trace: '#4ade80',
  traceDim: '#2d8a52',
  accent: '#ff3b4d',
  text: '#c9d1d9',
  muted: '#7d8794'
}

function drawWave() {
  const cycles = Math.min(24, Math.max(2, freq.value / 100))
  const k = (2 * Math.PI * cycles) / W
  const harm = INST[instrument.value].harm
  const norm = harm.reduce((a, b) => a + b, 0)
  const ampPx = (amp.value / 100) * H * 0.36
  const centerY = H / 2 + 14
  const phase = flickerT * 0.05

  ctx.save()
  ctx.shadowColor = C.trace
  ctx.shadowBlur = 8
  ctx.strokeStyle = C.trace
  ctx.lineWidth = 2.5
  ctx.beginPath()
  for (let x = 0; x <= W; x += 2) {
    let y = 0
    for (let i = 0; i < harm.length; i++) {
      y += (harm[i] / norm) * Math.sin(k * x * (i + 1) - phase * (i + 1) * 0.9)
    }
    const py = centerY - y * ampPx
    if (x === 0) ctx.moveTo(x, py)
    else ctx.lineTo(x, py)
  }
  ctx.stroke()
  ctx.restore()

  // 音调疏密对比参考线（每周期一格）
  ctx.strokeStyle = 'rgba(225,238,228,0.5)'
  ctx.lineWidth = 1
  for (let i = 0; i <= cycles; i++) {
    const gx = (i / cycles) * W
    ctx.beginPath()
    ctx.moveTo(gx, centerY - 30)
    ctx.lineTo(gx, centerY + 30)
    ctx.stroke()
  }
}

function render() {
  if (!ctx) return
  paintBoard(ctx, W, H, 'chalk')

  // 中轴线
  ctx.strokeStyle = 'rgba(225,238,228,0.5)'
  ctx.setLineDash([6, 5])
  ctx.beginPath()
  ctx.moveTo(0, H / 2 + 14)
  ctx.lineTo(W, H / 2 + 14)
  ctx.stroke()
  ctx.setLineDash([])

  drawWave()

  // 顶栏信息
  ctx.textAlign = 'left'
  ctx.fillStyle = C.text
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText(`示波器 · ${INST[instrument.value].label}`, 30, 34)
  ctx.fillStyle = C.trace
  ctx.font = '600 13px sans-serif'
  ctx.fillText(`f = ${freq.value} Hz　T = ${period.value.toFixed(4)} s　λ = ${wavelength.value.toFixed(2)} m`, 30, 58)
  ctx.fillStyle = C.accent
  ctx.fillText(`音调：${pitch.value}　·　响度：${loudness.value}`, 30, 82)
  ctx.fillStyle = C.muted
  ctx.font = '12px sans-serif'
  ctx.fillText('波形疏密 → 音调（频率）　波形高低 → 响度（振幅）　波形形状 → 音色', 30, 104)
}

function loop() {
  flickerT += 1
  render()
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  setupCanvas()
  if (window.ResizeObserver) {
    resizeObs = new ResizeObserver(() => resizeCanvas())
    resizeObs.observe(canvasRef.value.parentElement)
  }
  raf = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (resizeObs) resizeObs.disconnect()
  tone?.stop()
  tone = null
})
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel" style="padding:0">
        <canvas ref="canvasRef" style="display:block;width:100%"></canvas>
      </div>

      <div class="lab-actions">
        <button
          v-for="(inst, key) in INST"
          :key="key"
          class="btn"
          :class="{ 'btn-primary': instrument === key }"
          @click="instrument = key"
        >{{ inst.label }}</button>
        <button class="btn btn-primary" @click="togglePlay">{{ playing ? '停止' : '播放音效' }}</button>
        <button class="btn" :class="{ 'btn-primary': muted }" @click="toggleMute">{{ muted ? '静音' : '音效开' }}</button>
        <button class="btn" @click="reset">重置</button>
        <span class="feedback" :class="completed ? 'ok' : 'no'">{{ hint }}</span>
        <FullscreenBtn />
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
            v-model="freq"
            :min="100"
            :max="2000"
            :step="10"
            label="频率 f"
            unit=" Hz"
            hint="频率越高音调越高，波形越密"
          />
          <ParamSlider
            v-model="amp"
            :min="10"
            :max="100"
            :step="5"
            label="振幅 A"
            unit=" %"
            hint="振幅越大响度越大，波形越高"
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
            <span>频率 f</span>
            <strong>{{ freq }} Hz</strong>
          </div>
          <div class="lab-stat accent">
            <span>周期 T = 1/f</span>
            <strong>{{ period.toFixed(4) }} s</strong>
          </div>
          <div class="lab-stat">
            <span>波长 λ = 340/f</span>
            <strong>{{ wavelength.toFixed(2) }} m</strong>
          </div>
          <div class="lab-stat success">
            <span>音调 / 响度</span>
            <strong style="font-size:12px">{{ pitch }} / {{ loudness }}</strong>
          </div>
        </div>
      </div>

      <FormulaPanel
        title="声音的特性（三要素）"
        formula="T = 1/f　　λ = v/f"
        desc="音调由频率决定（波形疏密），响度由振幅决定（波形高低），音色由波形形状决定。"
        :rows="[
          { label: '人耳听觉范围', value: '20 ~ 20000 Hz' },
          { label: '超声波', value: '> 20000 Hz' },
          { label: '次声波', value: '< 20 Hz' }
        ]"
        :result="[
          { label: '当前频率', value: freq + ' Hz' },
          { label: '当前波长', value: wavelength.toFixed(2) + ' m' }
        ]"
        :verify="[
          '音调：频率越高音调越高——“男低音女高音”指音调',
          '响度：振幅越大响度越大——“引吭高歌、低声细语”指响度',
          '音色：材料、结构不同，波形形状不同——“闻其声知其人”',
          '超声/次声也是声，只是人耳听不见；同介质中传播速度与普通声波相同'
        ]"
      />
    </aside>
  </div>
</template>
