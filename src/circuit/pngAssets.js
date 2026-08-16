// 共享电路元件 PNG 素材：与 OhmLab 同一套，用于在搭建台/元件库展示实物图。
// 透明底 400×400 正方形，按 type 取 URL 与建议显示尺寸（局部坐标，端子位于 META ±44）。
import batteryPng from '../assets/lab-components/circuit/battery.png'
import switchClosedPng from '../assets/lab-components/circuit/switch-closed.png'
import switchOpenPng from '../assets/lab-components/circuit/switch-open.png'
import bulbOffPng from '../assets/lab-components/circuit/bulb-off.png'
import rheostatPng from '../assets/lab-components/circuit/rheostat.png'
import ammeterPng from '../assets/lab-components/circuit/ammeter.png'
import voltmeterPng from '../assets/lab-components/circuit/voltmeter.png'

export const PNG_URL = {
  battery: batteryPng,
  switchClosed: switchClosedPng,
  switchOpen: switchOpenPng,
  bulb: bulbOffPng,
  rheostat: rheostatPng,
  ammeter: ammeterPng,
  voltmeter: voltmeterPng
}

// 搭建台局部坐标下的显示盒尺寸。显示半宽取 ≥44，使端子点 (±44) 落在 PNG 边缘附近，
// 视觉上"导线接在接线柱上"。rheostat 略宽以容纳横向电阻器图形。
export const PNG_SIZE = {
  battery:   { w: 100, h: 100 },
  switch:    { w: 100, h: 100 },
  bulb:      { w: 100, h: 100 },
  rheostat:  { w: 120, h: 100 },
  ammeter:   { w: 100, h: 100 },
  voltmeter: { w: 100, h: 100 }
}

// 端子行 y 中心（原始 400×400 PNG 坐标系）：用 PIL 扫每张 PNG 的红像素 y 中心测得。
// 多状态图（开关开/合）需把"端子行"对齐到元件中心 (0,0)，否则切换时整张图会上下跳。
// 画布无关偏移换算：dy = (参考态端子y - 当前态端子y) * contain缩放比例；
//   SVG 版（100×100 框）scale=0.25，canvas 版（86×74 框）scale=0.185，自动适配。
// 当前仅 switch-open 与 switch-closed 错位明显；其余元件视觉锚点已接近中心（battery 205.7、
// bulb 208.1、rheostat 193.5），仪表 ammeter/voltmeter 表盘本就偏下（259.3）暂不改。
export const PNG_TERMINAL_Y = {
  switchClosed: 198.4,
  switchOpen: 236.8,
  battery: 205.7,
  bulb: 208.1,
  rheostat: 193.5,
  ammeter: 259.3,
  voltmeter: 259.3
}
