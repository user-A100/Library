#!/usr/bin/env python3
"""计算人工盲标 vs 各 judge 的一致性：claim 级 Cohen's κ + 混淆矩阵 + 答案级 Spearman ρ/一致率。

用法: python kappa.py ../annotation/annotation-sheet.md results/judge-run-glm-v2.json [more-judge-runs.json]
输出: results/human-agreement.md（标注不全则拒绝计算并退出码 2）
"""
import json
import re
import sys
from pathlib import Path

from judge_consistency import spearman

VERDICTS = ("support", "contradict", "no_evidence")
CLAIM_RE = re.compile(r"^\d+\. \[( |x|X)\] support\s+\[( |x|X)\] contradict\s+\[( |x|X)\] no_evidence ｜ (.*)$")
FAB_RE = re.compile(r"^fabricated: \[( |x|X)\]")


def parse_sheet(path):
    human, unfilled = {}, 0
    cur = None
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        m = re.match(r"^## (\S+)", line)
        if m:
            cur = m.group(1)
            human[cur] = {"fabricated": False, "claims": []}
            continue
        if cur is None:
            continue
        m = FAB_RE.match(line)
        if m:
            human[cur]["fabricated"] = m.group(1) in "xX"
            continue
        m = CLAIM_RE.match(line)
        if m:
            marks = (m.group(1), m.group(2), m.group(3))
            filled = [v for v, mk in zip(VERDICTS, marks) if mk in "xX"]
            if len(filled) != 1:
                unfilled += 1
                continue
            human[cur]["claims"].append({"text": m.group(4).replace("\\|", "|"), "verdict": filled[0]})
    return human, unfilled


def fold_score(claims, fabricated):
    """与 judge 实操一致的折算：fabricated 或含 contradict → 0；否则 faithfulness≥0.75 → 2，否则 1。
    （v1 实测锚点：good 0.89→2、fakecite 0.80→2、padding 0.36→1）"""
    if fabricated or "contradict" in [c["verdict"] for c in claims]:
        return 0
    f = sum(c["verdict"] == "support" for c in claims) / len(claims) if claims else 0.0
    return 2 if f >= 0.75 else 1


def cohen_kappa(a, b):
    po = sum(x == y for x, y in zip(a, b)) / len(a)
    pe = sum(a.count(c) * b.count(c) for c in VERDICTS) / len(a) ** 2
    return (po - pe) / (1 - pe) if pe < 1 else float("nan")


def main():
    sheet_path = sys.argv[1]
    judge_files = sys.argv[2:]
    human, unfilled = parse_sheet(sheet_path)
    if unfilled:
        print(f"标注未完成：还有 {unfilled} 条主张未勾选或复选，补齐后再运行。")
        sys.exit(2)
    if not any(h.get("claims") for h in human.values()):
        print("标注表为空。")
        sys.exit(2)

    md = ["# 人工盲标 vs judge 一致性（judge-vs-human）", "",
          "> 标注者：评测设计者本人（非独立第二标注者，盲评——标注时未见任何 judge 结果）。",
          f"> 标注表：`{Path(sheet_path).name}`；样本 {len(human)} 个，主张 "
          f"{sum(len(h['claims']) for h in human.values())} 条。", ""]

    for f in judge_files:
        data = json.loads(Path(f).read_text(encoding="utf-8"))
        judge = data.get("meta", {}).get("judge", Path(f).stem)
        human_v, judge_v = [], []
        conf = {h: {j: 0 for j in VERDICTS} for h in VERDICTS}
        h_scores, j_scores = {}, {}
        paired_claims_human, paired_claims_total = 0, 0
        for case, r in data["runs"].items():
            h = human.get(case)
            if not h:
                continue
            jmap = {c["text"][:40]: c["verdict"] for c in r.get("claims", [])}
            for hc in h["claims"]:
                k = hc["text"][:40]
                if k in jmap:
                    paired_claims_total += 1
                    human_v.append(hc["verdict"])
                    judge_v.append(jmap[k])
                    conf[hc["verdict"]][jmap[k]] += 1
            h_scores[case] = fold_score(h["claims"], h["fabricated"])
            j_scores[case] = r["score"]
        if not human_v:
            md += [f"## {judge}", "", "无可配对断言。", ""]
            continue
        kappa = cohen_kappa(human_v, judge_v)
        cases = sorted(h_scores)
        rho = spearman([h_scores[c] for c in cases], [j_scores[c] for c in cases])
        exact = sum(h_scores[c] == j_scores[c] for c in cases)
        md += [f"## {judge}", "",
               f"- claim 级配对：{paired_claims_total} 条（人工主张与该 judge 主张按前 40 字可配对的部分）",
               f"- claim 级原始一致率：{sum(x == y for x, y in zip(human_v, judge_v))}/{len(human_v)}"
               f" = {sum(x == y for x, y in zip(human_v, judge_v))/len(human_v):.0%}",
               f"- claim 级 Cohen's κ（三分类）：**{kappa:.3f}**",
               f"- 答案级 score 完全一致：{exact}/{len(cases)} = {exact/len(cases):.0%}",
               f"- 答案级 Spearman ρ：**{rho:.3f}**",
               "", "混淆矩阵（行=人工，列=judge）：", "",
               "| 人工\\judge | " + " | ".join(VERDICTS) + " |",
               "| --- | " + " | ".join("---" for _ in VERDICTS) + " |"]
        for hcat in VERDICTS:
            md.append(f"| {hcat} | " + " | ".join(str(conf[hcat][j]) for j in VERDICTS) + " |")
        md.append("")

    out = Path(__file__).resolve().parent.parent / "results" / "human-agreement.md"
    out.write_text("\n".join(md), encoding="utf-8")
    print(f"已写入 {out}")


if __name__ == "__main__":
    main()
