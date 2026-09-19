# 人工盲标 vs judge 一致性（judge-vs-human）

> 标注者：评测设计者本人（非独立第二标注者，盲评——标注时未见任何 judge 结果）。
> 标注表：`annotation-sheet-evidence.md`；样本 10 个，主张 70 条。

## judge-glm-v2 (GLM-5.3)

- claim 级配对：43 条（人工主张与该 judge 主张按前 40 字可配对的部分）
- claim 级原始一致率：41/43 = 95%
- claim 级 Cohen's κ（三分类）：**0.901**
- 答案级 score 完全一致：7/10 = 70%
- 答案级 Spearman ρ：**0.803**

混淆矩阵（行=人工，列=judge）：

| 人工\judge | support | contradict | no_evidence |
| --- | --- | --- | --- |
| support | 29 | 0 | 2 |
| contradict | 0 | 6 | 0 |
| no_evidence | 0 | 0 | 6 |

## judge-anthropic-v2 (Claude Opus 4.8 via claude_code)

- claim 级配对：40 条（人工主张与该 judge 主张按前 40 字可配对的部分）
- claim 级原始一致率：37/40 = 92%
- claim 级 Cohen's κ（三分类）：**0.829**
- 答案级 score 完全一致：9/10 = 90%
- 答案级 Spearman ρ：**0.949**

混淆矩阵（行=人工，列=judge）：

| 人工\judge | support | contradict | no_evidence |
| --- | --- | --- | --- |
| support | 28 | 0 | 2 |
| contradict | 0 | 5 | 0 |
| no_evidence | 0 | 1 | 4 |
