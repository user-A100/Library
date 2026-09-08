# Judge 任务：LLM 忠实性评审（独立评审，请勿参考其他评审结果）

你是独立 judge。对下列 6 个回答文件逐条做**原子断言拆解 + 忠实性判定**。

## 来源文本（唯一事实依据）

- 论文 PDF/LaTeX：`D:\Mycraft\tencent-fight` 仓库外 → 使用 `C:\Users\111222\Desktop\paper\papers\2201.11903\PAPER.md`（该论文的全文文本，含页标记）。如该文件不存在，改用同目录 `source/` 下的 LaTeX 文件。
- 问题（所有 6 个回答针对同一问题）：《思维链提示在 GSM8K 上带来了多少性能提升？标准提示与 CoT 提示各自的表现是什么？》

## 待评文件（都在 D:\Mycraft\tencent-fight\evaluation\validity\ 下）

good-F06.md / medium-F06.md / bad-F06.md / cheat-padding-F06.md / cheat-term-F06.md / cheat-fakecite-F06.md

## 判定协议

1. 把每个回答拆成原子断言（每条一个可独立核查的事实性陈述，忽略寒暄与结构词）
2. 每条断言判定：
   - `support`：可从 PAPER.md 直接推出（给出 PAPER.md 中的原文依据短语）
   - `contradict`：与原文冲突（数字、结论、实验设置错误）
   - `no_evidence`：原文未提及或无法从原文推出
3. 两条硬规则：
   - 编造具体数字/实验结论 → 该题忠实性直接 0 分
   - 出现任一 `contradict` → 该题分数封顶 1（满分 2）

## 输出格式（严格 JSON，UTF-8，写入你回复的最后）

```json
{
  "runs": {
    "good-F06": {"claims": [{"text": "...", "verdict": "support", "evidence": "原文短语"}], "faithfulness": 1.0, "fabricated": false, "capped": false, "score": 2},
    ...
  }
}
```

- `faithfulness` = support 数 / 总断言数（两位小数）
- `score`：忠实且无矛盾=2；仅 no_evidence（未编造未矛盾）=1；否则 0
- cheat-fakecite-F06 的 `score` 只按忠实性协议评，引用真实性由规则层另行判定，你不用管
