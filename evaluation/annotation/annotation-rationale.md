# 盲标判定依据（70 条）



## 结果速览

| 样本 | 判定序列（1→7） | fabricated | 折算 score |
|---|---|---|---|
| F01 | 全 support | – | 2 |
| F03 | 全 support | – | 2 |
| F04 | 全 support | **✔ 编造** | 0 |
| F08 | s s s **contradict** s s s | – | 0 |
| S02 | 全 support | – | 2 |
| S03 | s s s **no_evidence** s **no_evidence** s | – | 1 |
| bad-F06 | 全 contradict | **✔ 编造** | 0 |
| cheat-padding-F06 | n n n s s s s | – | 1 |
| cheat-term-F06 | s n n s s **contradict** n | **✔ 编造** | 0 |
| medium-F06 | 全 support | – | 2 |

（s=support, n=no_evidence；折算规则同 `scripts/kappa.py::fold_score`）

## 逐样本依据

### F01 · 1706.03762（全 support）
- **model_architecture.tex:107** — "In a self-attention layer all of the keys, values and queries
  come from the same place, in this case, the output of the previous layer in the encoder."
  → #1/#5「Q/K/V 来自同一层输入表示」成立（该层输入即上一层输出）。
- **model_architecture.tex:105** — "In \"encoder-decoder attention\" layers, the queries come from the
  previous decoder layer, and the memory keys and values come from the output of the encoder.
  This allows every position in the decoder to attend over all positions in the input sequence."
  → #2/#3/#6 逐字命中。
- #4/#7「注意力取代循环的关键」：**introduction.tex:14 / ms.tex:127** — "eschewing recurrence and
  instead relying entirely on an attention mechanism to draw global dependencies between input and
  output"、"dispensing with recurrence and convolutions entirely"；同段 "mimics the typical
  encoder-decoder attention mechanisms"。属可推出的改写，非编造。

### F03 · 2006.11239（全 support）
- **main.tex:162** — "The forward process variances β_t can be learned by reparameterization … or
  held constant"；**main.tex:166** — "is fixed to a Markov chain that gradually adds Gaussian noise
  to the data according to a variance schedule" → #1/#5/#8/#12。
- **main.tex:166** — `q(x_t|x_{t-1}) ≔ N(x_t; √(1−β_t)x_{t-1}, β_t I)` → #2/#6/#9/#13 公式逐字一致。
- **main.tex:656** — "We set T=1000 without a sweep, and we chose a linear schedule from β_1=10⁻⁴ to
  β_T=0.02" → #3/#10/#14。
- #4/#11「利用重参数化写出任意时刻封闭形式」：**main.tex:164** 给出 closed form（用 α_t、ᾱ_t），
  且 **main.tex:205** 明确写了 "by **reparameterizing** eq:q_marginal_arbitrary_t as
  x_t(x_0,ε)=√ᾱ_t x_0+√(1−ᾱ_t)ε" —— 即重参数化确实被用于该封闭形式，故判 support。

### F04 · 2006.11239（7 条 support，但**整题编造**）
- #1/#15/#19：**main.tex:171** `L = E_q[ L_T + Σ_{t>1} L_{t-1} + L_0 ]`，其中 `L_T`、`L_{t-1}`
  均为 KL，共 T 项，`L_0` 另计 → 「T 项 KL 散度加 L_0」成立；**main.tex:298** "discards the
  weighting"、**main.tex:225** 原项系数 `β_t²/(2σ_t²α_t(1−ᾱ_t))` 随 t 变 → 「需要加权求和」成立。
- #2/#16/#20：**main.tex:291** "we found it **beneficial to sample quality (and simpler to
  implement)**" → 「对样本质量有益且更易实现」逐字命中。
- #3/#17：**main.tex:295** "The t>1 cases correspond to an **unweighted** version" → 「权重统一为 1」成立。
- #4/#18：**main.tex:345/359-362** CIFAR10 消融表 —— `L_simple` FID **3.17** vs `L`(fixed
  isotropic Σ) FID **13.51** → 「CIFAR10 上 FID 更好」成立。
- #7/#21：**main.tex:299** "causes the simplified objective to **down-weight loss terms
  corresponding to small t** … so that the network can focus on more difficult denoising tasks at
  **larger t**" → 逐字命中。
- **⚠️ fabricated = 勾选**：回答另称「且生成的样本多样性更高、覆盖模式更全」。全文检索
  `main.tex` 无 `divers*`／`mode collapse`／`coverage` 任何命中，论文从未报告多样性或模式覆盖的
  实验结果。这是**编造实验结论**（不是数字，但属协议所称「实验结论」），故整题 0 分。
  注意：#4 本身（FID 更好）是真的 —— 编造发生在该断言的**未抽样后半句**，这正是抽样表看不出的部分。

### F08 · 2510.16046（1 条 contradict）
- #1/#22：**main.tex:44** — "**CARDIO-Affect** (Complex Affective Regulation Dynamics with
  Information-geometric Observation)" → 全称逐字命中。
- #2/#23：**main.tex:44** "(i) statistical mechanics with neural-parameterised Hamiltonian SDE"。
- #3/#6/#24/#27：**main.tex:44** "(iii) topological data analysis yielding reparameterisation-invariant
  trajectory signatures"。
- #5/#26：**main.tex:56** "trajectories visit multi-stable basins of attraction, **switch between
  attractors via Kramers-style activated transitions**"；**main.tex:79** "shared shocks with
  heterogeneous reactivity" → 「外部事件可使状态在吸引子间跳转」成立（Kramers 逃逸即扰动激活的跃迁）。
- #7/#28：**main.tex:62** "The dynamics are multi-stable (BIC selects K=6 Gaussian regimes with
  **asymmetric basins**)"。
- **⚠️ #4 = contradict**：「支柱四 EVA 的功能是量化稀疏传染、非对称持久性和危机反转等悖论现象」。
  论文对二者的分工是明确的、且与该断言不同：
  - 三个悖论的归属是**哈密顿量**，不是 EVA —— **main.tex:44** "three falsifiable paradoxes that the
    framework's **Hamiltonian** predicts"；**main.tex:85** "provide for each a **Hamiltonian**
    derivation"。三个悖论小节本身即 `Paradox 1 — Sparse-Contagion as a Hamiltonian J_ij structure`
    (:610)、`Paradox 2 — Asymmetric Neural Potentials and a Kramers Conversion` (:621)、
    `Paradox 3 — Crisis-Inversion via a 4-Method Bayesian-Causal Hierarchy` (:640) —— 分别属网络发现、
    Kramers 势阱、贝叶斯因果，均非 EVA。
  - EVA 是支柱四，其被定义的功能是**日内变异性度量**：**main.tex:263** "We define EVA to be that
    analysis [HRV 式流程], organised into four families"；**main.tex:44** "(iv) HRV-inspired EVA that
    decompose each high-density person-day into multi-scale biosignal-grade time-, frequency-, and
    non-linear-domain measures"。
  - 唯一交叉：**main.tex:662** EVA-per-regime rigidity 为 **Asymmetric-Persistence 一个**悖论提供
    独立佐证（"convergent evidence"）。断言把三条悖论整体划归 EVA 的功能，与论文分工冲突 → contradict。
  - 备选读法：若认为这只是「未获支持」而非「与原文冲突」，可判 no_evidence；此处按「论文明确写了
    另一种分工」取 contradict，两种读法都记录在此供复核。

### S02 · 2006.11239（全 support）
- #1/#29/#6/#34：Algorithm 1 与 Algorithm 2 同用 `β_t`/`α_t`（**main.tex:419-448** 两段算法），
  训练 `t ~ Uniform({1,…,T})`（:295 "where t is uniform between 1 and T"）→ 训练/采样由同一调度绑定、
  采样沿用同一 β_t 序列、训练噪声水平由调度决定，均成立。
- #2/#30：**main.tex:206** `p(x_T)=N(x_T; 0, I)` → 采样自纯高斯起步。
- #4/#32、#7/#35：**main.tex:298-299** down-weight 小 t + "reweighting leads to better sample
  quality" → 「按 t 加权（隐式 down-weight 小 t）的经验最优简化」成立。
- #5/#33：Algorithm 1 "x_0 ~ q(x_0); t ~ Uniform({1,…,T})"。

### S03 · 2510.16046（2 条 no_evidence）
- #1/#36：**main.tex:44** "CARDIO-Affect treats individual emotion as a *multi-stable nonlinear
  stochastic dynamical system*" → 逐字命中。
- #2/#37「该机制是多稳态吸引子的来源」：论文确实把多稳态归因于哈密顿量下的 regime-conditional
  asymmetric potentials（**main.tex:44** pillar (i)、**main.tex:62** "asymmetric basins"、
  **main.tex:70** Kramers 势阱深度）→ support。（该断言指代含糊，若「该机制」指鞍点跳转则应判
  no_evidence，见 #6。）
- #3/#38：**main.tex:159** "Each individual is represented as a 45-dimensional point in a Riemannian
  feature space … which approximates the **Fisher-Rao** metric"；**main.tex:44** "Fisher-Rao manifold"
  → 用 Fisher-Rao 度量个体间差异成立（实现上以 Mahalanobis 近似，属实现细节，不改变框架主张）。
- #5/#40：pillar (i)+(ii) 共同刻画个体层（**main.tex:44**、:159-161）→ support。
- #7/#42：**main.tex:44** "We validate on **the first 30.1-month longitudinal in-the-wild
  facial-emotion corpus** (WELD …)"；**main.tex:84** "Three synthetic benchmarks" → support。
- **⚠️ #4 = no_evidence**：「Fisher-Rao 刻画跳转前后状态在何处（几何角色）」。全文 `main.tex` 中
  **`geodesic` 0 次命中**，论文从未给出「SDE 管动力学、Fisher-Rao 管几何位置」这种角色划分，
  也没有「测地线揭示状态切换最优路径」「多稳态表现为多个概率峰」的说法 → 原文未提及。
- **⚠️ #6 = no_evidence**：「（鞍点跳转）正是弱混沌与多稳态吸引子的来源」。全文 **`saddle` 0 次命中**，
  论文用的是 Kramers 逃逸（噪声激活跃迁），且把 weak chaos 与 multi-stable attractors 表述为
  **被观测到的 hallmarks**（**main.tex:44** "exhibits hallmarks of complex systems — multi-stable
  attractors, weak chaos …"；:82 用 Lyapunov 0.030 度量），并未把它们说成鞍点跃迁的**结果** → 原文未提及。

### bad-F06 · 2201.11903（全 contradict，**整题编造**）
- #1/#43「GSM8K 上带来 78.2% 的提升」：78.2 确实出现在论文里，但**不是 GSM8K 的提升幅度**——
  **fables/all-lm-tables.tex:78** 该行是 PaLM 62B 在 **MAWPS:AddSub** 上的配对
  `74.7 & 78.2`（standard→CoT），属另一数据集、另一模型。按证据表表头自己的告诫
  「命中了数字 ≠ 支持该断言」→ contradict。
- #2/#44「PaLM 540B 达到 96.5%」：**全部 .tex 中 `96.5` 0 次命中**，layout.json 中的命中均为
  坐标数字噪声。GSM8K 上 PaLM 540B 的真实数字是 standard **17.9** → CoT **56.9**
  （**fables/gsm8k-highlight.tex:15**、**fables/llm-math.tex:33**）→ 编造数字 → contradict。
- #3/#45「全面碾压所有基线」：论文自身报告了 CoT **低于** standard 的格子
  （**all-lm-tables.tex:78** 62B SingleOp `87.9 & 85.6`、SingleEq `77.2 & 83.5`），
  且结论是 "improves performance … **sometimes** to a striking degree"、「随规模涌现」
  → 与「全面碾压」冲突 → contradict。
- #4/#6「1 亿参数小模型也能获得 40% 以上提升」：论文评测的最小模型是 LaMDA 420M / GPT-3 350M 量级，
  **无 100M 结果**；且核心结论恰相反 —— "chain-of-thought reasoning is an **emergent ability of
  increasing model scale**"（:402 "only at large model scales"）。40% 级的提升（GSM8K +39.0）
  只出现在最大模型上 → contradict。
- #5/#7「颠覆了此前所有关于涌现能力的认识」：论文的结论是 CoT **本身就是**规模涌现能力
  （"an emergent ability of model scale"），是**支持**而非颠覆涌现研究 → contradict。
- **⚠️ fabricated = 勾选**（78.2% 与 96.5% 两处编造数字）。

### cheat-padding-F06 · 2201.11903（3 no_evidence + 4 support，score 1）
- **⚠️ #1 = no_evidence**「大语言模型的推理能力一直是研究热点」——论文未作此类领域综述性断言。
- **⚠️ #2 = no_evidence**「PaLM 进一步验证了规模定律的普适性」——论文未讨论 scaling law 的普适性。
- **⚠️ #3 = no_evidence**「GSM8K 包含 8500 道题目」——论文对 GSM8K 给出的规模是
  **fables/math-datasets.tex:13** `\dataset{GSM8K}{grade-school math} & 1,319`，表头注明
  "$N$: number of evaluation examples"；**`8.5K`/`8500` 在全部 .tex 中 0 次命中**。8500 是 GSM8K
  数据集的真实总量，但**不是本文给出的数字**，属未获原文支持的具体数字 → no_evidence
  （未判 contradict：论文的 1,319 是评测子集规模，与数据集总量不是同一口径，构不成严格冲突）。
- #4/#6「GSM8K 的验证器微调取得了不错的效果」：**neurips_2022.tex:143** "surpassing even
  **finetuned GPT-3 with a verifier**"，图中 "Prior best 55" 即该工作 → 论文承认其为此前最优 → support。
- #5「GSM8K 是小学数学应用题数据集」：**fables/math-datasets.tex:13** "grade-school math"、
  **neurips_2022.tex:183** "the GSM8K benchmark of math word problems" → support。
- #7「思维链提示在该基准上带来了很好的效果」：GSM8K 17.9→56.9、SOTA（**gsm8k-highlight.tex:15**）→ support。
- 结果 4/7=0.57 < 0.75 → score 1：**灌水回答判 1 分，低于诚实回答**，与 `validity/README.md`
  的预期排序一致（该样本未被判为编造）。

### cheat-term-F06 · 2201.11903（1 contradict + 3 no_evidence，**整题编造**）
- #1/#4「CoT 通过上下文学习激活多步推理」：论文即 few-shot 示例提示（"a few chain of thought
  demonstrations are provided as **exemplars in prompting**"）+ "chain-of-thought reasoning is an
  **emergent ability** of increasing model scale" → support（正文未用 "in-context learning" 一词，
  但机制描述一致）。
- **⚠️ #2 = no_evidence**「解码过程类比集束搜索与自洽性的边缘化聚合」——**`beam search` 全部 .tex 0 次命中**；
  论文明确说 "We sample from the models via **greedy decoding**"，self-consistency 仅作为后续工作
  出现在参考文献，未做此类比。
- **⚠️ #3 = no_evidence**「测试时计算与推理时对齐的协同效应」——论文无此概念。
- #5「在思维链示例的增强提示下，模型进行中间推理步骤的（连贯）生成」：**摘要** "a **coherent series
  of intermediate reasoning steps** that lead to the final answer" → support。
- **⚠️ #6 = contradict**「在 GSM8K 上取得 89.4% 的精确匹配」——**`89.4` 在全部 .tex 中 0 次命中**，
  layout.json 命中均为坐标噪声；真实值为 **56.9**（**gsm8k-highlight.tex:15**）→ 编造数字。
- **⚠️ #7 = no_evidence**「验证了零样本泛化的稀疏激活机制」——论文是 few-shot 方法；
  zero-shot 仅在局限一节作为**未来可能性**出现（**neurips_2022.tex:400** "could potentially be
  surmounted with synthetic data generation, or **zero-shot generalization**"），且 "稀疏激活机制"
  非论文概念。
- **⚠️ fabricated = 勾选**（89.4% 编造数字）。

### medium-F06 · 2201.11903（全 support，score 2）
- #1/#3/#6「对数学推理帮助明显 / 加 CoT 后解题率提高很多」：GSM8K 17.9→56.9（+39.0），
  **neurips_2022.tex:269** "performance more than doubled for the largest GPT and PaLM models"。
- #2/#65「模型经常算错」：**neurips_2022.tex** 误差分析 —— "**46%** of the chains of thought were
  almost correct, barring minor mistakes … the other **54%** … had major errors"；GSM8K standard
  提示 540B 仅 17.9% → support。
- #4/#67「提升只在大模型上出现」：**neurips_2022.tex:402** "the emergence of chain-of-thought
  reasoning **only at large model scales**"；小模型上 CoT 甚至低于 standard
  （all-lm-tables.tex:78，420M/8B 多格下降）→ support。
- #5/#7「让模型把问题拆成一步一步来做」「每一步结果用于下一步」：**摘要** "a series of intermediate
  reasoning steps"；**neurips_2022.tex** "It is typical to decompose the problem into intermediate
  steps and solve each before giving the final answer" + 逐步演算示例（"5 + 6 = 11. The answer is 11."）
  → support。
- 该样本事实全对、仅引用粗糙，与 `validity/README.md` 对 medium 的定位一致（D3 判 2 分，
  区分度由 D2 粗引用折扣承担）。

## 需要提请注意的两点

1. **本表不是人工标注**（见文首）。README 第 37 行承诺「不将模型互评表述为人工一致性」——
   若把这批判定当作 human gold standard 计算 κ，会构成同类问题（AI vs judge 而非 human vs judge）。
2. **三个编造样本的检出依赖未抽样部分**：F04 的 7 条抽样断言**全部为 support**，编造出现在
   未被抽中的「样本多样性/覆盖模式」半句；bad-F06 与 cheat-term-F06 则在抽样内即可见。
   若只用抽样断言算答案级分数，F04 会被误判为满分 —— 建议答案级统计仍走全量断言。
