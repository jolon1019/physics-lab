// 统一移动端布局验证：启动 vite + headless Chrome（移动视口 390x844），
// 依次加载多个互动实验，断言每个都满足：
// (1) 无 JS 异常；(2) .lab-left 为 sticky（动画+控制列吸顶）；
// (3) .lab-right 内部滚动已解除（整页可滚）；(4) 动画媒体不塌陷(高度>200)；
// (5) 上滑后 .lab-left 吸顶（rect.top ≈ 顶栏高）。
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const PORT = 5173
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const ROUTES = [
  '/experiment/e-coil-rotation',
  '/experiment/e-lens-camera',
  '/experiment/e-force'
]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function waitServer() {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = async () => {
      try { const res = await fetch(`http://127.0.0.1:${PORT}/`); if (res.ok) return resolve(true) } catch {}
      if (Date.now() - start > 30000) return reject(new Error('vite 启动超时'))
      setTimeout(tick, 500)
    }
    tick()
  })
}
async function getPageWs() {
  const start = Date.now()
  while (Date.now() - start < 15000) {
    try {
      const list = await (await fetch('http://127.0.0.1:9222/json')).json()
      const page = list.find((t) => t.type === 'page')
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(300)
  }
  throw new Error('未找到 page 目标')
}

function main() {
  const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT)], { cwd: process.cwd(), stdio: 'ignore', env: process.env })
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--remote-debugging-port=9222', '--no-proxy-server', '--proxy-bypass-list=*',
    '--user-data-dir=' + fs.mkdtempSync('C:/Users/Administrator/AppData/Local/Temp/cdp-mobile-'),
    'about:blank'
  ], { stdio: 'ignore' })

  const errors = []
  let exitCode = 0
  const cleanup = () => { try { vite.kill('SIGTERM') } catch {} try { chrome.kill('SIGTERM') } catch {} }

  ;(async () => {
    try {
      await waitServer()
      await sleep(500)
      const wsUrl = await getPageWs()
      const ws = new WebSocket(wsUrl)
      const pending = new Map()
      let msgId = 0
      const cdp = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++msgId
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
      ws.addEventListener('error', (e) => errors.push('ws.error: ' + (e.message || 'unknown')))
      ws.addEventListener('message', (ev) => {
        const m = JSON.parse(ev.data)
        if (m.id && pending.has(m.id)) {
          const { resolve, reject } = pending.get(m.id)
          pending.delete(m.id)
          if (m.error) reject(new Error(m.error.message)); else resolve(m.result)
          return
        }
        if (m.method === 'Runtime.exceptionThrown')
          errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text))
      })
      await new Promise((res) => { ws.addEventListener('open', res) })
      await cdp('Runtime.enable'); await cdp('Page.enable')
      await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, isTouch: true })

      for (const route of ROUTES) {
        const URL = `http://127.0.0.1:${PORT}${route}`
        await cdp('Page.navigate', { url: URL })
        let mounted = false
        for (let i = 0; i < 40; i++) {
          await sleep(500)
          const chk = await cdp('Runtime.evaluate', {
            expression: `(function(){
              const left = document.querySelector('.lab-left');
              if (!left) return false;
              const c = document.querySelector('.lab-container');
              const cv = document.querySelector('.lab-left .lab-panel canvas');
              const mediaH = Math.max(c ? c.clientHeight : 0, cv ? cv.clientHeight : 0);
              return mediaH > 0;
            })()`,
            returnByValue: true
          })
          if (chk.result.value) { mounted = true; break }
        }
        if (!mounted) { errors.push(route + ' 未在 20s 内挂载或动画媒体缺失'); exitCode = 1; continue }

        const diag = await cdp('Runtime.evaluate', {
          expression: `(function(){
            const left = document.querySelector('.lab-left');
            const right = document.querySelector('.lab-right');
            const c = document.querySelector('.lab-container');
            const cv = document.querySelector('.lab-left .lab-panel canvas');
            const ss = document.querySelector('.lab-left .lab-container .stage-svg');
            const cs = left ? getComputedStyle(left) : null;
            const rs = right ? getComputedStyle(right) : null;
            const topbar = parseInt(getComputedStyle(document.querySelector('.topbar')).height) || 76;
            const stickTop = getComputedStyle(document.documentElement).getPropertyValue('--lab-stick-top').trim();
            const mediaH = Math.max(c ? c.clientHeight : 0, cv ? cv.clientHeight : 0);
            return {
              leftPos: cs && cs.position, leftZ: cs && cs.zIndex,
              rightOverflowY: rs && rs.overflowY, rightMaxH: rs && rs.maxHeight,
              mediaH: mediaH,
              stageSvgH: ss ? ss.clientHeight : null,
              topbar: topbar, stickTop: stickTop
            };
          })()`,
          returnByValue: true
        })
        console.log('DIAG ' + route + ' ' + JSON.stringify(diag.result.value))
        const d = diag.result.value
        if (d.leftPos !== 'sticky') { errors.push(route + ' 动画舞台未吸顶 (position=' + d.leftPos + ')'); exitCode = 1 }
        if (d.rightOverflowY === 'auto' || (d.rightMaxH && d.rightMaxH !== 'none')) { errors.push(route + ' 右侧内部滚动未解除'); exitCode = 1 }
        if (!(d.mediaH > 200)) { errors.push(route + ' 动画媒体塌陷 (mediaH=' + d.mediaH + ')'); exitCode = 1 }

        await cdp('Runtime.evaluate', { expression: 'window.scrollTo(0, 400)', returnByValue: true })
        await sleep(400)
        const stick = await cdp('Runtime.evaluate', {
          expression: `(function(){ const r = document.querySelector('.lab-left').getBoundingClientRect(); const t = parseInt(getComputedStyle(document.querySelector('.topbar')).height)||76; return { top: Math.round(r.top), topbar: t }; })()`,
          returnByValue: true
        })
        console.log('STICK ' + route + ' ' + JSON.stringify(stick.result.value))
        const s = stick.result.value
        if (Math.abs(s.top - s.topbar) > 4) { errors.push(route + ' 上滑后未吸顶 (rect.top=' + s.top + ' 期望≈' + s.topbar + ')'); exitCode = 1 }
        await cdp('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)', returnByValue: true })
      }

      ws.close()
    } catch (e) {
      errors.push('FATAL: ' + e.message); exitCode = 1
    } finally { cleanup() }
    console.log('ERRORS ' + (errors.length ? JSON.stringify(errors) : 'NONE'))
    process.exit(exitCode)
  })()
}
main()
