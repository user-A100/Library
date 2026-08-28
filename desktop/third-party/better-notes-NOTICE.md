# Library Notes / Better Notes

Library 随桌面构建分发 **Library Notes 3.3.4**。它是基于 Better Notes for
Zotero 3.3.3 制作的品牌化衍生版本，保留笔记链接、模板、Markdown 双向同步、
冲突比较和多格式导出能力。

- 上游作者：windingwind 及 Better Notes 贡献者
- Library 修改：Library contributors
- 修改日期：2026-08-28
- 上游扩展 ID：`Knowledge4Zotero@windingwind.com`
- Library 扩展 ID：`library-notes@user-a100.local`
- 上游项目：https://github.com/windingwind/zotero-better-notes
- 对应源码：https://github.com/windingwind/zotero-better-notes/tree/v3.3.3
- 固定源码提交：`4215a882e9f3528ddd4820c20b2c29e732c14e7e`
- Library 构建与品牌补丁：https://github.com/user-A100/Library
- 许可证：GNU Affero General Public License v3.0 or later
- 完整许可证：https://github.com/windingwind/zotero-better-notes/blob/v3.3.3/LICENSE

Library 对该组件做了以下修改：替换插件清单中的名称、描述、主页、图标和更新策略；
将用户可见的 Better Notes / Zotero 产品文案替换为 Library Notes / Library；使用
独立扩展 ID 与偏好前缀；提供 `Zotero.LibraryNotes` 兼容门面。底层宿主 API、
`zotero://note` 链接协议、笔记数据结构与模板中的技术类型名保持不变，以保护现有
数据和插件兼容性。

该衍生组件继续按 GNU AGPL v3 或更高版本分发，不附带任何明示或默示担保。
上游源码、Library 的品牌化构建脚本、修改说明和安装方式均可从上述仓库免费获取。
