<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { findExperiment } from '../data/experiments'
import { getExperiment } from '../data/experimentDetails'
import { useProgressStore } from '../stores/progress'
import LensLab from '../components/lab/LensLab.vue'
import SpeedLab from '../components/lab/SpeedLab.vue'

const route = useRoute()
const progress = useProgressStore()

const info = computed(() => findExperiment(route.params.id))
const detail = computed(() => getExperiment(route.params.id))

const stage = ref('认知')
const stages = ['认知', '操作', '挑战']

const selected = ref(null)
const answered = ref(false)
const score = ref(0)
const quizDone = ref(false)
const quizIndex = ref(0)

watch(
  () => route.params.id,
  () => {
    stage.value = '认知'
    selected.value = null
    answered.value = false
    score.value = 0
    quizDone.value = false
    quizIndex.value = 0
  }
)

const currentQuiz = computed(() => (detail.value && detail.value.quiz.length ? detail.value.quiz[quizIndex.value] : null))

function setStage(s) {
  if (s === '操作' && !detail.value) return
  stage.value = s
}

function onLabComplete() {
  progress.markCompleted(route.params.id)
}

function choose(idx) {
  if (answered.value) return
  selected.value = idx
  answered.value = true
  const correct = idx === currentQuiz.value.answer
  progress.recordAnswer(route.params.id, correct)
}

function nextQuiz() {
  if (selected.value === currentQuiz.value.answer) score.value += 1
  if (quizIndex.value < detail.value.quiz.length - 1) {
    quizIndex.value += 1
    selected.value = null
    answered.value = false
  } else {
    quizDone.value = true
    progress.markCompleted(route.params.id)
  }
}
</script>

<template>
  <div v-if="info">
    <section class="panel exp-detail">
      <header class="exp-detail-head">
        <div>
          <p class="eyebrow">{{ info.chapter.title }} · {{ info.grade.label }} · {{ info.type }}实验</p>
          <h2>{{ detail ? detail.title : info.exp.title }}</h2>
          <p class="page-sub">{{ detail ? detail.summary : '实验正在建设中' }}</p>
        </div>

        <div class="exp-stage-tabs">
          <button
            v-for="s in stages"
            :key="s"
            class="btn"
            :class="{ 'btn-primary': stage === s }"
            @click="setStage(s)"
          >
            {{ ['认知', '操作', '挑战'][stages.indexOf(s)] }}台阶
          </button>
        </div>
      </header>

      <div class="exp-detail-body">
        <!-- 认知台阶 -->
        <section v-if="stage === '认知'">
          <h3 style="margin-bottom:16px">📖 实验认知 · 核心模型与操作步骤</h3>

          <div v-if="detail && detail.coreModel" style="background:var(--accent-bg);border:1px solid var(--accent-border);border-radius:12px;padding:16px;margin-bottom:20px">
            <p style="font-size:13px;color:var(--accent);font-weight:700;margin-bottom:6px">🧮 核心模型</p>
            <p style="font-family:var(--mono);font-size:18px;color:var(--text-h);margin-bottom:6px">{{ detail.coreModel.formula }}</p>
            <p style="font-size:14px">{{ detail.coreModel.desc }}</p>
          </div>

          <div class="steps-list" v-if="detail">
            <div v-for="(s, i) in detail.steps" :key="i" class="step-item">
              <span class="step-num"></span>
              <p>{{ s }}</p>
            </div>
          </div>
          <p v-else class="empty">该实验步骤维护中</p>

          <div v-if="detail && detail.errors && detail.errors.length" style="margin-top:20px">
            <p style="font-size:13px;color:var(--danger);font-weight:700;margin-bottom:8px">⚠️ 常见误区（考前必看）</p>
            <div
              v-for="(e, i) in detail.errors"
              :key="i"
              style="display:flex;gap:8px;padding:8px 12px;border-left:3px solid var(--danger);background:var(--danger-bg);border-radius:6px;margin-bottom:8px"
            >
              <p style="font-size:14px">{{ e }}</p>
            </div>
          </div>
        </section>

        <!-- 操作台阶 -->
        <section v-if="stage === '操作'">
          <LensLab v-if="detail && detail.id === 'e-lens-camera'" @complete="onLabComplete" />
          <SpeedLab v-else-if="detail && detail.id === 'e-speed'" @complete="onLabComplete" />
          <p v-else>该实验仿真打磨中，先进入「挑战」台阶练习。</p>
        </section>

        <!-- 挑战台阶 -->
        <section v-if="stage === '挑战'">
          <template v-if="currentQuiz">
            <h3 style="margin-bottom:4px">🏆 巩固练习（已答对 {{ score }}/{{ detail.quiz.length }}）</h3>
            <p style="color:var(--text-dim);font-size:13px;margin-bottom:12px">
              第 {{ quizIndex + 1 }} / {{ detail.quiz.length }} 题
            </p>
            <p style="color:var(--text-h);font-size:16px;font-weight:600;margin-bottom:16px">{{ currentQuiz.q }}</p>
            <div style="display:grid;gap:10px">
              <button
                v-for="(opt, idx) in currentQuiz.options"
                :key="idx"
                class="quiz-option"
                :class="{ correct: answered && idx === currentQuiz.answer, wrong: answered && selected === idx && idx !== currentQuiz.answer }"
                @click="choose(idx)"
              >
                {{ String.fromCharCode(65 + idx) }}. {{ opt }}
              </button>
            </div>

            <div v-if="answered" class="feedback" :class="selected === currentQuiz.answer ? 'ok' : 'no'">
              {{ selected === currentQuiz.answer ? '✅ 回答正确！' : '❌ 回答错误' }}
              <br />解析：{{ currentQuiz.explain }}
            </div>

            <button
              v-if="answered && !quizDone"
              class="btn btn-primary btn-block"
              style="margin-top:16px"
              @click="nextQuiz"
            >
              {{ quizIndex < detail.quiz.length - 1 ? '下一题 →' : '提交并完成本实验' }}
            </button>

            <div v-if="quizDone" class="feedback ok" style="margin-top:16px">
              🎉 本实验完成！正确 {{ score }}/{{ detail.quiz.length }}
              <template v-if="score < detail.quiz.length">
                ，错题对应误区已在「认知」页标出，建议再读一遍。
              </template>
            </div>
          </template>
          <p v-else class="empty">练习题库维护中</p>
        </section>

        <RouterLink to="/record" class="btn btn-block" style="margin-top:24px">查看学习记录 →</RouterLink>
      </div>
    </section>
  </div>
  <div v-else class="empty">未找到该实验</div>
</template>