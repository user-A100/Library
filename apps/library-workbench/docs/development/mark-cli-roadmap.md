# 阅读标注开放 CLI / Agent：开发路线

> 状态：M1–M3 主要能力已实现（引擎定位 + 高亮/批注/翻译 CLI），本文保留决策脉络。
> 实现说明见 [backend/cli.md](../backend/cli.md) 与 [frontend/pdf.md](../frontend/pdf.md)。关联 [\#170](https://github.com/poco-ai/Agentero/issues/170)。  
> 定位策略详情：[惰性](mark-locate-lazy.md) · [即时](mark-locate-eager.md)  
> 桌面安装包如何带上同版本 `agentero`：[CLI 文档](../backend/cli.md)（[\#165](https://github.com/poco-ai/Agentero/issues/165) / [\#166](https://github.com/poco-ai/Agentero/issues/166)）

## 1. 目标

把桌面端已有的 **翻译、划词结果、高亮、批注** 等阅读能力，**内置进 headless `agentero` CLI**（命令契约 + Vault 落盘），供脚本与对话框 Agent 调用；并用 **Skill** 约束正确用法（写什么、何时定位、不编坐标、不越权改 NOTES）。

Issue 原文诉求拆两层：

1. **CLI 契约**：翻译 / 高亮 / 批注等可被 `agentero … --json` 稳定读写。  
2. **Skill 契约**：对话框 Agent 能代劳高亮、在图/公式等位置批注、翻译、对话锚点——**对话仍走 BYOA**，CLI 只落盘与查库。

**非目标（首版）：** CLI 内 BYOA/ACP、改 PDF 二进制、默认冷启动全文解析每一条标注、手写 EmbedPDF `annotations.json` blob。

## 2. 与「内置桌面 CLI」的关系

| 议题 | Issue | 文档 | 和本篇的关系 |
|---|---|---|---|
| **命令能力**：mark / translate 等 | [#170](https://github.com/poco-ai/Agentero/issues/170) | **本文** | 在 `cli/` 实现子命令与 JSON 契约 |
| **分发形态**：安装包携带同版本 `agentero`、PATH、`open` | [#165](https://github.com/poco-ai/Agentero/issues/165) | [CLI 文档](../backend/cli.md) | #170 的命令随 **同一二进制** 交付；不另做一个「标注专用 CLI」 |
| **paper move 等既有契约** | [#166](https://github.com/poco-ai/Agentero/issues/166) | [CLI 文档](../backend/cli.md) | 标注命令与现有 Clap 解析、`--vault` / `--json` / `-y` 一致 |

原则：

- **一套 bin**：桌面内置的 `agentero` = headless CLI；用户装 App 后即可 `agentero mark …`（在 #165 落地后）。  
- **开发期**：仍可用 `cargo run -p agentero-cli -- …` 验收 #170，不阻塞分发工作。  
- **版本对齐**：mark/translate 的 schema 与桌面阅读器同一 tag 发布，避免「CLI 写出桌面不认的 mark」。  
- **不把 GUI 可执行文件当 CLI**（与 bundled-cli 一致）；定位用的 EmbedPDF 仍在桌面进程，CLI 默认只写 pending。

```text
桌面安装包
  ├── Agentero.app / GUI          ← 划词、EmbedPDF、惰性/即时定位
  └── agentero (headless CLI)     ← vault/paper/import/wiki + mark/translate（#170）
         同一 version / 同一 agentero_lib 领域逻辑
```

## 3. 现状摘要

| 能力 | 现状 |
|---|---|
| marks 落盘 | 前端写 `marks/*.json` 与 `annotations.json`；Host 无统一 marks command（`api.md` 曾规划 `reader:annotations`，未做） |
| CLI 命令组 | `vault` / `tree` / `paper` / `trash` / `import` / `export` / `config` / `wiki`；**无** `mark` / `translate` |
| CLI 与 marks | 仅 `paper get` → `assets.marksDir` 是否存在；skill 将 marks 列为 L2.5 **只读** |
| 文字 → 框 | 阅读器用 EmbedPDF `searchAllPages`（⌘F）；CLI 用 `features/pdf_locate` 直调 PDFium 文本引擎（同源），**已**接 mark 写入 |
| 翻译 Host | `translate_text` 已有；CLI `translate` 已暴露（仅免费引擎） |
| 图/公式 | 人框选 + 裁图已有；自动检测未做 |
| liteparse | 只产 `PAPER.md` 正文；页上定位由同一 PDFium 的文本 API 负责（`liteparse-pdfium`），不走 liteparse 的排版重建 |
| 分发 | CLI 现为独立 artifact；内置进桌面包见 [CLI 文档](../backend/cli.md) |

## 4. 方案选型（为何内置进 CLI 文件层）

实现「开放给 CLI」可以有多条路；**首版选定 A，定位用 C，翻译用 D，Skill 贯穿**。

| 方案 | 做法 | 首版 |
|---|---|---|
| **A. CLI 纯文件读写** | `mark` 读写 `papers/…/marks/*.json`，校验 schema；不跑 PDF 引擎 | **采用（基础）** |
| **B. Host command + CLI 薄封装** | `mark_list` / `mark_upsert` 进 `agentero_lib`，桌面与 CLI 共用 | 中长期；remote/iOS 写 marks 时再抽 |
| **C. quote → 几何** | 惰性打开再算 + 可选即时；见两篇定位文档 | **采用（上层）** |
| **D. 翻译进 CLI** | 复用免费 MT；不跑 BYOA | **采用（上层）** |
| **E. ask / agent-trace** | CLI 可写 ask 壳；对话与裁图仍在 GUI/Agent | 部分；trace 后置 |
| **F. 仅 Skill 直写文件** | Agent `write` JSON，无 CLI | 仅原型；正式交付必须 A |

### 4.1 架构（内置命令面）

```text
┌─────────────┐     ┌──────────────────┐     ┌──────────────────────────┐
│ 对话框 Agent│────►│ Skill            │────►│ agentero CLI（内置命令）  │
│ (BYOA/ACP)  │     │ agentero-cli /   │     │ mark · translate · …     │
└─────────────┘     │ paper-annotate   │     │ --json / --vault / -y    │
       │            └──────────────────┘     └────────────┬─────────────┘
       │ 对话/精读（不经 CLI）                           │ 写 marks/
       ▼                                                 ▼
  ACP session                              papers/<id>/marks/*.json
                                           (+ 打开 PDF 时引擎补 rects)
                                                    ▲
  桌面 PDF 划词 ────────────────────────────────────┘
  （annotations.json / 针 / 翻译 UI）
```

### 4.2 落盘与双轨

| 存储 | 谁写 | CLI 是否写 |
|---|---|---|
| `marks/<id>.json`（highlight / translate / ask / …） | 桌面 + **CLI** | **是**（权威语义 mark） |
| `marks/annotations.json`（EmbedPDF 传输 blob） | 桌面划词 runtime + **CLI** | **是**（决策修订：见 §9；按 id 去重 + 原子写，阅读器监听外部变更增量导入） |
| `marks/assets/*.png`（视觉批注） | 桌面裁图 | 首版否 |
| PDF 二进制 / `NOTES.md` | 既有规则 | 不因 mark 改写 PDF；不强制刷 NOTES |

### 4.3 硬边界（CLI 内置能力边界）

| 做 | 不做 |
|---|---|
| Vault 相对路径 + catalog 解析 paper | 在 CLI 内启动 ACP / 填模型 Key |
| `--json` 机器可读 | 交互式 PDF 渲染 |
| 写 per-id mark、列目录 | 默认每次 add 冷启动扒 PDF |
| 免费 MT 文本翻译（上层） | BYOA Agent 翻译经 CLI |
| 与 `wiki check`、`[[@id]]` 兼容的 id | 伪造 id、手写 0–1 坐标充 resolved |

### 4.4 目标命令面（内置到 `agentero` 后）

在现有命令组旁增加（实现时写入 [backend/cli.md](../backend/cli.md)）：

| 组 | 用途 | 阶段 |
|---|---|---|
| `mark` | list / get / add / update / delete 阅读标注 | M1 |
| `translate` | 纯文本免费 MT（可选写入 translate mark） | M3 |
| `mark add --resolve` | 显式 headless 定位（可选） | M4 |

示例：

```bash
# 与现有全局参数一致
agentero --vault ~/research mark list papers/1706.03762 --json
agentero mark add papers/1706.03762 \
  --kind highlight \
  --quote "Attention is all you need" \
  --page 3 \
  --comment "核心贡献" \
  --color yellow \
  --json

agentero translate "Hello world" --to zh --json
agentero mark add papers/… --kind translate --quote "…" --result "…" --json
```

全局约定不变：`--vault` → `AGENTERO_VAULT` → cwd 上溯 → config `default_vault`；破坏性操作 `-y`。

### 4.5 总体实施策略

```text
基础能力（mark 文件契约 + CLI 内置子命令）
    → 定位（默认惰性；可读时即时）
        → 上层能力（翻译 / 显示 / 对话锚点 / 可选 headless）
            → Skill（教 Agent 组合使用）
                → 随 [CLI 文档](../backend/cli.md) 进桌面安装包
```

定位策略：**能即时则即时，否则 pending + 打开再算**（见两篇定位设计）。  
默认 CLI **不**为每次 `mark add` 冷读 PDF。

---

## 5. 阶段一：基础能力

目标：把 **mark CRUD 内置进 `agentero` CLI**；Agent/脚本能稳定读写标注内容，位置可后补；不依赖新 PDF 算法即可交付价值。

### 5.1 Schema 与共享校验

| 项 | 说明 |
|---|---|
| 统一 per-id mark 字段 | `version` / `kind` / `id` / `paperPath` / 时间戳 / `quote` / `page?` / `rects` / `comment?` / `color?` |
| `geometry` | `pending` \| `resolved` \| `failed`（见 [惰性](mark-locate-lazy.md)） |
| 实现位置 | 优先可被 CLI 使用的校验（TS 权威则 CLI 先窄实现 JSON 契约 + 集成测试；中长期 `agentero_lib` 共享，便于桌面内置 CLI 与 Host 同逻辑） |
| 双轨约定 | CLI/Agent **只写** per-id `marks/<id>.json`；**不**手写 EmbedPDF `annotations.json` |

### 5.2 CLI：`mark` 命令组（内置子命令）

建议契约（名称可微调，需 `--json`）：

```bash
agentero mark list   <paper> [--kind highlight|translate|ask|…] --json
agentero mark get    <paper> <id> --json
agentero mark add    <paper> --kind highlight --quote "…" [--page N] [--comment …] [--color …] --json
agentero mark update <paper> <id> [--comment …] [--color …] --json
agentero mark delete <paper> <id> -y --json
```

| 规则 | 说明 |
|---|---|
| 默认 `geometry` | 无 rects 时 `pending` |
| 解析 paper | 与 `paper get` 相同 path/id |
| 不调用 EmbedPDF | 基础阶段零 PDF 引擎依赖 |
| 破坏性删除 | `-y` / `--yes` 与现有 CLI 一致 |
| 模块位置 | `cli/src/commands/mark.rs`（或等价），挂入 `commands/mod.rs` 与 clap 根命令 |

### 5.3 只读增强（可选但便宜）

- `paper get` / `paths` 已暴露 `marksDir`：可增加 `mark list` 摘要计数。
- `wiki check` 对 `@id` 仍可不打开 marks 验存在（保持现状）；文档写清。

### 5.4 基础阶段验收

- [ ] 无 GUI 下 `mark add` → 磁盘 JSON 合法。
- [ ] `list` / `get` / `delete` 往返与错误码稳定。
- [ ] 桌面打开同一 paper 不崩溃；pending 至少出现在可扩展的列表数据源（UI 可简陋）。
- [ ] 不覆盖用户 `NOTES.md`；不碰 PDF 二进制。
- [ ] 与现有全局 flag（`--vault` / `--json` / `-y`）行为一致，便于日后打进桌面安装包。

### 5.5 基础阶段明确不做

- 页上自动黄底、headless `--resolve`、图公式检测、CLI 翻译。
- 不在本阶段改 release 打包（打包见 [CLI 文档](../backend/cli.md)）。

---

## 6. 阶段二：上层能力

在基础读写之上，接 **引擎定位、翻译、显示与对话锚点**。

### 6.1 文字定位（核心上层）

| 优先级 | 项 | 文档 |
|---|---|---|
| P0 | **惰性 hydrate**：PDF doc ready → `searchAllPages` → 写回 rects | [mark-locate-lazy.md](mark-locate-lazy.md) |
| P1 | **Viewer 即时**：PDF 已打开时 add 直接 resolved | [mark-locate-eager.md](mark-locate-eager.md) §B1 |
| P2 | **Headless `--resolve`**（可选，可进同一 CLI 二进制） | [mark-locate-eager.md](mark-locate-eager.md) §B2 |
| — | liteparse 继续只服务 `PAPER.md` | 不混入定位主路径 |

匹配策略最小集：单命中采用；多命中 + page 过滤；零命中 `failed`；quote 去重与打开时限流。

### 6.2 显示与高亮投影

| 优先级 | 项 |
|---|---|
| P0 | resolved → 跳页 + 页边针 + 批注/标注列表 |
| P1 | 投影到 EmbedPDF HIGHLIGHT（`annotations.json`），接近人手划词 |
| P2 | failed/pending 的安静 UI 状态（避免 Toast 风暴） |

### 6.3 翻译（内置 `translate` 命令）

| 优先级 | 项 |
|---|---|
| P0 | CLI `translate` 文本：复用 Host 免费 MT 逻辑（抽到 lib，供 Host command 与 CLI 共用） |
| P1 | `mark add --kind translate` + `result`；可选打开后按 quote 钉位置（同定位管线） |
| — | **不做** CLI 内 BYOA Agent 翻译 |

### 6.4 提问 / 对话锚点

| 优先级 | 项 |
|---|---|
| P1 | 可写 `kind: ask` 壳（quote/page/pending）；答案仍由对话框 Agent 产生 |
| P1 | Skill：把已有 mark 的 quote 作为对话上下文，而非 CLI 起 session |
| P2 | 与「加入对话」chip 模型对齐（桌面） |

### 6.5 图 / 公式（侧栏索引路径 — 已部分落地）

| 优先级 | 项 | 状态 |
|---|---|---|
| P0 | 写出 `source/layout-index.json`（与侧栏同源） | **已实现**（layout 分析 merge 后） |
| P0 | CLI `layout list\|get` + `mark add --region` | **已实现** |
| P1 | Skill 教 Agent：`layout list` → `mark add --region` | **已改 agentero-cli v2** |
| P2 | 桌面打开时对 `layoutRef` mark 稳定出针/黄底 | 依赖现有 rects；可再打磨 |
| P3 | 自动裁图 + `agent-trace` | 仍后置 |

### 6.6 上层验收（P0 集合）

- [ ] pending mark 在打开可复制文字 PDF 后变为 resolved，可跳页出针。
- [ ] 错误 quote → failed，内容保留。
- [ ] （若做）`translate` CLI 返回译文且可落 translate mark。
- [ ] 已打开 PDF 时即时 add 可不经二次打开即有框（P1）。

---

## 7. 阶段三：Skill 开发路线

Skill 是 **约定与工作流**，不是第二套业务逻辑。实现顺序应 **跟在基础 CLI 之后**，并随定位/翻译能力增量改版。

### 7.1 改现有 `agentero-cli` skill

路径：`templates/vault/.agents/skills/agentero-cli/SKILL.md`（及种子升级策略）。

| 版本 | 内容 |
|---|---|
| S0（对齐阶段一） | L2.5 从只读改为：可用 `mark list/get/add/…`；禁止编造 rects；默认 pending |
| S1（对齐定位 P0） | 说明「打开 PDF 后自动补位置」；教写独特 quote、可选 page |
| S2 | `translate` 命令与 translate mark；与划词翻译语义一致 |
| S3 | 与 `wiki check`、`[[@id]]` 互链写法；仍不伪造 id |
| S4 | 若桌面已内置 CLI：说明 PATH / `agentero` 发现方式（与 [CLI 文档](../backend/cli.md) 用户文档对齐） |

Hard boundaries 保持：

- 不调用 CLI 起 ACP。
- 不强制覆盖用户 NOTES。
- 渐进披露 L0→L4 不变；marks 仍在 NOTES 之后、全文之前。
- 二进制缺失时：回退读 Vault 文件，不编造 catalog / mark id。

### 7.2 新增（建议）`paper-annotate` skill

当工作流超过「命令表」时，独立 skill 更清晰：

| 节 | 内容 |
|---|---|
| When to use | 「帮我标黄」「批注这句」「钉翻译」「记下要问的点」 |
| When not | 长文精读讲义 → `paper-reader`；库管理 → `agentero-cli` |
| Protocol | `paper get` → 读 NOTES/PAPER → 选定 quote → `mark add` → 告知用户打开 PDF 可见框 |
| 已打开 PDF | 预期即时 resolved（若产品已实现） |
| 图/公式 | 只写文字锚 + 请用户框选；不假装自动识图 |
| 对话 | 在 BYOA 对话内继续；可用 mark id / quote 作引用 |

安装：Vault 种子模板 + 现有 skill 播种/升级机制（注意用户改过的 skill 不覆盖，见 skill 升级策略）。

### 7.3 Skill 验收

- [ ] 新 Vault 种子含更新后的 skill 文案。
- [ ] 文档站 / usage 有一句「Agent 可经 CLI 写阅读标注」。
- [ ] 人工走通：对话里让 Agent 标一句 → 磁盘有 mark → 打开 PDF 有针/框（在定位 P0 完成后）。

### 7.4 Skill 明确不写进模型的事

- 不要教 Agent 直接 patch `annotations.json` EmbedPDF 传输格式。
- 不要教 Agent 手算 0–1 坐标。
- 不要教用 CLI 替代对话框跑多轮论文 Agent。

---

## 8. 里程碑与依赖

```text
M1 基础
  schema + mark CLI 内置子命令
  agentero-cli skill S0
       │
       ▼
M2 定位 P0
  惰性 hydrate + 针/跳页
  skill S1
       │
       ├──────────────┐
       ▼              ▼
M3a 显示/翻译     M3b Viewer 即时 B1
  黄底投影 P1       skill 注明「边读边标」
  translate 内置 CLI
       │
       ▼
M4 可选
  headless --resolve
  paper-annotate skill
  图/公式粗锚
       │
       ▼
分发（可并行，不阻塞 M1）
  桌面安装包内置同版本 agentero  ← bundled-cli / #165
  用户 PATH 上只有一个 agentero，含 mark/translate
```

| 里程碑 | 依赖 | 用户可感知结果 |
|---|---|---|
| M1 | 无引擎 | 脚本/Agent 能写标注文件 |
| M2 | EmbedPDF 搜索已存在 | 打开 PDF 后框/针出现 |
| M3 | M2 | 更像人手划词；CLI 能翻译 |
| M4 | 按需 | 无 GUI 也可 resolve；专项 skill |
| 分发 | [CLI 文档](../backend/cli.md) | 装 App 即得含 mark 的 `agentero` |

#165 与 #170 **可并行**：先合入 `mark` 命令到 `cli/`，再由 release 把该二进制打进安装包。

## 9. 性能与默认行为（决策冻结）

| 决策 | 选择 | 备注 |
|---|---|---|
| CLI `mark add` 默认 | **即时定位**（PDFium 文本引擎） | 修订自「默认 pending」：`liteparse-pdfium` 已在依赖树里，进程内即可用引擎，Agent 一条命令就得到可见标注 |
| 定位实现 | `features/pdf_locate` 直调 `FPDFText_*`，隔离 worker + 30s 超时 | 与阅读器 `searchInPage` 同一 PDFium |
| 高亮落盘 | **CLI 直接写 `annotations.json`** | 修订自「CLI 不写 annotations.json」：黄底的唯一真源就是该文件；阅读器加了外部变更增量导入以避免覆盖 |
| 批注 | = highlight 的 `contents`，不新增 kind | 与桌面划词评论同一模型 |
| 定位失败 | 报 `mark_locate_failed`，**不落盘** | 修订自「保留内容 + geometry=failed」：translate/highlight schema 都要求 rects，无坐标的 mark 前端读不出 |
| 打开 PDF | 惰性 hydrate 仅用于历史 pending mark | 新写入不再产生 pending |
| liteparse | 正文 only，不参与画框 | 未变（画框走 PDFium 文本 API，不走 liteparse 排版） |
| 分发 | 与 GUI **同版本单二进制** headless CLI，不另发「标注工具」 | 未变 |

原始取舍与性能对比见两篇定位文档；上表为落地后的实际选择。

## 10. 测试计划（最小）

| 层 | 内容 |
|---|---|
| CLI 集成测 | add/list/get/delete；非法 quote；paper 解析 |
| 前端单测 | geometry 解析；命中策略纯函数（多命中/page 过滤） |
| 手动 / E2E | 写入 pending → 打开样例 PDF → resolved；错误句 failed |
| 回归 | 人手划词、⌘F、既有 ask/translate 针不受损 |
| 分发（#165） | 安装包内 CLI 版本与 App 一致，且 `agentero mark --help` 可用 |

## 11. 文档同步清单（实现时）

实现落地后迁移/更新：

| 文档 | 动作 |
|---|---|
| [backend/cli.md](../backend/cli.md) | 增加 `mark` / `translate` 命令组与示例 |
| [frontend/pdf.md](../frontend/pdf.md) | hydrate / geometry 行为 |
| [backend/data-model.md](../backend/data-model.md) | geometry 字段 |
| [backend/api.md](../backend/api.md) | 若增加 Host command |
| [CLI 文档](../backend/cli.md) | 验收列表含 mark/translate 子命令 |
| usage 阅读整理 | Agent 标注一句流程 |
| 本目录三篇草案 | 完成后改为「已实现」或移入 frontend/backend 并改 index |

## 12. 相关链接

- Issue [\#170](https://github.com/poco-ai/Agentero/issues/170)（标注开放 CLI + Skill）
- Issue [\#165](https://github.com/poco-ai/Agentero/issues/165) / [\#166](https://github.com/poco-ai/Agentero/issues/166)（内置桌面 CLI / paper move）
- [内置桌面 CLI 设计](../backend/cli.md)
- [惰性定位设计](mark-locate-lazy.md)
- [即时定位设计](mark-locate-eager.md)
- [既有 CLI 说明](../backend/cli.md)
- agentero-cli skill 模板：`templates/vault/.agents/skills/agentero-cli/SKILL.md`（仓库内种子，非文档站页面）
