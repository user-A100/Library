# Judge 任务 v2：LLM 忠实性评审（20 样本 · 9 篇论文 · 独立评审，请勿参考其他评审结果）

> 与 v1（`judge-protocol.md`，单论文 6 样本）的区别：样本从 6 扩到 20，覆盖 9 篇论文的正式评测回答；判定协议与输出 schema 与 v1 完全一致。
> 去重说明：`answers/F06.md` 与 `validity/good-F06.md` 内容完全相同，F06 不重复评审，以 good-F06 为准。

你是独立 judge。对下列 20 个回答文件逐条做**原子断言拆解 + 忠实性判定**。

## 来源文本（唯一事实依据）

每篇论文的 LaTeX 源，位于 `C:\Users\111222\Desktop\paper\papers\<arXiv id>\source\`。
逐组进行：先读该组论文的主 tex（跟随 `\input`/`\include` 展开相关章节），再评该组答案。可针对答案中的具体数字/结论在源文件中检索定位。

| 论文 | 主文件（source/ 下） | 待评样本 |
| --- | --- | --- |
| 1706.03762 Attention | `ms.tex`（+ `model_architecture.tex`、`results.tex` 等 `\input` 节） | F01, F02, F12, S01 |
| 2005.14165 GPT-3 | `main.tex`（章节在子目录，跟随 `\input`） | F11 |
| 2006.11239 DDPM | `main.tex` | F03, F04, S02 |
| 2103.00020 CLIP | `clip_paper.tex` | F05 |
| 2201.11903 CoT | `neurips_2022.tex` | good-F06, medium-F06, bad-F06, cheat-padding-F06, cheat-term-F06, cheat-fakecite-F06（validity/ 组） |
| 2210.03629 ReAct | `iclr2023_conference.tex` | F07 |
| 2510.16046 CARDIO-Affect | `main.tex` | F08, S03 |
| 2601.03888 IndexTTS 2.5 | `main.tex` | F10 |
| 2609.05256 生理信号情感识别 | `conference_101719_TL.tex` | F09 |

## 待评文件与对应问题

`D:\Mycraft\tencent-fight\evaluation\answers\` 下 14 份（F01–F05, F07–F12, S01–S03）与 `D:\Mycraft\tencent-fight\evaluation\validity\` 下 6 份，共 20 份。每份回答针对的问题：

| 样本 | 论文 | 问题 |
| --- | --- | --- |
| F01 | 1706.03762 | Transformer 的编码器-解码器注意力中，Query、Key、Value 分别来自哪里？ |
| F02 | 1706.03762 | 论文使用的 Adam 优化器学习率调度策略是怎样的？warmup 步数是多少？ |
| F03 | 2006.11239 | DDPM 的前向扩散过程 q(x_t\|x_{t-1}) 的均值和方差分别是什么？ |
| F04 | 2006.11239 | 训练目标中 L_{t-1} 为什么可以简化为 L_simple？ |
| F05 | 2103.00020 | CLIP 的对比学习矩阵中，对角线为什么是正样本？batch 内其余位置是什么？ |
| F07 | 2210.03629 | ReAct 在 HotpotQA 上的成功率和错误类型与纯推理 (CoT) 基线相比如何？ |
| F08 | 2510.16046 | CARDIO-Affect 用了哪四大数学支柱建模个体与群体情感？ |
| F09 | 2609.05256 | 该情感识别实验使用了哪些生理信号？受控情绪刺激如何施加？ |
| F10 | 2601.03888 | IndexTTS 2.5 的情感控制是如何实现的？零样本情感复制是什么含义？ |
| F11 | 2005.14165 | GPT-3 的 few-shot、one-shot、zero-shot 评估设置分别是什么？ |
| F12 | 1706.03762 | 多头注意力的输出维度如何由 h 个头拼接得到？每个头的维度是多少？ |
| S01 | 1706.03762 | 综合位置编码与多头注意力两节，说明为什么 Transformer 不再用循环结构？（要求引用至少两处不同页码） |
| S02 | 2006.11239 | 结合算法 1 与算法 2，说明训练与采样在方差调度上的对应关系。（要求引用至少两处不同页码） |
| S03 | 2510.16046 | 综合哈密顿量 SDE 与 Fisher-Rao 流形两部分，说明个体情感为什么被建模为多稳态系统。（要求引用至少两处） |
| good/medium/bad/cheat-padding/cheat-term/cheat-fakecite-F06 | 2201.11903 | 思维链提示在 GSM8K 上带来了多少性能提升？标准提示与 CoT 提示各自的表现是什么？ |

## 判定协议

1. 把每个回答拆成原子断言（每条一个可独立核查的事实性陈述，忽略寒暄与结构词）
2. 每条断言判定：
   - `support`：可从论文源直接推出（给出源文件中的原文依据短语）
   - `contradict`：与原文冲突（数字、结论、实验设置错误）
   - `no_evidence`：原文未提及或无法从原文推出
3. 两条硬规则：
   - 编造具体数字/实验结论 → 该题忠实性直接 0 分
   - 出现任一 `contradict` → 该题分数封顶 1（满分 2）
4. 回答中的 `【来源 n · p.N · block:ID】` 引用标记不用评审（引用真实性由规则层另行判定），只评陈述内容本身

## 输出格式（严格 JSON，UTF-8，写入你回复的最后）

```json
{
  "meta": {"judge": "<你的身份，例：judge-glm-v2 (GLM-5.3)>", "date": "2026-09-19", "protocol": "judge-protocol-v2.md"},
  "runs": {
    "F01": {"claims": [{"text": "...", "verdict": "support", "evidence": "源文件原文短语"}], "faithfulness": 1.0, "fabricated": false, "capped": false, "score": 2},
    "...": {}
  }
}
```

- `faithfulness` = support 数 / 总断言数（两位小数）
- `score`：忠实且无矛盾=2；仅 no_evidence（未编造未矛盾）=1；否则 0
- cheat-fakecite-F06 的 `score` 只按忠实性协议评，引用真实性你不用管
- 20 个样本的 `runs` 键名必须与上表样本 ID 完全一致（validity 组用完整文件名如 `good-F06`）
