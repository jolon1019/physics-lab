/* SVG viewBox 坐标换算：正确处理 preserveAspectRatio="xMidYMid meet" 的信箱留白
   —— 元素盒子长宽比与 viewBox 不一致时，内容按 min 缩放并居中，
   直接用 rect.width/vb.width 换算会产生随位置增大的偏移。 */
export function svgPoint(svg, clientX, clientY) {
  const rect = svg.getBoundingClientRect()
  const vb = svg.viewBox.baseVal
  const scale = Math.min(rect.width / vb.width, rect.height / vb.height)
  const offX = (rect.width - vb.width * scale) / 2
  const offY = (rect.height - vb.height * scale) / 2
  return {
    x: (clientX - rect.left - offX) / scale,
    y: (clientY - rect.top - offY) / scale
  }
}
