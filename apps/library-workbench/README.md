<p align="center">
  <img src="docs/assets/hero.png" alt="Agentero" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/poco-ai/agentero/stargazers"><img src="https://img.shields.io/github/stars/poco-ai/agentero?style=flat&logo=github" alt="GitHub stars" /></a>
  <a href="https://github.com/poco-ai/agentero/network/members"><img src="https://img.shields.io/github/forks/poco-ai/agentero?style=flat&logo=github" alt="GitHub forks" /></a>
  <a href="https://github.com/poco-ai/agentero/issues"><img src="https://img.shields.io/github/issues/poco-ai/agentero?style=flat" alt="GitHub issues" /></a>
  <a href="https://github.com/poco-ai/agentero/pulls"><img src="https://img.shields.io/github/issues-pr/poco-ai/agentero?style=flat" alt="GitHub pull requests" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://github.com/poco-ai/agentero/releases"><img src="https://img.shields.io/github/v/release/poco-ai/agentero?include_prereleases&style=flat" alt="Release" /></a>
  <a href="https://agentero-docs.poco-ai.com"><img src="https://img.shields.io/badge/docs-online-5319E7?logo=mkdocs&logoColor=white" alt="Documentation" /></a>
</p>

<p align="center">
  中文 | <a href="README.en.md">English</a>
</p>

如果本项目对你有帮助，请在右上角**给个 star** 吧！

<p align="center">
  <a href="https://github.com/poco-ai/agentero/stargazers"><img src="https://github.com/user-attachments/assets/1d49b049-89ae-4992-a92d-d2411c8053b6" alt="Give me a star" width="480" /></a>
</p>

**Context is everything**。

如果说今天的模型是 $f$，越来越聪明，也越来越像。同一个 $f$，决定输出 $y$ 的，是输入 $x$，也就是 context。

但科研的 context 今天是碎裂的：PDF 和高亮批注可能在 Zotero 里，笔记在 Obsidian 里，你和 AI 的讨论、提问、方案留在对话框里。三者互不相通，再聪明的 Agent 也只能读到碎片。

所以我们做了 Agentero，旨在构建 Agent 友好、Agent 原生的文献管理方式，探索人与 Agent 在文献管理中的协作方式。

Agentero 是一个 Agent 时代的本地优先科研工作台，让输入、处理、输出三个环节都有 AI 参与。它不锁定具体 Agent 或模型——通过 ACP 接上你自己的本地 Agent（BYOA），工作上下文留在本地 Vault。

## 功能

- **Agent 原生体验**
  - 通过 **ACP** 连接本机 Agent，Agentero 不锁定具体 Agent 或模型，工作上下文留在本地 Vault
  - 支持快速安装、配置、卸载 Agent
  - 支持划词对话、论文导入与 Skill 导入，让 Agent 参与检索、阅读与整理工作流
  - 内置 CLI，支持导入论文、获取论文metadata、写入笔记、高亮等操作
  - 内置 MCP，可以链接 ChatGPT web 等
- **衔接 Zotero 生态**：兼容 Zotero 生态的导入方式，支持从标识符、链接或浏览器插件保存论文。一键导入 Zotero 书库，保留标签、笔记和附件。随时导出 BibTeX / BibLaTeX，衔接 LaTeX 写作流程
- **论文导入**
  - 支持软件内浏览 [Cool Papers](https://papers.cool/) 网站并导入文献
  - 支持魔搭网站导入文献
  - 支持 RSS 订阅
  - 支持根据已有文献库推荐arXiv今日文献
  - 支持搜索论文名字导入
  - 支持 Zotero 浏览器插件导入文献
- **文献管理**
  - 支持获取库中文献的出版商，支持一键查找引用库中文献的新文献
  - 解析论文的参考文献，并支持一键导入
  - 论文标签、筛选
  - 快速跳转对应 arXiv、alphaXiv 链接
- **文献阅读与记录**
  - 所见即所得的Markdown笔记编辑
  - Markdown 双链语法与 `/` 快捷提示语法
  - 支持一键翻译、按页翻译、划词翻译，支持多种免费 API 以及 BYOK 的 API 翻译服务
  - 支持页码导航、适应宽/整页、大纲、⌘F 查找、平滑划词、高亮、批注、提问与翻译
  - 解析论文中的图、表、公式与算法，并结合上下文理解
- **云同步**：支持 S3 兼容的云同步服务。
- **远程访问**：通过 SSH 隧道浏览远程知识库，数据保留在用户自己的服务器上。
- **多系统兼容**：Mac、Windows、Linux，快捷键与常用软件保持对齐，不改变使用习惯。
- **多种主题风格**： 支持多种主题风格，满足不同用户需求。

## 界面预览

<p align="center">
  <img src="docs/assets/coolpaper.png" alt="Cool Papers 浏览与导入" width="90%" />
  <br/>
  <sub>在应用内浏览 Cool Papers 并一键导入文献</sub>
</p>

<p align="center">
  <img src="docs/assets/agent.png" alt="Agent 伴读" width="90%" />
  <br/>
  <sub>分屏阅读 PDF，右侧 Agent 随时总结、提问与翻译</sub>
</p>

<p align="center">
  <img src="docs/assets/translate.png" alt="翻译与笔记" width="90%" />
  <br/>
  <sub>划词翻译、按页翻译，结合 Markdown 笔记整理要点</sub>
</p>

<p align="center">
  <img src="docs/assets/rss.png" alt="RSS 订阅" width="90%" />
  <br/>
  <sub>订阅 RSS 源，追踪最新论文与博客动态</sub>
</p>

<p align="center">
  <img src="docs/assets/skill-import.png" alt="Skill 推荐" width="90%" />
  <br/>
  <sub>浏览并安装社区 Skill，扩展 Agent 的论文阅读与写作能力</sub>
</p>

<p align="center">
  <img src="docs/assets/agent-setting.png" alt="Agent 设置" width="90%" />
  <br/>
  <sub>通过 ACP 连接本机 Agent，安装、升级与切换默认 Agent</sub>
</p>

<p align="center">
  <img src="docs/assets/image.png" alt="MCP 连接" width="90%" />
  <br/>
  <sub>内置 MCP，可将 Agentero 能力接入 ChatGPT 等外部客户端</sub>
</p>

<p align="center">
  <img src="docs/assets/s3-sync.png" alt="S3 云同步" width="90%" />
  <br/>
  <sub>配置 S3 兼容存储，实现 Vault 云同步</sub>
</p>

<p align="center">
  <img src="docs/assets/theme.png" alt="主题风格" width="90%" />
  <br/>
  <sub>多种配色主题，支持跟随系统与界面缩放</sub>
</p>

## Quick Start

### 桌面应用

前往 [Agentero](https://agentero.poco-ai.com) 或 [Releases](https://github.com/poco-ai/agentero/releases) 下载。

Linux 需 Ubuntu **22.04+**（webkit2gtk 4.1）。详见 [安装文档](docs/usage/getting-started.md)。

HomeBrew

```bash
brew tap poco-ai/agentero
brew install --cask agentero
```

### CLI

HomeBrew

```bash
brew tap poco-ai/agentero
brew install agentero
```

## 开发

### 项目结构

```text
agentero/
├── AGENTS.md             # 面向 Agent / 开发者的仓库指南
├── mkdocs.yml            # MkDocs 文档站配置
├── src/                  # React + TypeScript 前端
├── src-tauri/            # Tauri 2 + Rust Host（Vault、Wiki、ACP）
├── cli/                  # headless CLI（bin agentero；见 docs/backend/cli.md）
├── templates/vault/      # Create Vault 脚手架（含 .agents/skills）
├── docs/                 # MkDocs：usage / frontend / backend / development（草稿）
└── package.json
```

### 技术栈

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=black" alt="Rust" />
  <img src="https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white" alt="pnpm" />
</p>

- **桌面壳**：[Tauri 2](https://v2.tauri.app/)
- **前端**：[React](https://react.dev/)、[TypeScript](https://www.typescriptlang.org/)、[Tailwind CSS](https://tailwindcss.com/)、[shadcn/ui](https://ui.shadcn.com/)、[AI Elements](https://elements.ai-sdk.dev/)
- **窗口管理**： Dockview
- **PDF**： Embedded PDF
- **编辑器**：[Plate](https://platejs.org/) / Markdown
- **Agent**：[Agent Client Protocol](https://agentclientprotocol.com/)、BYOA

### 测试

```bash
git clone https://github.com/poco-ai/agentero.git
cd agentero
pnpm install

# 清除前端与 Rust 构建产物
pnpm clean

# 桌面应用（推荐）
pnpm tauri dev

# 仅前端预览（无原生 Vault / Agent 后端）
pnpm dev
```

## 贡献

欢迎提交 Issue 和 PR。

1. Fork 后创建功能分支。
2. 保持改动聚焦，并遵守现有 lint/format 设置（`pnpm lint` / `pnpm format`）。
3. PR 描述清楚改动内容和原因。

较大的想法请先开 issue 对齐范围。

## License

本项目使用 [MIT License](LICENSE)。

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=poco-ai/agentero&type=date&legend=top-left&sealed_token=dKsoXrNYkG3u-nEL3OLp0_aTrlN-GjDpvVEVJvC3xjH13q3viEwwkkB5m6LYT3iKu6LZXtZpQAXalvBwaFQdYgVTjTA1Dzp6NGe_BUQXA1cMt57wNdrYvA)](https://www.star-history.com/?type=date&repos=poco-ai%2Fagentero)

## 致谢

感谢 [LinuxDo](https://linux.do/) 和 [ModelScope](https://modelscope.cn/) 社区的支持与反馈。
