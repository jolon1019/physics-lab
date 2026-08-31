<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { findExperiment } from '../data/experiments'
import { getExperiment } from '../data/experimentDetails'
import { useProgressStore } from '../stores/progress'
import { useAuthStore } from '../stores/auth'
import LensLab from '../components/lab/LensLab.vue'
import SpeedLab from '../components/lab/SpeedLab.vue'
import SoundLab from '../components/lab/SoundLab.vue'
import ToneLab from '../components/lab/ToneLab.vue'
import NoiseLab from '../components/lab/NoiseLab.vue'
import MotionLab from '../components/lab/MotionLab.vue'
import VelocityLab from '../components/lab/VelocityLab.vue'
import ThermometerLab from '../components/lab/ThermometerLab.vue'
import MeltingLab from '../components/lab/MeltingLab.vue'
import BoilingLab from '../components/lab/BoilingLab.vue'
import SublimationLab from '../components/lab/SublimationLab.vue'
import ReflectionLab from '../components/lab/ReflectionLab.vue'
import PlaneMirrorLab from '../components/lab/PlaneMirrorLab.vue'
import DensityLab from '../components/lab/DensityLab.vue'
import ForceLab from '../components/lab/ForceLab.vue'
import FrictionLab from '../components/lab/FrictionLab.vue'
import PressureLab from '../components/lab/PressureLab.vue'
import BuoyancyLab from '../components/lab/BuoyancyLab.vue'
import LeverLab from '../components/lab/LeverLab.vue'
import PulleyLab from '../components/lab/PulleyLab.vue'
import PulleySandbox from '../components/lab/PulleySandbox.vue'
import CircuitSimLab from '../components/lab/CircuitSimLab.vue'
import ResistanceLab from '../components/lab/ResistanceLab.vue'
import OhmLab from '../components/lab/OhmLab.vue'
import PowerLab from '../components/lab/PowerLab.vue'
import ElectromagnetLab from '../components/lab/ElectromagnetLab.vue'
import CoilRotateLab from '../components/lab/CoilRotateLab.vue'
import GeometryLab from '../components/lab/GeometryLab.vue'
import CongruentLab from '../components/lab/CongruentLab.vue'
import PythagorasLab from '../components/lab/PythagorasLab.vue'
import MultFormulaLab from '../components/lab/MultFormulaLab.vue'
import QuadraticLab from '../components/lab/QuadraticLab.vue'
import QuadEqLab from '../components/lab/QuadEqLab.vue'
import CircleLab from '../components/lab/CircleLab.vue'
import InverseFuncLab from '../components/lab/InverseFuncLab.vue'
import SimilarLab from '../components/lab/SimilarLab.vue'
import TrigLab from '../components/lab/TrigLab.vue'
import ProbabilityLab from '../components/lab/ProbabilityLab.vue'
import BlockViewsLab from '../components/lab/BlockViewsLab.vue'
import NumberLineLab from '../components/lab/NumberLineLab.vue'
import AuxLineLab from '../components/lab/AuxLineLab.vue'
import BalanceLab from '../components/lab/BalanceLab.vue'
import CoordPlaneLab from '../components/lab/CoordPlaneLab.vue'
import ParallelLinesLab from '../components/lab/ParallelLinesLab.vue'
import DataChartsLab from '../components/lab/DataChartsLab.vue'
import TriAnglesLab from '../components/lab/TriAnglesLab.vue'
import TriSidesLab from '../components/lab/TriSidesLab.vue'
import LinearFuncLab from '../components/lab/LinearFuncLab.vue'

const route = useRoute()
const progress = useProgressStore()
const auth = useAuthStore()

const info = computed(() => findExperiment(route.params.id))
const detail = computed(() => getExperiment(route.params.id))

// 付费门禁：实验被设为会员专享且当前用户非会员/管理员 → 锁定动手操作区（理论仍可看）
const locked = computed(() => auth.isLocked(route.params.id))

const showCognition = ref(false)
const showChallenge = ref(false)

const selected = ref(null)
const answered = ref(false)
const score = ref(0)
const quizDone = ref(false)
const quizIndex = ref(0)

watch(
  () => route.params.id,
  () => {
    showCognition.value = false
    showChallenge.value = false
    selected.value = null
    answered.value = false
    score.value = 0
    quizDone.value = false
    quizIndex.value = 0
  }
)

const currentQuiz = computed(() => (detail.value && detail.value.quiz.length ? detail.value.quiz[quizIndex.value] : null))

function goOperate() {
  showCognition.value = false
  showChallenge.value = false
}

function openCognition() {
  showCognition.value = true
  showChallenge.value = false
}

function openChallenge() {
  showChallenge.value = true
  showCognition.value = false
}

function resetQuiz() {
  selected.value = null
  answered.value = false
  score.value = 0
  quizDone.value = false
  quizIndex.value = 0
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
          <p class="eyebrow">{{ info.grade.label }} · {{ info.type }}实验</p>
          <h2>{{ detail ? detail.title : info.exp.title }}</h2>
          <p class="page-sub">{{ detail ? detail.summary : '实验正在建设中' }}</p>
        </div>

        <div class="exp-stage-tabs">
          <button class="btn" :class="{ 'btn-primary': showCognition }" @click="openCognition">实验理论</button>
          <button class="btn" :class="{ 'btn-primary': showChallenge }" @click="openChallenge">巩固练习</button>
        </div>
      </header>

      <div class="exp-detail-body">
        <!-- 操作台阶（默认窗口）；会员专享实验对非会员锁定 -->
        <section>
          <div v-if="locked" class="panel lock-panel">
            <p class="lock-title">该实验为会员专享</p>
            <p class="lock-sub">开通会员后即可动手操作，实验理论与巩固练习仍然免费开放</p>
            <div class="pay-plans">
              <div class="pay-plan">
                <p class="pay-name">月卡</p>
                <p class="pay-price">¥9.9</p>
                <p class="pay-note">30 天全部实验</p>
              </div>
              <div class="pay-plan">
                <p class="pay-name">年卡</p>
                <p class="pay-price">¥59</p>
                <p class="pay-note">365 天全部实验</p>
              </div>
              <div class="pay-plan">
                <p class="pay-name">永久</p>
                <p class="pay-price">¥99</p>
                <p class="pay-note">一次买断 不过期</p>
              </div>
            </div>
            <p class="pay-tip">选择套餐后，请联系管理员完成支付与开通</p>
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 14px">
              <button v-if="!auth.isLoggedIn" class="btn btn-primary" @click="auth.openLogin(route.fullPath)">登录 / 注册</button>
              <RouterLink v-else to="/resources" class="btn btn-primary">了解会员</RouterLink>
              <RouterLink to="/" class="btn">返回首页</RouterLink>
            </div>
          </div>
          <template v-else>
          <LensLab v-if="detail && detail.id === 'e-lens-camera'" @complete="onLabComplete" />
          <SpeedLab v-else-if="detail && detail.id === 'e-speed'" @complete="onLabComplete" />
          <SoundLab v-else-if="detail && detail.id === 'e-sound'" @complete="onLabComplete" />
          <ToneLab v-else-if="detail && detail.id === 'e-sound-tone'" @complete="onLabComplete" />
          <NoiseLab v-else-if="detail && detail.id === 'e-sound-noise'" @complete="onLabComplete" />
          <MotionLab v-else-if="detail && detail.id === 'e-motion-desc'" @complete="onLabComplete" />
          <VelocityLab v-else-if="detail && detail.id === 'e-velocity'" @complete="onLabComplete" />
          <ThermometerLab v-else-if="detail && detail.id === 'e-temp'" @complete="onLabComplete" />
          <MeltingLab v-else-if="detail && detail.id === 'e-melt'" @complete="onLabComplete" />
          <BoilingLab v-else-if="detail && detail.id === 'e-boil'" @complete="onLabComplete" />
          <SublimationLab v-else-if="detail && detail.id === 'e-sublimate'" @complete="onLabComplete" />
          <ReflectionLab v-else-if="detail && detail.id === 'e-light'" @complete="onLabComplete" />
          <PlaneMirrorLab v-else-if="detail && detail.id === 'e-mirror'" @complete="onLabComplete" />
          <DensityLab v-else-if="detail && detail.id === 'e-density'" @complete="onLabComplete" />
          <ForceLab v-else-if="detail && detail.id === 'e-force'" @complete="onLabComplete" />
          <FrictionLab v-else-if="detail && detail.id === 'e-friction'" @complete="onLabComplete" />
          <PressureLab v-else-if="detail && detail.id === 'e-pressure'" @complete="onLabComplete" />
          <BuoyancyLab v-else-if="detail && detail.id === 'e-buoyancy'" @complete="onLabComplete" />
          <LeverLab v-else-if="detail && detail.id === 'e-lever'" @complete="onLabComplete" />
          <PulleyLab v-else-if="detail && detail.id === 'e-pulley'" @complete="onLabComplete" />
      <PulleySandbox v-else-if="detail && detail.id === 'e-pulley-sandbox'" @complete="onLabComplete" />
          <CircuitSimLab v-else-if="detail && detail.id === 'e-circuit'" @complete="onLabComplete" />
          <ResistanceLab v-else-if="detail && detail.id === 'e-resistance'" @complete="onLabComplete" />
          <OhmLab v-else-if="detail && detail.id === 'e-ohm'" @complete="onLabComplete" />
          <PowerLab v-else-if="detail && detail.id === 'e-power'" @complete="onLabComplete" />
          <ElectromagnetLab v-else-if="detail && detail.id === 'e-magnet'" @complete="onLabComplete" />
<CoilRotateLab v-else-if="detail && detail.id === 'e-coil-rotation'" @complete="onLabComplete" />
          <GeometryLab v-else-if="detail && detail.id === 'e-geometry-transform'" @complete="onLabComplete" />
          <CongruentLab v-else-if="detail && detail.id === 'e-congruent-tri'" @complete="onLabComplete" />
          <PythagorasLab v-else-if="detail && detail.id === 'e-pythagoras'" @complete="onLabComplete" />
          <MultFormulaLab v-else-if="detail && detail.id === 'e-mult-formula'" @complete="onLabComplete" />
          <QuadraticLab v-else-if="detail && detail.id === 'e-quadratic-func'" @complete="onLabComplete" />
          <QuadEqLab v-else-if="detail && detail.id === 'e-quad-eq'" @complete="onLabComplete" />
          <CircleLab v-else-if="detail && detail.id === 'e-circle'" @complete="onLabComplete" />
          <InverseFuncLab v-else-if="detail && detail.id === 'e-inverse-func'" @complete="onLabComplete" />
          <SimilarLab v-else-if="detail && detail.id === 'e-similar-tri'" @complete="onLabComplete" />
          <TrigLab v-else-if="detail && detail.id === 'e-trig-func'" @complete="onLabComplete" />
          <ProbabilityLab v-else-if="detail && detail.id === 'e-probability'" @complete="onLabComplete" />
          <BlockViewsLab v-else-if="detail && detail.id === 'e-block-views'" @complete="onLabComplete" />
          <NumberLineLab v-else-if="detail && detail.id === 'e-num-line'" @complete="onLabComplete" />
          <AuxLineLab v-else-if="detail && detail.id === 'e-aux-lines'" @complete="onLabComplete" />
          <BalanceLab v-else-if="detail && detail.id === 'e-linear-eq'" @complete="onLabComplete" />
          <CoordPlaneLab v-else-if="detail && detail.id === 'e-coord-plane'" @complete="onLabComplete" />
          <ParallelLinesLab v-else-if="detail && detail.id === 'e-parallel-lines'" @complete="onLabComplete" />
          <DataChartsLab v-else-if="detail && detail.id === 'e-data-charts'" @complete="onLabComplete" />
          <TriAnglesLab v-else-if="detail && detail.id === 'e-tri-angles'" @complete="onLabComplete" />
          <TriSidesLab v-else-if="detail && detail.id === 'e-tri-sides'" @complete="onLabComplete" />
          <LinearFuncLab v-else-if="detail && detail.id === 'e-linear-func'" @complete="onLabComplete" />
          <!-- 会员门禁：后台勾选为"会员专享"的实验，对非会员锁定 -->
          <div v-else-if="auth.isLocked(route.params.id)" class="panel lock-panel">
            <h3>该实验为会员专享</h3>
            <p class="lock-desc">当前实验仅对会员账号开放。免费账号可浏览实验理论与巩固练习，动手实验需要会员权限。</p>
            <div class="pay-plans">
              <div class="pay-plan">
                <p class="pay-name">月卡</p>
                <p class="pay-price">¥9.9</p>
                <p class="pay-note">30 天全部实验</p>
              </div>
              <div class="pay-plan">
                <p class="pay-name">年卡</p>
                <p class="pay-price">¥59</p>
                <p class="pay-note">365 天全部实验</p>
              </div>
              <div class="pay-plan">
                <p class="pay-name">永久</p>
                <p class="pay-price">¥99</p>
                <p class="pay-note">一次买断 不过期</p>
              </div>
            </div>
            <p class="pay-tip">选择套餐后，请联系管理员完成支付与开通</p>
            <div class="lock-status">
              <template v-if="!auth.isLoggedIn">
                <button class="btn btn-primary" @click="auth.openLogin(route.fullPath)">登录账号</button>
                <span class="lock-tip">登录后若仍为免费账号，请联系管理员开通会员</span>
              </template>
              <template v-else>
                <span class="lock-tip">当前账号：{{ auth.user?.email }}（免费用户）——请联系管理员升级为会员</span>
              </template>
            </div>
          </div>
          <p v-else>该实验仿真打磨中，先进入「巩固练习」。</p>
          </template>
        </section>
      </div>
    </section>

    <!-- 认知台阶（弹出窗口） -->
    <div v-if="showCognition" class="stage-pop-mask" @click.self="showCognition = false">
      <div class="stage-pop-modal" role="dialog" aria-modal="true">
        <header class="stage-pop-head">
          <h3 style="font-size:18px">实验认知 · 核心模型与操作步骤</h3>
          <button class="btn btn-sm" @click="showCognition = false">关闭 ✕</button>
        </header>

        <div class="stage-pop-body">
          <div v-if="detail && detail.coreModel" class="stage-pop-model">
            <p style="font-size:13px;color:var(--accent);font-weight:700;margin-bottom:6px">核心模型</p>
            <p style="font-family:var(--mono);font-size:18px;color:var(--text-h);margin-bottom:6px">{{ detail.coreModel.formula }}</p>
            <p style="font-size:14px">{{ detail.coreModel.desc }}</p>
          </div>

          <div v-if="detail">
            <p style="font-size:13px;color:var(--accent-strong);font-weight:700;margin-bottom:8px">操作步骤</p>
            <div class="steps-list">
              <div v-for="(s, i) in detail.steps" :key="i" class="step-item">
                <span class="step-num"></span>
                <p>{{ s }}</p>
              </div>
            </div>
          </div>
          <p v-else class="empty">该实验步骤维护中</p>

          <div v-if="detail && detail.errors && detail.errors.length" style="margin-top:20px">
            <p style="font-size:13px;color:var(--danger);font-weight:700;margin-bottom:8px">常见误区（考前必看）</p>
            <div
              v-for="(e, i) in detail.errors"
              :key="i"
              style="display:flex;gap:8px;padding:8px 12px;border-left:3px solid var(--danger);background:var(--danger-bg);border-radius:6px;margin-bottom:8px"
            >
              <p style="font-size:14px">{{ e }}</p>
            </div>
          </div>
        </div>

        <footer class="stage-pop-foot">
          <button class="btn btn-primary btn-block" @click="showCognition = false">读完了，开始操作 →</button>
        </footer>
      </div>
    </div>

    <!-- 挑战台阶（弹出窗口） -->
    <div v-if="showChallenge" class="stage-pop-mask" @click.self="showChallenge = false">
      <div class="stage-pop-modal" role="dialog" aria-modal="true">
        <header class="stage-pop-head">
          <h3 style="font-size:18px">巩固练习 · 实验挑战</h3>
          <button class="btn btn-sm" @click="showChallenge = false">关闭 ✕</button>
        </header>

        <div class="stage-pop-body">
          <template v-if="currentQuiz">
            <p style="color:var(--text-dim);font-size:13px;margin-bottom:12px">
              已答对 {{ score }}/{{ detail.quiz.length }} · 第 {{ quizIndex + 1 }} / {{ detail.quiz.length }} 题
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
              {{ selected === currentQuiz.answer ? '回答正确！' : '回答错误' }}
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
              本实验完成！正确 {{ score }}/{{ detail.quiz.length }}
              <template v-if="score < detail.quiz.length">
                ，错题对应误区已在「认知」弹窗中标出，建议再读一遍。
              </template>
            </div>
          </template>
          <p v-else class="empty">练习题库维护中</p>
        </div>

        <footer class="stage-pop-foot">
          <button class="btn" @click="resetQuiz">重新练习</button>
          <button class="btn btn-primary" @click="showChallenge = false">收起，回操作台 →</button>
        </footer>
      </div>
    </div>
  </div>
  <div v-else class="empty">未找到该实验</div>
</template>

<style scoped>
/* 会员专享锁定面板 */
.lock-panel {
  padding: 42px 20px;
  text-align: center;
}
.lock-title { font-size: 20px; font-weight: 900; margin: 10px 0 6px; }
.lock-sub { color: var(--text-dim); font-size: 13.5px; margin: 0; }

/* 支付套餐提示 */
.pay-plans {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 20px 0 4px;
}
.pay-plan {
  min-width: 118px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-3);
}
.pay-name { font-size: 13px; font-weight: 700; color: var(--text-dim); margin: 0; }
.pay-price {
  font-size: 22px;
  font-weight: 900;
  margin: 6px 0 2px;
  color: var(--accent-strong, #b8860b);
}
.pay-note { font-size: 12px; color: var(--text-dim); margin: 0; }
.pay-tip {
  font-size: 12.5px;
  color: var(--text-dim);
  margin: 10px 0 0;
}
.stage-pop-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.55);
}

.stage-pop-modal {
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  max-height: min(82vh, 780px);
  overflow: hidden;
  border: 2px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 10px 10px 0 rgba(0, 0, 0, 0.35);
}

.stage-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 2px solid var(--line);
  background: var(--surface-3);
}

.stage-pop-body {
  padding: 20px 18px;
  overflow: auto;
}

.stage-pop-model {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  background: var(--accent-bg);
}

.stage-pop-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px;
  border-top: 2px solid var(--line);
  background: var(--surface-3);
}

/* 会员专享锁定面板 */
.lock-panel {
  text-align: center;
  padding: 42px 24px;
}
.lock-panel h3 { font-size: 19px; font-weight: 900; }
.lock-desc {
  font-size: 13.5px;
  color: var(--text-dim, #777);
  max-width: 420px;
  margin: 8px auto 16px;
  line-height: 1.7;
}
.lock-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}
.lock-tip { font-size: 13px; color: var(--text-2, #888); }

/* 背景切换按钮已移至全局顶栏（App.vue） */
</style>