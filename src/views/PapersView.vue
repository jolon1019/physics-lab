<script setup>
// 试卷资料库（卡片墙）：分类 + 学科 + 搜索三级筛选，点「下载」跳转网盘
// 数据 = 静态 resources.js（基础库）+ /api/papers 数据库增量（按 id 合并，API 优先）
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RESOURCE_CATEGORIES, RESOURCES } from '../data/resources'
import { getPublicPapers } from '../lib/api'

const PAGE_SIZE = 24

// 试卷列表：先用静态数据渲染，挂载后拉取数据库增量合并（数据库条目按 id 覆盖静态条目）
const papers = ref(RESOURCES)
// 静态库 id 集合：数据库里独有的条目（静态库没有）属于后上架
const STATIC_IDS = new Set(RESOURCES.map((r) => r.id))
onMounted(async () => {
  try {
    const { papers: remote } = await getPublicPapers()
    if (Array.isArray(remote) && remote.length) {
      const map = new Map(RESOURCES.map((r) => [r.id, r]))
      for (const p of remote) {
        const base = map.get(p.id)
        // 数据库旧条目可能没存 addedAt，保留静态库里的上架日期，否则会被当成历史资料排到末尾
        map.set(p.id, { ...base, ...p, addedAt: p.addedAt || base?.addedAt || '' })
      }
      papers.value = [...map.values()]
    }
  } catch {
    /* 接口不可用时保持静态数据 */
  }
})

const activeCat = ref('all')
const activeSubject = ref('all')
const activeSection = ref('all')
const activeKind = ref('all')
const keyword = ref('')
const limit = ref(PAGE_SIZE)
const broken = reactive({})
const copied = ref('')
let copyTimer = null

const CAT_LABEL = Object.fromEntries(RESOURCE_CATEGORIES.map((c) => [c.id, c.label]))
const CAT_ORDER = RESOURCE_CATEGORIES.map((c) => c.id)

// 考试类型：从标题关键词识别，七年级/八年级/九年级下可二次筛选
const KIND_RULES = [
  ['期中', /期中/],
  ['期末', /期末/],
  ['月考', /月考/],
  ['模拟', /一模|二模|三模|模拟/],
  ['开学考', /开学考|开学测/],
  ['其他', null]
]
const KIND_ORDER = KIND_RULES.map((k) => k[0])

function kindOf(r) {
  for (const [name, re] of KIND_RULES) {
    if (re && re.test(r.title)) return name
  }
  return '其他'
}

// 分类计数
const counts = computed(() => {
  const m = { all: papers.value.length }
  for (const r of papers.value) m[r.category] = (m[r.category] || 0) + 1
  return m
})

// 当前分类下的资料（用于二级筛选计数）
const inCat = computed(() =>
  activeCat.value === 'all' ? papers.value : papers.value.filter((r) => r.category === activeCat.value)
)

// 学科筛选：按当前分类动态生成
const subjects = computed(() => {
  const m = new Map()
  for (const r of inCat.value) {
    const s = r.subject || '其他'
    m.set(s, (m.get(s) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }))
})

// 免费资源的分区（视频课 / 同步练习 / 中考 / 七年级 / 高中）
const sections = computed(() => {
  if (activeCat.value === 'all') return []
  const m = new Map()
  for (const r of inCat.value) {
    if (!r.section) continue
    m.set(r.section, (m.get(r.section) || 0) + 1)
  }
  if (m.size < 2) return []
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }))
})

// 考试类型筛选（仅年级分类出现）
const kinds = computed(() => {
  if (activeCat.value === 'all' || activeCat.value === 'free') return []
  const m = new Map()
  for (const r of inCat.value) {
    const k = kindOf(r)
    m.set(k, (m.get(k) || 0) + 1)
  }
  return KIND_ORDER.filter((k) => m.has(k)).map((k) => ({ name: k, n: m.get(k) }))
})

// 上架时间：静态库取 addedAt；数据库新增但没存日期的条目一律按「最新」排
const pubAt = (r) => r.addedAt || (STATIC_IDS.has(r.id) ? '' : '9999-12-31')
const isNew = (r) => !!pubAt(r)

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return papers.value.filter((r) => {
    if (activeCat.value !== 'all' && r.category !== activeCat.value) return false
    if (activeSubject.value !== 'all' && (r.subject || '其他') !== activeSubject.value) return false
    if (activeSection.value !== 'all' && r.section !== activeSection.value) return false
    if (activeKind.value !== 'all' && kindOf(r) !== activeKind.value) return false
    if (!k) return true
    const hay = [r.title, r.grade, r.term, r.subject, r.section, r.brand, r.passcode]
      .filter(Boolean)
      .join(' ')
    return hay.toLowerCase().includes(k)
  }).sort((a, b) =>
    // 按上架时间从新到旧；无日期的历史资料保持原分类顺序
    pubAt(b).localeCompare(pubAt(a)) ||
    CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category)
  )
})

const shown = computed(() => filtered.value.slice(0, limit.value))
const rest = computed(() => Math.max(0, filtered.value.length - limit.value))

// 切换筛选后回到第一页
watch([activeCat, activeSubject, activeSection, activeKind, keyword], () => {
  limit.value = PAGE_SIZE
})

function pickCat(id) {
  activeCat.value = id
  activeSubject.value = 'all'
  activeSection.value = 'all'
  activeKind.value = 'all'
}

function metaOf(r) {
  if (r.category === 'free') {
    return [r.section, r.brand].filter(Boolean).join(' · ') || '免费资源'
  }
  return [r.grade, kindOf(r), r.subject].filter(Boolean).join(' · ')
}

async function copyPasscode(r) {
  try {
    await navigator.clipboard.writeText(r.passcode)
    copied.value = r.id
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = ''), 1800)
  } catch (e) {
    // 剪贴板不可用时静默失败，提取码本身已在按钮上可见
  }
}
</script>

<template>
  <section class="pp-head">
    <div class="pp-head-text">
      <p class="pp-kicker">资料库 · 同步更新</p>
      <h2 class="page-title">试卷资料库</h2>
      <p class="pp-sub">
        共 <strong>{{ papers.length }}</strong> 份资料，按年级与学科分类，点「下载」跳转网盘保存。
      </p>
    </div>
  </section>

  <!-- 一级分类 -->
  <div class="pp-toolbar">
    <div class="pp-cats">
      <button
        v-for="c in RESOURCE_CATEGORIES"
        :key="c.id"
        class="pp-cat"
        :class="{ on: activeCat === c.id }"
        @click="pickCat(c.id)"
      >
        {{ c.label }}
        <span class="pp-num">{{ counts[c.id] || 0 }}</span>
      </button>
    </div>
    <input
      v-model="keyword"
      class="pp-search"
      type="search"
      placeholder="搜索试卷名称 / 学校 / 版本"
      aria-label="搜索试卷"
    />
  </div>

  <!-- 免费资源的分区（视频课 / 同步练习 / 中考 …） -->
  <div v-if="sections.length" class="pp-filters">
    <span class="pp-flabel">分区</span>
    <button
      class="pp-chip"
      :class="{ on: activeSection === 'all' }"
      @click="activeSection = 'all'"
    >全部</button>
    <button
      v-for="s in sections"
      :key="s.name"
      class="pp-chip"
      :class="{ on: activeSection === s.name }"
      @click="activeSection = s.name"
    >{{ s.name }} <b>{{ s.n }}</b></button>
  </div>

  <!-- 考试类型（月考 / 期中 / 期末 …，仅年级分类出现） -->
  <div v-if="kinds.length" class="pp-filters">
    <span class="pp-flabel">考试类型</span>
    <button
      class="pp-chip"
      :class="{ on: activeKind === 'all' }"
      @click="activeKind = 'all'"
    >全部</button>
    <button
      v-for="k in kinds"
      :key="k.name"
      class="pp-chip kind"
      :class="{ on: activeKind === k.name }"
      @click="activeKind = k.name"
    >{{ k.name }} <b>{{ k.n }}</b></button>
  </div>

  <!-- 学科筛选 -->
  <div v-if="subjects.length > 1" class="pp-filters">
    <span class="pp-flabel">学科</span>
    <button
      class="pp-chip"
      :class="{ on: activeSubject === 'all' }"
      @click="activeSubject = 'all'"
    >全部</button>
    <button
      v-for="s in subjects"
      :key="s.name"
      class="pp-chip"
      :class="{ on: activeSubject === s.name }"
      @click="activeSubject = s.name"
    >{{ s.name }} <b>{{ s.n }}</b></button>
  </div>

  <p class="pp-count">
    筛选结果 <strong>{{ filtered.length }}</strong> 份
    <span v-if="filtered.length > shown.length">，已显示 {{ shown.length }} 份</span>
  </p>

  <!-- 卡片墙 -->
  <div v-if="shown.length" class="pp-grid">
    <article
      v-for="r in shown"
      :key="r.id"
      class="pp-item card"
      :class="`tone-${r.tone || 'red'}`"
    >
      <div class="pp-cover">
        <img
          v-if="r.cover && !broken[r.id]"
          class="pp-cover-img"
          :src="r.cover"
          :alt="r.title"
          loading="lazy"
          @error="broken[r.id] = true"
        />
        <!-- 无首图：用学科配色生成纸质封面（标题只在下方正文出现一次） -->
        <div v-else class="pp-paper">
          <span class="pp-band">{{ r.subject || '综合' }}</span>
          <span class="pp-lines" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="pp-psrc">{{ r.brand || (r.category === 'free' ? '免费网盘' : '学校真题') }}</span>
          <span class="pp-mark">{{ (r.subject || '综合').slice(0, 2) }}</span>
          <span class="pp-foot">{{ r.term }}</span>
        </div>
        <span v-if="isNew(r)" class="pp-new">新</span>
        <span class="pp-tag">{{ r.category === 'free' ? r.section || '免费' : CAT_LABEL[r.category] }}</span>
      </div>

      <div class="pp-body">
        <h3 class="pp-title" :title="r.title">{{ r.title }}</h3>
        <p class="pp-meta">{{ metaOf(r) }}</p>
        <div class="pp-actions">
          <a
            v-if="r.downloadUrl"
            class="pp-dl"
            :href="r.downloadUrl"
            target="_blank"
            rel="noopener"
          >下载</a>
          <span v-else class="pp-dl pending">待补充</span>
          <button
            v-if="r.passcode"
            class="pp-code"
            :class="{ copied: copied === r.id }"
            @click="copyPasscode(r)"
          >{{ copied === r.id ? '已复制' : '码 ' + r.passcode }}</button>
        </div>
      </div>
    </article>
  </div>

  <p v-else class="pp-empty">没有匹配的资料，换个关键词或分类试试。</p>

  <div v-if="rest" class="pp-more-wrap">
    <button class="pp-more" @click="limit += PAGE_SIZE">加载更多（还有 {{ rest }} 份）</button>
  </div>
</template>

<style scoped>
.pp-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.pp-kicker {
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent-strong);
}
.pp-sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-dim);
}
.pp-sub strong {
  color: var(--accent);
  font-size: 15px;
}

/* 工具栏 */
.pp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}
.pp-cats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pp-cat {
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
.pp-cat:hover {
  transform: translateY(-2px);
}
.pp-cat.on {
  background: var(--accent);
  color: #fff;
}
.pp-num {
  padding: 0 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
  background: var(--surface-2);
  border-radius: 999px;
}
.pp-cat.on .pp-num {
  color: #fff;
  background: rgba(255, 255, 255, 0.24);
}
.pp-search {
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
.pp-search:focus {
  border-color: var(--accent);
}

/* 二级筛选 */
.pp-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.pp-flabel {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}
.pp-chip {
  padding: 4px 11px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-h);
  background: var(--surface-3);
  border: 2px solid var(--line);
  border-radius: 999px;
  transition: background 0.12s ease, color 0.12s ease;
}
.pp-chip b {
  font-weight: 700;
  opacity: 0.55;
  margin-left: 2px;
}
.pp-chip:hover {
  background: var(--surface-2);
}
.pp-chip.on {
  color: #fff;
  background: var(--text-h);
}
/* 考试类型：选中用主色，与学科/分区的黑底区分 */
.pp-chip.kind.on {
  background: var(--accent);
  border-color: var(--line);
}
.pp-count {
  font-size: 12px;
  color: var(--text-dim);
}
.pp-count strong {
  color: var(--text-h);
}

/* 卡片墙 */
.pp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.pp-item {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: transform 0.14s ease, box-shadow 0.14s ease;
}
.pp-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 14px 0 rgba(0, 0, 0, 0.18);
}

.pp-cover {
  position: relative;
  aspect-ratio: 3 / 2;
  background: var(--surface-2);
  border-bottom: 2px solid var(--line);
  overflow: hidden;
}
.pp-cover-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
}
.pp-tag {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 2;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 800;
  color: var(--tone, var(--accent));
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: 999px;
}
/* 新发布角标（addedAt 有值的卡片） */
.pp-new {
  position: absolute;
  top: 5px;
  left: 5px;
  z-index: 2;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 900;
  color: #fff;
  background: var(--accent);
  border: 2px solid var(--line);
  border-radius: 999px;
}

/* 纸质封面 */
.pp-paper {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 0 14px 12px;
  background:
    repeating-linear-gradient(180deg, transparent 0 24px, rgba(0, 0, 0, 0.035) 24px 25px),
    var(--surface);
}
.pp-band {
  margin: 0 -14px;
  padding: 6px 14px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #fff;
  background: var(--tone, var(--accent));
}
.pp-ptitle,
.pp-rule {
  display: none;
}
/* 纸条纹：替代封面标题，给缩略图一点「试卷」质感，避免和正文标题重复 */
.pp-lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}
.pp-lines i {
  display: block;
  height: 3px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--tone, var(--accent)) 22%, transparent);
}
.pp-lines i:nth-child(1) { width: 84%; }
.pp-lines i:nth-child(2) { width: 62%; }
.pp-lines i:nth-child(3) { width: 72%; }
.pp-psrc {
  margin-top: auto;
  font-size: 10px;
  color: var(--text-dim);
}
.pp-mark {
  position: absolute;
  right: 6px;
  bottom: 16px;
  font-size: 46px;
  font-weight: 900;
  line-height: 1;
  color: var(--tone, var(--accent));
  opacity: 0.08;
  pointer-events: none;
}
.pp-foot {
  position: absolute;
  right: 12px;
  bottom: 10px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-dim);
}
.tone-red { --tone: var(--accent); }
.tone-blue { --tone: #145fd2; }
.tone-green { --tone: #0d9b61; }
.tone-amber { --tone: #b87915; }
.tone-purple { --tone: #6b46c1; }
.tone-dark { --tone: #24282e; }

/* 卡片正文 */
.pp-body {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px;
  flex: 1;
}
.pp-title {
  font-size: 14px;
  font-weight: 800;
  line-height: 1.45;
  color: var(--text-h);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pp-meta {
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pp-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
}
.pp-dl {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 800;
  color: #fff;
  background: var(--accent);
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  text-decoration: none;
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.2);
  transition: transform 0.12s ease, background 0.12s ease;
}
.pp-dl:hover {
  background: var(--accent-strong);
  transform: translateY(-1px);
}
.pp-dl.pending {
  color: var(--text-dim);
  background: var(--surface-2);
  box-shadow: none;
  cursor: not-allowed;
}
.pp-code {
  padding: 7px 9px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-h);
  background: var(--surface-3);
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  white-space: nowrap;
}
.pp-code:hover {
  background: var(--surface-2);
}
.pp-code.copied {
  color: var(--green);
  border-color: var(--green);
}

.pp-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-dim);
}
.pp-more-wrap {
  display: flex;
  justify-content: center;
  padding: 6px 0 4px;
}
.pp-more {
  padding: 10px 26px;
  font-size: 13px;
  font-weight: 800;
  color: var(--text-h);
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: 999px;
  box-shadow: 3px 3px 0 #050505;
  transition: all 0.12s ease;
}
.pp-more:hover {
  background: var(--accent-soft);
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 #050505;
}
.pp-more:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 #050505;
}

/* 移动端 */
@media (max-width: 720px) {
  .pp-head {
    align-items: flex-start;
  }
  /* 一级分类压缩成一行：收紧字号与内边距，仍放不下时可横向滑动 */
  .pp-cats {
    flex-wrap: nowrap;
    width: 100%;
    gap: 4px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }
  .pp-cats::-webkit-scrollbar {
    display: none;
  }
  .pp-cat {
    flex: 0 0 auto;
    gap: 3px;
    padding: 4px 6px;
    font-size: 11px;
  }
  .pp-num {
    padding: 0 3px;
    font-size: 9px;
  }
  .pp-toolbar {
    gap: 10px;
  }
  /* 手机端三栏 */
  .pp-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .pp-item:hover {
    transform: none;
    box-shadow: none;
  }
  .pp-paper {
    padding: 0 8px 7px;
  }
  .pp-band {
    margin: 0 -8px;
    padding: 3px 8px;
    font-size: 9px;
    letter-spacing: 0;
  }
  .pp-tag {
    top: 3px;
    right: 3px;
    padding: 1px 5px;
    font-size: 8px;
    border-width: 1.5px;
  }
  .pp-new {
    top: 3px;
    left: 3px;
    padding: 1px 4px;
    font-size: 8px;
    border-width: 1.5px;
  }
  .pp-lines {
    gap: 4px;
    margin-top: 7px;
  }
  .pp-lines i {
    height: 2px;
  }
  .pp-psrc {
    font-size: 8px;
  }
  .pp-foot {
    right: 8px;
    bottom: 6px;
    font-size: 8px;
  }
  .pp-mark {
    right: 3px;
    bottom: 12px;
    font-size: 26px;
  }
  .pp-title {
    font-size: 11px;
    line-height: 1.4;
    -webkit-line-clamp: 4;
  }
  .pp-meta {
    display: none;
  }
  .pp-body {
    padding: 7px;
    gap: 5px;
  }
  .pp-dl {
    padding: 5px 4px;
    font-size: 11px;
    border-width: 1.5px;
  }
  .pp-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  .pp-search {
    flex: 1 1 100%;
  }
}
</style>
