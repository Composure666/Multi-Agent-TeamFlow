# 模型分配与降级兜底（阿里云百炼接入）

> 本文档是「设置 → 模型分配」的取舍依据与最终清单。代码里的常量在
> `src/lib/llm-shared.ts`（`BAILIAN_MODELS` / `BAILIAN_MODEL_NOTES` /
> `DEFAULT_MODEL_ASSIGNMENT_PLAN`），本文档与之一一对应，改代码时请同步改这里。

---

## 1. 接入概览

| 项 | 值 |
| --- | --- |
| 供应商 ID | `bailian` |
| 展示名 | 阿里云百炼 |
| OpenAI 兼容 Base URL | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Anthropic 兼容 Base URL | `https://dashscope.aliyuncs.com/apps/anthropic` |
| 模型协议 | 对话 / 工具调用 / 流式 / 视觉 → OpenAI 兼容；**生图 → DashScope 原生** |
| 环境变量 | `BAILIAN_API_KEY`（未配置时 bootstrap 跳过建行，项目仍以 deepseek 基线运行） |

### 1.1 两套生图协议（踩过的坑）

百炼的 OpenAI 兼容层**没有** `/images/generations`（实测 404）。生图必须走原生接口：

```
POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
```

代码里由 `resolveImageApiProtocol(baseUrl)` 按 host 自动分派：

- host 是 `dashscope.aliyuncs.com` → 走 DashScope 原生（`toDashScopeSize` 把 `1024x1024` 转成 `1024*1024`）；
- 其它网关（SiliconFlow 等）→ 仍走 OpenAI 兼容协议，行为不变。

所以「生图 Agent」在百炼下能直接跑通，无需用户改协议。

---

## 2. 对比基准：native `deepseek/deepseek-v4-flash`

它是项目原有水位，也是**所有能力链的链尾兜底**，改造后地位不变。

| 维度 | deepseek-v4-flash（基准） | 百炼接入后的增量 |
| --- | --- | --- |
| 上下文窗口 | 64K | 主力 128K，长文本 1M（`qwen-long`） |
| 工具调用 | 支持，但长链路（多轮 tool loop）稳定性一般 | `qwen3-coder-plus` / `qwen3.8-flash` 多轮工具链更稳 |
| 视觉（识图） | **完全不支持** | `qwen3-vl-plus/flash` + `qwen3.5-ocr` 补齐 |
| 生图 | **完全不支持** | `z-image-turbo` / `qwen-image-3.0(-pro)` 补齐 |
| 代码 | 可用，非专项 | `qwen3-coder-plus` 仓库级理解；`kimi-k2.7-code` 异构复核 |
| 供应商风险 | 单点 | 引入阿里通义 + 智谱 + 月之暗面三个家族，降低同源集体失效风险 |

**一句话定位**：deepseek-v4-flash 从「唯一可用的通用模型」降级为「通用兜底 + 基线水位」，
百炼模型负责在**代码、视觉、生图、超长上下文、深度推理**这些它做不到或有明显短板的方面补齐。

---

## 3. 精选模型清单（18 个）

从百炼 250+ 个模型里筛出这些，其余不进下拉框（理由见 §7）。

### 3.1 通用文本

| 模型 | 上下文 | 差异化定位（相对 deepseek-v4-flash） |
| --- | --- | --- |
| `qwen3.8-flash` | 128K | **新一代通用主力**：中文指令跟随与工具调用稳定性优于同级 flash，延迟与基准持平 → 可无痛替换 |
| `qwen3.8-max` | 256K | **旗舰通用**：复杂规划 / 长链路推理，用于 Orchestrator 拆解等高质量场景 |
| `qwen3.7-flash` | 128K | **上一代轻量款**：作为 3.8-flash 的降级备选，避免单一版本故障 |

### 3.2 第三方异构骨干（补同源失效风险）

| 模型 | 上下文 | 差异化定位 |
| --- | --- | --- |
| `glm-5.3` | 128K | 智谱异构骨干：与通义 / DeepSeek **不同源**，用于系统级对话 |
| `kimi-k3` | 256K | 长上下文写作 / 资料综述：长文档凝练能力强 |

### 3.3 代码

| 模型 | 上下文 | 差异化定位 |
| --- | --- | --- |
| `qwen3-coder-plus` | 256K | **代码旗舰**：仓库级理解、多轮工具链稳定，适合 refactor / debug |
| `qwen3-coder-flash` | 128K | **代码高性价比**：延迟约为 coder-plus 的 1/2，适合批量改动与代码解释 |
| `kimi-k2.7-code` | 256K | **代码异构备选**：换家族换思路，用于主代码模型结论可疑时的二次验证 |

### 3.4 视觉

| 模型 | 上下文 | 差异化定位 |
| --- | --- | --- |
| `qwen3-vl-plus` | 128K | **视觉旗舰**：截图 / 设计稿 / 图表理解 —— 基准模型完全不支持的模态 |
| `qwen3-vl-flash` | 128K | **视觉高性价比**：延迟 ~0.4s，适合大批量截图与页面巡检 |
| `qwen3.5-ocr` | 32K | **OCR 专项**：票据 / 扫描件 / 手写体结构化抽取，输出 JSON |

### 3.5 生图

| 模型 | 差异化定位 |
| --- | --- |
| `z-image-turbo` | **生图极速款**：~4s 出图，适合草图 / 迭代试稿 |
| `qwen-image-3.0` | **生图标准款**：质量与成本平衡，主体一致性好 |
| `qwen-image-3.0-pro` | **生图旗舰**：细节 / 排版 / 文字渲染最强，用于终稿 |

### 3.6 长文本 / 深度推理 / 翻译

| 模型 | 上下文 | 差异化定位 |
| --- | --- | --- |
| `qwen-long` | **1M** | **超长上下文**：长对话 / 长资料摘要，摘要任务单位成本最低 |
| `qwen3.5-397b-a17b` | 128K | **MoE 大模型**：难推理 / 数学 / 复杂约束求解的强备选 |
| `qwq-plus` | 128K | **深度推理专线（仅流式）**：思维链更长，疑难问题兜底 |
| `qwen-mt-plus` | 16K | **翻译专项**：多语种翻译质量与术语一致性优于通用模型 |

---

## 4. 最终模型分配清单（交付物）

优先级 `p0` 最优先，向下依次降级；**链尾恒为 `deepseek/deepseek-v4-flash`**。

### 4.1 Agent 类型（按模态）

| Agent 类型 | 能力键 | 主模型（p0） | 中间兜底 | 最终兜底 |
| --- | --- | --- | --- | --- |
| 代码 Agent | `agent:code` | `bailian/qwen3-coder-plus` | — | `deepseek/deepseek-v4-flash` |
| 文本 Agent | `agent:text` | `bailian/qwen3.8-flash` | — | `deepseek/deepseek-v4-flash` |
| 视觉 Agent | `agent:vision` | `bailian/qwen3-vl-plus` | `bailian/qwen3-vl-flash` | `deepseek/deepseek-v4-flash` |
| 生图 Agent | `agent:image` | `bailian/z-image-turbo` | `bailian/qwen-image-3.0-pro` | `deepseek/deepseek-v4-flash` |

### 4.2 系统能力

| 能力 | 能力键 | 主模型（p0） | 最终兜底 | 分配理由 |
| --- | --- | --- | --- | --- |
| 提示词增强 | `prompt_optimize` | `bailian/qwen3.8-flash` | `deepseek/deepseek-v4-flash` | 高频、短输入，要快且中文语感好 |
| 任务规划 | `task_planning` | `bailian/qwen3.8-max` | `deepseek/deepseek-v4-flash` | Orchestrator 拆解子任务，能力优先于成本 |
| 上下文摘要 | `context_summary` | `bailian/qwen-long` | `deepseek/deepseek-v4-flash` | 1M 窗口 + 摘要任务单位成本最低 |
| 系统对话 | `system_chat` | `bailian/glm-5.3` | `deepseek/deepseek-v4-flash` | 刻意换供应商家族，避免与其它能力同源同故障 |

### 4.3 全局策略

| 能力键 | p0 | p1 | 说明 |
| --- | --- | --- | --- |
| `global:default` | `bailian/qwen3.8-flash` | `deepseek/deepseek-v4-flash` | 未单独指定能力时的通用优先级链 |
| `global:default_provider` | `bailian/qwen3.8-flash` | `deepseek/deepseek-v4-flash` | 默认供应商 |
| `global:fallback_provider` | `deepseek/deepseek-v4-flash` | — | **兜底供应商固定为 deepseek，不参与上移** |

### 4.4 逐条分配理由（为什么是它）

- **`agent:code` → `qwen3-coder-plus`**：代码是工具调用密度最高的场景，基准模型的长链路稳定性是短板；
  coder-plus 有 256K 窗口和仓库级理解，且与基准同为「便宜档」，替换无成本压力。
  中间不放 `coder-flash`：flash 与 plus 定位重叠，直接落到 deepseek 反而更能暴露真实故障。
- **`agent:text` → `qwen3.8-flash`**：文本 Agent 是使用量最大的一类，必须保证延迟不退化。
  3.8-flash 与基准延迟持平但中文指令跟随更好，属于「无损升级」。
- **`agent:vision` → `qwen3-vl-plus` → `qwen3-vl-flash` → deepseek**：视觉是基准模型**完全缺失**的能力，
  主备都必须是 VL 模型；`vl-flash` 作为同模态快速降级，`vl-plus` 故障时不至于直接掉到不会识图的 deepseek。
- **`agent:image` → `z-image-turbo` → `qwen-image-3.0-pro` → deepseek**：同理，生图是缺失能力。
  主用 turbo 因为生图是**迭代式**交互（试稿 → 改 → 再试），速度比单次质量更关键；
  中间放 pro 让「turbo 明确报错」时仍能出图，只在最后才落到 deepseek（此时会明确报「不支持生图」而不是静默失败）。
- **`task_planning` → `qwen3.8-max`**：唯一一个「能力优先于成本」的选择。规划错了后面全错，
  且规划调用频率低（每次任务一次），用旗舰不心疼。
- **`context_summary` → `qwen-long`**：1M 窗口直接省掉「先截断再摘要」的逻辑，且长文本摘要单价最低。
- **`system_chat` → `glm-5.3`**：**故意选异构家族**。系统对话是用户最先感知到故障的入口，
  如果它和主力模型同源，供应商抖动时会同时挂掉；用智谱可以把「阿里系全挂」变成一个可降级事件。
- **`global:fallback_provider` 保持 `deepseek-v4-flash`**：这是用户明确要求 —— 兜底仍是项目原有基线，
  保证新接入的百炼整体不可用时，项目回到改造前的能力水位继续可用。

---

## 5. 降级兜底机制

### 5.1 三层结构

```
llm_providers          供应商凭证（key / baseUrl / 模型清单）
      ↓
llm_model_assignments  能力 → 「主模型 → 兜底模型」优先级链（本文档 §4）
      ↓
llm_failover_config    触发条件开关、重试次数、冷却时长（默认：全开 / 2 次 / 30s）
      ↓
llm_provider_status    运行时健康度（degraded / unavailable + 冷却到期时间）
      ↓
llm_failover_events    切换审计日志（「设置-故障转移」面板读这个）
```

运行时实现在 `src/server/llm-failover.ts`：

- `buildAgentFailoverChain(agent)` 拼链：**Agent 自己的模型 → 该模态链 → 链尾 `deepseek/deepseek-v4-flash`**；
- `runWithFailover(chain, attempt, …)` 逐个候选尝试，失败按分类决定是否切换。

### 5.2 触发条件（`shouldFailover`）

| 错误 | 是否切换 | 原因 |
| --- | --- | --- |
| 402 额度耗尽 | ✅ | 换供应商即可恢复 |
| 401 鉴权失败 | ✅ | key 失效，重试无意义 |
| 429 限流 | ✅ | 换供应商绕过限流 |
| 5xx 服务端错误 | ✅ | 上游故障 |
| 超时 | ✅ | 上游卡死 |
| 400 参数错误 | ❌ | 换成兜底模型也会同样失败，只是白烧额度 |
| 业务类错误 | ❌ | 同上 |

### 5.3 两个关键约束

1. **只在「还没产出任何内容」时切换**。适配器在首个 `text.append` / `tool_call` 时把
   `emittedThisTurn` 置为 true，之后不再允许切换 —— 否则一条消息里会出现两段互不衔接的输出。
2. **冷却与恢复**。连续失败累计到阈值后供应商标记 `unavailable` 并进入 30s 冷却，
   冷却期内该候选被跳过（`auto_recover=true`，到期自动恢复）；切换事件写入
   `llm_failover_events`，可在「设置-故障转移」面板查看。

---

## 6. 验证结果

### 6.1 单元 / 集成测试（无网络）

| 文件 | 用例数 | 结果 |
| --- | --- | --- |
| `src/server/model-assignment-bailian.test.ts` | 20 | ✅ 全通过 |
| `src/lib/llm-shared.test.ts` | 12 | ✅ 全通过 |
| `src/server/bootstrap-bailian-smoke.test.ts` | 4 | ✅ 全通过 |

覆盖点：seed 幂等、四类模态创建 Agent 时自动匹配模型、团队成员按各自模态分配、
凭证自动补齐（不需用户手填 Key）、链尾恒为 deepseek-v4-flash、
429/402/401/5xx/超时触发切换、400 不切换、已出内容不切换、链尾失败抛真实错误、冷却跳过。

### 6.2 真实网络活体测试

`AGENTHUB_LIVE_LLM=1 vitest run src/server/bailian-live.test.ts` —— **2/2 通过**：

1. **主模型可用**：`qwen3.8-flash` 真实出流，`run.usage.model = qwen3.8-flash`，**无切换事件**；
2. **主模型不可用**（故意给坏 key）：自动转发到 `deepseek-v4-flash` 并正常出流，
   留下 `from=bailian → to=deepseek`、`capabilityKey=agent:text` 的切换记录。

### 6.3 真实库现状

`.agenthub-data/agenthub.db` 已回填：

- `llm_providers` 新增 `bailian`（18 个精选模型全部登记，`isConnected=true`）；
- `llm_model_assignments` 共 **23 行**，9 个能力全部「主模型 + deepseek-v4-flash 兜底」；
- `llm_failover_config` 落库一条 singleton 行（全触发条件开启）；
- `resolveModelForCapability('agent:code')` → `bailian/qwen3-coder-plus`。

### 6.4 seed 幂等规则（修过一个真实缺陷）

早期实现「只要该能力有一条记录就整条跳过」，导致 **`BAILIAN_API_KEY` 未配置时先落了一批
「只有兜底」的行，之后 key 配好了主模型永远补不上**。现规则：

1. 该能力名下的行**全部**是 seed 出来的（id 属于计划内的确定性集合）才动；出现用户自己加的
   / 改过的行即视为「已被用户接管」，整条跳过；
2. 引用的供应商必须已存在（外键前提），否则跳过该条；
3. 逐条 `ON CONFLICT(id) DO NOTHING` —— 只能补缺，不能覆盖。

---

## 7. 未接入的模型及原因

接入前对 250+ 个模型做过真实探测（chat + tools + stream + vision + 生图），以下被排除：

| 模型 / 家族 | 现象 | 结论 |
| --- | --- | --- |
| `kimi-k3`（原生接入名）、`GLM-5.3-Flash`、MiniMax、stepfun、xiaomi 等 | HTTP 400 `product not activated` | 账号未开通，接入会稳定报错 |
| `qwen-plus` / `qwen-max` / `qwen-turbo` | HTTP 403 `Free quota exhausted` | 免费额度耗尽，不适合做默认主力 |
| 其余同质模型 | 与已选 18 个定位重叠 | 只增加下拉框长度，不增加能力覆盖 |

保留的 18 个覆盖 **通用主力 / 旗舰规划 / 异构骨干 / 代码 / 视觉 / OCR / 生图 / 长文本 / 深度推理 / 翻译** 七类，
避免把 250+ 个模型全塞进下拉框。
