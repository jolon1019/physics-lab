// CDP 验证 e-speed 修复：底座 2/3 宽 + 轮子接触滑道
import { writeFileSync } from 'node:fs'

// 从环境或 API 自动找带 e-speed 的 page target
async function findWs() {
  if (process.env.WS) return process.env.WS
  const r = await fetch('http://[::1]:9222/json')
  const arr = await r.json()
  const t = arr.find((x) => x.type === 'page' && /e-speed/.test(x.url))
  if (!t) throw new Error('no e-speed target; run: curl -X PUT "http://[::1]:9222/json/new?http://[::1]:5173/experiment/e-speed"')
  return t.webSocketDebuggerUrl
}

const wsUrl = await findWs()
console.log('ws:', wsUrl)

const ws = new WebSocket(wsUrl)
let id = 0
const pending = new Map()
const consoleErrs = []
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const i = ++id
    pending.set(i, { resolve, reject })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
}

ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    if (m.error) reject(new Error(m.error.message))
    else resolve(m.result)
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleErrs.push('EX: ' + (m.params.exceptionDetails?.text || ''))
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrs.push('console: ' + m.params.args.map((a) => a.value).join(' '))
  }
})
ws.addEventListener('error', (e) => { console.error('ws err', e); process.exit(1) })
await new Promise((r) => ws.addEventListener('open', r, { once: true }))

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
// 设桌面视口 1280x900，确保 canvas 完整可见
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.reload', { ignoreCache: true })
await new Promise((r) => setTimeout(r, 3500))

// 1) 量画布尺寸
const info = await send('Runtime.evaluate', {
  expression: `(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { cssW: r.width, cssH: r.height, dpr: devicePixelRatio, top: r.top, bottom: r.bottom } })()`,
  returnByValue: true
})
const dims = info.result.value
console.log('canvas:', dims, 'expected 2/3 W =', (dims.cssW * 2 / 3).toFixed(1))

// 2) 量楔块在画布上的水平底边（从 canvas 像素推断）
const layout = await send('Runtime.evaluate', {
  expression: `
    (() => {
      const c = document.querySelector('canvas')
      const dpr = ${dims.dpr}
      const cw = c.width
      const tmp = document.createElement('canvas')
      tmp.width = cw; tmp.height = c.height
      const t = tmp.getContext('2d')
      t.drawImage(c, 0, 0)
      // 扫描底部区域找楔块色 #e3d2b0 (227,210,176)
      let left = -1, right = -1
      for (let y = Math.floor(c.height * 0.7); y < c.height; y++) {
        const row = t.getImageData(0, y, cw, 1).data
        for (let x = 0; x < cw; x++) {
          const r = row[x*4], g = row[x*4+1], b = row[x*4+2]
          if (r > 210 && g > 190 && b > 150 && r < 240 && g < 225 && b < 195) {
            if (left < 0 || x < left) left = x
            if (x > right) right = x
          }
        }
      }
      return {
        wedgeLeftCss: (left / dpr).toFixed(1),
        wedgeRightCss: (right / dpr).toFixed(1),
        wedgeWidthCss: ((right - left) / dpr).toFixed(1),
        cssW: ${dims.cssW},
        wedgeFracOfCss: ((right - left) / dpr / ${dims.cssW}).toFixed(3),
        expected: (${dims.cssW} * 2 / 3).toFixed(1)
      }
    })()
  `,
  returnByValue: true
})
console.log('wedge:', JSON.stringify(layout.result.value))

// 3) 截图
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('.snap-speed-fix.png', Buffer.from(shot.data, 'base64'))
console.log('saved .snap-speed-fix.png  errs:', consoleErrs.length)
if (consoleErrs.length) console.log(consoleErrs)
ws.close()
