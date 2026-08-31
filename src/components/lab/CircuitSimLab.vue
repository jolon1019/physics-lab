<script setup>
// 电路模拟互动实验（自由搭建版）：实物图元件库 + 自由搭建台 + 自动生成电路图。
// 状态全部由 useCircuitStore 统一管理；本组件只负责布局、工具栏与读数呈现。
import { computed, defineEmits, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCircuitStore } from '../../stores/circuit'
import ComponentPalette from './ComponentPalette.vue'
import CircuitBuildCanvas from './CircuitBuildCanvas.vue'
import CircuitSchematic from './CircuitSchematic.vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])
const store = useCircuitStore()

const showSchematic = ref(false)
function openSchematic() {
  showSchematic.value = true
}
function closeSchematic() {
  showSchematic.value = false
}

const SCENARIOS = [
  { key: 'series', label: '串联电路' },
  { key: 'parallel', label: '并联电路' },
  { key: 'rheostat', label: '滑动变阻器' },
  { key: 'ohm', label: '欧姆定律' },
  { key: 'free', label: '自由搭建' }
]

const selectedComp = computed(() => (store.selectedId ? store.compById(store.selectedId) : null))

function bulbs() {
  return store.components.filter((c) => c.type === 'bulb').map((c) => store.readouts[c.id]).filter(Boolean)
}
function meters(kind) {
  return store.components.filter((c) => c.type === kind).map((c) => ({ c, r: store.readouts[c.id] }))
}

const fp = computed(() => {
  const batt = store.components.find((c) => c.type === 'battery')
  const battI = batt ? store.readouts[batt.id]?.I || 0 : 0
  const sc = store.scenario
  const bs = bulbs()
  if (sc === 'series')
    return {
      title: '串联电路规律',
      formula: 'I = I₁ = I₂　U = U₁ + U₂',
      rows: [
        { label: '总电流 I', value: battI.toFixed(2) + ' A' },
        { label: '灯泡数', value: String(bs.length) }
      ],
      result: [{ label: '各灯泡电流', value: bs.length ? bs.map((b) => b.I.toFixed(2)).join(' = ') + ' A' : '—' }],
      verify: ['串联电路电流处处相等', '总电压 = 各用电器两端电压之和']
    }
  if (sc === 'parallel')
    return {
      title: '并联电路规律',
      formula: 'I = I₁ + I₂　U = U₁ = U₂',
      rows: [
        { label: '支路1电流 I₁', value: (bs[0] ? bs[0].I.toFixed(2) : '0') + ' A' },
        { label: '支路2电流 I₂', value: (bs[1] ? bs[1].I.toFixed(2) : '0') + ' A' }
      ],
      result: [{ label: '干路电流 I = I₁+I₂', value: battI.toFixed(2) + ' A' }],
      verify: ['并联干路电流 = 各支路电流之和', '各支路两端电压都等于电源电压']
    }
  if (sc === 'rheostat')
    return {
      title: '滑动变阻器改变电流',
      formula: 'I = U / (R灯 + R滑)',
      rows: [
        { label: '电源电压 U', value: store.sourceVoltage.toFixed(1) + ' V' },
        { label: '接入阻值 R滑', value: (selectedComp.value && selectedComp.value.type === 'rheostat' ? (selectedComp.value.params.frac * 20).toFixed(0) : '—') + ' Ω' }
      ],
      result: [
        { label: '电流 I', value: battI.toFixed(2) + ' A' },
        { label: '灯泡功率 P=UI', value: bs.length ? bs[0].P.toFixed(2) + ' W' : '—' }
      ],
      verify: ['滑片使接入电阻变大 → 电流变小 → 灯泡变暗', '这是欧姆定律 I=U/R 的直接应用']
    }
  return {
    title: '欧姆定律',
    formula: 'I = U / R',
    rows: [
      { label: '电压 U', value: store.sourceVoltage.toFixed(1) + ' V' },
      { label: '电阻 R', value: (selectedComp.value && (selectedComp.value.type === 'bulb' || selectedComp.value.type === 'resistor') ? selectedComp.value.params.R : 10) + ' Ω' }
    ],
    result: [{ label: '电流 I = U/R', value: battI.toFixed(2) + ' A' }],
    verify: ['电阻一定时，电流与电压成正比', '电压一定时，电流与电阻成反比']
  }
})

let completed = false
watch(
  () => store.status.closed && store.maxCurrent,
  (closed, _o, _n) => {
    const m = store.maxCurrent
    if (!completed && store.status.closed && m > 0.05) {
      completed = true
      emit('complete')
    }
  }
)

watch(
  () => store.scenario,
  () => store.loadScene(store.scenario)
)

function onKey(e) {
  if (e.key === 'Escape') showSchematic.value = false
}
onMounted(() => {
  store.loadScene('series')
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  completed = false
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="sim" :class="{ 'is-free': store.scenario === 'free' }">
    <!-- 左：元件库 -->
    <aside class="col-left">
      <ComponentPalette />
    </aside>

    <!-- 中：搭建台 + 工具栏 + 自动电路图 -->
    <section class="col-center">
      <div class="seg">
        <button v-for="sc in SCENARIOS" :key="sc.key" class="chip" :class="{ on: store.scenario === sc.key }" @click="store.scenario = sc.key">
          {{ sc.label }}
        </button>
        <span class="seg-sep"></span>
        <button class="chip schem-btn" @click="openSchematic">电路图</button>
      </div>

      <CircuitBuildCanvas />

      <div class="sim-tools">
        <button class="tool" :class="{ on: store.running }" @click="store.running = !store.running">
          {{ store.running ? '暂停' : '运行' }}
        </button>
        <button class="tool" @click="store.clear()">清空</button>
      </div>
      <p class="conn-hint">连线：依次单击两个元件的接线柱即可连通；右键单击电线可删除；点选元件后可用虚线框旁的按钮旋转或删除。</p>

      <p v-if="store.status.msg" class="sim-msg" :class="{ short: store.status.short }">{{ store.status.msg }}</p>
    </section>

    <!-- 右：参数 + 公式 + 读数（自由搭建场景下整体隐藏，画布占满宽度） -->
    <aside class="col-right" v-if="store.scenario !== 'free'">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>可调变量</strong><span>实时计算</span></div>
        <ParamSlider :model-value="store.sourceVoltage" :min="1.5" :max="12" :step="0.5" :precision="1" label="电源电压 U" unit=" V" @update:modelValue="store.setVoltage" />
        <template v-if="selectedComp && selectedComp.type === 'rheostat'">
          <ParamSlider
            :model-value="selectedComp.params.frac"
            :min="0"
            :max="1"
            :step="0.05"
            :precision="2"
            label="滑片位置（接入比例）"
            unit=""
            @update:modelValue="(v) => store.setParam(selectedComp.id, 'frac', v)"
          />
        </template>
        <template v-if="selectedComp && (selectedComp.type === 'bulb' || selectedComp.type === 'resistor')">
          <ParamSlider
            :model-value="selectedComp.params.R"
            :min="2"
            :max="40"
            :step="1"
            :precision="0"
            :label="'选中' + (selectedComp.type === 'bulb' ? '灯泡' : '电阻') + '阻值'"
            unit=" Ω"
            @update:modelValue="(v) => store.setParam(selectedComp.id, 'R', v)"
          />
        </template>
        <p v-if="!selectedComp" class="empty">点选画布中的元件可在此调节其参数</p>
      </div>

      <FormulaPanel :title="fp.title" :formula="fp.formula" :rows="fp.rows" :result="fp.result" :verify="fp.verify" />

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>测量读数</strong><span>仿真结果</span></div>
        <div class="meters">
          <div v-if="store.components.find((c) => c.type === 'battery')" class="meter">
            <span>电源电流 I</span><strong>{{ (store.readouts[store.components.find((c) => c.type === 'battery').id]?.I || 0).toFixed(2) }} A</strong>
          </div>
          <div v-for="(b, i) in bulbs()" :key="'bulb' + i" class="meter">
            <span>灯泡</span><strong>I={{ b.I.toFixed(2) }}A · U={{ b.U.toFixed(2) }}V · P={{ b.P.toFixed(2) }}W</strong>
          </div>
          <div v-for="a in meters('ammeter')" :key="a.c.id" class="meter">
            <span>电流表</span><strong>{{ (a.r?.reading || '0.00A') }}</strong>
          </div>
          <div v-for="v in meters('voltmeter')" :key="v.c.id" class="meter">
            <span>电压表</span><strong>{{ (v.r?.reading || '0.00V') }}</strong>
          </div>
          <p v-if="!store.components.length" class="empty">从左侧拖入元件开始搭建</p>
        </div>
      </div>
    </aside>
  </div>

  <!-- 电路图弹窗：点击「电路图」按钮（自由搭建旁）打开 -->
  <div v-if="showSchematic" class="modal-mask" @click.self="closeSchematic">
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-head">
        <strong>电路图</strong>
        <button class="modal-x" aria-label="关闭" @click="closeSchematic">✕</button>
      </div>
      <div class="modal-body">
        <CircuitSchematic />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sim {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr) 340px;
  gap: 14px;
  align-items: start;
}
/* 自由搭建：右栏整体隐藏，搭建台占满剩余宽度 */
.sim.is-free {
  grid-template-columns: 210px minmax(0, 1fr);
}
.col-left,
.col-right {
  position: sticky;
  top: 12px;
  max-height: calc(100vh - 24px);
  overflow: auto;
}
.schem-btn {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.schem-btn:hover {
  filter: brightness(1.06);
}
.seg-sep {
  width: 1px;
  height: 24px;
  background: var(--line);
  margin: 0 2px;
}
.col-center {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  border: 2px solid var(--line);
  background: var(--surface);
  color: var(--text-h);
  font-weight: 700;
  font-size: 13px;
  padding: 7px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.chip.on {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.sim-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.tool {
  border: 2px solid var(--line);
  background: var(--surface);
  color: var(--text-h);
  font-weight: 600;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.tool.on {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.conn-hint {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px dashed var(--line);
  border-radius: 8px;
  padding: 7px 10px;
  margin: 0;
  line-height: 1.5;
}
.sim-msg {
  font-size: 13px;
  font-weight: 700;
  color: var(--warning);
  background: var(--warning-bg);
  border: 1px solid var(--warning);
  padding: 7px 10px;
  border-radius: 8px;
}
.sim-msg.short {
  color: var(--danger);
  background: var(--danger-bg);
  border-color: var(--danger);
}
.meters {
  display: grid;
  gap: 6px;
  padding: 8px 12px;
}
.meter {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--surface-2);
}
.meter strong {
  font-family: var(--mono);
  color: var(--accent);
}
.empty {
  font-size: 12px;
  color: var(--text-dim);
  padding: 6px 0;
}

/* 电路图弹窗 */
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(6, 9, 13, 0.66);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.modal-card {
  width: min(820px, 94vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  color: var(--text-h);
  font-size: 15px;
}
.modal-x {
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.modal-x:hover {
  color: var(--danger);
}
.modal-body {
  padding: 14px;
  overflow: auto;
}
.modal-body :deep(.schem-svg) {
  width: 100%;
  height: auto;
  border-color: var(--line);
}

/* 响应式：窄屏时单栏堆叠，元件库移到顶部并横向排列 */
@media (max-width: 1080px) {
  .sim {
    grid-template-columns: 1fr;
  }
  .col-left,
  .col-right {
    position: static;
    max-height: none;
    overflow: visible;
  }
  .col-left :deep(.pal-grid) {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 560px) {
  .col-left :deep(.pal-grid) {
    grid-template-columns: repeat(3, 1fr);
  }
  .chip {
    font-size: 12px;
    padding: 6px 9px;
  }
}
</style>
