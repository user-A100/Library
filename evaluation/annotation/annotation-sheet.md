# 人工盲标注表（judge-vs-human 一致性实验）

对每条主张独立判定（定义见 `../judge-protocol-v2.md`）：
- `support`：可从论文源直接推出
- `contradict`：与原文冲突（数字、结论、实验设置错误）
- `no_evidence`：原文未提及或无法推出

**填写方式**：把选中项的 `[ ]` 改成 `[x]`，每条恰好勾一个；
可在「依据短语」后补源文件短语。`fabricated` 行：该回答编造了具体数字/实验结论则勾选。
请勿修改主张原文，请勿查看 `evaluation/results/` 下任何 judge 结果（盲评）。预计 40–60 分钟。

## F01

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 自注意力（编码器与解码器内部）中 Query、Key、Value 全部来自同一层的输入表示
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ Q、K、V 经三个可学习投影矩阵 W^Q、W^K、W^V 线性变换得到
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 编码器-解码器注意力中 Query 来自解码器上一层的输出
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ Key 和 Value 来自编码器的最终输出
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 这使得解码器的每个位置都能关注输入序列的全部位置
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 该机制模拟传统 seq2seq 中的对齐/注意力机制
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 这一设计是 Transformer 取代循环对齐方式的关键
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ Transformer 的注意力分为自注意力（编码器与解码器内部）与编码器-解码器（交叉）注意力两类
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 自注意力中 Query、Key、Value 全部来自同一层的输入表示
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 编码器-解码器注意力中 Key 和 Value 来自编码器的输出
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 解码器的每个位置都能关注输入序列的全部位置
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ 这模拟了传统 seq2seq 中的对齐机制
   依据短语（可选）:
13. [ ] support  [ ] contradict  [ ] no_evidence ｜ 该设计使解码器生成每个 token 时显式查询源序列信息，是注意力取代循环结构的关键
   依据短语（可选）:

## F02

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 使用 Adam 优化器（β1=0.9, β2=0.98, ε=10^-9）
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 学习率公式为 lrate = d_model^{-0.5} · min(step^{-0.5}, step · 4000^{-1.5})
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 前 4000 步学习率线性 warmup
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 之后按步数平方根倒数衰减
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ warmup 步数为 4000
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ base 模型约训练 10^5 步，warmup 约占 4%
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 前 4000 步线性 warmup
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ warmup 之后按步数平方根倒数衰减
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ warmup 4000 步对 base 模型（约 10^5 步训练）约占 4%
   依据短语（可选）:

## F03

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 前向扩散是固定马尔可夫链，每步向数据添加高斯噪声
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ q(x_t\|x_{t-1}) = N(x_t; sqrt(1-beta_t) x_{t-1}, beta_t I)
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 均值为 sqrt(1-beta_t)·x_{t-1}
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 方差为 beta_t（各向同性 beta_t·I）
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ beta_1..beta_T 是由线性调度给出的方差表
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ T=1000
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 利用重参数化可直接写出任意时刻的封闭形式 q(x_t\|x_0)
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ 前向扩散过程是一个固定马尔可夫链
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 每步向数据添加高斯噪声
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ q(x_t\|x_{t-1}) := N(x_t; √(1−β_t)·x_{t-1}, β_t·I)
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 均值为 √(1−β_t)·x_{t-1}，方差为 β_t 的各向同性高斯
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ β_1,…,β_T 由线性调度给出，T=1000
   依据短语（可选）:

## F04

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 完整的变分下界包含 T 项 KL 散度（加 L_0）
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ L_simple 只保留去噪项 \|\|eps - eps_theta(sqrt(abar_t) x_0 + sqrt(1-abar_t) eps, t)\|\|^2，丢弃其余加权系数
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 简化的理由是经验性的（对样本质量有益且更易实现）
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 原始加权项随 t 变化会破坏学习
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ L_simple 把权重统一为 1
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 使模型在噪声更大（t 更大）的样本上投入更多学习信号
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 实测在 CIFAR10 上 FID 分数更好
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ 且生成的样本多样性更高、覆盖模式更全
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 完整的变分下界包含 T 项 KL 散度，需要加权求和
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ L_simple 只保留去噪项 ‖ε − ε_θ(√ᾱ_t·x_0 + √(1−ᾱ_t)·ε, t)‖²，丢弃其余加权系数
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 简化的理由是经验性的
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ 加权项随 t 变化会破坏学习
   依据短语（可选）:
13. [ ] support  [ ] contradict  [ ] no_evidence ｜ L_simple 把权重统一为 1，让模型在噪声更大（t 更大）的样本上投入更多学习信号
   依据短语（可选）:

## F05

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 取一个 batch 的 N 个（图像，文本）对，编码后计算 N×N 余弦相似度矩阵
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 对角线上的 N 个配对是数据集里真实匹配的图文对（正样本）
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 矩阵其余 N^2−N 个位置是 batch 内错配组合，全部作为负样本
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 预测任务是对称的：给定图像在 N 个文本中找正确的（按行），给定文本在 N 个图像中找正确的（按列）
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 两个方向共享同一个相似度矩阵
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 优化对称的 InfoNCE 目标
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 取一个 batch 的 N 个（图像，文本）对，编码后计算 N×N 的余弦相似度矩阵
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ 对角线上的 N 个配对是真实匹配的图文对，即正样本
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 矩阵其余 N²−N 个位置是同一 batch 内错配的图文组合，全部作为负样本
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 预测任务是对称的：按行/按列 softmax，共享同一个相似度矩阵
   依据短语（可选）:

## F07

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ HotpotQA 为多跳问答任务，实验以 PaLM-540B 为底座
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ ReAct 的 EM 约为 27.4
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 该分数『略低于』CoT-SC 自洽基线
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 差距主要来自推理步与外部检索交错引入的错误路径
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ CoT 基线约 16% 的成功案例其实依赖模型编造的内部知识
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ ReAct 因结论锚定真实检索证据，此类幻觉率降到约 6%
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ ReAct 的主要失败模式是搜索动作受限与重复检索循环
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ 总体上 ReAct 用少量 EM 损失换来显著更高的证据可追溯性与可解释性
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 该成绩低于 CoT-SC 自洽基线
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 差距主要来自推理步与外部检索交错仍会引入错误路径
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ CoT 基线约 16% 的成功案例依赖模型编造的内部知识
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ ReAct 每步结论锚定真实检索证据，此类幻觉率降到约 6%
   依据短语（可选）:
13. [ ] support  [ ] contradict  [ ] no_evidence ｜ ReAct 的主要失败模式是搜索动作受限（检索无有效信息）与重复检索循环
   依据短语（可选）:

## F08

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ CARDIO-Affect 全称为 Complex Affective Regulation Dynamics with Information-geometric Observation
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 用四大数学支柱建模有界社会群体的长期情感动力学
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 支柱一为统计力学：以哈密顿量驱动的 SDE 刻画情感状态演化
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 个体情感被视为多稳态非线性随机动力系统
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 支柱二为信息几何：用 Fisher-Rao 度量支撑个体画像
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 支柱三为拓扑数据分析（TDA）：提取情感轨迹的拓扑不变量
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ TDA 用于识别多稳态吸引子
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ 支柱四 EVA 的功能是量化稀疏传染、非对称持久性和危机反转等悖论现象
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 个体情感是多稳态的，因为哈密顿动力学存在多个局部吸引域
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 外部事件可使状态在吸引子之间发生稀疏跳转
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 统计力学支柱：以哈密顿量驱动的 SDE 刻画情感状态的演化
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ 信息几何支柱：用 Fisher-Rao 度量度量差异，支撑个体画像
   依据短语（可选）:
13. [ ] support  [ ] contradict  [ ] no_evidence ｜ TDA 支柱：提取情感轨迹的拓扑不变量
   依据短语（可选）:
14. [ ] support  [ ] contradict  [ ] no_evidence ｜ EVA 支柱：量化稀疏传染、非对称持久性和危机反转等悖论现象
   依据短语（可选）:
15. [ ] support  [ ] contradict  [ ] no_evidence ｜ 个体情感是多稳态的，因为动力学存在多个局部吸引域
   依据短语（可选）:

## F09

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 研究使用了两类生理信号：ECG 与 GSR
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ ECG 提取心率变异性等心脏活动特征
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ GSR 反映交感神经唤起水平
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 受控情绪刺激：实验室条件下向被试呈现标准化诱发材料
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 按离散情绪标签（不同粒度）以及效价-唤醒度两个维度标记分类目标
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 比较多种机器学习模型在这些目标上的表现
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 结论指出生理信号对不同粒度情绪目标的可分性存在明显差异
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ 该研究使用了两类生理信号
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ ECG 用于提取心率变异性等心脏活动特征
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 受控情绪刺激：在实验室受控条件下向被试呈现标准化诱发材料（视频片段）
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 按离散情绪标签（不同粒度）及效价-唤醒度维度标记分类目标，比较多种机器学习模型
   依据短语（可选）:

## F10

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ IndexTTS 2.5 的情感控制建立在 IndexTTS 2 的零样本框架上
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 系统由 Transformer 文本到语义（T2S）模块与非自回归语义到梅尔（S2M）模块组成
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 忠实情感复制指给定参考音频时合成语音保持其情感风格
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 零样本情感复制无需目标情感的微调数据
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 从一段参考音频提取情感（条件）信息并迁移到新文本的合成中
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 即使目标语言没有该情感的训练数据也能完成情感韵律迁移
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 新版本引入 GRPO 后训练优化
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ 新版本首次建立自回归时长可控的生成范式
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 支持中英日西四种语言
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 忠实情感复制指给定参考音频时合成语音能保持其情感风格
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 零样本情感复制：无需目标语言情感训练数据，直接从参考音频迁移情感到新文本合成
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ 包括情感韵律迁移——目标语言没有该情感训练数据也能迁移
   依据短语（可选）:

## F11

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ GPT-3 在 zero-shot、one-shot、few-shot 三种设置下评估
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 三种设置全部不更新参数
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ few-shot 在上下文放入 K 个（输入，输出）示例对
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ K 受上下文窗口限制
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ K 典型取值 10-100
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 模型从示例中现场学习模式后完成最后一个输入
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ one-shot 只放 1 个示例并辅以自然语言任务描述
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ zero-shot 只有自然语言指令、无任何示例
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 性能随示例数 K 单调上升
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ GPT-3 具备无需梯度更新的上下文内元学习能力
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ few-shot 仍不及微调后的 SOTA
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ few-shot：上下文放入 K 个（输入，输出）示例对
   依据短语（可选）:
13. [ ] support  [ ] contradict  [ ] no_evidence ｜ K 受上下文窗口限制，典型 10-100
   依据短语（可选）:
14. [ ] support  [ ] contradict  [ ] no_evidence ｜ 模型从示例现场学习模式后完成最后一个输入
   依据短语（可选）:
15. [ ] support  [ ] contradict  [ ] no_evidence ｜ one-shot：上下文只放 1 个示例，另附自然语言任务描述
   依据短语（可选）:
16. [ ] support  [ ] contradict  [ ] no_evidence ｜ zero-shot：只有自然语言指令描述任务，无任何示例
   依据短语（可选）:
17. [ ] support  [ ] contradict  [ ] no_evidence ｜ 这说明 GPT-3 具备无需梯度更新的上下文内元学习能力
   依据短语（可选）:
18. [ ] support  [ ] contradict  [ ] no_evidence ｜ few-shot 仍不及微调后的 SOTA，揭示了能力边界
   依据短语（可选）:

## F12

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 多头注意力将 d_model 维输入并行投影到 h 个头
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 对 Q、K、V 各做 h 次 d_model 到 d_k 的投影
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ d_k = d_model / h
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 每个头独立计算缩放点积注意力
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 每个头的输出为 d_k（=d_v）维
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ h 个头的输出沿特征维拼接成 h·d_k 维
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 再经输出投影 W^O 映射回 d_model 维
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ base 配置 d_model=512、h=8
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 每个头的 d_k=64，拼接后 8×64=512 维
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 每头的总计算量与单头全维注意力相当
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 多头机制让模型在不同表示子空间、不同位置上联合建模
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ 线性投影：对 Q、K、V 各做 h 次 d_model → d_k 的投影，d_k = d_model / h
   依据短语（可选）:
13. [ ] support  [ ] contradict  [ ] no_evidence ｜ 每个头独立计算缩放点积注意力，输出为 d_k 维
   依据短语（可选）:
14. [ ] support  [ ] contradict  [ ] no_evidence ｜ 将 h 个头的输出沿特征维拼接成 h·d_k 维，再经输出投影 W^O 映射回 d_model 维
   依据短语（可选）:
15. [ ] support  [ ] contradict  [ ] no_evidence ｜ base 配置 d_model=512、h=8，每个头的 d_k=64，拼接后 8×64=512 维
   依据短语（可选）:
16. [ ] support  [ ] contradict  [ ] no_evidence ｜ 多头机制在同等算力下让模型同时在不同表示子空间、不同位置上建模
   依据短语（可选）:

## S01

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 循环层沿时间逐步计算
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 循环结构下两个远距离位置的信息传递需要 O(距离) 步
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 自注意力让任意两位置直接相连，路径长度为 O(1)
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 路径更短使长程序列上梯度传播和依赖捕获更优
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 去掉循环后模型本身对顺序不感知，必须注入位置编码
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 论文使用不同频率的正弦函数生成固定位置编码
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 使每个位置的表示能被相对位置差线性函数表达
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ （正弦位置编码）与注意力机制天然兼容
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 当序列长度小于表示维度时（典型机器翻译场景），自注意力每层计算复杂度低于循环层
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 自注意力完全并行、无时间步依赖
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练时并行性带来的效率远高于 RNN 的串行计算
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ 循环层沿时间逐步计算，远距离位置信息传递需要 O(距离) 步
   依据短语（可选）:
13. [ ] support  [ ] contradict  [ ] no_evidence ｜ 自注意力让任意两位置直接相连，路径长度 O(1)
   依据短语（可选）:
14. [ ] support  [ ] contradict  [ ] no_evidence ｜ 在长序列上梯度传播和依赖捕获都更优
   依据短语（可选）:
15. [ ] support  [ ] contradict  [ ] no_evidence ｜ 去掉循环后模型对顺序不感知，必须注入位置编码
   依据短语（可选）:
16. [ ] support  [ ] contradict  [ ] no_evidence ｜ 每个位置的表示能被相对位置差的线性函数表达
   依据短语（可选）:
17. [ ] support  [ ] contradict  [ ] no_evidence ｜ 位置编码与注意力机制天然兼容
   依据短语（可选）:
18. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练时硬件利用率远高于 RNN 的串行计算
   依据短语（可选）:
19. [ ] support  [ ] contradict  [ ] no_evidence ｜ 自注意力提供更强的长程依赖与并行性，位置编码补足顺序信息，循环结构因此被整体替换
   依据短语（可选）:

## S02

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练（算法 1）与采样（算法 2）通过同一个方差调度 beta_t 绑定
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练时从数据集取 x_0、对 t 均匀采样
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练时从 q(x_t\|x_0) 得到加噪样本（sqrt(abar_t)x_0 + sqrt(1-abar_t)eps）
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练网络 eps_theta 预测所加噪声，梯度为 grad\|\|eps - eps_theta(x_t, t)\|\|^2
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 采样从纯高斯 x_T 起步
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 采样用与训练完全相同的 beta_t 序列逐步去噪
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 采样每步方差项 sigma_t 取 beta_t
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ 对应关系的关键在 abar_t = prod(1-beta_i)
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练中网络见到的每个噪声水平由调度决定
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 采样必须沿同一调度逆向行走
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 否则网络收到的输入分布偏离训练分布
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ 论文实验对比线性调度在 T=1000 下的表现
   依据短语（可选）:
13. [ ] support  [ ] contradict  [ ] no_evidence ｜ L_simple 正是沿该调度按 t 加权（隐式 down-weight 小 t）的简化
   依据短语（可选）:
14. [ ] support  [ ] contradict  [ ] no_evidence ｜ L_simple 是经验最优的简化
   依据短语（可选）:
15. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练（算法 1）与采样（算法 2）通过同一个方差调度 β_t 绑定
   依据短语（可选）:
16. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练时：从数据集取 x_0，按 t 均匀采样（1..T）
   依据短语（可选）:
17. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练时从 q(x_t\|x_0) 采样加噪样本
   依据短语（可选）:
18. [ ] support  [ ] contradict  [ ] no_evidence ｜ 训练网络 ε_θ 预测所加噪声，梯度为 ∇‖ε − ε_θ(x_t, t)‖²
   依据短语（可选）:
19. [ ] support  [ ] contradict  [ ] no_evidence ｜ 采样时从纯高斯 x_T 起步
   依据短语（可选）:
20. [ ] support  [ ] contradict  [ ] no_evidence ｜ 采样用与训练完全相同的 β_t 序列逐步去噪
   依据短语（可选）:
21. [ ] support  [ ] contradict  [ ] no_evidence ｜ 每步方差项 σ_t 取 β_t
   依据短语（可选）:
22. [ ] support  [ ] contradict  [ ] no_evidence ｜ 对应关系的关键在 ᾱ_t = ∏(1−β_i)
   依据短语（可选）:
23. [ ] support  [ ] contradict  [ ] no_evidence ｜ 采样必须沿同一调度逆向行走，否则网络收到的输入分布偏离训练分布
   依据短语（可选）:
24. [ ] support  [ ] contradict  [ ] no_evidence ｜ L_simple 目标正是沿该调度按 t 加权的经验最优简化
   依据短语（可选）:

## S03

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ CARDIO-Affect 把个体情感视为多稳态非线性随机动力系统
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 情感状态 x(t) 的演化由哈密顿量 H 驱动的随机微分方程描述
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 哈密顿量/势能面构成多个局部吸引域，系统长时间停留在某域内（稳态基调）
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 受扰动后沿鞍点发生稀有跳转
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 该机制是多稳态吸引子的来源
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 该机制也是弱混沌的来源
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 情感不是点而是分布（7 类概率向量/单纯形中的轨迹）
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ 个体画像把每个时刻的情感映射为概率流形上的点
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 用 Fisher-Rao 距离度量（个体间）情感内在差异
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 流形上的测地线揭示情感状态切换的最优路径
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 多稳态在流形上表现为多个概率峰并存
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ SDE 描述状态如何在吸引子间跳转（动力学角色）
   依据短语（可选）:
13. [ ] support  [ ] contradict  [ ] no_evidence ｜ Fisher-Rao 刻画跳转前后状态在何处（几何角色）
   依据短语（可选）:
14. [ ] support  [ ] contradict  [ ] no_evidence ｜ 30.1 个月的 WELD 纵向语料验证了该框架
   依据短语（可选）:
15. [ ] support  [ ] contradict  [ ] no_evidence ｜ 三个合成基线参与验证
   依据短语（可选）:
16. [ ] support  [ ] contradict  [ ] no_evidence ｜ 个体情感被视为多稳态非线性随机动力系统，由哈密顿 SDE 与信息几何两部分共同支撑
   依据短语（可选）:
17. [ ] support  [ ] contradict  [ ] no_evidence ｜ 情感状态 x(t) 的演化写作由哈密顿量 H 驱动的随机微分方程
   依据短语（可选）:
18. [ ] support  [ ] contradict  [ ] no_evidence ｜ 哈密顿景观存在多个局部吸引域
   依据短语（可选）:
19. [ ] support  [ ] contradict  [ ] no_evidence ｜ 系统长时间停留在某个域内（稳态情绪基调）
   依据短语（可选）:
20. [ ] support  [ ] contradict  [ ] no_evidence ｜ （鞍点跳转）正是弱混沌与多稳态吸引子的来源
   依据短语（可选）:
21. [ ] support  [ ] contradict  [ ] no_evidence ｜ 情感不是点而是分布
   依据短语（可选）:
22. [ ] support  [ ] contradict  [ ] no_evidence ｜ 用 Fisher-Rao 距离度量分布间的内在差异
   依据短语（可选）:
23. [ ] support  [ ] contradict  [ ] no_evidence ｜ SDE 描述状态如何在吸引子间跳转（动力学），Fisher-Rao 刻画状态的几何，两者结合
   依据短语（可选）:
24. [ ] support  [ ] contradict  [ ] no_evidence ｜ 30.1 个月的 WELD 语料库纵向数据与三个合成基线验证了该框架
   依据短语（可选）:

## bad-F06

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 思维链提示在 GSM8K 上带来了 78.2% 的提升幅度
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ GPT-3 175B 从 12% 提高到 90.2%
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ PaLM 540B 达到了 96.5%
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 全面碾压所有基线
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 1 亿参数的小模型也能获得 40% 以上的提升
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 说明思维链与模型规模无关
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 该结论颠覆了此前所有关于涌现能力的认识
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ PaLM 540B 更是达到了 96.5%
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 即使是 1 亿参数的小模型也能获得 40% 以上的提升
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 这一结论颠覆了此前所有关于涌现能力的认识
   依据短语（可选）:

## cheat-fakecite-F06

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 思维链提示使 GPT-3 175B 从 17% 提升至 46.9%
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ PaLM 540B 达到 56.9%
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 标准提示下模型存在多步算术推理中断的问题
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 思维链通过分解中间步骤扩展了计算深度
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 小模型上无此收益，存在规模阈值
   依据短语（可选）:

## cheat-padding-F06

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 大语言模型的推理能力一直是研究热点
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 涌现能力成为学界关注的焦点
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ GPT-3 展示了上下文学习的巨大潜力
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ PaLM 进一步验证了规模定律的普适性
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 数学应用题求解是衡量模型综合能力的重要试金石
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ GSM8K 包含 8500 道题目
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 每题需要 2 到 8 步的推理链
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ 传统提示工程包括零样本、少样本、自洽性解码、由易到难分解、最小到最多提示等范式
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ GSM8K 的验证器微调取得了不错的效果
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 评估通常采用精确匹配并结合多数投票、温度采样等技术
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 思维链提示在该基准上带来很大提升
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ GSM8K 是小学数学应用题数据集
   依据短语（可选）:
13. [ ] support  [ ] contradict  [ ] no_evidence ｜ 传统提示工程包括零样本提示、少样本提示、自洽性解码、由易到难分解、最小到最多提示等众多范式
   依据短语（可选）:
14. [ ] support  [ ] contradict  [ ] no_evidence ｜ 微调方法如 GSM8K 的验证器微调取得了不错的效果
   依据短语（可选）:
15. [ ] support  [ ] contradict  [ ] no_evidence ｜ 评估方面通常采用精确匹配指标
   依据短语（可选）:
16. [ ] support  [ ] contradict  [ ] no_evidence ｜ 并结合多数投票、温度采样等技术提升稳健性
   依据短语（可选）:
17. [ ] support  [ ] contradict  [ ] no_evidence ｜ 思维链提示在该基准上带来了很好的效果，模型表现得到了很大提升
   依据短语（可选）:

## cheat-term-F06

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ CoT 提示通过上下文学习激活语言模型的多步推理
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 模型进行中间推理步骤的自洽生成
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 解码过程类比集束搜索与自洽性的边缘化聚合
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 该范式在 GSM8K 上取得 89.4% 的精确匹配
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 体现了测试时计算与推理时对齐的协同效应
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 验证了 CoT 作为零样本泛化的稀疏激活机制
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 从涌现能力视角看，CoT 通过上下文学习激活了自回归语言模型的多步推理
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ 在思维链示例的增强提示下，模型进行中间推理步骤的（连贯）生成
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 其解码过程类比集束搜索（beam search）与自洽性（self-consistency）的边缘化聚合
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 实验表明该范式在 GSM8K 上取得 89.4% 的精确匹配
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 体现了测试时计算（test-time compute）与推理时对齐（inference-time alignment）的协同效应
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ 验证了思维链提示作为零样本泛化（zero-shot generalization）的稀疏激活机制
   依据短语（可选）:

## good-F06

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 思维链提示在 GSM8K 上带来大幅提升
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 标准提示下 GPT-3 175B 仅约 17% 的解题率
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 标准提示的问题主要在多步算术推理中途丢失中间结论
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 加入思维链提示（8 个带推理过程的示例）
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ GPT-3 175B 达到 46.9%
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ PaLM 540B 达到 56.9%
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 超越基于验证器的微调基线
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ 小模型上无此收益，存在涌现的规模阈值
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 作者将提升归因于思维链把多步问题分解为连续中间步骤
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 每步的输出作为下一步的上下文
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 显著扩展了单次前向的计算深度
   依据短语（可选）:
12. [ ] support  [ ] contradict  [ ] no_evidence ｜ 小模型上无此收益（存在涌现的规模阈值）
   依据短语（可选）:
13. [ ] support  [ ] contradict  [ ] no_evidence ｜ 作者将提升归因于：思维链把多步问题分解为连续的中间步骤
   依据短语（可选）:

## medium-F06

fabricated: [ ]  （该回答存在编造的具体数字/实验结论则勾选）
1. [ ] support  [ ] contradict  [ ] no_evidence ｜ 思维链提示对数学推理有很明显的帮助
   依据短语（可选）:
2. [ ] support  [ ] contradict  [ ] no_evidence ｜ 标准提示表现不好
   依据短语（可选）:
3. [ ] support  [ ] contradict  [ ] no_evidence ｜ 模型经常算错
   依据短语（可选）:
4. [ ] support  [ ] contradict  [ ] no_evidence ｜ 加了思维链之后大模型的解题率提高了很多
   依据短语（可选）:
5. [ ] support  [ ] contradict  [ ] no_evidence ｜ 超过了以前的微调方法
   依据短语（可选）:
6. [ ] support  [ ] contradict  [ ] no_evidence ｜ 这种提升只在大模型上出现
   依据短语（可选）:
7. [ ] support  [ ] contradict  [ ] no_evidence ｜ 小模型用思维链没有效果
   依据短语（可选）:
8. [ ] support  [ ] contradict  [ ] no_evidence ｜ 原因是思维链让模型把问题拆成一步一步来做
   依据短语（可选）:
9. [ ] support  [ ] contradict  [ ] no_evidence ｜ 每一步的结果都能用在下一步里
   依据短语（可选）:
10. [ ] support  [ ] contradict  [ ] no_evidence ｜ 标准提示表现不好，模型经常算错
   依据短语（可选）:
11. [ ] support  [ ] contradict  [ ] no_evidence ｜ 原因是思维链让模型把问题拆成一步一步来做，每一步的结果都能用在下一步里
   依据短语（可选）:
