#!/usr/bin/env python3
"""从 v2 judge runs 生成人工盲标注表（隐藏两个 judge 的 verdict/fabricated/score）。

用法: python make_sheet.py results/judge-run-glm-v2.json results/judge-run-anthropic-v2.json
      python make_sheet.py <runs...> --samples F03,F12,S03,F08 --max-claims 7
输出: evaluation/annotation/annotation-sheet.md（+ 抽样时另出 annotation-sample.json 记录抽样方案）
断言清单 = 两个 judge 拆解结果的并集（按 text 前 40 字去重，取首见全文）。
"""
import json
import sys
from pathlib import Path


def even_pick(items, k):
    """等距抽取 k 条（保持原序、确定性、含首尾）。"""
    n = len(items)
    if k >= n:
        return items
    if k == 1:
        return [items[0]]
    idx = sorted({round(i * (n - 1) / (k - 1)) for i in range(k)})
    return [items[i] for i in idx]


def load_cases(samples_json):
    """case id -> {paper, q}，供标注者定位论文原文。"""
    data = json.loads(Path(samples_json).read_text(encoding="utf-8"))
    return {c["id"]: c for c in data.get("cases", [])}


def main(argv):
    files, samples_filter, max_claims = [], None, None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--samples":
            i += 1
            samples_filter = [s.strip() for s in argv[i].split(",") if s.strip()]
        elif a == "--max-claims":
            i += 1
            max_claims = int(argv[i])
        else:
            files.append(a)
        i += 1

    cases = load_cases(Path(__file__).resolve().parent.parent / "samples" / "samples.json")

    samples = {}  # case -> {key40: claim_text}
    for f in files:
        data = json.loads(Path(f).read_text(encoding="utf-8"))
        for case, r in data["runs"].items():
            claims = samples.setdefault(case, {})
            for c in r.get("claims", []):
                claims.setdefault(c["text"][:40], c["text"])

    selected = sorted(samples_filter) if samples_filter else sorted(samples)
    missing = [s for s in selected if s not in samples]
    if missing:
        print(f"样本不存在于 judge runs：{', '.join(missing)}")
        sys.exit(1)

    sampled = max_claims is not None
    per_case = {c: (even_pick(list(samples[c].values()), max_claims) if sampled
                    else list(samples[c].values())) for c in selected}

    out = [
        "# 人工盲标注表（judge-vs-human 一致性实验）", "",
        "对每条主张独立判定（定义见 `../judge-protocol-v2.md`）：",
        "- `support`：可从论文源直接推出",
        "- `contradict`：与原文冲突（数字、结论、实验设置错误）",
        "- `no_evidence`：原文未提及或无法推出", "",
        "**填写方式**：把选中项的 `[ ]` 改成 `[x]`，每条恰好勾一个；",
        "可在「依据短语」后补源文件短语。`fabricated` 行：该回答编造了具体数字/实验结论则勾选。",
        "请勿修改主张原文，请勿查看 `evaluation/results/` 下任何 judge 结果（盲评）。", "",
        "**去哪查原文**：每节标题给出论文 arXiv id 与问题；论文源在",
        "`C:\\Users\\111222\\Desktop\\paper\\papers\\<id>\\`（`PAPER.md`，或无则 `source\\*.tex`），",
        "用关键词搜原文即可核对。", "",
    ]
    if sampled:
        out += [
            f"> **抽样说明**：全量 {len(samples)} 样本 / {sum(len(v) for v in samples.values())} 条断言，"
            f"本表为分层抽样子集——{len(selected)} 样本，每样本等距取 ≤{max_claims} 条，"
            f"共 {sum(len(v) for v in per_case.values())} 条。抽样方案见 `annotation-sample.json`。",
            "",
        ]
    for case in selected:
        # validity 变体（good-F06 / cheat-padding-F06 / …）回退到其基例（F06）的论文与问题
        c = cases.get(case) or cases.get(case.rsplit("-", 1)[-1], {})
        head = f"## {case}"
        if c.get("paper"):
            head += f" · 论文 `{c['paper']}`"
        out.append(head)
        out.append("")
        if c.get("q"):
            out.append(f"问题：{c['q']}")
            out.append("")
        out.append("fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）")
        for n, text in enumerate(per_case[case], 1):
            t = text.replace("|", "\\|")
            out.append(f"{n}. [ ] support  [ ] contradict  [ ] no_evidence ｜ {t}")
            out.append("   依据短语（可选）:")
        out.append("")

    base = Path(__file__).resolve().parent.parent / "annotation"
    base.mkdir(parents=True, exist_ok=True)
    target = base / "annotation-sheet.md"
    target.write_text("\n".join(out), encoding="utf-8")
    total = sum(len(v) for v in per_case.values())
    if sampled:
        (base / "annotation-sample.json").write_text(json.dumps({
            "sampled": True,
            "full_samples": len(samples),
            "full_claims": sum(len(v) for v in samples.values()),
            "samples": selected,
            "max_claims_per_sample": max_claims,
            "claims": total,
            "method": "按样本分层（覆盖 judge 共识分数的 0/1/2 三档与作弊样本），样本内等距取断言",
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已生成 {target}（{len(selected)} 样本 / {total} 条主张）")


if __name__ == "__main__":
    main(sys.argv[1:])
