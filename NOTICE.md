# NOTICE — 许可与出处声明 / License & Attribution Notice

**Multi-Agent TeamFlow** 是开源项目 **bitdance-agenthub** 的衍生作品（修改版本）。

**Multi-Agent TeamFlow** is a modified version (derivative work) of the open-source project
**bitdance-agenthub**.

> **Statement of modification (AGPL-3.0 §5(a))**
> This project is a **modified version** of `lizyoko9/bitdance-agenthub`. It has been modified
> since **2026-06-27**, with the most recent modification on **2026-10-13**.

---

## 1. 上游作品 / Upstream work

| 项 | 内容 |
| --- | --- |
| 项目名 | `bitdance-agenthub` |
| 仓库地址 | <https://github.com/lizyoko9/bitdance-agenthub> |
| 主要作者 | @lizyoko9、@shmilycaikui 及上游贡献者 |
| 创建时间 | 2026-05-22 |
| 许可 | GNU Affero General Public License v3.0（SPDX：`AGPL-3.0`） |
| 默认分支 | `main` |

本项目的源码基线取自上述仓库。本地版本历史的起点为 **2026-06-27**（首个提交一次性引入上游基线，共 503 个文件）。

## 2. 修改声明 / Statement of modification

依据 AGPL-3.0 第 5(a) 条，在此**显著声明**：

- **本项目是修改后的版本（modified version），并非上游原版，也未获得上游项目的赞助或背书。**
- **修改起始**：2026-06-27
- **最近修改**：2026-10-13
- **完整修改记录**：<https://gitee.com/Composure666/Multi-Agent-TeamFlow/commits>（git 历史，共 124 次提交，截至 2026-10-13）

### 2.1 改动规模

| 指标 | 数值 |
| --- | --- |
| 相对基线新增文件 | 307 |
| 相对基线修改文件 | 181 |
| 相对基线删除文件 | 5 |
| 当前纳入版本管理的文件总数 | 805 |

统计口径：`git diff --name-status --no-renames <首个提交>..HEAD`（首个提交 = `530acbb`，2026-06-27），可自行复核。数字随提交自然变动，上表为 **2026-10-13** 的取数结果。

### 2.2 主要改动（不限于）

1. **品牌与命名体系**：对外品牌统一为 *Multi-Agent TeamFlow*，新增品牌单一真源 `src/lib/brand.ts` 并贯穿 UI、文档与部署配置。内部标识（`agenthub`、`AGENTHUB_*`、`mcp__agenthub__*`、`.agenthub-data/`）出于兼容性保持不变。
2. **功能与代码增量**：`src/` 下新增 230 个文件（`server` 72、`components` 66、`app` 63、`lib` 14、`db` 9、`shared` 3、`stores` 2、`types` 1），覆盖任务编排、验收门禁、上下文压缩、模型分配与降级链、技能/经验体系等。
3. **部署工具链**：新增 `deploy/` 全套（11 个文件）——打包上传、服务器初始化、systemd 服务单元、nginx 配置、健康检查与验收脚本、运维 RUNBOOK。
4. **桌面端**：新增与修补 Electron 侧代码及图标资源（`electron/` 13 个文件，含 `companion-proxy.ts`、`preload.ts`），并修正打包配置。
5. **规格与文档**：新增 `specs/` 6 篇、`openspec/` 9 篇、`docs/` 8 篇，以及 `CHANGELOG.md`、`INSTALL.md`、`VERSION`。
6. **技能与站点资源**：新增 `skills/` 4 个技能定义、`public/` 17 项站点资源、`scripts/` 4 个构建辅助脚本。
7. **删除**：移除了基线中的 5 个文件 —— `docs/AI-COLLABORATION.md`、`docs/images/agenthub-preview.png`、`docs/superpowers/plans/2026-06-05-message-search.md`、`src/app/favicon.ico`、`src/components/usage-dashboard.tsx`。
8. **仓库卫生与元数据**：清除了开发期误纳入版本管理的运行时日志 `debug.log` 与无任何引用的临时图标 `icon_new.png`（二者均非基线文件，故不计入上表「删除」一列）；新增 `.gitattributes` 统一跨平台行尾；`package.json` 补齐 `engines`（`node >= 20.9.0`）/ `packageManager`（`pnpm@11.9.0`）/ `homepage` / `bugs`，并将 `version` 与 `VERSION` 文件对齐为 `0.2.0-rc.1`。

## 3. 许可 / License

本项目整体以 **GNU Affero General Public License v3.0**（`AGPL-3.0-only`）发布，许可证全文见仓库根目录 [`LICENSE`](./LICENSE)（原样保留自上游，未作任何修改）。

这不是自行选择的结果：AGPL-3.0 第 5 条要求衍生作品**整体**继续以 AGPL-3.0 授权，因此本项目不得以更宽松的条款或闭源条款再授权。第三方依赖各自适用的许可不受本声明影响。

## 4. 网络服务源码提供 / Source offer (AGPL-3.0 §13)

本项目可通过计算机网络对外提供服务（自托管 Web 服务，以及桌面端内嵌的本地服务）。依 AGPL-3.0 第 13 条，**任何通过网络与本软件交互的用户，都有权获得与其所运行版本对应的完整源码（Corresponding Source）**。

**源码位置（公开可访问）：<https://gitee.com/Composure666/Multi-Agent-TeamFlow>**

上述地址为**公开仓库**，任何人无需账号即可匿名 `git clone`（含完整 git 历史），因此第 13 条义务已满足。若你通过网络使用本软件却无法访问该地址，请通过上述仓库的 Issue 索取源码。

## 5. 本衍生作品的版权 / Copyright of this derivative work

```text
Copyright (C) 2026 Multi-Agent TeamFlow
https://gitee.com/Composure666/Multi-Agent-TeamFlow
```

上游部分的版权归其各自作者所有。本声明仅主张本项目**新增与修改部分**的权利，不改变上游部分的版权归属。

## 6. 名称与归属声明 / Names and affiliation

- `bitdance-agenthub` 及其相关名称、徽标归其原作者所有。
- 本衍生作品使用自有品牌 *Multi-Agent TeamFlow*，与上游项目相互独立，不代表上游项目。
- 已从本项目移除的上游资产（见 §2.2 第 7 条）不再随本项目分发。

---

*本文件是 AGPL-3.0 第 5(a) 条所要求的修改声明；配套的许可证全文见 [`LICENSE`](./LICENSE)。如本文件与 `LICENSE` 存在冲突，以 `LICENSE` 为准。*
