<script setup>
// 按原试卷版式渲染单个题目：题号+分值、题干、表格、选项、配图
// 配图均已程序化重绘（照片类除外），统一放在题目下方
import { computed } from 'vue'
import { fmtMath } from '../data/questionBank'

const props = defineProps({
  question: { type: Object, required: true }
})

const q = computed(() => props.question)
const stemHtml = computed(() => fmtMath(q.value.stemFull || q.value.stem))
const afterHtml = computed(() => (q.value.stemAfter ? fmtMath(q.value.stemAfter) : ''))
// 原卷中仅解答题在题号后标注分值（选择题/填空题分值写在大题标题里）
const inlineScore = computed(() => q.value.type === '解答题')
</script>

<template>
  <article :id="q.id" class="pq">
    <p class="pq-stem">
      <span class="pq-no">{{ q.number }}.</span>
      <span v-if="inlineScore" class="pq-score">（{{ q.score }}分）</span>
      <span class="pq-text" v-html="stemHtml"></span>
    </p>
    <table v-if="q.table" class="pq-table">
      <thead>
        <tr><th v-for="c in q.table.cols" :key="c">{{ c }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in q.table.rows" :key="i">
          <td v-for="(cell, j) in row" :key="j">{{ cell }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="afterHtml" class="pq-after" v-html="afterHtml"></p>
    <div v-if="q.options" class="pq-opts">
      <span v-for="opt in q.options" :key="opt[0]" class="pq-opt">
        <b>{{ opt[0] }}.</b>{{ opt[1] }}
      </span>
    </div>
    <div v-if="q.figures" class="pq-figs-below">
      <figure v-for="f in q.figures" :key="f.src">
        <img :src="f.src" :alt="q.id + ' 配图'" />
        <figcaption v-if="f.caption">{{ f.caption }}</figcaption>
      </figure>
    </div>
  </article>
</template>

<style scoped>
.pq {
  padding: 14px 2px 10px;
  break-inside: avoid;
}
.pq-no {
  font-weight: 700;
}
.math-tri {
  font-size: 1.3em;
  line-height: 0;
}
.pq-score {
  font-weight: 700;
}
.pq-stem {
  margin: 0;
  font-size: 14px;
  line-height: 1.9;
  color: #111;
}
.pq-table {
  margin: 10px auto 4px;
  border-collapse: collapse;
  font-size: 13.5px;
}
.pq-table th,
.pq-table td {
  border: 1px solid #444;
  padding: 5px 16px;
  line-height: 1.7;
  text-align: center;
}
.pq-table th {
  font-weight: 700;
  background: #f5f5f5;
}
.pq-after {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.9;
  color: #111;
}
.pq-opts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 18px;
  margin-top: 6px;
}
.pq-opt {
  font-size: 14px;
  line-height: 1.9;
  color: #111;
}
.pq-opt b {
  font-weight: 700;
  margin-right: 3px;
}
.pq-figs-below {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 28px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.pq-figs-below figure {
  margin: 0;
  text-align: center;
}
.pq-figs-below img {
  max-width: min(100%, 420px);
  max-height: 300px;
  height: auto;
}
.pq-figs-below figcaption {
  margin-top: 4px;
  font-size: 13px;
  color: #111;
}

@media (max-width: 720px) {
  .pq-opts { grid-template-columns: 1fr; }
}
</style>
