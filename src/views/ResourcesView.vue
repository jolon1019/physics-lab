<script setup>
// 试卷资料库：嵌入抖音《自主自学》的腾讯文档分享库
// 文档在腾讯侧更新，这里实时同步，无需维护两份数据
import { onBeforeUnmount, onMounted } from 'vue'

const DOC_URL = 'https://docs.qq.com/sheet/DSnRwYVRjcUJLUmZR?tab=BB08J2'

// 外层页面锁定：进入本页时禁止整页滚动（滚轮/触控板只作用于内嵌文档），
// 页面以 flex 撑满一屏，iframe 占据剩余高度、在文档内部滚动
onMounted(() => document.documentElement.classList.add('res-lock'))
onBeforeUnmount(() => document.documentElement.classList.remove('res-lock'))
</script>

<template>
  <section class="res-card card">
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

<!-- 非 scoped：资料库锁定态要作用到 html/body 与全局布局类（仅在 html.res-lock 时生效） -->
<style>
html.res-lock,
html.res-lock body {
  overflow: hidden;
  height: 100%;
}
html.res-lock .app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
html.res-lock .workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  margin: 14px auto 10px;
  min-height: 0;
}
html.res-lock .main-grid {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
html.res-lock .res-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
html.res-lock .res-frame {
  flex: 1;
  height: auto;
  min-height: 0;
}
</style>
