# AI 多配置设置页（DSH 风格）实现记录

> 日期：2026-08-27
> 模块版本：`0.15.1` → `0.16.0`
> 背景：侧栏「模型设置」弹层只能保存一套接口；参考 DSH Web GUI 设置页（`dsh-client-ui-settings-models` 等插件）的形态，升级为完整的多配置管理页。

## 入口

- Zotero **工具菜单 → AI 服务…**（`Zotero.Utilities.Internal.openPreferences("research-workspace-ai")`）
- 设置窗口左侧导航出现第二个插件面板「AI 服务」（`Zotero.PreferencePanes.register` 第二实例，与「皮肤」并列）
- AI 面板快捷设置底部「管理多个配置（导入 / 导出 / 多接口）→」直达

## 页面布局（preferences-ai.xhtml / preferences-ai.js）

仿 DSH 设置页的两栏结构：

- **左侧：配置卡片列表**——名称、Base URL、模型与已抓取模型数、密钥状态徽章，当前生效配置带「使用中」徽章；点击选中进入编辑；
- **右侧：编辑表单**——名称、接口预设（7 个内置预设自动填充 URL/模型）、Base URL、API Key（密码框，留空保持不变）、默认模型（datalist 自动补全）；
- **操作**：测试连接（用表单里的地址 + 密钥，不依赖保存状态）、抓取模型列表（`GET /models`，回填 datalist 并写入档案）、保存配置、设为当前、删除；
- **导入 / 导出**：JSON 文件（`nsIFilePicker` + `IOUtils`），格式 `{format:"library-ai-profiles", version:1, profiles:[...]}`；导出包含 API Key（页面有明文提示），导入一律新建副本不覆盖现有档案。

## 存储架构（ai-provider.js 重写）

- `aiProfiles`（pref，JSON 数组，**不含密钥**）：`{id, name, preset, protocol, baseURL, model, models[], fetchedAt}`；`protocol` 为 `openai` 或 `anthropic`，旧档案按已知预设/端点迁移，其余默认 OpenAI；
- `aiActiveProfile`（pref）：当前档案 id；对话、侧栏快捷设置、模型选择器全部跟随活动档案；
- API Key 按档案存系统凭据库：origin `library-ai://model/<id>`；
- **无缝迁移**：首次读取时把 0.15.x 的单配置（`aiProvider/aiBaseURL/aiModel` + 旧密钥 origin）自动迁移为 `default` 档案，旧密钥搬移到新 origin 并删除旧条目；
- 旧 API（`config` / `save()` / `fetchModels()` / `getCachedModels()`）语义不变，内部改走活动档案，侧栏代码零改动兼容；
- `request()` 支持 `baseURL/apiKey` 覆盖，供设置页对**未保存/未激活**的表单内容做测试与抓取。
- 请求适配器按 `protocol` 分派：OpenAI 使用 `/chat/completions` 与 `choices[].delta`，Anthropic 使用 `/v1/messages`、顶层 `system` 与 `content_block_delta`；Kimi Code 的 `k3[1m]` 在直接 API 场景归一化为 `k3`。

## 验证证据

- 行为测试 `tmp/model-fetch-test.mjs` 22/22 PASS：三种返回形态解析、错误抛出、旧配置迁移（含密钥搬移）、多档案增删切换、密钥按档案隔离、活动回退、损坏 pref 安全回退、URL 校验；
- 斜杠命令回归 30/30 PASS；`node --check` 四个脚本通过；
- 桌面验收 22/22 PASS，新增「AI multi-profile settings pane」静态检查。
