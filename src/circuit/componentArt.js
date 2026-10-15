// 写实风电路元件矢量绘图（替代原 400×400 PNG 贴图，零网络请求）。
// componentArtSvg(type, st) 返回 SVG 标记字符串：
//   局部坐标系以元件中心为原点，接线柱位于 (±44, 0) 一带，整体落在 -50..50 盒内
//   （与原 PNG_SIZE 定位约定一致，端子几何不变，导线接线不受影响）。
// artDataUrl(type, st) 把同一份 SVG 转 data URL，供 canvas（drawCircuitIcon）经 Image blit，
//   data URL 无网络往返，首次绘制即可用，解决贴图加载慢的问题。
// type: 'battery' | 'switch'(st.open) | 'bulb' | 'rheostat'(st.frac) | 'ammeter' | 'voltmeter'(st.volts)

const DEFS = `
<defs>
  <linearGradient id="ca-metal" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f5f8fb"/><stop offset="0.45" stop-color="#ccd6e0"/><stop offset="1" stop-color="#8b98a7"/>
  </linearGradient>
  <linearGradient id="ca-gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fce8b0"/><stop offset="0.5" stop-color="#e6bc66"/><stop offset="1" stop-color="#a97a2e"/>
  </linearGradient>
  <linearGradient id="ca-copper" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#dd9a52"/><stop offset="0.5" stop-color="#b26124"/><stop offset="1" stop-color="#7a3d12"/>
  </linearGradient>
  <linearGradient id="ca-red" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ff9080"/><stop offset="0.5" stop-color="#d93025"/><stop offset="1" stop-color="#9c1a10"/>
  </linearGradient>
  <linearGradient id="ca-green" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#a8d8b0"/><stop offset="0.5" stop-color="#6ea883"/><stop offset="1" stop-color="#4e8462"/>
  </linearGradient>
  <linearGradient id="ca-screen" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#313a44"/><stop offset="1" stop-color="#151a20"/>
  </linearGradient>
  <linearGradient id="ca-case" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#41464e"/><stop offset="0.18" stop-color="#23262c"/><stop offset="0.8" stop-color="#101216"/><stop offset="1" stop-color="#0a0c0f"/>
  </linearGradient>
  <linearGradient id="ca-dial" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset="0.7" stop-color="#f2f5f8"/><stop offset="1" stop-color="#dde4ea"/>
  </linearGradient>
  <radialGradient id="ca-glass" cx="0.35" cy="0.3" r="1">
    <stop offset="0" stop-color="#7c8aa0"/><stop offset="0.7" stop-color="#3a434f"/><stop offset="1" stop-color="#232b35"/>
  </radialGradient>
</defs>`

function shadow(cx, cy, rx) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="4.5" fill="rgba(0,0,0,0.13)"/>`
}

/* ===== 干电池组（横躺，左−右+；消费方旋转 90° 竖放）===== */
function artBattery() {
  let plus = ''
  for (const cx of [-19, 19]) {
    plus += `<circle cx="${cx}" cy="0" r="7.5" fill="none" stroke="#d93025" stroke-width="2.2"/>
<line x1="${cx}" y1="-4.5" x2="${cx}" y2="4.5" stroke="#d93025" stroke-width="2.2"/>
<line x1="${cx - 4.5}" y1="0" x2="${cx + 4.5}" y2="0" stroke="#d93025" stroke-width="2.2"/>`
  }
  return `${shadow(0, 20, 44)}
<rect x="-38" y="-16" width="38" height="32" rx="7" fill="url(#ca-gold)" stroke="#8a6420" stroke-width="1.4"/>
<rect x="0" y="-16" width="38" height="32" rx="7" fill="url(#ca-gold)" stroke="#8a6420" stroke-width="1.4"/>
<line x1="0" y1="-14" x2="0" y2="14" stroke="#a9802e" stroke-width="1.6"/>
<rect x="-34" y="-13" width="30" height="7" rx="3.5" fill="#fff" opacity="0.35"/>
<rect x="4" y="-13" width="30" height="7" rx="3.5" fill="#fff" opacity="0.35"/>
${plus}
<rect x="-44" y="4" width="88" height="13" rx="5" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.4"/>
<line x1="-40" y1="14.5" x2="40" y2="14.5" stroke="#77828f" stroke-width="1.1"/>
<rect x="-50" y="-5" width="9" height="13" rx="3" fill="url(#ca-red)" stroke="#8c1a10" stroke-width="1.2"/>
<rect x="41" y="-5" width="9" height="13" rx="3" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.2"/>`
}

/* ===== 电流表 / 电压表（笔记本形表体，屏在上、三接线柱绿面板、底托）===== */
function artMeter(letter) {
  const post = (cx, grad, topFill, stroke) =>
    `<rect x="${cx - 4}" y="-7" width="8" height="12" rx="2" fill="url(#${grad})" stroke="${stroke}" stroke-width="1"/>
<ellipse cx="${cx}" cy="-7" rx="4" ry="1.8" fill="${topFill}"/>`
  return `${shadow(0, 41, 42)}
<rect x="-44" y="-42" width="88" height="84" rx="9" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.8"/>
<rect x="-38" y="-38" width="76" height="34" rx="4" fill="url(#ca-screen)" stroke="#20262e" stroke-width="1.4"/>
<rect x="-35" y="-35" width="70" height="5" rx="2.5" fill="#fff" opacity="0.07"/>
<path d="M-16 -4 L16 -4 L11.5 -12 L-11.5 -12 Z" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.2"/>
<text x="0" y="-5" text-anchor="middle" font-size="9" font-weight="800" font-family="ui-monospace,monospace" fill="#1c232b">${letter}</text>
<rect x="-40" y="0" width="80" height="17" rx="4" fill="url(#ca-green)" stroke="#39414c" stroke-width="1.4"/>
${post(-20, 'ca-metal', '#aeb9c6', '#39414c')}
${post(0, 'ca-red', '#f28577', '#8c1a10')}
${post(20, 'ca-red', '#f28577', '#8c1a10')}
<rect x="-44" y="17" width="88" height="23" rx="6" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.6"/>
<line x1="-40" y1="34" x2="40" y2="34" stroke="#7f8b99" stroke-width="1.2"/>`
}

/* ===== 电压表（写实指针式，参照学生实验用双量程电压表实物图）=====
   黑胶木壳 + 大面积白色表盘窗（上排 0-3 / 下排 0-15 双刻度弧 + 居中大 V）+ 黑色指针随被测电压
   偏转（接在 15V 量程柱上，按 U/15 偏转）+ 表盘窗下调零螺丝 + 底部三个立体旋钮式接线柱：
   −（黑）、3V（红）、15V（红），旋钮下方白字标注量程。
   接线柱几何：− 柱中心 = 端子 a (-44,0)，15V 柱中心 = 端子 b (44,0)，中间 3V 为装饰柱，
   导线端点 (±44,0) 精确落在旋钮中心。st.volts：被测电压（V）。 */
function artVoltmeter(volts = 0) {
  const PIVY = -16.5
  const rot = -60 + 120 * Math.max(0, Math.min(1, volts / 15))
  const polar = (deg, r) => {
    const a = (deg * Math.PI) / 180
    return [r * Math.sin(a), PIVY - r * Math.cos(a)]
  }
  let ticks = ''
  for (let i = 0; i <= 30; i++) {
    const deg = -60 + i * 4
    const [x1, y1] = polar(deg, 16.5)
    const [x2, y2] = polar(deg, i % 10 === 0 ? 21.5 : i % 5 === 0 ? 20.5 : 19.2)
    ticks += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#22262c" stroke-width="${i % 10 === 0 ? 1.5 : i % 5 === 0 ? 1.1 : 0.7}"/>`
  }
  const rowLabels = (rows, r, fs) =>
    rows
      .map(([n, deg]) => {
        const [x, y] = polar(deg, r)
        return `<text x="${x.toFixed(2)}" y="${(y + fs * 0.35).toFixed(2)}" text-anchor="middle" font-size="${fs}" font-weight="700" font-family="system-ui,Arial" fill="#22262c">${n}</text>`
      })
      .join('')
  // 立体旋钮式接线柱：圆柱身 + 防滑纹 + 顶面 + 金属芯 + 中心插孔，中心即接线点
  const knob = (cx, body, edge, top) => `
<ellipse cx="${cx}" cy="4" rx="7.5" ry="2.7" fill="rgba(0,0,0,0.42)"/>
<circle cx="${cx}" cy="0" r="6.8" fill="${body}" stroke="${edge}" stroke-width="1"/>
<circle cx="${cx}" cy="0" r="5.4" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.5" stroke-dasharray="1.6 2.1"/>
<ellipse cx="${cx}" cy="-2" rx="6" ry="2.3" fill="${top}"/>
<ellipse cx="${cx}" cy="-2" rx="3.3" ry="1.35" fill="url(#ca-metal)" stroke="#2c333c" stroke-width="0.7"/>
<ellipse cx="${cx}" cy="-2" rx="1.6" ry="0.75" fill="#14171c"/>`
  return `${shadow(0, 26, 46)}
<rect x="-50" y="-50" width="100" height="72" rx="9" fill="url(#ca-case)" stroke="#07090b" stroke-width="1.6"/>
<line x1="-44" y1="-47.6" x2="44" y2="-47.6" stroke="rgba(255,255,255,0.10)" stroke-width="1.6" stroke-linecap="round"/>
<rect x="-44" y="-47" width="88" height="35" rx="5" fill="#0f1215"/>
<rect x="-41" y="-44" width="82" height="29" rx="3.5" fill="url(#ca-dial)" stroke="#0b0e11" stroke-width="1"/>
<path d="M -26 -44 L -10 -44 L -32 -15 L -41 -15 L -41 -30 Z" fill="#ffffff" opacity="0.16"/>
${ticks}
${rowLabels([[0, -60], [1, -20], [2, 20], [3, 60]], 24.2, 6.5)}
${rowLabels([[0, -60], [5, -20], [10, 20], [15, 60]], 13.8, 5.5)}
<text x="0" y="-19" text-anchor="middle" font-size="8" font-weight="900" font-family="system-ui,Arial" fill="#16191d">V</text>
<g transform="rotate(${rot.toFixed(2)} 0 ${PIVY})"><path d="M -1.2 ${PIVY + 5.5} L 0 ${PIVY - 21.5} L 1.2 ${PIVY + 5.5} Z" fill="#1a1e24"/></g>
<circle cx="0" cy="${PIVY}" r="2.9" fill="#24282e" stroke="#0d0f12" stroke-width="0.8"/>
<circle cx="-0.9" cy="${PIVY - 0.9}" r="0.8" fill="#77828e" opacity="0.9"/>
<circle cx="0" cy="-9.5" r="2.4" fill="url(#ca-metal)" stroke="#2c333c" stroke-width="0.7"/>
<line x1="-1.5" y1="-10.2" x2="1.5" y2="-8.8" stroke="#3c434d" stroke-width="0.9" stroke-linecap="round"/>
${knob(-44, '#2b2f36', '#0a0c0e', '#3d424b')}
${knob(0, 'url(#ca-red)', '#6f150c', '#f28577')}
${knob(44, 'url(#ca-red)', '#6f150c', '#f28577')}
<text x="-44" y="15.5" text-anchor="middle" font-size="7" font-weight="800" font-family="system-ui,Arial" fill="#e8ecf0">−</text>
<text x="0" y="15.5" text-anchor="middle" font-size="6.5" font-weight="800" font-family="system-ui,Arial" fill="#e8ecf0">3V</text>
<text x="44" y="15.5" text-anchor="middle" font-size="6.5" font-weight="800" font-family="system-ui,Arial" fill="#e8ecf0">15V</text>`
}

/* ===== 小灯座（灭）===== */
function artBulb() {
  const post = (cx) =>
    `<rect x="${cx - 4.5}" y="-2" width="9" height="13" rx="2.5" fill="url(#ca-red)" stroke="#8c1a10" stroke-width="1.2"/>
<ellipse cx="${cx}" cy="-2" rx="4.5" ry="2" fill="#f28577"/>`
  return `${shadow(0, 35, 43)}
<rect x="-46" y="8" width="92" height="26" rx="6" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.8"/>
<rect x="-43" y="10" width="86" height="6" rx="3" fill="#e6edf3" opacity="0.85"/>
${post(-37)}
${post(37)}
<rect x="-16" y="-4" width="32" height="13" rx="3" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.3"/>
<rect x="-15" y="-9" width="30" height="6" rx="3" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.2"/>
<rect x="-13" y="-14" width="26" height="5.5" rx="2.75" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.2"/>
<circle cx="0" cy="-27" r="17" fill="url(#ca-glass)" stroke="#454d58" stroke-width="1.6"/>
<rect x="-8" y="-13" width="16" height="5" fill="#3a434f"/>
<path d="M-9 -36 A11 11 0 0 1 1 -41" fill="none" stroke="#aeb6c2" stroke-width="2" opacity="0.75" stroke-linecap="round"/>
<path d="M-4 -21 L-2 -27 L2 -23 L4 -29" fill="none" stroke="#6b7480" stroke-width="1.4"/>`
}

/* ===== 闸刀开关（open=断开闸刀上扬 / 闭合水平搭在触点上）===== */
function artSwitch(open) {
  const angle = open ? -42 : 0
  return `${shadow(0, 35, 44)}
<rect x="-48" y="10" width="96" height="26" rx="6" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.8"/>
<line x1="-44" y1="31" x2="44" y2="31" stroke="#7f8b99" stroke-width="1.2"/>
<rect x="-49" y="0" width="11" height="14" rx="3" fill="url(#ca-red)" stroke="#8c1a10" stroke-width="1.2"/>
<ellipse cx="-43.5" cy="0" rx="5.5" ry="2.2" fill="#f28577"/>
<rect x="38" y="0" width="11" height="14" rx="3" fill="url(#ca-red)" stroke="#8c1a10" stroke-width="1.2"/>
<ellipse cx="43.5" cy="0" rx="5.5" ry="2.2" fill="#f28577"/>
<rect x="-34" y="-6" width="12" height="17" rx="3" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.4"/>
<ellipse cx="-28" cy="-6" rx="6" ry="2.4" fill="#eef2f6"/>
<rect x="24" y="-8" width="12" height="18" rx="2" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.4"/>
<ellipse cx="30" cy="-8" rx="6" ry="2.4" fill="#dfe7ee"/>
<g transform="rotate(${angle} -28 -8)">
  <rect x="-28" y="-11.5" width="54" height="7.5" rx="3.75" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.5"/>
  <rect x="10" y="-14" width="13" height="12" rx="4" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.4"/>
  <rect x="-27" y="-10.4" width="48" height="2.4" rx="1.2" fill="#fff" opacity="0.45"/>
</g>`
}

/* ===== 滑动变阻器（金属框架 + 铜线圈 + 顶杆滑套 + 滑片；st.frac 0..1 决定滑片位置）
        加长版：半宽 56（端子 A/B 同步外移到 ±56），滑杆行程 -45..45，滑片更易拖拽 ===== */
function artRheostat(frac = 0.5) {
  let wind = ''
  for (let x = -37; x <= 37; x += 3.5) {
    wind += `<line x1="${x}" y1="-10" x2="${x}" y2="13" stroke="rgba(60,25,5,0.5)" stroke-width="1.2"/>`
  }
  // 顶杆在 (-45..45) 范围，取 frac 比例
  const rodX = -45 + 90 * Math.max(0, Math.min(1, frac))
  return `${shadow(0, 40, 52)}
<line x1="-40" y1="16" x2="-46" y2="38" stroke="#39414c" stroke-width="5" stroke-linecap="round"/>
<line x1="40" y1="16" x2="46" y2="38" stroke="#39414c" stroke-width="5" stroke-linecap="round"/>
<line x1="-16" y1="16" x2="-16" y2="36" stroke="#39414c" stroke-width="4.5" stroke-linecap="round"/>
<line x1="16" y1="16" x2="16" y2="36" stroke="#39414c" stroke-width="4.5" stroke-linecap="round"/>
<rect x="-52" y="-32" width="10" height="50" rx="3" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.5"/>
<rect x="42" y="-32" width="10" height="50" rx="3" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.5"/>
<rect x="-42" y="-12" width="84" height="28" rx="11" fill="url(#ca-copper)" stroke="#5f2f0e" stroke-width="1.5"/>
${wind}
<rect x="-39" y="-10" width="78" height="5.5" rx="2.75" fill="#fff" opacity="0.18"/>
<rect x="-37" y="-5" width="8" height="12" rx="2" fill="url(#ca-red)" stroke="#8c1a10" stroke-width="1"/>
<rect x="29" y="-5" width="8" height="12" rx="2" fill="url(#ca-red)" stroke="#8c1a10" stroke-width="1"/>
<rect x="-56" y="-32" width="112" height="8" rx="4" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.5"/>
<circle cx="-56" cy="-28" r="4" fill="#dfe7ee" stroke="#39414c" stroke-width="1.1"/>
<circle cx="56" cy="-28" r="4" fill="#dfe7ee" stroke="#39414c" stroke-width="1.1"/>
<rect x="-46" y="-40" width="14" height="12" rx="3" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.4"/>
<line x1="-39" y1="-28" x2="-39" y2="-13" stroke="#8b98a7" stroke-width="3.2"/>
<g>
  <rect x="${rodX - 4}" y="-32" width="8" height="4" rx="1.5" fill="#3a434f" stroke="#1a1f25" stroke-width="0.8"/>
  <line x1="${rodX}" y1="-28" x2="${rodX}" y2="-13" stroke="#1a1f25" stroke-width="2.4" stroke-linecap="round"/>
</g>`
}

/* ===== 定值电阻（陶瓷实心立柱 + 四色环 + 两引脚；st.resistance 用于可选 R 标签）===== */
function artResistor(st = {}) {
  const ohm = st.resistance ? `${st.resistance}Ω` : ''
  return `${shadow(0, 32, 42)}
<rect x="-44" y="-13" width="6" height="26" rx="2" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.2"/>
<rect x="38" y="-13" width="6" height="26" rx="2" fill="url(#ca-metal)" stroke="#39414c" stroke-width="1.2"/>
<line x1="-44" y1="0" x2="-30" y2="0" stroke="#77828f" stroke-width="2"/>
<line x1="30" y1="0" x2="44" y2="0" stroke="#77828f" stroke-width="2"/>
<rect x="-30" y="-15" width="60" height="30" rx="3" fill="#f3e6c0" stroke="#a97a2e" stroke-width="1.4"/>
<rect x="-30" y="-15" width="60" height="6" rx="3" fill="#fff" opacity="0.45"/>
<!-- 四色环：棕黑红金 = 1kΩ ±5%（演示色与电阻选型无关，但贴近实物） -->
<rect x="-22" y="-16" width="4" height="32" fill="#7b3a16"/>
<rect x="-12" y="-16" width="4" height="32" fill="#0d0d0d"/>
<rect x="-2" y="-16" width="4" height="32" fill="#c9241b"/>
<rect x="8" y="-16" width="4" height="32" fill="#caa233"/>
<text x="22" y="3" text-anchor="middle" font-size="7" font-family="ui-monospace,monospace" fill="#5f2f0e" font-weight="700">${ohm}</text>`
}

/* ===== 对外接口 ===== */
const BUILDERS = {
  battery: () => artBattery(),
  ammeter: () => artMeter('A'),
  voltmeter: (st) => artVoltmeter(st && typeof st.volts === 'number' ? st.volts : 0),
  bulb: () => artBulb(),
  switch: (st) => artSwitch(!!st.open),
  rheostat: (st) => artRheostat(st && typeof st.frac === 'number' ? st.frac : 0.5),
  resistor: (st) => artResistor(st)
}

const CACHE = {}

// 返回元件矢量图（不含渐变外的公共 defs 由本函数一起给出）
export function componentArtSvg(type, st = {}) {
  // 缓存 key 必须反映 state：switch 的开合、rheostat 的 frac、voltmeter 的指针偏转
  // （电压按 0.1V 量化）都会改变形状；resistor 的 resistance 只影响标签文字，也带进 key 避免 stale
  const openKey = type === 'switch' && st.open ? ':open' : ''
  const fracKey = type === 'rheostat' && typeof st.frac === 'number' ? ':f' + st.frac.toFixed(3) : ''
  const ohmKey = type === 'resistor' && st.resistance ? ':' + st.resistance : ''
  const voltKey = type === 'voltmeter' && typeof st.volts === 'number' ? ':v' + Math.round(st.volts * 10) : ''
  const key = type + openKey + fracKey + ohmKey + voltKey
  if (!CACHE[key]) {
    const body = BUILDERS[type] ? BUILDERS[type](st) : ''
    CACHE[key] = DEFS + body
  }
  return CACHE[key]
}

// canvas 用：SVG → data URL（drawCircuitIcon 经 Image blit；data URL 无网络请求）
const URL_CACHE = {}
export function artDataUrl(type, st = {}) {
  const openKey = type === 'switch' && st.open ? ':open' : ''
  const fracKey = type === 'rheostat' && typeof st.frac === 'number' ? ':f' + st.frac.toFixed(3) : ''
  const ohmKey = type === 'resistor' && st.resistance ? ':' + st.resistance : ''
  const voltKey = type === 'voltmeter' && typeof st.volts === 'number' ? ':v' + Math.round(st.volts * 10) : ''
  const key = type + openKey + fracKey + ohmKey + voltKey
  if (!URL_CACHE[key]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="-50 -50 100 100">${componentArtSvg(type, st)}</svg>`
    URL_CACHE[key] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  }
  return URL_CACHE[key]
}
