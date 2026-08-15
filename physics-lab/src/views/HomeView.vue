<script setup>
import { GRADES } from '../data/experiments'

const totalExps = GRADES.reduce((s, g) => s + g.chapters.reduce((x, c) => x + c.experiments.length, 0), 0)
const totalGrades = GRADES.length

const allExps = GRADES.flatMap((g) =>
  g.chapters.flatMap((c) => c.experiments.map((e) => ({ ...e, grade: g.label, chapter: c.title })))
)
const coreCount = allExps.filter((e) => e.level === '核心').length
const featured = allExps.filter((e) => e.level === '核心').slice(0, 9)

const features = [
  {
    key: 'sim',
    ico: 'sim',
    title: '仿真操作',
    desc: '在浏览器里直接操作仪器、调节参数，观察真实的物理现象与数据变化，实验不再受器材和场地限制。'
  },
  {
    key: 'prac',
    ico: 'prac',
    title: '巩固练习',
    desc: '每个实验配套选择题与计算题，提交后即时反馈对错与解析，帮你把探究结论真正转化为得分能力。'
  },
  {
    key: 'rec',
    ico: 'rec',
    title: '学习记录',
    desc: '自动统计完成进度与答题正确率，实验轨迹、薄弱章节一目了然，复习时心里有数。'
  }
]

const steps = [
  { n: '01', t: '挑选实验', d: '按年级与章节匹配课本进度，挑出想探究的实验。' },
  { n: '02', t: '动手仿真', d: '在网页里操作仪器、调参数，观察物理现象。' },
  { n: '03', t: '巩固练习', d: '完成配套题目，即时反馈帮你查漏补缺。' },
  { n: '04', t: '查看记录', d: '进度与正确率自动留存，学习轨迹清晰可见。' }
]
</script>

<template>
  <div class="hp">
    <!-- ===== Hero ===== -->
    <section class="hp-hero">
      <div class="hp-hero-copy">
        <span class="hp-eyebrow">人教版初中物理 · 八年级 / 九年级</span>
        <h1 class="hp-title">同步课本的物理实验，<br />自主探究练起来</h1>
        <p class="hp-sub">覆盖人教版八、九年级全部实验 · 仿真操作 + 巩固练习 + 学习记录</p>
        <div class="hp-cta">
          <RouterLink to="/experiment/e-motion-desc" class="btn btn-primary hp-btn-lg">开始第一个实验 →</RouterLink>
          <RouterLink to="/record" class="btn hp-btn-lg">查看学习记录</RouterLink>
        </div>
        <ul class="hp-stats">
          <li><strong>{{ totalExps }}</strong><span>个同步实验</span></li>
          <li><strong>{{ totalGrades }}</strong><span>本教材册次</span></li>
          <li><strong>{{ coreCount }}</strong><span>个核心实验</span></li>
        </ul>
      </div>

      <div class="hp-hero-art" aria-hidden="true">
        <svg class="hp-art-svg" viewBox="0 0 360 360" role="img" aria-label="物理实验平台示意图">
          <!-- 原子轨道 -->
          <g transform="rotate(0 180 180)">
            <g class="hp-orbit hp-orbit-1">
              <ellipse cx="180" cy="180" rx="132" ry="52" fill="none" stroke="#050505" stroke-width="3" />
              <circle cx="312" cy="180" r="9" fill="var(--blue)" stroke="#050505" stroke-width="2" />
            </g>
          </g>
          <g transform="rotate(60 180 180)">
            <g class="hp-orbit hp-orbit-2">
              <ellipse cx="180" cy="180" rx="132" ry="52" fill="none" stroke="#050505" stroke-width="3" />
              <circle cx="312" cy="180" r="9" fill="var(--amber)" stroke="#050505" stroke-width="2" />
            </g>
          </g>
          <g transform="rotate(120 180 180)">
            <g class="hp-orbit hp-orbit-3">
              <ellipse cx="180" cy="180" rx="132" ry="52" fill="none" stroke="#050505" stroke-width="3" />
              <circle cx="312" cy="180" r="9" fill="var(--green)" stroke="#050505" stroke-width="2" />
            </g>
          </g>
          <!-- 原子核 -->
          <circle cx="180" cy="180" r="18" fill="var(--accent)" stroke="#050505" stroke-width="3" />

          <!-- 正弦波 -->
          <path
            d="M24 300 Q 54 268 84 300 T 144 300 T 204 300 T 264 300 T 324 300"
            fill="none"
            stroke="var(--blue)"
            stroke-width="4"
            stroke-linecap="round"
          />

          <!-- 浮标：仿真 / 练习 / 记录 -->
          <g class="hp-chip hp-chip-1" transform="translate(34 52)">
            <rect width="78" height="36" rx="9" fill="#fff" stroke="#050505" stroke-width="2.5" />
            <circle cx="19" cy="18" r="6" fill="var(--accent)" />
            <text x="33" y="23" font-size="15" font-weight="900" fill="#050505">仿真</text>
          </g>
          <g class="hp-chip hp-chip-2" transform="translate(250 86)">
            <rect width="78" height="36" rx="9" fill="#fff" stroke="#050505" stroke-width="2.5" />
            <circle cx="19" cy="18" r="6" fill="var(--blue)" />
            <text x="33" y="23" font-size="15" font-weight="900" fill="#050505">练习</text>
          </g>
          <g class="hp-chip hp-chip-3" transform="translate(138 316)">
            <rect width="78" height="36" rx="9" fill="#fff" stroke="#050505" stroke-width="2.5" />
            <circle cx="19" cy="18" r="6" fill="var(--green)" />
            <text x="33" y="23" font-size="15" font-weight="900" fill="#050505">记录</text>
          </g>
        </svg>
      </div>
    </section>

    <!-- ===== 平台能力 ===== -->
    <section class="hp-section">
      <div class="hp-section-head">
        <span class="hp-eyebrow">平台能力</span>
        <h2>一套工具，覆盖实验全流程</h2>
      </div>
      <div class="hp-feature-grid">
        <article v-for="f in features" :key="f.key" class="hp-feature card">
          <div class="hp-feature-ico" :class="`ico-${f.ico}`">
            <svg v-if="f.ico === 'sim'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="13" rx="2" />
              <path d="M10 9l5 3-5 3z" />
            </svg>
            <svg v-else-if="f.ico === 'prac'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 3h9l3 3v15H6z" />
              <path d="M9 13l1.6 1.6L15 10" />
              <path d="M9 18h5" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 20V11M10 20V4M16 20v-6M22 20H2" />
            </svg>
          </div>
          <h3 class="hp-feature-title">{{ f.title }}</h3>
          <p class="hp-feature-desc">{{ f.desc }}</p>
        </article>
      </div>
    </section>

    <!-- ===== 精选实验 ===== -->
    <section class="hp-section">
      <div class="hp-section-head hp-section-head-row">
        <div>
          <span class="hp-eyebrow">精选实验</span>
          <h2>从核心实验开始上手</h2>
        </div>
        <RouterLink to="/chapters/grade8a" class="hp-more">查看完整目录 →</RouterLink>
      </div>
      <div class="hp-exp-grid">
        <RouterLink
          v-for="e in featured"
          :key="e.id"
          :to="`/experiment/${e.id}`"
          class="hp-exp card"
        >
          <div class="hp-exp-top">
            <span class="hp-exp-type">{{ e.type }}</span>
            <span :class="['tag', e.level === '核心' ? 'tag-core' : 'tag-basic']">{{ e.level }}</span>
          </div>
          <h3 class="hp-exp-title">{{ e.title }}</h3>
          <p class="hp-exp-meta">{{ e.grade }} · {{ e.chapter }}</p>
          <span class="hp-exp-go">进入实验 →</span>
        </RouterLink>
      </div>
    </section>

    <!-- ===== 上手流程 ===== -->
    <section class="hp-section">
      <div class="hp-section-head">
        <span class="hp-eyebrow">上手流程</span>
        <h2>几分钟就能完成一次探究</h2>
      </div>
      <ol class="hp-steps">
        <li v-for="s in steps" :key="s.n" class="hp-step card">
          <span class="hp-step-n">{{ s.n }}</span>
          <h3 class="hp-step-title">{{ s.t }}</h3>
          <p class="hp-step-desc">{{ s.d }}</p>
        </li>
      </ol>
    </section>

    <!-- ===== 行动号召 ===== -->
    <section class="hp-cta-band">
      <div class="hp-cta-inner">
        <h2>现在就开始你的物理探究之旅</h2>
        <p>无需安装，打开网页就能做实验。</p>
        <RouterLink to="/experiment/e-motion-desc" class="btn btn-primary hp-btn-lg">免费开始 →</RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hp {
  display: block;
}

/* ===== Hero ===== */
.hp-hero {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 32px;
  align-items: center;
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 14px 0 rgba(0, 0, 0, 0.18);
  padding: 44px;
  margin-bottom: 44px;
}

.hp-eyebrow {
  display: inline-block;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border: 2px solid var(--accent-border);
  border-radius: 999px;
  padding: 4px 12px;
  margin-bottom: 16px;
}

.hp-title {
  font-size: clamp(28px, 4.2vw, 46px);
  line-height: 1.12;
  letter-spacing: -0.5px;
}

.hp-sub {
  margin-top: 14px;
  font-size: clamp(15px, 1.6vw, 18px);
  color: var(--text);
  max-width: 30em;
}

.hp-cta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.hp-btn-lg {
  min-height: 50px;
  padding: 0 24px;
  font-size: 16px;
}

.hp-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 30px;
  margin: 30px 0 0;
  padding: 0;
  list-style: none;
}

.hp-stats li {
  display: flex;
  flex-direction: column;
}

.hp-stats strong {
  font-size: 30px;
  font-weight: 900;
  color: var(--text-h);
  line-height: 1.1;
}

.hp-stats span {
  font-size: 13px;
  color: var(--text-dim);
  margin-top: 2px;
}

/* Hero 插画 */
.hp-hero-art {
  display: flex;
  justify-content: center;
}

.hp-art-svg {
  width: 100%;
  max-width: 380px;
  height: auto;
  display: block;
}

.hp-orbit {
  transform-box: view-box;
  transform-origin: 180px 180px;
}

.hp-orbit-1 { animation: hp-spin 16s linear infinite; }
.hp-orbit-2 { animation: hp-spin 22s linear infinite reverse; }
.hp-orbit-3 { animation: hp-spin 19s linear infinite; }

.hp-chip {
  animation: hp-float 5s ease-in-out infinite;
}
.hp-chip-2 { animation-delay: 1.2s; }
.hp-chip-3 { animation-delay: 2.4s; }

@keyframes hp-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes hp-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-7px); }
}

/* ===== 通用区块 ===== */
.hp-section {
  margin-top: 52px;
}

.hp-section-head {
  margin-bottom: 22px;
}

.hp-section-head h2 {
  font-size: clamp(22px, 2.6vw, 30px);
  margin-top: 8px;
}

.hp-section-head-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.hp-more {
  color: var(--accent-strong);
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
}
.hp-more:hover { text-decoration: underline; }

/* ===== 能力卡片 ===== */
.hp-feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}

.hp-feature {
  padding: 24px;
  transition: transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.hp-feature:hover {
  transform: translateY(-3px);
  box-shadow: 6px 6px 0 var(--accent);
  border-color: var(--accent);
}

.hp-feature-ico {
  width: 50px;
  height: 50px;
  border: 2px solid var(--line);
  border-radius: 12px;
  display: grid;
  place-items: center;
  margin-bottom: 16px;
}
.hp-feature-ico svg { width: 26px; height: 26px; }

.ico-sim { background: var(--accent-soft); color: var(--accent-strong); }
.ico-prac { background: rgba(20, 95, 210, 0.12); color: var(--blue); }
.ico-rec { background: var(--success-bg); color: var(--green); }

.hp-feature-title {
  font-size: 19px;
  margin-bottom: 8px;
}

.hp-feature-desc {
  font-size: 14px;
  color: var(--text);
  line-height: 1.7;
}

/* ===== 精选实验 ===== */
.hp-exp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.hp-exp {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  text-decoration: none;
  transition: transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.hp-exp:hover {
  transform: translateY(-3px);
  box-shadow: 6px 6px 0 var(--accent);
  border-color: var(--accent);
}

.hp-exp-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hp-exp-type {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-dim);
  letter-spacing: 0.5px;
}

.hp-exp-title {
  font-size: 16px;
  line-height: 1.4;
}

.hp-exp-meta {
  font-size: 12px;
  color: var(--text-dim);
}

.hp-exp-go {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 800;
  color: var(--accent-strong);
}

/* ===== 上手流程 ===== */
.hp-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.hp-step {
  padding: 22px;
  position: relative;
}
.hp-step-n {
  display: inline-block;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 1px;
  color: #fff;
  background: var(--accent);
  border: 2px solid var(--line);
  border-radius: 8px;
  padding: 3px 9px;
  margin-bottom: 14px;
}
.hp-step-title {
  font-size: 18px;
  margin-bottom: 6px;
}
.hp-step-desc {
  font-size: 13px;
  color: var(--text);
  line-height: 1.65;
}

/* ===== 行动号召 ===== */
.hp-cta-band {
  margin-top: 52px;
}
.hp-cta-inner {
  background: var(--accent);
  border: 2px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 14px 0 rgba(0, 0, 0, 0.18);
  padding: 44px 32px;
  text-align: center;
  color: #fff;
}
.hp-cta-inner h2 {
  color: #fff;
  font-size: clamp(24px, 3vw, 34px);
}
.hp-cta-inner p {
  margin: 10px 0 22px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 15px;
}
.hp-cta-inner .btn-primary {
  background: #050505;
  color: #fff;
  border-color: #050505;
  box-shadow: 4px 4px 0 #fff;
}
.hp-cta-inner .btn-primary:hover {
  background: #fff;
  color: #050505;
  box-shadow: 4px 4px 0 #050505;
}

/* ===== 响应式 ===== */
@media (max-width: 860px) {
  .hp-hero {
    grid-template-columns: 1fr;
    padding: 30px 24px;
    gap: 24px;
  }
  .hp-hero-art {
    order: -1;
    max-width: 300px;
    margin: 0 auto;
  }
  .hp-feature-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .hp-hero { padding: 24px 18px; }
  .hp-stats { gap: 20px; }
  .hp-stats strong { font-size: 24px; }
  .hp-cta-inner { padding: 34px 20px; }
}

@media (prefers-reduced-motion: reduce) {
  .hp-orbit,
  .hp-chip {
    animation: none;
  }
}
</style>
