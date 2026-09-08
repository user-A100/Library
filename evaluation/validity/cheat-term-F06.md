---
paper: 2201.11903
---
从涌现能力（emergent abilities）的视角看，思维链（chain-of-thought, CoT）提示通过上下文学习（in-context learning, ICL）激活了自回归语言模型的多步推理（multi-step reasoning）通路。在思维链示例（CoT exemplars）的增强提示（augmented prompt）下，模型进行中间推理步骤（intermediate reasoning steps）的自洽生成，其解码过程类比集束搜索（beam search）与自洽性（self-consistency）的边缘化聚合。

实验表明该范式在 GSM8K 上取得 89.4% 的精确匹配，充分体现了测试时计算（test-time compute）与推理时对齐（inference-time alignment）的协同效应，验证了思维链提示作为零样本泛化（zero-shot generalization）的稀疏激活机制【来源 1 · p.7】。
