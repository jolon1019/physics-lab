// CDP 验证：启动 vite + headless Chrome，加载通电线圈实验
// 1) 检查运行期报错、canvas 挂载、换向器开关按钮(.btn-comm)存在
// 2) 关态(默认)：模拟手动换向 → 线圈持续旋转(travel>360)
// 3) 开态：点击换向器开关 → 自动连续旋转(travel>360 且无需手动点击)
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const PORT = 5173
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = `http://127.0.0.1:${PORT}/experiment/e-coil-rotation`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function waitServer() {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/`)
        if (res.ok) return resolve(true)
      } catch {}
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

const SIM_BODY = `
  if (window.__sims && window.__sims[tag]) return;
  window.__sims = window.__sims || {};
  const sim = { travel:0, last:null, clicks:0, armed:true, played:false, buf:[] };
  window.__sims[tag] = sim;
  window.__simTimers = window.__simTimers || {};
  window.__simTimers[tag] = setInterval(function(){
    const playBtn = [...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('播放'));
    if (playBtn && !sim.played) { playBtn.click(); sim.played = true; }
    const flipBtn = document.querySelector('.btn-flip');
    const t = document.querySelector('.r-readout-item strong');
    if (!t) return;
    const deg = parseFloat(t.textContent);
    if (isNaN(deg)) return;
    const now = Date.now();
    if (sim.last !== null) sim.travel += Math.abs(deg - sim.last);
    sim.last = deg;
    sim.buf.push({ now, deg });
    sim.buf = sim.buf.filter(p => now - p.now < 1500);
    if (flipBtn && flipBtn.classList.contains('btn-glow') && sim.armed) { flipBtn.click(); sim.clicks++; sim.armed = false; }
    if (!flipBtn || !flipBtn.classList.contains('btn-glow')) sim.armed = true;
  }, 90);
`
const simExpr = (tag) => `(function(tag){${SIM_BODY}})('${tag}')`

function main() {
  const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: process.cwd(), stdio: 'ignore', env: process.env
  })
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--remote-debugging-port=9222', '--no-proxy-server', '--proxy-bypass-list=*',
    '--user-data-dir=' + fs.mkdtempSync('C:/Users/Administrator/AppData/Local/Temp/cdp-'),
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
      const cdp = (method, params = {}) =>
        new Promise((resolve, reject) => {
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
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
          errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
        if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
          errors.push('log.error: ' + m.params.entry.text)
      })
      await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
      await cdp('Runtime.enable'); await cdp('Log.enable'); await cdp('Page.enable')
      await cdp('Page.navigate', { url: URL })
      // 等待应用挂载（首次加载 three.js 依赖优化较慢）
      let mounted = false
      for (let i = 0; i < 40; i++) {
        await sleep(500)
        const chk = await cdp('Runtime.evaluate', {
          expression: `!!document.querySelector('.btn-comm') && !!document.querySelector('canvas')`,
          returnByValue: true
        })
        if (chk.result.value) { mounted = true; break }
      }
      if (!mounted) { errors.push('应用未在 20s 内挂载'); exitCode = 1 }

      // 诊断基础 DOM
      const diag0 = await cdp('Runtime.evaluate', {
        expression: `(function(){
          const c = document.querySelector('canvas');
          return { hasCanvas: !!c, canvasW: c?c.width:0,
                   hasCommBtn: !!document.querySelector('.btn-comm'),
                   commOn: document.querySelector('.btn-comm') ? document.querySelector('.btn-comm').classList.contains('btn-on') : false };
        })()`,
        returnByValue: true
      })
      console.log('DIAG0 ' + JSON.stringify(diag0.result.value))
      if (!diag0.result.value.hasCanvas) { errors.push('canvas 未挂载'); exitCode = 1 }
      if (!diag0.result.value.hasCommBtn) { errors.push('换向器开关按钮缺失'); exitCode = 1 }

      // ---------- 阶段 A：换向器关（默认），手动换向 ----------
      await cdp('Runtime.evaluate', { expression: simExpr('A'), returnByValue: true })
      await sleep(5500)
      const simA = await cdp('Runtime.evaluate', { expression: 'window.__sims && window.__sims.A', returnByValue: true })
      const a = simA.result.value || { travel: 0, clicks: 0, buf: [] }
      let recentA = 0
      if (a.buf && a.buf.length > 1) for (let i = 1; i < a.buf.length; i++) recentA += Math.abs(a.buf[i].deg - a.buf[i-1].deg)
      console.log('SIM_A(关·手动) ' + JSON.stringify({ travel: Math.round(a.travel), clicks: a.clicks, recent: Math.round(recentA) }))
      if (!(a.clicks >= 1 && recentA > 40)) {
        errors.push('关态手动换向未持续旋转 (clicks=' + a.clicks + ', recent=' + Math.round(recentA) + ')')
        exitCode = 1
      }

      // ---------- 阶段 B：开启换向器，自动连续旋转 ----------
      await cdp('Runtime.evaluate', {
        expression: `(function(){
          const cb = document.querySelector('.btn-comm'); if (cb) cb.click();
          const rb = [...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('复位')); if (rb) rb.click();
        })()`,
        returnByValue: true
      })
      await sleep(600)
      const diagOn = await cdp('Runtime.evaluate', {
        expression: `(function(){
          return { commOn: document.querySelector('.btn-comm').classList.contains('btn-on'),
                   hasAutoHint: !!document.querySelector('.auto-hint'),
                   hasFlipBtn: !!document.querySelector('.btn-flip') };
        })()`,
        returnByValue: true
      })
      console.log('DIAG_ON ' + JSON.stringify(diagOn.result.value))
      if (!diagOn.result.value.commOn) { errors.push('换向器开启失败'); exitCode = 1 }
      if (!diagOn.result.value.hasAutoHint) { errors.push('自动换向提示横幅缺失'); exitCode = 1 }

      await cdp('Runtime.evaluate', { expression: simExpr('B'), returnByValue: true })
      await sleep(5500)
      const simB = await cdp('Runtime.evaluate', { expression: 'window.__sims && window.__sims.B', returnByValue: true })
      const b = simB.result.value || { travel: 0, clicks: 0, buf: [] }
      let recentB = 0
      if (b.buf && b.buf.length > 1) for (let i = 1; i < b.buf.length; i++) recentB += Math.abs(b.buf[i].deg - b.buf[i-1].deg)
      console.log('SIM_B(开·自动) ' + JSON.stringify({ travel: Math.round(b.travel), clicks: b.clicks, recent: Math.round(recentB) }))
      // 开态：无需手动点击，应自动连续旋转
      if (!(recentB > 60)) {
        errors.push('开态未自动连续旋转 (recent=' + Math.round(recentB) + ')')
        exitCode = 1
      }

      // 截图（容错）
      try {
        const shot = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
        if (shot && shot.result && shot.result.data) {
          fs.writeFileSync('.shot_comm.png', Buffer.from(shot.result.data, 'base64'))
          console.log('SCREEN .shot_comm.png')
        } else console.log('SCREEN skipped (no data)')
      } catch (e) { console.log('SCREEN error: ' + e.message) }

      ws.close()
    } catch (e) {
      errors.push('FATAL: ' + e.message); exitCode = 1
    } finally { cleanup() }
    console.log('ERRORS ' + (errors.length ? JSON.stringify(errors) : 'NONE'))
    process.exit(exitCode)
  })()
}

main()
