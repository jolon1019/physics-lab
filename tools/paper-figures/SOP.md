# 试卷几何图重绘与自动核对 SOP

> 适用场景：新上传的试卷 PDF 中包含几何/函数示意图，需要把扫描图替换为程序化重绘的清晰配图（SVG→PNG）。
> 来源：2026-11-23 处理 p-174（邯郸汉光中学九上期中数学，13 幅图）的实战总结。

## 核心理念：测量 → 绘制 → 自动核对

不要"看一眼凭感觉画"。每幅图都走同一个闭环：

```
PDF 5x 裁剪原图 → 像素级测量(网格/坐标/标签) → 按实测坐标绘制 → verify 自动比对 → 按报告修复 → 复跑确认
```

硬性规则：
1. **不得添加原图没有的记号**（等分角弧、虚线、刻度，原图有就必须画，没有就不画）。
2. 照片类/复杂示意图不走重绘，直接用扫描裁剪图。
3. 坐标一律来自测量脚本输出，不靠目测估计。

## 目录与工具

```
tools/paper-figures/
├── crop-figs.py        # ① PDF 5x 裁剪各题图形区域（CROPS 比例框按卷配置）
├── build-figures.cjs   # ③ SVG 绘制 + playwright-core 截图 → public/figures/hg-q*.png
├── verify-figures.py   # ④ 自动比对报告 + 接触表 contact-<paperId>.png
├── SOP.md              # 本文档
└── crops/<paperId>/    # ② 裁剪参考图（入库存档，供复跑核对）
```

## 步骤（以 p-174 为例）

### ① 裁剪
- `python tools/paper-figures/crop-figs.py p-174`
- 新卷：在 `crop-figs.py` 的 `PAPERS` 加 PDF 路径，`CROPS` 里按"第几页 + 相对页面的比例框 (x0,y0,x1,y1)"逐题填框，输出到 `crops/<paperId>/q<题号>.png`。
- 框宁大勿小（后续脚本会自动剥离文字），但注意别把图切掉一角（q8/q11/q12 都踩过切底的坑，扩框重裁即可）。

### ② 测量（重绘正确性的关键）
用 PIL+numpy 像素测量（参考 verify-figures.py 里的手法，可复制改参数）：
- **网格题**：统计行/列暗像素占比 > 阈值找网格线位置 → 换算格子坐标（q8：A(2,1) B(1,4) C(5,4)…，外心恰在 F 与选项吻合可交叉验证）。
- **函数曲线**：逐列探针重建曲线轨迹 + 锚点校准 px/unit（q16 双曲线 k=6 就是测出来的，靠猜是 k=9）。
- **标签位置**：BFS 连通域找字形 blob 的质心，确定 A/B/M 等字母在点的哪个方位。
- **复合图**：放大局部（裁剪 + resize）逐线核对，如 q24 图2 的线段清单：A–B、B–C、A–C、A–D、A–E、D–E(过M)、D–C(过P)、E–C、B–D、M–N、M–P、P–N。

### ③ 绘制
- 复制 `build-figures.cjs` 为 `build-figures-<paperId>.cjs`，保留 helpers（line/pl/qpath/arc/txt/dot/hollow/mlab/curve/svgWrap），替换各 `q*()` 函数与 `FIGS` 映射。
- 一律用实测坐标；标签用 `txt()` 标明 anchor（a:'end'/'start'）与斜体 `it:1`；虚线 `{d:'6 4'}`；角标记用 `arc()`。
- 运行 `node build-figures-<paperId>.cjs` → 3x 截图输出 `public/figures/hg-q<n>.png`。
- 应用侧：题图在 `src/data/questionBank.js`（figures 字段）+ `src/data/paperExtras.js`（重排版配置）引用；配图统一放题干下方（PaperQuestion.vue 的 `pq-figs-below`）。

### ④ 自动核对
- `python tools/paper-figures/verify-figures.py p-174`
- 输出：逐图结构特征评分（行列投影/直线谱/轮廓/blob）+ `contact-<paperId>.png` 接触表（左原图选区、右生成图，一次看全 13 幅）。
- **用法要领**：评分对扫描噪声敏感（笔画粘连、残留文字会导致误报），所以流程是——报告+接触表**定位疑点** → 对疑点精测坐标 → 修复 → 复跑。不要追求全绿分数，也不要跳过报告纯肉眼核对。

## 已验证有效的比对管线细节（verify-figures.py 内置）
- 原图预处理：全局阈值二值化 → 文字行剥离（小连通域按 y 聚类，≥4 个成行的删）→ 行带选择（保留最高图形带+紧邻标签带）→ 竖直留白分段。
- 多面板题（q11 四选项/q23 五小图/q24 两图）按面板配对比较，取各段最优匹配均值。
- 细线保护：缩到 220px 比对前先 MaxFilter(3) 加粗，否则 SVG 细线在降采样中消失导致全图 blob=0。

## 本卷踩坑记录（新卷可直接对照避免）
| 图 | 坑 | 教训 |
|---|---|---|
| q8 | 网格坐标全错、多画一列 | 必须实测格点，别目测 |
| q12 | 裁剪切掉抛物线顶点导致误判 | 裁剪框要覆盖完整图形 |
| q16 | 双曲线 k 目测成 9，实测是 6 | 曲线参数必须用轨迹拟合 |
| q19 | 多画了反比例曲线 | 原图只有的才画，没有的坚决不画 |
| q20 | 辐条 5 根 vs 原图 6 根、缺等分角弧 | 数量类细节要逐个数 |
| q21 | 第三象限支画成灰色、多刻度 | 颜色/刻度同样以原图为准 |
| q24 | 图2 缺 BD、MN 两条线 | 复合图先列线段清单再核对 |

## 依赖
- Python: `pip install pymupdf pillow numpy`
- Node: `playwright-core`（channel msedge）+ 本机 Edge
