# Zotero 阅读器与插件兼容架构

## 结论

产品的桌面版必须以官方 Zotero 主线运行时为内核，在其上重构 Zen 风格的界面层。当前 React/Vite 工程只用于快速验证交互与视觉，不作为最终插件宿主。

“支持 Zotero 所有插件”不能由网页兼容层实现。可验证、可维护的目标是：支持声明兼容当前 Zotero 10 的插件；对只兼容旧版 Zotero、依赖已删除内部 API 或私自修改 DOM 的插件，不作虚假保证。

## 证据 → 发现 → 路径

### E-01 阅读器侧栏是状态系统

- 官方状态：`tmp/zotero-study/reader/src/common/reader.js` 保存 `thumbnails`、`outline`、`sidebarOpen`、`sidebarWidth`、`sidebarView`。
- 官方组件：`reader/src/common/components/sidebar/sidebar.js` 把缩略图、批注、大纲定义为互斥标签页。
- 缩略图：`thumbnails-view.js` 将当前页与选中页联动，并仅为可见区域渲染缩略图。
- 大纲：`outline-view.js` 支持层级展开、搜索、键盘导航和当前位置激活。

发现：阅读导航不能只放三个图标；它需要持久开合、当前页同步、搜索和明确的内容区域。

路径：Web 原型现已加入可操作的缩略图、批注、大纲及页码联动；桌面版直接保留官方 Reader 状态与组件，只重写样式和外层布局。

### E-02 适应宽度是独立阅读模式

- `reader/src/common/reader.js` 暴露 `zoomAuto()`、`zoomPageWidth()`、`zoomPageHeight()`。
- `reader/src/pdf/pdf-view.js` 实现 PDF 视图缩放，而不是通过固定百分比冒充适应宽度。

发现：“112%”不等于屏幕宽度自适应。

路径：原型将“适应宽度 / 整页 / 自定义百分比”拆成三种状态；桌面版映射到官方 Reader 的缩放 API。

### E-03 Zotero 插件依赖桌面运行时

- `chrome/content/zotero/xpcom/plugins.js` 通过 Gecko `AddonManager` 枚举、安装、启停 XPI。
- 插件的 `bootstrap.js` 在 `Cu.Sandbox` 中执行，并获得 `Zotero`、`Services`、`ChromeUtils`、`IOUtils`、`PathUtils` 等宿主对象。
- 生命周期包含 `install`、`startup`、`shutdown`、`uninstall` 和主窗口加载/卸载。
- `chrome/content/zotero/xpcom/pluginAPI/` 提供菜单、条目树、条目详情等注册接口，并按 `pluginID` 自动清理。
- 当前官方文档要求插件通过 `strict_max_version` 明确声明 Zotero 10 兼容性。

发现：React 浏览器页面没有 XPI、XPCOM、chrome URL、Zotero DB/Notifier/Reader hooks，无法运行真实 Zotero 插件。模拟同名 JavaScript 对象只会制造不可维护的假兼容。

路径：桌面版从官方 Zotero 主线构建，完整保留插件加载器、API、数据层和 Reader；Zen 化限定在界面壳、设计令牌、布局与可替换的视图样式。

## 目标分层

```text
Zen 外观层
  ├─ 工作区侧栏、主题、动效、密度与窗口布局
  └─ 只调用稳定接口，不改写插件契约

Zotero 交互层
  ├─ 文库 / 集合 / 保存搜索 / 标签 / 条目树
  ├─ Reader：缩略图 / 批注 / 大纲 / 搜索 / 缩放
  └─ ItemPane / Menu / Reader 公开扩展点

Zotero 运行时层
  ├─ Gecko / XUL-XHTML / XPCOM / AddonManager
  ├─ XPI + manifest.json + bootstrap.js 生命周期
  ├─ Zotero.* / Notifier / DB / FullText / Translators
  └─ 官方数据目录、同步、引用与附件机制
```

## 兼容规则

| 插件类型 | 目标 |
|---|---|
| `strict_max_version: 10.0.*` 且使用稳定 API | 必须兼容 |
| 使用官方 ItemTree/ItemPane/Menu/Reader 扩展点 | 必须兼容 |
| 直接查询 Zotero 数据库或私有字段 | 尽力兼容，随上游变化回归 |
| 修改具体 DOM、CSS 类或内部 React 树 | 不保证；提供兼容清单 |
| 仅兼容 Zotero 6/7/8/9 的旧插件 | 由插件作者升级，产品不伪装版本 |

## 迁移顺序

1. 将官方 Zotero 仓库设为桌面主工程与上游远端，当前 Web 原型保留为设计演示包。
2. 建立 Zen 设计令牌，不改动 `Zotero.Plugins`、`Zotero.Reader`、数据库与同步层。
3. 先移植窗口壳、左侧导航折叠和主题系统，再逐页替换文库与阅读器样式。
4. 建立插件回归集：Better BibTeX、Zotero PDF Translate、Actions & Tags 等不同扩展面插件。
5. 每次跟随 Zotero 上游升级，运行核心功能和插件矩阵，记录不兼容原因。

## 当前原型边界

已验证：文库导航、集合与标签、条目阅读、批注、缩略图、大纲、适应宽度、整页和自定义缩放的交互模型。

尚未具备：真实 PDF 渲染、官方 Zotero 数据库、同步、引用处理、XPI 安装与插件执行。设置页会直接显示该状态，避免把演示按钮包装成已完成能力。
