# Tools

## Purpose

Defines AgentHub-managed tools, approval boundaries, and adapter-specific tool ownership. Detailed tool specs live in `specs/07-tools.md`.

## Requirements

### Requirement: Tool definitions SHALL be registered centrally

AgentHub-managed tools MUST be registered through `toolRegistry` with name, description, JSON schema, and handler.

#### Scenario: Custom agent enables a tool
- **WHEN** an agent's `toolNames` includes `fs_read`
- **THEN** CustomAgentAdapter resolves the tool definition from `toolRegistry`.

### Requirement: AgentHub-managed tool execution SHALL expose normalized structured results

AgentHub MUST provide a normalized execution result for AgentHub-managed tools that separates structured output from model-facing prompt text while preserving the legacy `ToolResult` handler contract.

#### Scenario: Tool succeeds with structured output
- **WHEN** a registered AgentHub-managed tool returns an object or array value
- **THEN** structured execution preserves that value as `output`
- **AND** provides deterministic JSON `promptText` for the model-facing tool response.

#### Scenario: Tool fails during structured execution
- **WHEN** a registered tool returns `{ ok: false, error }` or the handler throws
- **THEN** structured execution returns `output` as `{ error }`
- **AND** marks the execution as failed
- **AND** provides `promptText` prefixed with `Error: `
- **AND** includes an error diagnostic.

#### Scenario: Adapter persists a tool result
- **WHEN** an adapter emits `tool.result` for an AgentHub-managed tool
- **THEN** the event result contains the structured execution `output`
- **AND** the adapter sends `promptText` back to the model instead of serializing the persisted output itself.

### Requirement: External MCP stdio servers SHALL be explicit opt-in tool sources

AgentHub MUST treat external stdio MCP servers as separate tool sources from AgentHub-managed `toolRegistry` tools. External MCP servers MUST be globally configured, explicitly enabled, and explicitly selected by each Agent before they are passed to SDK adapters.

#### Scenario: Agent enables an external MCP server
- **WHEN** an Agent references an enabled MCP server id
- **AND** the Agent uses a Claude Code or Codex SDK adapter
- **THEN** AgentHub passes the stdio server config to the adapter alongside the internal `agenthub` MCP server
- **AND** the external server does not replace or override the internal `agenthub` server.

#### Scenario: External MCP server is not enabled for an Agent
- **WHEN** a server is disabled or is not referenced by the Agent
- **THEN** AgentHub MUST NOT pass that server to the adapter.

#### Scenario: Orchestrator plan stage runs
- **WHEN** AgentRunner builds an adapter input for an override prompt or override system prompt stage
- **THEN** external MCP servers are omitted from that run.

#### Scenario: External MCP server exposes host capabilities
- **WHEN** a user configures a stdio MCP server
- **THEN** AgentHub stores command and args separately instead of shell-concatenating them
- **AND** list APIs do not expose secret env values in plain text
- **AND** documentation states that external MCP servers run outside AgentHub's workspace-tool sandbox guarantees.

#### Scenario: Claude Code uses ask-trusted external MCP tools
- **WHEN** a Claude Code agent calls `mcp__<server>__<tool>` from an external MCP server whose trust is `ask`
- **THEN** AgentHub MUST create an MCP tool approval pending item before the tool executes
- **AND** approval is remembered for the same `conversationId + namespacedToolName`
- **AND** rejection denies that tool call without remembering approval.

#### Scenario: Codex receives external MCP servers
- **WHEN** AgentHub builds Codex MCP config
- **THEN** it MUST include only external MCP servers whose trust is `always`
- **AND** it MUST NOT silently upgrade `ask` servers to executable Codex MCP config until a verified pre-call permission hook exists.

### Requirement: External MCP and Skills SHALL be searchable and assignable to Agents

AgentHub MUST expose a unified remote-search catalog for Skills and external MCP servers. The catalog search endpoint MUST use `GET /api/search/tools` with `keyword`/`q`, `type='all'|'skill'|'mcp_server'`, `source='github'`, `page`, and `pageSize` query parameters. Search responses MUST contain safe remote metadata only: `id`, `name`, `description`, `type`, `kind`, `source`, `githubUrl`, `installUrl`, `manifestUrl`, `tags`, `status`, and compatibility metadata. Remote search MUST be clearly presented as GitHub/network search, not as local Agent search or local DB search.

#### Scenario: User searches remote Skills and MCP servers
- **WHEN** the user searches the tool catalog
- **THEN** AgentHub queries GitHub-backed remote sources and returns matching `skill` and `mcp_server` entries with source URLs, install/manifest URLs, status, and compatibility metadata
- **AND** it MUST NOT return raw MCP env values, resolved env placeholders, tool call arguments, tool outputs, secret file contents, or GitHub authentication tokens.

#### Scenario: User assigns a remote search result to an Agent
- **WHEN** the user selects a GitHub Skill or MCP result and chooses a target Agent
- **THEN** AgentHub imports the remote result into a local Skill or MCP DB row after server-side validation
- **AND** then updates `agents.skillIds` for Skills or `agents.mcpServerIds` for MCP servers
- **AND** the API enforces adapter compatibility instead of relying only on disabled UI controls.

#### Scenario: Remote MCP result is imported
- **WHEN** the selected result is `kind='mcp_server'`
- **THEN** AgentHub MUST fetch and validate a GitHub MCP manifest over HTTPS from an allowed GitHub host
- **AND** it MUST store command, args, env, and trust as a local stdio MCP server
- **AND** it MUST NOT execute or connection-test the MCP server during import.

#### Scenario: Remote Skill result is imported
- **WHEN** the selected result is `kind='skill'`
- **THEN** AgentHub MUST fetch a GitHub Skill manifest or Skill markdown over HTTPS from an allowed GitHub host
- **AND** it MUST store safe metadata as a local Skill row before binding it to the Agent
- **AND** Skills do not bypass existing tool protocols, approvals, or workspace security boundaries.

#### Scenario: Codex assignment filters ask-trusted MCP servers
- **WHEN** the selected target Agent uses the Codex adapter
- **AND** the selected MCP server has `trust='ask'`
- **THEN** AgentHub rejects the assignment or omits the server from Codex runtime config
- **AND** it MUST NOT silently upgrade the server to `trust='always'`.

#### Scenario: Custom or Mock assignment receives external MCP
- **WHEN** the selected target Agent uses Custom or Mock adapter
- **AND** the selected result is an external MCP server
- **THEN** AgentHub rejects the assignment because Custom/Mock external MCP execution is out of scope for P1.

#### Scenario: Agent receives enabled Skills
- **WHEN** an Agent has enabled `skillIds`
- **THEN** AgentRunner injects safe Skill metadata/instructions as a separate prompt section
- **AND** Skills do not bypass existing tool protocols, approvals, or workspace security boundaries.

### Requirement: AgentHub SHALL provide a secure public web fetch tool

AgentHub MUST provide an AgentHub-managed `web_fetch` tool for reading public HTTPS web pages. The tool MUST execute through `toolRegistry` / `executeStructured()` and MUST be the only supported managed network-read path exposed by Custom agents and internal AgentHub MCP bridges.

#### Scenario: Agent fetches a public HTTPS page
- **WHEN** an enabled agent calls `web_fetch` with a public `https://` URL
- **THEN** AgentHub fetches the page with GET only
- **AND** returns structured output containing `url`, `finalUrl`, `status`, `contentType`, `text`, `truncated`, and `bytesRead`
- **AND** returns extracted text bounded by the requested `maxChars` limit.

#### Scenario: Agent attempts SSRF or non-public access
- **WHEN** `web_fetch` receives a non-HTTPS URL, URL credentials, localhost, loopback/private/link-local IP, metadata endpoint, or a domain that resolves to restricted addresses
- **THEN** AgentHub rejects the request before returning response content.

#### Scenario: Redirect targets a restricted address
- **WHEN** a public URL redirects to another URL
- **THEN** AgentHub revalidates every redirect target
- **AND** rejects redirects to non-HTTPS or restricted hosts/addresses.

#### Scenario: SDK adapter needs web access
- **WHEN** Claude Code or Codex needs public web page text
- **THEN** AgentHub exposes `web_fetch` through the internal `agenthub` MCP server
- **AND** Codex native network/web search remains disabled
- **AND** Claude Code is instructed to use AgentHub `web_fetch` instead of native WebFetch/WebSearch.

### Requirement: Attachments SHALL be read through safe tool extraction

`read_attachment` MUST read user-uploaded attachments scoped to the current conversation. Text-like files and PDFs with extractable text SHALL return plain text with bounded length; unsupported binary formats SHALL return metadata instead of raw bytes.

#### Scenario: Agent reads a PDF attachment
- **WHEN** `read_attachment` receives an attachment whose MIME type, filename, or file header identifies it as a PDF
- **THEN** AgentHub extracts local PDF text before returning the tool result
- **AND** truncates the returned text at the same bounded length used for text files
- **AND** returns a clear note when the PDF has no extractable text and likely needs OCR.

### Requirement: File tools SHALL enforce workspace boundaries

`fs_read`, `fs_write`, and `bash` MUST resolve paths under the conversation effective cwd and reject access outside that tree.

#### Scenario: Agent attempts path traversal
- **WHEN** a tool receives `../../.ssh/id_rsa`
- **THEN** the path check rejects the operation.

### Requirement: Bash SHALL enforce platform blacklist

The bash tool MUST reject commands that match the platform-specific banned pattern list before execution.

#### Scenario: POSIX destructive command is requested
- **WHEN** the command matches `rm -rf /`
- **THEN** the tool refuses to run it.

#### Scenario: POSIX background process inherits stdio
- **WHEN** a bash command starts a background process and the shell script exits
- **THEN** the bash tool MUST NOT wait forever on inherited stdout or stderr
- **AND** it SHOULD clean up the command process group before returning.

### Requirement: Key bash commands SHALL require user approval

AgentHub MUST require explicit user approval before executing bash commands that are not banned but can materially change dependencies, discard files, or affect host-level runtime state. This approval gate MUST apply to AgentHub's `bash` tool and SDK command hooks where the adapter exposes a pre-execution permission callback.

#### Scenario: Agent installs dependencies
- **WHEN** an agent requests `pnpm install`
- **THEN** AgentHub records a pending bash command
- **AND** emits it through the conversation event stream
- **AND** executes the command only after user approval.

### Requirement: Review mode SHALL require write approval

In review mode, file write effects managed by AgentHub MUST create pending approvals instead of directly mutating workspace files.

#### Scenario: Agent proposes a file write
- **WHEN** `fs_write` is called in review mode
- **THEN** AgentHub records a pending write
- **AND** waits for explicit user approval.

### Requirement: SDK tool sets SHALL be documented separately

Claude Code and Codex SDK adapters MUST document their built-in tool ownership and any approval bridge limitations instead of pretending those tools are AgentHub `toolRegistry` tools.

#### Scenario: Codex agent runs in review mode
- **WHEN** a Codex agent is selected
- **THEN** Codex uses read-only sandbox mode
- **AND** AgentHub exposes only the allowlisted AgentHub MCP tools to Codex.

### Requirement: AgentHub SHALL inject tool-call guidance for available tools

AgentHub MUST append usage guidance and concrete examples for the AgentHub-managed tools available to the current run. Guidance MUST be scoped to the actual tool set, and MUST call out common argument-shape mistakes for tools whose schemas are often confused.

#### Scenario: Custom agent has file and artifact tools
- **WHEN** a custom agent run is built with `fs_read`, `fs_write`, `read_artifact`, and `write_artifact`
- **THEN** the injected system prompt includes examples for those tools
- **AND** it does not instruct the agent to call unavailable tools such as `plan_tasks`.

#### Scenario: Agent can write artifacts
- **WHEN** a run includes `write_artifact`
- **THEN** the injected guidance warns against empty `write_artifact({})` calls
- **AND** includes a complete document artifact template with `type`, `title`, and `content`.

#### Scenario: SDK adapter receives AgentHub MCP tools
- **WHEN** a Claude Code or Codex run is built
- **THEN** the injected guidance includes the allowlisted AgentHub MCP tools exposed by that adapter
- **AND** examples use the exact camelCase argument names accepted by the tool schemas.

#### Scenario: Local workspace code task has file tools
- **WHEN** a run is built for a local workspace
- **AND** the agent has AgentHub file tools or SDK local file tools
- **THEN** the injected guidance tells the agent to prefer direct workspace file/command tools for project source work
- **AND** tells the agent not to use `write_artifact` for source files that should be written to disk.

### Requirement: Agents SHALL be able to ask structured user questions

AgentHub MUST provide an `ask_user` tool for finite user choices. The tool SHALL accept 1-4 questions, each with 2-4 options, and SHALL suspend the run until the user answers or the run is aborted.

#### Scenario: Agent needs a blocking finite choice
- **WHEN** an available agent tool call submits `ask_user` with valid questions
- **THEN** AgentHub records a pending user question
- **AND** emits the pending question through the conversation event stream
- **AND** returns the selected answers to the agent after the user responds.

#### Scenario: Orchestrator plan has a key ambiguity
- **WHEN** the Orchestrator plan stage needs a blocking clarification expressible as 2-4 options
- **THEN** the plan stage may call `ask_user` before `plan_tasks`
- **AND** the aggregate stage does not expose `ask_user`.

### Requirement: Web app artifacts SHALL be deployable to preview URLs

AgentHub MUST provide a `deploy_artifact` tool that accepts a web app artifact id and returns a deployment status record with a preview path. The tool MUST create a local static deployment and SHOULD additionally publish it to a configured external static directory.

#### Scenario: Agent deploys a web app artifact
- **WHEN** `deploy_artifact` receives a valid `web_app` artifact id
- **THEN** it returns a ready deployment record
- **AND** the record points at the local deployment preview route when no external publish target is configured.

#### Scenario: Agent deploys with external static publishing configured
- **WHEN** `deployment_publish_enabled` is true
- **AND** `deployment_publish_dir` and `deployment_public_base_url` are set
- **THEN** the tool publishes public deployment files to the configured directory
- **AND** returns the public URL as the primary preview path
- **AND** includes a local preview fallback.

#### Scenario: Agent deploys a non-web artifact
- **WHEN** `deploy_artifact` receives a document, image, or missing artifact id
- **THEN** it returns a failed deployment record with a user-visible reason.

### Requirement: Workspace static directories SHALL be deployable to preview URLs

AgentHub MUST provide a `deploy_workspace` tool that accepts a static output directory inside the current workspace and returns a deployment status record. The tool MUST copy existing static files only; it MUST NOT run build commands. Workspace deployments MUST enforce workspace path isolation, reject missing or non-directory sources, require an HTML entry file, and exclude private or dependency directories such as `.agenthub`, `.git`, and `node_modules`.

#### Scenario: Agent deploys a built local project
- **WHEN** `deploy_workspace` receives `path="dist"` and `dist/index.html` exists inside the conversation workspace
- **THEN** it creates a ready deployment record
- **AND** the record has `sourceType="workspace"` and `workspacePath="dist"`.

#### Scenario: Slash deploy has no artifact candidates
- **WHEN** a user sends `/deploy`
- **AND** the conversation has no `web_app` artifact candidates
- **AND** a common static output directory such as `dist`, `build`, `out`, or `client/dist` exists with `index.html`
- **THEN** AgentHub deploys that workspace directory and inserts a `deploy_status` message part.

### Requirement: Child tasks SHALL report semantic task outcomes

AgentHub MUST provide a `report_task_result` tool for Orchestrator-dispatched child runs. The tool SHALL accept `status`, `summary`, optional `acceptanceResults`, and optional `blockers`, and SHALL not create artifacts or mutate workspace files.

#### Scenario: Child reports completion
- **WHEN** a child run calls `report_task_result` with `status="complete"`
- **THEN** AgentRunner can use that structured report as the semantic task outcome.

#### Scenario: Child reports blocked work
- **WHEN** a child run calls `report_task_result` with `status="blocked"`
- **THEN** the dispatch task is treated as not complete
- **AND** blocker details remain available to aggregation.
