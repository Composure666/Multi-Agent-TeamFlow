'use client'

import {
  BarChart3,
  Bot,
  Boxes,
  FileText,
  Grid2X2,
  Layers,
  Menu,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Workflow,
  X,
  LayoutDashboard
} from 'lucide-react'
import { nanoid } from 'nanoid'
import { useEffect, useMemo, useRef, useState } from 'react'

import { AgentAvatar } from '@/components/agent-avatar'
import { ArtifactPreviewPanel } from '@/components/artifact-preview-panel'
import { ChatPanel } from '@/components/chat-panel'
import { CreateAgentDialog } from '@/components/create-agent-dialog'
import { FileExplorerPanel } from '@/components/file-explorer-panel'
import { MessageHighlightLayer } from '@/components/message-highlight-layer'
import { SelectionPopover } from '@/components/selection-popover'
import { SettingsDialog } from '@/components/settings-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import type { AgentRow } from '@/db/schema'
import {
  createConversation,
  createAgent,
  fetchAgents,
  fetchArtifact,
  fetchArtifacts,
  fetchConversations,
  sendMessage,
  setFsWriteApprovalMode,
  uploadAttachment,
  type ArtifactListItem,
} from '@/lib/api'
import { groupArtifactVersions } from '@/lib/artifact-groups'
import { cn } from '@/lib/utils'
import { useAgentList, useAppStore, useConversationList } from '@/stores/app-store'

type WorkbenchView = 'new-task' | 'conversations' | 'agents' | 'artifacts' | 'automation' | 'analytics' | 'settings'

const navItems: Array<{ id: WorkbenchView; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'new-task', label: '新建任务', icon: Plus },
  { id: 'conversations', label: '对话', icon: MessageSquare },
  { id: 'agents', label: 'Agent 库', icon: Bot },
  { id: 'artifacts', label: '产物库', icon: Layers },
  { id: 'automation', label: '自动化', icon: Workflow },
  { id: 'analytics', label: '分析', icon: BarChart3 },
  { id: 'settings', label: '设置', icon: Settings },
]

const agentTabs = ['推荐', '我的 Agent', '内置', '自定义', '编排', '代码', '设计', '文档', '审查']
const artifactTabs = ['全部', '文档', 'Web 原型', 'PPT', '图片', '项目', '代码']
const scenarioTabs = ['日常协作', '代码开发', '设计产物']
const quickTasks = ['文档处理', '代码开发', '设计原型', '项目交付']

const RESOURCE_AGENT_PRESETS = [
  {
    id: 'workbuddy-explore',
    name: 'Explore',
    avatar: '🧭',
    description: '来自 WorkBuddy 资源库的代码库探索 Agent，适合快速定位文件、搜索关键字、理解模块结构。',
    capabilities: ['代码探索', '搜索', '结构分析'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_list', 'fs_read', 'read_attachment'],
    systemPrompt: '你是代码库探索 Agent。优先用只读方式理解项目结构、定位文件、总结模块职责，不主动修改文件。输出要包含关键文件路径和简洁结论。',
  },
  {
    id: 'workbuddy-plan',
    name: 'Plan',
    avatar: '🗺️',
    description: '来自 WorkBuddy 资源库的规划 Agent，适合把复杂需求拆成可执行步骤和验收清单。',
    capabilities: ['任务拆解', '方案设计', '验收标准'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_list', 'fs_read', 'read_attachment', 'ask_user'],
    systemPrompt: '你是实施规划 Agent。先理解目标和现有约束，再输出清晰的步骤、风险和验收标准。不要直接写代码，除非用户明确要求。',
  },
  {
    id: 'workbuddy-code-reviewer',
    name: 'Code Reviewer',
    avatar: '🛡️',
    description: '来自 WorkBuddy sub-agent 示例的代码审查 Agent，关注质量、安全、可维护性和回归风险。',
    capabilities: ['代码审查', '安全检查', '质量评估'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_list', 'fs_read', 'bash', 'read_attachment'],
    systemPrompt: '你是资深代码审查 Agent。审查代码质量、安全性、可维护性和测试覆盖。按严重程度列出问题、影响和建议；没有阻塞问题时明确说明。',
  },
  {
    id: 'workbuddy-debugger',
    name: 'Debugger',
    avatar: '🧩',
    description: '来自 WorkBuddy sub-agent 示例的调试 Agent，适合分析报错、测试失败和运行时异常。',
    capabilities: ['调试', '根因分析', '测试失败定位'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_list', 'fs_read', 'bash', 'read_attachment'],
    systemPrompt: '你是调试 Agent。围绕错误现象定位根因，优先读取相关日志、测试输出和代码路径。输出根因、证据和最小修复建议。',
  },
  {
    id: 'workbuddy-enhance-prompt',
    name: 'Prompt Enhancer',
    avatar: '✨',
    description: '来自 WorkBuddy 资源库的提示词增强 Agent，适合把模糊需求整理成结构化任务描述。',
    capabilities: ['提示词优化', '需求澄清', '结构化表达'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['ask_user'],
    systemPrompt: '你是提示词增强 Agent。把用户的粗略想法改写为清晰、可执行、带约束和验收标准的任务描述。必要时先提出少量澄清问题。',
  },
]

export function AppWorkbench() {
  const [view, setView] = useState<WorkbenchView>('new-task')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const setConversations = useAppStore((s) => s.setConversations)
  const setAgents = useAppStore((s) => s.setAgents)

  useEffect(() => {
    fetchConversations().then(setConversations).catch(console.error)
    fetchAgents().then(setAgents).catch(console.error)
  }, [setAgents, setConversations])

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f7fb] text-slate-950">
      <WorkbenchNav view={view} onViewChange={setView} />
      <main className="min-w-0 flex-1 overflow-hidden">
        {view === 'new-task' && <NewTaskView onOpenConversations={() => setView('conversations')} />}
        {view === 'conversations' && <ConversationWorkspace />}
        {view === 'agents' && <AgentWorkspace onOpenConversations={() => setView('conversations')} />}
        {view === 'artifacts' && <ArtifactWorkspace onOpenConversations={() => setView('conversations')} />}
        {view === 'automation' && <PlaceholderWorkspace title="自动化" description="编排、定时触发和规则执行能力入口已预留。" />}
        {view === 'analytics' && <PlaceholderWorkspace title="分析" description="使用量、Agent 表现和交付效率分析入口已预留。" />}
        {view === 'settings' && <SettingsWorkspace onOpenSettings={() => setSettingsOpen(true)} />}
      </main>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <SelectionPopover />
      <MessageHighlightLayer />
    </div>
  )
}

function WorkbenchNav({ view, onViewChange }: { view: WorkbenchView; onViewChange: (view: WorkbenchView) => void }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={cn('flex shrink-0 flex-col border-r border-slate-200 bg-white/95 px-3 py-4 shadow-sm transition-[width] duration-200', collapsed ? 'w-[76px]' : 'w-[248px]')}>
      <div className="mb-5 flex items-center justify-between gap-2 px-2">
        <button
          type="button"
          onClick={() => onViewChange('new-task')}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#3370ff] text-white shadow-sm shadow-blue-200">
            <Sparkles className="size-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight">AgentHub</div>
              <div className="truncate text-[11px] text-slate-500">Multi-Agent Workspace</div>
            </div>
          )}
        </button>
        {!collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            title="收起侧边栏"
          >
            <Menu className="size-4" />
          </button>
        )}
        {collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            title="展开侧边栏"
          >
            <Menu className="size-4" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onViewChange('new-task')}
        className={cn(
          'mb-4 flex h-11 items-center justify-center gap-2 rounded-xl bg-[#3370ff] px-3 text-sm font-medium text-white shadow-sm shadow-blue-100 transition hover:bg-[#2563eb]',
          collapsed && 'px-0',
        )}
      >
        <Plus className="size-4" />
        {!collapsed && <span className="min-w-0 flex-1 text-left">新建任务</span>}
        {!collapsed && <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px]">Ctrl + N</span>}
      </button>

      <nav className="space-y-1">
        {navItems.filter((item) => item.id !== 'new-task').map((item) => {
          const Icon = item.icon
          const active = view === item.id || (item.id === 'conversations' && view === 'new-task')
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm transition',
                collapsed && 'justify-center px-0',
                active
                  ? 'bg-slate-950 text-white shadow-sm shadow-slate-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && item.label}
            </button>
          )
        })}
      </nav>

      <div className={cn('mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-3', collapsed && 'px-2')}>
        <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">A</div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="truncate text-xs font-medium">Agenter</div>
                <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700">Pro</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                本地模式
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

function NewTaskView({ onOpenConversations }: { onOpenConversations: () => void }) {
  const agents = useAgentList()
  const defaultAgent = agents[0]
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [approvalMode, setApprovalMode] = useState<'auto' | 'review'>('review')
  const [uploading, setUploading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [scenarioTab, setScenarioTab] = useState(scenarioTabs[0])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const upsertConversation = useAppStore((s) => s.upsertConversation)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const addLocalUserMessage = useAppStore((s) => s.addLocalUserMessage)
  const replaceLocalMessageId = useAppStore((s) => s.replaceLocalMessageId)
  const upsertMessage = useAppStore((s) => s.upsertMessage)

  const activeAgentId = selectedAgentId || defaultAgent?.id || ''
  const activeAgent = agents.find((agent) => agent.id === activeAgentId)

  const uploadFiles = async (conversationId: string) => {
    if (pendingFiles.length === 0) return []
    setUploading(true)
    try {
      return await Promise.all(pendingFiles.map((file) => uploadAttachment(conversationId, file)))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const submit = async () => {
    const text = content.trim()
    if (!text || !activeAgentId || sending) return
    setSending(true)
    try {
      const conv = await createConversation({
        title: text.length > 24 ? `${text.slice(0, 24)}…` : text,
        mode: 'single',
        agentIds: [activeAgentId],
      })
      upsertConversation(conv)
      if (approvalMode !== conv.fsWriteApprovalMode) {
        const updated = await setFsWriteApprovalMode(conv.id, approvalMode)
        upsertConversation(updated)
      }
      const uploadedAttachments = await uploadFiles(conv.id)
      setActiveConversation(conv.id)
      onOpenConversations()

      const tempId = `temp_${nanoid()}`
      addLocalUserMessage({
        tempId,
        conversationId: conv.id,
        content: text,
        mentionedAgentIds: [activeAgentId],
        attachments: uploadedAttachments,
      })
      setContent('')
      setPendingFiles([])
      const result = await sendMessage(conv.id, {
        content: text,
        mentionedAgentIds: [activeAgentId],
        attachmentIds: uploadedAttachments.map((attachment) => attachment.id),
      })
      replaceLocalMessageId(tempId, result.messageId)
      for (const message of result.messages ?? []) upsertMessage(message)
    } catch (err) {
      console.error('[AppWorkbench] create task failed', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      {/* 顶部激励栏 */}
      <div className="flex shrink-0 items-center justify-end border-b border-slate-100 px-6 py-2">
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-[#3370ff] transition hover:bg-blue-100">
          <Sparkles className="size-3" />
          来成长计划赚积分
        </button>
      </div>

      {/* 主内容区 - 垂直流式布局 */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
          {/* Hero Section */}
          <div className="mb-8">
            <h1 className="text-[32px] font-bold tracking-tight text-slate-950">
              AgentHub - 你的多 Agent 协作工作台
            </h1>

            {/* 一级场景切换 Tabs */}
            <div className="mt-5 flex items-center gap-2">
              {scenarioTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setScenarioTab(tab)}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition',
                    scenarioTab === tab
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* 二级快捷入口 Chips */}
            <div className="mt-4 flex flex-wrap gap-2">
              {quickTasks.map((task) => (
                <button
                  key={task}
                  type="button"
                  onClick={() => setContent(task)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <span className="flex size-6 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <Sparkles className="size-3.5" />
                  </span>
                  {task}
                </button>
              ))}
            </div>
          </div>

          {/* 核心交互输入框 */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
              placeholder="今天想让 AgentHub 帮你完成什么？"
              className="min-h-[140px] resize-none border-0 bg-transparent px-5 pt-5 text-base shadow-none placeholder:text-slate-400 focus-visible:ring-0"
            />

            {/* 附件列表 */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-5 pb-3">
                {pendingFiles.map((file) => (
                  <span key={`${file.name}-${file.lastModified}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                    <Paperclip className="size-3" />
                    {file.name}
                    <button
                      type="button"
                      onClick={() => setPendingFiles((list) => list.filter((item) => item !== file))}
                      className="text-slate-400 transition hover:text-slate-700"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 工具栏 */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
              <select
                value={activeAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setApprovalMode((mode) => (mode === 'review' ? 'auto' : 'review'))}
                className={cn(
                  'h-8 rounded-lg border-slate-200 text-xs transition-all',
                  approvalMode === 'auto' && 'border-blue-200 bg-blue-50 text-[#3370ff]',
                )}
              >
                {approvalMode === 'auto' ? '自动' : 'Review'}
              </Button>

              <Button variant="outline" size="sm" className="h-8 rounded-lg border-slate-200 text-xs">
                技能
              </Button>

              <Button variant="outline" size="sm" className="h-8 rounded-lg border-slate-200 text-xs">
                连应用
              </Button>

              <Button variant="outline" size="sm" className="h-8 rounded-lg border-slate-200 text-xs">
                默认权限
              </Button>

              {/* 右侧操作区 */}
              <div className="ml-auto flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="附件上传"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <Paperclip className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="语音输入"
                  className="rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <Mic className="size-4" />
                </Button>
                <Button
                  onClick={() => void submit()}
                  disabled={!content.trim() || !activeAgentId || sending}
                  className="ml-1 h-9 rounded-xl bg-[#3370ff] px-5 text-sm text-white shadow-sm shadow-blue-100 transition hover:bg-[#2563eb]"
                >
                  <Send className="mr-1.5 size-4" />
                  {sending || uploading ? '发送中' : '发送'}
                </Button>
              </div>
            </div>
          </section>

          {/* 底部状态栏 */}
          <div className="mt-3 flex flex-wrap items-center gap-3 px-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              本地沙箱 · 运行中
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
              {approvalMode === 'review' ? 'Review 保护 enabled' : 'Auto 模式 · 直接生效'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
              选择工作空间
            </span>
            {activeAgent && (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[#3370ff]">
                <AgentAvatar agent={activeAgent} size="xs" />
                {activeAgent.name}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ConversationWorkspace() {
  return (
    <div className="flex h-full min-w-0 gap-4 p-4">
      <ConversationListPanel />
      <section className="flex min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <ChatPanel />
        <FileExplorerPanel />
        <ArtifactPreviewPanel />
      </section>
    </div>
  )
}

function ConversationListPanel() {
  const conversations = useConversationList().filter((c) => !c.archived)
  const activeId = useAppStore((s) => s.activeConversationId)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const agents = useAppStore((s) => s.agents)
  const [query, setQuery] = useState('')

  const filtered = conversations.filter((conversation) => conversation.title.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <aside className="hidden w-[292px] shrink-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60 lg:flex">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">对话</h2>
            <p className="mt-1 text-xs text-slate-500">保留原有会话历史和消息流</p>
          </div>
          <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-[#3370ff]">
            <MessageSquare className="size-4" />
          </div>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索对话" className="h-9 rounded-lg border-slate-200 pl-9 text-xs" />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {filtered.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => setActiveConversation(conversation.id)}
              className={cn(
                'w-full rounded-xl border px-3 py-3 text-left transition',
                activeId === conversation.id
                  ? 'border-blue-200 bg-blue-50/80 shadow-sm'
                  : 'border-transparent hover:border-slate-200 hover:bg-slate-50',
              )}
            >
              <div className="truncate text-sm font-medium text-slate-900">{conversation.title}</div>
              <div className="mt-1 truncate text-[11px] text-slate-500">
                {conversation.mode === 'single' ? '单聊' : '群聊'} · {conversation.agentIds.map((id) => agents[id]?.name).filter(Boolean).join(' / ') || '未配置 Agent'}
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div className="px-3 py-8 text-center text-xs text-slate-500">暂无匹配会话</div>}
        </div>
      </ScrollArea>
    </aside>
  )
}

function AgentWorkspace({ onOpenConversations }: { onOpenConversations: () => void }) {
  const agents = useAgentList()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('推荐')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [installingPresetId, setInstallingPresetId] = useState<string | null>(null)
  const upsertConversation = useAppStore((s) => s.upsertConversation)
  const upsertAgent = useAppStore((s) => s.upsertAgent)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)

  const filteredAgents = useMemo(() => {
    const q = query.trim().toLowerCase()
    return agents.filter((agent) => {
      const matchesQuery = !q || `${agent.name} ${agent.description} ${agent.modelId ?? ''}`.toLowerCase().includes(q)
      const matchesTab =
        tab === '推荐' ||
        (tab === '我的 Agent' && !agent.isBuiltin) ||
        (tab === '内置' && agent.isBuiltin) ||
        (tab === '自定义' && !agent.isBuiltin) ||
        (tab === '编排' && agent.isOrchestrator) ||
        `${agent.name} ${agent.description}`.includes(tab)
      return matchesQuery && matchesTab
    })
  }, [agents, query, tab])

  const selectedAgent = selectedAgentId ? agents.find((agent) => agent.id === selectedAgentId) : filteredAgents[0]

  const installPreset = async (preset: (typeof RESOURCE_AGENT_PRESETS)[number]) => {
    if (installingPresetId) return
    setInstallingPresetId(preset.id)
    try {
      const agent = await createAgent({
        name: preset.name,
        avatar: preset.avatar,
        description: preset.description,
        capabilities: preset.capabilities,
        systemPrompt: preset.systemPrompt,
        adapterName: 'custom',
        modelProvider: 'deepseek',
        modelId: preset.modelId,
        toolNames: preset.toolNames,
        supportsVision: false,
      })
      upsertAgent(agent)
      setSelectedAgentId(agent.id)
    } catch (err) {
      console.error('[AgentWorkspace] install resource preset failed', err)
    } finally {
      setInstallingPresetId(null)
    }
  }

  const startConversation = async (agent: AgentRow) => {
    try {
      const conv = await createConversation({ mode: 'single', agentIds: [agent.id] })
      upsertConversation(conv)
      setActiveConversation(conv.id)
      onOpenConversations()
    } catch (err) {
      console.error('[AgentWorkspace] start conversation failed', err)
    }
  }

  return (
    <div className="flex h-full min-w-0 gap-4 p-6">
      <section className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <div className="border-b border-slate-100 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Agent 库</h1>
              <p className="mt-1 text-sm text-slate-500">发现、配置和复用你的协作 Agent</p>
            </div>
            <Button onClick={() => setFormOpen(true)} className="rounded-lg bg-[#3370ff] hover:bg-[#2563eb]">
              <Plus className="mr-2 size-4" />
              创建 Agent
            </Button>
          </div>
          <div className="relative mt-5">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索 Agent、模型或能力" className="h-10 rounded-xl border-slate-200 pl-10" />
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {agentTabs.map((item) => (
              <button key={item} type="button" onClick={() => setTab(item)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs transition', tab === item ? 'border-blue-200 bg-blue-50 text-[#3370ff]' : 'border-slate-200 text-slate-500 hover:text-slate-900')}>
                {item}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-3">
            <ScenarioCard title="代码协作" description="探索、规划、实现、审查形成闭环" />
            <ScenarioCard title="文档交付" description="PRD、风格指南、审查报告集中沉淀" />
            <ScenarioCard title="内置资源" description="可从 WorkBuddy 资源库安装更多 Agent 预设" />
          </div>
        </div>

        <ScrollArea className="h-[calc(100%-286px)]">
          <div className="space-y-5 p-5">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">系统内置资源库</h2>
                  <p className="mt-1 text-xs text-slate-500">已从 D:\\Download\\WorkBuddy\\resources 识别可复用 Agent 预设</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-[#3370ff]">{RESOURCE_AGENT_PRESETS.length} 个预设</span>
              </div>
              <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                {RESOURCE_AGENT_PRESETS.map((preset) => {
                  const installed = agents.some((agent) => agent.name === preset.name)
                  return (
                    <ResourcePresetCard
                      key={preset.id}
                      preset={preset}
                      installed={installed}
                      installing={installingPresetId === preset.id}
                      onInstall={() => void installPreset(preset)}
                    />
                  )
                })}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Agent 卡片</h2>
                  <p className="mt-1 text-xs text-slate-500">来自当前 AgentHub 数据库，可直接开始对话</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{filteredAgents.length} 个</span>
              </div>
              <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {filteredAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} selected={selectedAgent?.id === agent.id} onSelect={() => setSelectedAgentId(agent.id)} onStart={() => void startConversation(agent)} />
                ))}
              </div>
            </section>
          </div>
        </ScrollArea>
      </section>

      <AgentDetailPanel agent={selectedAgent} onStart={(agent) => void startConversation(agent)} />
      <CreateAgentDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}

function ScenarioCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
    </div>
  )
}

function ResourcePresetCard({
  preset,
  installed,
  installing,
  onInstall,
}: {
  preset: (typeof RESOURCE_AGENT_PRESETS)[number]
  installed: boolean
  installing: boolean
  onInstall: () => void
}) {
  return (
    <article className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-4 transition hover:border-blue-300 hover:bg-blue-50">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm">{preset.avatar}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{preset.name}</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-[#3370ff]">WorkBuddy</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{preset.description}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {preset.capabilities.map((capability) => (
          <span key={capability} className="rounded-full bg-white/80 px-2 py-1 text-[10px] text-slate-600">{capability}</span>
        ))}
      </div>
      <Button
        size="sm"
        variant={installed ? 'outline' : 'default'}
        disabled={installed || installing}
        onClick={onInstall}
        className={cn('mt-4 h-8 w-full rounded-lg text-xs', !installed && 'bg-[#3370ff] hover:bg-[#2563eb]')}
      >
        {installed ? '已在 Agent 库' : installing ? '导入中' : '导入到 Agent 库'}
      </Button>
    </article>
  )
}

function AgentCard({ agent, selected, onSelect, onStart }: { agent: AgentRow; selected: boolean; onSelect: () => void; onStart: () => void }) {
  return (
    <article onClick={onSelect} className={cn('cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md', selected ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200')}>
      <div className="flex items-start gap-3">
        <AgentAvatar agent={agent} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{agent.isBuiltin ? '内置' : '自定义'}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{agent.description || '可配置的协作 Agent'}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {[agent.adapterName, agent.isOrchestrator ? '编排' : '执行', agent.modelId ? '模型配置' : '默认模型'].map((tag) => (
          <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{tag}</span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <div className="truncate font-mono text-[11px] text-slate-500">{agent.modelId || 'default model'}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={(e) => { e.stopPropagation(); onSelect() }}>详情</Button>
          <Button size="sm" className="h-8 rounded-lg bg-[#3370ff] text-xs hover:bg-[#2563eb]" onClick={(e) => { e.stopPropagation(); onStart() }}>开始对话</Button>
        </div>
      </div>
    </article>
  )
}

function AgentDetailPanel({ agent, onStart }: { agent?: AgentRow; onStart: (agent: AgentRow) => void }) {
  return (
    <aside className="hidden w-[340px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 xl:block">
      {agent ? (
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center gap-3">
              <AgentAvatar agent={agent} size="lg" />
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{agent.name}</h2>
                <div className="mt-1 text-xs text-slate-500">{agent.adapterName} · {agent.isBuiltin ? '内置' : '自定义'}</div>
              </div>
            </div>
            <Button onClick={() => onStart(agent)} className="mt-4 w-full rounded-lg bg-[#3370ff] hover:bg-[#2563eb]">开始对话</Button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-5 p-5 text-sm">
              <DetailBlock title="模型配置" value={agent.modelId || '使用默认模型'} />
              <DetailBlock title="系统提示" value={agent.systemPrompt || '未配置系统提示'} />
              <DetailBlock title="工具权限" value="可创建产物、可写入工作区、可运行命令（沿用现有审批与沙箱逻辑）" />
              <DetailBlock title="最近会话" value="已接入会话创建；会话统计列表待后端聚合接口补充。" />
              <DetailBlock title="最近产物" value="已接入产物库；按 Agent 过滤待后端字段补充。" />
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">选择一个 Agent 查看详情</div>
      )}
    </aside>
  )
}

function ArtifactWorkspace({ onOpenConversations }: { onOpenConversations: () => void }) {
  const [items, setItems] = useState<ArtifactListItem[]>([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('全部')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const upsertArtifact = useAppStore((s) => s.upsertArtifact)
  const openArtifactPreview = useAppStore((s) => s.openArtifactPreview)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)

  useEffect(() => {
    fetchArtifacts()
      .then((list) => {
        setItems(list)
        setSelectedId(list[0]?.id ?? null)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => groupArtifactVersions(items), [items])
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return groups.filter((group) => {
      const item = group.latest
      const matchesQuery = !q || `${item.title} ${item.type} ${item.conversationTitle ?? ''}`.toLowerCase().includes(q)
      const matchesTab = tab === '全部' || item.type.toLowerCase().includes(tab.toLowerCase().replace('web 原型', 'web'))
      return matchesQuery && matchesTab
    })
  }, [groups, query, tab])

  const selected = items.find((item) => item.id === selectedId) ?? filteredGroups[0]?.latest

  const openPreview = async (id: string) => {
    try {
      const artifact = await fetchArtifact(id)
      upsertArtifact(artifact)
      openArtifactPreview(id)
    } catch (err) {
      console.error('[ArtifactWorkspace] open preview failed', err)
    }
  }

  return (
    <div className="flex h-full min-w-0 gap-4 p-6">
      <section className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <div className="border-b border-slate-100 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">产物库</h1>
              <p className="mt-1 text-sm text-slate-500">集中管理文档、原型、PPT、图片、项目和版本</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-lg border-slate-200">批量管理</Button>
              <Button variant="outline" className="rounded-lg border-slate-200">导出</Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setViewMode((mode) => (mode === 'grid' ? 'list' : 'grid'))}
                className={cn('rounded-lg border-slate-200', viewMode === 'grid' && 'border-blue-200 bg-blue-50 text-[#3370ff]')}
                title={viewMode === 'grid' ? '切换列表视图' : '切换网格视图'}
              >
                <Grid2X2 className="size-4" />
              </Button>
            </div>
          </div>
          <div className="relative mt-5">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索产物、版本或来源会话" className="h-10 rounded-xl border-slate-200 pl-10" />
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {artifactTabs.map((item) => (
              <button key={item} type="button" onClick={() => setTab(item)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs transition', tab === item ? 'border-blue-200 bg-blue-50 text-[#3370ff]' : 'border-slate-200 text-slate-500 hover:text-slate-900')}>{item}</button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-4">
            <LibraryStat label="产物组" value={String(filteredGroups.length)} />
            <LibraryStat label="总版本" value={String(items.length)} />
            <LibraryStat label="当前分类" value={tab} />
            <LibraryStat label="视图" value={viewMode === 'grid' ? '网格' : '列表'} />
          </div>
        </div>
        <ScrollArea className="h-[calc(100%-250px)]">
          <div className={cn('p-5', viewMode === 'grid' ? 'grid gap-4 xl:grid-cols-2 2xl:grid-cols-3' : 'space-y-3')}>
            {loading ? <div className="text-sm text-slate-500">加载中…</div> : filteredGroups.map((group) => (
              <ArtifactCard key={group.rootId} item={group.latest} versions={group.versions.length} selected={selected?.id === group.latest.id} compact={viewMode === 'list'} onSelect={() => setSelectedId(group.latest.id)} onPreview={() => void openPreview(group.latest.id)} onOpenConversation={() => { setActiveConversation(group.latest.conversationId); onOpenConversations() }} />
            ))}
          </div>
        </ScrollArea>
      </section>
      <ArtifactDetailPanel item={selected} onPreview={(id) => void openPreview(id)} onOpenConversation={(id) => { setActiveConversation(id); onOpenConversations() }} />
      <ArtifactPreviewPanel />
    </div>
  )
}

function LibraryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}

function ArtifactCard({ item, versions, selected, compact, onSelect, onPreview, onOpenConversation }: { item: ArtifactListItem; versions: number; selected: boolean; compact: boolean; onSelect: () => void; onPreview: () => void; onOpenConversation: () => void }) {
  return (
    <article onClick={onSelect} className={cn('cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md', selected ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200', compact && 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4')}>
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#3370ff]"><FileText className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{item.title}</h3>
          <div className="mt-1 text-xs text-slate-500">v{item.version} · {item.type} · {versions} 个版本</div>
        </div>
        {!compact && <MoreHorizontal className="size-4 text-slate-400" />}
      </div>
      <div className={cn('space-y-1 text-xs text-slate-500', compact ? 'hidden xl:block' : 'mt-4')}>
        <div className="truncate">来源对话：{item.conversationTitle ?? '未命名会话'}</div>
        <div>创建者：{item.createdByAgentId ?? 'Agent'}</div>
        <div>更新时间：{formatTime(item.createdAt)}</div>
      </div>
      <div className={cn('flex gap-2', compact ? 'justify-end' : 'mt-4 border-t border-slate-100 pt-3')}>
        <Button size="sm" className="h-8 rounded-lg bg-[#3370ff] text-xs hover:bg-[#2563eb]" onClick={(e) => { e.stopPropagation(); onPreview() }}>预览</Button>
        <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={(e) => { e.stopPropagation(); onOpenConversation() }}>打开会话</Button>
      </div>
    </article>
  )
}

function ArtifactDetailPanel({ item, onPreview, onOpenConversation }: { item?: ArtifactListItem; onPreview: (id: string) => void; onOpenConversation: (conversationId: string) => void }) {
  return (
    <aside className="hidden w-[360px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 xl:block">
      {item ? (
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-100 p-5">
            <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-blue-200 bg-blue-50/70 text-[#3370ff]"><Boxes className="size-10" /></div>
            <h2 className="mt-4 line-clamp-2 text-lg font-semibold">{item.title}</h2>
            <div className="mt-2 flex gap-2 text-[11px]"><span className="rounded bg-slate-100 px-2 py-1">{item.type}</span><span className="rounded bg-green-50 px-2 py-1 text-green-700">v{item.version}</span><span className="rounded bg-blue-50 px-2 py-1 text-[#3370ff]">可预览</span></div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-5 p-5 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
                <Meta label="创建者" value={item.createdByAgentId ?? 'Agent'} />
                <Meta label="来源会话" value={item.conversationTitle ?? '未命名'} />
                <Meta label="创建时间" value={formatTime(item.createdAt)} />
                <Meta label="更新时间" value={formatTime(item.createdAt)} />
              </div>
              <div className="grid gap-2">
                <Button onClick={() => onPreview(item.id)} className="rounded-lg bg-[#3370ff] hover:bg-[#2563eb]">打开预览</Button>
                <Button variant="outline" className="rounded-lg border-slate-200">复制引用</Button>
                <Button variant="outline" className="rounded-lg border-slate-200">导出源码</Button>
                <Button variant="outline" className="rounded-lg border-slate-200" onClick={() => onOpenConversation(item.conversationId)}>打开会话</Button>
              </div>
              <DetailBlock title="版本历史" value="已按 parentArtifactId 聚合版本；详情历史列表可继续扩展。" />
              <DetailBlock title="元数据" value={`artifactId: ${item.id}`} />
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">选择一个产物查看详情</div>
      )}
    </aside>
  )
}

function SettingsWorkspace({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="h-full p-6">
      <section className="flex h-full items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-[#3370ff]">
            <Settings className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold">设置</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            管理全局模型、API Key、移动伴随模式和部署发布设置。当前复用原有设置弹窗，避免重写配置逻辑。
          </p>
          <Button onClick={onOpenSettings} className="mt-5 rounded-lg bg-[#3370ff] hover:bg-[#2563eb]">
            打开设置
          </Button>
        </div>
      </section>
    </div>
  )
}

function PlaceholderWorkspace({ title, description }: { title: string; description: string }) {
  return (
    <div className="h-full p-6">
      <section className="flex h-full items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-[#3370ff]"><LayoutDashboard className="size-6" /></div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </section>
    </div>
  )
}

function DetailBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-slate-400">{title}</div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">{value}</div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] text-slate-400">{label}</div><div className="mt-1 truncate text-xs text-slate-700">{value}</div></div>
}

function formatTime(value: number) {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
