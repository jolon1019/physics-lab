# 2026-08-17 交付：通电线圈在磁场中的转动（直流电动机）

## 物理装置与教学语义

- **3D 场景**：水平转轴上缠有线圈，两端导线经换向器（默认开：两个铜半环）/ 滑环（关）→ 电刷 A/B → 外电路。N/S 瓦形磁极之间是径向磁场。
- **换向器开关**：`commutator.value` 切换 `computeDrive()` 与 `currentDirSign()` 两段公式：
  - 开：`τ = K · s · |cosθ|`，方向恒定 → 连续转动（直流电动机）。
  - 关：`τ = -K · cosθ · s`，越过 θ=±90° 力反向 → 摆动、不能连续转动（教材 20.4-3）。
- **电子流方向**：`currentDirSign()` 在换向器开时随 `cosθ` 翻号，与力箭头同步反向。
- **控件**：通电 / 播放 / 复位 / 反向电流 / 换向器 / 转速倍率；速度由 `speedScale.value` 调。

## 验证

- 单 Bash 调用内启动 chrome（带 `--no-proxy-server`）+ vite + Node 22 CDP 脚本，截图前后两态并比对 badge。
- 结果：`⇄ 换向器 开` → 点击按钮 → `⇄ 换向器 关`，运行时错误 = NONE，3D canvas 已挂载（canvasW=308）。
- 详见 `~/.workbuddy/skills/cdp-sandbox-verify/`（沉淀了完整工作流）。

## 文件

- `src/components/lab/CoilRotateLab.vue`（757 行，文件完好）：物理 + 3D + UI。
- `/.cdp-verify4.mjs`（验证脚本，2026-08-17 被 NUL 损坏后重写）。

## 后续

- 默认进仪表板态 `powerOn=false, paused=true`，需点 ⏻ 通电 + ▶ 播放 才看到旋转 → 摆动 物理行为。
- 3D 在 headless swiftshader 下截图只捕到 viewport 上部（控件 + 标题），canvas 区域在视口下方。本机浏览器（GPU）渲染正常。
- 主题：IDE Theme dark 面板 + 浅色标题栏（CSS 变量跟随）。
