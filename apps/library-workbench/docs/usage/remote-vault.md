# 打开远程 Vault

远程 Vault 适合把论文和笔记放在服务器上，同时在本地使用 Agentero 的界面。文件权威保留在服务器，Agent 也在服务器上运行。

## 使用前提

需要准备：

- macOS 或 Linux 客户端；
- 可以通过 SSH 登录的服务器；
- 服务器上的 Vault 目录；
- 服务器已安装并登录要使用的 ACP Agent；
- 当前用户对远程 Vault 有读写权限。

Windows 客户端当前不能打开远程 Vault。

## 连接远程 Vault

1. 在欢迎页选择 **Open Remote Vault**，或在当前窗口的 Vault 切换菜单中选择同名入口。
2. 填写 SSH 用户、主机、端口和远程 Vault 路径。
3. 选择 SSH 密钥或当前可用的 SSH 认证方式。
4. 连接并等待文件树加载。
5. 确认 Library 和论文目录已经出现。

远程连接同时使用：

- SFTP 读写文件树、Markdown 和 PDF；
- SSH 执行远程 Agent；
- 会话内 Catalog 工作副本，用于 Library 查询和元数据操作。

## 远程 Agent

远程 Agent 必须安装在服务器上，而不是只安装在本机。Agentero 会在远程 Vault 根目录启动它，使 Agent 看到的工作目录与 SFTP 文件树一致。

在服务器上先确认：

```bash
command -v claude-agent-acp
command -v codex-acp
command -v opencode
```

至少准备一个实际使用的命令，并完成对应的官方登录流程。然后在 Agentero 的 Agent 设置中选择远程可用的 Agent。

## 在远程 Vault 中工作

连接成功后，常用操作与本地 Vault 基本一致：

- 浏览 Library 和文件树；
- 打开远程 PDF；
- 编辑并保存 `NOTES.md`；
- 导入论文；
- 使用 Agent 总结或整理；
- 看双链反链；在 References 里看引用近邻图。

PDF 和部分大文件可能会暂存在本机缓存中，仅用于预览。断开连接后，远程目录仍是唯一事实来源。

## 远程使用注意事项

### 不要并发写同一个 Vault

MVP 按单写者设计。不要同时让多个 Agentero 客户端、远程 Agent 和外部同步程序修改同一个远程 Vault。

### 远程文件变化不会立即推送到界面

远程文件系统没有本地 inotify 等价物。Agent 结束、用户保存或重新展开目录时，Agentero 会按需检查文件；必要时手动刷新文件树。

### 连接失败

依次确认：

1. 本机终端可以执行 `ssh user@host`。
2. 服务器 SSH 端口可达。
3. 远程路径是绝对路径，且用户有权限访问。
4. 服务器上的 Agent 命令在非交互 SSH 的 PATH 中可见。
5. Agent 需要的登录凭据已经配置在服务器上。

如果终端登录成功但 Agentero 仍然找不到命令，优先在 Agent 设置中使用绝对路径，或把命令所在目录加入非交互 shell 的 PATH。
