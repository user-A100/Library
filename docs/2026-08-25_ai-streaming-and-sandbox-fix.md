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

## 遗留

- 开发文库 `desktop/data/library-ai/conversations.json` 中含两条自检产生的测试会话，属开发数据，可忽略或手动删除。
- 交接文档 P0 第 4 项"真实 AI 全链路"已具备条件：请在界面中实测"提问 → 思考过程 → 流式回答 → 引用定位 → 保存为笔记"，并补一张脱敏截图。

## 附：Claudian（yishentu/claudian）逆向要点

参考仓库已克隆至 `tmp/reference-claudian`（Obsidian 插件，TypeScript）。与本次修复相关的核心机制：

1. **快照 + 版本号的流式渲染协调器**（`StreamingRenderCoordinator.ts:19-213`）：流式回调只做 `request(snapshot)`（版本号 +1），由 rAF 调度 + 最小间隔节流执行真正渲染；渲染失败被吞掉并视为已消费，**渲染异常永远不能阻塞流的收尾**（`:149-156`）；结束时 `flush()` 强制穿透节流画最后一帧。我们目前每个 delta 全量 `renderAll()`，短期可用，后续应按此模式加节流。
2. **思考块一等公民**（`ThinkingBlockRenderer.ts:23-126`）：thinking 内容有独立存储字段和独立渲染器，流式时实时更新，完成后折叠为 "Thinking" 头；持久化后重放时渲染为折叠块。我们 0.11.0 的 `<details>` 实现已是同构思路。
3. **瞬态 UI 状态与持久会话分离**（`ChatState.ts`）：`isStreaming`、`thinkingEl`、`thinkingIndicatorTimeout` 等属于瞬态投影，永不写入持久层；持久层只存最终消息。我们的 `state: "streaming"` 会落盘，因此才需要启动时的遗留清理——更彻底的做法是持久化时把 streaming 归一化为终态。
4. **延迟思考指示**：`thinkingIndicatorTimeout`（`ChatState.ts:246,445-454`）只在思考超过阈值后才显示指示器，避免短请求闪烁。
5. **渲染器与控制器分层**：renderer 只渲染状态、发出用户意图，不触碰会话持久化与 provider 生命周期（见 `src/features/chat/AGENTS.md` 的 Ownership 表）。我们单文件实现可暂不深拆，但渲染纯函数化、副作用集中在 controller 的方向值得保持。
