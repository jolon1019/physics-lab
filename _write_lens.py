import os
p = r'D:\project\physics-lab\src\components\lab\LensLab.vue'
old = open(p, encoding='utf-8-sig').read()

new = """<script setup>
/**
 * LensLab - convex lens imaging law  Fixed Edition
 * Physics: 1/u + 1/v = 1/f,  |m| = |v/u|
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ParamSlider from './ParamSlider.vue'
import FormulaPanel from './FormulaPanel.vue'

const emit = defineEmits(['complete'])
const focalLength = ref(110)
const objectHeight = ref(90)
let candleDist = 220
let screenDist = 220
let dragging = null
const hint = ref('Drag candle to change u, drag screen for sharp image')
const readout = ref({ u: '2.00f', v: '2.00f', m: '1.00', state: 'u=2f: inverted equal real image' })
const seenZones = { far: false, mid: false, near: false }
let experimentDone = false

function imageDist(u) {
  const f = focalLength.value
  if (Math.abs(u - f) < 0.5) return Infinity
  return (u * f) / (u - f)
}
function stageOf(u) {
  const f = focalLength.value
  if (u > 2 * f + 2) return 'far'
  if (u > f + 1) return 'mid'
  return 'near'
}

const canvasRef = ref(null)
let ctx = null, rafId = null, flamePhase = 0
const W = 860, H = 500, LENS_X = 340, AXIS_Y = 270, RAIL_Y = 420

function getDPR() { return Math.min(window.devicePixelRatio || 1, 2) }
function resizeCanvas() {
  const c = canvasRef.value
  if (!c) return
  const r = c.getBoundingClientRect(), dpr = getDPR()
  c.width = Math.round(r.width * dpr)
  c.height = Math.round(r.height * dpr)
  ctx = c.getContext('2d')
}
function getSize() { const c = canvasRef.value, dpr = getDPR(); return { w: c.width / dpr, h: c.height / dpr } }
function getTransform() {
  const { w, h } = getSize(), s = Math.min(w / W, h / H)
  return { scale: s, ox: (w - W * s) / 2, oy: (h - H * s) / 2 }
}
function toLogical(cx, cy) {
  const c = canvasRef.value, r = c.getBoundingClientRect(), dpr = getDPR(), t = getTransform()
  return { x: (cx / dpr - t.ox) / t.scale, y: (cy / dpr - t.oy) / t.scale }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}
function arrowHead(x, y, angle, size) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle)
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-size, -size * 0.4); ctx.lineTo(-size, size * 0.4); ctx.closePath(); ctx.fill()
  ctx.restore()
}

/* Background */
function drawBg() {
  const { w, h } = getSize()
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7)
  g.addColorStop(0, '#faf6f0'); g.addColorStop(1, '#efe9dc')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  ctx.save(); ctx.globalAlpha = 0.05; ctx.strokeStyle = '#888'; ctx.lineWidth = 0.5
  for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
  for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
  ctx.restore()
}

/* Rail */
function drawRail() {
  const y = RAIL_Y
  const g = ctx.createLinearGradient(20, y - 6, 20, y + 6)
  g.addColorStop(0, '#6b7280'); g.addColorStop(0.5, '#9ca3af'); g.addColorStop(1, '#4b5563')
  ctx.save(); ctx.fillStyle = g; roundRect(20, y - 6, W - 40, 12, 4); ctx.fill(); ctx.restore()
  for (let x = 40; x < W - 20; x += 20) {
    const major = x % 100 === 0
    ctx.strokeStyle = major ? '#374151' : '#9ca3af'; ctx.lineWidth = major ? 2 : 1
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke()
    if (major) {
      ctx.fillStyle = '#6b7280'; ctx.font = '10px system-ui, sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(str(Math.round((x - LENS_X) / 10) * 10) + 'cm', x, y + 8)
    }
  }
}

/* Optical axis */
function drawAxis() {
  ctx.save(); ctx.setLineDash([8, 6])
  ctx.strokeStyle = 'rgba(107,114,128,0.3)'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(20, AXIS_Y); ctx.lineTo(W - 20, AXIS_Y); ctx.stroke()
  ctx.setLineDash([]); ctx.restore()
}

/* Focal markers */
function drawMarkers() {
  const f = focalLength.value
  const markers = [
    { dx: f, label: 'F', sub: '', color: '#ef4444' },
    { dx: -f, label: 'F', sub: '', color: '#ef4444' },
    { dx: 2 * f, label: '2F', sub: '', color: '#6b7280' },
    { dx: -2 * f, label: '2F', sub: '', color: '#6b7280' },
  ]
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  for (const m of markers) {
    const x = LENS_X + m.dx
    const g = ctx.createRadialGradient(x, AXIS_Y, 0, x, AXIS_Y, 7)
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, m.color); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, AXIS_Y, 7, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x, AXIS_Y, 3, 0, Math.PI * 2); ctx.fillStyle = m.color; ctx.fill()
    ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillStyle = m.color
    ctx.fillText(m.label, x, AXIS_Y - 12)
  }
}

/* Lens */
function drawLens() {
  const f = focalLength.value
  const halfH = Math.min(95, 50 + f * 0.25)
  const curve = halfH * 0.6

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(LENS_X, AXIS_Y - halfH)
  ctx.quadraticCurveTo(LENS_X - curve, AXIS_Y, LENS_X, AXIS_Y + halfH)
  ctx.quadraticCurveTo(LENS_X + curve, AXIS_Y, LENS_X, AXIS_Y - halfH)
  ctx.closePath()

  const g = ctx.createLinearGradient(LENS_X - curve, AXIS_Y, LENS_X + curve, AXIS_Y)
  g.addColorStop(0, 'rgba(59,130,246,0.10)'); g.addColorStop(0.25, 'rgba(59,130,246,0.22)')
  g.addColorStop(0.5, 'rgba(59,130,246,0.06)'); g.addColorStop(0.75, 'rgba(59,130,246,0.20)')
  g.addColorStop(1, 'rgba(59,130,246,0.10)')
  ctx.fillStyle = g; ctx.fill()
  ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2.5; ctx.stroke()
  ctx.restore()

  ctx.save(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.fillStyle = '#3b82f6'
  ctx.beginPath(); ctx.moveTo(LENS_X, AXIS_Y - halfH - 14); ctx.lineTo(LENS_X, AXIS_Y - halfH - 2); ctx.stroke()
  arrowHead(LENS_X, AXIS_Y - halfH - 2, -Math.PI / 2, 7)
  ctx.beginPath(); ctx.moveTo(LENS_X, AXIS_Y + halfH + 14); ctx.lineTo(LENS_X, AXIS_Y + halfH + 2); ctx.stroke()
  arrowHead(LENS_X, AXIS_Y + halfH + 2, Math.PI / 2, 7)
  ctx.restore()

  ctx.fillStyle = '#9ca3af'; ctx.fillRect(LENS_X - 3, AXIS_Y + halfH - 2, 6, RAIL_Y - AXIS_Y - halfH + 2)
  ctx.fillStyle = '#6b7280'; ctx.fillRect(LENS_X - 6, RAIL_Y - 4, 12, 8)
}

/* Candle */
function drawCandle(time) {
  const h = objectHeight.value, cx = LENS_X - candleDist
  const bodyTop = AXIS_Y - h
  const bodyH = RAIL_Y - bodyTop

  ctx.save()

  // Base
  ctx.fillStyle = '#8b7355'; roundRect(cx - 16, RAIL_Y - 8, 32, 8, 3); ctx.fill()
  ctx.fillStyle = '#6b5735'; ctx.fillRect(cx - 10, RAIL_Y - 4, 20, 4)

  // Body (from bodyTop down to rail)
  const g = ctx.createLinearGradient(cx - 6, bodyTop, cx + 6, bodyTop)
  g.addColorStop(0, '#f5e6c8'); g.addColorStop(0.3, '#fdf5e6')
  g.addColorStop(0.6, '#f5e6c8'); g.addColorStop(1, '#e8d5a8')
  ctx.fillStyle = g; roundRect(cx - 6, bodyTop, 12, bodyH, 2); ctx.fill()
  ctx.strokeStyle = '#d4c4a0'; ctx.lineWidth = 0.8; roundRect(cx - 6, bodyTop, 12, bodyH, 2); ctx.stroke()

  // Wick
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(cx, bodyTop); ctx.lineTo(cx, bodyTop - 10); ctx.stroke()

  // Flame
  const flicker = Math.sin(time * 0.008 + flamePhase) * 2.5 \
    + Math.sin(time * 0.015 + flamePhase * 1.3) * 1.5 \
    + Math.sin(time * 0.003 + flamePhase * 0.7) * 3
  const flameH = 20 + flicker * 0.4
  const flameW = 9 + flicker * 0.15
  const sway = Math.sin(time * 0.006 + flamePhase * 0.5) * 2.5
  const fcx = cx + sway
  const fcy = bodyTop - 10 - flameH * 0.45

  const og = ctx.createRadialGradient(fcx, fcy, 0, fcx, fcy, flameH * 0.7)
  og.addColorStop(0, 'rgba(255,200,50,0.9)'); og.addColorStop(0.3, 'rgba(255,150,30,0.6)')
  og.addColorStop(0.6, 'rgba(255,100,20,0.25)'); og.addColorStop(1, 'rgba(255,60,10,0)')
  ctx.fillStyle = og
  ctx.beginPath(); ctx.ellipse(fcx, fcy, flameW, flameH * 0.55, 0, 0, Math.PI * 2); ctx.fill()

  const ig = ctx.createRadialGradient(fcx * 0.5 + cx * 0.5, fcy + 1, 0, fcx * 0.5 + cx * 0.5, fcy + 1, flameW * 0.6)
  ig.addColorStop(0, 'rgba(255,255,230,1)'); ig.addColorStop(0.5, 'rgba(255,230,150,0.8)')
  ig.addColorStop(1, 'rgba(255,180,80,0)')
  ctx.fillStyle = ig
  ctx.beginPath(); ctx.ellipse(fcx * 0.5 + cx * 0.5, fcy + 1, flameW * 0.5, flameH * 0.3, 0, 0, Math.PI * 2); ctx.fill()

  ctx.restore()
}

/* Three principal rays */
function drawRays() {
  const f = focalLength.value, h = objectHeight.value, u = candleDist, v = imageDist(u)
  const ox = LENS_X - u, oTop = AXIS_Y - h
  const isVirtual = (v < 0) || !isFinite(v)
  const absV = Math.abs(v)
  const ix = LENS_X + (isVirtual || !isFinite(v) ? -absV : absV)
  const mag = isFinite(v) ? Math.abs(v / u) : 0
  const iTop = isVirtual ? (AXIS_Y - h * mag) : (AXIS_Y + h * mag)

  const styles = [
    { color: '#3b82f6', glow: 'rgba(59,130,246,0.15)', label: 'Parallel ray' },
    { color: '#f59e0b', glow: 'rgba(245,158,11,0.15)', label: 'Center ray' },
    { color: '#10b981', glow: 'rgba(16,185,129,0.15)', label: 'Focal ray' },
  ]

  ctx.save(); ctx.lineCap = 'round'

  // Ray 1: parallel to axis -> through F'
  if (isFinite(v)) {
    const endX = isVirtual ? (LENS_X + 260) : ix
    const endY = isVirtual ? (oTop + (AXIS_Y - oTop) * (260 / f)) : iTop
    ctx.save(); ctx.globalAlpha = 0.2; ctx.strokeStyle = styles[0].glow; ctx.lineWidth = 6
    ctx.beginPath(); ctx.moveTo(ox, oTop); ctx.lineTo(LENS_X, oTop); ctx.lineTo(endX, endY); ctx.stroke(); ctx.restore()
    ctx.strokeStyle = styles[0].color; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(ox, oTop); ctx.lineTo(LENS_X, oTop); ctx.lineTo(endX, endY); ctx.stroke()
  }

  // Ray 2: through center -> straight
  if (isFinite(v) && mag < 10) {
    let endX, endY
    if (isVirtual) {
      const slope = (AXIS_Y - oTop) / (LENS_X - ox)
      endX = LENS_X + 260; endY = AXIS_Y + slope * 260
    } else {
      endX = ix; endY = iTop
    }
    ctx.save(); ctx.globalAlpha = 0.2; ctx.strokeStyle = styles[1].glow; ctx.lineWidth = 6
    ctx.beginPath(); ctx.moveTo(ox, oTop); ctx.lineTo(LENS_X, AXIS_Y); ctx.lineTo(endX, endY); ctx.stroke(); ctx.restore()
    ctx.strokeStyle = styles[1].color; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(ox, oTop); ctx.lineTo(LENS_X, AXIS_Y); ctx.lineTo(endX, endY); ctx.stroke()
  }

  // Ray 3: through F (object side) -> parallel to axis
  if (isFinite(v) && Math.abs(u - f) > 1) {
    const leftFX = LENS_X - f
    const slope = (oTop - AXIS_Y) / (ox - leftFX)
    const atLensY = AXIS_Y + slope * (LENS_X - leftFX)

    let endX, endY
    if (isVirtual) {
      endX = LENS_X + 260; endY = atLensY
    } else {
      endX = ix; endY = iTop
    }

    ctx.save(); ctx.globalAlpha = 0.2; ctx.strokeStyle = styles[2].glow; ctx.lineWidth = 6
    ctx.beginPath(); ctx.moveTo(ox, oTop); ctx.lineTo(LENS_X, atLensY); ctx.lineTo(endX, endY); ctx.stroke(); ctx.restore()
    ctx.strokeStyle = styles[2].color; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(ox, oTop); ctx.lineTo(LENS_X, atLensY); ctx.lineTo(endX, endY); ctx.stroke()
  }

  // Virtual image extensions (dashed)
  if (isVirtual && isFinite(v)) {
    ctx.save(); ctx.setLineDash([6, 5]); ctx.globalAlpha = 0.4
    ctx.strokeStyle = '#a0a0a0'; ctx.lineWidth = 1.5

    const r1EndX = LENS_X + 200
    const r1EndY = oTop + (AXIS_Y - oTop) * (200 / f)
    ctx.beginPath(); ctx.moveTo(r1EndX, r1EndY); ctx.lineTo(ix, iTop); ctx.stroke()

    const slope2 = (AXIS_Y - oTop) / (LENS_X - ox)
    const r2EndX = LENS_X + 200
    const r2EndY = AXIS_Y + slope2 * 200
    ctx.beginPath(); ctx.moveTo(r2EndX, r2EndY); ctx.lineTo(ix, iTop); ctx.stroke()

    const leftFX3 = LENS_X - f
    const slope3 = (oTop - AXIS_Y) / (ox - leftFX3)
    const atLensY3 = AXIS_Y + slope3 * (LENS_X - leftFX3)
    const r3EndX = LENS_X + 200
    const r3EndY = atLensY3
    ctx.beginPath(); ctx.moveTo(r3EndX, r3EndY); ctx.lineTo(ix, iTop); ctx.stroke()

    ctx.setLineDash([]); ctx.restore()
  }

  // Legend
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.font = '11px system-ui, sans-serif'
  for (let ri = 0; ri < styles.length; ri++) {
    ctx.fillStyle = styles[ri].color; ctx.fillRect(W - 120, 16 + ri * 22, 12, 3)
    ctx.fillText(styles[ri].label, W - 104, 20 + ri * 22)
  }

  ctx.restore()
}

/* Screen */
function drawScreen() {
  const v = imageDist(candleDist)
  if (v < 0 || !isFinite(v)) return

  const sx = LENS_X + screenDist
  const screenH = Math.max(objectHeight.value * 1.4, 80)

  ctx.save()

  const g = ctx.createLinearGradient(sx, AXIS_Y - screenH / 2, sx, AXIS_Y + screenH / 2)
  g.addColorStop(0, '#fafafa'); g.addColorStop(0.5, '#f2f2f2'); g.addColorStop(1, '#e8e8e8')
  ctx.fillStyle = g; roundRect(sx - 18, AXIS_Y - screenH / 2, 36, screenH, 3); ctx.fill()
  ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1.5; roundRect(sx - 18, AXIS_Y - screenH / 2, 36, screenH, 3); ctx.stroke()

  const ix = LENS_X + v
  const dist = Math.abs(sx - ix)
  const sharpness = Math.max(0, 1 - dist / 60)

  if (sharpness > 0.02) {
    const imgH = objectHeight.value * Math.abs(v / candleDist) * (0.3 + sharpness * 0.7)
    if (imgH > 2) {
      ctx.fillStyle = 'rgba(220,38,38,' + (sharpness * 0.4) + ')'
      ctx.fillRect(sx - (4 + (1 - sharpness) * 16) / 2, AXIS_Y - imgH / 2, 4 + (1 - sharpness) * 16, imgH)

      if (sharpness > 0.7) {
        ctx.fillStyle = '#dc2626'; ctx.font = 'bold 11px system-ui, sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        ctx.fillText('Inverted real image', sx, AXIS_Y - imgH / 2 - 8)
      }
    }
  }

  ctx.fillStyle = '#9ca3af'
  ctx.fillRect(sx - 3, AXIS_Y + screenH / 2 - 2, 6, RAIL_Y - AXIS_Y - screenH / 2 + 2)
  ctx.fillStyle = '#6b7280'; ctx.fillRect(sx - 6, RAIL_Y - 4, 12, 8)

  ctx.fillStyle = '#6b7280'; ctx.font = '10px system-ui, sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('Screen', sx, AXIS_Y + screenH / 2 + 6)

  ctx.restore()
}

/* Image indicator */
function drawImage() {
  const h = objectHeight.value, u = candleDist, v = imageDist(u)
  if (!isFinite(v) || Math.abs(v) > 2000) return

  const isVirtual = v < 0
  const absV = Math.abs(v)
  const ix = LENS_X + (isVirtual ? -absV : absV)
  const mag = Math.abs(v / u)
  const imageH = h * mag
  if (imageH < 1) return

  const iTop = isVirtual ? (AXIS_Y - imageH) : (AXIS_Y + imageH)

  ctx.save()

  if (isVirtual) {
    ctx.setLineDash([6, 4]); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(ix, AXIS_Y); ctx.lineTo(ix, iTop); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#f59e0b'; ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('Virtual image (upright, enlarged)', ix, iTop - 8)
  } else {
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(ix, AXIS_Y); ctx.lineTo(ix, iTop); ctx.stroke()
    if (imageH > 5) {
      ctx.fillStyle = '#dc2626'
      arrowHead(ix, iTop, Math.PI / 2, 8)
    }
  }

  ctx.restore()
}

/* Info panel */
function drawInfo() {
  const u = candleDist, f = focalLength.value, v = imageDist(u)
  const isVirtual = (v < 0) || !isFinite(v)
  const absV = Math.abs(v)
  const m = isFinite(v) ? Math.abs(v / u) : 0
  const st = stageOf(u)

  let stateText
  if (!isFinite(v)) stateText = 'u=f: no image (parallel light)'
  else if (st === 'far') stateText = 'u > 2f: inverted reduced real image'
  else if (st === 'mid') stateText = 'f < u < 2f: inverted enlarged real image'
  else stateText = 'u < f: upright enlarged virtual image'

  readout.value = {
    u: (u / f).toFixed(2) + 'f',
    v: '' + (absV / f).toFixed(2) + 'f' + (isVirtual ? ' (virtual)' : ''),
    m: m.toFixed(2),
    state: stateText
  }

  ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'top'

  const vStr = isVirtual || !isFinite(v) \
    ? 'Image dist v = ' + (isFinite(v) ? '' : '\\u221e') + (isFinite(v) ? (absV / f).toFixed(2) + 'f (virtual)' : '') \
    : 'Image dist v = ' + (v / f).toFixed(2) + 'f'

  const lines = [
    { text: 'Object dist u = ' + (u / f).toFixed(2) + 'f', color: '#1e293b', size: 14, bold: true },
    { text: vStr, color: (isVirtual && isFinite(v)) ? '#f59e0b' : (!isFinite(v) ? '#6b7280' : '#3b82f6'), size: 13, bold: false },
    { text: 'Magnification |m| = ' + m.toFixed(2), color: '#1e293b', size: 13, bold: false },
  ]

  const padX = 24, padY = 18, lineH = 22
  const boxW = 230, boxH = lines.length * lineH + padY * 2

  ctx.fillStyle = 'rgba(255,255,255,0.92)'; roundRect(12, 12, boxW, boxH, 8); ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1; roundRect(12, 12, boxW, boxH, 8); ctx.stroke()

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]; ctx.fillStyle = l.color
    ctx.font = (l.bold ? 'bold ' : '') + l.size + 'px system-ui, sans-serif'
    ctx.fillText(l.text, padX, padY + i * lineH)
  }

  ctx.restore()
}

/* Main render loop */
function render(time) {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  const dpr = getDPR(), { w, h } = getSize(), { scale, ox, oy } = getTransform()

  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawBg()
  ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale)
  ctx.save(); ctx.beginPath(); ctx.rect(2, 2, W - 4, H - 4); ctx.clip()

  drawAxis(); drawRail()

  if (dragging !== 'screen') {
    const v = imageDist(candleDist)
    if (isFinite(v) && v > 0 && v < 3000) {
      const diff = v - screenDist
      screenDist += diff * 0.08
      if (Math.abs(diff) < 0.5) screenDist = v
    }
  }

  drawMarkers(); drawLens(); drawRays(); drawScreen(); drawImage(); drawCandle(time); drawInfo()

  ctx.restore(); ctx.restore(); ctx.restore()

  checkSeen()
  flamePhase += 0.3
}

function loop(time) { render(time || 0); rafId = requestAnimationFrame(loop) }

function onPointerDown(e) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const lp = toLogical(e.clientX - rect.left, e.clientY - rect.top)

  const sx = LENS_X + screenDist
  const screenHalfH = Math.max(objectHeight.value * 1.4, 80) / 2
  const onScreen = lp.x > sx - 25 && lp.x < sx + 25 && lp.y > AXIS_Y - screenHalfH - 10 && lp.y < RAIL_Y + 10

  canvas.setPointerCapture(e.pointerId)

  if (onScreen) {
    dragging = 'screen'
    const move = (ev) => {
      const p = toLogical(ev.clientX - rect.left, ev.clientY - rect.top)
      screenDist = Math.min(Math.max(p.x - LENS_X, 30), W - LENS_X - 40)
    }
    const up = () => { dragging = null; canvas.releasePointerCapture(e.pointerId); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up) }
    canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up)
  } else {
    dragging = 'candle'
    const move = (ev) => {
      const p = toLogical(ev.clientX - rect.left, ev.clientY - rect.top)
      candleDist = Math.min(Math.max(LENS_X - p.x, 15), 380)
    }
    const up = () => { dragging = null; canvas.releasePointerCapture(e.pointerId); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up) }
    canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up)
  }
}

function checkSeen() {
  seenZones[stageOf(candleDist)] = true
  if (seenZones.far && seenZones.mid && seenZones.near && !experimentDone) {
    experimentDone = true
    hint.value = 'All three image cases observed! Experiment complete.'
    emit('complete')
  } else {
    hint.value = 'Drag candle to change u, drag screen to find sharp image'
  }
}

function resetAll() {
  candleDist = 220
  screenDist = 220
  seenZones.far = false
  seenZones.mid = false
  seenZones.near = false
  experimentDone = false
  hint.value = 'Drag candle to change u, drag screen to find sharp image'
}

const formulaRows = computed(() => {
  const f = focalLength.value, u = candleDist, v = imageDist(u), m = isFinite(v) ? Math.abs(v / u) : 0
  return [
    { label: 'Focal length f', value: f + ' px' },
    { label: 'Object dist u', value: u.toFixed(0) + ' px = ' + (u / f).toFixed(2) + 'f' },
    { label: 'Image dist v = uf/(u-f)', value: isFinite(v) ? v.toFixed(1) + ' px = ' + (v / f).toFixed(2) + 'f' : 'No image' },
    { label: 'Magnification |m| = |v/u|', value: isFinite(v) ? m.toFixed(2) : '\u2014' }
  ]
})
const formulaResults = computed(() => {
  const f = focalLength.value, u = candleDist, v = imageDist(u)
  const isValid = isFinite(v) && Math.abs(v) < 2000, lhs = isValid ? 1 / u + 1 / v : 0, rhs = 1 / f, ok = isValid && Math.abs(lhs - rhs) < 1e-6
  return [
    { label: '1/u + 1/v', value: isValid ? '1/' + u.toFixed(0) + ' + 1/' + v.toFixed(0) + ' = ' + lhs.toFixed(6) : 'No image' },
    { label: '1/f', value: '1/' + f + ' = ' + rhs.toFixed(6) },
    { label: ok ? 'Gauss formula holds' : 'Calculating...', value: ok ? 'Equal' : '\u2014' }
  ]
})
const verifySteps = computed(() => {
  const f = focalLength.value, u = candleDist, v = imageDist(u)
  const isValid = isFinite(v) && Math.abs(v) < 2000, m = isValid ? Math.abs(v / u) : 0
  return [
    'From 1/u + 1/v = 1/f solve v, then m = |v/u|',
    isValid ? 'Substitute: 1/' + u.toFixed(0) + ' + 1/' + v.toFixed(0) + ' = 1/' + f + ', verified' : 'u \\u2248 f: no image (parallel rays)',
    isValid ? (v < 0 ? 'v < 0 \\u2192 virtual image (same side, upright, enlarged)' : 'v > 0 \\u2192 real image (inverted), |m| = ' + m.toFixed(2)) : 'u = f: no image'
  ]
})

onMounted(() => { resizeCanvas(); rafId = requestAnimationFrame(loop); window.addEventListener('resize', resizeCanvas) })
onBeforeUnmount(() => { if (rafId) cancelAnimationFrame(rafId); window.removeEventListener('resize', resizeCanvas) })
</script>

<template>
  <div class="lab-stage">
    <div class="lab-left">
      <div class="lab-panel" style="padding:0;overflow:hidden">
        <canvas ref="canvasRef" @pointerdown="onPointerDown" style="touch-action:none;cursor:grab;width:100%;height:520px;display:block;border-radius:8px" />
      </div>
      <div class="lab-actions">
        <span class="feedback" :class="experimentDone ? 'ok' : 'no'">{{ hint }}</span>
        <button class="btn btn-sm" @click="resetAll">Reset</button>
      </div>
    </div>

    <aside class="lab-right">
      <div class="lab-panel">
        <div class="lab-panel-head"><strong>Variables</strong><span>Real-time</span></div>
        <div class="lab-params">
          <ParamSlider v-model="focalLength" :min="60" :max="180" :step="2" label="Focal length f" unit=" px" hint="Change focal length, F/2F markers move" />
          <ParamSlider v-model="objectHeight" :min="40" :max="160" :step="2" label="Object height h" unit=" px" hint="Change candle height, observe image size change" />
        </div>
      </div>

      <div class="lab-panel">
        <div class="lab-panel-head"><strong>Live data</strong><span>Read-only</span></div>
        <div class="lab-readout">
          <div class="lab-stat"><span>Object dist u</span><strong>{{ readout.u }}</strong></div>
          <div class="lab-stat accent"><span>Image dist v</span><strong>{{ readout.v }}</strong></div>
          <div class="lab-stat"><span>Magnification |m|</span><strong>{{ readout.m }}</strong></div>
          <div class="lab-stat success"><span>State</span><strong style="font-size:13px">{{ readout.state }}</strong></div>
        </div>
      </div>

      <FormulaPanel
        title="Formula &amp; Results"
        formula="1/u + 1/v = 1/f    |m| = |v/u|"
        desc="u: object dist, v: image dist, f: focal length. Drag candle or adjust f, values update in real-time."
        :rows="formulaRows"
        :result="formulaResults"
        :verify="verifySteps"
      />
    </aside>
  </div>
</template>
"""

with open(p, 'w', encoding='utf-8') as f:
    f.write(new)

print('Written successfully, size:', len(new), 'bytes')

# Verify key fixes
if 'bodyH = AXIS_Y - RAIL_Y' in new:
    print('WARNING: old bodyH formula still present!')
else:
    print('OK: bodyH formula fixed (now RAIL_Y - bodyTop)')

if 'function imageDist' in new:
    print('OK: imageDist function defined properly')
