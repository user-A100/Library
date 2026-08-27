# 桌面内核说明

## 运行边界

正式桌面端基于 Zotero `9.0.6`，固定提交：

```text
7132587c2d6d56725debe64908733a8140bc6be3
```

`desktop/zotero` 保留 Gecko/XUL、SQLite、AddonManager、Reader、Note Editor、CSL、translators 和 `23119` Connector Server。Zen 风格位于末端 SCSS 覆盖层，不移除或重命名插件使用的主窗口节点。

## 插件兼容

插件由 Zotero 原生 Add-ons Manager 加载。内置 AI 功能也是标准 XPI：

```text
desktop/addons/research-workspace
```

该 XPI 注册标准 ItemPane 和 Menu 扩展点，直接读取 `Zotero.Item` 和 PDF 附件。MinerU 通过本地 `127.0.0.1:8000/tasks` sidecar 接入，解析结果后续写回真实附件与笔记模型，不维护第二套文库。

Zotero 9.0.6 的自定义 ItemPane Section 存在初始化时序问题。本分支缓存尚未升级完成组件的 l10n 状态，从而恢复插件侧栏图标和面板注册。

## Connector

浏览器 Zotero Connector 是独立浏览器扩展。本产品启动后原生监听：

```text
http://127.0.0.1:23119/connector/ping
```

用户无需安装官方 Zotero 桌面端，但仍需在浏览器中安装 Connector。

开发机若已有 Zotero 占用 23119，可给启动与验收脚本传入 `-ConnectorPort 23120` 做进程归属验证；该端口仅用于并行测试，不改变产品对官方 Connector 的 23119 兼容契约。

## 上游同步

升级 Zotero 前先建立新分支，更新上游 tag，再依次重放：

1. 品牌资源和 Windows 图标；
2. `zenWorkspace` 样式覆盖；
3. 已确认仍未被上游合并的插件兼容修复；
4. 内置 XPI；
5. Connector 与插件矩阵测试。
