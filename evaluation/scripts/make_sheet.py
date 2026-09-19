#!/usr/bin/env python3
"""从 v2 judge runs 生成人工盲标注表（隐藏两个 judge 的 verdict/fabricated/score）。

用法: python make_sheet.py results/judge-run-glm-v2.json results/judge-run-anthropic-v2.json
输出: evaluation/annotation/annotation-sheet.md
断言清单 = 两个 judge 拆解结果的并集（按 text 前 40 字去重，取首见全文）。
"""
import json
import sys
from pathlib import Path

def main(files):
    samples = {}  # case -> {key40: claim_text}
    for f in files:
        data = json.loads(Path(f).read_text(encoding="utf-8"))
        for case, r in data["runs"].items():
            claims = samples.setdefault(case, {})
            for c in r.get("claims", []):
                claims.setdefault(c["text"][:40], c["text"])

    out = [
        "# 人工盲标注表（judge-vs-human 一致性实验）", "",
        "对每条主张独立判定（定义见 `../judge-protocol-v2.md`）：",
        "- `support`：可从论文源直接推出",
        "- `contradict`：与原文冲突（数字、结论、实验设置错误）",
        "- `no_evidence`：原文未提及或无法推出", "",
        "**填写方式**：把选中项的 `[ ]` 改成 `[x]`，每条恰好勾一个；",
        "可在「依据短语」后补源文件短语。`fabricated` 行：该回答编造了具体数字/实验结论则勾选。",
        "请勿修改主张原文，请勿查看 `evaluation/results/` 下任何 judge 结果（盲评）。预计 40–60 分钟。",
        "",
    ]
    for case in sorted(samples):
        out.append(f"## {case}")
        out.append("")
        out.append("fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）")
        for i, text in enumerate(samples[case].values(), 1):
            t = text.replace("|", "\\|")
            out.append(f"{i}. [ ] support  [ ] contradict  [ ] no_evidence ｜ {t}")
            out.append("   依据短语（可选）:")
        out.append("")

    target = Path(__file__).resolve().parent.parent / "annotation" / "annotation-sheet.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(out), encoding="utf-8")
    total = sum(len(v) for v in samples.values())
    print(f"已生成 {target}（{len(samples)} 样本 / {total} 条主张）")


if __name__ == "__main__":
    main(sys.argv[1:])
