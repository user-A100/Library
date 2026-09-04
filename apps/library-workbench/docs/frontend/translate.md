# 翻译

应用级可插拔翻译：免费 MT + 商用 BYOK + BYOA Agent。

## 设置

Settings → **翻译**：

- **默认服务** 下拉：免费 MT 与 Agent 始终可选；商用仅列出已配置者。打开下拉时对免费 MT 与已配置商用并行 probe。
- 目标语言、划词自动翻译；开启后，PDF 选区文本提取完成即自动启动翻译并打开结果卡，关闭时仍可从选区菜单手动翻译。
- **商用 API** 卡片仅填写 key / endpoint / region / model；点「确定」后：
  - 将 API key 写入 Host `settings.json`（Unix 权限 `0600`）；WebView 只保留同长度 `*` 掩码，不再回显明文。
  - Host `settings_get` / `settings:changed` 对 key 按字符 redact 为 `*`；`settings_set` 收到纯 `*` 串时保留原密钥。
  - `translate_text` 在 key 缺省或为 `*` 掩码时从 Host 配置解析真实密钥。
  - 随后做一次连通性 probe。卡片不承担「设为默认」选择。
- 默认服务为 Agent 时展示 Agent / 模型座。

## 消费方

- PDF 划词菜单「翻译」（首要入口）。
  - 结果卡贴合选区锚点（`trackPin`），PDF 滚轮滚动时随页重定位。
  - 翻译完成后若未悬停结果卡 / 原文黄高亮 / 页边针，约 700ms 后自动收起；流式输出期间保持可见。隐藏后仍可从页边针重新打开。
- PDF **全文翻译**（工具栏 Languages，在视觉批注旁）：
  - 依赖版面分析 + PDF 文字层；翻译 `text` / `abstract` / `header` / `figure_title`（图题·表题）区域（score ≥ 30%）。
  - **不翻译**：算法框及其内部文字；`reference` / `reference_content` 文献条目；“References / Bibliography / 参考文献” 标题；侧栏 `aside_text`。
  - **译前归一化**（`normalizeLayoutSourceText`）：文字层是空白折叠后的单行串，先合并行末连字符断词（`repre- sentation` → `representation`，`pre- and` 这类并列保留）、展开 ligature / 去 soft hyphen、清掉落在正文 bbox 里的 arXiv 戳与会议 boilerplate、剥掉句末后粘着的页码与续段前的行号（`Table 2` 这类交叉引用不动，`header` 不做数字剥离）。
  - **跨页/跨栏段落合并**（#340）：一个段落被分栏、分页或图表切开时是多个 region。末尾无句末标点、下一片段以小写开头则判为续段，拼成一个 chain 作为**原子翻译单元**（≤ 4 片段 / 4000 字符），译文再按各片段原文长度加权、在句末→分句→空白边界切回各自 bbox。图题不打断 chain，`header` 打断。chain 内任一片段缺译文即整条重译。
  - **占位符保护**（`src/lib/translate/mask.ts`）：行内公式 / LaTeX 命令 / URL / DOI 先换成 `⟦n⟧` 再发引擎，回填时还原；引擎吞掉占位符则该 chain 用原文重译一次。
  - 按阅读顺序把 chain **分批**翻译（`buildTranslateBatches`）：批内 payload ≤ 4500 字符（约一页双栏正文），用 `[[n]]` 编号拼成一次请求，让引擎看到上下文；译文按 `[[n]]` 标记切回、逐块写回原 bbox 位置。标记解析不一致时该批**回退为逐段翻译**，保证不丢块。并发 2（Agent 串行）；**每批完成立刻**在 bbox 上盖译文层（非整页等齐）。
  - 每页纸张右上角外侧常驻窄页签可只翻译本页；页签 hover 不弹出额外文字；本页已有可见译文时，页签切换为隐藏本页译文。隐藏只影响当前 UI 覆盖层，不删除磁盘缓存。
  - 译文按论文写入 `{paper}/source/layout-translate.json`。缓存命中需匹配 provider / 源语言 / 目标语言 / 非密钥服务配置，并逐块校验 region id + 原文（存的是归一化后的原文，归一化规则变化时旧缓存会 miss 一次并重译）；版面或目标语言变化时只复用仍匹配的块。
  - 单页翻译写缓存时按同一 cache key 增量合并，避免只翻译一页时覆盖其它页已经落盘的译文。
  - 运行中再点=停止；有译文再点=清除。实现：`layout-translate.ts` + `layout-translate-source.ts` + `layout-translate-overlay.tsx`。
  - 覆盖层按当前 PDF 页面背景 tone 绘制纸面底色（深字）；暗色下套用与页面栅格相同的 invert filter（`PDF_PAGE_RASTER_DARK_CLASS`），使盖住原文的底色与反转后的纸面一致。
- API：`runTranslate(task)`（`src/lib/translate/`）。

## Prompt

`buildTranslatePrompt`（Agent 路径）与 Host `openai_translate_prompt`（OpenAI-compatible 路径）共用同一套约束，改一处要同步另一处：

- 定位为学术论文译者；要求**按意思重组语序**（可拆长句），而不是逐词直译。
- 公式 / 符号 / 变量 / 单位 / 行内代码 / URL / 引用标记 / 图表公式编号 / `⟦n⟧` 占位符原样保留。
- 术语用领域惯用译法并保持一致，首次出现补原文，如 `注意力机制（attention）`。
- 不增删、不解释、不加译注和 markdown 围栏；只输出译文。
- 批量 payload 额外要求保留 `[[n]]` 标记、顺序与段数，不合并段落。
- OpenAI-compatible 的 `temperature` 用 0.2（0.0 的直译感太强）。

## 路径

| 类型 | 路径 |
|---|---|
| 免费 MT | Host `translate_text`（腾讯交互翻译 / 火山 Web / DeepLX / Google gtx） |
| 商用 BYOK | Host `translate_text`（DeepL / Azure / Google Cloud / OpenAI-compatible） |
| Agent | `agent_run_once` + 翻译 prompt；同一篇文献的多次翻译复用同一个 ACP provider session |

结果可写入 `marks/`（划词）。Host 细节：[../backend/translate.md](../backend/translate.md)。
