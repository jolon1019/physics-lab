<script setup>
defineProps({
  title: { type: String, default: '公式与结果' },
  formula: { type: String, default: '' },
  desc: { type: String, default: '' },
  rows: { type: Array, default: () => [] },
  result: { type: Array, default: () => [] },
  verify: { type: Array, default: () => [] }
})
</script>

<template>
  <div class="lab-panel">
    <div class="lab-panel-head">
      <strong>{{ title }}</strong>
      <span>实时计算</span>
    </div>

    <div style="padding:8px 16px">
      <p style="font-family:var(--mono);font-size:18px;color:var(--text-h);padding:8px 12px;background:var(--accent-bg);border-radius:8px;display:inline-block;margin:4px 0 8px">
        {{ formula }}
      </p>
      <p v-if="desc" style="font-size:13px;color:var(--text-dim);margin-bottom:10px">{{ desc }}</p>

      <!-- 代入的变量值 -->
      <div v-if="rows.length" style="display:grid;gap:6px;margin-bottom:10px">
        <div
          v-for="(r, i) in rows"
          :key="i"
          style="display:flex;justify-content:space-between;align-items:baseline;font-size:14px"
        >
          <span style="color:var(--text)">{{ r.label }}</span>
          <span style="font-weight:700;color:var(--text-h);font-family:var(--mono)">{{ r.value }}</span>
        </div>
      </div>

      <!-- 计算结果 -->
      <div v-if="result.length" style="display:grid;gap:6px;border-top:1px dashed var(--border);padding-top:10px">
        <div
          v-for="(r, i) in result"
          :key="i"
          style="display:flex;justify-content:space-between;align-items:baseline;font-size:14px"
        >
          <span style="color:var(--text)">{{ r.label }}</span>
          <span style="font-weight:800;color:var(--accent);font-family:var(--mono)">{{ r.value }}</span>
        </div>
      </div>
    </div>

    <!-- 求证方法 -->
    <div v-if="verify.length" style="border-top:1px solid var(--line);padding:12px 16px;background:var(--surface-3)">
      <p style="font-size:12px;color:var(--success);font-weight:700;margin-bottom:8px">🔎 求证方法</p>
      <div
        v-for="(v, i) in verify"
        :key="i"
        style="display:flex;gap:8px;font-size:13px;color:var(--text);padding:4px 0"
      >
        <span style="color:var(--success)">✔</span>
        <span>{{ v }}</span>
      </div>
    </div>
  </div>
</template>