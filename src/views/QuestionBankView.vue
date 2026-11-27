<script setup>
// 中心化题库：按题型 / 难度 / 章节归类 + 知识点检索，题目与原试卷双向关联
// 「预览试卷」跳回资料库并自动打开重排版题目预览，定位到该题所在页首题
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { DIFFICULTIES, QUESTIONS, QUESTION_TYPES, fmtMath } from '../data/questionBank'
import { PAPER_EXTRAS } from '../data/paperExtras'

const router = useRouter()
// 只有登记了重排版题目的试卷才给「预览试卷」入口（不再托管原卷 PDF）
const hasSource = (q) => !!PAPER_EXTRAS[q.paperId]?.retypeset

const activeType = ref('all')
const activeDiff = ref('all')
const activeChapter = ref('all')
const keyword = ref('')

// 章节从题库自动汇总归类
const chapters = computed(() => {
  const m = new Map()
  for (const q of QUESTIONS) m.set(q.chapter, (m.get(q.chapter) || 0) + 1)
  return [...m.entries()].map(([name, n]) => ({ name, n }))
})

const list = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return QUESTIONS.filter((q) => {
    if (activeType.value !== 'all' && q.type !== activeType.value) return false
    if (activeDiff.value !== 'all' && q.difficulty !== activeDiff.value) return false
    if (activeChapter.value !== 'all' && q.chapter !== activeChapter.value) return false
    if (!k) return true
    const hay = [q.stem, q.paperTitle, ...q.knowledgePoints].join(' ').toLowerCase()
    return hay.includes(k)
  })
})

function previewSource(q) {
  router.push({ path: '/', query: { preview: q.paperId, page: q.page } })
}

// ---------------------------------------------------------------- 题卡分享
// 点击卡片右上角分享按钮：Canvas 绘制一张适合朋友圈/聊天转发的题卡图
const shareCard = ref(null) // 生成的 dataURL
const shareQ = ref(null) // 当前题
const shareBusy = ref(false)
const canNativeShare = computed(() => typeof navigator.canShare === 'function')

function wrapText(ctx, text, maxWidth, maxLines = 12) {
  const lines = []
  let line = ''
  for (const ch of text) {
    if (ch === '\n' || ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line)
      line = ch === '\n' ? '' : ch
      if (lines.length >= maxLines) return lines
    } else {
      line += ch
    }
  }
  if (line) lines.push(line)
  return lines
}

function loadImg(src) {
  return new Promise((res) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = () => res(null)
    i.src = src
  })
}

async function makeCard(q) {
  const S = 2 // 2x 输出，保证清晰
  const W = 760
  const pad = 44
  const innerW = W - pad * 2
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const font = (size, weight = 400) => `${weight} ${size * S}px "SimSun","宋体","Songti SC",serif`

  // 预载配图
  const figs = []
  for (const f of q.figures || []) {
    const img = await loadImg(f.src)
    if (img) figs.push({ img, caption: f.caption || '' })
  }

  // ---- 先测量布局 ----
  // 题干里的 <br> 转换行，其余标签剔除，HTML 实体还原
  const stemPlain = q.stem
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
  ctx.font = font(11)
  const stemLines = wrapText(ctx, stemPlain, innerW - 8, 18)
  const stemH = stemLines.length * 21 // 行高 1.9
  // 选择题选项（文本选项；选项在图里的不处理）
  const opts = q.type === '选择题' && Array.isArray(q.options) ? q.options : []
  const half = innerW / 2 - 14
  const optRows = []
  for (let i = 0; i < opts.length;) {
    const s1 = `${opts[i][0]}. ${opts[i][1]}`
    const s2 = opts[i + 1] ? `${opts[i + 1][0]}. ${opts[i + 1][1]}` : null
    if (s2 && ctx.measureText(s1).width <= half && ctx.measureText(s2).width <= half) {
      optRows.push([s1, s2]); i += 2
    } else {
      optRows.push([s1]); i += 1
    }
  }
  const optH = optRows.length * 22
  // 配图按单元格尺寸算高
  const perRow = figs.length >= 3 ? 2 : Math.max(figs.length, 1)
  const gap = 18
  const figsW = Math.min(innerW, 540)
  const cellW = (figsW - gap * (perRow - 1)) / perRow
  const cellHs = figs.map(({ img, caption }) => {
    const scale = Math.min(cellW / img.width, 320 / img.height)
    return img.height * scale + (caption ? 24 : 0)
  })
  const figRows = Math.ceil(figs.length / perRow)
  const figsH = figs.length
    ? figRows * Math.max(...cellHs) + (figRows - 1) * 18
    : 0

  const H = Math.round(20 + stemH + (optRows.length ? 10 + optH : 0) + 14 + figsH + 10 + pad * 2)
  canvas.width = W * S
  canvas.height = H * S
  ctx.scale(S, S)

  // ---- 绘制 ----
  // 暖白纸面 + 描边框
  ctx.fillStyle = '#f3f1ea'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#111'
  ctx.fillRect(8, 10, W - 10, H - 14)
  ctx.fillStyle = '#fffdf8'
  ctx.fillRect(0, 0, W - 8, H - 12)
  ctx.lineWidth = 2.5
  ctx.strokeStyle = '#111'
  ctx.strokeRect(1.25, 1.25, W - 10.5, H - 14.5)
  // 顶部色带
  ctx.fillStyle = '#145fd2'
  ctx.fillRect(0, 0, W - 8, 7)

  // ---- 题干（宋体常规字重）----
  let y = pad + 14
  ctx.textAlign = 'left'
  ctx.fillStyle = '#161616'
  ctx.font = font(11)
  for (const line of stemLines) {
    ctx.fillText(line, pad + 2, y)
    y += 21
  }

  // ---- 选择题选项（两列并排，放不下换行）----
  if (optRows.length) {
    y += 10
    for (const [s1, s2] of optRows) {
      ctx.fillStyle = '#2a2a2a'
      ctx.fillText(s1, pad + 2, y)
      if (s2) ctx.fillText(s2, pad + 2 + innerW / 2, y)
      y += 22
    }
  }

  // ---- 配图 ----
  if (figs.length) {
    y += 12
    let x = pad + (innerW - figsW) / 2
    let rowH = 0
    for (let i = 0; i < figs.length; i++) {
      const { img, caption } = figs[i]
      const scale = Math.min(cellW / img.width, 320 / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      ctx.drawImage(img, x + (cellW - dw) / 2, y, dw, dh)
      if (caption) {
        ctx.fillStyle = '#99938a'
        ctx.font = font(11.5)
        ctx.textAlign = 'center'
        ctx.fillText(caption, x + cellW / 2, y + dh + 17)
        ctx.textAlign = 'left'
      }
      rowH = Math.max(rowH, Math.min(img.height * scale + (caption ? 24 : 0), 344))
      x += cellW + gap
      if ((i + 1) % perRow === 0) { y += rowH + 18; x = pad + (innerW - figsW) / 2; rowH = 0 }
    }
    if (rowH) y += rowH + 18
  }

  return canvas.toDataURL('image/png')
}

async function openShare(q) {
  shareBusy.value = true
  try {
    shareCard.value = await makeCard(q)
    shareQ.value = q
  } finally {
    shareBusy.value = false
  }
}

async function nativeShare() {
  // 转 blob 走系统分享（移动端），不支持则回退下载
  const url = shareCard.value
  const blob = await (await fetch(url)).blob()
  const file = new File([blob], 'question-card.png', { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '题目题卡' }) } catch { /* 用户取消 */ }
  } else {
    downloadCard()
  }
}

function downloadCard() {
  const a = document.createElement('a')
  a.href = shareCard.value
  a.download = `题卡-第${shareQ.value?.number ?? ''}题.png`
  a.click()
}

const DIFF_CLASS = { 易: 'd-easy', 中: 'd-mid', 难: 'd-hard' }
</script>

<template>
  <section class="qb-head">
    <p class="qb-kicker">中心题库 · 自动归类</p>
    <h2 class="page-title">题库检索</h2>
    <p class="qb-sub">
      共 <strong>{{ QUESTIONS.length }}</strong> 道题，来自 <strong>{{ new Set(QUESTIONS.map(q => q.paperId)).size }}</strong> 份试卷，按题型 / 难度 / 章节归类，支持知识点检索。
    </p>
  </section>

  <div class="qb-toolbar">
    <div class="qb-cats">
      <button class="qb-cat" :class="{ on: activeType === 'all' }" @click="activeType = 'all'">全部题型</button>
      <button
        v-for="t in QUESTION_TYPES"
        :key="t"
        class="qb-cat"
        :class="{ on: activeType === t }"
        @click="activeType = t"
      >{{ t }} <span class="qb-num">{{ QUESTIONS.filter(q => q.type === t).length }}</span></button>
    </div>
    <input
      v-model="keyword"
      class="qb-search"
      type="search"
      placeholder="搜索知识点 / 题目内容 / 试卷名"
      aria-label="搜索题目"
    />
  </div>

  <div class="qb-filters">
    <span class="qb-flabel">难度</span>
    <button class="qb-chip" :class="{ on: activeDiff === 'all' }" @click="activeDiff = 'all'">全部</button>
    <button
      v-for="d in DIFFICULTIES"
      :key="d"
      class="qb-chip"
      :class="{ on: activeDiff === d }"
      @click="activeDiff = d"
    >{{ d }} <b>{{ QUESTIONS.filter(q => q.difficulty === d).length }}</b></button>

    <span class="qb-flabel chapter">章节</span>
    <button class="qb-chip" :class="{ on: activeChapter === 'all' }" @click="activeChapter = 'all'">全部</button>
    <button
      v-for="c in chapters"
      :key="c.name"
      class="qb-chip"
      :class="{ on: activeChapter === c.name }"
      :title="c.name"
      @click="activeChapter = c.name"
    >{{ c.name.replace('人教版九上 · ', '') }} <b>{{ c.n }}</b></button>
  </div>

  <p class="qb-count">检索结果 <strong>{{ list.length }}</strong> 题</p>

  <div v-if="list.length" class="qb-list">
    <article v-for="q in list" :key="q.id" class="qb-item card">
      <div class="qb-item-head">
        <span class="qb-no">第 {{ q.number }} 题</span>
        <span class="qb-tag">{{ q.type }}</span>
        <span class="qb-tag" :class="DIFF_CLASS[q.difficulty]">难度 {{ q.difficulty }}</span>
        <span class="qb-tag score">{{ q.score }} 分</span>
        <span class="qb-chapter">{{ q.chapter }}</span>
        <button
          class="qb-share"
          :class="{ busy: shareBusy }"
          title="生成分享题卡"
          aria-label="生成分享题卡"
          @click="openShare(q)"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6" cy="12" r="2.6" /><circle cx="17.5" cy="5.5" r="2.6" /><circle cx="17.5" cy="18.5" r="2.6" />
            <path d="M8.4 10.8 15 6.8M8.4 13.2l6.6 4" />
          </svg>
        </button>
      </div>
      <p class="qb-stem" v-html="fmtMath(q.stem)"></p>
      <div v-if="q.options" class="qb-opts">
        <div v-for="o in q.options" :key="o[0]" class="qb-opt">
          <span class="qb-opt-label">{{ o[0] }}</span>
          <span v-if="o[1]" v-html="fmtMath(o[1])"></span>
        </div>
      </div>
      <div v-if="q.figures" class="qb-figs">
        <figure v-for="f in q.figures" :key="f.src">
          <img :src="f.src" :alt="q.id + ' 配图'" loading="lazy" />
          <figcaption v-if="f.caption">{{ f.caption }}</figcaption>
        </figure>
      </div>
      <div class="qb-item-foot">
        <div class="qb-kps">
          <span v-for="kp in q.knowledgePoints" :key="kp" class="qb-kp"># {{ kp }}</span>
        </div>
        <span class="qb-paper" :title="q.paperTitle">来源：{{ q.paperTitle }}</span>
        <button v-if="hasSource(q)" class="qb-src" @click="previewSource(q)">预览试卷 · 第 {{ q.page }} 页</button>
      </div>
    </article>
  </div>
  <p v-else class="qb-empty">没有匹配的题目，换个筛选条件试试。</p>

  <!-- 题卡分享弹窗 -->
  <div v-if="shareCard" class="sc-mask" @click.self="shareCard = null">
    <div class="sc-panel">
      <div class="sc-head">
        <strong>题卡已生成</strong>
        <button class="sc-close" aria-label="关闭" @click="shareCard = null">✕</button>
      </div>
      <div class="sc-body">
        <img :src="shareCard" alt="题卡预览" />
      </div>
      <div class="sc-actions">
        <button class="sc-btn ghost" @click="downloadCard">保存图片</button>
        <button v-if="canNativeShare" class="sc-btn" @click="nativeShare">分享给好友</button>
        <button v-else class="sc-btn" @click="nativeShare">保存图片</button>
      </div>
      <p class="sc-tip">长按图片也可保存到相册</p>
    </div>
  </div>
</template>

<style scoped>
.qb-kicker {
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent-strong);
}
.qb-sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-dim);
}
.qb-sub strong {
  color: var(--accent);
}

.qb-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}
.qb-cats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.qb-cat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  font-size: 13px;
  font-weight: 800;
  color: var(--text-h);
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: 999px;
  transition: transform 0.12s ease, background 0.12s ease;
}
.qb-cat:hover { transform: translateY(-2px); }
.qb-cat.on { background: var(--accent); color: #fff; }
.qb-num {
  padding: 0 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
  background: var(--surface-2);
  border-radius: 999px;
}
.qb-cat.on .qb-num { color: #fff; background: rgba(255, 255, 255, 0.24); }
.qb-search {
  flex: 0 1 280px;
  min-width: 180px;
  padding: 9px 14px;
  font-size: 13px;
  color: var(--text-h);
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  outline: none;
}
.qb-search:focus { border-color: var(--accent); }

.qb-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.qb-flabel {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}
.qb-flabel.chapter { margin-left: 14px; }
.qb-chip {
  padding: 4px 11px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-h);
  background: var(--surface-3);
  border: 2px solid var(--line);
  border-radius: 999px;
}
.qb-chip b { font-weight: 700; opacity: 0.55; margin-left: 2px; }
.qb-chip:hover { background: var(--surface-2); }
.qb-chip.on { color: #fff; background: var(--text-h); }
.qb-count { font-size: 12px; color: var(--text-dim); }
.qb-count strong { color: var(--text-h); }

.qb-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.qb-item { padding: 14px 16px; }
.qb-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.qb-no { font-size: 14px; font-weight: 900; color: var(--text-h); }
.qb-tag {
  padding: 1px 9px;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-h);
  background: var(--surface-3);
  border: 2px solid var(--line);
  border-radius: 999px;
}
.qb-tag.d-easy { color: var(--green); border-color: var(--green); }
.qb-tag.d-mid { color: var(--amber); border-color: var(--amber); }
.qb-tag.d-hard { color: var(--accent-strong); border-color: var(--accent); }
.qb-tag.score { color: var(--blue, #145fd2); }
.qb-chapter {
  margin-left: auto;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
}
.qb-stem {
  margin-top: 10px;
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text-h);
}
.math-tri {
  font-size: 1.3em;
  line-height: 0;
}
.qb-figs img {
  display: block;
  max-width: min(100%, 820px);
  height: auto;
}
.qb-opts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 26px;
  margin-top: 10px;
  max-width: 900px;
}
@media (max-width: 720px) {
  .qb-opts { grid-template-columns: 1fr; }
}
.qb-opt {
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-size: 15px;
  line-height: 1.65;
  color: var(--text-h);
}
.qb-opt-label {
  flex: none;
  font-weight: 700;
  color: var(--blue, #145fd2);
}
.qb-figs {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 22px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.qb-figs img {
  max-height: 430px;
}
.qb-figs figcaption {
  margin-top: 3px;
  font-size: 12px;
  text-align: center;
  color: var(--text-dim);
}
.qb-item-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.qb-kps { display: flex; gap: 6px; flex-wrap: wrap; }
.qb-paper {
  margin-left: auto;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-dim);
}
@media (max-width: 700px) {
  .qb-paper { display: none; }
}
.qb-kp {
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-radius: 999px;
}
.qb-src {
  flex: 0 0 auto;
  padding: 6px 13px;
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  background: var(--text-h);
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.2);
  transition: all 0.12s ease;
}
.qb-src:hover { background: var(--accent); transform: translateY(-1px); }

.qb-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-dim);
}

/* 分享按钮：卡片右上角 */
.qb-item { position: relative; }
.qb-share {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  color: var(--text-dim);
  background: var(--surface-3);
  border: 2px solid var(--line);
  border-radius: 50%;
  transition: all 0.12s ease;
}
.qb-share:hover { color: #fff; background: var(--accent); border-color: var(--accent); transform: rotate(-8deg); }
.qb-share.busy { opacity: 0.5; pointer-events: none; }

/* 题卡弹窗 */
.sc-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(10, 10, 14, 0.55);
  backdrop-filter: blur(3px);
}
.sc-panel {
  display: flex;
  flex-direction: column;
  max-width: min(560px, 94vw);
  max-height: 92vh;
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--radius-sm, 10px);
  box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.25);
}
.sc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  font-size: 14px;
  border-bottom: 2px solid var(--line);
}
.sc-close {
  width: 28px;
  height: 28px;
  font-size: 14px;
  color: var(--text-dim);
  background: var(--surface-3);
  border: 2px solid var(--line);
  border-radius: 50%;
}
.sc-close:hover { color: #fff; background: var(--accent); }
.sc-body {
  overflow: auto;
  padding: 14px;
  text-align: center;
}
.sc-body img {
  max-width: 100%;
  max-height: 58vh;
  border: 2px solid var(--line);
  border-radius: 6px;
}
.sc-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  padding: 4px 16px 6px;
}
.sc-btn {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 800;
  color: #fff;
  background: var(--text-h);
  border: 2px solid var(--line);
  border-radius: var(--radius-sm, 8px);
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.2);
  transition: all 0.12s ease;
}
.sc-btn:hover { background: var(--accent); transform: translateY(-1px); }
.sc-btn.ghost {
  color: var(--text-h);
  background: var(--surface-3);
}
.sc-tip {
  padding-bottom: 12px;
  font-size: 11px;
  text-align: center;
  color: var(--text-dim);
}

@media (max-width: 720px) {
  .qb-chapter { margin-left: 0; flex-basis: 100%; }
  .qb-src { flex: 1 1 100%; text-align: center; }
}
</style>
