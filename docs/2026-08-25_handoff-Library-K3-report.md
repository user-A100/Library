# Library 项目 K3 工程交接

> 交接日期：2026-08-25  
> 项目目录：`D:\Mycraft\tencent-fight`  
> 当前正式路线：Zotero 9.0.6 内核 + Library 品牌 + 内置 XPI  
> 当前内置模块版本：`0.10.7`  
> 文档类型：工程交接；安全报告 flavor = `null`

## 先看结论

Library 已经不再是单纯的 React/Vite 演示页面。正式桌面端目前运行在真实的 Zotero 9.0.6 Gecko 桌面内核上，具备本地文库、SQLite、PDF Reader、笔记、CSL、translator、AddonManager、XPI 生命周期与 Connector Server 等原生能力。Zen 风格主题、Library AI、侧边批注等差异化功能集中在内置 XPI `research-workspace` 中，根目录 React 项目只保留为视觉与交互原型。

当前可以继续开发，但还不能当作最终参赛安装包发布。最关键的未闭环项是：使用有效模型密钥完成一次真实 AI 全链路、用多篇文献验证“＋来源”、密集批注条件下验证侧边批注碰撞布局，以及完成自有 Library Connector 的构建和验收。

### 当前状态一览

| 范围 | 状态 | 说明 |
|---|---|---|
| Zotero 9 桌面内核 | 已构建 | 基线 `9.0.6`，提交 `7132587c2d6d56725debe64908733a8140bc6be3` |
| Windows x64 产物 | 已生成 | `desktop/dist/Zotero_win-x64/Library.exe` |
| Library 品牌 | 已接入 | 独立名称和 L 图标；仍需发布前做全界面品牌扫描 |
| 原生 XPI 运行 | 已验证 | 插件 `0.10.7` 在开发 profile 中为 active |
| Zen 皮肤编辑器 | 已实现 | 自定义渐变、主题变量及即时刷新；仍需多主题视觉回归 |
| Library AI 持久侧栏 | 主体已实现 | 会话、配置、来源、流式回答、引用、保存笔记均有代码路径 |
| AI 密钥保存报错 | 已修复 | 改用 `nsILoginInfo` 与 `addLoginAsync()` |
| “＋来源”无响应 | 已修复 | 改用 Zotero 原生 `selectItemsDialog.xhtml` 多选器 |
| 当前论文自动作为来源 | 已实现 | 打开 AI View 时同步 Reader/当前条目；仍需跨标签页回归 |
| 侧边批注锚定 | 已实现第一版 | 按 PDF 高亮首个可视行定位，带碰撞避让和引导线 |
| 自有 Library Connector | 未完成 | 源码存在，但当前 `npm run connector:verify` 因缺少构建 manifest 而失败 |
| 当前运行状态 | 已关闭 | 交接检查时没有 Library 进程，也没有 `23119` 监听 |

## 让项目跑起来

以下命令均在 PowerShell 中从项目根目录执行。

### 启动现有构建

```powershell
Set-Location 'D:\Mycraft\tencent-fight'
npm run desktop:run
```

该脚本使用独立开发环境：

- Profile：`desktop/profile`
- 数据目录：`desktop/data`
- 默认 Connector 端口：`23119`
- 可执行文件：`desktop/dist/Zotero_win-x64/Library.exe`

启动后再执行完整验收：

```powershell
npm run desktop:verify
```

如果 `23119` 被官方 Zotero 或其他进程占用，可先隔离验证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-desktop.ps1 -ConnectorPort 23120
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-desktop.ps1 -ConnectorPort 23120
```

### 安全停止本项目进程

只停止当前工作区的 `Library.exe`，不要按进程名批量结束所有 Zotero/Library 进程。

```powershell
Get-CimInstance Win32_Process |
  Where-Object {
    $_.ExecutablePath -eq 'D:\Mycraft\tencent-fight\desktop\dist\Zotero_win-x64\Library.exe'
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

### 重新构建桌面端

```powershell
npm run desktop:build
```

构建要求 Windows 11、WSL2 Ubuntu 22.04、Git 与 Git LFS。脚本会固定检查 Zotero 基线提交，下载官方 Reader/Note Editor 等构建资源，打包内置 XPI，并将 Windows 可执行文件重命名为 `Library.exe`。

注意：`Library.exe` 正在运行时可能锁住构建产物。先用上一节的精确路径命令停止，再构建。

## 真实架构

| 层 | 目录 | 职责 | K3 的修改原则 |
|---|---|---|---|
| Zotero 上游内核 | `desktop/zotero` | Gecko、数据库、Reader、Note、CSL、translator、Connector Server、AddonManager | 尽量少改；优先通过 XPI 扩展 |
| Library 内置 XPI | `desktop/addons/research-workspace` | 主题、紧凑外壳、AI View、侧边批注、MinerU 适配 | 当前主要开发区 |
| 构建与验收 | `scripts` | Windows 构建、启动、静态/运行验收、Connector 构建 | 修改功能时同步增加验收项 |
| React 原型 | `src` | 早期 Zen 风格视觉原型 | 不再作为正式插件宿主或数据内核 |
| 开发 profile | `desktop/profile` | XPI 注册、偏好设置、LoginManager profile | 不提交密钥，不当成发布模板 |
| 开发文库 | `desktop/data` | 本地数据库、附件、全文、AI 会话数据 | 仅本机测试数据，发布包不要携带 |

正式运行路径是：

```text
Library.exe
  -> Zotero 9 原生窗口、文库与 Reader
  -> AddonManager 加载 research-workspace XPI
  -> XPI 挂载主题、Library AI View 和侧边批注
  -> Connector Server 在 127.0.0.1:23119 接收浏览器采集
```

不要再把根目录 React 页面描述为“Zotero 内核”。它只是设计原型。

## 已完成的核心工作

### 运行真实 Zotero 9 内核

- 固定基线：Zotero `9.0.6`。
- 保留原生 XPI `manifest.json`、`bootstrap.js` 生命周期和 `applications.zotero` 兼容契约。
- 保留本地文库、附件、批注、笔记、标签、Reader、CSL、translators 和 Connector Server。
- 产品显示名称改为 Library，并替换了 Windows/Linux 图标与部分品牌资源。
- `itemPaneSection.js` 中保留了一处初始化兼容修复，避免未初始化 section 被调用。

相关资料：

- [桌面内核说明](desktop-kernel.md)
- [Zotero 架构逆向报告](2026-08-23_reverse-zotero-architecture-report.md)
- [Reader 与插件架构](2026-08-23_zotero-reader-and-plugin-architecture.md)

### Zen 风格皮肤

- 皮肤入口位于 Library 设置/工具入口。
- 支持跟随系统、浅色、深色和自由渐变配置。
- 自定义配置包含 1–5 个颜色点、拖动位置、透明度、纹理等状态。
- 主题变量应用于 collections、items、context pane、Reader 扩展面板和 AI 侧栏。
- `research-workspace.js` 负责把配置转换为运行时 CSS 变量，`preferences.js`/`preferences.xhtml` 负责编辑器。

这里仍要做真实视觉回归，尤其是深色模式、自由渐变、窄屏和 Reader 右侧栏。不能只通过正则验收就宣称视觉完成。

### Library AI 持久侧栏

当前实现借鉴 Claudian 的持久 View 思路，但没有复制其品牌和完整编码 Agent 功能。

- 机器人按钮只控制 AI View 显隐。
- AI View 挂在 `zotero-context-pane`，不依赖条目属性 section 生命周期。
- 切换 Reader、文库条目或标签页时，会话对象不会因为 ItemPane 重建而丢失。
- 支持会话标签、历史、模型设置、OpenAI 兼容接口、SSE 流式输出、停止与重试。
- 对话存储使用独立 JSON，并以临时文件加原子替换保存。
- API Key 通过系统 LoginManager 保存，origin 为 `library-ai://model`，不会写入会话 JSON 或前端存储。
- 当前论文可自动变成来源；“＋来源”使用 Zotero 原生条目多选窗口。
- 上下文包含题录、摘要、笔记、批注与全文；存在附件同目录 `mineru.json` 时优先使用其结构与页码，否则回退 Zotero 全文缓存。
- 回答支持 Markdown 渲染、结构化引用、引用定位和保存为当前条目的 Zotero 笔记。

最近修复：

1. 模型保存曾报 `JavaScript component doesn't have a method named log in`。根因是 LoginManager 构造/写入 API 用法错误，现已改为 `Components.interfaces.nsILoginInfo` 和 `await Services.logins.addLoginAsync(loginInfo)`。
2. 保存与连接测试已拆分：配置先持久化；即使 `/models` 测试失败也明确提示“设置已保存”。
3. “＋来源”不再读取 Reader 下无效的 `ZoteroPane.getSelectedItems()[0]`，而是打开 `chrome://zotero/content/selectItemsDialog.xhtml`，支持普通条目多选。

当前没有有效 API 密钥的全链路验收记录。交接前测试只确认错误由组件异常变为正常的 HTTP 失败提示。K3 必须用自己的测试密钥完成真实回答，但不得把密钥写入代码、文档或 Git。

### 与高亮对应的侧边批注

侧边模式已经不是单纯 CSS 换皮。当前实现：

- 读取 Zotero 批注的 `annotationPosition` PDF 矩形。
- 进入嵌套 PDF.js viewer，通过 `pageView.viewport.convertToViewportPoint()` 转为屏幕坐标。
- 以高亮的第一条可视文本行为主要锚点。
- 在滚动、缩放、旋转、页面渲染和尺寸变化时重新布局。
- 多卡片使用碰撞避让，卡片与高亮之间绘制引导线。
- 高亮滚出可视区后隐藏对应卡片；回到可视区后恢复。
- 侧边模式下点击高亮不会再强制弹出原生批注浮窗。

逆向与实现证据：

- `work/sidenotes-reverse/scope.md`
- `work/sidenotes-reverse/timeline.md`
- `work/sidenotes-reverse/evidence/E-static-sidenote-layout.md`
- `work/sidenotes-reverse/evidence/sidenotes-src`

当前只完成了第一版动态验证。还需用多个相邻高亮、跨页高亮、不同缩放和旋转进行密集场景回归。

## 关键文件地图

| 文件 | 作用 | 关键入口 |
|---|---|---|
| `desktop/addons/research-workspace/manifest.json` | XPI 身份、版本和兼容范围 | 当前 `0.10.7`，支持 Zotero `9.0.*` |
| `desktop/addons/research-workspace/bootstrap.js` | XPI install/startup/shutdown/uninstall 生命周期 | 加载各模块与窗口监听 |
| `desktop/addons/research-workspace/research-workspace.js` | 主题、Reader 工具栏、批注模式、侧边批注 | `renderSidenoteSidebar()`、`getSidenoteAnchor()` |
| `desktop/addons/research-workspace/ai-view.js` | AI View 生命周期和界面交互 | `LibraryAIViewHost`、`saveSettings()`、`chooseSources()` |
| `desktop/addons/research-workspace/ai-provider.js` | OpenAI 兼容请求、SSE、LoginManager | `/chat/completions`、`addLoginAsync()` |
| `desktop/addons/research-workspace/ai-conversation.js` | 会话仓库与原子 JSON 保存 | `conversations.json`、`IOUtils.move()` |
| `desktop/addons/research-workspace/ai-context.js` | 当前论文、附件全文、MinerU 上下文 | `mineru.json`、Zotero fulltext cache |
| `desktop/addons/research-workspace/style.css` | 主窗口、AI、侧边批注的主题样式 | `data-research-theme`、`.library-ai-*` |
| `desktop/addons/research-workspace/preferences.*` | 皮肤编辑器 | 渐变点、主题配置、即时刷新 |
| `desktop/zotero/chrome/content/zotero/elements/itemPaneSection.js` | 上游最小兼容修改 | `if (!this.initialized)` 防护 |
| `scripts/build-desktop.ps1` | 固定基线构建与 XPI 内置 | 输出 `Library.exe` 和构建信息 |
| `scripts/run-desktop.ps1` | 独立 profile/data 启动 | 复制 XPI、处理版本注册、等待 Connector |
| `scripts/verify-desktop.ps1` | 桌面端静态与运行验收 | 内核、XPI、AI、批注、Connector 检查 |
| `scripts/build-library-connector.ps1` | 自有 Connector 构建 | 当前待修通 |
| `scripts/verify-library-connector.ps1` | 自有 Connector 验收 | 当前因缺少构建 manifest 失败 |

## 修改 XPI 时的硬规则

1. 修改 `desktop/addons/research-workspace` 后必须提升 `manifest.json` 版本。
2. `run-desktop.ps1` 只有发现版本变化时才清理 AddonManager 注册缓存；不提升版本容易继续加载旧 XPI。
3. 重新打包后确认下面两个位置都是新包：

   - `desktop/dist/Zotero_win-x64/distribution/extensions/research-workspace@tencent-practice.local.xpi`
   - `desktop/profile/extensions/research-workspace@tencent-practice.local.xpi`

4. 至少执行 JavaScript 语法检查和桌面验收。

```powershell
$files = @(
  'desktop/addons/research-workspace/bootstrap.js',
  'desktop/addons/research-workspace/research-workspace.js',
  'desktop/addons/research-workspace/ai-view.js',
  'desktop/addons/research-workspace/ai-provider.js',
  'desktop/addons/research-workspace/ai-conversation.js',
  'desktop/addons/research-workspace/ai-context.js',
  'desktop/addons/research-workspace/preferences.js'
)
foreach ($file in $files) {
  node --check $file
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $file" }
}
```

不建议通过手工删除整个 profile 来“修复”插件加载问题，因为会破坏可复现的用户状态。优先提升版本并用启动脚本处理注册缓存。

## 当前验收证据

### Evidence

| ID | 不可变观察 | 复现命令或来源 |
|---|---|---|
| E-001 | Zotero 内核 HEAD 为 `7132587c2d6d56725debe64908733a8140bc6be3` | `git -C desktop/zotero rev-parse HEAD` |
| E-002 | 构建信息记录产品 Library、Zotero 9.0.6、win-x64，构建时间为 2026-08-25 22:09 +08:00 | `Get-Content desktop/dist/Zotero_win-x64/research-workspace-build.json` |
| E-003 | 开发 profile 中 XPI `0.10.7` 为 active，且未被用户或应用禁用 | 读取 `desktop/profile/extensions.json` |
| E-004 | `startedVersion` 与 `lastReadyVersion` 均为 `0.10.7` | `Select-String desktop/profile/prefs.js -Pattern 'researchWorkspace'` |
| E-005 | 七个主要 XPI JavaScript 文件均通过 `node --check` | 使用上一节语法检查命令 |
| E-006 | 交接检查时没有本项目 Library 进程，也没有 `23119` 监听 | 精确查询 `ExecutablePath` 和 `Get-NetTCPConnection -LocalPort 23119` |
| E-007 | `npm run connector:verify` 当前失败，原因是构建产物缺少 Library Connector manifest | 2026-08-25 本机执行结果 |

### Findings

| ID | 结论 | 状态 | 证据 |
|---|---|---|---|
| F-001 | 正式产品路线已经迁移到真实 Zotero 9 内核，不再是 React 模拟内核 | validated | E-001、E-002 |
| F-002 | 内置 XPI `0.10.7` 曾在开发 profile 中成功执行并完成窗口初始化 | validated | E-003、E-004 |
| F-003 | 当前源文件没有明显 JavaScript 语法错误 | validated | E-005 |
| F-004 | 当前不能在未启动应用的情况下宣称 Connector Server 在线 | validated | E-006 |
| F-005 | 自有 Library Connector 尚未达到可验收状态 | validated | E-007 |

### Handoff path

1. 启动 `Library.exe`，执行 `npm run desktop:verify`，重新建立运行态基线，对应 E-001 至 E-006。
2. 导入第二篇真实论文，验证当前论文自动来源和“＋来源”多选，不重复添加同一条目。
3. 配置有效的 OpenAI 兼容测试接口，完成“提问 → 流式回答 → 引用定位 → 保存为笔记”。
4. 创建至少三个相邻高亮，验证侧边批注锚点、避让、滚动、缩放和删除。
5. 修通 Library Connector 构建，生成 manifest 后执行 `npm run connector:verify`，消除 F-005。
6. 全部通过后再制作干净 Windows 安装包与参赛演示录像。

## K3 下一步优先级

### P0：先建立可相信的运行基线

1. 启动现有 `0.10.7` 构建并运行 `npm run desktop:verify`。
2. 在真实桌面窗口点击机器人，确认出现可输入的 AI View，而不是“AI 研究”空白 section。
3. 切换论文、Reader 标签和文库页面，确认会话与生成过程不销毁。
4. 使用有效测试密钥完成真实 AI 全链路；记录接口类型、结果和脱敏截图。
5. 导入第二篇论文后验证“＋来源”原生多选器。
6. 在浅色、深色和自定义渐变下截图检查 AI 侧栏颜色与机器人图标。

### P1：补齐差异化阅读能力

1. 对侧边批注做密集锚定测试：相邻行、跨页、缩放、旋转、长批注、删除和撤销。
2. 检查引用页码可靠性：有 MinerU 页码才跳页；无可靠页码不得伪造。
3. 审核 Markdown 渲染器的安全性和显示完整度，重点检查表格、公式、代码块与引用卡片。
4. 删除已不用的中文 locale “AI 研究”文案，避免未来误注册旧空白 section。
5. 更新根目录 README 中仍写成 `zotero.exe` 的过时产物路径，统一为 `Library.exe`。

### P2：发布与生态兼容

1. 修通并品牌化 Library Connector，验证浏览器抓取题录、快照、PDF、标签和目标集合。
2. 建立 Zotero 9 插件兼容矩阵，至少覆盖菜单、设置页、条目树、条目详情、Reader Hook 和引用导出。
3. 在没有安装官方 Zotero 的干净 Windows 环境做安装、重启恢复和卸载测试。
4. 扫描最终产物中的 Zotero 标志和名称；技术兼容字段可以保留，用户界面不得冒充官方 Zotero。
5. 准备 AGPLv3 源码提供、许可证和第三方依赖清单。

## 禁止回退的旧路线

以下逻辑已经被证明会造成空白页、伪兼容或状态丢失，不要恢复：

- 不要恢复 ItemPane 中的“AI 研究”空白 section。
- 不要恢复 `installAIButtonBridge` 对原生监听器的劫持。
- 不要恢复 `toggleAIOverlay` 临时浮动抽屉。
- 不要恢复只登记 XPI 文件名、不执行 AddonManager 生命周期的“伪插件安装”。
- 不要把 React/Vite 原型重新当成正式桌面内核。
- 不要为 MinerU 内置一套庞大的本地运行时；保持可选解析适配器即可。
- 不要承诺“所有 Zotero 插件无条件兼容”。准确口径是：支持明确兼容 Zotero 9 基线且使用仍受支持扩展点的 XPI。
- 不要为视觉重构破坏 Zotero 原生菜单、Reader Hook、ItemPane 挂载点或窗口生命周期。
- 不要在代码、配置示例、截图或 Git 历史中提交真实 API Key。

## 已知文档和代码不一致

根目录 `README.md` 的构建产物示例仍写着：

```text
desktop/dist/Zotero_win-x64/zotero.exe
```

当前实际启动产物是：

```text
desktop/dist/Zotero_win-x64/Library.exe
```

构建脚本仍会先产生上游 `zotero.exe`，写入 Library 图标后复制为 `Library.exe`。对用户和验收脚本应统一使用 `Library.exe`。

## 交接完成判定

K3 接手后至少应完成以下一次性检查，才能开始宣称新功能“可用”：

- [ ] `Library.exe` 从独立开发 profile 正常启动。
- [ ] `npm run desktop:verify` 全部 PASS。
- [ ] 机器人按钮一次打开、再次收起 AI View。
- [ ] 当前论文自动显示为来源。
- [ ] “＋来源”能选择另一篇真实文献。
- [ ] 有效接口能流式回答，并能停止、重试和恢复历史。
- [ ] 点击结构化引用能打开正确附件；可靠页码存在时跳到正确页。
- [ ] “保存为笔记”产生真实 Zotero 子笔记。
- [ ] 侧边批注与高亮行对应，并在滚动/缩放时保持关系。
- [ ] 浅色、深色、自定义皮肤下 AI 与 Reader 扩展区域可读。
- [ ] Library Connector 构建和 `connector:verify` 通过。
- [ ] 没有把 API Key、开发 profile 或测试文库打进提交和发布包。

## 许可与品牌边界

- Zotero 源码采用 AGPLv3；分发修改版时必须履行相应源码与许可证义务。
- Library 使用独立名称和 L 图标，不得暗示与 Zotero 官方存在隶属或背书关系。
- 技术内部仍需要 `applications.zotero`、`Zotero.*`、Connector 协议等兼容字段；隐藏品牌不能通过删除这些兼容契约来实现。
- Sidenotes、Claudian、Zen Browser、NotebookLM、Zotero-GPT 等项目仅作为架构和交互研究参考，移植前必须逐项核对许可证，不能直接复制品牌或大段实现。

## 交接入口

K3 开始工作时，建议按以下顺序阅读：

1. 本文档。
2. 根目录 `README.md`，同时注意其中 `zotero.exe` 路径已过时。
3. `scripts/run-desktop.ps1` 和 `scripts/verify-desktop.ps1`。
4. `desktop/addons/research-workspace/manifest.json`、`bootstrap.js`。
5. `ai-view.js`、`ai-provider.js`、`ai-conversation.js`、`ai-context.js`。
6. `research-workspace.js` 中 `renderSidenoteSidebar()` 到 `layoutSidenotes()` 的代码段。
7. `work/sidenotes-reverse` 中的 scope、timeline 和静态证据。

交接时不要清理当前工作区、不要 reset 上游源码，也不要覆盖现有开发文库。当前根目录不是统一 Git 仓库，而 `desktop/zotero` 和 `connector/library-connector` 各自包含独立 Git 元数据；提交策略需要先由项目负责人统一。
