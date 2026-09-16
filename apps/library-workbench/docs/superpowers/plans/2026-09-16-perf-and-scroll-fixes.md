# PDF 滚动回顶修复 + 性能优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Windows 上阅读 PDF 时滚动位置随机跳回文档顶部的问题，并通过可配置的后台版面分析、降采样与诊断信息显著降低 CPU 占用。

**Architecture:** 本仓库（user-A100/Library）是 poco-ai/Agentero 的 fork，桌面应用位于 `apps/library-workbench/`（Tauri 2 + React 19 + EmbedPDF/PDFium WASM）。滚动回顶 bug 在上游已于 2026-09-15 由提交 `1d9728d`（issue #539）修复但尚未发版，本计划将该修复移植到本 fork；性能优化围绕三个已证实的开销源：(a) 导入论文后自动在渲染进程跑 ONNX 版面分析（PP-DocLayoutV3，2x 光栅化），(b) 无头分析固定 2 倍采样，(c) PDFium 引擎 worker 启动失败时静默回退主线程且用户无从得知。

**Tech Stack:** React 19 + TypeScript（biome，Tab 缩进、双引号）、Rust（Tauri 2，rustfmt/clippy）、Vitest 4、EmbedPDF 2.14.4（@embedpdf/*，已 pnpm patch 的部分不动）、onnxruntime-web 1.27。

**Spec:** 本计划自带诊断依据（上游 issue #539 / #465、提交 1d9728d、fork 内代码走查），无独立 spec 文档。

## 背景诊断（执行者必读）

1. **滚动回顶**（上游 issue #539，Windows/WebView2）：
   - PDF 每次翻页/布局变化都会经 `viewportPlugin.onScrollRequest` 发出 `scrollTo` 请求，宿主把它延迟到下一帧执行（`dockview-viewport.tsx:153-160` 的 `requestFrame(() => viewport.scrollTo(...))`）。用户在这一个帧间隙内开始滚轮滚动时，旧请求仍会落地并覆盖用户当前位置 → 跳到文档首/尾。
   - PDF 虚拟滚动器滚动时不断换入/换出页面节点，Chromium scroll anchoring 基于变化中的节点高度自动校正滚动位置，可能校正到端点。
   - 上游修复 = 滚动请求按帧合并（scheduler）+ 用户 wheel 事件先取消未执行请求 + viewport `overflow-anchor: none`。
2. **CPU 占用 / 风扇狂转**（上游 issue #465，维护者确认）：
   - 每篇论文导入/下载后自动排队 `layoutAnalyze` 任务（`job_runners.rs` 两处 `enqueue_layout_analyze`，`JobLane::Normal`），执行器在**渲染进程**里用 ONNX 跑 PP-DocLayoutV3，页面按 `renderScale: 2` 光栅化（像素量 4x）。批量导入 = 持续打满 CPU。
   - 本地 ONNX 有 per-kind 并发上限 1（`LayoutAnalyzeCap`），任务串行但持续。
   - `engine-provider.tsx` 里 worker 引擎 8 秒探针失败会静默回退主线程 direct engine（所有 PDF 光栅化挤占 UI 线程），用户看不到任何提示。

## Global Constraints

- 工作目录：`D:\Agentero\library-fork`（本 fork 的克隆）。所有改动限于 `apps/library-workbench/` 前端与其 `src-tauri/` Rust 后端。
- 前端命令在 `apps/library-workbench/` 下运行（pnpm@11.5.3）：`pnpm test`（vitest run）、`pnpm typecheck`、`pnpm lint`（biome + clippy）。Rust 测试在 `apps/library-workbench/src-tauri/` 下运行 `cargo test`。
- TS 代码风格：Tab 缩进、双引号（biome 强制）；Rust 走 rustfmt + `cargo clippy -- -D warnings`。
- 不修改 `patches/` 下的 @embedpdf 补丁，不动 EmbedPDF 包本身。
- 新设置默认值必须保持现状行为：`autoAfterImport` 默认 `true`（用户可在设置里关闭）；`renderScale` 2→1.5 是本计划明确的性能取舍（质量验证见 Task 5 / Task 7）。
- 设置同步链路：Rust `AppSettings`（`#[serde(rename_all = "camelCase")]`）↔ TS `AppSettings`（手写类型，`settings_get`/invoke 传输），**不经过** tauri-specta 生成的 bindings.ts —— 新字段只需同时改两侧类型。
- 提交信息用仓库现有 Conventional Commits 风格（`fix:`/`feat:`/`perf:`/`test:`/`docs:` 前缀）。
- 网络访问需走代理 `http://127.0.0.1:7890`（git/pnpm/cargo 拉取时如遇连接失败，`export https_proxy=http://127.0.0.1:7890`）。

---

### Task 1: 移植 viewport 滚动请求调度器（滚动回顶修复核心模块）

**Files:**
- Create: `apps/library-workbench/src/lib/pdf/viewport-scroll.ts`
- Test: `apps/library-workbench/test/pdf-viewport-scroll.test.ts`

**Interfaces:**
- Consumes: 无（纯新模块）。
- Produces: `createPdfViewportScrollScheduler({ apply, requestFrame?, cancelFrame? }): PdfViewportScrollScheduler`，类型 `PdfViewportScrollRequest = { x: number; y: number; behavior?: ScrollBehavior }`、`PdfViewportScrollScheduler = { schedule(request): void; cancelPending(): void; dispose(): void }`。Task 2 依赖这些签名。

- [ ] **Step 1: 写失败测试**

创建 `apps/library-workbench/test/pdf-viewport-scroll.test.ts`（移植上游 1d9728d 的测试，保持原语义）：

```ts
import { describe, expect, it, vi } from "vitest";
import { createPdfViewportScrollScheduler } from "@/lib/pdf/viewport-scroll";

function frameHarness() {
	let callback: FrameRequestCallback | null = null;
	return {
		requestFrame: vi.fn((next: FrameRequestCallback) => {
			callback = next;
			return 7;
		}),
		cancelFrame: vi.fn(() => {
			callback = null;
		}),
		flush: () => {
			const next = callback;
			callback = null;
			next?.(0);
		},
	};
}

describe("PDF viewport scroll scheduler", () => {
	it("drops a deferred page jump when native scrolling starts first", () => {
		const frames = frameHarness();
		const apply = vi.fn();
		const scheduler = createPdfViewportScrollScheduler({
			apply,
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
		});

		scheduler.schedule({ x: 0, y: 0, behavior: "instant" });
		// This is the native viewport scroll event produced by the user's wheel.
		scheduler.cancelPending();
		frames.flush();

		expect(apply).not.toHaveBeenCalled();
	});

	it("coalesces several same-frame requests to the latest target", () => {
		const frames = frameHarness();
		const apply = vi.fn();
		const scheduler = createPdfViewportScrollScheduler({
			apply,
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
		});

		scheduler.schedule({ x: 10, y: 100, behavior: "instant" });
		scheduler.schedule({ x: 20, y: 200, behavior: "instant" });
		frames.flush();

		expect(apply).toHaveBeenCalledTimes(1);
		expect(apply).toHaveBeenCalledWith({
			x: 20,
			y: 200,
			behavior: "instant",
		});

		// A virtual-page reorder, zoom relayout, or synchronized pane may emit
		// another programmatic target after the previous target was applied;
		// later requests must remain schedulable.
		scheduler.schedule({ x: 30, y: 300, behavior: "instant" });
		frames.flush();

		expect(apply).toHaveBeenLastCalledWith({
			x: 30,
			y: 300,
			behavior: "instant",
		});
	});

	it("disposes and drops everything pending", () => {
		const frames = frameHarness();
		const apply = vi.fn();
		const scheduler = createPdfViewportScrollScheduler({
			apply,
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
		});

		scheduler.schedule({ x: 0, y: 5 });
		scheduler.dispose();
		frames.flush();
		scheduler.schedule({ x: 0, y: 9 });
		frames.flush();

		expect(apply).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: 运行测试确认失败**

```
cd apps/library-workbench && pnpm vitest run test/pdf-viewport-scroll.test.ts
```
预期：FAIL，错误为无法解析 `@/lib/pdf/viewport-scroll`（模块不存在）。

- [ ] **Step 3: 实现调度器模块**

创建 `apps/library-workbench/src/lib/pdf/viewport-scroll.ts`：

```ts
/**
 * Coalesce deferred viewport scroll requests. The viewport owner cancels a
 * request only after an explicit user-input precursor; native scroll events
 * themselves can also come from layout, zoom, or pane synchronization.
 *
 * EmbedPDF emits scroll requests synchronously, while the DOM viewport is
 * updated on the next frame. On Windows/WebView2 a user wheel event can land
 * in that gap; applying the old request afterwards makes the PDF jump to the
 * beginning or end of the document (upstream issue #539).
 */

export type PdfViewportScrollRequest = {
	x: number;
	y: number;
	behavior?: ScrollBehavior;
};

export type PdfViewportScrollScheduler = {
	schedule: (request: PdfViewportScrollRequest) => void;
	cancelPending: () => void;
	dispose: () => void;
};

export function createPdfViewportScrollScheduler({
	apply,
	requestFrame = (callback) => requestAnimationFrame(callback),
	cancelFrame = (handle) => cancelAnimationFrame(handle),
}: {
	apply: (request: PdfViewportScrollRequest) => void;
	requestFrame?: (callback: FrameRequestCallback) => number;
	cancelFrame?: (handle: number) => void;
}): PdfViewportScrollScheduler {
	let pending: PdfViewportScrollRequest | null = null;
	let frame: number | null = null;
	let disposed = false;

	const cancelPending = () => {
		pending = null;
		if (frame === null) return;
		cancelFrame(frame);
		frame = null;
	};

	return {
		schedule(request) {
			if (disposed) return;
			pending = request;
			if (frame !== null) return;
			frame = requestFrame(() => {
				frame = null;
				const next = pending;
				pending = null;
				if (!disposed && next) apply(next);
			});
		},
		cancelPending,
		dispose() {
			if (disposed) return;
			disposed = true;
			cancelPending();
		},
	};
}
```

- [ ] **Step 4: 运行测试确认通过**

```
cd apps/library-workbench && pnpm vitest run test/pdf-viewport-scroll.test.ts
```
预期：3 个测试全部 PASS。

- [ ] **Step 5: 提交**

```
git add apps/library-workbench/src/lib/pdf/viewport-scroll.ts apps/library-workbench/test/pdf-viewport-scroll.test.ts
git commit -m "feat(pdf): port viewport scroll request scheduler from upstream 1d9728d"
```

---

### Task 2: 接入 DockviewViewport —— wheel 取消 + 同帧合并 + 关闭 scroll anchoring

**Files:**
- Modify: `apps/library-workbench/src/components/viewer/pdf/viewport/dockview-viewport.tsx`
- Modify: `apps/library-workbench/src/lib/pdf/index.ts`（新增一行导出）

**Interfaces:**
- Consumes: Task 1 的 `createPdfViewportScrollScheduler`。
- Produces: `dockview-viewport.tsx` 行为变化（滚动请求经调度器；wheel 先取消；`overflowAnchor: "none"`）；`@/lib/pdf` 新导出 `createPdfViewportScrollScheduler`。

- [ ] **Step 1: 添加 import**

在 `dockview-viewport.tsx` 第 16 行 `import { createPdfViewportResizeGate } from "@/lib/pdf/dockview-resize";` 之后新增：

```ts
import { createPdfViewportScrollScheduler } from "@/lib/pdf/viewport-scroll";
```

- [ ] **Step 2: 创建调度器（在 cancelFrame 定义之后、commitResize 之前）**

在第 77 行 `};`（`cancelFrame` 结束）与第 78 行 `const commitResize = () => {` 之间插入：

```ts
		const scrollScheduler = createPdfViewportScrollScheduler({
			requestFrame,
			cancelFrame,
			apply: (request) => {
				viewport.scrollTo({
					left: request.x,
					top: request.y,
					behavior: request.behavior,
				});
			},
		});
```

- [ ] **Step 3: 注册 wheel 取消监听**

在第 145 行 `viewport.addEventListener("scroll", handleScroll, { passive: true });` 之后插入：

```ts
		// Wheel is an unambiguous user-originated precursor to the native scroll
		// event. Cancel here, before the native scroll event, so the deferred
		// request cannot overwrite the user's new position (issue #539).
		const handleWheel = () => scrollScheduler.cancelPending();
		viewport.addEventListener("wheel", handleWheel, {
			capture: true,
			passive: true,
		});
```

- [ ] **Step 4: onScrollRequest 改走调度器**

把第 153-160 行：

```ts
		const unsubscribeScrollRequest = viewportPlugin.onScrollRequest(
			documentId,
			({ x, y, behavior = "auto" }) => {
				requestFrame(() => {
					viewport.scrollTo({ left: x, top: y, behavior });
				});
			},
		);
```

替换为：

```ts
		const unsubscribeScrollRequest = viewportPlugin.onScrollRequest(
			documentId,
			({ x, y, behavior = "auto" }) =>
				scrollScheduler.schedule({ x, y, behavior }),
		);
```

- [ ] **Step 5: 清理函数补齐**

在 cleanup（第 163 行起）中，`if (scrollFrame != null) cancelFrame(scrollFrame);` 之后加：

```ts
			scrollScheduler.dispose();
```

并在 `viewport.removeEventListener("scroll", handleScroll);` 之后加：

```ts
			viewport.removeEventListener("wheel", handleWheel, true);
```

- [ ] **Step 6: 关闭浏览器 scroll anchoring**

把返回 JSX 的 style 对象里：

```ts
					overflow: "auto",
					...style,
					padding: `${viewportGap}px`,
```

改为：

```ts
					overflow: "auto",
					...style,
					// Scroller swaps virtualized page nodes while scrolling. Letting
					// Chromium's scroll anchoring adjust this custom virtual viewport can
					// move it to an endpoint when the rendered range changes (#539).
					overflowAnchor: "none",
					padding: `${viewportGap}px`,
```

- [ ] **Step 7: 导出新模块**

在 `apps/library-workbench/src/lib/pdf/index.ts` 第 94 行 `export { createPdfViewportResizeGate } from "@/lib/pdf/dockview-resize";` 之后新增一行：

```ts
export { createPdfViewportScrollScheduler } from "@/lib/pdf/viewport-scroll";
```

- [ ] **Step 8: 验证（类型 + 全量测试 + lint）**

```
cd apps/library-workbench && pnpm typecheck && pnpm test && pnpm lint
```
预期：typecheck 0 错误；vitest 全绿（含 Task 1 测试）；biome/clippy 无新告警。

- [ ] **Step 9: 移植 bug 文档**

创建 `apps/library-workbench/docs/bug_fix/pdf-windows-scroll-endpoint-jump.md`：

```markdown
# Windows PDF 翻页时随机跳到首尾页（上游 #539）

**状态**：已修复（移植自上游 1d9728d）
**影响面**：Windows / WebView2 PDF 阅读器快速翻页与滚动

## 问题

EmbedPDF 的页跳转请求同步发出，但宿主 DOM 视口在下一帧才执行 `scrollTo`。用户在这一个时序窗口内开始滚动时，旧请求仍会落地，覆盖用户当前位置。与此同时，虚拟滚动器会换入/换出页面节点，Chromium 的 scroll anchoring 可能基于变化中的节点高度重新校正位置；在 Windows WebView2 中，这种校正可能落到文档首端或末端。

## 修复

- `createPdfViewportScrollScheduler`（`src/lib/pdf/viewport-scroll.ts`）将同一帧的 DOM 跳转请求合并为最新请求。
- 用户滚轮事件在原生滚动发生前取消尚未执行的请求；虚拟页重排、缩放布局和双栏同步产生的程序化 `scroll` 事件只更新指标，不会误取消合法请求。
- PDF viewport 设置 `overflow-anchor: none`，让自定义虚拟滚动器独占位置管理。

回归测试：`test/pdf-viewport-scroll.test.ts` 覆盖"延迟跳转后先发生用户滚动"与同帧请求合并。
```

- [ ] **Step 10: 提交**

```
git add apps/library-workbench/src/components/viewer/pdf/viewport/dockview-viewport.tsx apps/library-workbench/src/lib/pdf/index.ts apps/library-workbench/docs/bug_fix/pdf-windows-scroll-endpoint-jump.md
git commit -m "fix(pdf): prevent Windows PDF scroll endpoint jumps (port upstream 1d9728d)"
```

---

### Task 3: Rust 端 `autoAfterImport` 设置 + 导入期版面分析改走 Idle 通道

**Files:**
- Modify: `apps/library-workbench/src-tauri/src/features/system/settings/mod.rs`（`LayoutSettings` 结构体 + `Default` + getter）
- Modify: `apps/library-workbench/src-tauri/src/features/paper/import/job_runners.rs`（两处 enqueue 门控 + 换通道）

**Interfaces:**
- Consumes: 现有 `AppSettingsStore`（经 `features/mod.rs` 的 `pub use system::settings;` 以 `crate::features::settings::AppSettingsStore` 引用）、`JobCenter::enqueue_layout_analyze(&vault, &path, lane, force)`、`JobLane::{Focus,Normal,Idle}`。
- Produces: `LayoutSettings.auto_after_import: bool`（serde `autoAfterImport`，默认 `true`）与 `AppSettingsStore::layout_auto_after_import() -> bool`。Task 4 的 TS 类型镜像此字段。
- 通道语义（已核实）：`drain_and_spawn` 按 focus → normal → idle 顺序找第一个可启动任务；Idle 不是"只在空闲时跑"，而是让位给其他可启动工作，导入风暴期间版面分析不再与下载/解析抢跑。

- [ ] **Step 1: 写失败的 Rust 测试**

在 `features/system/settings/mod.rs` 文件末尾的 `#[cfg(test)] mod tests { ... }`（第 1013 行起）内追加：

```rust
    #[test]
    fn layout_settings_defaults_enable_auto_analysis() {
        let s = AppSettings::default();
        assert!(s.layout.auto_after_import);
    }

    #[test]
    fn layout_settings_missing_field_defaults_true() {
        // Old settings.json without the new key must keep current behavior.
        let json = r#"{"backend":"local","parser_backend":"local"}"#;
        let parsed: LayoutSettings = serde_json::from_str(json).expect("parse");
        assert!(parsed.auto_after_import);
    }
```

- [ ] **Step 2: 运行测试确认失败**

```
cd apps/library-workbench/src-tauri && cargo test layout_settings
```
预期：编译错误（`auto_after_import` 字段不存在）。

- [ ] **Step 3: 实现字段与 getter**

3a. 在 `LayoutSettings` 结构体（约第 240-248 行）`provider_configs` 字段前加：

```rust
    /// Whether paper import/download enqueues an automatic layout-analysis
    /// job. `false` = only manual analysis (figures panel / CLI) runs.
    #[serde(default = "default_true")]
    pub auto_after_import: bool,
```

3b. `impl Default for LayoutSettings`（约第 252-258 行）中加：

```rust
            auto_after_import: true,
```

3c. 若本文件还没有 `default_true` 辅助函数（搜索确认；若已有则跳过），在其它 `fn default_*` 附近加：

```rust
fn default_true() -> bool {
    true
}
```

3d. 在 `impl AppSettingsStore` 的 `layout_backend()`（约第 535 行）之后加 getter：

```rust
    /// Whether import/download should auto-enqueue layout analysis.
    pub fn layout_auto_after_import(&self) -> bool {
        self.inner
            .lock()
            .ok()
            .map(|guard| guard.layout.auto_after_import)
            .unwrap_or(true)
    }
```

- [ ] **Step 4: 运行测试确认通过**

```
cd apps/library-workbench/src-tauri && cargo test layout_settings
```
预期：2 个测试 PASS。

- [ ] **Step 5: 门控 + 换通道（job_runners.rs 两处）**

5a. 第一处（`download_assets_runner`，约第 111-124 行）。把：

```rust
                let backend = app
                    .state::<crate::features::settings::AppSettingsStore>()
                    .layout_backend();
                center.apply_layout_backend(&backend).await;
                let lsnap = center
                    .enqueue_layout_analyze(&vault, &path, JobLane::Normal, false)
                    .await;
```

改为：

```rust
                let settings = app
                    .state::<crate::features::settings::AppSettingsStore>();
                let backend = settings.layout_backend();
                center.apply_layout_backend(&backend).await;
                if !settings.layout_auto_after_import() {
                    return RunOutcome::Skipped(None);
                }
                let lsnap = center
                    .enqueue_layout_analyze(&vault, &path, JobLane::Idle, false)
                    .await;
```

注意：`return RunOutcome::Skipped(None);` 前先确认该闭包当前返回类型允许 —— 若 `Skipped` 变体不带参数则用 `RunOutcome::Skipped`。以同文件中已有 `RunOutcome::Skipped` 用法为准（搜索一次再写）。若该处后续还有必须执行的语句，则改为跳过 enqueue 但不提前 return：

```rust
                if settings.layout_auto_after_import() {
                    let lsnap = center
                        .enqueue_layout_analyze(&vault, &path, JobLane::Idle, false)
                        .await;
                    emit_job_changed(&app, lsnap.clone());
                    if let StartOutcome::Started(started) = center.try_start(&lsnap.id).await {
                        center.spawn_runner(&app, started);
                    }
                }
```

（两处统一采用这种"包住 enqueue 块"的写法，避免提前 return 与后续清理逻辑冲突。）

5b. 第二处（`recognize_metadata_runner`，约第 235-245 行）同样处理：读取 settings 一次，`auto_after_import` 为 false 时跳过整个 layout enqueue 块，为 true 时 lane 改为 `JobLane::Idle`。`parse_body` / `spawn_parse_after_import` 保持 `JobLane::Normal` 不变。

- [ ] **Step 6: 编译 + 测试 + lint**

```
cd apps/library-workbench/src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```
预期：全部通过、无 clippy 告警。

- [ ] **Step 7: 提交**

```
git add apps/library-workbench/src-tauri/src/features/system/settings/mod.rs apps/library-workbench/src-tauri/src/features/paper/import/job_runners.rs
git commit -m "perf(jobs): gate auto layout analysis on new setting and move it to the idle lane"
```

---

### Task 4: TS 类型镜像 + 设置界面开关 + 双语文案

**Files:**
- Modify: `apps/library-workbench/src/lib/pdf/layout/settings.ts`（`LayoutSettings` 类型 + 默认值）
- Modify: `apps/library-workbench/src/components/settings/panes/layout-pane.tsx`（新增开关行）
- Modify: `apps/library-workbench/src/i18n/locales/zh-CN/settings.json`、`apps/library-workbench/src/i18n/locales/en/settings.json`

**Interfaces:**
- Consumes: Task 3 的 Rust 字段 `autoAfterImport`（serde camelCase）；`LayoutPane({ settings, patch })` 现有 props（`patch: (p: Partial<AppSettings>) => void`）。
- Produces: `LayoutSettings.autoAfterImport: boolean`；设置 → 版面解析页新开关。

- [ ] **Step 1: TS 类型 + 默认值**

`src/lib/pdf/layout/settings.ts` 第 85-95 行改为：

```ts
export type LayoutSettings = {
	backend: LayoutBackend;
	parserBackend: ParserBackend;
	/**
	 * Whether paper import/download auto-enqueues layout analysis. Mirrors the
	 * Rust `LayoutSettings.auto_after_import` field (serde `autoAfterImport`).
	 */
	autoAfterImport: boolean;
	providerConfigs: Partial<Record<LayoutProviderId, LayoutProviderConfig>>;
};

export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
	backend: "local",
	parserBackend: "local",
	autoAfterImport: true,
	providerConfigs: {},
};
```

- [ ] **Step 2: i18n 文案**

`zh-CN/settings.json` 的 `"layout"` 对象内（`"title"` 之后任意位置，与现有键并列）加：

```json
		"autoAfterImport": {
			"label": "导入后自动版面解析",
			"help": "关闭后，导入/下载论文不再自动运行本地 ONNX 版面解析（大幅降低导入时的 CPU 占用）；图表面板与 CLI 中的手动解析不受影响。"
		},
```

`en/settings.json` 的 `"layout"` 对象内对应加：

```json
		"autoAfterImport": {
			"label": "Auto layout analysis after import",
			"help": "When off, importing/downloading papers no longer auto-runs local ONNX layout analysis (much lower CPU during imports). Manual analysis from the figures panel and CLI is unaffected."
		},
```

（插入位置跟随各文件 `"layout"` 段内现有缩进与逗号规则，改完用 `python -m json.tool` 校验两个文件可解析。）

- [ ] **Step 3: 设置界面开关**

在 `layout-pane.tsx` 中，`parserBackend` 的 `SettingsRow`（约第 241-261 行那个 `Select` 行）之后、下一个 `SettingsGroup` 之前插入：

```tsx
			<SettingsGroup>
				<SettingsRow
					label={t("layout.autoAfterImport.label")}
					htmlFor="layout-auto-after-import"
				>
					<Switch
						id="layout-auto-after-import"
						size="sm"
						checked={layout.autoAfterImport}
						onCheckedChange={(checked) =>
							patch({ layout: { ...layout, autoAfterImport: checked === true } })
						}
					/>
				</SettingsRow>
				<p className="px-1 text-xs text-muted-foreground">
					{t("layout.autoAfterImport.help")}
				</p>
			</SettingsGroup>
```

说明：`Switch` 已在同文件 import（第 49 行附近）；如编译报未导入则补充 `import { Switch } from "@/components/ui/switch";`。帮助文案若希望与其它行一致，可改用 `<HelpLabel label={...} help={...} />` 模式（同文件已有用法，第 753 行起）。

- [ ] **Step 4: 验证**

```
cd apps/library-workbench && pnpm typecheck && pnpm test
```
预期：typecheck 0 错误（若 `AppSettings` 相关测试断言默认值快照失败，按新默认值更新快照——`autoAfterImport: true`）；vitest 全绿。

- [ ] **Step 5: 手动验证（如本机可跑 `pnpm tauri dev`）**

设置 → 版面解析：开关默认开；切换后重启应用，确认设置持久化（`settings.json` 里 `layout.autoAfterImport`）。

- [ ] **Step 6: 提交**

```
git add apps/library-workbench/src/lib/pdf/layout/settings.ts apps/library-workbench/src/components/settings/panes/layout-pane.tsx apps/library-workbench/src/i18n/locales/zh-CN/settings.json apps/library-workbench/src/i18n/locales/en/settings.json
git commit -m "feat(settings): toggle for automatic post-import layout analysis"
```

---

### Task 5: 无头版面分析降采样 2 → 1.5

**Files:**
- Modify: `apps/library-workbench/src/lib/pdf/layout/headless-analyze.ts`
- Test: `apps/library-workbench/test/headless-layout-scale.test.ts`（新建，守卫测试）

**Interfaces:**
- Consumes: 无。
- Produces: 导出常量 `HEADLESS_LAYOUT_RENDER_SCALE = 1.5`，`registry.registerPlugin(LayoutAnalysisPluginPackage, { ..., renderScale: HEADLESS_LAYOUT_RENDER_SCALE })`。交互式（阅读器内手动触发）分析的 `renderScale: 2`（`pdf-viewer.tsx` 第 221 行）**保持不变**——手动触发时用户在等结果且质量优先。

理由：像素量从 4x 降到 2.25x（约 -44% 推理与光栅开销）；PP-DocLayoutV3 输入会重采样到固定网络分辨率，1.5x 对论文版面的图/表/公式检测质量损失可忽略（Task 7 有抽查步骤兜底）。

- [ ] **Step 1: 写守卫测试**

创建 `apps/library-workbench/test/headless-layout-scale.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { HEADLESS_LAYOUT_RENDER_SCALE } from "@/lib/pdf/layout/headless-analyze";

describe("headless layout analysis render scale", () => {
	it("stays capped at 1.5 to bound batch-import CPU cost", () => {
		expect(HEADLESS_LAYOUT_RENDER_SCALE).toBeLessThanOrEqual(1.5);
	});
});
```

- [ ] **Step 2: 运行确认失败**

```
cd apps/library-workbench && pnpm vitest run test/headless-layout-scale.test.ts
```
预期：FAIL（导出不存在）。

- [ ] **Step 3: 实现**

在 `headless-analyze.ts` 顶部（import 之后）加：

```ts
/**
 * Raster scale for headless (post-import) layout analysis. Capped at 1.5 to
 * bound batch-import CPU cost; interactive viewer analysis keeps its own
 * higher-quality scale in pdf-viewer.tsx.
 */
export const HEADLESS_LAYOUT_RENDER_SCALE = 1.5;
```

并把第 163 行 `renderScale: 2,` 改为 `renderScale: HEADLESS_LAYOUT_RENDER_SCALE,`。

- [ ] **Step 4: 运行确认通过 + 全量测试**

```
cd apps/library-workbench && pnpm vitest run test/headless-layout-scale.test.ts && pnpm test
```
预期：全绿。

- [ ] **Step 5: 提交**

```
git add apps/library-workbench/src/lib/pdf/layout/headless-analyze.ts apps/library-workbench/test/headless-layout-scale.test.ts
git commit -m "perf(pdf): cap headless layout analysis raster scale at 1.5"
```

---

### Task 6: PDF 引擎模式诊断（关于页显示 worker / 主线程）

**Files:**
- Create: `apps/library-workbench/src/components/settings/panes/pdf-engine-status-row.tsx`
- Modify: `apps/library-workbench/src/components/viewer/pdf/engine-provider.tsx`
- Modify: `apps/library-workbench/src/components/settings/panes/about-pane.tsx`（渲染新组件，一行 + import）
- Modify: `apps/library-workbench/src/i18n/locales/zh-CN/settings.json`、`en/settings.json`（`about` 段新键）

**Interfaces:**
- Consumes: `engine-provider.tsx` 现有模块级 `workerEngineUsable` 探针状态。
- Produces: `getPdfEngineMode(): "worker" | "direct" | null`（null = 尚未完成初始化）；`<PdfEngineStatusRow />` 组件。

背景：worker 探针失败时静默回退主线程 direct engine，之后**所有** PDF 光栅化都挤占 UI 线程（慢性卡顿的常见根因）。此任务让用户一眼看到自己处在哪种模式。

- [ ] **Step 1: engine-provider 记录模式**

在 `engine-provider.tsx` 中：

1a. 在 `let workerEngineUsable: boolean | null = null;`（第 44 行）之后加：

```ts
/**
 * Last resolved engine mode for diagnostics (About pane). `null` until the
 * first engine init settles in this webview.
 */
let lastEngineMode: "worker" | "direct" | null = null;

export function getPdfEngineMode(): "worker" | "direct" | null {
	return lastEngineMode;
}
```

1b. `initPdfEngine` 里两处赋值：`workerEngineUsable = true;`（第 116 行）之后加 `lastEngineMode = "worker";`；`workerEngineUsable = false;`（第 120 行，catch 块内）之后加 `lastEngineMode = "direct";`。

1c. 补第二个到达路径：`initPdfEngine` 函数体开头 `const fontFallback = ...` 之前加：

```ts
	if (workerEngineUsable === false) lastEngineMode = "direct";
```

（覆盖进程内已记住探针失败、后续初始化跳过 try 块直接走 direct 的情形。）

- [ ] **Step 2: i18n 键**

`zh-CN/settings.json` 的 `"about"` 段加：

```json
		"engineMode": {
			"label": "PDF 渲染引擎",
			"worker": "Worker（渲染不阻塞界面）",
			"direct": "主线程（已回退——如持续卡顿请重启应用）",
			"pending": "初始化中…"
		},
```

`en/settings.json` 对应加：

```json
		"engineMode": {
			"label": "PDF render engine",
			"worker": "Worker (rendering off the UI thread)",
			"direct": "Main thread (fallback — restart the app if scrolling stays janky)",
			"pending": "Initializing…"
		},
```

- [ ] **Step 3: 状态行组件**

创建 `apps/library-workbench/src/components/settings/panes/pdf-engine-status-row.tsx`：

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getPdfEngineMode } from "@/components/viewer/pdf/engine-provider";
import {
	SettingsGroup,
	SettingsRow,
} from "@/components/settings/settings-layout";

/**
 * About-pane diagnostics row: which PDFium engine mode this webview resolved.
 * "direct" (main-thread) means every raster competes with the UI thread — the
 * first thing to check when PDF scrolling is chronically janky.
 */
export function PdfEngineStatusRow() {
	const { t } = useTranslation("settings");
	const [mode, setMode] = useState<"worker" | "direct" | null>(() =>
		getPdfEngineMode(),
	);

	useEffect(() => {
		if (mode) return;
		const timer = window.setInterval(() => {
			const next = getPdfEngineMode();
			if (next) {
				setMode(next);
				window.clearInterval(timer);
			}
		}, 500);
		return () => window.clearInterval(timer);
	}, [mode]);

	const label =
		mode === "worker"
			? t("about.engineMode.worker")
			: mode === "direct"
				? t("about.engineMode.direct")
				: t("about.engineMode.pending");

	return (
		<SettingsGroup>
			<SettingsRow label={t("about.engineMode.label")}>
				<span className="text-sm text-muted-foreground">{label}</span>
			</SettingsRow>
		</SettingsGroup>
	);
}
```

- [ ] **Step 4: 挂进 AboutPane**

`about-pane.tsx`：文件顶部 import 区加

```ts
import { PdfEngineStatusRow } from "@/components/settings/panes/pdf-engine-status-row";
```

在组件返回的 JSX 中，Finder/CLI 状态相关 `SettingsGroup` 之后（页面靠后位置）插入一行：

```tsx
			<PdfEngineStatusRow />
```

（执行者读该文件后选择最后一个 `SettingsGroup` 结束标签之后插入；组件自包含，无需传 props。）

- [ ] **Step 5: 验证**

```
cd apps/library-workbench && pnpm typecheck && pnpm test && pnpm lint
```
预期：全绿。注意 `engine-provider.tsx` 若被其它模块循环引用（`viewer/index.ts` 桶文件），报错时改为在 `pdf-engine-status-row.tsx` 里直接 `import { getPdfEngineMode } from "@/components/viewer/pdf/engine-provider"`（已是直连路径，不经桶文件，通常无环）。

- [ ] **Step 6: 手动验证（可选，`pnpm dev` 浏览器模式即可）**

打开设置 → 关于：PDF 打开过一次后该行应显示 Worker 模式；浏览器纯 dev 模式（非 Tauri）下 worker 若可用同样显示 worker。

- [ ] **Step 7: 提交**

```
git add apps/library-workbench/src/components/viewer/pdf/engine-provider.tsx apps/library-workbench/src/components/settings/panes/pdf-engine-status-row.tsx apps/library-workbench/src/components/settings/panes/about-pane.tsx apps/library-workbench/src/i18n/locales/zh-CN/settings.json apps/library-workbench/src/i18n/locales/en/settings.json
git commit -m "feat(settings): surface PDFium engine mode (worker vs main-thread) in About"
```

---

### Task 7: 全量验证 + 手动 QA 清单

**Files:**
- 无新文件；只运行验证并记录结果。

**Interfaces:**
- Consumes: Task 1-6 全部产出。
- Produces: 验证记录（附到 PR/提交说明）。

- [ ] **Step 1: 前端全量**

```
cd apps/library-workbench && pnpm test && pnpm typecheck && pnpm lint
```

- [ ] **Step 2: Rust 全量**

```
cd apps/library-workbench/src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

- [ ] **Step 3: 桌面端冒烟（Windows 本机，`pnpm tauri dev`）**

滚动回归（核心验收）：
1. 打开一篇 30 页以上的论文 PDF。
2. 用滚轮从中部开始快速连续向下滚动 2 分钟（中途混用 PgDn / 大幅拖动滚动条）。
3. 验收：阅读位置始终跟随滚动，**从不**跳回第一页或跳到末页。

缩放回归（确认调度器未破坏程序化滚动）：
1. ⌘/Ctrl+滚轮缩放、底部滑条缩放、Fit 宽度/页面按钮。
2. 验收：缩放后视口锚点稳定，无瞬间跳顶。

双栏回归：打开全文翻译（双栏模式，若启用）滚动一栏，另一栏跟随。

性能对比（需要一组可导入的论文，如 Zotero 导入或 RSS）：
1. 基线：保持 `autoAfterImport` 开，导入 10 篇论文，任务管理器记录 `msedgewebview2.exe` CPU 曲线与风扇表现。
2. 优化后：设置 → 版面解析 关闭 `autoAfterImport`，再导入 10 篇，同样记录。
3. 验收：关闭后导入期间无持续 CPU 高占用；开启时由于 renderScale 1.5 + Idle 通道，占用峰值与持续时间明显低于基线。
4. 质量抽查：开启状态下挑 2 篇有复杂图表的论文，打开图表面板确认图/表/公式区域检测正常。

诊断行：设置 → 关于 显示"PDF 渲染引擎"为 Worker 模式。

- [ ] **Step 4: 汇总提交（如有 QA 期间的小修）**

```
git add -A && git commit -m "test: QA pass for scroll fix and import-performance tuning"
```

---

## 已知不做（及原因）

- **版面分析移到独立进程 / Rust 侧 ONNX**：收益真实但需引入 `ort` crate、模型输入输出对接与双实现维护，风险与工作量远超本计划；上述三项（可关闭 + Idle 通道 + 1.5x 降采样）已消除绝大部分导入期占用。
- **弹出文档窗口跨窗共享 PDFium 引擎**：Tauri v2 每个 WebviewWindow 是独立 WebView2 进程、独立 JS 上下文，无法共享 WASM 实例；窗口最小化时 rAF 自动节流，空闲成本已可接受。日常建议：多文档用标签页/分栏而非弹出窗。
- **ONNX WASM 线程数限制**：WebView2 默认非 cross-origin isolated，onnxruntime-web 实际单线程，`numThreads` 无效。
- **上游同步**：fork 落后上游 116 个提交且已重组目录结构，整体合并成本极高；本计划采取定向移植（1d9728d）策略。
