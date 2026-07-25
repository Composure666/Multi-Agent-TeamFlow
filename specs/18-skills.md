# Spec 18 — Skills 管理与 Agent 绑定

> Skills 是本地可发现的能力说明/任务模板，用于补充 Agent 行为指导。它不是 MCP server，不是 `toolRegistry` 工具，也不是可执行插件。

源文件（计划）：`src/server/skill-service.ts`、`src/app/api/skills/**`、`src/app/api/search/tools/route.ts`、`src/app/api/agents/[id]/tools/route.ts`、`src/components/skills-settings.tsx`、`src/components/agent-tool-search-dialog.tsx`

---

## 1. 目标 / 非目标

**目标**

- 扫描本地/项目 Skills metadata。
- 在设置页管理 Skills：列表、刷新、启用/禁用。
- 支持 Skills 与 MCP 的 GitHub 联网搜索。
- 从远程搜索结果导入 Skill 后，可配置给指定 Agent。
- Agent 运行时把绑定的 enabled Skills 作为独立 prompt section 注入。

**非目标**

- 不执行 Skill 文件。
- 不读取 `.env.local` 或密钥文件。
- 不把 Skill 当作 AgentHub-managed tool 或 MCP server。
- 不绕过现有工具审批、workspace 沙箱或 adapter 安全边界。

---

## 2. 数据模型

详见 Spec 08：

- `skills`：本地或远程导入的 Skill metadata。
- `agents.skill_ids`：Agent 显式启用的 Skill id 列表。

`skills.source_path` 对本地 Skill 保存本地路径；对 GitHub 导入的远程 Skill 保存 `github://...` 来源标识或 GitHub URL。服务层扫描本地文件时仍必须校验范围，避免索引敏感目录。

---

## 3. Skills 发现与管理

Skill metadata 至少包含：

```ts
{
  id: string
  name: string
  description: string
  content: string | null
  sourcePath: string
  tags: string[]
  enabled: boolean
  updatedAt: number
}
```

发现规则：

1. P1 优先扫描项目 `skills/` 目录。
2. 读取 markdown front matter 或标题/首段作为 metadata；markdown body 作为 `content`，用于运行时 `<rules>` 注入。
3. 工作区内由 Agent 下载的 Skill 文件也可在运行时递归发现：匹配任意 `SKILL.md`，以及 `skills/` 目录下的 markdown 文件；发现结果按相对路径生成稳定 id，避免多个嵌套 `SKILL.md` 冲突。
4. 不读取 `.env.local`、密钥文件、隐藏凭据目录或 workspace 外敏感目录。
5. 刷新索引只更新 metadata/content，不执行 Skill 内容。

---

## 4. 统一联网搜索

`GET /api/search/tools` 使用 GitHub 联网搜索远程 Skills 与 MCP server。P1 不支持 POST 搜索；如后续需要复杂筛选或长 request body，再新增 POST。

Query 参数：

```ts
interface SearchToolsQuery {
  q?: string
  keyword?: string
  type?: 'all' | 'skill' | 'mcp_server'
  source?: 'github'
  page?: number
  pageSize?: number
}
```

返回：

```ts
interface ToolSearchResult {
  id: string
  name: string
  description: string
  type: 'skill' | 'mcp_server'
  kind: 'skill' | 'mcp_server'
  source: 'github'
  githubUrl: string | null
  installUrl: string | null
  manifestUrl: string | null
  tags: string[]
  status: 'remote'
  compatibility: Record<AdapterName, 'supported' | 'unsupported'>
}
```

响应示例：

```json
{
  "results": [
    {
      "id": "github:skill:owner/repo:skills/triage/SKILL.md",
      "name": "Issue triage",
      "description": "Helps analyze and triage GitHub issues.",
      "type": "skill",
      "kind": "skill",
      "source": "github",
      "githubUrl": "https://github.com/owner/repo/blob/main/skills/triage/SKILL.md",
      "installUrl": "https://raw.githubusercontent.com/owner/repo/main/skills/triage/SKILL.md",
      "manifestUrl": "https://raw.githubusercontent.com/owner/repo/main/skills/triage/agenthub.skill.json",
      "tags": ["github", "skill"],
      "status": "remote",
      "compatibility": {
        "claude-code": "supported",
        "codex": "supported",
        "custom": "supported",
        "mock": "supported"
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": null,
  "nextPage": null,
  "sourceStatus": { "github": "ok" }
}
```

约束：

- 搜索接口只返回远程候选 metadata；不是本地 Skill/MCP 管理搜索，也不是 Agent 搜索。
- GitHub API token 可选，服务端读取 `GITHUB_TOKEN` 或 `GH_TOKEN`；token 不返回前端、不写 DB。
- GitHub URL 必须是 HTTPS，且 host 只能是 `github.com`、`raw.githubusercontent.com` 或 `api.github.com`。
- 搜索响应不得返回 MCP raw env、resolved env、工具调用参数、工具输出、GitHub token 或 Skill 文件敏感内容。
- Custom/Mock 对外部 MCP 标记 unsupported；Codex 对 `trust='ask'` MCP 标记 unsupported。

---

## 5. 配置到 Agent

`POST /api/agents/:id/tools` 支持添加或移除本地工具，也支持从 GitHub 远程结果导入后添加：

- Skill → `agents.skill_ids`
- MCP server → `agents.mcp_server_ids`

本地配置 body 使用本地 DB id：

```ts
{
  action: 'attach' | 'detach'
  kind?: 'skill' | 'mcp_server'
  type?: 'skill' | 'mcp_server'
  source?: 'local'
  id: string
}
```

GitHub 配置 body 使用远程候选字段：

```ts
{
  action: 'attach'
  kind?: 'skill' | 'mcp_server'
  type?: 'skill' | 'mcp_server'
  source: 'github'
  id?: string
  installUrl?: string | null
  manifestUrl?: string | null
  githubUrl?: string | null
}
```

字段映射：

- `id`：远程候选 id，用于生成稳定本地 Skill id；不是直接写入 Agent 的最终 id。
- `installUrl`：Skill markdown raw URL；MCP 只作为展示/安装说明 URL。
- `manifestUrl`：Skill manifest 可选；MCP manifest 必需。
- `githubUrl`：用户查看来源的 GitHub 页面 URL。

服务端必须校验：

- Agent 存在。
- `type`/`kind` 存在且合法。
- GitHub 导入只允许 `action='attach'`，且必须提供 `installUrl`、`manifestUrl`、`githubUrl` 或远程候选 `id` 中可解析出的 GitHub 仓库信息。
- GitHub URL 只允许 HTTPS GitHub hosts。
- 远程 Skill/MCP 先导入或更新为本地 DB row，再把本地 id 写入 Agent。
- 目标 Skill/MCP 存在且 enabled。
- MCP adapter 兼容：Claude Code 支持 `ask`/`always`；Codex 只支持 `always`；Custom/Mock 不支持外部 MCP。
- 写入 idempotent；重复添加不产生重复 id。

---

## 6. Runtime 注入

AgentRunner 构建 AdapterInput 时：

1. 读取 Agent 绑定的 `skillIds`。
2. 过滤 disabled/missing Skill。
3. 递归发现当前 workspace 内的 Skill markdown，并与 DB Skill 合并。
4. 对 GitHub 仓库型 Skill，如果 DB 行只有浅层 metadata，则用同名 workspace Skill 或已发现的子 Skill 聚合内容补齐 description/content。
5. 构造独立 system prompt section，例如 `<skills>`，每个 Skill 必须包含闭合的 `<skill>` 元素；有 `content` 时注入 `<rules>`。
6. 只注入 Skill 的名称、描述、tags 与必要指导内容。
7. Agent Run Debug snapshot 只记录 Skill 安全元数据，不记录 secret。

Skills 注入是提示上下文，不代表执行权限。Agent 如需读写文件、运行命令或调用 MCP，仍必须通过现有工具与审批链路。

---

## 7. UI

- Settings 增加 “Skills” tab：列表、刷新索引、启用/禁用。
- Agent 创建/编辑增加 Skills 多选，adapter 切换时 Skills 保留。
- Agent 工具搜索弹窗是独立的远程 Skills/MCP 搜索入口，不是 Agent 搜索入口，也不搜索本地 catalog。
- 弹窗调用 `GET /api/search/tools?keyword=...&type=...&source=github&page=1&pageSize=20`，展示 GitHub 来源、GitHub URL、安装地址、manifest 地址、tags 与兼容性。
- 用户选择目标 Agent 后点击“导入并配置给目标 Agent”；前端把远程候选的 `id`、`type`/`kind`、`source`、`installUrl`、`manifestUrl`、`githubUrl` 提交给 Agent tools API。
- UI 必须显示兼容性提示和远程 MCP manifest/command 风险提示，但最终约束以服务端为准。
