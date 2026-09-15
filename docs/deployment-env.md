# 运行环境变量配置清单

给「项目环境变量」弹窗（或任意容器 / 云端运行环境）填的键值对清单。
代码里实际读取的 `process.env` 共 32 个（含测试专用），**真正需要手填的只有下面这些**。

> 值的来源：本机 `.env.local`。`.env*` 已在 `.gitignore` 内，**不要把真实值提交进仓库或写进本文档**。

---

## 一、最小可用集（必填）

没有模型 Key，Agent 无法调用任何 LLM。至少要有一条。

| 键 | 值怎么取 | 用途 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 本机 `.env.local` 已配 | 本机在用的主力 provider |
| `ORCHESTRATOR_PROVIDER` | 本机 `.env.local` 已配 | 编排层默认 provider |
| `ORCHESTRATOR_MODEL_ID` | 本机 `.env.local` 已配 | 编排层默认模型 |

其它 provider，用到哪个填哪个：

| 键 | 用途 |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude 系列 |
| `OPENAI_API_KEY` | OpenAI 兼容接口 |
| `ARK_API_KEY` | 火山方舟，走豆包多模态时必填 |
| `ANTHROPIC_BASE_URL` | 走中转站时覆盖官方地址（可选） |

> 注意：运行时对 `deepseek` / `volcano-ark` / `openai` 三类 provider 会**忽略** Agent 配置里填的 `apiBaseUrl`，
> 走官方地址；只有全局环境变量能改。这条若不统一，会出现「任务跑得通、复盘必失败」。

---

## 二、图片产物上云（四个必须全填）

| 键 | 值怎么取 |
| --- | --- |
| `OSS_BUCKET` | 本机 `.env.local` 已配 |
| `OSS_ENDPOINT` | 本机 `.env.local` 已配 |
| `OSS_ACCESS_KEY_ID` | 本机 `.env.local` 已配 |
| `OSS_ACCESS_KEY_SECRET` | 本机 `.env.local` 已配 |

**四个缺任意一个都不生效**，`write_artifact` 会退回本地存储，容器重建后图片变成坏链。
（本机已有 OSS 变量，所以 oss-image-store 的两个测试会在本地失败——那是预期行为。）

---

## 三、持久化（容器 / 云端部署必填）

| 键 | 建议值 | 用途 |
| --- | --- | --- |
| `AGENTHUB_DATA_DIR` | 平台挂载卷路径，如 `/workspace/.agenthub-data` | 数据库、会话、产物目录 |

Electron 模式下这个值由主进程注入 `userData`，**不需要手填**；web / dev 未设置时兜底为 cwd。
容器里不设会导致整个 AgentHub 数据随实例销毁一起丢失。

---

## 四、可选

| 键 | 用途 |
| --- | --- |
| `PROMPT_OPTIMIZE_MODEL` | 提示词优化模型，支持 `deepseek-v4-flash` / `deepseek-v4-pro` |
| `PROMPT_OPTIMIZE_ANTHROPIC_MODEL` / `PROMPT_OPTIMIZE_OPENAI_MODEL` / `PROMPT_OPTIMIZE_ARK_MODEL` | 分 provider 指定优化模型 |
| `GITHUB_TOKEN` / `GH_TOKEN` | 能力中心的 GitHub 工具搜索，不填会走匿名限流 |
| `NEXT_TELEMETRY_DISABLED` | 关掉 Next 遥测，CI 里常用 `1` |

---

## 五、不要手填（运行时自管）

手填很可能把功能填坏：

`PORT`（默认 3000）、`AGENTHUB_DEV`、`AGENTHUB_COMPANION_MODE`、`AGENTHUB_MOBILE_TOKEN`、
`AGENTHUB_MOBILE_ALLOWED_ORIGINS`、`AGENTHUB_INTERNAL_BASE_URL`、`AGENTHUB_ALLOWED_TOOLS`、
`ELECTRON_RUN_AS_NODE`、`CODEX_API_KEY`、`MCP_SERVICE_TEST_TOKEN`。

---

## 附：一键导出本机真实值

在本机执行，直接打出可粘贴到弹窗的键值对（不写文件、不留痕）：

```powershell
python -X utf8 -c "
import os
keep = ['DEEPSEEK_API_KEY','ORCHESTRATOR_PROVIDER','ORCHESTRATOR_MODEL_ID','OSS_BUCKET','OSS_ENDPOINT','OSS_ACCESS_KEY_ID','OSS_ACCESS_KEY_SECRET']
for line in open('.env.local', encoding='utf-8-sig'):
    k, _, v = line.strip().partition('=')
    if k in keep: print(k + '=' + v)
"
```
