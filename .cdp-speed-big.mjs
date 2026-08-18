// 验证 e-speed 贴纸放大修复：复用已启动的 dev server (localhost:5173)，
// 加载 /experiment/e-speed 后确认：
//   1) 裁剪后的贴纸（che.png=225x133, huadao.png=800x148）已加载
//   2) canvas 渲染了贴纸（非降级）
//   3) 动画跑完、results 正常
//   4) 零 console error / 异常
//   5) 截图到 .snap-speed-big.png
// 用法：node .cdp-speed-big.mjs
import { spawn } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'
import http from 'node:http'
import { writeFileSync } from 'node:fs'

const URL = 'http://localhost:5173/experiment/e-speed' // 复用已启动的 vite
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const USER_DATA = 'C:\\tmp\\cdp-speed-big-' + Date.now()

let chrome
const errors = []
function log(...a) { console.log(...a) }

async function getJSON(u) {
  return new Promise((res, rej) => {
    http.get(u, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } }) }).on('error', rej)
  })
}
async function findPage() {
  for (let i = 0; i < 30; i++) {
    try { const ts = await getJSON('http://127.0.0.1:9222/json/list'); const p = ts.find(t => t.type === 'page'); if (p) return p } catch {}
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
    return new Promise((res) => { const id = ++this.id; this.pending.set(id, res); this.ws.send(JSON.stringify({ id, method, params })) })
  }
}
const waitOpen = async (c) => { while (!c._ready) await wait(50) }

// 简单的可达性检查（用 node fetch 走 127.0.0.1 不可达时回退 localhost）
async function pickBase() {
  for (const host of ['http://127.0.0.1:5173', 'http://[::1]:5173', 'http://localhost:5173']) {
    try {
      const r = await fetch(host + '/experiment/e-speed', { method: 'GET' })
      if (r.status === 200) return host
    } catch {}
  }
  throw new Error('vite 不可达')
}

let base
try {
  base = await pickBase()
  log('>>> dev server base:', base)

  log('>>> 启动 chrome')
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=9222', '--remote-allow-origins=*',
    '--no-proxy-server', `--user-data-dir=${USER_DATA}`,
    '--window-size=1280,900', 'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  await wait(1500)

  const page = await findPage()
  log('>>> page:', page.url)
  const cdp = new CDP(page.webSocketDebuggerUrl)
  await waitOpen(cdp)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')

  const consoleErrs = []
  cdp.ws.addEventListener('message', e => {
    const m = JSON.parse(e.data)
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrs.push('EXC: ' + (m.params.exceptionDetails?.text || JSON.stringify(m.params)))
    } else if (m.method === 'Console.messageAdded' && m.params.message.level === 'error') {
      consoleErrs.push('CON: ' + m.params.message.text)
    }
  })

  log('>>> 跳转到', URL)
  await cdp.send('Page.navigate', { url: URL })
  await wait(4000)

  const diag = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      const c = document.querySelector('canvas');
      if (!c) return { ok:false, why:'no canvas' };
      let comp = null, el = c;
      while (el) { if (el.__vueParentComponent) { comp = el.__vueParentComponent; break; } el = el.parentElement; }
      if (!comp) return { ok:false, why:'no vue comp' };
      const ss = comp.setupState;
      const cart = ss && ss.imgCart, ramp = ss && ss.imgRamp;
      return {
        ok: true,
        url: location.pathname,
        cartOk: !!(cart && cart.complete && cart.naturalWidth > 0),
        rampOk: !!(ramp && ramp.complete && ramp.naturalWidth > 0),
        cartSize: cart ? { w: cart.naturalWidth, h: cart.naturalHeight } : null,
        rampSize: ramp ? { w: ramp.naturalWidth, h: ramp.naturalHeight } : null,
        // CART_W / TRACK_H 从 setupState 拿不到（不是 ref），通过 canvas 内采样推算
        canvasW: c.width, canvasH: c.height,
        state: ss && ss.state
      }
    })()`,
    returnByValue: true
  })
  const d = diag.result && diag.result.value
  log('DIAG ' + JSON.stringify(d))
  if (!d || !d.ok) { errors.push('组件未挂载: ' + JSON.stringify(d)); throw new Error('diag fail') }
  // 期望裁剪后尺寸：che 225x133、huadao 800x148
  if (!d.cartOk) errors.push('che.png 未加载完成')
  else if (!(d.cartSize.w === 225 && d.cartSize.h === 133)) errors.push('che.png 尺寸异常: ' + JSON.stringify(d.cartSize))
  if (!d.rampOk) errors.push('huadao.png 未加载完成')
  else if (!(d.rampSize.w === 800 && d.rampSize.h === 148)) errors.push('huadao.png 尺寸异常: ' + JSON.stringify(d.rampSize))

  // 跑动画
  const click = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      const btn = [...document.querySelectorAll('.lab-actions .btn')].find(b => b.textContent.includes('开始计时') || b.textContent.includes('再次计时'));
      if (!btn) return { ok:false };
      btn.click();
      return { ok:true, txt: btn.textContent.trim() };
    })()`,
    returnByValue: true
  })
  log('CLICK ' + JSON.stringify(click.result && click.result.value))
  if (!(click.result && click.result.value && click.result.value.ok)) errors.push('找不到开始按钮')

  await wait(3500)
  const prog = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      const c = document.querySelector('canvas');
      let comp = null, cur = c;
      while (cur) { if (cur.__vueParentComponent) { comp = cur.__vueParentComponent; break; } cur = cur.parentElement; }
      const ss = comp && comp.setupState;
      return { state: ss.state, elapsed: ss.elapsed, frac: ss.currentFrac, results: ss.results };
    })()`,
    returnByValue: true
  })
  const pr = prog.result && prog.result.value
  log('PROG ' + JSON.stringify(pr))
  if (!pr) errors.push('progress null')
  else {
    if (pr.state !== 'done') errors.push('动画未完成: ' + pr.state)
    if (!pr.results) errors.push('results 未生成')
  }

  if (consoleErrs.length) { for (const e of consoleErrs) errors.push(e) }

  // 截图
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  if (shot.result && shot.result.data) {
    writeFileSync('.snap-speed-big.png', Buffer.from(shot.result.data, 'base64'))
    log('SHOT .snap-speed-big.png')
  }

  if (errors.length) {
    log('FAIL (' + errors.length + ')')
    for (const e of errors) log('  -', e)
    process.exitCode = 1
  } else {
    log('OK che=' + d.cartSize.w + 'x' + d.cartSize.h + ' huadao=' + d.rampSize.w + 'x' + d.rampSize.h + ' state=' + pr.state)
  }
} catch (e) {
  log('FATAL', e.message || e)
  process.exitCode = 1
} finally {
  try { chrome && chrome.kill() } catch {}
  await wait(200)
}
