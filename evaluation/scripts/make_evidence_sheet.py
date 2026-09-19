#!/usr/bin/env python3
"""为人工盲标表逐条抓取论文原文证据，生成「8 分钟对照版」标注表。

用法: python make_evidence_sheet.py ../annotation/search-terms.json
输入: search-terms.json = { "<断言序号>": ["英文检索词", ...] }
输出: evaluation/annotation/annotation-sheet-evidence.md
证据来源（双路，按序）: layout.json 的 regions[].text（PDF 全文，阅读顺序）+ source/*.tex（LaTeX 源码）
不筛选、不排序、不给倾向：命中即列出，评审者自行判断。
"""
import json
import re
import sys
from pathlib import Path

VAULT = Path(r"C:\Users\111222\Desktop\paper\papers")
CTX = 260  # 每条证据显示的字符窗口


def paper_corpus(paper):
    """返回 [(来源标签, 文件, 全文)]，双路。
    layout.json 的 regions 有大量重叠重复块（实测重复率 74–76%），先按文本去重，
    否则同一句话会在证据里反复出现。"""
    src = VAULT / paper / "source"
    out = []
    lay = src / "layout.json"
    if lay.exists():
        regions = json.loads(lay.read_text(encoding="utf-8")).get("regions", [])
        seen, parts = set(), []
        for r in regions:
            t = (r.get("text") or "").strip()
            if not t or t in seen:
                continue
            seen.add(t)
            parts.append(t)
        out.append(("layout.json", "layout.json", "\n".join(parts)))
    for tex in sorted(src.glob("*.tex")):
        if tex.stem.endswith(".sty"):
            continue
        try:
            out.append(("tex", tex.name, tex.read_text(encoding="utf-8", errors="ignore")))
        except OSError:
            continue
    return out


def snap_sentence(text, i, span=200, maxlen=320):
    """取命中位置所在的整句（前后以句号/换行为界），保证重叠分块抽出同一句。"""
    a = max(text.rfind(". ", max(0, i - span), i), text.rfind("\n", max(0, i - span), i))
    a = a + 2 if a >= 0 else max(0, i - span // 2)
    b = text.find(". ", i)
    b = b + 1 if b >= 0 else min(len(text), i + span // 2)
    return re.sub(r"\s+", " ", text[a:b]).strip()[:maxlen]


def find_hits(corpus, terms, limit=3):
    """按检索词找命中，返回 [{'src','where','excerpt'}]。
    证据以整句为单位，按归一化句子去重——layout.json 的分块有大量重叠，
    不去重的话同一句话会以不同窗口反复出现。"""
    hits, seen = [], set()
    for term in terms:
        t = term.lower()
        for label, fname, text in corpus:
            if len(hits) >= limit:
                break
            low = text.lower()
            start = 0
            while len(hits) < limit:
                i = low.find(t, start)
                if i < 0:
                    break
                start = i + len(t)
                sentence = snap_sentence(text, i)
                # 分块接缝处抽出的句子首尾会略有出入，用归一化前缀作去重键，
                # 使同一句话的不同窗口归并（前 80 字符足以区分不同句子）
                key = re.sub(r"[^a-z0-9一-鿿]", "", sentence.lower())[:80]
                if len(key) < 20 or key in seen:
                    continue
                seen.add(key)
                hits.append({"src": label, "where": fname, "term": term, "excerpt": sentence})
    return hits


def main(terms_path):
    terms = json.loads(Path(terms_path).read_text(encoding="utf-8"))
    base = Path(__file__).resolve().parent.parent / "annotation"

    # 从现有盲标表取断言原文与样本归属
    sheet = (base / "annotation-sheet.md").read_text(encoding="utf-8").splitlines()
    claim_re = re.compile(r"^(\d+)\. \[ \] support  \[ \] contradict  \[ \] no_evidence ｜ (.*)$")
    samples = json.loads((Path(__file__).resolve().parent.parent / "samples" / "samples.json")
                         .read_text(encoding="utf-8"))["cases"]
    case_paper = {c["id"]: c.get("paper") for c in samples}

    cur, items = None, []
    for line in sheet:
        m = re.match(r"^## (\S+)", line)
        if m:
            cur = m.group(1)
            continue
        m = claim_re.match(line)
        if m and cur:
            items.append((cur, m.group(2)))

    corpora = {}
    out = [
        "# 人工盲标注表 · 证据对照版",
        "",
        "每条断言旁列出**论文原文命中片段**（关键词检索所得，未筛选、未排序、无倾向）。",
        "  - `layout.json` = 论文 PDF 抽取全文；`tex` = LaTeX 源码。两路都查，命中都列出。",
        "  - 证据只覆盖该检索词附近；**没命中不等于原文没有**，检索词可能不对口，可自行再查。",
        "  - ⚠️ **命中了数字 ≠ 支持该断言**：务必看上下文。例如某数字可能出现在另一张表、",
        "    另一个模型或另一个数据集上，与断言所述并非一回事。",
        "  - 判定仍由你做出：找得到依据→`support`；原文说的相反或数字对不上→`contradict`；原文没提→`no_evidence`。",
        "",
    ]

    cur_sample, n = None, 0
    for idx, (case, text) in enumerate(items, 1):
        if case != cur_sample:
            cur_sample = case
            paper = case_paper.get(case) or case_paper.get(case.rsplit("-", 1)[-1], "?")
            out += ["", f"## {case} · 论文 `{paper}`", "",
                    "fabricated: [ ]  （该回答编造了论文没有的具体数字/实验结论则勾选）", ""]
            if paper not in corpora:
                corpora[paper] = paper_corpus(paper)
        n += 1
        out.append(f"{n}. [ ] support  [ ] contradict  [ ] no_evidence ｜ {text}")
        ts = terms.get(str(idx), [])
        if not ts:
            out.append("   - ⚠️ 未配检索词，请自行查原文")
        else:
            out.append(f"   - 检索词：{' / '.join(ts)}")
            paper = case_paper.get(case) or case_paper.get(case.rsplit("-", 1)[-1], "?")
            for h in find_hits(corpora.get(paper, []), ts):
                out.append(f"   - [{h['src']} · {h['where']}] …{h['excerpt']}…")
        out.append("")

    target = base / "annotation-sheet-evidence.md"
    target.write_text("\n".join(out), encoding="utf-8")
    print(f"已生成 {target}（{len(items)} 条断言，检索词覆盖 {sum(1 for i in range(1, len(items)+1) if str(i) in terms)} 条）")


if __name__ == "__main__":
    main(sys.argv[1])
