# 接入 GenericAgent ACP

[GenericAgent](https://github.com/lsdefine/GenericAgent) 是一个极简、可自我进化的本地 Agent 框架，核心约 3K 行代码，支持浏览器自动化、终端、文件系统、键鼠、视觉、ADB 等能力。通过它自带的 ACP bridge，可以把 GenericAgent 接到 Agentero，让它在你的 Vault 里读论文、写 NOTES、跑代码、整理文献。

## 前置条件

1. 本机已安装 GenericAgent，并配置好 `mykey.py`（填入至少一个 LLM API Key）。
2. 推荐 Python 3.11 或 3.12（与 GenericAgent 官方要求一致）。
3. Agentero 桌面端已打开目标 Vault。

如果你还没装 GenericAgent，参考其官方 README 的 **Method 1 — Clone & install**：

```bash
git clone https://github.com/lsdefine/GenericAgent.git && cd GenericAgent
uv venv && uv pip install -e ".[ui]"
cp mykey_template_en.py mykey.py   # 编辑填入 API Key
```

## 启动 ACP bridge

GenericAgent 仓库里的 `frontends/genericagent_acp_bridge.py` 就是 ACP 适配器。它通过 stdio 与 Agentero 通信。

### 基本启动

在 GenericAgent 仓库目录下执行：

```bash
python frontends/genericagent_acp_bridge.py
```

### 常用参数

| 参数 | 说明 |
|---|---|
| `--llm-no N` | 使用 `mykey.py` 中第 N 个 LLM 配置（从 0 开始）。默认 0。 |
| `--root-dir DIR` | 指定 GenericAgent 工作根目录。默认是 bridge 脚本所在的仓库根。 |

例如使用第二个模型配置、并指定工作目录：

```bash
python frontends/genericagent_acp_bridge.py --llm-no 1 --root-dir /path/to/genericagent
```

## 在 Agentero 中添加 GenericAgent

1. 打开 Agentero，进入 **Settings → Agent**（`⌘,`）。
2. 选择「新增自定义 Agent」或类似入口。
3. 填写以下信息：

| 字段 | 建议值 |
|---|---|
| 名称 | `GenericAgent` |
| 命令（command） | Python 解释器绝对路径，如 `/Users/philfan/f/GenericAgent/.venv/bin/python` |
| 参数（args） | **必须**用绝对路径指向 bridge 脚本，例如 `"/Users/philfan/f/GenericAgent/frontends/genericagent_acp_bridge.py"` |
| 环境变量（env） | 建议加 `PYTHONUNBUFFERED=1`，避免输出缓冲问题 |

> **注意**：Agentero 自定义 Agent 表单目前没有独立的「工作目录（cwd）」字段，进程以当前 Vault 根目录启动。因此 bridge 脚本路径**不要**用相对路径，否则会出现 `//frontends/genericagent_acp_bridge.py` 之类的找不到文件错误。

示例配置（macOS / Linux）：

```text
command: /Users/philfan/f/GenericAgent/.venv/bin/python
args:    ["/Users/philfan/f/GenericAgent/frontends/genericagent_acp_bridge.py", "--llm-no", "0"]
```

4. 保存后把它设为默认 Agent，或只在某次对话中切换使用。
5. 在 Agent 面板发起一次测试对话，例如：

```text
请列出当前 Vault 根目录下的文件。
```

如果 GenericAgent 配置正确，它会通过 ACP 返回结果，Agentero 会在面板中展示。

## 验证 bridge 是否正常工作

在终端手动跑一下 bridge，然后输入一行 JSON-RPC：

```bash
cd /Users/philfan/f/GenericAgent
.venv/bin/python frontends/genericagent_acp_bridge.py
```

然后粘贴：

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientInfo":{"name":"test","version":"1.0"}}}
```

如果看到类似下面的回显，说明 bridge 正常：

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":true,"promptCapabilities":{"image":false,"audio":false,"embeddedContext":true},"sessionCapabilities":{"list":{},"load":{},"resume":{},"delete":{}},"mcpCapabilities":{"http":false,"sse":false}},"agentInfo":{"name":"genericagent-acp","title":"GenericAgent","version":"0.2.0"},"authMethods":[]}}
```

按 `Ctrl+C` 退出。

## 使用技巧

### 让 GenericAgent 读写 Vault

GenericAgent 的强项是文件系统和终端操作。你可以直接在 Agentero 的 Agent 面板里让它：

- 总结当前论文并写入 `NOTES.md`
- 批量整理 `papers/` 目录
- 调用 `code_run` 工具跑 Python/R 脚本分析数据
- 通过浏览器工具查补充资料

由于 GenericAgent 的 `cwd` 就是 Vault 根目录，相对路径从 Vault 根开始即可。

### 会话持久化

bridge 会自动把每个 ACP session 的元数据和对话历史保存到：

```text
{root-dir}/temp/acp_sessions/{session_id}.json
```

因此 Agentero 重新打开 Vault 后，可以通过 `session/load` 或 `session/resume` 恢复之前的对话上下文。

### 选择模型

如果你 `mykey.py` 里配置了多个模型（如 Claude、Kimi、OpenAI），用 `--llm-no` 切换：

```bash
# 使用第 2 个模型配置
python frontends/genericagent_acp_bridge.py --llm-no 1
```

## 当前限制

- **图片**：ACP bridge 未启用图片输入能力。Agentero 中的 PDF 截图、选区图片不会直接传给 GenericAgent。
- **MCP**：未启用 MCP server 接入。如需把 Vault 接到 ChatGPT / Codex MCP，请使用 Agentero 的 [MCP 模式](mcp.md)。
- **Terminal**：使用 `subprocess.Popen` 实现，适合运行命令行工具，但不适合 `vim`、`nano` 等交互式 TUI 程序。
- **音频**：未启用音频输入。

## 故障排查

### Agentero 里探测不到 / 启动失败

- 确认命令使用**绝对路径**，因为图形应用的 PATH 可能与终端不同。
- 确认 `mykey.py` 已配置且 API Key 有效。
- 在终端先手动跑一遍 bridge，看是否有报错。

### 能连接但返回报错

- 检查 `mykey.py` 中的模型配置是否正确。
- GenericAgent 依赖网络调用 LLM API，确认本机可访问对应 API 端点。

### 对话历史没恢复

- 确认 `--root-dir` 指向 GenericAgent 仓库根，且该目录下有 `temp/acp_sessions/`。
- 如果换了工作目录，之前的 session 文件不会自动迁移。

## 相关文档

- [接入 Agent](agents.md)
- [用 MCP 连接外部 Agent](mcp.md)
- [GenericAgent 官方仓库](https://github.com/lsdefine/GenericAgent)
- [Agent Client Protocol 规范](https://agentclientprotocol.com/)
