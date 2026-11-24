<script setup>
// 全屏试卷预览模态框：双模式 —— 「原卷」PDF.js 扫描渲染（翻页/缩放），
// 「重排版」按试卷版式重排题库单题（题干/选项/表格/重绘配图），支持定位到页首题
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { QUESTIONS } from '../data/questionBank'
import { PAPER_EXTRAS } from '../data/paperExtras'
import PaperQuestion from './PaperQuestion.vue'

const props = defineProps({
  title: { type: String, default: '试卷预览' },
  // 原卷 PDF 地址：已不再托管原卷，留空则直接进「重排版」题目视图
  url: { type: String, default: '' },
  paperId: { type: String, default: '' },
  startPage: { type: Number, default: 1 }
})
const emit = defineEmits(['close'])

const hasPdf = computed(() => !!props.url)

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

const mode = ref(hasPdf.value ? 'pdf' : 'text')
const loading = ref(true)
const error = ref('')
const pageNum = ref(props.startPage)
const totalPages = ref(0)
const scale = ref(1.2)
const wrap = ref(null)
const canvasEl = ref(null)
const highlightId = ref('')
const sideQ = ref(null) // 右侧单题查看面板当前题目

// 重排版元数据：未登记的试卷不显示切换按钮
const retypeset = computed(() => (props.paperId ? PAPER_EXTRAS[props.paperId]?.retypeset : null))
const paperQuestions = computed(() =>
  QUESTIONS.filter((q) => q.paperId === props.paperId).slice().sort((a, b) => a.number - b.number)
)
// 按大题切分组（from/to 为题库题目 id）
const groups = computed(() => {
  if (!retypeset.value) return []
  const list = paperQuestions.value
  return retypeset.value.sections.map((s) => {
    const i = list.findIndex((q) => q.id === s.from)
    const j = list.findIndex((q) => q.id === s.to)
    return { title: s.title, items: i >= 0 && j >= 0 ? list.slice(i, j + 1) : [] }
  })
})

let pdfDoc = null
let renderTask = null
let dpr = 1
let hlTimer = null

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = () => reject(new Error('load failed'))
    document.head.appendChild(s)
  })
}

async function renderPage() {
  if (!pdfDoc || !canvasEl.value) return
  if (renderTask) renderTask.cancel()
  const page = await pdfDoc.getPage(pageNum.value)
  const base = page.getViewport({ scale: 1 })
  // 首次渲染按容器宽度自适应（不超过原尺寸 1.6 倍）
  if (!scale.value) {
    const w = wrap.value.clientWidth - 48
    scale.value = Math.min(1.6, Math.max(0.5, w / base.width))
  }
  const viewport = page.getViewport({ scale: scale.value * dpr })
  const canvas = canvasEl.value
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.style.width = viewport.width / dpr + 'px'
  canvas.style.height = viewport.height / dpr + 'px'
  const ctx = canvas.getContext('2d')
  renderTask = page.render({ canvasContext: ctx, viewport })
  try {
    await renderTask.promise
  } catch (e) {
    /* 取消渲染（连续翻页/缩放）属正常情况 */
  }
}

async function go(p) {
  if (!pdfDoc) return
  pageNum.value = Math.min(Math.max(1, p), totalPages.value)
  await renderPage()
}
function prev() { go(pageNum.value - 1) }
function next() { go(pageNum.value + 1) }
async function zoom(d) {
  scale.value = Math.min(3, Math.max(0.5, (scale.value || 1.2) + d))
  await renderPage()
}

// 定位到来源页对应的第一个题目并短暂高亮
async function focusStartQuestion() {
  await nextTick()
  const first = paperQuestions.value.find((q) => q.page === props.startPage)
  if (!first) return
  const el = document.getElementById(first.id)
  if (el) {
    el.scrollIntoView({ block: 'start' })
    highlightId.value = first.id
    clearTimeout(hlTimer)
    hlTimer = setTimeout(() => (highlightId.value = ''), 1800)
  }
}

// 切到重排版：滚动到来源页对应的第一个题目并短暂高亮
async function switchMode(m) {
  if (mode.value === m) return
  if (m === 'pdf' && !hasPdf.value) return
  mode.value = m
  if (m !== 'text') { sideQ.value = null; return }
  await focusStartQuestion()
}

function onKey(e) {
  if (e.key === 'Escape') {
    if (sideQ.value && mode.value === 'text') sideQ.value = null
    else emit('close')
  }
  else if (mode.value === 'pdf' && e.key === 'ArrowLeft') prev()
  else if (mode.value === 'pdf' && e.key === 'ArrowRight') next()
}

// 点击题目：右侧单独打开该题；再点同一题收起
function toggleSide(q) {
  sideQ.value = sideQ.value && sideQ.value.id === q.id ? null : q
}

onMounted(async () => {
  dpr = window.devicePixelRatio || 1
  window.addEventListener('keydown', onKey)
  // 无原卷时直接展示重排版题目，不再请求 PDF
  if (!hasPdf.value) {
    loading.value = false
    await focusStartQuestion()
    return
  }
  try {
    if (!window.pdfjsLib) await loadScript(PDFJS)
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER
    pdfDoc = await window.pdfjsLib.getDocument(props.url).promise
    totalPages.value = pdfDoc.numPages
    loading.value = false
    await nextTick()
    await go(props.startPage)
  } catch (e) {
    loading.value = false
    error.value = /load failed/.test(e?.message || '')
      ? '预览组件加载失败（可能被浏览器插件拦截），请直接点「下载」获取试卷。'
      : '试卷文件加载失败，请稍后重试或使用「下载」。'
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(hlTimer)
  if (renderTask) renderTask.cancel()
  if (pdfDoc) pdfDoc.destroy()
})
</script>

<template>
  <div class="pv-mask" @click.self="emit('close')">
    <div class="pv-box" role="dialog" aria-modal="true" :aria-label="title">
      <header class="pv-head">
        <div class="pv-head-text">
          <strong class="pv-title">{{ title }}</strong>
          <span v-if="mode === 'pdf' && totalPages" class="pv-pageinfo">第 {{ pageNum }} / {{ totalPages }} 页</span>
        </div>
        <div class="pv-tools">
          <div v-if="retypeset && hasPdf" class="pv-mode">
            <button class="pv-tab" :class="{ on: mode === 'pdf' }" @click="switchMode('pdf')">原卷</button>
            <button class="pv-tab" :class="{ on: mode === 'text' }" @click="switchMode('text')">重排版</button>
          </div>
          <template v-if="mode === 'pdf'">
            <button class="pv-btn" title="缩小" @click="zoom(-0.25)">－</button>
            <button class="pv-btn" title="放大" @click="zoom(0.25)">＋</button>
            <button class="pv-btn" title="适应宽度" @click="scale = 0; renderPage()">适应</button>
          </template>
          <button class="pv-btn close" title="关闭 (Esc)" @click="emit('close')">×</button>
        </div>
      </header>

      <div ref="wrap" class="pv-body" :class="{ 'text-mode': mode === 'text' }">
        <p v-if="mode === 'pdf' && loading" class="pv-tip">正在加载试卷…</p>
        <p v-else-if="mode === 'pdf' && error" class="pv-tip err">{{ error }}</p>
        <!-- canvas 常驻 DOM（v-show 控制），切模式来回不销毁位图，避免出现空白小方块 -->
        <canvas v-show="mode === 'pdf' && !loading && !error" ref="canvasEl" class="pv-canvas"></canvas>
        <div v-if="mode === 'text'" class="pv-retypeset">
          <div class="pv-paper-col">
            <div class="pv-paper">
              <h2 class="pv-paper-title">{{ retypeset.title }}</h2>
              <p class="pv-paper-sub">{{ retypeset.subtitle }}</p>
              <template v-for="g in groups" :key="g.title">
                <h3 class="pv-section">{{ g.title }}</h3>
                <div
                  v-for="q in g.items"
                  :key="q.id"
                  class="pq-click"
                  :class="{ sel: sideQ && sideQ.id === q.id, 'pq-hl': q.id === highlightId }"
                  title="点击在右侧单独查看本题"
                  @click="toggleSide(q)"
                >
                  <PaperQuestion :question="q" />
                </div>
              </template>
            </div>
          </div>
          <aside v-if="sideQ" class="pv-side">
            <header class="pv-side-head">
              <strong>第 {{ sideQ.number }} 题 · 单题查看</strong>
              <button class="pv-side-close" title="收起 (Esc)" @click="sideQ = null">×</button>
            </header>
            <div class="pv-side-body">
              <PaperQuestion :question="sideQ" />
            </div>
          </aside>
        </div>
      </div>

      <button
        v-if="mode === 'pdf' && totalPages > 1 && !loading && !error"
        class="pv-nav left" title="上一页 (←)" :disabled="pageNum <= 1" @click="prev">‹</button>
      <button
        v-if="mode === 'pdf' && totalPages > 1 && !loading && !error"
        class="pv-nav right" title="下一页 (→)" :disabled="pageNum >= totalPages" @click="next">›</button>
    </div>
  </div>
</template>

<style scoped>
.pv-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(5, 5, 5, 0.72);
}
.pv-box {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1060px, 100%);
  height: min(100%, 100%);
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--radius);
  box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.pv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 2px solid var(--line);
  background: var(--surface-3);
}
.pv-head-text {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.pv-title {
  font-size: 14px;
  font-weight: 900;
  color: var(--text-h);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-pageinfo {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-dim);
}
.pv-tools {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
  align-items: center;
}
.pv-mode {
  display: flex;
  margin-right: 6px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.pv-tab {
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-h);
  background: var(--surface);
  border: 0;
}
.pv-tab + .pv-tab {
  border-left: 2px solid var(--line);
}
.pv-tab.on {
  color: #fff;
  background: var(--accent);
}
.pv-btn {
  min-width: 34px;
  padding: 5px 10px;
  font-size: 14px;
  font-weight: 800;
  color: var(--text-h);
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  transition: background 0.12s ease;
}
.pv-btn:hover {
  background: var(--accent-soft);
}
.pv-btn.close {
  color: #fff;
  background: var(--accent);
  border-color: var(--line);
}
.pv-btn.close:hover {
  background: var(--accent-strong);
}
.pv-body {
  flex: 1;
  overflow: auto;
  display: flex;
  justify-content: center;
  padding: 20px 24px;
  background:
    repeating-linear-gradient(45deg, transparent 0 14px, rgba(0, 0, 0, 0.025) 14px 28px),
    var(--surface-2);
}
.pv-canvas {
  align-self: flex-start;
  background: #fff;
  border: 2px solid var(--line);
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.2);
}
.pv-tip {
  align-self: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-dim);
}
.pv-tip.err {
  color: var(--danger);
}

/* 重排版：左试卷版面 + 右侧单题面板 */
.pv-body.text-mode {
  overflow: hidden;
  padding-bottom: 14px;
}
.pv-retypeset {
  display: flex;
  gap: 16px;
  width: 100%;
  min-height: 0;
}
.pv-paper-col {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  display: flex;
  justify-content: center;
}
.pq-click {
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.12s ease;
}
.pq-click:hover {
  background: #f7f7f1;
}
.pq-click.sel {
  background: #eef4ff;
  outline: 2px solid var(--accent);
}
.pv-side {
  flex: 0 0 380px;
  align-self: stretch;
  overflow: auto;
  background: #fff;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.2);
}
.pv-side-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  background: var(--surface-3);
  border-bottom: 2px solid var(--line);
}
.pv-side-head strong {
  font-size: 13px;
  font-weight: 900;
}
.pv-side-close {
  min-width: 28px;
  padding: 3px 8px;
  font-size: 14px;
  font-weight: 800;
  color: #fff;
  background: var(--accent);
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
}
.pv-side-body {
  padding: 4px 16px 20px;
}
.pv-paper {
  align-self: flex-start;
  width: min(760px, 100%);
  padding: 34px 40px 44px;
  background: #fff;
  border: 2px solid var(--line);
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.2);
}
.pv-paper-title {
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  text-align: center;
  color: #111;
}
.pv-paper-sub {
  margin: 6px 0 4px;
  font-size: 13px;
  text-align: center;
  color: #333;
}
.pv-section {
  margin: 18px 0 0;
  font-size: 14.5px;
  font-weight: 900;
  color: #111;
}
.pv-retypeset :deep(.pq-hl) {
  background: #fff3bf;
  outline: 2px solid var(--amber, #e8a80c);
  border-radius: 4px;
}

.pv-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 56px;
  font-size: 26px;
  font-weight: 900;
  line-height: 1;
  color: var(--text-h);
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.25);
}
.pv-nav:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.pv-nav.left { left: 10px; }
.pv-nav.right { right: 10px; }

@media (max-width: 900px) {
  .pv-side {
    position: absolute;
    top: 12px;
    right: 12px;
    bottom: 12px;
    width: min(420px, 92%);
    z-index: 6;
  }
}
@media (max-width: 720px) {
  .pv-mask { padding: 8px; }
  .pv-title { font-size: 12px; }
  .pv-btn { min-width: 30px; padding: 4px 8px; font-size: 12px; }
  .pv-body { padding: 12px 10px; }
  .pv-nav { width: 34px; height: 44px; font-size: 20px; }
  .pv-paper { padding: 20px 16px 28px; }
}
</style>
