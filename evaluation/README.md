# 评测交付物 · 提交索引

> Library 论文研究工作台 AI 应用 · 犀牛鸟开源实战任务 · 2026-09-08
> 复跑：`python scripts/write_answers.py && python scripts/eval_rules.py summary answers/ --vault <vault> --samples samples/samples.json --out results/`

## 必看（按此顺序阅读）

| # | 文件 | 对应产出要求 |
|---|---|---|
| 1 | **`analysis-report.md`** | 分析报告：场景选择理由 / AI 应用解决方案 / 评估维度设计依据（7 维度）/ 评测结论 / 模型失败模式与能力边界 / 实际测评典型模式 |
| 2 | **`evaluation-plan.md`** | 产出要求①：可操作判定标准（D1–D7）+ 自动评测流程 + 设计依据 |
| 3 | **`samples/`** | 产出要求②：评测样本集（31 用例：12 事实 + 3 跨页难例 + 6 反例 + 5 对抗 + 5 便捷任务），含来源/构造/覆盖说明与注入载体 TeX |
| 4 | **`results/` + `scripts/`** | 产出要求③：评估方法说明 + 评测脚本 + 完整结果表格 |
| 5 | **`validity/` + `results/judge-run*.json`** | 产出要求④：有效性验证（判别力好>中>差、双厂商 judge 一致性 6/6、对抗防作弊 3/3） |

## 目录结构

```
evaluation/
├── README.md                 ← 本索引
├── analysis-report.md        ← 分析报告（主交付物）
├── evaluation-plan.md        ← 评测方法：标准与流程
├── judge-protocol.md         ← judge 独立评审协议
├── samples/                  ← 31 用例定义 + 注入载体
├── answers/                  ← 27 份待评回答（write_answers.py 可再生成）
├── validity/                 ← 有效性验证样本（好/中/差 + 3 作弊样本）
├── scripts/                  ← eval_rules / judge_consistency / measure_perf / write_answers
└── results/                  ← rules-results.json · summary-table.md · judge-run1/3.json · perf-results.json
```

## 核心数字速览

- D1 便捷性：找→导→问→笔记全链路可跑通；`plaza` 600 条 2.33s 命中目标论文
- D2 可追溯性：**47/47 引用 100% 机器可验证**（块 ID + 页码）
- D3 忠实性：双厂商 judge 分数级 **6/6 一致**（GLM / Anthropic 独立评审）
- D4 术语：规则层术语表比对 + judge 终审（协议见 judge-protocol.md）
- D5 安全性：反例拒答 **6/6**、对抗断言 **9/9**
- D6 规范性：结构化笔记 **6/6** 格式检查通过
- D7 资源占用：启动 0.01s / paper list 0.03s·13.8MB / plaza 12 页 2.33s·22.1MB·846B 输出，**15/15 全优**
- 防作弊：伪引用被规则层抓（0.33）、术语堆砌编造数字判 0、篇幅灌水仅 1 分（诚实回答 2 分）
