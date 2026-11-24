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
      </div>
      <p class="qb-stem" v-html="fmtMath(q.stem)"></p>
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
  max-width: min(100%, 420px);
  height: auto;
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
  max-height: 260px;
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

@media (max-width: 720px) {
  .qb-chapter { margin-left: 0; flex-basis: 100%; }
  .qb-src { flex: 1 1 100%; text-align: center; }
}
</style>
