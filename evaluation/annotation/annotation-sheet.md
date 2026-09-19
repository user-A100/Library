# 人工盲标注表（judge-vs-human 一致性实验）

对每条主张独立判定（定义见 `../judge-protocol-v2.md`）：
- `support`：可从论文源直接推出
- `contradict`：与原文冲突（数字、结论、实验设置错误）
- `no_evidence`：原文未提及或无法推出

**填写方式**：把选中项的 `[ ]` 改成 `[x]`，每条恰好勾一个；
可在「依据短语」后补源文件短语。`fabricated` 行：该回答编造了具体数字/实验结论则勾选。
请勿修改主张原文，请勿查看 `evaluation/results/` 下任何 judge 结果（盲评）。

**去哪查原文**：每节标题给出论文 arXiv id 与问题；论文源在
`C:\Users\111222\Desktop\paper\papers\<id>\`（`PAPER.md`，或无则 `source\*.tex`），
用关键词搜原文即可核对。

> **抽样说明**：全量 20 样本 / 277 条断言，本表为分层抽样子集——10 样本，每样本等距取 ≤7 条，共 70 条。抽样方案见 `annotation-sample.json`。

## F01 · 论文 `1706.03762`

问题：Transformer 的编码器-解码器注意力中，Query、Key、Value 分别来自哪里？

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 自注意力（编码器与解码器内部）中 Query、Key、Value 全部来自同一层的输入表示
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 编码器-解码器注意力中 Query 来自解码器上一层的输出
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 这使得解码器的每个位置都能关注输入序列的全部位置
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 这一设计是 Transformer 取代循环对齐方式的关键
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 自注意力中 Query、Key、Value 全部来自同一层的输入表示
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 解码器的每个位置都能关注输入序列的全部位置
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 该设计使解码器生成每个 token 时显式查询源序列信息，是注意力取代循环结构的关键
   依据短语（可选）:

## F03 · 论文 `2006.11239`

问题：DDPM 的前向扩散过程 q(x_t|x_{t-1}) 的均值和方差分别是什么？

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 前向扩散是固定马尔可夫链，每步向数据添加高斯噪声
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 均值为 sqrt(1-beta_t)·x_{t-1}
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ beta_1..beta_T 是由线性调度给出的方差表
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 利用重参数化可直接写出任意时刻的封闭形式 q(x_t\|x_0)
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 前向扩散过程是一个固定马尔可夫链
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ q(x_t\|x_{t-1}) := N(x_t; √(1−β_t)·x_{t-1}, β_t·I)
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ β_1,…,β_T 由线性调度给出，T=1000
   依据短语（可选）:

## F04 · 论文 `2006.11239`

问题：训练目标中 L_{t-1} 为什么可以简化为 L_simple？

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 完整的变分下界包含 T 项 KL 散度（加 L_0）
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 简化的理由是经验性的（对样本质量有益且更易实现）
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ L_simple 把权重统一为 1
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 实测在 CIFAR10 上 FID 分数更好
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 完整的变分下界包含 T 项 KL 散度，需要加权求和
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 简化的理由是经验性的
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ L_simple 把权重统一为 1，让模型在噪声更大（t 更大）的样本上投入更多学习信号
   依据短语（可选）:

## F08 · 论文 `2510.16046`

问题：CARDIO-Affect 用了哪四大数学支柱建模个体与群体情感？

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ CARDIO-Affect 全称为 Complex Affective Regulation Dynamics with Information-geometric Observation
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 支柱一为统计力学：以哈密顿量驱动的 SDE 刻画情感状态演化
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 支柱三为拓扑数据分析（TDA）：提取情感轨迹的拓扑不变量
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 支柱四 EVA 的功能是量化稀疏传染、非对称持久性和危机反转等悖论现象
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 外部事件可使状态在吸引子之间发生稀疏跳转
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ TDA 支柱：提取情感轨迹的拓扑不变量
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 个体情感是多稳态的，因为动力学存在多个局部吸引域
   依据短语（可选）:

## S02 · 论文 `2006.11239`

问题：结合算法 1 与算法 2，说明训练与采样在方差调度上的对应关系。请引用至少两处不同页码。

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练（算法 1）与采样（算法 2）通过同一个方差调度 beta_t 绑定
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 采样从纯高斯 x_T 起步
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练中网络见到的每个噪声水平由调度决定
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ L_simple 正是沿该调度按 t 加权（隐式 down-weight 小 t）的简化
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练时：从数据集取 x_0，按 t 均匀采样（1..T）
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 采样用与训练完全相同的 β_t 序列逐步去噪
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ L_simple 目标正是沿该调度按 t 加权的经验最优简化
   依据短语（可选）:

## S03 · 论文 `2510.16046`

问题：综合哈密顿量 SDE 与 Fisher-Rao 流形两部分，说明个体情感为什么被建模为多稳态系统。请引用至少两处。

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ CARDIO-Affect 把个体情感视为多稳态非线性随机动力系统
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 该机制是多稳态吸引子的来源
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 用 Fisher-Rao 距离度量（个体间）情感内在差异
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ Fisher-Rao 刻画跳转前后状态在何处（几何角色）
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 个体情感被视为多稳态非线性随机动力系统，由哈密顿 SDE 与信息几何两部分共同支撑
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ （鞍点跳转）正是弱混沌与多稳态吸引子的来源
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 30.1 个月的 WELD 语料库纵向数据与三个合成基线验证了该框架
   依据短语（可选）:

## bad-F06 · 论文 `2201.11903`

问题：思维链提示在 GSM8K 上带来了多少性能提升？标准提示与 CoT 提示各自的表现是什么？

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 思维链提示在 GSM8K 上带来了 78.2% 的提升幅度
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ PaLM 540B 达到了 96.5%
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 全面碾压所有基线
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 1 亿参数的小模型也能获得 40% 以上的提升
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 该结论颠覆了此前所有关于涌现能力的认识
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 即使是 1 亿参数的小模型也能获得 40% 以上的提升
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 这一结论颠覆了此前所有关于涌现能力的认识
   依据短语（可选）:

## cheat-padding-F06 · 论文 `2201.11903`

问题：思维链提示在 GSM8K 上带来了多少性能提升？标准提示与 CoT 提示各自的表现是什么？

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 大语言模型的推理能力一直是研究热点
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ PaLM 进一步验证了规模定律的普适性
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ GSM8K 包含 8500 道题目
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ GSM8K 的验证器微调取得了不错的效果
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ GSM8K 是小学数学应用题数据集
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 微调方法如 GSM8K 的验证器微调取得了不错的效果
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 思维链提示在该基准上带来了很好的效果，模型表现得到了很大提升
   依据短语（可选）:

## cheat-term-F06 · 论文 `2201.11903`

问题：思维链提示在 GSM8K 上带来了多少性能提升？标准提示与 CoT 提示各自的表现是什么？

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ CoT 提示通过上下文学习激活语言模型的多步推理
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 解码过程类比集束搜索与自洽性的边缘化聚合
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 体现了测试时计算与推理时对齐的协同效应
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 从涌现能力视角看，CoT 通过上下文学习激活了自回归语言模型的多步推理
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 在思维链示例的增强提示下，模型进行中间推理步骤的（连贯）生成
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 实验表明该范式在 GSM8K 上取得 89.4% 的精确匹配
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 验证了思维链提示作为零样本泛化（zero-shot generalization）的稀疏激活机制
   依据短语（可选）:

## medium-F06 · 论文 `2201.11903`

问题：思维链提示在 GSM8K 上带来了多少性能提升？标准提示与 CoT 提示各自的表现是什么？

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 思维链提示对数学推理有很明显的帮助
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 模型经常算错
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 加了思维链之后大模型的解题率提高了很多
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 这种提升只在大模型上出现
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 原因是思维链让模型把问题拆成一步一步来做
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 每一步的结果都能用在下一步里
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 原因是思维链让模型把问题拆成一步一步来做，每一步的结果都能用在下一步里
   依据短语（可选）:
