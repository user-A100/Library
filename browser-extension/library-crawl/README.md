# Library Crawl（浏览器扩展）

仓库：https://github.com/user-A100/Library

把网页上的 PDF 一键抓取进 **Library** 桌面应用。完全本地运行：扩展只与 `http://127.0.0.1:23119`（Library 内置 Connector Server）通信，数据不出本机。

> 本项目使用 Zotero 内核但面向 Library 品牌分发；本扩展是 Library 官方抓取入口，替代任何第三方 connector。

## 功能

- **PDF 页面角标**：直接打开一个 PDF 链接时，页面右下角出现「📄 抓取到 Library」按钮；
- **弹窗扫描**：点击工具栏图标，列出当前页面里的全部 PDF 链接，逐个抓取；
- **右键菜单**：在 PDF 链接上右键 →「抓取此 PDF 链接到 Library」；在 PDF 页面上右键 →「抓取本页 PDF 到 Library」；
- **自动元数据识别**：PDF 进入 Library 后，应用自动执行识别（RecognizeDocument），生成标准文献条目；
- **登录站点支持**：抓取经浏览器会话发起，自动携带站点 Cookie（如已登录出版商网站）。

## 安装（Edge / Chrome）

1. 打开 `edge://extensions`（或 `chrome://extensions`）；
2. 开启「开发人员模式」；
3. 点「加载解压缩的扩展」，选择本目录 `browser-extension/library-crawl/`；
4. 保持 Library 桌面应用处于打开状态即可使用。

## 协议（逆向自 Zotero Connector Server，仅用到两个端点）

| 端点 | 用途 |
|---|---|
| `GET /connector/ping` | 探活（弹窗连接状态） |
| `POST /connector/saveStandaloneAttachment` | 推送 PDF 字节流；`X-Metadata` 头携带 `sessionID` / `url` / `title`；返回 `201 {"canRecognize":true}` 表示已入库并自动识别 |

说明：官方 connector 的 `saveItems` 路径走翻译器且附件默认不下载（ATTACHMENT_MODE_IGNORE），需要多次往返；`saveStandaloneAttachment` 是单请求二进制流导入，最契合"抓 PDF"场景，故 Library Crawl 只实现这一条最短路径。

## 自定义端口

默认连接 `http://127.0.0.1:23119`。如 Library 修改了 Connector 端口，可在浏览器控制台设置：

```js
chrome.storage.local.set({ libraryServer: "http://127.0.0.1:端口" })
```
