import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // 将依赖优化缓存移出 node_modules，避免安全删除钩子拦截优化器清理临时目录导致 dev 崩溃
  cacheDir: '.vite-cache',
  optimizeDeps: {
    include: [
      'three',
      'three/examples/jsm/environments/RoomEnvironment.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js'
    ]
  },
  server: {
    proxy: {
      // 将 /api 转发到本地鉴权后端（server/index.mjs，默认 3001）
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
