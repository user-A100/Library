# 斜杠命令（Claudian 移植）实现记录

> 日期：2026-08-27
> 模块版本：`0.12.0` → `0.13.0`
> 方法：按 reverse 工作流对 `tmp/reference-claudian`（yishentu/claudian，Obsidian 插件）做静态逆向，提炼其斜杠命令子系统的触发、下拉、分发与扩展机制后移植到 Library 桌面插件。

## 逆向结论：Claudian 斜杠命令的四个机制

| 机制 | Claudian 实现 | Library 移植 |
| --- | --- | --- |
| 触发匹配 | `SlashCommandSource.match()`：`/` 必须在词首（行首或空白后），query 不含空白；从光标向前扫描 | `ai-commands.js` `matchTrigger()`，逐行同构 |
| 下拉框 | `ComposerDropdownController`：↑/↓ 循环、Enter/Tab 选中、Esc 关闭、IME 组合态不拦截、选中后替换触发区间为 `/name ` 并去重尾部空白 | `ai-view.js` `updateSlashDropdown / renderSlashDropdown / handleSlashKeydown / selectSlashCommand` |
| 命令双轨 | `builtInCommands.ts`：动作命令（clear 等 app 侧执行）与用户命令分离；`detectBuiltInCommand` 解析 `/name args` | 内置 8 条（2 动作 + 6 提示词模板），`detect()` 同语义，未知命令提示后按普通问题发送 |
| 用户命令 | `SlashCommandStorage` + `parseSlashCommandContent`：`.md` 文件 + YAML frontmatter（`description`、`argument-hint`），正文为模板，`$ARGUMENTS` 由 SDK 展开 | 数据目录 `library-ai/commands/*.md`，同格式解析，`expand()` 在发送时展开 `$ARGUMENTS` |

未移植（属于 Claudian 多 provider 架构，Library 单 provider 不需要）：SDK 透传命令、provider 命令目录发现、隐藏命令设置项、folder 型下拉项、@ 提及源。

## 内置命令

- 动作：`/clear`（别名 `/new`，开始新会话）、`/help`（别名 `/commands`，弹出命令总览）
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
- 输入框 placeholder 与状态栏增加 `/ 命令` 引导；下拉框复用皮肤 token，跟随主题。

## 验证证据

- `node --check`：`ai-commands.js`、`ai-view.js`、`bootstrap.js` 通过；
- 行为级测试 `tmp/slash-commands-test.mjs`（stub Zotero/IOUtils）：22/22 PASS，覆盖触发匹配 5 例、过滤排序 4 例、detect 8 例、用户命令解析 3 例、`$ARGUMENTS` 展开 2 例；
- 桌面验收 `npm run desktop:verify` 新增「AI slash commands (Claudian-style)」静态检查（bootstrap 加载、注册中心、下拉交互、样式）。
