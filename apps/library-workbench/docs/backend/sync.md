# 云同步（S3）

多设备间同步整个 Vault 到 S3 兼容对象存储（AWS S3 / R2 / MinIO / OSS / BOS 等）。设计草稿与分期：[../development/cloud-sync-s3.md](../development/cloud-sync-s3.md)。当前已落地 Phase 0–1 与 Phase 2 的自动同步（状态栏指示、GC、multipart 除外）。

设置页顶部提供常见 S3 兼容服务商的官方配置入口。当前同步引擎只接收 S3 API 的 endpoint / bucket / access key / secret key；Azure Blob、百度网盘、坚果云等非 S3 凭据模型不能直接作为后端接入。

## 模块

`src-tauri/src/features/sync/`（desktop-only）：

| 文件 | 职责 |
|---|---|
| `config.rs` | 凭据存 XDG `agentero/sync.json`（按 Vault 路径分键，0600）；`secretKey` 出站掩码 / 回传掩码保留旧值（同 translate API key 先例）；`conditionalWrites` 持久化连接测试的条件写探测结果；`scope` 同步范围（见下） |
| `s3.rs` | 最小 S3 客户端：GET / 条件 PUT（`If-Match` / `If-None-Match`）/ DELETE / ListObjectsV2，reqwest + 手写 SigV4（HMAC-SHA256 自实现，RFC 4231 向量测试）；条件写探测与降级（见下） |
| `snapshot.rs` | Vault 扫描 → `Manifest`（relPath → sha256/size/mtime）；`size+mtime` 未变复用 base 哈希；忽略 `.agentero` `.git` `node_modules` `.DS_Store` `*.tmp`；`SyncScope` 与分类谓词（见「同步范围」） |
| `local.rs` | `.agentero/vault.json`（Vault UUID）、`.agentero/sync/{base,state}.json`（watcher 忽略 `.agentero/`，无事件回环） |
| `engine.rs` | 三方合并 + 应用 + 发布（见下） |
| `commands.rs` | `sync_get_status` / `sync_configure` / `sync_disconnect` / `sync_now` / `sync_scope_sizes`（本地各附件分类体积，供设置页展示）；广播 `sync:state` / `sync:progress` 事件 |
| `scheduler.rs` | 自动同步：每 Vault 一个后台任务——启动时同步一次、改动静置 30s 后同步、按 `intervalMinutes`（15/30/60）定时兜底；退出时尽力推送（每 Vault 限 5s） |

## Remote 布局与一次同步

```text
<prefix>/vault.json                  { vaultId, formatVersion, encryption }
<prefix>/HEAD                        { version, manifestKey, updatedAt } ← 唯一可变对象，CAS 推进
<prefix>/manifests/<v>-<nonce>.json.gz
<prefix>/blobs/<aa>/<sha256>         gzip(内容)，内容寻址天然去重
```

一次 `sync_now`：扫描 → GET HEAD/manifest → 与本地 base（上次同步清单）三方合并 → 应用远端改动（临时文件 + rename 原子落盘，blob 校验 sha256）→ 上传新 blob（`If-None-Match: *`，跨设备重复上传为廉价 no-op）→ 发布新 manifest → `If-Match` CAS 推进 HEAD。CAS 失败（他端并发推进）则以对方 manifest 为新 base 重跑，最多 5 次。

合并规则：单侧改动直接采纳；双侧同改 `*.md` 保留 mtime 较新者、较旧者存为 `<name> (conflict <时间).md`；其余文件（sidecar/marks/二进制）按 mtime LWW；删除 vs 修改保留修改。

## 同步范围（Sync Scope）

论文库中体积大且**可再生**的附件可以按设备排除，节省云端空间；笔记、`metadata.json` sidecar、`marks/`、`assets/` 永远同步（小且不可再生）。

- **分类**（`snapshot.rs` `scope_category`，仅识别约定论文布局）：
  - `pdf` — `papers/<id>/<id>.pdf`（论文根级 PDF；`source/`、`attachments/` 内的 PDF 跟随所在分类）
  - `source` — `papers/<id>/source/`（LaTeX / e-print）
  - `attachments` — `papers/<id>/attachments/`（支撑材料）
- **对称过滤**：同一谓词同时作用于本地扫描、base 与远端 manifest——被过滤的文件「双向失明」：不上传、不下载，也**绝不因缺失而被当作删除**。
- **manifest 携带 scope**：发布端把自己过滤掉的分类写进 manifest（`scope` 字段，全量同步时省略）。合并时：远端失明的路径不触发 `delete_local`，本地仍可见该分类时以本地条目为准并继续上传，否则携带 base 条目供其他设备可见；本地失明的路径完全惰性（不下载、不传播删除）。
- **边界**：所有设备都过滤某分类时，该分类条目会从 manifest 消失（blob 仍在，待孤儿 GC）；重新启用后本地仍有文件则自动重新上传，本地没有则需从来源重取。
- **重取**：PDF/TeX 可从 `metadata.json` 的来源字段（arXiv ID / DOI / `pdf_url`）重新下载——`paper_download_assets` 命令（库表格右键「从来源下载 PDF」、打开论文时自动补下均走此路径）。库列表的 `has_pdf` 由 `paper_list` 经 CapsCache 投影。
- **配置**：`SyncBackendConfig.scope`（缺省全量，兼容旧配置）；设置页以「同步范围」小标题分组展示逐类开关（附本地体积 `sync_scope_sizes`），默认全部开启。

## 条件写降级（OSS 等后端）

阿里云 OSS 的 PutObject 不支持任何条件请求头（`If-Match` / `If-None-Match` 等，带则返回 `400 NotImplemented`），S3 / R2 / MinIO 均支持。处理：

- **连接测试探测**：`sync_configure` 在 ListObjects 之后用一次性 key（`.sync-probe-<uuid>`）带 `If-None-Match: *` 试写并删除；`400 NotImplemented` → `conditionalWrites=false` 持久化到 `sync.json`，探测无结论时按支持处理（fail open）。
- **命令面**：当前没有独立 `sync_probe`；配置保存即执行连接探测，失败则不保存，成功后设置页按已连接展示。
- **运行时兜底**：旧配置未探测过时，首个条件 PUT 收到 `400 NotImplemented` 即在客户端内标记并立即以无条件 PUT 重试，同一 pass 内后续写入全部降级。
- **降级语义**：blobs / manifests 内容寻址或 key 唯一，无条件 PUT 幂等无害；HEAD 指针退化为 GET → PUT，牺牲严格 CAS，靠三方合并与重试收敛（单用户场景最终一致）。设置页对 `conditionalWrites=false` 显示一行小字提示。

## 身份与 Catalog 联动

- `vault.json`（远端）与 `.agentero/vault.json`（本地）配对：从未同步过的 Vault 可加入既有 remote（采纳其 id）；有同步历史的 Vault 拒绝外来 remote。
- 论文权威字段已 sidecar 化：每次 `upsert_paper` 同步投影到 `papers/<id>/metadata.json`；`paper_rescan` 优先从 sidecar 恢复（sidecar 较新则回灌 DB）。因此同步只处理普通文件，`catalog.sqlite` 不出 Vault；拉取后引擎自动 `rebuild_from_disk` + `prune_missing`。

## 前端

设置窗口「同步」pane：`src/components/settings/panes/sync-pane.tsx`；命令封装 `src/lib/sync/api.ts`。仅本地 Vault 可配置（`remote:` 句柄显示提示）。标题旁用小色点展示连接状态（灰=未连接，绿=已连接，蓝=同步中，红=最近一次同步/连接失败）。表单顶部的服务商 logo 按钮打开官方 S3 配置指南，用于创建 bucket / endpoint / access key；不会通过外链自动创建或回填凭据。同步范围（见上）在同一 pane：小标题 + 逐类开关（行内显示本地体积，默认全开）。

## 自动同步

配置项 `autoSync`（默认开）与 `intervalMinutes`（15/30/60，默认 30）随凭据存 `sync.json`。调度任务在 `sync_configure` 后（重新）启动、`sync_disconnect` 时停止、应用启动时按配置恢复；每次触发都重读凭据，改配置无需重启。触发器：调度启动即同步一次（≈打开 Vault）、Vault 改动静置 30s、定时间隔兜底；`RunEvent::Exit` 时对所有自动同步 Vault 尽力推送（超时 5s/Vault）。

## 安全约束

远端对象视为不可信输入，引擎在应用前统一校验：

- **manifest 路径净化**（`engine.rs` `validate_manifest`）：relPath 必须非空、非绝对、仅 `/` 分隔、无空段 / `.` / `..`，否则整个 pass 失败——杜绝经 `vault.join` 越界写/删文件。
- **hash 校验**：manifest 中 hash 必须是 64 位小写 hex（sha256），防止畸形 key  panic 或索引到 `blobs/` 之外。
- **解压限流**：blob 解压上限为 manifest 声明 size + 1MiB（sha256 校验兜底），manifest 解压上限 256MiB，防 gzip bomb。
- **强制 TLS**：`validate()` 要求 endpoint 为 https；仅 loopback（`localhost` / `127.0.0.1` / `::1`）放行 http（本地 MinIO 测试场景），避免 SigV4 凭据明文传输。

## 边界（后续分期）

状态栏指示、孤儿 blob GC、E2EE、官方托管凭据 provider 均未实现，见设计草稿分期表。
