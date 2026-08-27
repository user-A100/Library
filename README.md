# Library

这是腾讯犀牛鸟开源实践任务的参赛项目，不是腾讯、Zotero 或 Zen Browser 的官方产品。

正式桌面端现在以 **Zotero 9.0.6 的真实 Gecko 桌面运行时**为内核，保留本地文库、SQLite 数据层、Reader、Note Editor、CSL、translators、Connector Server 和原生 XPI 生命周期。根目录原有 React/Vite 应用仅作为 Zen 风格的交互原型，不再承担插件宿主职责。

## 目录

- `desktop/zotero`：固定在 Zotero `9.0.6`（提交 `7132587c2d6d56725debe64908733a8140bc6be3`）的产品分支。
- `desktop/addons/research-workspace`：随桌面端安装的原生 Zotero XPI，使用 ItemPane、Menu、Reader 和真实条目 API。
- `src`：历史 React 视觉原型。
- `scripts`：Windows/WSL 构建、启动与验收脚本。

## 构建桌面端

要求：Windows 11、WSL2 Ubuntu 22.04、Git 和 Git LFS。脚本使用工作区内准备的 Node 22，不修改系统 Node。

```powershell
npm run desktop:build
```

产物位于：

```text
desktop/dist/Zotero_win-x64/zotero.exe
```

启动独立开发配置：

```powershell
npm run desktop:run
```

验证内核、XPI 包和 Connector Server：

```powershell
npm run desktop:verify
```

若本机已有 Zotero 占用 23119，可用隔离测试端口验证本产品进程（官方 Connector 正式使用时仍须回到 23119）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-desktop.ps1 -ConnectorPort 23120
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-desktop.ps1 -ConnectorPort 23120
```

浏览器仍需安装官方 Zotero Connector；不需要再安装官方 Zotero 桌面客户端。本产品启动后会原生提供 `127.0.0.1:23119` Connector Server。

### 皮肤

进入“工具 → 皮肤…”或设置侧栏中的“皮肤”，可在跟随系统、浅色、深色之间切换。主题编辑器沿用 Zen 的渐变状态模型：支持 1–5 个颜色点、自由拖动位置、流动配色算法、色彩强度、纹理颗粒和配色起点；调整会立即刷新所有 Library 主窗口，不改变插件挂载点。

## 插件兼容口径

支持明确声明兼容 Zotero `9.0.*` 的 XPI，并保留 `manifest.json`、`bootstrap.js`、AddonManager、`Zotero.*`、Notifier、Menu、ItemTree、ItemPane 和 Reader 扩展点。仅支持旧 XUL Overlay、超出版本范围、依赖私有 DOM 或缺少 Windows 二进制的插件不保证兼容。

## 许可和商标

Zotero 源码按 AGPLv3 分发。本项目修改后的桌面源码同样必须满足 AGPLv3 的源码提供义务。产品使用“Library”品牌，不宣称与 Zotero 官方存在隶属或背书关系。
