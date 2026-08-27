# Library 的 Zen 紧凑交互实现

Library 0.5.1 已把 Zen 浏览器的紧凑模式从“视觉参考”推进到原生窗口交互：中央文库或 PDF 阅读内容可占满窗口，原生文库通过左缘移入临时唤回；详情和标签栏保持 Zotero 原生交互，专注布局通过工具菜单切换。

完整 Evidence → Finding → Path、源码定位、状态图和复现命令见 [case 报告](../work/zen-shell-interaction-20260824/report/interaction-shell-report.md)。

## 快速验证

```powershell
node --check desktop/addons/research-workspace/research-workspace.js
powershell -File scripts/verify-desktop.ps1 -ConnectorPort 23119
```

实现保持 Zotero 原生 `#zotero-collections-pane`、`#zotero-item-pane`、`#zotero-context-pane` 和 `#zotero-title-bar` 节点，只改变其窗口状态和布局参与方式，避免破坏插件挂载点。
