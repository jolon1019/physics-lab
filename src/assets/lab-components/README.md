# 实验元件 PNG 素材规范（lab-components）

> 适配目标：统一画板架构 **「SVG/Pinia 做机器层 + PNG 做元件外观」**。
> 背景由 `BlackBoardBg.vue` 统一提供；元件视觉用透明 PNG，物理/交互/导线跟随仍由现有
> `src/circuit/*` 与 `stores/circuit.js` 的 SVG 体系保证，**换素材不动任何物理代码**。

---

## 1. 目录结构

```
src/assets/lab-components/
├─ optics/          # 光学实验
│  ├─ candle.png    # 蜡烛（发光物）
│  ├─ lens.png      # 凸透镜
│  └─ screen.png    # 光屏
├─ circuit/         # 电路实验（与 src/circuit/components.js 的 META.type 对应）
│  ├─ battery.png
│  ├─ switch.png
│  ├─ bulb.png
│  ├─ resistor.png
│  ├─ rheostat.png
│  ├─ ammeter.png
│  └─ voltmeter.png
└─ mechanics/       # 力学实验
   ├─ cart.png      # 小车
   └─ weight.png    # 砝码
```

按实验分子目录，文件名 = `META` 里的元件 `type`（小写 kebab）。

## 2. 美术框与坐标约定（关键）

所有元件 PNG **统一画在 120 × 104 px 的美术框内**，中心为原点 `(0,0)`，
即 PNG 左上角在 `(-60, -52)`。

- 这与 `ComponentPalette.vue` 的预览 `viewBox="-60 -52 120 104"` 完全一致，
  保证调色板缩略图与画布实物 1:1 对齐。
- 元件在画布上的位置 `(c.x, c.y)` 即美术框中心；旋转绕中心。
- **接线柱坐标 = 相对美术框中心 (0,0) 的偏移**，与 `src/circuit/components.js`
  `META[type].terminals` 中定义的值直接对应：
  - 现有约定（中心原点）：`battery` 正极 `{x:44, y:0}`、负极 `{x:-44, y:0}`。
  - 换算成 PNG 像素：正极落在 `(60+44, 52+0) = (104, 52)`，负极 `(16, 52)`。
  - **作图时让 PNG 上该物理点正好位于这个像素**，导线就会从正确位置引出。

> 提示：端子坐标用「中心原点」而非「左上角」，是为了和现有 `META` 零改动兼容。
> 若你用 Figma/PS 出图，把参考点设在画布中心 `(60,52)` 即可。

## 3. 出图要求

- 格式：**PNG-24，带 alpha 透明通道**，不要白底。
- 统一视觉权重：元件主体尽量占满美术框（不要缩在角落），避免尺寸差异过大。
- 线条/描边风格统一（建议 2px 深描边 + 平涂填色，呼应 neo-brutalism）。
- 可选提供 `@2x` 高清版（`battery@2x.png`，240×208），由加载逻辑按 DPR 选择。
- 光线、刻度、接线柱圆点、电子流 **不要画进 PNG**——这些由代码动态绘制。

## 4. 嵌入方式（代码侧，迁移阶段使用）

把 PNG 用 `<image>` 嵌进元件 `<g>`，端子/导线/拖拽全部沿用现有体系：

```vue
<!-- 在 CircuitBuildCanvas 的元件 <g transform="translate(c.x,c.y) rotate(c.rot)"> 内 -->
<image
  v-if="artUrl(c.type)"
  :href="artUrl(c.type)"
  x="-60" y="-52" width="120" height="104"
  :preserveAspectRatio="'xMidYMid meet'"
/>
<g v-else v-html="buildArt(c.type, artState(c))"></g>  <!-- 缺图回退矢量 -->
```

Vite 导入（返回解析后的 URL）：

```js
import batteryUrl from '@/assets/lab-components/circuit/battery.png'
// 缺图时回退到现有 buildArt 矢量绘制，不阻塞开发
function artUrl(type) {
  const map = { battery: batteryUrl /*, bulb: bulbUrl, ... */ }
  return map[type] || null
}
```

## 5. 回退策略

- 素材未到位时，`artUrl()` 返回 `null` → 自动渲染现有矢量 `buildArt()`，
  实验功能不受影响，可边开发边补素材。
- 迁移顺序建议：先 `circuit/`（机器层已就绪），再 `optics/`（LensLab 迁到统一基座后接入）。

## 6. 当前进度

- [x] `BlackBoardBg.vue` 统一背景组件（chalk / dark 两种表面 + 统一木框 + 网格）
- [x] 电路搭建台 `CircuitBuildCanvas.vue` 已接入黑板背景（chalk）
- [ ] 各实验 PNG 素材产出并接入（按本规范第 1/2/3 节）
- [ ] `LensLab` 等光学/力学实验迁移到统一基座并接入 PNG
