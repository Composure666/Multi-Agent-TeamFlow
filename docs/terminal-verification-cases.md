# 终端面板端到端验证用例（修复回归）

> 验证目标：修复后「运行展板」的终端面板应满足 ——
> **实时**
>
> ：Agent 运行中，自定义 adapter（Multi-Agent TeamFlow 自有 bash 工具）的命令实时显示并滚动
> **保留**
>
> ：运行完成后命令 + 输出保留在终端页，刷新 / 重新进入不丢
> **投影回看**
>
> ：claude-code /codex adapter（CLI 内部 Bash）运行完成后能投影出命令和输出（第 2、3 层修复点）
> 配套工具：
>
> `.tmp-probe/verify-run.mts`
>
> （只读，跑完一个 run 后一条命令核查数据层）

## 前置条件



| #  | 条件             | 说明                                                                                                                                                                   |
| -- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 | 修复代码在位         | `agent-runner.ts:2427` `isCommandToolName()`（小写归一）；`agent-run-debug-board.ts:1203` `projectAgentRunTerminalOutput`（含 `readCliToolResultOutputText` + `runRunning` 门） |
| P2 | dev server 运行中 | `pnpm dev`，浏览器打开 Multi-Agent TeamFlow                                                                                                                                            |
| P3 | 可用 agent       | ① 任意 **custom** adapter（如 产品文案助手，走 Multi-Agent TeamFlow bash 工具，**有实时**）；② **claude-code** adapter（如 PPT 设计师，走 CLI 内部 Bash，**无实时、有投影**）                                          |
| P4 | 记录本次验证时间       | 用于区分新旧 run                                                                                                                                                           |

## 用例总览



| 用例    | 验证点                           | 通过标准（简）                         |
| ----- | ----------------------------- | ------------------------------- |
| TC-01 | custom adapter 运行中实时终端        | 运行中终端有内容、实时滚动、可输入 stdin         |
| TC-02 | custom adapter 运行完保留          | 完成后命令 + 输出保留，刷新后仍在              |
| TC-03 | claude-code 大写 Bash 投影（关键回归）  | 完成后终端显示命令 + 输出，status=completed |
| TC-04 | 非零退出码命令                       | isError 标记正确，显示 \[exit 1]       |
| TC-05 | 超长输出截断                        | 输出 ≤4000 字符且带 `…[truncated]`    |
| TC-06 | Orchestrator 顶层 vs 子 Agent 隔离 | 顶层不串子命令，各子节点独立显示                |
| TC-07 | 历史 run 回归                     | 旧 run（09-11）不再显示「暂无终端输出」        |
| TC-08 | 多命令连续会话                       | 命令按顺序显示，shell/cwd 正确            |

## 详细用例

### TC-01 实时终端（custom adapter）



* **前置**：P1-P3 就绪；准备一个会触发 bash 的任务（如「列出当前工作区文件，并读取 xiaomi\_su7\_ppt\_framework.md 前 20 行」）

* **步骤**：

1. 新建会话（单聊或群聊），选 **custom** adapter agent

2. 发送上述任务

3. **run 进行中**：右侧 Inspector → 点击对应 run/agent 节点 → 切「终端」tab

* **预期**：

1. 终端有内容，非「暂无终端输出」；badge 显示「运行中」（live）

2. 命令出现后输出**实时追加滚动**（走 SSE）

3. 输入框可用（live 会话可发 stdin）

* **数据层**：run 完成后 `verify-run.mts <runId>` 显示 `terminal_sessions` ≥1 条且 status 非 running

### TC-02 运行完保留（custom adapter）



* **前置**：TC-01 完成

* **步骤**：1) 切到其他 tab 再切回「终端」；2) **刷新页面**，重新进入该 run 的终端 tab

* **预期**：命令 + 完整输出保留；顺序、`[exit N]` 标记正确；刷新后仍显示（不从「暂无终端输出」开始）

* **数据层**：`verify-run.mts` 判定区显示「真实 PTY 会话：有」

### TC-03 claude-code 大写 Bash 投影（关键回归）

> 这是第 2、3 层修复的直接验证点：CLI 内部执行的 Bash（大写 
>
> `Bash`
>
> ，结果可能是字符串 / 文本块数组）运行完必须投影出来。



* **前置**：P1-P3；任务会触发 claude-code 执行 grep / 命令（如「在 xiaomi-su7-ppt/index.html 中统计 WebGL 与 #0051DA 出现情况」）

* **步骤**：群聊中选 **claude-code** agent（PPT 设计师），发送任务；完成后打开终端 tab

* **预期**：

1. 终端显示命令段（≥1 条 grep / 命令），**含命令文本 + 输出内容**（CLI 文本块被 `readCliToolResultOutputText` 抽出）

2. status = **completed**（不是 live、不是 running——`runRunning` 门生效）

3. 无 stdin 输入框（非 live 会话）

* **数据层**：`verify-run.mts` 显示 `tool.completed (bash/codex_command)` ≥1、投影命令段 ≥1；`terminal_sessions` = 0（预期：CLI 内部执行，无真实会话 ——**实时与回看二选一，此用例只验回看**）

### TC-04 非零退出码



* **步骤**：让任一 agent 执行注定失败的命令（如 `grep -c "不存在的关键词" xiaomi-su7-ppt/index.html`）

* **预期**：该命令段 `isError=true`（UI 失败样式 / 红色），transcript 含 `[exit 1]`（或非 0）

* **数据层**：`verify-run.mts` 该段 `isError=true`

### TC-05 超长输出截断



* **步骤**：让 agent 执行输出超长的命令（如 `Get-ChildItem -Recurse | Out-String` 大目录、或读取大文件全文）

* **预期**：输出 ≤ 4000 字符，末尾带 `…[truncated]`（`truncateTerminalText`，agent-runner.ts:2451）

* **数据层**：对应 tool\_result 的 output 长度 ≤4000

### TC-06 Orchestrator 顶层 vs 子 Agent 隔离



* **前置**：群聊含 Orchestrator + 至少一个会执行命令的子 Agent

* **步骤**：发起会分派命令的多 Agent 任务；完成后依次点击 Orchestrator 节点、各子 Agent 节点看终端 tab

* **预期**：

1. Orchestrator 节点：只显示 Orchestrator **自身**命令（plan 阶段无 bash，通常为空态 —— 空态是正确语义；空态文案现为「该 Run 未执行终端命令」，有子 run 时附「点击图中 Agent 节点查看」指引）

2. 子 Agent 节点：各自命令独立显示，**互不串台**

* **数据层**：各 run 的 `verify-run.mts` 命令段与所属 agent 一一对应

### TC-07 历史 run 回归



* **步骤**：直接打开旧 run 的终端 tab（如 `run_KtDah19sfhM0`、`run_gERy0BT1rNTe`）

* **预期**：不再「暂无终端输出」；`run_KtDah19sfhM0` 显示 4 条命令，`run_gERy0BT1rNTe` 显示 2 条 grep（与回放一致）

* **数据层**：`node node_modules/tsx/dist/cli.mjs .tmp-probe/verify-run.mts run_gERy0BT1rNTe`

### TC-08 多命令连续会话（可选）



* **步骤**：让 agent 一次任务连续执行多条命令（ls → cat → grep 管道）

* **预期**：终端按调用顺序排列多条命令，shell 显示 PowerShell（Windows），cwd 一致

* **数据层**：`verify-run.mts` commandCount 与调用次数一致，顺序正确

## 数据层核查

每个 run 完成后执行（项目根目录）：



```
node node\_modules/tsx/dist/cli.mjs .tmp-probe/verify-run.mts \<runId>
```

输出四段：`[1] terminal_sessions`、`[2] debug events 计数`、`[3] UI 投影回放（与前端同路径）`、`===== 判定 =====`。runId 从 UI 或 DB 拿：



```
\# 最近 10 个 run（id / agent / adapter / 状态 / 时间 / 父 run）

node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('.agenthub-data/agenthub.db',{readOnly:true});console.log(JSON.stringify(db.prepare('SELECT r.id,r.agent\_id,a.name,a.adapter\_name,r.status,r.parent\_run\_id,datetime(r.started\_at/1000,\\"unixepoch\\",\\"localtime\\") s FROM agent\_runs r LEFT JOIN agents a ON a.id=r.agent\_id ORDER BY r.started\_at DESC LIMIT 10').all(),null,1));db.close()"
```

## 结果记录表

| 用例  | runId | 预期                | 实际                                                         | 结论（PASS/FAIL） | 备注 |
| ----- | -------------------------------------- | ------------------- | ------------------------------------------------------------ | ----------------- | ---- |
| TC-01 | run_Lx2EJAVE9GyT                       | 实时显示            | 全程无终端显示；数据层只有 fs_read(4)/fs_list(1)，**模型用文件工具代替了命令，未触发 bash** | 未触发（非失败） | 需用「必触发模板」重测 |
| TC-02 | run_Lx2EJAVE9GyT                       | 刷新保留            | 同上（无命令可保留）                                          | 未触发（非失败） | 同上 |
| TC-03 | run_5uwbbrgqwHOT                       | 投影出命令 + 输出   | **PASS**：5 次大写 Bash 全部识别，命令逐条显示带滚动（terminal.output 事件逐条 SSE） | PASS | claude-code 无真实 PTY，回看链路正常 |
| TC-04 | run_wacgLFWheUSX                       | isError / \[exit 1] | **PASS**：`cmd /c exit 1` 输出 `exitCode=1` + `[exited]`，真实 PTY 会话落库 | PASS | 同时证实 custom 实时管线全通 |
| TC-05 |                                        | ≤4000 + truncated   |                                                              | | 可选 |
| TC-06 |                                        | 顶层 / 子级隔离     | 数据层隔离验证通过（Orchestrator 0 命令 / 子 agent 各自独立） | | 空态文案已加指引 |
| TC-07 |                                        | 旧 run 有内容       | 回放验证通过（`run_KtDah19sfhM0` 4 段 / `run_gERy0BT1rNTe` 2 段） | | 脚本级验证 |
| TC-08 |                                        | 顺序正确            |                                                              | | 可选 |
| 自测A（TC-01/02 自动化） | run_73hsG7j0LJJ8 | 实时 + 保留          | **PASS**：数据层 `terminal_sessions=1`（exited exit=0）、`terminal.output` 事件 1、`tool.completed bash` 1，投影回放 `commandCount=1 outputLen=220`；Playwright UI 打开运行展板 → 点 agent 节点 → 终端 tab，断言 Get-Location / node --version / 结束标记全部显示，badge「已完成」 | PASS | 真实 PTY 链路全通，截图 `.tmp-probe/ui-2-terminal.png` |
| 自测B（TC-06 空态） | run_IJ3jKabjvMbH | 空态文案 + 指引        | **PASS**：0 命令 run 的终端 tab 显示「该 Run 未执行终端命令」，旧文案「暂无终端输出」UI 无残留 | PASS | 截图 `.tmp-probe/ui-4-empty.png` |

> 验收口径：TC-01/02/03 必须全过（对应「实时」「保留」「投影」三条主诉求）；TC-03 若 FAIL，直接回到第 2、3 层代码排查。
>
> **2026-09-12 复测结论**：代码修复（第 2、3 层）全部生效——TC-03（投影回看）、TC-04（实时 + 非零退出码）PASS；TC-01/02 未触发是因为 deepseek 模型在「列出/读取文件」类任务上自主选择 `fs_list`/`fs_read` 而非 `bash`（产品文案助手 tool_names 含 bash，能力在），**非代码问题**。TC-01/02 必触发模板：任务中显式写「不要使用 fs_list/fs_read 等文件工具，必须在工作区执行 PowerShell 命令：`Get-ChildItem -Force | Format-Table Name, Length` …」。
>
> **2026-09-12 自动化自测结论（AI 执行）**：用「必触发模板」新建 E2E 验证会话 `conv_tnMstNKjln0w`（产品文案助手）跑通**真实 PTY 全链路**（自测A）——数据层落库 + UI 渲染双向实证，覆盖 TC-01 实时与 TC-02 保留；再发纯文本消息产出 0 命令 run 验证**空态文案**（自测B），「该 Run 未执行终端命令」UI 层实证、旧文案无残留。单元测试 `agent-run-debug-board.test.ts` 34/34 通过，`pnpm typecheck` 通过。未覆盖：TC-05/08（可选）；P3 真实终端管线（claude-code Bash 桥接，未获批准，保持不做）。