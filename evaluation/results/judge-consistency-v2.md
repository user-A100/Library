# 双 judge 一致性报告（judge-protocol-v2，20 样本）

- 输入: judge-run-glm-v2.json, judge-run-anthropic-v2.json
- judge: judge-glm-v2 (GLM-5.3); judge-anthropic-v2 (Claude Opus 4.8 via claude_code)

## 每样本分数

| 样本 | judge-glm-v2 (GLM-5.3) | judge-anthropic-v2 (Claude Opus 4.8 via claude_code) | 极差 |
| --- | --- | --- | --- |
| F01 | 1 | 2 | 1 |
| F02 | 2 | 2 | 0 |
| F03 | 2 | 2 | 0 |
| F04 | 0 | 0 | 0 |
| F05 | 2 | 2 | 0 |
| F07 | 1 | 1 | 0 |
| F08 | 1 | 1 | 0 |
| F09 | 2 | 2 | 0 |
| F10 | 1 | 1 | 0 |
| F11 | 1 | 1 | 0 |
| F12 | 2 | 2 | 0 |
| S01 | 2 | 2 | 0 |
| S02 | 1 | 2 | 1 |
| S03 | 1 | 1 | 0 |
| bad-F06 | 0 | 0 | 0 |
| cheat-fakecite-F06 | 1 | 1 | 0 |
| cheat-padding-F06 | 1 | 1 | 0 |
| cheat-term-F06 | 0 | 0 | 0 |
| good-F06 | 1 | 1 | 0 |
| medium-F06 | 2 | 2 | 0 |

## 汇总

- 样本级 score 完全一致：**18/20**（90%），极差均值 0.10
- 断言级 verdict 一致（两 judge 均拆出的断言，按 text 前 40 字配对）：**62/65** = 95%
- Spearman ρ（样本级 score，judge-glm-v2 (GLM-5.3) × judge-anthropic-v2 (Claude Opus 4.8 via claude_code)）：**0.886**

## 分歧明细

### F01（score 极差 1）

分数：judge-glm-v2 (GLM-5.3)=1；judge-anthropic-v2 (Claude Opus 4.8 via claude_code)=2

### F10（score 极差 0）

分数：judge-glm-v2 (GLM-5.3)=1；judge-anthropic-v2 (Claude Opus 4.8 via claude_code)=1

断言分歧（text 前 40 字）：
- `支持中英日西四种语言` → judge-glm-v2 (GLM-5.3):contradict；judge-anthropic-v2 (Claude Opus 4.8 via claude_code):support

### S02（score 极差 1）

分数：judge-glm-v2 (GLM-5.3)=1；judge-anthropic-v2 (Claude Opus 4.8 via claude_code)=2

断言分歧（text 前 40 字）：
- `论文实验对比线性调度在 T=1000 下的表现` → judge-glm-v2 (GLM-5.3):no_evidence；judge-anthropic-v2 (Claude Opus 4.8 via claude_code):support

### cheat-padding-F06（score 极差 0）

分数：judge-glm-v2 (GLM-5.3)=1；judge-anthropic-v2 (Claude Opus 4.8 via claude_code)=1

断言分歧（text 前 40 字）：
- `GPT-3 展示了上下文学习的巨大潜力` → judge-glm-v2 (GLM-5.3):support；judge-anthropic-v2 (Claude Opus 4.8 via claude_code):no_evidence
