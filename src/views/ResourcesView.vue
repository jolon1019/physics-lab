<script setup>
// 试卷资料库：嵌入抖音《自主自学》的腾讯文档分享库
// 文档在腾讯侧更新，这里实时同步，无需维护两份数据
const DOC_URL = 'https://docs.qq.com/sheet/DSnRwYVRjcUJLUmZR?tab=BB08J2'
</script>

<template>
  <h2 class="page-title">试卷资料库</h2>
  <p class="page-sub">来自抖音「自主自学」的试卷与视频课分享库，持续更新中</p>

  <section class="res-card card">
    <div class="res-bar">
      <div class="res-info">
        <strong>自主自学资料库</strong>
        <span>视频课 · 试卷 · 按机构分类整理（洋葱学院 / 希望学 / 作业帮 等）</span>
      </div>
      <div class="res-actions">
        <a class="btn" :href="DOC_URL" target="_blank" rel="noopener">新窗口打开</a>
      </div>
    </div>
    <iframe
      class="res-frame"
      :src="DOC_URL"
      title="自主自学资料库"
      loading="lazy"
      allow="clipboard-write"
    ></iframe>
    <p class="res-tip">
      资料库由腾讯文档承载：手机端可点击右上角「登录腾讯文档」收藏后离线查看；
      网盘链接复制到浏览器打开即可转存。
    </p>
  </section>
</template>

<style scoped>
.res-card {
  padding: 0;
  overflow: hidden;
}
.res-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border-bottom: 2px solid var(--line);
}
.res-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.res-info strong {
  font-size: 16px;
}
.res-info span {
  font-size: 12px;
  color: var(--text-2);
}
.res-actions {
  display: flex;
  gap: 8px;
}
.res-frame {
  display: block;
  width: 100%;
  height: min(72vh, 760px);
  border: 0;
  background: #fff;
}
.res-tip {
  margin: 0;
  padding: 10px 16px 14px;
  font-size: 12px;
  color: var(--text-2);
  border-top: 2px solid var(--line);
}
@media (max-width: 720px) {
  .res-frame {
    height: 78vh;
  }
}
</style>
