# 模型分配与降级兜底

> 本文说明「设置 → 模型分配」的能力键体系、优先级链结构，以及 Agent 运行时的降级兜底机制。
>
> 常量真相源：`src/lib/llm-shared.ts`；运行时：`src/server/llm-failover.ts` +
> `src/server/provider-router.ts`；数据表：`llm_providers` / `llm_model_assignments` /
> `llm_failover_config` / `llm_provider_status` / `llm_failover_events`。

---

## 1. 三个概念

| 概念 | 落点 | 说明 |
| --- | --- | --- |
| 供应商 | `llm_providers` | 一组凭证（key、base URL）+ 可选模型清单。四个内置 id：`anthropic` / `openai` / `deepseek` / `ark`；其余（含用户自建）一律走 `openai-compatible` 协议 |
| 能力键 | `llm_model_assignments.capability_key` | 把「一类调用场景」映射到一条优先级链。系统能力 4 个（`prompt_optimize` / `task_planning` / `context_summary` / `system_chat`）、Agent 模态 4 个（`agent:code` / `agent:text` / `agent:vision` / `agent:image`）、全局策略 3 个（`global:default` / `global:default_provider` / `global:fallback_provider`） |
| 优先级链 | `llm_model_assignments.priority` | 升序即尝试顺序，`priority` 小的先试。同能力下未被单独配置时回退到全局链 `global:default` |

模态到能力键的换算是 `modalityToCapabilityKey()` / `capabilityKeyForModality()`，
历史值 `audio` → `text`、`multimodal` → `vision` 由 `normalizeModality()` 归并，不会悬空。

---

## 2. 基线水位：`deepseek/deepseek-v4-flash`

`FALLBACK_PROVIDER_ID = 'deepseek'` + `FALLBACK_MODEL_NAME = 'deepseek-v4-flash'`
是项目原有水位，也是**所有能力链的链尾兜底**（`buildBaselineCandidate()`）。

它的特殊性在于：**不依赖「模型分配」是否配过**。只要供应商中心里存在可用的 deepseek key，
链尾就一定能补上这一条。所以即使分配表被清空、或新接入的模型整体不可用，Agent 也不会彻底挂死。

`hasBaselineFallback(chain)` 供测试与 UI 自检链尾是否为基线。

---

## 3. 运行时拼链：`buildAgentFailoverChain()`

给 Agent 运行期（`custom` 适配器）用的候选链，顺序即尝试顺序：

1. **Agent 自己配的 provider/model**（`agents.model_provider` + `model_id` + 凭证）永远是第一顺位
   —— 用户显式配过的东西不被隐性改写；
2. 之后接该 Agent 模态能力（`agent:<modality>`）在「模型分配」里配的优先级链，去掉与第 1 项重复的；
   - 取链规则：`resolveCapabilityChain()` 先看模态自己的链，若该链**只有基线、没有实质候选**
     （用户没配过 / 配的供应商已删），再往下试 `agent:text` —— 「普通 chat + 工具循环」的标准链，
     继续往下找才有跨供应商余量；
3. 最后保证链尾是基线 `deepseek/deepseek-v4-flash`。

返回空数组表示「没有可用的候选」，调用方（`agent-runner`）保持旧行为：直接用 agent 字段跑，报错照抛。

> **只对 chat 协议成员建链。** 调用方只给 `agent.adapterName === 'custom'` 的成员建链；
> `image-gen` 适配器走生图协议，链上任何 chat 模型都必然撞一次「不触发降级的 400」，
> 白白烧掉一次切换配额。

### 3.1 候选去重键 `candidateKey()`

**有显式 key 时**，目标的完整身份是 `端点::key::模型`，不是 `providerId::模型`。

原因：`providerId` 是归因账本上的标签，两行供应商完全可以被配成「端点 + key 完全相同」的等价目标；
归因按端点反查后，同一个目标会被两行分别认领，只按 `providerId` 判重就发现不了这种重复
—— 白烧一次切换配额，还可能把链尾基线挤掉。

**没有显式 key 时**（内置供应商读 env），协议与凭证都由 `providerId` 决定，因此退回
`providerId::端点::模型`。

链尾补基线时**必须走同一个 `candidateKey`**：写成朴素的 `deepseek::deepseek-v4-flash`
会与能力链里那条同名基线对不上（它的 key 是 `端点::key::模型`），结果基线被补第二遍。

---

## 4. ❗ 铁律：路由与归因都由**端点**决定，不由 `model_provider` 标签决定

`model_provider` 只是一个标签。用户可以把它写成 `deepseek`，而把 `api_base_url` 指向别的网关。
因此：

| 位置 | 规则 |
| --- | --- |
| `resolveCustomProviderClientConfig`（实际发请求） | 显式 `apiBaseUrl` **优先于**该厂商官方默认地址（2026-09-16 前是反的：已知厂商无条件用官方地址、忽略 `apiBaseUrl`） |
| `buildAgentFailoverChain`（归因） | `providerId` 由 `findProviderIdForEndpoint({ apiBaseUrl, apiKey, modelId })` 反查，而不是取 `row?.id`；端点明明是自定义的却匹配不上任何供应商行时返回 `null`（**宁可不冷却，也不把账算到没被调用的供应商头上**）。只有「算不出端点」时才退回按标签归因 |
| `experience-service` 的复盘提炼 | 必须与执行期用同一个 `resolveCustomProviderClientConfig`，否则会出现「任务跑得通、复盘提炼必失败」 |

**违反这条铁律的后果（线上真实发生过）**：请求拿着 A 家的 key 打到了 B 家端点 → 401
`Your api key: ****xxxx is invalid`（每秒重试一次），而失败被记到 B 名下 →
把**健康的链尾兜底**打进冷却（`llm_provider_status` 实测 `status=unavailable`、
`consecutive_failures=500`），兜底链形同虚设。

---

## 5. 触发条件（`shouldFailover` / `classifyError`）

| 错误 | 是否切换 | 原因 |
| --- | --- | --- |
| 402 额度耗尽 | ✅ | 换供应商即可恢复 |
| 余额类错误（含**HTTP 400 + `Arrearage`** 这种非 402 形状） | ✅ | 各家对「欠费」的 HTTP 状态码叫法不统一，只认 402 会让账号一欠费就当场硬失败 |
| 401 鉴权失败 | ✅ | key 失效，重试无意义 |
| 429 限流 | ✅ | 换供应商绕过限流 |
| 5xx 服务端错误 | ✅ | 上游故障 |
| 超时 | ✅ | 上游卡死 |
| 400 参数错误 | ❌ | 换成兜底模型也会同样失败，只是白烧额度 |
| 业务类错误 | ❌ | 同上 |

即使判定为**不切换**，失败仍会登记到供应商健康状态（连续失败计数 → `degraded` →
`unavailable` + 冷却），只有「切换」这一个动作被跳过。
每个触发条件在 `llm_failover_config` 里都有独立开关，`enabled=false` 时整体不切换。

---

## 6. 两个关键约束

1. **只在「还没产出任何内容」时切换。** 适配器在首个 `text.append` / `tool_call` 时把
   `emittedThisTurn` 置为 true，之后 `canSwitch()` 返回 false，不再允许切换 ——
   否则一条消息里会出现两段互不衔接的输出。
2. **冷却与恢复。** 连续失败累计到阈值后供应商标记 `unavailable` 并进入 30s 冷却，
   冷却期内该候选被 `isCandidateAvailable()` 跳过（`auto_recover=true`，到期自动恢复）；
   切换事件写入 `llm_failover_events`，可在「设置 → 故障转移」面板查看。

---

## 7. 执行器：`runWithFailover()`

adapter 层只需要给出 `attempt(candidate)`，其余交给执行器：

- 第 i 个候选失败且属于可切换错误、链上还有下一个、且 `canSwitch()` 允许
  → 记录健康状态 + 切换事件，继续第 i + 1 个；
- 不可切换（400 参数错误 / 业务错误）→ 直接抛出，不浪费配额；
- `canSwitch()` 返回 false（本轮已产出内容）→ 直接抛出；
- 链尾也失败 → 抛出最后一个错误（此时已记录足够的诊断信息）；
- `signal.aborted` → 立即抛出，不再尝试后续候选。

---

## 8. 代码位置索引

| 关注点 | 文件 |
| --- | --- |
| 常量 / 内置供应商 / 能力键 / 模态归一 | `src/lib/llm-shared.ts` |
| 健康状态、冷却、错误分类、切换事件 | `src/server/provider-router.ts` |
| 候选链组装 + 执行器 | `src/server/llm-failover.ts` |
| 供应商行解析、按端点反查归因 | `src/server/provider-service.ts` |
| 分配读写（面板 / API） | `src/server/model-assignment-service.ts` |
| API 路由 | `src/app/api/model-assignments/` · `src/app/api/provider-priority/` |
| 实际发请求时的端点解析 | `src/server/adapters/custom-provider-client.ts` |
| 把链交给 adapter 的接线点 | `src/server/agent-runner.ts` |
| adapter 内的逐个尝试 | `src/server/adapters/custom-agent-adapter.ts` |
