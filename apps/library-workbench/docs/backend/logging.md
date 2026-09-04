# 运行日志

| 层 | 实现 |
|---|---|
| Host | `tauri-plugin-log` + `log`；`src-tauri/src/core/log_util.rs` |
| 前端 | `src/lib/core/logger.ts` |
| CLI | `env_logger` |

- 与用户 Toast / `ApiResult` **分层**：日志不替代错误 UX。
- 关键操作记录 op start/end。
- 前端启动：`main.tsx` 在 `op start/end frontend_boot` 之间输出 `boot stage=<阶段> ms=<累计>`（entry / settings / theme / i18n / 模块加载）。计时基准是 `performance.now()`，即从页面导航开始，因此包含 HTML 与入口模块本身的加载；多窗口时用末尾的 `window=main|settings` 区分。dev 环境的 Webview console 日志桥接异步附加，不阻塞启动链。
- 日志目录由插件约定（Windows 为 `%LOCALAPPDATA%\<identifier>\logs\agentero.log`）。Settings → About 提供「打开日志文件夹」，经 `appLogDir()` + opener `openPath` 直接在系统文件管理器打开，便于用户报错时上传日志。
