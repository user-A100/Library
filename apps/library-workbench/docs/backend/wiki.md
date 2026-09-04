# 双链与图谱索引

从 Vault 内 Markdown 解析 Obsidian 兼容 `[[wikilinks]]`，构建入/出链与 Graph；**不**使用手工图数据库。

## 模型

- 格式：`[[Concept]]`、`[[papers/…/NOTES]]`、`[[note#heading]]`、`[[note#outer#inner#leaf]]`、`[[note#^block]]`；标题路径没有层数限制。
- Frontmatter `aliases`（`aliases: [A, B]` 或 block list）写入 `WikiDocument.aliases`；搜索可按别名命中，resolve 在路径/stem 之后按唯一 alias 解析，多命中为 `ambiguous`。
- `features/wiki/frontmatter.rs` 同时提供 Doctor 使用的字节保留型 aliases 检查/patch；复杂 YAML 仍可作为 Markdown 读取，但不会被自动重写。
- 标题 fragment 以 `LinkFragment::Heading { path: Vec<String> }` 保存 Markdown 实际写下的完整路径或连续后缀。完整 heading path 是 canonical identity；任意长度的路径后缀仅在唯一命中时解析成功。
- **单向写入** Markdown + 索引反查（不做目标文件自动插回链）。
- 未解析目标可为 stub 节点。
- 与 **文献引用解析**（References 下方卡片 / `paper_refs_list`，见 [citation-parsing.md](citation-parsing.md)）分层，边语义不复用；双链索引不驱动关系图。
- `PAPER.md` 是派生全文：保留 document 与 heading anchors 供其它笔记链接，但不提取其 outgoing occurrences，避免 LiteParse 生成的裸域名和参考文献污染双链诊断。

## Host 能力

- 语义解析：文件、标题、block
- 标题候选：展示 canonical `outer › inner` 路径，`insert_text` 写完整 `target#outer#inner`；查询中的 `#` 与 `›` 会归一到同一路径分隔语义
- 逐级补全：尾部 `#` 保留层级状态，已确认路径按 canonical ancestor path 的后缀匹配，候选只返回其直接子标题；可连续输入任意多个层级
- 反链 / 出链查询
- `graph_get_graph` 等（双链 nodes / edges / center / depth，供索引/调试）— 见 [api.md](api.md)
- 嵌入目标解析（供前端 `![[...]]`）
- 链接感知重命名/移动；标题重命名事务
- 索引：`.md` 变更防抖重建（前端调度 + Host 重建）
- 只读语义检查：`WikiIndex::check_links` 按全库、Markdown 文件或目录返回状态计数与问题 occurrence；CLI 暴露为 `agentero wiki check [<source>] --json`

解析、resolve、嵌入投影、前端导航与显式标题重命名共享“唯一连续后缀”规则。完整路径自然也是自身后缀；不存在或有歧义的 path 保持既有 `invalidFragment` / `ambiguous` 结果，不回退到任意同名叶标题。标题重命名根据已解析的 canonical path 计算后缀在完整路径中的偏移，只改写引用实际包含的被改名段。

## 重建与缓存

`WikiIndex::rebuild` 是增量流水线，语义与全量重建等价：

- **指纹热路径**：每次 rebuild 先 walk + stat 出全库 `(path, size, mtime)` 指纹。若与内存中上一次构建完全一致，直接返回上次结果；若部分变化，仅重读变更文件，未变文件复用内存中的解析产物（documents + occurrences）。rename 事务前后的两次 rebuild 因此在生产中都是廉价的新鲜度检查。
- **Resolve 查找表**：`resolve.rs::DocumentLookup` 按精确路径 / ASCII 小写路径 / 路径段后缀 / stem / alias 预分桶，把逐 occurrence 的线性扫描（O(E×D)）降到哈希查找（≈O(E)），解析优先级与线性实现逐字节等价（有对照测试）。
- **快照只存解析产物**：`.sqlite` 缓存（schema v3）按文件粒度存 documents 与 occurrences（`(source, ordinal)` 主键），行级 SHA-256 校验替代整份 JSON 快照哈希。resolve 结果**不**入库——加载时对完整文档集重跑解析，因此“别的文件改变了某条链接的解析结果”不会让缓存变脏。
- **增量写盘**：磁盘缓存与内存快照同步时，持久化只 upsert/delete 变更文件的行；缓存缺失、schema/parser 版本不符或上次写盘失败则整体重写。

## 只读完整性检查

`agentero wiki check` 每次先构建或校验 Wiki snapshot，再从解析后的 occurrence 生成报告。它不会新建缺失目标、替用户选择歧义候选或修改 stale fragment。

```text
agentero wiki check [Vault 相对文件或目录] --json
  → WikiIndex rebuild / cache validation
  → check_links(scope)
  → resolved / missing / ambiguous / invalidFragment
  → 有问题时 wikilink_check_failed + error.details
```

单文件作用域用于 paper-reader 的写后验收；全库或目录作用域用于 vault-normalizer 的迁移前后对比。CLI 缺失时 Skill 必须明确报告未完成语义校验，不能用 regex 扫描冒充与 Agentero resolver 等价。

## 数据流（简）

```text
Vault Markdown 变更
  → 防抖 scheduleWikiRebuild
  → Host 解析 wikilink
  → 前端状态栏反链刷新，或 CLI 只读诊断
```

## 代码

`src-tauri/src/features/wiki/`  
前端 UI：[../frontend/wiki.md](../frontend/wiki.md)

## 批注 fragment

- `LinkFragment::Annotation { id }`：`[[target@id]]` sugar 与 `[[target#@id]]` 等价；id 允许 nanoid `_` 与 UUID `-`（Markdown 转义的 `\_` 在解析时规范化）。
- 解析时不把 annotation id 当 Markdown heading/block；**target 仍走普通文件 resolve**（路径 / 文件名），成功后再由前端按 id 打开 paper PDF 并 `scrollToHighlight` / `scrollToVisualTrace`。
- `![[…@id]]` 的 `contentKind` 为 `annotation`：Host 只确认 fragment 类型，**quote / 裁剪 / 对话** 由前端读 `marks/annotations.json` 或 `marks/<id>.json` 投影。
- `wiki check` / 索引：对 annotation 报告 path 级 `resolved|missing|ambiguous` 与 id 形态 `invalidFragment`；**不**打开 marks 验证 id 存活。
