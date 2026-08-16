// 通用电路元件图标（canvas 2D）。与 OhmLab / e-circuit 同一套实物 PNG。
// 用法：drawCircuitIcon(ctx, type, cx, cy, w, h, st)
//   type: 'battery' | 'switch' | 'bulb' | 'rheostat' | 'ammeter' | 'voltmeter'
//   st:   { open, batteryV, current, voltage, glow, frac, label }
// 本函数只画元件本体（PNG + 叠加读数/辉光/滑片/标签）；导线与接线柱由调用方按其几何绘制。
// 图片缓存模块级共享，首次调用时加载，未加载完则本帧跳过（调用方每帧重绘，加载后自动出现）。
// ★ PNG 路径只在 pngAssets.js 一处声明（Vite 静态资源解析在此集中），本模块只拿 URL 字符串
// 创建 Image，避免每页/每模块重复 import PNG 文件路径。
import { PNG_URL, PNG_TERMINAL_Y } from '../circuit/pngAssets'

const SRC = {
  battery: PNG_URL.battery,
  switchClosed: PNG_URL.switchClosed,
  switchOpen: PNG_URL.switchOpen,
  bulb: PNG_URL.bulb,
  rheostat: PNG_URL.rheostat,
  ammeter: PNG_URL.ammeter,
  voltmeter: PNG_URL.voltmeter
}
const cache = {}
function getImg(type) {
  if (!cache[type]) {
    cache[type] = new Image()
    cache[type].src = SRC[type]
  }
  return cache[type]
}

const DEFAULT_LABEL = {
  battery: '电源',
  switch: '开关',
  bulb: '小灯泡',
  rheostat: '滑动变阻器',
  ammeter: '电流表 A',
  voltmeter: '电压表 V'
}

// 透明底 PNG 走 source-over；contain 等比居中，dy 为竖向偏移（画布 px，负=上；多状态图端子对齐用）
function blit(ctx, im, cx, cy, w, h, rot, dy) {
  if (!im.complete || !im.naturalWidth) return false
  ctx.save()
  ctx.translate(cx, cy)
  if (rot) ctx.rotate(rot)
  const s = Math.min(w / im.naturalWidth, h / im.naturalHeight)
  const dw = im.naturalWidth * s
  const dh = im.naturalHeight * s
  ctx.drawImage(im, -dw / 2, -dh / 2 + dy, dw, dh)
  ctx.restore()
  return true
}

function labelText(st, type) {
  if (st.label === false) return null
  if (typeof st.label === 'string') return st.label
  return DEFAULT_LABEL[type]
}

export function drawCircuitIcon(ctx, type, cx, cy, w, h, st = {}) {
  const lbl = labelText(st, type)

  if (type === 'battery') {
    // 素材横躺（左右为极），逆时针 90° 竖立，原图左侧 + 转到上方
    blit(ctx, getImg('battery'), cx, cy, w, h, -Math.PI / 2, 0)
    if (lbl !== null) {
      ctx.fillStyle = '#d92135'
      ctx.font = '800 14px system-ui'
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('+', cx, cy - h / 2 - 4)
      ctx.fillStyle = '#3a3026'
      ctx.font = '800 11px system-ui'
      ctx.textBaseline = 'top'
      ctx.fillText('电源 ' + (st.batteryV != null ? st.batteryV : '') + ' V', cx, cy + h / 2 + 6)
    }
    return
  }

  if (type === 'switch') {
    const open = !!st.open
    const im = getImg(open ? 'switchOpen' : 'switchClosed')
    // 开/合两张图端子行错位，按 contain 缩放把 open 图上移对齐，切换时底座不跳
    const scale = Math.min(w, h) / 400
    const dy = open ? (PNG_TERMINAL_Y.switchClosed - PNG_TERMINAL_Y.switchOpen) * scale : 0
    blit(ctx, im, cx, cy, w, h, 0, dy)
    if (lbl !== null) {
      ctx.fillStyle = '#3a3026'
      ctx.font = '800 11px system-ui'
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('开关 ' + (open ? '断开' : '闭合'), cx, cy - h / 2 - 4)
    }
    return
  }

  if (type === 'ammeter') {
    blit(ctx, getImg('ammeter'), cx, cy, w, h, 0, 0)
    // 电表 PNG 是笔记本形态：屏幕在 PNG 上半（y≈30-180），下方"A/V"铭牌 + 3 端子底座。
    // 数字读数放在屏幕内部（PNG y≈110），按本框 contain 缩放换算 SVG y。
    const scale = Math.min(w, h) / 400
    const readingY = cy - 90 * scale
    ctx.fillStyle = '#d92135'
    ctx.font = '800 14px ui-monospace, monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText((st.current != null ? st.current : 0).toFixed(2) + ' A', cx, readingY)
    if (lbl !== null) {
      ctx.fillStyle = '#3a3026'
      ctx.font = '800 11px system-ui'
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(lbl, cx, cy + h / 2 + 6)
    }
    return
  }

  if (type === 'bulb') {
    const b = st.glow || 0
    if (b > 0.02) {
      // 辉光半径随亮度扩张、颜色强度随亮度连续变化
      const rOuter = w * (0.5 + 0.55 * b)
      const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, rOuter)
      grd.addColorStop(0, 'rgba(255,238,170,' + (0.2 + 0.6 * b).toFixed(3) + ')')
      grd.addColorStop(0.4, 'rgba(255,196,70,' + (0.06 + 0.34 * b).toFixed(3) + ')')
      grd.addColorStop(1, 'rgba(255,196,70,0)')
      ctx.fillStyle = grd
      ctx.beginPath(); ctx.arc(cx, cy, rOuter, 0, Math.PI * 2); ctx.fill()
      // 灯丝高光（对准灯泡玻璃内灯丝位置，向上偏移）
      ctx.fillStyle = 'rgba(255,245,200,' + (0.1 + 0.55 * b).toFixed(3) + ')'
      ctx.beginPath(); ctx.arc(cx, cy - h * 0.18, w * 0.18, 0, Math.PI * 2); ctx.fill()
    }
    blit(ctx, getImg('bulb'), cx, cy, w, h, 0, 0)
    if (lbl !== null) {
      ctx.fillStyle = '#3a3026'
      ctx.font = '800 11px system-ui'
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(lbl, cx, cy - h / 2 - 6)
    }
    return
  }

  if (type === 'rheostat') {
    blit(ctx, getImg('rheostat'), cx, cy, w, h, 0, 0)
    const iw = Math.min(w, h)
    const frac = st.frac != null ? Math.max(0, Math.min(1, st.frac)) : 0.5
    const sx = -iw / 2 + frac * iw
    ctx.fillStyle = '#d92135'
    ctx.fillRect(cx + sx - 3, cy - iw / 2 - 8, 6, 8)
    ctx.strokeStyle = '#d92135'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx + sx, cy - iw / 2 - 8); ctx.lineTo(cx + sx + 6, cy - iw / 2 - 14)
    ctx.moveTo(cx + sx, cy - iw / 2 - 8); ctx.lineTo(cx + sx - 6, cy - iw / 2 - 14)
    ctx.stroke()
    if (lbl !== null) {
      ctx.fillStyle = '#3a3026'
      ctx.font = '800 10px system-ui'
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(lbl, cx, cy + iw / 2 + 4)
    }
    return
  }

  if (type === 'voltmeter') {
    // 并联引线由调用方绘制（需连接被并元件两端）
    blit(ctx, getImg('voltmeter'), cx, cy, w, h, 0, 0)
    // 屏幕内部读数（同 ammeter，按 PNG 屏幕位置缩放换算）
    const scale = Math.min(w, h) / 400
    const readingY = cy - 90 * scale
    ctx.fillStyle = '#d92135'
    ctx.font = '800 14px ui-monospace, monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText((st.voltage != null ? st.voltage : 0).toFixed(1) + ' V', cx, readingY)
    if (lbl !== null) {
      ctx.fillStyle = '#3a3026'
      ctx.font = '800 10px system-ui'
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(lbl, cx, cy + h / 2 + 6)
    }
    return
  }
}
