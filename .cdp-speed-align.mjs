// CDP 验证 e-speed 对齐：截 canvas 1:1 图，供 Python 像素分析量间隙 & 连贯性
import { writeFileSync } from 'node:fs'

async function findWs() {
  if (process.env.WS) return process.env.WS
  const r = await fetch('http://127.0.0.1:9222/json')
  const arr = await r.json()
  const t = arr.find((x) => x.type === 'page' && /e-speed/.test(x.url))
  if (!t) throw new Error('no e-speed target')
  return t.webSocketDebuggerUrl
}
const wsUrl = await findWs()
const ws = new WebSocket(wsUrl)
let id = 0; const pending = new Map(); const errs = []
function send(m, p = {}) {
  return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
}
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result) }
  else if (m.method === 'Runtime.exceptionThrown') errs.push('EX:' + (m.params.exceptionDetails?.text || ''))
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('con:' + m.params.args.map(a => a.value).join(' '))
})
ws.addEventListener('error', (e) => { console.error('ws err', e); process.exit(1) })
await new Promise((r) => ws.addEventListener('open', r, { once: true }))

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.reload', { ignoreCache: true })
await new Promise((r) => setTimeout(r, 3800))

// canvas 仅在 1:1（dsf=1 ⇒ backing=css）
const rect = await send('Runtime.evaluate', {
  expression: `(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, dpr: devicePixelRatio, bw: c.width, bh: c.height } })()`,
  returnByValue: true
})
const R = rect.result.value
console.log('canvasRect:', R)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('.snap-speed-align.png', Buffer.from(shot.data, 'base64'))
// 把 canvas 在整页图中的矩形位置写出去，供 Python 裁切 / 分析
writeFileSync('.snap-speed-rect.json', JSON.stringify(R))
console.log('saved .snap-speed-align.png (full) + .snap-speed-rect.json  errs:', errs.length, errs)
ws.close()
