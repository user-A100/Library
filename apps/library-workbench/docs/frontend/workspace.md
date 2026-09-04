# Dockview 文档工作区

中间栏由 **单一全局 Dockview** 管理全部打开文档；标题栏**无**文档 tab 条。

## 行为

| 场景 | 行为 |
|---|---|
| 打开文档 | 文件树 / Library / 命令面板 → `openTab` → `workspaceRef.openPanel` |
| 首篇 paper | PDF/HTML 默认组 + `NOTES.md` 右分屏（阅读默认；通用设置 `autoOpenPaperNotes` 关闭时只开 body，NOTES 仍可 `⌘\` / 右键「打开笔记」手动开） |
| 再开 paper | body 走自由 dock 放置（当前组 / 默认，可再拖分屏）；NOTES 优先叠进已有笔记列；body↔NOTES **焦点仍同步** |
| 同步关闭 | 关 paper body 时一并关 NOTES；关 NOTES 保留 body |
| 文件树拖入 | left/right/above/below/within 分屏落点 |
| 关 panel | dockview X → `closeTab`；焦点 `onDidActivePanelChange` |
| 循环 | `⌥⌘←/→` 按 `api.panels` **视觉序** |
| 移至新窗口 | 文档 tab **右键** → **移动至新窗口** → 独立 `doc-*` Webview；源 panel 关闭（Library / Trash 除外） |
| Split pane | `⌘\` / `Ctrl+\` 向右新增 pane；当前论文未开 NOTES 时默认打开 NOTES，否则复制当前 pane；横向 pane 重新等宽 |
| NOTES 开关 | Layout 菜单；优先叠右列 |
| 打开笔记 | 论文 tab 右键 /文件树论文行右键 → NOTES 进右侧阅读列（已开则聚焦） |
| 关光文档 | 回到全库 Library panel |

标题栏 Layout 菜单中的窗口布局预设只改变当前论文的 Notes 分屏和外层 Agent panel 宽度：Agent 模式为 PDF / Agent `1:1`，笔记模式为 PDF / Notes / Agent `1:1:1`，阅读模式关闭 Notes 与 Agent。其它 PDF tab 保持打开。

标签组 chip 的颜色菜单会将展开/收起 icon 染为对应颜色，并同步用于组内 tab 的强调线；清除颜色后恢复默认颜色。

布局只存 dockview `toJSON()`；path/mode/title 在 panel params。同一路径可存在多个 split pane，panel id 保留 pane 实例后缀用于恢复布局。

启动恢复只 hydrate 每个 Dockview group 当前可见的 panel；隐藏标签在首次切换到前台时再读取资源。恢复出的占位 tab 直接用 params 里的 title 显示（论文名），无需等资源加载；未携带 title 的旧布局回退为文件夹名，激活后由资源加载刷新。PDFium 保留当前可见与最近使用的至多两个 PDF viewer，本地 PDF `ArrayBuffer` 离开保留集合后释放，避免多标签工作区重启时并发加载全部 PDF 并长期占用 WebContent 内存。Markdown 编辑器（含 NOTES）同样保活：至多两个最近使用的编辑器保持挂载，切换标签不再重建 Plate；离开保留集合的编辑器卸载为占位，切回时重新反序列化，卸载时未落盘的编辑会照常 flush。

## 面板类型

Library · Trash · PDF · HTML · 图片 · Markdown · 论文 NOTES。

## 代码

| 路径 | 职责 |
|---|---|
| `src/components/workspace/dock-workspace.tsx` | Dockview 宿主（tab 右键 → 移至新窗口） |
| `src/lib/shell/leaf.ts` | leaf 打开 / `moveDocToWindow` |
| `src/lib/shell/doc-window.ts` | `doc_window_open` 前端封装 |
| `src/components/shell/doc-window-root.tsx` | 文档弹出窗根 |
| `src/lib/workspace/store.ts` | tabs / active / dockLayout |
| `src/lib/workspace/tabs/` | DocTab 模型、NOTES 分屏、持久化 |
| `src/lib/workspace/dock-registry.ts` | 命令式 dockview 句柄 |

PDF 分屏拖动性能：见 `docs/bug_fix/dockview-sash-pdf-resize-jank.md`。
