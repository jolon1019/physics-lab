# 前端布局改造：实验目录可折叠 + 互动模块自动拉长

## 已实现功能
- **左侧实验目录可「靠左收缩」**：点击目录头部 `«` 按钮，侧栏平滑收拢为 64px 窄轨（仅保留各年级序号 01/02…），再次点击 `»` 展开完整目录树。
- **右侧实验互动模块自动「拉长」**：工作区由固定网格改为 Flex 布局，侧栏折叠后主内容区 `flex:1` 实时占满剩余宽度，无需刷新。
- **状态持久化**：折叠/展开状态存入 `localStorage`，刷新后保持。
- **移动端响应式**：≤1180px 时侧栏转为滑出式抽屉，配半透明遮罩与右下角悬浮「≡」按钮，目录收起时一键打开。
- **可达性**：折叠按钮带 `aria-expanded` / `aria-label`，窄轨年级按钮含 `title` 与 `aria-label`。

## 改动文件
| 文件 | 作用 |
| --- | --- |
| `src/stores/layout.js`（新增） | Pinia 布局状态 store，管理 `navCollapsed` 并持久化 |
| `src/App.vue` | 绑定 `nav-collapsed` 类；新增移动端遮罩 `nav-backdrop` 与悬浮按钮 `nav-fab` |
| `src/components/SideNav.vue` | 折叠/展开按钮；折叠态渲染窄轨快捷入口 `rail-grades`；展开态保留完整目录树 |
| `src/style.css` | `.workspace` 改 flex；新增 `--nav-w`/`--nav-rail-w` 变量、`nav-toggle`/`rail-*` 样式与抽屉/FAB 响应式规则 |

## 关键实现要点
- `.workspace`：`display:flex` + `.main-grid{flex:1 1 auto;min-width:0}`，主区随侧栏宽度变化自动伸缩。
- `.side-nav`：`flex:0 0 auto; width:var(--nav-w)`，过渡 `width 240ms`，折叠时切到 `--nav-rail-w`，侧栏始终 `position:sticky` 跟随滚动。
- 桌面窄轨点击年级序号 → 调用 `expandTo(g)`：展开目录并定位到该年级。

## 验证
- `vite build` 通过，94 个模块全部编译成功。
- 开发服务器（http://localhost:5173）实时热更新，App.vue / SideNav.vue / style.css 均返回 200 且含新标记。
