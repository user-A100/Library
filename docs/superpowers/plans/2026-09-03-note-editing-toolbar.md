# Library 笔记编辑工具栏替换实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用借鉴 obsidian-editing-toolbar 交互模式的全新编辑工具栏替换 Library 内置笔记编辑器（note-editor）现有工具栏：分组大按钮 + 悬停子菜单 + Office 式调色板，暴露 schema 中已有但被隐藏的全部能力（H1-H6、列表、表格、对齐、缩进、上下标、代码块、分割线等）。

**Architecture:** 工具栏位于 `desktop/zotero/note-editor`（子模块）的 React 层：重写 `src/ui/toolbar.js`，新增 `src/ui/toolbar/` 目录承载配置树、命令适配层、调色板与子菜单组件；命令通过 EditorCore 的 plugin state（`menuState`/`textColorState`/`highlightColorState`/`table`/`searchState`/`citationState`/`linkState`）的 `{isActive, run}` 接口下发，不改 ProseMirror schema。开发迭代用「构建 note-editor → 替换 dist 的 app/omni.ja 内条目 → 重启 Library」快循环；发布走 build-desktop.ps1 全量构建（改为消费自建 note-editor 产物）。

**Tech Stack:** React（note-editor 现有，无 JSX 的 .js 组件风格）、ProseMirror plugin state、SCSS、webpack（note-editor 自带）、PowerShell + .NET ZipFile（omni.ja 换装）、WSL2 全量内核构建。

**Spec:** 交互参照 github.com/pkm-er/obsidian-editing-toolbar（MPL-2.0）的调研报告 + note-editor 内核调研报告（两份报告要点已内嵌于本计划各任务中）。

## Global Constraints

- **不复制 obsidian-editing-toolbar（MPL-2.0）的任何代码**，仅借鉴交互模式（分组、子菜单、调色板结构、toggle 语义）；全部代码自行实现
- note-editor 为 AGPL（Zotero 上游），本仓库已是合法 fork；**保留全部现有许可证头注释**，新文件沿用 note-editor 现有文件头风格
- **不改 ProseMirror schema**（无字号 mark、无任务列表节点——这两项 v1 明确不做，见 Scope）
- 不破坏现有能力：引用插入（citationState）、查找条（searchState/findbar）、右键菜单、More 下拉、暗色主题
- commit 信息禁止任何 Claude 署名 / Co-Authored-By（用户全局要求）
- 构建脚本 `scripts/build-desktop.ps1:14` 的 `$expectedCommit` 校验 `desktop/zotero` HEAD——内核改动提交后必须同步更新该值
- 内核（desktop/zotero 及其 note-editor 子模块）与主仓库分开提交：note-editor 子模块先提交，desktop/zotero 提交子模块指针，主仓库提交 build 脚本变更

## Scope（v1 明确做/不做）

**做：** 撤销/重做、清除格式、标题 H1-H6+正文（schema 本就支持 1-6，现工具栏只暴露 1-3）、加粗/斜体/下划线/删除线、上下标、行内代码/代码块、字体颜色调色板、高亮调色板、无序/有序列表、缩进/反缩进、引用块、链接、表格插入+表格操作子菜单、分割线（horizontalRule 节点已在 schema）、对齐子菜单、数学公式插入、查找（沿用 findbar）、引用插入（沿用）、More 下拉（沿用）。

**不做（后续版本）：** 悬浮选区工具条（following 模式）、格式刷、字号（schema 无 mark，需改 schema，风险高）、任务列表（schema 无节点）、AI 改写、文本批处理工具、工具栏按钮拖拽自定义 UI（v1 用源码内配置数组，数组结构天然支持未来加自定义 UI）。

---

## 文件结构总览

| 文件 | 操作 | 职责 |
|---|---|---|
| `desktop/zotero/note-editor/src/ui/toolbar/config.js` | 新建 | 工具栏按钮树配置（分组/子菜单/图标名），唯一的数据源 |
| `desktop/zotero/note-editor/src/ui/toolbar/commands.js` | 新建 | 命令适配层：把 editorCore 各 plugin state 包装成统一 `{id, title, icon, isActive(), run(), canRun()}` |
| `desktop/zotero/note-editor/src/ui/toolbar/palette.js` | 新建 | Office 式颜色网格组件（主题色/标准色/最近使用；同色再点取消；色条反映当前色） |
| `desktop/zotero/note-editor/src/ui/toolbar/submenu.js` | 新建 | 悬停展开的子菜单按钮组件 |
| `desktop/zotero/note-editor/src/ui/toolbar.js` | 重写 | 主工具栏组件：按 config 树渲染分组按钮，接线 commands |
| `desktop/zotero/note-editor/src/ui/toolbar-elements/*` | 保留 | text-dropdown 等如仍被 More 菜单用到则保留，不再被主工具栏引用的可删 |
| `desktop/zotero/note-editor/src/stylesheets/components/ui/_toolbar.scss` | 重写 | 新工具栏样式（Library 视觉 token、暗色、reduced-motion） |
| `scripts/build-desktop.ps1` | 修改 | 用自建 note-editor 产物替代 CI zip；更新 `$expectedCommit` |
| `scripts/swap-note-editor.ps1` | 新建 | 开发快循环：构建 note-editor → 换装 dist 的 omni.ja → 重启 Library |

---

### Task 1: 开发快循环打通（note-editor 本地构建 + omni.ja 换装）

**Files:**
- Create: `scripts/swap-note-editor.ps1`
- Read/Verify: `desktop/zotero/note-editor/package.json`、`desktop/zotero/note-editor/webpack.config.js`（如存在）

**Interfaces (Produces):**
- `scripts/swap-note-editor.ps1`：无参运行，完成「npm 构建 note-editor → 把产物写入 `desktop/dist/Zotero_win-x64/app/omni.ja` 的 `resource/note-editor/*` 条目 → 重启 Library.exe」。后续每个 UI 任务的验证手段。

- [ ] **Step 1: 确认 note-editor 构建输出**

```powershell
Get-Content D:\Mycraft\tencent-fight\desktop\zotero\note-editor\package.json | ConvertFrom-Json | Select-Object -ExpandProperty scripts
# 预期有 build 脚本；确认输出目录（上游应为 build/ 或 dist/，含 editor.html + 主 bundle）
```

```powershell
cd D:\Mycraft\tencent-fight\desktop\zotero\note-editor
npm install
npm run build
# 记录输出目录结构（editor.html 相对路径、js/css bundle 名）
```

- [ ] **Step 2: 确认 omni.ja 内现有 note-editor 条目名**

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("D:\Mycraft\tencent-fight\desktop\dist\Zotero_win-x64\app\omni.ja")
$zip.Entries | Where-Object { $_.FullName -like "*note-editor*" } | Select-Object -First 20 -ExpandProperty FullName
$zip.Dispose()
# 预期形如 resource/note-editor/editor.html、resource/note-editor/*.js
```

若 omni.ja 打不开（Gecko 优化 zip），改用 7z（`desktop\.tools` 里有 7z Windows 版若无则下载）：`7z l omni.ja`。

- [ ] **Step 3: 写 swap-note-editor.ps1**

```powershell
# scripts/swap-note-editor.ps1 —— 开发快循环：重建 note-editor 并换装进 dist
$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$src = Join-Path $workspace "desktop\zotero\note-editor"
$dist = Join-Path $workspace "desktop\dist\Zotero_win-x64"
$omni = Join-Path $dist "app\omni.ja"
# NOTE: 若 Step 1 发现输出目录不是 build\，改这一行
$built = Join-Path $src "build"

Push-Location $src
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "note-editor build failed" }
Pop-Location

# 停掉正在运行的 Library（沿用 run-desktop 的精确路径判定）
Get-CimInstance Win32_Process -Filter "Name='Library.exe'" |
	Where-Object { $_.ExecutablePath -eq (Join-Path $dist "Library.exe") } |
	ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 2

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($omni, "Update")
# 删旧条目（resource/note-editor/ 前缀），再按相对路径写入新文件
foreach ($entry in @($zip.Entries | Where-Object { $_.FullName -like "resource/note-editor/*" })) { $entry.Delete() }
Get-ChildItem $built -Recurse -File | ForEach-Object {
	$rel = "resource/note-editor/" + $_.FullName.Substring($built.Length + 1).Replace("\", "/")
	[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel) | Out-Null
}
$zip.Dispose()

Start-Process -FilePath (Join-Path $dist "Library.exe") `
	-ArgumentList @("-no-remote", "-profile", (Join-Path $workspace "desktop\profile"), "-ZoteroDebugText") `
	-RedirectStandardOutput (Join-Path $workspace "desktop\library-debug-live.log") `
	-RedirectStandardError (Join-Path $workspace "desktop\library-debug-live.err.log")
Write-Host "note-editor 已换装并重启 Library"
```

- [ ] **Step 4: 验证换装生效**

运行脚本启动 Library，打开一篇笔记，确认编辑器正常加载（若白屏/报错，查 `desktop\library-debug-live.log`，多半是条目路径不匹配——对照 Step 2 的真实条目名修正 `$rel` 前缀）。在 `src/ui/toolbar.js` 里临时加一行可见改动（如按钮 title）再跑一次脚本，确认改动出现在界面上。确认后还原临时改动。

- [ ] **Step 5: Commit（主仓库）**

```bash
git add scripts/swap-note-editor.ps1
git commit -m "feat: dev loop to rebuild note-editor and swap into dist omni.ja"
```

---

### Task 2: 命令适配层（commands.js）

**Files:**
- Create: `desktop/zotero/note-editor/src/ui/toolbar/commands.js`

**Interfaces (Consumes):** EditorCore plugin states（内核调研已核实）：
- `editorCore.pluginState.menu` → `{strong, em, underline, strike, subscript, superscript, code, paragraph, codeBlock, heading1..heading3, bulletList, orderedList, blockquote, math_display, clearFormatting, alignLeft/Center/Right, indent, outdent}`，每项 `{isActive, run}`
- `editorCore.pluginState.textColor.state` → `setColor(color)`, `removeColor()`；highlight 同构
- `editorCore.pluginState.table` → `insertTable(rows, cols)` 等
- `editorCore.pluginState.searchState` → `setActive(bool)`；`citationState.insertCitation()`；`linkState.toggle()`
- heading 4-6 与 horizontalRule 不在 menuState：heading 用 `src/core/commands.js` 的 `setBlockType(schema.nodes.heading, {level})` + `editorCore.view.dispatch`；hr 用 `prosemirror-commands` 的链或 schema 的 `horizontalRule` 节点 createAndFill

**Produces:** `buildCommands(editorCore)` → `{ byId: Map<id, {id, isActive(), run(), canRun()}>, palette: {getTextColor(), setTextColor(c), removeTextColor(), getHighlight(), setHighlight(c), removeHighlight()} , currentTextColor(), currentHighlight() }`

- [ ] **Step 1: 写 commands.js**

先读 `note-editor/src/ui/toolbar.js`（223 行）与 `src/core/plugins/menu.js` 的 state 暴露方式，确保取 state 的路径正确（`editorCore.pluginState.menu` 还是 `editorCore.menuState`，以现有 toolbar.js 用法为准）。文件骨架：

```js
// 命令适配层：把 EditorCore 的 plugin state 包装成工具栏配置树可直接消费的
// {id, isActive, run, canRun}。不引入新依赖；heading4-6 与 hr 走底层 commands。
import { setBlockType } from 'prosemirror-commands';

// 生成 heading level 命令（menuState 只有 heading1-3，schema 支持 1-6）
function buildHeading(editorCore, level) {
	return {
		id: `heading${level}`,
		isActive: () => {
			const { state } = editorCore.view;
			const { $from } = state.selection;
			const node = $from.node($from.depth > 1 ? $from.depth - 0 : 1);
			for (let d = $from.depth; d > 0; d--) {
				if ($from.node(d).type.name === 'heading') return $from.node(d).attrs.level === level;
			}
			return false;
		},
		run: () => setBlockType(editorCore.view.state.schema.nodes.heading, { level })(
			editorCore.view.state, editorCore.view.dispatch, editorCore.view),
	};
}

// horizontalRule：在当前块后插入
function buildHorizontalRule(editorCore) {
	return {
		id: 'horizontalRule',
		isActive: () => false,
		run: () => {
			const { view } = editorCore;
			const hr = view.state.schema.nodes.horizontalRule.create();
			const tr = view.state.tr.replaceSelectionWith(hr);
			view.dispatch(tr);
		},
	};
}

export function buildCommands(editorCore) {
	const menu = editorCore.pluginState.menu; // 以现有 toolbar.js 的实际取法为准
	const textColor = editorCore.pluginState.textColor.state;
	const highlight = editorCore.pluginState.highlightColor.state;
	const table = editorCore.pluginState.table;
	const simple = (id) => ({ id, isActive: () => menu[id].isActive, run: () => menu[id].run() });
	const ids = ['strong', 'em', 'underline', 'strike', 'subscript', 'superscript', 'code',
		'paragraph', 'codeBlock', 'bulletList', 'orderedList', 'blockquote', 'math_display',
		'clearFormatting', 'alignLeft', 'alignCenter', 'alignRight', 'indent', 'outdent'];
	const byId = new Map();
	for (const id of ids) byId.set(id, simple(id));
	for (let level = 1; level <= 6; level++) byId.set(`heading${level}`, level <= 3 ? simple(`heading${level}`) : buildHeading(editorCore, level));
	byId.set('horizontalRule', buildHorizontalRule(editorCore));
	byId.set('insertTable', { id: 'insertTable', isActive: () => false, run: () => table.insertTable(3, 3) });
	byId.set('search', { id: 'search', isActive: () => editorCore.pluginState.searchState.active, run: () => editorCore.pluginState.searchState.setActive(true) });
	byId.set('insertCitation', { id: 'insertCitation', isActive: () => false, run: () => editorCore.pluginState.citationState.insertCitation() });
	byId.set('link', { id: 'link', isActive: () => editorCore.pluginState.linkState.active, run: () => editorCore.pluginState.linkState.toggle() });
	return {
		byId,
		palette: {
			getTextColor: () => textColor.color, // 若字段名不同，以 text-color.js 的 Color 类为准
			setTextColor: (c) => textColor.setColor(c),
			removeTextColor: () => textColor.removeColor(),
			getHighlight: () => highlight.color,
			setHighlight: (c) => highlight.setColor(c),
			removeHighlight: () => highlight.removeColor(),
		},
	};
}
```

**实现注意（逐条核实后修正，不许照抄上面骨架里的猜测）：**
- `menu[id]` 的字段名（`isActive` 是属性还是方法、`run` 是否已绑定）以 `menu.js` L68-315 实际结构为准
- textColor/highlight 的 `color` 字段名以 `src/core/plugins/text-color.js` 的 Color 类为准
- linkState/searchState 的字段名以 `src/core/plugins/` 对应文件为准
- 上标下标在 menuState 里的键名（`subscript`/`superscript` 还是 `subsup`）以 menu.js 为准

- [ ] **Step 2: 语法检查**

```bash
cd desktop/zotero/note-editor && npx --yes esbuild src/ui/toolbar/commands.js --outfile=/dev/null 2>&1 || node -e "require('@babel/parser').parse(require('fs').readFileSync('src/ui/toolbar/commands.js','utf8'),{sourceType:'module'})" 2>/dev/null || npm run build
```

（以 Task 1 建立的 `npm run build` 通过为最终标准。）

- [ ] **Step 3: Commit（note-editor 子模块）**

```bash
cd desktop/zotero/note-editor
git add src/ui/toolbar/commands.js
git commit -m "feat: command adapter layer for toolbar config tree"
```

---

### Task 3: 配置树（config.js）+ 调色板（palette.js）+ 子菜单（submenu.js）

**Files:**
- Create: `desktop/zotero/note-editor/src/ui/toolbar/config.js`
- Create: `desktop/zotero/note-editor/src/ui/toolbar/palette.js`
- Create: `desktop/zotero/note-editor/src/ui/toolbar/submenu.js`

**Interfaces (Consumes):** Task 2 的 `byId` Map 与 `palette`。
**Produces:**
- `TOOLBAR_CONFIG`：按钮树数组，项类型 `{type:'button', id, title, icon}` | `{type:'submenu', id, title, icon, items:[...]}` | `{type:'divider'}` | `{type:'palette', kind:'text'|'highlight', title, icon}` | `{type:'custom', render}`（citation/search/more 沿用现有组件走此项）
- `ColorPalette({kind, current, onPick, onClear})` React 组件
- `SubmenuButton({label, icon, items, renderAction})` React 组件

- [ ] **Step 1: config.js —— 按钮树（借鉴 obsidian-editing-toolbar 的默认布局，自行取舍）**

```js
// 工具栏布局配置：单一数据源。type: button|submenu|palette|divider|custom。
// v1 固定布局；数组结构为未来"自定义排序"预留（可直接序列化为用户配置）。
export const TOOLBAR_CONFIG = [
	{ type: 'button', id: 'undo', title: '撤销', icon: 'icon Undo' },   // 沿用编辑器内已有图标资源；icon 字段存现有 css 类/svg id，实现时以 src/ui/icons 实际形态为准
	{ type: 'button', id: 'redo', title: '重做', icon: 'icon Redo' },
	{ type: 'divider' },
	{ type: 'palette', kind: 'text', title: '字体颜色', icon: 'A' },
	{ type: 'palette', kind: 'highlight', title: '高亮', icon: 'H' },
	{ type: 'button', id: 'clearFormatting', title: '清除格式' },
	{ type: 'divider' },
	{ type: 'submenu', id: 'heading', title: '标题', icon: 'H1', items: [
		{ type: 'button', id: 'heading1', title: '标题 1' },
		{ type: 'button', id: 'heading2', title: '标题 2' },
		{ type: 'button', id: 'heading3', title: '标题 3' },
		{ type: 'button', id: 'heading4', title: '标题 4' },
		{ type: 'button', id: 'heading5', title: '标题 5' },
		{ type: 'button', id: 'heading6', title: '标题 6' },
	]},
	{ type: 'button', id: 'strong', title: '加粗' },
	{ type: 'button', id: 'em', title: '斜体' },
	{ type: 'button', id: 'underline', title: '下划线' },
	{ type: 'button', id: 'strike', title: '删除线' },
	{ type: 'submenu', id: 'moreInline', title: '更多行内', items: [
		{ type: 'button', id: 'superscript', title: '上标' },
		{ type: 'button', id: 'subscript', title: '下标' },
		{ type: 'button', id: 'code', title: '行内代码' },
		{ type: 'button', id: 'codeBlock', title: '代码块' },
	]},
	{ type: 'divider' },
	{ type: 'button', id: 'bulletList', title: '无序列表' },
	{ type: 'button', id: 'orderedList', title: '有序列表' },
	{ type: 'submenu', id: 'block', title: '块与缩进', items: [
		{ type: 'button', id: 'paragraph', title: '正文' },
		{ type: 'button', id: 'blockquote', title: '引用块' },
		{ type: 'divider' },
		{ type: 'button', id: 'indent', title: '增加缩进' },
		{ type: 'button', id: 'outdent', title: '减少缩进' },
	]},
	{ type: 'divider' },
	{ type: 'button', id: 'insertTable', title: '插入表格' },
	{ type: 'submenu', id: 'table', title: '表格操作', items: [
		// 以下命令全部来自 editorCore.pluginState.table（内核调研已核实的键名），
		// 在 commands.js 的 byId 中以 simple(id) 同样方式登记
		{ type: 'button', id: 'insertColumnBefore', title: '左侧插入列' },
		{ type: 'button', id: 'insertColumnAfter', title: '右侧插入列' },
		{ type: 'button', id: 'insertRowBefore', title: '上方插入行' },
		{ type: 'button', id: 'insertRowAfter', title: '下方插入行' },
		{ type: 'divider' },
		{ type: 'button', id: 'deleteRow', title: '删除行' },
		{ type: 'button', id: 'deleteColumn', title: '删除列' },
		{ type: 'button', id: 'deleteTable', title: '删除表格' },
	]},
	{ type: 'button', id: 'horizontalRule', title: '分割线' },
	{ type: 'submenu', id: 'align', title: '对齐', items: [
		{ type: 'button', id: 'alignLeft', title: '左对齐' },
		{ type: 'button', id: 'alignCenter', title: '居中' },
		{ type: 'button', id: 'alignRight', title: '右对齐' },
	]},
	{ type: 'button', id: 'math_display', title: '公式' },
	{ type: 'button', id: 'link', title: '链接' },
	{ type: 'divider' },
	{ type: 'custom', id: 'insertCitation', title: '插入引用' },  // 沿用现有 Citation 按钮渲染逻辑
	{ type: 'custom', id: 'search', title: '查找' },              // 沿用现有搜索按钮（打开 findbar）
];
```

图标：note-editor 现有工具栏按钮用内联 SVG（读现有 toolbar.js/button.js 确认）。v1 原则：**能用现有 SVG 的复用，缺的（对齐/缩进/分割线/表格操作）从简单的 24×24 stroke 风格自绘**，风格与现有一致。

- [ ] **Step 2: palette.js —— Office 式颜色网格（借鉴其结构，自行实现）**

功能点（全部为交互借鉴，代码自写）：
- 分区：主题色（10 色相 × 5 明度网格 + 白/黑）、标准色（10 色）、最近使用（最多 7 个，存 localStorage `library-note-recent-colors`）
- 点击 swatch 应用；**当前色再点一次 = 取消**（toggle 语义，借鉴 obsidian-editing-toolbar）
- swatch hover 放大（CSS transform）
- 调色板按钮图标内嵌一个色条，实时反映当前选中色

```js
// 结构示意（真实代码按现有组件风格写全）：
const THEME_HUES = ['#000000', '#ffffff', '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];
// 主题区：对每个基础色生成 5 档明度变体（预计算 hex，不运行时混色库）
export function ColorPalette({ kind, current, onPick }) { /* grid + recent + toggle 逻辑 */ }
```

明度变体预计算：为 10 个基础色手工列出 5 档 hex 常量表（用 Office 经典明度：+80/+60/0/-40/-80 的近似值），**不做运行时颜色混合**，直接写常量数组。

- [ ] **Step 3: submenu.js —— 悬停展开子菜单**

- 主按钮 hover 200ms 后展开面板（点击也展开）；面板出现后移入面板不消失；`mouseleave` 整个区域 300ms 后收起
- 面板绝对定位于按钮下方，右溢出时自动左移（`getBoundingClientRect()` 对齐视口）
- 面板内按钮复用主栏按钮渲染器

- [ ] **Step 4: 构建验证**

```powershell
cd D:\Mycraft\tencent-fight\desktop\zotero\note-editor; npm run build   # 必须零错误
```

- [ ] **Step 5: Commit（note-editor 子模块）**

```bash
git add src/ui/toolbar/config.js src/ui/toolbar/palette.js src/ui/toolbar/submenu.js
git commit -m "feat: toolbar config tree, color palette, submenu components"
```

---

### Task 4: 主工具栏重写（toolbar.js）

**Files:**
- Rewrite: `desktop/zotero/note-editor/src/ui/toolbar.js`（原 223 行）

**Interfaces (Consumes):** Task 2 `buildCommands`、Task 3 `TOOLBAR_CONFIG`/`ColorPalette`/`SubmenuButton`；现有 props（`editorCore`, `textColorState`, `highlightColorState`, `citationState`, `linkState`, `searchState`, `menuState` 等——以 `src/ui/editor.js` 传入 Toolbar 的实际 props 为准，**不得改 editor.js 的 props 签名**，新工具栏在内部用这些 props 构建 commands）。

- [ ] **Step 1: 重写组件**

- 保持组件导出名与 props 兼容（editor.js 无需改动即可用）
- 渲染流程：`buildCommands(...)` → 遍历 `TOOLBAR_CONFIG` → button/palette/submenu/custom 各自渲染器；`custom` 项内联保留现有 toolbar.js 里 citation/search 按钮的原始 JSX（**从旧代码原样搬移**，含 onMouseDown 细节）
- 活动态高亮：button 每次渲染时调 `cmd.isActive()`；子菜单展开时其父按钮在任一子项 active 时高亮
- 分组间渲染竖直 divider（`.library-toolbar-divider`）
- 键盘可达性：所有按钮 `tabindex`、`title`；沿用现有 focusToolbar(Alt-F10) 行为

- [ ] **Step 2: 换装冒烟**

```powershell
D:\Mycraft\tencent-fight\scripts\swap-note-editor.ps1
```

在 Library 中验证：打开笔记 → 新工具栏出现 → 加粗/标题/列表/颜色点击生效 → 引用按钮仍弹引用选择器 → 查找按钮仍开 findbar → More 下拉仍工作。

- [ ] **Step 3: Commit（note-editor 子模块）**

```bash
git add src/ui/toolbar.js
git commit -m "feat: grouped toolbar with submenus and palettes replacing legacy bar"
```

---

### Task 5: 样式重写（_toolbar.scss）

**Files:**
- Rewrite: `desktop/zotero/note-editor/src/stylesheets/components/ui/_toolbar.scss`
- Read: `src/stylesheets/themes/_dark.scss`、`_light.scss`（主题变量名）

- [ ] **Step 1: 重写样式**

- 单行工具栏：高 40px，按钮 30×30、圆角 6px、hover/active 态用主题变量的半透明色；分组 divider 竖线
- 子菜单/调色板面板：投影 + 圆角 10px + 1px 边框，动画 120ms fade+2px 上移，`prefers-reduced-motion: reduce` 时关闭动画
- 调色板 swatch：16×16 圆角 3px，hover `transform: scale(1.18)`；当前色 swatch 内嵌勾选描边
- **只用现有主题变量**（从 `_dark.scss`/`_light.scss` 取），两个主题下各检查一遍对比度；不硬编码颜色（调色板 swatch 本体除外）
- 工具栏按钮过多时的横向收窄：`overflow-x: auto; scrollbar-width: none`

- [ ] **Step 2: 双主题冒烟**

换装后在 Library 设置切换亮/暗主题（或跟随系统），截图核对工具栏、子菜单、调色板在两主题下的可读性。

- [ ] **Step 3: Commit（note-editor 子模块）**

```bash
git add src/stylesheets/components/ui/_toolbar.scss
git commit -m "feat: library-styled toolbar theme with submenus and palettes"
```

---

### Task 6: 发布管线集成（build-desktop.ps1）+ 内核提交

**Files:**
- Modify: `scripts/build-desktop.ps1`（tmp/builds/note-editor 消费段 + `$expectedCommit`）
- Modify: `desktop/zotero`（子模块指针）、`desktop/zotero/note-editor`（最终合并提交）

- [ ] **Step 1: 弄清 Zotero 构建如何消费 tmp/builds/note-editor**

```bash
cd desktop/zotero
grep -rn "tmp/builds" scripts/ app/scripts/ 2>/dev/null | head -20
grep -rn "note-editor" scripts/*.js* app/scripts/dir_build 2>/dev/null | head -20
```

确认 zip 被解到 `build/resource/note-editor` 的具体代码路径。

- [ ] **Step 2: 改 build-desktop.ps1**

在 `$command`（WSL bash 段）中，`cp '$ciCacheWsl/107ab75c….zip' tmp/builds/note-editor/` 之后加：

```bash
# 用本地改造版 note-editor 覆盖官方 CI 产物
rsync -a --delete '$noteEditorBuildWsl/' '$wslBuild/build/resource/note-editor/'
```

（若 Step 1 发现 zip 是在 `npm run build` 内被解包，则在 `npm run build` 之后覆盖；以实际顺序为准。）新增变量 `$noteEditorBuild = Join-Path $source "note-editor\build"` 与对应 WSL 路径转换。`$expectedCommit` 改为 Step 4 提交后的 desktop/zotero 新 HEAD。

- [ ] **Step 3: WSL 全量构建验证**

```powershell
# Library.exe 未运行时执行
D:\Mycraft\tencent-fight\scripts\build-desktop.ps1
```

构建成功后用 run-desktop.ps1 启动，确认新工具栏在内置产物中可用。

- [ ] **Step 4: 内核两级提交（无 Claude 署名）**

```bash
cd desktop/zotero/note-editor
git add -A && git commit -m "feat: library editing toolbar"   # 若前面任务已逐个提交则此步为空
cd ..
git add note-editor
git commit -m "feat: update note-editor with library editing toolbar"
```

- [ ] **Step 5: 主仓库提交 build 脚本与子模块指针**

```bash
git add scripts/build-desktop.ps1 desktop/zotero
git commit -m "feat: build pipeline consumes locally modified note-editor"
```

---

### Task 7: 全量回归 + 收尾

- [ ] **Step 1: 回归清单（在 WSL 构建出的正式产物里过一遍）**

1. 全部 v1 按钮逐个点击：无 JS 报错（`desktop\library-debug-live.log` 无 `note-editor` 相关异常）
2. H4/H6、分割线、表格插入/行列操作在保存重开后内容完整（ProseMirror 持久化无丢失）
3. 引用插入、查找替换、右键菜单、图片粘贴、数学公式——原有能力无回归
4. 暗色/亮色主题、窗口缩放（窄宽度下工具栏可横向滚动）、`prefers-reduced-motion`
5. 中文输入法在工具栏焦点切换时不丢组合输入
6. 笔记多标签打开时每个编辑器实例工具栏独立工作

- [ ] **Step 2: 修复发现的问题（每类问题单独 commit）**

- [ ] **Step 3: 主仓库版本与文档**

- `desktop/addons/research-workspace/manifest.json` 版本号照项目惯例递增（内核能力变更伴随插件版本）
- `docs/` 下补一篇简短的 note-editor 工具栏改造说明（本地构建 + omni.ja 换装 + 全量构建三条路径）

- [ ] **Step 4: 推送前检查**

```bash
git log --all --format="%B" | grep -i "co-authored-by"   # 必须为空
git -C desktop/zotero log --format="%an <%ae>" -5        # 全部 user-A100
git -C desktop/zotero/note-editor log --format="%an <%ae>" -5
```

---

## 验证（Verification）

1. **快循环**：改一行 toolbar.js → `swap-note-editor.ps1` → 重启后改动可见（Task 1 验收）
2. **功能**：v1 Scope 列出的每个按钮/子菜单/调色板操作生效且持久化（保存重开不丢）
3. **无回归**：引用、查找、右键菜单、图片、公式、多标签、双主题
4. **发布链路**：`build-desktop.ps1` 全量构建成功，`$expectedCommit` 校验通过，正式产物含新工具栏
5. **合规**：commit 无 Claude 署名；未复制 MPL-2.0 代码；AGPL 许可证头保留
