# AI 侧栏"无法回答 / 消息不显示"修复记录

> 日期：2026-08-25  
> 模块版本：`0.10.7` → `0.11.2`  
> 关联交接：`docs/2026-08-25_handoff-Library-K3-report.md` P0 第 4 项（真实 AI 全链路）

## 症状

1. 发送问题后界面无任何变化，必须收起再点开 AI View 才看到对话结构。
2. 点开后的对话里，自己的问题与 AI 回复均为空，只有一个永远闪烁的光标。
3. 接口侧实际从未收到请求（"发出去他收不到"）。

## 根因（两个独立缺陷叠加）

### 根因 A：`AbortController is not defined`，请求根本没发出

`bootstrap.js` 用 `Services.scriptloader.loadSubScript()` 把 `ai-view.js` 等脚本加载进 **bootstrap 沙箱**（系统主级别 Sandbox），而不是窗口全局。该沙箱里 `fetch` 可用（所以"保存并测试"的 `/models` 请求曾正常工作），但 `AbortController` 构造器未暴露。

`send()` 的执行顺序是：先 push 用户消息和 assistant 占位消息、`repository.update()` 保存，**然后** `new AbortController()` 抛出 ReferenceError——这一行在 try/catch 之外，异常直接穿透 `send()`，其后的 `renderAll()` 与 `provider.stream()` 全部不会执行。

这同时解释了全部三个症状：

- 消息已入库存盘，但渲染调用在异常之后 → 发送瞬间界面不刷新；
- 重新打开面板时 `open()` 里的 `render()` 正常执行 → 能看到对话结构；
- assistant 占位消息的 content 永远为空、state 永远停在 `streaming` → 回复区只有空气泡和光标；
- fetch 从未发起 → 对端收不到请求。

### 根因 B：推理模型先输出 `reasoning_content`，旧解析器全部丢弃

开发环境配置的 `DeepSeek-V4-Flash`（llmapi.paratera.com）是推理模型：SSE 流会先长时间推送 `delta.reasoning_content`（思考过程），最后才给 `delta.content`。旧解析器只读 `delta.content`，整个推理阶段（论文问题可达数十秒）界面零反馈，与"卡死"无法区分。

实测（Node 网络级回放）：思考 113 字符先行，正文 3.8 秒后才到达。

## 修复内容

| 文件 | 改动 |
|---|---|
| `ai-view.js` | `new AbortController()` → `new window.AbortController()`（沙箱没有就从窗口取）；`send()` catch 增加 `Zotero.debug` 堆栈日志；`render()` 包一层 try/catch，单条异常消息不再拖垮整个侧栏 |
| `ai-view.js` | 消息模型新增 `reasoning` 字段；流式期间以 `<details open>` 实时展示"正在思考…"，正文到达后折叠为"思考过程"；状态栏在推理阶段显示"正在思考（推理阶段）…" |
| `ai-provider.js` | SSE 同时解析 `delta.reasoning_content`（→ `onReasoning`）与 `delta.content`（→ `onDelta`）；`TextDecoder` 从沙箱全局回退到 `window.TextDecoder` |
| `ai-conversation.js` | 启动时把上次运行遗留的 `streaming` 消息统一标记为已中断错误，附"可点击重试"，消除永久转圈 |
| `style.css` | `.library-ai-thinking` 思考块样式（左侧竖线、低强调、限高滚动） |

## 验证证据

- XPI 内自检（stub 流 + 真实流两阶段，`work/ai-debug/selftest-run2.log`）：
  - 阶段 1：stub 流渲染正常，DOM 含思考块与正文，`state=done`。
  - 阶段 2：真实 Gecko fetch 流式成功，`reasoningDeltas=3584`、`deltas=7`、12.75s 完成、`content="2（当前没有论文来源）"`，DOM 完整呈现思考过程与正文。
- 7 个 XPI JS 文件 `node --check` 全部通过。
- `npm run desktop:verify` 17 项全部 PASS（含 AI 侧栏各项静态检查）。
- 密钥仅存于系统 LoginManager（`library-ai://model`），未写入代码、文档或 Git；调试用解密脚本在 `work/ai-debug/decrypt-login.py`，仅本机使用。

### 根因 C（0.11.1 修复）：来源只在打开面板/切换标签时同步

来源同步只发生在 `open()` 和标签切换事件；在空来源会话中直接提问时不会补同步，AI 只能回答"没有提供论文来源"。修复：`send()` 在采集上下文前，若 `conversation.sources` 为空则先执行一次 `syncCurrentSource(window)` 并立即刷新来源芯片。

### 根因 D（0.11.2 修复）：`getAnnotations()` 返回对象被当作 itemID

报错形态：发送后显示 `Error(s) encountered during statement execution: no such column: NaN [QUERY: SELECT O.itemID, ...]`。

Zotero 9 的 `Item.prototype.getAnnotations(includeTrashed, asIDs)` **默认返回 `Zotero.Item[]` 对象**（`item.js:4390-4416`），只有传 `asIDs=true` 才返回 ID。`ai-context.js` 的 `collect()` 把返回的注解对象当数字 ID 再传给 `Zotero.Items.getAsync()`，SQL 里出现 `IN (NaN)` 而报错。修复：直接使用返回的注解对象，不再二次 `getAsync()`。

诊断方法记录：通过版本化探针（`aiSelfTest` pref 触发、`-ZoteroDebugText` 落盘到 `work/ai-debug/probe-run*.log`）逐段执行 `source()`/`collect()` 拿到真实堆栈定位；修复后探针确认 `collect(1) ok, records=10`，探针代码随即移除。

### 经验：Zotero 9 API 返回值类型速查

- `item.getNotes()` → **number[]**（itemID）
- `item.getAttachments()` → **number[]**（itemID）
- `item.getAnnotations()` → **Zotero.Item[]**（默认）；`getAnnotations(false, true)` → number[]

## 端到端验收（0.11.3，`work/ai-debug/e2e-run.log`）

真实内核、真实来源、真实 API 的完整闭环（一次性探针模拟用户提问，跑完即删）：

- 新会话 + 空来源提问「请用三句话概括当前论文的主要内容」→ 发送时自动同步当前论文（`sources=1`）；
- `state=done`，6.5 秒完成，正文 183 字，思考过程 87 字，10 条引用记录；
- 回答含 `[[S1-C1]]` / `[[S1-C3]]` / `[[S1-C5]]` 引用标记，DOM 中用户消息、思考块、正文全部正确渲染；
- 回答正文（证据样本）：「本文系统综述了大语言模型对信息检索领域的影响，指出以LLM为代表的生成式AI推动信息检索从性能改进走向模式颠覆 [[S1-C1]]。…」

至此「提问 → 自动来源 → 思考过程 → 流式回答 → 结构化引用」全链路在真实环境中验证通过。探针会话已从 `conversations.json` 清除，仅保留用户真实会话。

## 遗留

### 0.12.0（2026-08-26）：参考片段 + 阅读器联动 + 拆除侧边批注 + 主题统一

1. **拆除侧边批注系统**：按需求放弃「弹窗/侧边」批注模式，删除 `research-workspace.js` 约 560 行（模式切换器、侧边栏渲染、视口锚定布局、批注右键扩展、样式注册），只保留原生 Zotero 批注。`renderTextSelectionPopup` 钩子保留但改作 AI 用途。
2. **参考片段（references）**：会话新增 `references` 数组（持久化于 conversations.json），composer 中以芯片展示、可单独移除；发送时作为「用户选中的参考片段」块进入 prompt，优先围绕其作答；消息记录本次使用的参考标签。
3. **剪贴板实时监测**（Claudian 式）：AI 面板打开时每 1.5s 读一次系统剪贴板（nsIClipboard），新文本（8–8000 字）自动挂为参考芯片；面板打开时先对齐基线避免误挂旧内容；用户移除的片段不再自动加回。
4. **阅读器精准制导**：划词弹窗新增「✦ 发给 Library AI 作为参考」按钮（选中文本 + 页码）；「选择区域」工具产生的图片批注自动挂为选区参考（仅当该文档正在阅读器中打开，避免批量导入误触发）。
5. **主题统一**：AI 面板全部颜色/圆角/阴影改用产品皮肤 token（`--accent-blue`、`--material-*`、`--fill-*`、`--research-radius-*`、`--research-shadow`），跟随「皮肤」设置的主色；默认主色从薄荷 #72e3a6 改为产品玉色 #1b7f5c。
6. **验收同步**：移除 "Reader annotation mode switch" 检查，新增 "Native annotations preserved"、"Reader AI selection hooks"、"AI reference chips + clipboard monitor" 三项，共 19 项全 PASS。

## 遗留

### Library Crawl 浏览器扩展（2026-08-27，`browser-extension/library-crawl/`）

替代官方 Zotero Connector 的自有品牌抓取入口。按 reverse-skill 证据链纪律，直接逆向本仓库内的服务端协议（`desktop/zotero/.../server_connector.js`）而非盲抄客户端：

- **协议选型**：官方 connector 的 `saveItems` 走翻译器且附件默认不下载（`ATTACHMENT_MODE_IGNORE`），需多次往返；`POST /connector/saveStandaloneAttachment`（`X-Metadata: sessionID/url/title` + 二进制 PDF 流）单请求入库且自动触发元数据识别，是最短路径。
- **E2E 证据**：对运行中的 Library 推送真实 PDF（W3C dummy.pdf 13264 字节）→ `HTTP 201 {"canRecognize":true}`，文库中已出现「Library Crawl E2E 测试文档.pdf」（可手动删除）。
- **能力**：PDF 页面右下角抓取角标、弹窗扫描本页全部 PDF 链接逐个抓取、右键菜单抓取链接/本页、登录站点 Cookie 携带、`%PDF-` 魔数校验、服务未连接时明确报错。
- **品牌**：名称/图标/文案全部 Library，零 Zotero 字样（验收脚本已加入含该断言的 "Library Crawl browser extension" 检查项，总计 23 项 PASS）。
- 安装：Edge/Chrome → 扩展页 → 开发者模式 → 加载解压缩的扩展 → 选择 `browser-extension/library-crawl/`。
- 注意：官方 Zotero Connector 若已安装请移除，两者都连 23119 端口会重复弹窗。服务端 `GET /connector/ping` 返回的 "Zotero is running" 是内核内部字符串，仅 API 可见；如需彻底改品牌需动内核源码并重编译，暂记为 P3。
- 另注：桌面侧已有并行会话将插件推进至 0.16.x（slash 命令、模型自动发现、多配置档案），本会话未触碰其代码，全部验收项含新特性均 PASS。

- 开发文库 `desktop/data/library-ai/conversations.json` 中含两条自检产生的测试会话，属开发数据，可忽略或手动删除。
- 交接文档 P0 第 4 项"真实 AI 全链路"已具备条件：请在界面中实测"提问 → 思考过程 → 流式回答 → 引用定位 → 保存为笔记"，并补一张脱敏截图。

## 附：Claudian（yishentu/claudian）逆向要点

参考仓库已克隆至 `tmp/reference-claudian`（Obsidian 插件，TypeScript）。与本次修复相关的核心机制：

1. **快照 + 版本号的流式渲染协调器**（`StreamingRenderCoordinator.ts:19-213`）：流式回调只做 `request(snapshot)`（版本号 +1），由 rAF 调度 + 最小间隔节流执行真正渲染；渲染失败被吞掉并视为已消费，**渲染异常永远不能阻塞流的收尾**（`:149-156`）；结束时 `flush()` 强制穿透节流画最后一帧。我们目前每个 delta 全量 `renderAll()`，短期可用，后续应按此模式加节流。
2. **思考块一等公民**（`ThinkingBlockRenderer.ts:23-126`）：thinking 内容有独立存储字段和独立渲染器，流式时实时更新，完成后折叠为 "Thinking" 头；持久化后重放时渲染为折叠块。我们 0.11.0 的 `<details>` 实现已是同构思路。
3. **瞬态 UI 状态与持久会话分离**（`ChatState.ts`）：`isStreaming`、`thinkingEl`、`thinkingIndicatorTimeout` 等属于瞬态投影，永不写入持久层；持久层只存最终消息。我们的 `state: "streaming"` 会落盘，因此才需要启动时的遗留清理——更彻底的做法是持久化时把 streaming 归一化为终态。
4. **延迟思考指示**：`thinkingIndicatorTimeout`（`ChatState.ts:246,445-454`）只在思考超过阈值后才显示指示器，避免短请求闪烁。
5. **渲染器与控制器分层**：renderer 只渲染状态、发出用户意图，不触碰会话持久化与 provider 生命周期（见 `src/features/chat/AGENTS.md` 的 Ownership 表）。我们单文件实现可暂不深拆，但渲染纯函数化、副作用集中在 controller 的方向值得保持。

### Open Notebook 迁移（0.17.0，2026-08-27）

逆向 `lfnovo/open-notebook`（MIT，NotebookLM 开源替代品）后按批准迁移的概念（参考库在 `tmp/reference-open-notebook`）：

1. **来源三级上下文**：来源芯片新增 全/摘/隐 循环开关（`source.level` 持久化）——全文进上下文 / 仅元数据摘要（`collectSummary`）/ 对 AI 完全排除。对应其 "Full Content / Summary Only / Not in Context" 隐私成本控制。
2. **Ask 模式**：composer 底部新增 Ask 开关（按会话持久化）。开启后先经 LLM 分解问题为 1-3 个检索词（移植其 `prompts/ask/entry.jinja` 的 JSON 策略格式），再多路全文检索合并去重取 top10；跨来源综合问题召回质量显著提升。分解失败自动回退单路检索。
3. **Transformations**：经核查已由既有斜杠命令体系覆盖（/summary /explain /translate /compare /review /questions），不重复建设。
4. **未迁移**：播客生成（与场景弱相关）、向量语义检索（待探测 embedding 端点）、Notebook 容器层（由 Zotero 文集承担）。
