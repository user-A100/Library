# AGENTS.md

## 项目概览

Agentero 是一个基于 Tauri 2 + React 19 的本地优先科研工作台。Vault 中笔记与源文件以 Markdown/文件为准，论文结构化 metadata 以 `.agentero/catalog.sqlite` 为准。离开应用后数据仍可被外部工具读取。

**核心能力：**

- **论文库**：Catalog SQLite 管理论文集合，支持表头排序/选列/标签筛选、BibTeX 导出
- **魔棒入库**：通过 URL/arXiv ID/DOI 一键导入论文，自动下载 PDF、解压 LaTeX 源码
- **PDF 阅读与标注**：分屏阅读（左 PDF/右笔记），划词高亮/批注/翻译/提问，大纲与页码导航
- **Agent 工作流**：BYOA 接入本机 ACP Agent，支持论文总结/问答/精读，选区上下文与 @ 提及
- **Markdown 编辑**：Plate 编辑器，双链 `[[...]]`、Obsidian Callout、嵌套标题引用、内嵌图片管理
- **Zotero Connector**：兼容官方浏览器扩展，一键保存文献到当前 Vault

架构总览：[docs/architecture.md](docs/architecture.md)

## 论文单元

`papers/<id>/` 是最小论文单元（语义对象，不是普通文件夹）。内部约定：

```text
papers/<id>/
├── NOTES.md          # 人/Agent 笔记
├── <id>.pdf          # 主 PDF（可选）
├── PAPER.md          # 无 TeX 时的派生正文
├── source/           # TeX / e-print（不要往这里塞附件）
├── marks/            # 阅读标注
├── assets/           # NOTES 内嵌图
└── attachments/      # 支撑材料：补充 PDF、幻灯片、代码仓库
```

- 支撑材料**只**放 `{paper}/attachments/`，不要堆在论文根目录，也不要放进 `source/`。
- 不要预建空的 `attachments/`；有文件再创建。
- 文件树默认把论文当叶子。`attachments/` 非空时论文行才出 chevron，子项直接挂在论文下（不显示 `attachments` 桶本身，也不展开 `source/` / `marks/` 等内部文件）。
- `attachments/` 不是论文身份 marker。

布局细则：[docs/backend/data-model.md](docs/backend/data-model.md)；树交互：[docs/frontend/vault-tree.md](docs/frontend/vault-tree.md)。Vault 内 Agent 读的是盘上 `AGENTS.md`（创建时由 Host 模板写入）。

## 技术速览

| 层 | 技术栈 | 关键能力 | 入口 |
|---|---|---|---|
| 前端 | React 19、TypeScript、Tailwind CSS 4、shadcn/ui、AI Elements | zustand 按域状态管理、Plate Markdown 编辑器、EmbedPDF 渲染、Dockview 多面板工作区 | [docs/frontend/](docs/frontend/index.md) |
| Host | Rust、Tauri 2、feature-first 布局 | 文件系统与 Vault 树、Catalog SQLite、Wiki 双链索引、ACP Client、本地文件监听、可选 loopback MCP | [docs/backend/](docs/backend/index.md) |
| CLI | Rust、`agentero` bin | headless Vault/Catalog 操作、论文标签管理、BibTeX 导入导出 | [docs/backend/cli.md](docs/backend/cli.md) |

## 开发规则

- 优先做小而聚焦的改动，避免无关重构。
- 保持 local-first：不要引入私有存储作为事实来源。
- 高内聚、低耦合。
- 尽可能能复用能力，避免重复造轮子。
- 未经明确确认，不要覆盖用户手写的 Vault 文件。
- 在 UI 修改的过程中尽量少加入无关的、非必须的i18n 文案，如果能用icon表达，就不要加额外的描述 
- 修改完成后，把当次相关的改动按照 commit 部分的要求提交。=
- 编辑或生成 Markdown 时保留 Obsidian 兼容的双链文本（`[[...]]`）。
- UI 保持简约：图标按钮必须有可访问名称和 Tooltip；避免常驻解释文案。操作失败用 `notifyError` Toast，不在侧栏 header 挂常驻错误条。
- 国际化（i18n）：所有面向用户文案必须经 `t()` 走 `react-i18next`。en 源语言 → 同步 `zh-CN`（`src/i18n/locales/`）。详见 [docs/frontend/shell.md](docs/frontend/shell.md)。
- 修改后需同步更新相关文档，并检查 Roadmap 和 Todo。
- 如果修改了 Template 下的 Skill，需要对应更新版本号。

## Windows 注意事项

- **路径**：禁止手拼 `${vault}/${rel}`，统一走 `joinVaultPath` 并归一分隔符；混用 `/` `\` 在 `\\?\` 前缀下报 ERROR_INVALID_NAME（#181），拖入文件路径也要归一后再去重。
- **新窗口**：同步 `#[tauri::command]` 里 build WebviewWindow 会在 WebView2 嵌套消息循环死锁（白屏、关不掉），必须用 async command。
- **窗口装饰**：统一用原生 decorations；React 自绘标题栏按钮在 Settings 等子窗口拿不到 IPC 权限。
- **子进程/安装**：Windows 只走 npm/PowerShell 安装路径，Unix 脚本用 `cfg(not(windows))` gate；注意 `CREATE_NO_WINDOW` 与 `.exe` 命令名。
- **cfg 门控**：Cargo target cfg（如 `cfg(all(unix, ...))`）必须与代码侧 gate 对齐，否则 Windows release 编译失败。
- **UI 缩放**：Windows 125% 等非整数 DPR 会放大 px/rem 混用误差，对齐类样式用 rem。

## Commit

- 提交信息必须符合 [Conventional Commits](https://www.conventionalcommits.org/) 规范。
- 一次提交只做一件事，避免混合多个 unrelated changes。
- 如果有多个 unrelated changes，`git commit --only -m "msg" -- <path1> <path2>` 使用只提交指定路径的改动
- 项目级 Agent Skill：`.agents/skills/bump/SKILL.md` 定义版本升级流程；`.agents/skills/commit/SKILL.md` 定义按逻辑拆分当前改动并提交的流程。
- `bump` Skill 只修改版本来源文件并运行最小验证，默认不创建 commit、tag、Release 或 push；需要时由用户显式要求。
- `commit` Skill 必须保留用户已有改动，按目的精确暂存，检查相关文档，并只创建本地 Conventional Commit。
- 如果库当中有对应的 issue，则在提交信息中引用（如 `Fix #123`）；解决了该 issue 则关闭；部分解决则在 issue 区评论。
- 解决 Issue 之后，把解决的方法评论在 issue 中

## 常用命令

```bash
pnpm install
pnpm dev
pnpm tauri dev
pnpm build
pnpm lint
pnpm format
pnpm tauri build
```

```bash
# Headless CLI（仓库根 workspace）
cargo build -p agentero-cli
cargo run -p agentero-cli -- vault which --json
cargo test -p agentero-cli
```

完成实现前运行最小必要验证。UI 改动优先启动应用检查对应流程。

## 文档地图

| 分类 | 内容 | 路径 |
|---|---|---|
| **架构** | 整体架构、工作台布局、核心工作流、数据流 | [docs/architecture.md](docs/architecture.md) |
| **前端** | 壳、工作区、文件树、论文库、入库、Markdown、PDF、Agent、双链、翻译、设置 | [docs/frontend/](docs/frontend/index.md) |
| **后端** | 数据模型、Catalog、Vault、入库、Connector、Wiki、Agent、远程、搜索、日志、CLI、API | [docs/backend/](docs/backend/index.md) |
| **教程** | 快速上手、导入论文、阅读整理、接入 Agent、Zotero | [docs/usage/](docs/usage/index.md) |
| **开发** | 路线图、TODO、设计记录 | [docs/development/](docs/development/index.md) |
| **测试** | 测试策略、发布 Checklist | [docs/test/](docs/test/index.md) |
| **Bug 复盘** | 历史 Bug 分析（不删除） | [docs/bug_fix/](docs/bug_fix/) |

约定：已实现按功能写在 `docs/frontend/` / `docs/backend/`；未实现草稿在 `docs/development/`。
