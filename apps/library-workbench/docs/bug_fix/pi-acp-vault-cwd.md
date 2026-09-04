# Pi ACP 启动时未使用 Vault 工作目录

**状态**：已修复（为 Pi 本地 ACP 启动注入 OS-level cwd）  
**Issue**：#441  
**影响面**：使用 Pi Agent 时的工作目录、论文/文件查找  
**相关代码**：

- `src-tauri/src/features/agent/models.rs` — `AgentTemplate::needs_local_cwd_shell_wrap`
- `src-tauri/src/features/agent/acp.rs` — `to_acp_agent_local`、`wrap_local_command_with_cwd`

## 1. 问题现象

在 Windows 上配置 Pi Agent（`pi-acp` 社区适配器）后，每次启动 Agent 提问，Pi 都会去 `C:\` 或系统默认目录查找论文/项目文件，而不是当前 Vault 目录。用户观察到 Pi 似乎“没有注入工作路径”。

## 2. 根因

ACP 的 `NewSessionRequest` 携带 `cwd` 字段，用于告知 Agent 当前会话所属项目目录。但是：

1. `agent-client-protocol` 的 `McpServerStdio` 没有 `cwd` 字段，无法直接设置子进程的 OS-level 工作目录。
2. Pi 本身没有原生 ACP 模式，`pi-acp` 适配器负责把 ACP 消息转给 `pi --mode rpc`。该适配器可能没有把 ACP 的 `cwd` 同步成 `pi` 子进程的工作目录。
3. 因此 `pi` 启动后继承的是父进程（Tauri 应用）的 cwd，在 Windows 上往往是应用安装目录或 `C:\`，导致它去错误位置查找论文。

## 3. 解决方案

对于已知不原生处理 ACP `cwd` 的适配器（目前仅 Pi），在本地启动时用一个 shell 包装命令先把 OS-level 工作目录切到 Vault，再 `exec` 真正的 Agent。

### 3.1 模板标记

`AgentTemplate::needs_local_cwd_shell_wrap()` 返回需要 shell `cd` 包装的模板。当前只有 `Pi`，后续若发现其他适配器有同样问题可继续扩展。

### 3.2 Unix 包装

```text
/bin/sh -c "cd '<vault>' && exec '<command>' '<arg1>' '<arg2>' ..."
```

使用单引号包装每个 token，嵌入的单引号用 `'"'"'` 转义。

### 3.3 Windows 包装

```text
cmd /D /C "cd /d "%AGENTERO_AGENT_CWD%" && \"<command>\" \"<arg1>\" ..."
```

- 用 `AGENTERO_AGENT_CWD` 环境变量传递 Vault 路径，避免在命令字符串中直接引用带空格的 Vault 路径。
- 命令和参数按需用双引号包裹，双引号内部用 `\"` 转义。

### 3.4 调用点

所有已知 Vault cwd 的本地启动路径都传入 `cwd`：

- `run_once` — 用户发送 prompt 时
- `warm_agent` — 聊天面板预热
- `list_acp_sessions` — 列出可恢复会话
- `load_acp_session` — 加载历史会话

`probe_agent` 没有 Vault 上下文，传入 `None`，保持原有行为。

## 4. 验收建议

1. 在 Windows 上打开一个 Vault，选择 Pi Agent 发送与论文相关的提问。
2. 观察 Pi 的查找/读取路径，确认它落在当前 Vault 目录下，而不是 `C:\` 或应用安装目录。
3. 在 macOS/Linux 上重复，确认 Pi 同样以 Vault 为工作目录。
4. 其他 ACP Agent（Codex、Claude ACP、Kimi Code 等）不受影响。

## 5. 边界

- 该包装只作用于本地 Agent；SSH 远程 Agent 已在 `remote_agent_shell_command` 中通过 `cd` 处理工作目录。
- `dsh` 模板自己管理 launcher 目录，不经过此包装。
- 若 `pi-acp` 未来原生支持 ACP `cwd`，可移除 `Pi` 的包装标记。
