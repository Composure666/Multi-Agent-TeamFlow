# 运行环境变量配置清单

给「项目环境变量」弹窗（或任意容器 / 云端运行环境）填的键值对清单。
代码里实际读取的 `process.env` 共 32 个（含测试专用），**真正需要手填的只有下面这些**。

> 值的来源：本机 `.env.local`。`.env*` 已在 `.gitignore` 内，**不要把真实值提交进仓库或写进本文档**。

---

## 一、最小可用集（必填）

没有模型 Key，Agent 无法调用任何 LLM。至少要有一条。

| 键 | 值怎么取 | 用途 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 你自己的 DeepSeek 控制台 key | 默认主力 provider |

> ⚠️ **`ORCHESTRATOR_PROVIDER` / `ORCHESTRATOR_MODEL_ID` 已失效**（2026-09-22 实测：
> 全仓 `src`/`scripts`/`electron` 读取点 **0 处**）。编排层的模型现在取 agent 行自身的
> `model` 配置，不再有 env 覆盖入口。本文档此前把它们列为「必填」，属文档漂移，已更正；
> `.env.example` 里也已标注为「传不传都不生效」。

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
| `OSS_BUCKET` | 你自己的 bucket 名（在阿里云 OSS 控制台创建） |
| `OSS_ENDPOINT` | 该 bucket 所在地域的 endpoint，形如 `oss-cn-<region>.aliyuncs.com` |
| `OSS_ACCESS_KEY_ID` | 你自己的 RAM 用户 AccessKeyId（建议只授该 bucket 的写权限） |
| `OSS_ACCESS_KEY_SECRET` | 对应的 AccessKeySecret |

**四个缺任意一个都不生效**，`write_artifact` 会退回本地存储，容器重建后图片变成坏链。
本机若已在 `.env.local` 里配了这四项，`oss-image-store` 的两个测试会读到真实配置而失败——那是预期行为；
测试本身用的是假样例值，不会依赖你任何真实资源。

> ❗ **不要把真实 bucket 名 / endpoint / AccessKey 写进任何进版本管理的文件**（含测试夹具、脚本注释、文档示例）。
> 只想跑通测试，用 `test-bucket` / `oss-cn-hangzhou.aliyuncs.com` 这类明显的占位值即可。

---

## 三、持久化（容器 / 云端部署必填）

| 键 | 建议值 | 用途 |
| --- | --- | --- |
| `AGENTHUB_DATA_DIR` | 平台挂载卷路径，如 `/workspace/.agenthub-data` | 数据库、会话、产物目录 |

Electron 模式下这个值由主进程注入 `userData`，**不需要手填**；web / dev 未设置时兜底为 cwd。
容器里不设会导致整个 Multi-Agent TeamFlow 数据随实例销毁一起丢失。

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
keep = ['DEEPSEEK_API_KEY','OSS_BUCKET','OSS_ENDPOINT','OSS_ACCESS_KEY_ID','OSS_ACCESS_KEY_SECRET']
for line in open('.env.local', encoding='utf-8-sig'):
    k, _, v = line.strip().partition('=')
    if k in keep: print(k + '=' + v)
"
```
