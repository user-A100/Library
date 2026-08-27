# 斜杠命令（Claudian 移植）实现记录

> 日期：2026-08-27
> 模块版本：`0.12.0` → `0.14.0`
> 方法：按 reverse 工作流对 `tmp/reference-claudian`（yishentu/claudian，Obsidian 插件）做静态逆向，提炼其斜杠命令子系统的触发、下拉、分发与扩展机制后移植到 Library 桌面插件；随后对照 Claude Code 官方命令参考（`tmp/reference-claude-commands.md`）扩充内置命令目录。

## 逆向结论：Claudian 斜杠命令的四个机制

| 机制 | Claudian 实现 | Library 移植 |
| --- | --- | --- |
| 触发匹配 | `SlashCommandSource.match()`：`/` 必须在词首（行首或空白后），query 不含空白；从光标向前扫描 | `ai-commands.js` `matchTrigger()`，逐行同构 |
| 下拉框 | `ComposerDropdownController`：↑/↓ 循环、Enter/Tab 选中、Esc 关闭、IME 组合态不拦截、选中后替换触发区间为 `/name ` 并去重尾部空白 | `ai-view.js` `updateSlashDropdown / renderSlashDropdown / handleSlashKeydown / selectSlashCommand` |
| 命令双轨 | `builtInCommands.ts`：动作命令（clear 等 app 侧执行）与用户命令分离；`detectBuiltInCommand` 解析 `/name args` | 内置 17 条（11 动作 + 6 提示词模板），`detect()` 同语义，未知命令提示后按普通问题发送 |
| 用户命令 | `SlashCommandStorage` + `parseSlashCommandContent`：`.md` 文件 + YAML frontmatter（`description`、`argument-hint`），正文为模板，`$ARGUMENTS` 由 SDK 展开 | 数据目录 `library-ai/commands/*.md`，同格式解析，`expand()` 在发送时展开 `$ARGUMENTS` |

未移植（属于 Claudian 多 provider 架构，Library 单 provider 不需要）：SDK 透传命令、provider 命令目录发现、隐藏命令设置项、folder 型下拉项、@ 提及源。

## Claude Code（0.14.0 扩充）命令迁移对照

Claude Code 的内置命令逐一评估，按「Library 有对应设施则移植，否则明确不移植」处理：

| Claude Code | Library | 说明 |
| --- | --- | --- |
| `/clear [name]`（别名 `/new` `/reset`） | ✅ 完整移植 | 可选参数为上一会话命名，便于 `/resume` 找回 |
| `/compact [instructions]` | ✅ 完整移植 | 调用模型把会话压缩为一条「上下文摘要」消息（虚线卡片样式），后续对话仅携带摘要；可选压缩重点 |
| `/model [model]` | ✅ 完整移植 | 无参数打开模型设置面板；有参数直接切换（沿用已保存接口与密钥） |
| `/copy [N]` | ✅ 完整移植 | 复制第 N 近的回答；同时对齐剪贴板监测基线，避免被自动挂回参考片段 |
| `/export [filename]` | ✅ 移植 | 导出会话为 Markdown 至 `library-ai/exports/` |
| `/rename [name]` | ✅ 完整移植 | 无参数时按首条提问重新自动命名 |
| `/resume [session]`（别名 `/continue`） | ✅ 移植 | 无参数打开历史面板；有关键词按标题/ID 匹配切换 |
| `/usage`（别名 `/cost` `/stats`） | ✅ 移植 | 会话统计卡片（消息/来源/参考/字符数与上下文策略提示）；Library 无 token 计费，标注为粗略估计 |
| `/config` | ✅ 别名 `/settings` | 打开模型设置面板 |
| `/exit`（别名 `/quit`） | ✅ 移植 | 收起 AI 面板 |
| `/help` | ✅ 已有 | 弹出命令总览 |
| `/add-dir` `/agents` `/mcp` `/permissions` `/hooks` `/sandbox` 等 | ❌ 不移植 | 依赖文件系统工具调用 / 子代理 / MCP / 权限层，Library AI 为纯对话+来源上下文架构 |
| `/login` `/logout` `/upgrade` `/usage-credits` | ❌ 不移植 | Library 走 OpenAI 兼容接口 + 系统凭据存储，无账号体系 |
| `/theme` `/color` `/statusline` `/vim` | ❌ 不移植 | 皮肤由插件首选项承担；无状态栏/编辑器模式概念 |
| `/branch` `/fork` `/subtask` `/btw` `/diff` | ❌ 不移植 | 依赖会话分支/后台代理/git 工作区，超出研究助手定位 |

## 内置命令

- 动作：`/clear`（别名 `/new` `/reset`）、`/help`（`/commands`）、`/compact`、`/model`、`/copy`、`/export`、`/rename`、`/resume`（`/continue`）、`/usage`（`/cost` `/stats`）、`/settings`（`/config`）、`/exit`（`/quit`）
- 提示词模板：`/summary`、`/explain [概念]`、`/translate [目标语言]`、`/compare`、`/review`、`/questions`

## 自定义命令

在 Zotero 数据目录 `library-ai/commands/` 下新建 `name.md`：

```markdown
---
description: 润色学术表达
argument-hint: [段落]
---
请润色以下段落，保持学术语气：$ARGUMENTS
```

下拉框唤起时按 5 秒节流自动重载该目录；文件名校验 `^[a-z0-9][a-z0-9-_]{0,31}$`。

## 发送链路改动（`ai-view.js`）

- `send()` 前段拦截：`/` 开头 → `commands.detect()`；动作命令直接执行不进入对话；模板命令展开后以「展示内容 = `/name args`、实际提问 = 展开文本」双轨发送，用户消息渲染为命令芯片 + 参数；
- 消息模型新增 `command` / `prompt` 字段：历史回放与「重试」均使用展开后的 `prompt`，保证模型上下文一致；
- `/compact` 产生的摘要消息带 `compacted: true` 标记，渲染为虚线卡片，角色名显示「上下文摘要」；
- 输入框 placeholder 与状态栏增加 `/ 命令` 引导；下拉框复用皮肤 token，跟随主题。

## 验证证据

- `node --check`：`ai-commands.js`、`ai-view.js`、`bootstrap.js` 通过；
- 行为级测试 `tmp/slash-commands-test.mjs`（stub Zotero/IOUtils）：30/30 PASS，覆盖触发匹配 5 例、过滤排序 4 例、detect 与别名 16 例、用户命令解析 3 例、`$ARGUMENTS` 展开 2 例；
- 桌面验收 `npm run desktop:verify` 新增「AI slash commands (Claudian-style)」静态检查（bootstrap 加载、注册中心、compact/model/copy 动作、下拉交互、样式）。

