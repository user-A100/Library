# Library Workbench

**Context is everything。**

科研的 context 今天是碎裂的：PDF 和高亮批注在一个工具里，笔记在另一个工具里，你和 AI 的讨论留在对话框里。三者互不相通，再聪明的 Agent 也只能读到碎片。

Library Workbench 是一个 Agent 时代的本地优先科研工作台，让输入、处理、输出三个环节都有 AI 参与。它不锁定具体 Agent 或模型——通过 ACP 接上你自己的本地 Agent（BYOA），工作上下文留在本地 Vault。

## 功能

- **Agent 原生体验**
  - 通过 ACP 连接本机 Agent，不锁定具体 Agent 或模型，工作上下文留在本地 Vault
  - 支持快速安装、配置、卸载 Agent
  - 支持划词对话、论文导入与 Skill 导入，让 Agent 参与检索、阅读与整理工作流
  - 内置 CLI，支持导入论文、获取论文 metadata、写入笔记、高亮等操作
  - 内置 MCP，可以链接 ChatGPT web 等
- **衔接 Zotero 生态**：兼容 Zotero 生态的导入方式，支持从标识符、链接或浏览器插件保存论文。一键导入 Zotero 书库，保留标签、笔记和附件。随时导出 BibTeX / BibLaTeX，衔接 LaTeX 写作流程
- **论文导入**：Cool Papers 浏览导入、魔搭导入、RSS 订阅、arXiv 今日文献推荐、论文名搜索导入
- **文献管理**：参考文献解析一键导入、标签筛选、arXiv / alphaXiv 快速跳转
- **文献阅读与记录**
  - 所见即所得的 Markdown 笔记编辑，双链语法与 `/` 快捷提示
  - 一键翻译、按页翻译、划词翻译，支持多种免费 API 与 BYOK API 翻译
  - 页码导航、大纲、查找、平滑划词、高亮、批注、提问与翻译
  - 解析论文中的图、表、公式与算法，结合上下文理解
- **云同步**：S3 兼容的云同步服务
- **远程访问**：SSH 隧道浏览远程知识库，数据保留在用户自己的服务器上
- **渐变主题**：多预设渐变主题、自定义色点、明暗模式与界面缩放

## 开发

### 项目结构

```text
library-workbench/
├── AGENTS.md             # 面向 Agent / 开发者的仓库指南
├── src/                  # React + TypeScript 前端
├── src-tauri/            # Tauri 2 + Rust Host（Vault、Wiki、ACP）
├── cli/                  # headless CLI（bin library）
├── templates/vault/      # Create Vault 脚手架（含 .agents/skills）
└── package.json
```

### 技术栈

- **桌面壳**：Tauri 2
- **前端**：React、TypeScript、Tailwind CSS、shadcn/ui、AI Elements
- **窗口管理**：Dockview
- **PDF**：Embedded PDF
- **编辑器**：Plate / Markdown
- **Agent**：Agent Client Protocol、BYOA

### 本地运行

```bash
pnpm install

# 清除前端与 Rust 构建产物
pnpm clean

# 桌面应用（推荐）
pnpm tauri dev

# 仅前端预览（无原生 Vault / Agent 后端）
pnpm dev
```

### 常用命令

```bash
pnpm lint
pnpm format
pnpm tauri build
```

```bash
# Headless CLI（仓库根 workspace）
cargo build -p library-cli
cargo run -p library-cli -- vault which --json
cargo test -p library-cli
```

## License

本项目使用 MIT License，详见 [LICENSE](LICENSE)。
