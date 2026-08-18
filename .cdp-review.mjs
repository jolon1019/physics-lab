// 物理复核：加载通电线圈实验，切到图甲并通电，读取受力箭头/电流角标/力矩的实际渲染方向
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
    '--user-data-dir=' + fs.mkdtempSync('C:/Users/Administrator/AppData/Local/Temp/cdp-review-'),
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
      await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
      await cdp('Runtime.enable'); await cdp('Page.enable')
      await cdp('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false })

      await cdp('Page.navigate', { url: URL })
      let mounted = false
      for (let i = 0; i < 40; i++) {
        await sleep(500)
        const chk = await cdp('Runtime.evaluate', {
          expression: `!!document.querySelector('.lab-left') && !!document.querySelector('.lab-container > svg') && document.querySelector('.lab-container > svg').clientHeight > 0`,
          returnByValue: true
        })
        if (chk.result.value) { mounted = true; break }
      }
      if (!mounted) { errors.push('未挂载'); exitCode = 1 }

      // 切到图甲 + 通电
      await cdp('Runtime.evaluate', {
        expression: `(function(){
          const chips=[...document.querySelectorAll('.chip')]; const a=chips.find(c=>c.textContent.includes('甲')); if(a)a.click();
          const b=document.querySelector('#btnPower'); if(b)b.click();
          return true;
        })()`,
        returnByValue: true
      })
      await sleep(700)

      // 读取受力箭头 / 电流箭头 / 力矩 的实际 transform
      const read = await cdp('Runtime.evaluate', {
        expression: `(function(){
          function t(id){ const el=document.getElementById(id); return el? el.getAttribute('transform'):null; }
          function disp(id){ const el=document.getElementById(id); return el? getComputedStyle(el).display : null; }
          return {
            fRight: t('fRight'), fLeft: t('fLeft'), fTop: t('fTop'), fBot: t('fBot'),
            fRightDisp: disp('fRight'), fLeftDisp: disp('fLeft'),
            curA: t('curA'), curB: t('curB'),
            rotLbl: (function(){const e=document.getElementById('rotLbl'); return e?e.textContent:null;})(),
            infoB: (function(){const e=document.getElementById('infoB'); return e?e.textContent:null;})(),
            liveTorque: (function(){const e=[...document.querySelectorAll('.lab-stat strong')].find(s=>s.previousElementSibling&&s.previousElementSibling.textContent.includes('力矩方向')); return e?e.textContent:null;})(),
            Npos: (function(){const ts=[...document.querySelectorAll('text')].find(t=>t.textContent==='N'); return ts?{x:Math.round(ts.getAttribute('x')),y:Math.round(ts.getAttribute('y'))}:null;})(),
            Spos: (function(){const ts=[...document.querySelectorAll('text')].find(t=>t.textContent==='S'); return ts?{x:Math.round(ts.getAttribute('x')),y:Math.round(ts.getAttribute('y'))}:null;})()
          };
        })()`,
        returnByValue: true
      })
      console.log('RESULT ' + JSON.stringify(read.result.value, null, 2))

      // 截图（优先 svg.toDataURL，绝对路径落盘）
      const url = await cdp('Runtime.evaluate', { expression: `document.querySelector('.lab-container > svg').toDataURL('image/png')`, returnByValue: true })
      const OUT = 'D:/project/physics-lab/.snap-review.png'
      if (url.result.value && url.result.value.startsWith('data:image')) {
        fs.writeFileSync(OUT, Buffer.from(url.result.value.split(',')[1], 'base64'))
        console.log('SHOT(svg) written ' + OUT)
      } else {
        const shot = await cdp('Page.captureScreenshot', { format: 'png' })
        if (shot.result && shot.result.data) { fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64')); console.log('SHOT written ' + OUT) }
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
