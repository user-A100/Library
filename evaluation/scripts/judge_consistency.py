#!/usr/bin/env python3
"""计算多 judge 一致性：逐样本 score 一致率 + 逐断言 verdict 一致率 + 分数波动 + judge 间 Spearman ρ。

用法: python judge_consistency.py results/judge-run*.json [--md results/judge-consistency-v2.md]
"""
import json
import sys
from pathlib import Path

VERDICTS = ("support", "contradict", "no_evidence")


def spearman(xs, ys):
    """Spearman 秩相关（并列取平均秩），stdlib 实现。"""
    def ranks(v):
        idx = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(idx):
            j = i
            while j + 1 < len(idx) and v[idx[j + 1]] == v[idx[i]]:
                j += 1
            for k in range(i, j + 1):
                r[idx[k]] = (i + j) / 2 + 1
            i = j + 1
        return r
    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return num / den if den else float("nan")


def load_runs(files):
    runs = {}
    for f in files:
        data = json.loads(Path(f).read_text(encoding="utf-8"))
        judge = data.get("meta", {}).get("judge", Path(f).stem)
        for case, r in data["runs"].items():
            runs.setdefault(case, {})[judge] = r
    return runs


def consistency(runs):
    """返回 (judge 名列表, 每样本分数 dict, 汇总统计 dict, 分歧明细 list)"""
    judges = list(next(iter(runs.values())))
    per_sample = {}
    score_agree = claim_pairs = claim_agree = 0
    score_spread = []
    disagreements = []
    for case in sorted(runs):
        js = runs[case]
        scores = {n: js[n]["score"] for n in judges}
        spread = max(scores.values()) - min(scores.values())
        score_spread.append(spread)
        if spread == 0:
            score_agree += 1
        # 逐断言: 按 text 模糊配对（judge-1 无 evidence 字段，仅比较 verdict）
        verdicts = {}
        for n in judges:
            for c in js[n].get("claims", []):
                verdicts.setdefault(c["text"][:40], {})[n] = c["verdict"]
        case_claim_disagree = []
        for text, v in verdicts.items():
            if len(v) == len(judges):
                claim_pairs += 1
                if len(set(v.values())) == 1:
                    claim_agree += 1
                else:
                    case_claim_disagree.append((text, dict(v)))
        per_sample[case] = scores
        if spread > 0 or case_claim_disagree:
            disagreements.append((case, spread, scores, case_claim_disagree,
                                  {n: [c["text"] for c in js[n].get("claims", [])] for n in judges}))
    n = len(runs)
    stats = {
        "judges": judges, "n": n, "score_agree": score_agree,
        "score_spread": score_spread, "claim_pairs": claim_pairs, "claim_agree": claim_agree,
    }
    return judges, per_sample, stats, disagreements


def pairwise_spearman(judges, per_sample):
    """样本级 score 的两两 Spearman ρ。"""
    out = {}
    for i in range(len(judges)):
        for j in range(i + 1, len(judges)):
            a, b = judges[i], judges[j]
            xs = [per_sample[c][a] for c in sorted(per_sample)]
            ys = [per_sample[c][b] for c in sorted(per_sample)]
            out[f"{a} × {b}"] = spearman(xs, ys)
    return out


def main():
    args = sys.argv[1:]
    md_out = None
    if "--md" in args:
        i = args.index("--md")
        md_out = args[i + 1]
        del args[i:i + 2]
    files = args
    runs = load_runs(files)
    judges, per_sample, stats, disagreements = consistency(runs)
    rhos = pairwise_spearman(judges, per_sample)

    header = f"{'sample':22s} " + " ".join(f"{j[:12]:>12s}" for j in judges)
    print(header)
    for case in sorted(per_sample):
        row = " ".join(f"{per_sample[case][n]:>12d}" for n in judges)
        spread = max(per_sample[case].values()) - min(per_sample[case].values())
        print(f"{case:22s} {row}  spread={spread}")
    n = stats["n"]
    print(f"\n样本级 score 完全一致: {stats['score_agree']}/{n}")
    print(f"分数极差分布: {stats['score_spread']} (均值 {sum(stats['score_spread'])/n:.2f})")
    print(f"断言级完全一致(可配对): {stats['claim_agree']}/{stats['claim_pairs']} = {stats['claim_agree']/max(1,stats['claim_pairs']):.0%}")
    for pair, rho in rhos.items():
        print(f"Spearman ρ ({pair}): {rho:.3f}")

    if md_out:
        md = [f"# 双 judge 一致性报告（judge-protocol-v2，{n} 样本）", "",
              f"- 输入: {', '.join(Path(f).name for f in files)}",
              f"- judge: {'; '.join(judges)}", "",
              "## 每样本分数", "",
              "| 样本 | " + " | ".join(judges) + " | 极差 |",
              "| --- | " + " | ".join("---" for _ in judges) + " | --- |"]
        for case in sorted(per_sample):
            s = per_sample[case]
            md.append(f"| {case} | " + " | ".join(str(s[x]) for x in judges)
                      + f" | {max(s.values()) - min(s.values())} |")
        md += ["", "## 汇总", "",
               f"- 样本级 score 完全一致：**{stats['score_agree']}/{n}**"
               f"（{stats['score_agree']/n:.0%}），极差均值 {sum(stats['score_spread'])/n:.2f}",
               f"- 断言级 verdict 一致（两 judge 均拆出的断言，按 text 前 40 字配对）："
               f"**{stats['claim_agree']}/{stats['claim_pairs']}**"
               f" = {stats['claim_agree']/max(1,stats['claim_pairs']):.0%}"]
        for pair, rho in rhos.items():
            md.append(f"- Spearman ρ（样本级 score，{pair}）：**{rho:.3f}**")
        md += ["", "## 分歧明细", ""]
        if not disagreements:
            md.append("无分歧样本。")
        for case, spread, scores, claim_dis, _texts in disagreements:
            md.append(f"### {case}（score 极差 {spread}）")
            md.append("")
            md.append("分数：" + "；".join(f"{k}={v}" for k, v in scores.items()))
            if claim_dis:
                md.append("")
                md.append("断言分歧（text 前 40 字）：")
                for text, v in claim_dis:
                    md.append(f"- `{text}` → " + "；".join(f"{k}:{ver}" for k, ver in v.items()))
            md.append("")
        Path(md_out).write_text("\n".join(md), encoding="utf-8")
        print(f"\n已写入 {md_out}")


if __name__ == "__main__":
    main()
