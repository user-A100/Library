# 论文库 Library

中间栏 catalog 表格；数据一次 `paper_list` 进内存。

## 视图

- 虚拟路径 `agentero:library`（不写盘）。
- **全库**：点 Library 节点或关光文档后默认页。
- **文件夹作用域**：单击 `papers/` 下非 paper 叶目录（如 `papers/nlp`）→ 同一 Library panel 上按 `paper.path` **前缀过滤**（不新开 tab、不重新 RPC）。
- **非 papers 目录**（`notes/`、`.agents/`、`plans/` 等）：不进入文件夹作用域，Library 显示全库（#160）。
- 外部 CLI / 同步工具改动 `.agentero/catalog.sqlite` 或 `papers/` 结构时，前端会后台去抖重新 `paper_list`，同步 Library 表格与文件树论文标题。
- NOTES 仅选中**具体论文**时出现；Paper Info 保留最近选中的论文，切换到非论文文档时仍显示。

## 表格能力

| 能力 | 说明 |
|---|---|
| 排序 | 表头点击；排序/标签筛选变化时行区 150ms 淡入提示重排（搜索键入不触发） |
| 列 | 表头右键选列 / 拖拽排序；顺序+显隐持久化 `libraryColumns`；标题列不可隐藏 |
| 滚动 | 横向 + 纵向 |
| tags | 染色 chip；搜索框匹配用户标签子串；`@zotero:` / `@arxiv:` 内部标签不显示 |
| 阅读热力 | 标题列左侧显示该论文阅读进度热力条；基于 `marks/` 中逐页标注与阅读位置聚合。激活 Library 时经 `paper_reading_activity_batch` 一次批量 IPC 刷新全部活动点（缓存保温，不再逐论文 3 次 IPC）；PDF 页数走 catalog `pdf_page_counts` 缓存，缺缓存时仅对可视行懒加载并回写 |
| Rescan | `paper_rescan`：盘上有、catalog 无则补齐 |
| 行右键 | 打开 / 编辑元数据（远程 Vault 隐藏编辑项）/ 添加到对话 / 在 Finder 中显示（仅本地）/ 删除→回收站；单击复制、双击打开保持不变 |
| Download | 库内任一篇缺资源时批量补下 |
| 导入/导出 | Library 工具栏；导出 BibTeX 亦可在 Library 节点右键 |
| 发现引用 | Library 节点右键「发现引用我的新论文」→ 后台扫描全库反向引用 → 候选清单勾选入库；见 [../backend/citation-parsing.md](../backend/citation-parsing.md) §7 |
| 拖入 PDF | Finder / 其它 App 把一个或多个 PDF 拖到 Library 表：虚线 overlay（仅 PDF），松手后走与文件树相同的 metadata 确认框。文件夹作用域导入到当前 `papers/…`；全库则落到树选中的 Papers 夹（否则 `papers/`）。非 PDF 不显示 overlay、不入库 |

## Tags（前端）

- Paper Info 增删 + Apple 8 色色盘 → `paper_set_tags`。
- 配置 EasyScholar Key 后，Library 表头 Tags 列的筛选按钮左侧显示奖牌图标，点击后会为当前 Library 范围内的全部论文拉取期刊分区、影响因子、JCI 等数据并生成 `#easyscholar:` 命名空间标签；重复获取会替换该命名空间标签，不影响用户普通标签。
- `@zotero:` 前缀标签属于 Connector 来源标记，只保留在 catalog 中，不参与展示、搜索和筛选；编辑普通标签时会保留这些内部标签。
- arXiv 入库带来的学科分类（如 `Computer Science - Machine Learning`）以 `@arxiv:` 前缀保存为隐标签，同样不参与展示、搜索和筛选；已入库、尚未加前缀的同形标签也按隐标签处理。
- 标签类型与语义（normalize / coerce / 可见性）：`src/lib/paper/tags.ts`（类型在 `src/lib/paper/types.ts`）；色板映射：`src/lib/ui/tag-colors.ts`。
- CLI 标签见 [../backend/catalog.md](../backend/catalog.md)。

## 编辑元数据

误识别/缺失的论文元数据可手动修正，三个入口共享同一对话框（`edit-paper-meta-dialog.tsx`，挂在 `app-dialogs.tsx`，经 `libraryStore.editMetaDraft` 打开）：

- Paper Info 面板头部铅笔按钮；
- Library 表格行右键"编辑元数据"；
- 文件树论文行右键"编辑元数据"。

核心字段（标题/作者/年份/DOI/arXiv/期刊）直接展示，卷期页、出版社、摘要、URL 折叠在"更多字段"。作者每行一位；仅提交变更字段（patch）→ `paper_update_meta` → 返回行原地同步 Library 表与所有打开 tab（`paperMetaChange`）。远程 Vault 暂不支持，入口隐藏。后端语义见 [../backend/catalog.md](../backend/catalog.md)。

DOI 旁有 **刷新** 按钮：按当前 DOI（或 arXiv ID）拉取权威元数据（`paper_resolve_identifier` → Translator/Crossref/arXiv Atom，再用 S2 `publicationVenue` 补期刊/会议名），只填充表单供确认，保存仍走 patch。venue 源优先级见 [../backend/academic-search-apis.md](../backend/academic-search-apis.md) §2.5。

## 导入 PDF 识别

拖入/魔棒导入 PDF 直接进入后台导入任务，无确认对话框；识别链路（liteparse probe → Zotero recognizer → 标识符解析，见 [../backend/paper-import.md](../backend/paper-import.md)）在导入任务内自动补全：

- 识别成功自动填充 标题/作者/年份/DOI/arXiv ID，文件夹 id 按 arXiv ID → DOI slug → 文件名 slug 自动派生；
- 识别失败静默回退文件名派生元数据，用户在 Edit Metadata 中修正（DOI 旁刷新按钮拉取权威元数据）。

## 代码

- UI：`src/components/library/`（拖入：`library-pdf-drop-surface.tsx`）
- 状态：`src/lib/paper/library-store.ts`、`library-actions.ts`、`import-actions.ts`（`dropLocalPdfs`）
- 单测：`test/library-scope.test.ts`、`test/prompt-image.test.ts`（`dataTransferLooksLikePdfs`）
