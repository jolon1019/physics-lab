// 通用电路元件图标（canvas 2D）。与 OhmLab / e-circuit 同一套矢量元件。
// 用法：drawCircuitIcon(ctx, type, cx, cy, w, h, st)
//   type: 'battery' | 'switch' | 'bulb' | 'rheostat' | 'ammeter' | 'voltmeter'
//   st:   { open, batteryV, current, voltage, glow, frac, label }
// 本函数只画元件本体（矢量图 + 叠加读数/辉光/滑片/标签）；导线与接线柱由调用方按其几何绘制。
// 元件本体来自 componentArt.js 的 SVG → data URL（无网络请求，首次绘制即可用），
// 按 (type + 开关状态) 缓存 Image，未加载完则本帧跳过（调用方每帧重绘，加载后自动出现）。
import { artDataUrl } from '../circuit/componentArt'

const cache = {}
function getImg(key) {
  if (!cache[key]) {
    const im = new Image()
    im.src = artDataUrl(key === 'switchClosed' ? 'switch' : key === 'switchOpen' ? 'switch' : key,
      key === 'switchOpen' ? { open: true } : {})
    cache[key] = im
  }
  return cache[key]
}

// 预解码全部状态图（含开关开/合两态）：否则首次切换状态时该图才创建并异步解码，
// blit 因 im.complete=false 跳过绘制，元件会消失几帧再弹出（画面闪跳）
export function preloadCircuitIcons() {
  ;['battery', 'switchOpen', 'switchClosed', 'ammeter', 'bulb', 'rheostat', 'voltmeter'].forEach(getImg)
}

const DEFAULT_LABEL = {
  battery: '电源',
  switch: '开关',
  bulb: '小灯泡',
  rheostat: '滑动变阻器',
  ammeter: '电流表 A',
  voltmeter: '电压表 V'
}

// 圆角矩形路径（canvas 2D 直用）
function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return }
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 滑动变阻器滑片缓动（调节动画）：以画布位置为键，逐帧向目标阻值位置滑行
const rheoEase = {}
function easedFrac(cx, cy, target) {
  const key = `${Math.round(cx)}|${Math.round(cy)}`
  const cur = rheoEase[key] == null ? target : rheoEase[key]
  const next = Math.abs(target - cur) < 0.005 ? target : cur + (target - cur) * 0.14
  rheoEase[key] = next
  return next
}

// SVG data URL（100×100）contain 等比居中；rot 用于电池竖放
function blit(ctx, im, cx, cy, w, h, rot) {
  if (!im.complete || !im.naturalWidth) return false
  ctx.save()
  ctx.translate(cx, cy)
  if (rot) ctx.rotate(rot)
  const s = Math.min(w / im.naturalWidth, h / im.naturalHeight)
  const dw = im.naturalWidth * s
  const dh = im.naturalHeight * s
  ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh)
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
  const scale = Math.min(w, h) / 100 // 矢量图按 100×100 局部盒设计，叠加层坐标按此换算

  if (type === 'battery') {
    // 素材横躺（左右为极），逆时针 90° 竖立，原图左侧 + 转到上方
    blit(ctx, getImg('battery'), cx, cy, w, h, -Math.PI / 2)
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
    // 矢量图两种状态端子行天然对齐（接线柱均在 y=0），无需旧 PNG 的 dy 偏移
    blit(ctx, getImg(open ? 'switchOpen' : 'switchClosed'), cx, cy, w, h, 0)
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
    // 表体上半是深色屏（局部 y ≈ -38..-4，中心 -21），读数画在屏内
    const readingY = cy - 21 * scale
    ctx.fillStyle = '#ff5b67'
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
    blit(ctx, getImg('bulb'), cx, cy, w, h, 0)
    // 亮度只体现在玻璃泡内部（随电流增强），不向背景外溢
    if (b > 0.02) {
      const gx = cx, gy = cy - 24 * scale, r = 26 * scale
      const grd = ctx.createRadialGradient(gx, gy - 2 * scale, 1, gx, gy, r)
      grd.addColorStop(0, 'rgba(255,244,200,' + (0.25 + 0.65 * b).toFixed(3) + ')')
      grd.addColorStop(0.55, 'rgba(255,214,110,' + (0.10 + 0.4 * b).toFixed(3) + ')')
      grd.addColorStop(1, 'rgba(255,196,70,0)')
      ctx.fillStyle = grd
      ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.fill()
      // 灯丝亮点
      ctx.fillStyle = 'rgba(255,250,220,' + (0.2 + 0.7 * b).toFixed(3) + ')'
      ctx.beginPath(); ctx.arc(gx, gy - 2 * scale, w * 0.09, 0, Math.PI * 2); ctx.fill()
    }
    if (lbl !== null) {
      ctx.fillStyle = '#3a3026'
      ctx.font = '800 11px system-ui'
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(lbl, cx, cy - h / 2 - 6)
    }
    return
  }

  if (type === 'rheostat') {
    blit(ctx, getImg('rheostat'), cx, cy, w, h, 0)
    const target = st.frac != null ? Math.max(0, Math.min(1, st.frac)) : 0.5
    const frac = easedFrac(cx, cy, target)
    const s = scale
    // 线圈区域（对应矢量图：x −30..30，y −12..16）；滑片行程避开两端红色端帽（±18 内）
    const coilL = cx - 30 * s, coilT = cy - 12 * s, coilH = 28 * s
    const sx = cx + (-18 + frac * 36) * s
    // 接入段高亮：左端 → 滑片（通电的电阻丝段，带暖色辉光）
    const segW = Math.max(sx - coilL, 2 * s)
    ctx.save()
    ctx.shadowColor = 'rgba(255,150,40,0.55)'
    ctx.shadowBlur = 6 * s
    const seg = ctx.createLinearGradient(coilL, 0, sx, 0)
    seg.addColorStop(0, 'rgba(255,170,60,0.08)')
    seg.addColorStop(1, 'rgba(255,150,40,0.4)')
    ctx.fillStyle = seg
    rrPath(ctx, coilL + 2 * s, coilT + 3 * s, segW, coilH - 6 * s, 8 * s)
    ctx.fill()
    ctx.restore()
    // 滑片组件：顶部连杆 + 金属滑块 + 红色手柄 + 触点
    ctx.fillStyle = '#8b98a7'
    ctx.fillRect(sx - 2 * s, cy - 24 * s, 4 * s, 9 * s)
    const bw = 19 * s, bh = 32 * s, bl = cy - 17 * s
    const bgrad = ctx.createLinearGradient(sx - bw / 2, 0, sx + bw / 2, 0)
    bgrad.addColorStop(0, '#6d737d')
    bgrad.addColorStop(0.4, '#eef2f7')
    bgrad.addColorStop(0.6, '#b9c1cb')
    bgrad.addColorStop(1, '#565b64')
    ctx.fillStyle = bgrad
    rrPath(ctx, sx - bw / 2, bl, bw, bh, 3.5 * s)
    ctx.fill()
    ctx.strokeStyle = '#39414c'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = '#d92135'
    rrPath(ctx, sx - bw / 2 + 2 * s, bl - 6 * s, bw - 4 * s, 9 * s, 3 * s)
    ctx.fill()
    ctx.strokeStyle = '#8c1a10'
    ctx.stroke()
    ctx.fillStyle = '#39414c'
    ctx.beginPath()
    ctx.moveTo(sx - 4 * s, bl + bh)
    ctx.lineTo(sx + 4 * s, bl + bh)
    ctx.lineTo(sx, bl + bh + 5 * s)
    ctx.closePath()
    ctx.fill()
    if (lbl !== null) {
      ctx.fillStyle = '#3a3026'
      ctx.font = '800 10px system-ui'
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(lbl, cx, cy + h / 2 + 4)
    }
    return
  }

  if (type === 'voltmeter') {
    // 并联引线由调用方绘制（需连接被并元件两端）
    blit(ctx, getImg('voltmeter'), cx, cy, w, h, 0)
    const readingY = cy - 21 * scale
    ctx.fillStyle = '#ff5b67'
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
