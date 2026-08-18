// 验证 e-speed 实验：贴纸资源加载、小车/滑道渲染、动画运行、零运行期报错
// 用法：node .cdp-speed.mjs
import { spawn } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'
import http from 'node:http'
import { writeFileSync } from 'node:fs'

const PORT = 5173
const ROUTE = '/experiment/e-speed'
const VITE_BIN = './node_modules/vite/bin/vite.js'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const USER_DATA = 'C:\\tmp\\cdp-speed-' + Date.now()

let vite, chrome
let errors = []
let exitCode = 0
function log(...a) { console.log(...a) }

// ---- 1) 启动 vite ----
async function startVite() {
  return new Promise((res) => {
    vite = spawn(process.execPath, [VITE_BIN, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_PROXY: '127.0.0.1' }
    })
    vite.stdout.on('data', d => { if (d.toString().includes('ready in')) res() })
    setTimeout(res, 8000)
  })
}
function killVite() { try { vite && vite.kill() } catch {} }

// ---- 2) 启动 headless chrome ----
async function startChrome() {
  return new Promise((res) => {
    const args = [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--remote-debugging-port=9222', '--remote-allow-origins=*',
      '--no-proxy-server', `--user-data-dir=${USER_DATA}`,
      '--window-size=1280,800', 'about:blank'
    ]
    chrome = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    setTimeout(res, 1500)
  })
}
function killChrome() { try { chrome && chrome.kill() } catch {} }

// ---- 3) CDP ----
async function getJSON(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } })
    }).on('error', rej)
  })
}
async function findPage() {
  for (let i = 0; i < 30; i++) {
    try {
      const ts = await getJSON('http://127.0.0.1:9222/json/list')
      const p = ts.find(t => t.type === 'page')
      if (p) return p
    } catch {}
    await wait(300)
  }
  throw new Error('no page target')
}
class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this._bind() }
  _bind() {
    this.ws.addEventListener('open', () => this._ready = true)
    this.ws.addEventListener('message', e => {
      const m = JSON.parse(e.data)
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m.result); this.pending.delete(m.id) }
    })
  }
  send(method, params = {}) {
    return new Promise((res) => {
      const id = ++this.id; this.pending.set(id, res)
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
}
async function waitOpen(c) { while (!c._ready) await wait(50) }

// ---- 4) 主流程 ----
try {
  log('>>> 启动 vite')
  await startVite()
  log('>>> 启动 chrome')
  await startChrome()
  const page = await findPage()
  log('>>> 页面目标:', page.url)
  const cdp = new CDP(page.webSocketDebuggerUrl)
  await waitOpen(cdp)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')

  // 收集 console + 异常
  const consoleErrs = []
  cdp.ws.addEventListener('message', e => {
    const m = JSON.parse(e.data)
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrs.push('EXC: ' + (m.params.exceptionDetails?.text || JSON.stringify(m.params)))
    } else if (m.method === 'Console.messageAdded' && m.params.message.level === 'error') {
      consoleErrs.push('CON: ' + m.params.message.text)
    }
  })

  log('>>> 跳转到', ROUTE)
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + ROUTE })
  // 等 4s 让 Vue 挂载 + 贴纸加载（同 URL 导航不触发 loadEventFired）
  await wait(4000)
  log('>>> 等待完成')

  // 检查组件状态（不强制要求贴纸加载完成，只检查组件挂载）
  const diag = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      const c = document.querySelector('canvas');
      if (!c) return { ok:false, why:'no canvas' };
      let comp = null; let el = c;
      while (el) { if (el.__vueParentComponent) { comp = el.__vueParentComponent; break; } el = el.parentElement; }
      if (!comp) return { ok:false, why:'no __vueParentComponent in ancestor chain' };
      const ss = comp.setupState;
      return {
        ok: true,
        url: location.pathname,
        cartOk: !!(ss && ss.imgCart && ss.imgCart.complete && ss.imgCart.naturalWidth > 0),
        rampOk: !!(ss && ss.imgRamp && ss.imgRamp.complete && ss.imgRamp.naturalWidth > 0),
        cartSize: ss && ss.imgCart ? { w: ss.imgCart.naturalWidth, h: ss.imgCart.naturalHeight } : null,
        rampSize: ss && ss.imgRamp ? { w: ss.imgRamp.naturalWidth, h: ss.imgRamp.naturalHeight } : null,
        state: ss && ss.state,
        canvasW: c.width, canvasH: c.height
      }
    })()`,
    returnByValue: true
  })
  const d = diag.result && diag.result.value
  log('DIAG ' + JSON.stringify(d))
  if (!d || !d.ok) { errors.push('组件未挂载: ' + JSON.stringify(d)); exitCode = 1 }
  else {
    if (!d.cartOk) log('WARN 小车贴纸未加载完成（将使用降级红车）')
    if (!d.rampOk) log('WARN 滑道贴纸未加载完成（将使用降级木纹）')
  }

  // 点击"开始计时"
  const click = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      const btn = [...document.querySelectorAll('.lab-actions .btn')].find(b => b.textContent.includes('开始计时') || b.textContent.includes('再次计时'));
      if (!btn) return { ok:false, why:'no start btn' };
      btn.click();
      return { ok:true, btnText: btn.textContent.trim() };
    })()`,
    returnByValue: true
  })
  const cr = click.result && click.result.value
  log('CLICK ' + JSON.stringify(cr))
  if (!cr || !cr.ok) { errors.push('找不到开始按钮'); exitCode = 1 }

  // 跑 3s，采集进度
  await wait(3000)
  const progress = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      const el = document.querySelector('canvas');
      let comp = null; let cur = el;
      while (cur) { if (cur.__vueParentComponent) { comp = cur.__vueParentComponent; break; } cur = cur.parentElement; }
      const ss = comp && comp.setupState;
      return {
        state: ss && ss.state,
        elapsed: ss && ss.elapsed,
        frac: ss && ss.currentFrac,
        results: ss && ss.results
      }
    })()`,
    returnByValue: true
  })
  const pr = progress.result && progress.result.value
  log('PROGRESS ' + JSON.stringify(pr))
  if (!pr) { errors.push('progress 采集失败'); exitCode = 1 }
  else {
    if (pr.state !== 'done') { errors.push('动画未完成: state=' + pr.state); exitCode = 1 }
    if (!pr.results) { errors.push('未生成 results'); exitCode = 1 }
  }

  // 错误汇总
  if (consoleErrs.length) {
    log('CONSOLE_ERR ' + JSON.stringify(consoleErrs))
    for (const e of consoleErrs) errors.push(e)
    exitCode = 1
  }

  // 截图
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  if (shot.result && shot.result.data) {
    writeFileSync('.snap-speed.png', Buffer.from(shot.result.data, 'base64'))
    log('SHOT written .snap-speed.png')
  }

  if (errors.length) {
    log('FAIL errors=' + errors.length)
    for (const e of errors) log('  -', e)
    process.exitCode = 1
  } else {
    log('OK speed lab verified (cartOk=' + d.cartOk + ', rampOk=' + d.rampOk + ')')
  }
} catch (e) {
  log('FATAL', e)
  process.exitCode = 1
} finally {
  killChrome()
  killVite()
  await wait(300)
}
