#!/usr/bin/env python3
"""计算多 judge 一致性：逐样本 score 一致率 + 逐断言 verdict 一致率 + 分数波动。

用法: python judge_consistency.py results/judge-run*.json
"""
import json, sys, itertools
from pathlib import Path

runs = {}
for f in sys.argv[1:]:
    data = json.loads(Path(f).read_text(encoding="utf-8"))
    judge = data.get("meta", {}).get("judge", Path(f).stem)
    for case, r in data["runs"].items():
        runs.setdefault(case, {})[judge] = r

print(f"{'sample':22s} " + " ".join(f"{j[:12]:>12s}" for j in next(iter(runs.values()))))
score_agree = claim_pairs = claim_agree = 0
score_spread = []
for case in sorted(runs):
    js = runs[case]
    names = list(js)
    scores = [js[n]["score"] for n in names]
    spread = max(scores) - min(scores)
    score_spread.append(spread)
    if spread == 0:
        score_agree += 1
    # 逐断言: 按 text 模糊配对（judge-1 无 evidence 字段，仅比较 verdict）
    verdicts = {}
    for n in names:
        for c in js[n].get("claims", []):
            verdicts.setdefault(c["text"][:40], []).append(c["verdict"])
    for texts in verdicts.values():
        if len(texts) == len(names):
            claim_pairs += 1
            if len(set(texts)) == 1:
                claim_agree += 1
    row = " ".join(f"{s:>12d}" for s in scores)
    print(f"{case:22s} {row}  spread={spread}")

n = len(runs)
print(f"\n样本级 score 完全一致: {score_agree}/{n}")
print(f"分数极差分布: {score_spread} (均值 {sum(score_spread)/n:.2f})")
print(f"断言级完全一致(可配对): {claim_agree}/{claim_pairs} = {claim_agree/max(1,claim_pairs):.0%}")
