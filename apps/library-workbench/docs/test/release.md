# 发布流程与 iPadOS App 上架要求

> 调研日期：2026-07-21  
> 适用场景：将基于 iPadOS 的 App 提交到 Apple App Store，并为“启航”赛道准备可验证的上架或 TestFlight 版本。  
> 说明：Apple 的审核规则和上传要求会持续更新，正式提交前应再次检查官方页面。

## Agentero Desktop/CLI 版本发布

桌面安装包由 Tauri 配置和 Rust package 版本决定，CLI 归档文件名由发布 tag 和 Rust target 决定。因此发布时不能只创建 `v*` tag，必须先同步版本并提交。

推荐流程：

1. 执行 `/bump <version>`，同步检查 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`cli/Cargo.toml`、`src-tauri/ios-project.yml` 和 `Cargo.lock`。
2. 执行 `/commit`，将版本 bump 作为独立的 `chore(release): bump version to <version>` commit。
3. 确认 tag `v<version>` 指向该版本 bump commit，且 tag 去掉 `v` 后与所有版本字段一致。
4. 推送 tag，等待 `.github/workflows/release.yml` 构建 Tauri installers 和 CLI artifacts。
5. 在 Draft Release 中确认桌面安装包、应用内版本、CLI `--version` 和 CLI 文件名没有混用不同版本；确认 `latest.json` 与 updater `.sig` 资产齐全后才发布 Release。

`/bump` 和 `/commit` 默认只修改工作区或创建本地 commit，不会自动创建 tag、push 或发布 Release。

### Release 资产命名

Release 中区分两类资产：

| 类型 | 命名规范 | 示例 |
|---|---|---|
| 桌面安装包 | `Agentero_<version>_<arch>.<format>` | `Agentero_0.3.2_aarch64.dmg` |
| CLI 归档 | `agentero-cli-<version>-<rust-host>.<archive>` | `agentero-cli-0.3.2-aarch64-apple-darwin.tar.gz` |
| CLI 校验文件 | `<CLI 归档文件名>.sha256` | `agentero-cli-0.3.2-aarch64-apple-darwin.tar.gz.sha256` |

CLI 的 `<rust-host>` 来自发布 runner 上 `rustc -vV` 的 `host` 字段，不由工作流手写映射。例如：

- `aarch64-apple-darwin`：Apple Silicon macOS；
- `x86_64-unknown-linux-gnu`：x86_64 Linux；
- `aarch64-unknown-linux-gnu`：ARM64 Linux；
- `x86_64-pc-windows-msvc`：Windows MSVC。

CLI 压缩包内部统一包含名为 `agentero`（Windows 为 `agentero.exe`）的可执行文件；外部归档名使用 `agentero-cli-` 前缀，避免与桌面安装包混淆。

桌面安装包 **不** 嵌入真实 CLI（[#285](https://github.com/poco-ai/Agentero/issues/285)）：`externalBin` 已移除，安装目录不含任何 `agentero-cli` 文件（历史上 Windows 随包附带的批处理占位 `.exe` 会触发“不支持的 16 位应用程序”系统弹窗，已根除）。用户从 **设置 → 关于 → 安装 CLI** 下载与 App 同版本的上述归档（Host 校验 sibling `.sha256`）。独立 CLI 归档仍须随 Release 上传，供 headless 与应用内安装共用。

### Linux 支持边界

- CI：`ubuntu-22.04` / `ubuntu-24.04-arm`，依赖 `libwebkit2gtk-4.1-dev`。
- 用户侧最低：Ubuntu **22.04+**（webkit2gtk 4.1）。20.04 不支持。
- 用户文档：[`../usage/getting-started.md`](../usage/getting-started.md)（[#253](https://github.com/poco-ai/Agentero/issues/253)）。

### 应用内更新签名

Tauri Updater 的签名密钥与 Apple Developer ID 签名、公证凭据无关。应用内置的公钥位于 `src-tauri/tauri.conf.json`，私钥绝不能提交或写入本机项目配置。

GitHub Actions 必须配置以下 repository secrets；`release.yml` 会在创建 Draft Release 前显式验证它们，缺失即失败：

| Secret | 用途 |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `tauri signer generate` 产生的完整 minisign 私钥内容 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 生成该私钥时使用的密码 |

发布工作流设置 `createUpdaterArtifacts`，由 `tauri-apps/tauri-action@v1` 上传签名更新包、`.sig` 和聚合后的 `latest.json`。客户端请求 `https://github.com/poco-ai/Agentero/releases/latest/download/latest.json`，因此：

- Draft Release 用于验收，发布前不会被客户端读取；
- 只有完整、已发布的稳定版 Release 才会成为更新源；
- Windows metadata 优先采用 NSIS updater 包；macOS 与 Linux 使用 Tauri 生成的对应更新产物；
- 上述签名只证明更新包完整性，macOS 的 Developer ID 签名和 notarization 仍必须照常完成。

生成或轮换密钥时，在安全位置执行以下命令，将公钥替换到 `tauri.conf.json`，并将私钥/密码写入 GitHub Actions Secrets：

```bash
pnpm tauri signer generate --password '<strong password>' --write-keys /secure/path/agentero-updater.key
```

### macOS 签名与公证（店外分发）

GitHub Release 上的 macOS 安装包应使用 **Developer ID Application** 签名，并由 **notarytool** 公证 + staple，避免用户下载后出现「已损坏 / 无法打开」。

- 完整步骤与 secrets 列表：[`../bug_fix/macos-signing.md`](../bug_fix/macos-signing.md)
- CI：`release.yml` 的 macOS job 读取 `APPLE_CERTIFICATE*` 与公证凭据；未配置 secrets 时仍构建**未签名**包（并打 warning）
- 本地验证：导出 `APPLE_SIGNING_IDENTITY` 与公证变量后执行 `pnpm tauri build`（见文档第六步）

## 1. 结论先看

要把 App 上架到 iPadOS，至少需要完成以下事项：

- 具备 Apple Developer Program 账号，并在 App Store Connect 中创建 App 记录。
- 在 Xcode 中将 App 配置为支持 iPad 设备族，设置正确的 Bundle ID、版本号和 Build 号。
- 生成可上传的 Release 构建，并通过 Xcode、Transporter 或其他 Apple 支持的方式上传。
- 提供至少一张 iPad 商店截图，推荐直接提供 13 英寸 iPad 的高分辨率截图。
- 填写 App 名称、副标题、描述、关键词、分类、年龄分级、版权和支持网址等商店信息。
- 提供隐私政策 URL，并在 App Store Connect 中准确填写 App Privacy 数据收集信息，包括第三方 SDK 的数据行为。
- App 必须能够稳定运行，不能包含占位内容、失效链接、明显崩溃或未完成功能。
- 如果需要登录，必须向 Apple 审核提供可用的演示账号，或提供功能完整的演示模式。
- 如果 App 提供付费数字内容、订阅或功能解锁，通常必须使用 Apple 的 App 内购买。
- 提交前必须确认代码、图片、字体、音视频、数据和第三方服务均拥有合法使用权。

## 2. iPadOS 平台配置

### 2.1 App Store Connect 中的平台

在 App Store Connect 中，iPhone 和 iPad 属于同一个 **iOS 平台**。如果希望 App 同时出现在 iPhone 和 iPad 上，App 必须同时支持这两类设备。

因此，iPadOS App 通常不是单独创建一个名为“iPadOS”的平台记录，而是在 Xcode 的 iOS App 中启用 iPad 支持。

### 2.2 Xcode 项目检查项

在 Xcode 中确认：

- Target 的设备族包含 iPad，通常选择 `iPhone and iPad` 或等效配置。
- `Bundle Identifier` 与 App Store Connect 中创建的 Bundle ID 完全一致。
- `Marketing Version` 与 App Store Connect 中的版本号一致。
- `Current Project Version` / Build Number 每次上传都递增。
- Deployment Target 与实际支持的最低 iPadOS 版本一致。
- 代码使用公开 API，避免使用私有 API、未公开接口或已废弃能力。
- Release 配置可以正常 Archive，Archive 后可以进行 Validate。
- App 的图标已配置在 Asset Catalog 中，且各类尺寸完整。
- 如果使用相机、麦克风、定位、照片、蓝牙、通讯录等能力，`Info.plist` 中存在准确、面向用户的用途说明。
- 如果使用受限能力或特殊 Entitlement，已获得相应权限，并能在审核说明中解释用途。

### 2.3 iPad 体验要求

Apple 不仅检查 App 能否安装，还会关注 iPad 上的实际体验。建议至少检查：

- 竖屏、横屏和旋转过程是否正常。
- 不同尺寸 iPad 上是否出现布局溢出、按钮遮挡、文字截断或不可点击区域。
- 是否充分利用大屏，而不是简单放大 iPhone 界面。
- 多窗口、Split View、Slide Over 等场景下是否仍然可用；如果 App 不支持，应保证限制是合理且不会导致界面异常。
- 键盘、触控板、Apple Pencil（如果产品需要）交互是否明确且稳定。
- Safe Area、状态栏、底部 Home Indicator 区域和弹窗布局是否正确。
- 网络异常、无权限、空数据、加载失败、首次启动和升级后的状态是否可用。

## 3. App Store Connect 必填信息

创建 App 记录和提交版本时，通常需要准备：

### 3.1 App 基础信息

- App 名称：2 至 30 个字符。
- 副标题：不超过 30 个字符。
- Bundle ID。
- SKU。
- 主语言。
- 主分类，必要时设置次分类。
- 年龄分级。
- 版权信息。
- 内容版权声明。
- 隐私政策 URL。

### 3.2 版本信息

- 版本号。
- “本次更新内容”或版本说明。
- App 描述。
- 关键词。
- 技术支持 URL。
- 营销 URL（可选，但建议提供）。
- App Review Information。
- 审核备注。
- App Store 截图。
- App Preview 视频（可选）。

### 3.3 审核备注建议写清楚

如果 App 有以下情况，应在审核备注中主动说明：

- 测试账号、密码、验证码或演示模式进入方式（**仅当应用确实需要登录时**）。
- 需要扫码、特定硬件、特定地区或特定网络环境的功能。
- 付费功能、订阅、App 内购买的测试方式。
- 非显而易见的功能入口。
- 后端服务地址、测试数据或特殊操作流程。
- 使用相机、麦克风、定位、蓝牙、健康数据等敏感权限的原因。

Apple 要求审核人员能够完整访问和验证 App 的核心功能。后端服务在审核期间也必须保持在线。

**Agentero iOS 特有约定（无登录）：**

- **Sign-in required = No**，演示账号留空；不要为过审单独做假登录页或「输入测试网站账号」流程。
- 核心能力依赖桌面端配对：在 **App Review Notes** 中写清扫码 / 粘贴配对链接步骤，并保证中继与（可选）演示桌面在审核窗口可用。
- 可复制的元数据与 Notes 全文见 [ios-testflight.md](ios-testflight.md) 的
  [Beta review: no login, no fake test page](ios-testflight.md#beta-review-no-login-no-fake-test-page)。

## 4. iPad 商店截图要求

### 4.1 基本规则

- 截图格式：`.jpeg`、`.jpg` 或 `.png`。
- 每个设备尺寸、语言最多 10 张。
- 截图不能包含透明通道或 Alpha。
- 如果界面在多个设备尺寸和语言中相同，可以提供最高分辨率截图，让系统自动缩放。
- 但对于参加比赛或需要展示产品完成度的场景，建议提供真实 iPad 模拟器或真机截图，而不是只依赖自动缩放。

### 4.2 推荐使用的 13 英寸 iPad 截图尺寸

13 英寸 iPad 是新项目的首选截图规格。以下任一组尺寸均可：

| 方向 | 尺寸 |
|---|---:|
| 竖屏 | 2064 × 2752 |
| 横屏 | 2752 × 2064 |
| 竖屏 | 2048 × 2732 |
| 横屏 | 2732 × 2048 |

Apple 标注：如果 App 支持 iPad，13 英寸 iPad 截图是要求提供的截图规格。

### 4.3 其他常见 iPad 截图尺寸

如需提供针对其他设备的截图，可使用：

| 设备 | 竖屏 | 横屏 |
|---|---:|---:|
| 11 英寸 iPad | 1488 × 2266、1668 × 2420、1668 × 2388、1640 × 2360 | 2266 × 1488、2420 × 1668、2388 × 1668、2360 × 1640 |
| 10.5 英寸 iPad | 1668 × 2224 | 2224 × 1668 |

实际选择哪组尺寸取决于截图对应的设备型号。提交前应在 App Store Connect 的截图上传界面确认当前接受的尺寸。

### 4.4 截图内容建议

建议按以下顺序准备 5 至 8 张：

1. 首页或核心价值界面。
2. 最重要的核心功能。
3. 关键操作流程。
4. iPad 横屏或大屏布局。
5. 个性化、数据分析或结果页面。
6. 账号、设置、导出或协作功能。
7. 能体现产品差异化的页面。

截图中的文案、按钮和功能必须与实际提交版本一致，不能用夸大、虚假或 App 中不存在的功能作为宣传内容。

## 5. 隐私与数据合规

### 5.1 必须提供隐私政策

所有 iOS 平台 App 都需要在 App Store Connect 提供隐私政策 URL。该页面应公开可访问，不能要求登录，也不应是空白页面。

隐私政策至少建议说明：

- 收集哪些数据。
- 为什么收集。
- 数据保存多久。
- 是否与第三方共享。
- 使用了哪些第三方 SDK。
- 用户如何查询、更正或删除个人数据。
- 用户如何联系开发者。
- 未成年人数据处理方式（如适用）。

### 5.2 App Privacy 数据标签

必须在 App Store Connect 中填写 App Privacy，包括：

- App 是否收集数据。
- 收集的数据类型。
- 数据是否与用户身份关联。
- 数据是否用于追踪。
- 数据收集的目的。
- 第三方 SDK 或服务商收集的数据。

填写内容必须与实际行为一致。如果后续版本改变数据收集方式，需要及时更新。

### 5.3 权限用途说明

每个系统权限都必须有清楚、具体、面向用户的用途说明。例如：

- 相机：用于扫描二维码或拍摄上传图片。
- 麦克风：用于录制语音内容。
- 定位：用于显示附近地点或提供基于位置的服务。
- 照片：用于选择并上传用户主动选择的图片。

不能用笼统的“App 需要此权限”作为用途说明，也不能申请与核心功能无关的权限。

## 6. 审核容易拒绝的情况

### 6.1 App 不完整

- 启动后崩溃。
- 核心按钮无响应。
- 页面仍有“Coming Soon”“TODO”等占位内容。
- 后端接口关闭或测试账号失效。
- 主要功能需要审核人员自行猜测入口。
- 只提交演示视频，实际二进制无法运行。

### 6.2 只是网页包装

如果 App 只是一个简单的网页壳、链接集合、宣传页面或内容聚合页面，可能因缺乏足够的 App 功能而被拒。

### 6.3 隐私或权限问题

- 隐私政策无法访问。
- App Privacy 填写与实际 SDK 行为不一致。
- 申请了不必要的敏感权限。
- 未解释数据用途。
- 使用第三方 SDK 却没有纳入隐私披露。

### 6.4 付费方式不符合要求

如果在 App 内解锁数字内容、订阅、功能或虚拟物品，通常必须使用 Apple In-App Purchase。

实体商品、线下服务或某些合规的外部服务有不同规则，不能直接套用数字内容的支付方式。

### 6.5 版权和第三方服务

- 未获得图片、字体、音乐、视频、模型或数据的使用授权。
- 未获得第三方 API 或平台内容的使用许可。
- 使用其他产品的名称、图标、界面或品牌元素，造成混淆。
- 将 App 提交到不拥有相关知识产权的开发者账号下。

## 7. 上传和提交流程

1. 注册或加入 Apple Developer Program。
2. 在 App Store Connect 签署最新协议。
3. 创建 App 记录，选择 iOS 平台。
4. 配置 Bundle ID、签名证书和 Provisioning Profile。
5. 在 Xcode 中完成 iPad 支持和适配。
6. 在真机和模拟器上测试。
7. 在 Xcode 中执行 `Product > Archive`。
8. 在 Organizer 中 Validate。
9. 使用 Distribute App 上传到 App Store Connect。
10. 等待构建处理完成。
11. 选择构建版本，填写商店元数据、隐私、截图和审核信息。
12. 提交 App Review。
13. 处理审核反馈，必要时修复并重新提交。

Apple 支持通过 Xcode、Transporter、altool 或 App Store Connect API 上传构建。2026 年上传要求和 Xcode 版本可能继续变化，提交前应查看 Apple 当前的上传要求页面。

## 8. 针对“启航”赛道的额外建议

启航赛道要求的是已经具有产品形态的 App。除了满足 Apple 上架要求，建议额外准备：

- App Store 上架链接，或可正常使用的 TestFlight 链接。
- 真实版本号和最近一次更新时间。
- 真实用户或测试用户反馈。
- 产品迭代记录。
- 核心功能演示视频。
- App Store 截图与商业计划书中的产品图片保持一致。
- 能说明用户规模、留存、使用频率或测试结果的数据。
- 能说明商业模式、推广渠道和后续运营计划的材料。

如果暂时不能公开上架，至少应保证 TestFlight 构建可以被评审人员安装和使用，并准备明确的测试说明。

## 9. 提交前检查清单

- [ ] Apple Developer Program 账号有效。
- [ ] App Store Connect 已创建 iOS App 记录。
- [ ] Bundle ID 与 Xcode 完全一致。
- [ ] iPad 设备族已启用。
- [ ] iPad 竖屏、横屏和旋转已测试。
- [ ] 在至少一台真实 iPad 或对应模拟器上测试通过。
- [ ] 没有崩溃、死循环、空白页或不可用核心功能。
- [ ] 图标资源完整。
- [ ] 提供至少一组 13 英寸 iPad 截图。
- [ ] App 名称不超过 30 个字符。
- [ ] 副标题不超过 30 个字符。
- [ ] 描述、关键词、分类和年龄分级已填写。
- [ ] 隐私政策 URL 可公开访问。
- [ ] App Privacy 与实际数据收集一致。
- [ ] 所有权限用途说明准确。
- [ ] 登录功能已准备审核账号或演示模式。
- [ ] 后端服务在审核期间可访问。
- [ ] 付费数字功能使用合规的 In-App Purchase。
- [ ] 第三方图片、字体、音视频、SDK 和数据有授权或合规依据。
- [ ] 审核备注已写清楚特殊功能和测试步骤。
- [ ] Archive、Validate、Upload 均成功。

## 10. 官方依据

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [Add a new app](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/)
- [Add platforms](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-platforms/)
- [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
- [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
- [Upload app previews and screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots)
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Maximum build file sizes](https://developer.apple.com/help/app-store-connect/reference/app-uploads/maximum-build-file-sizes/)
