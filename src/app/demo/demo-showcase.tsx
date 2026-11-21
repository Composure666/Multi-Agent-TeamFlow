'use client'

import { ArrowLeft, CheckCircle2, Download, FileText, Globe, RotateCcw, SkipForward } from 'lucide-react'
import { motion, MotionConfig } from 'motion/react'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { AgentAvatar } from '@/components/agent-avatar'
import { ArtifactPreviewPanel } from '@/components/artifact-preview-panel'
import { MessageList } from '@/components/message-list'
import { RunStatusSummary } from '@/components/run-status-summary'
import { Button } from '@/components/ui/button'
import { BRAND_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'
import {
  DEMO_AGENTS,
  DEMO_ARTIFACTS,
  DEMO_CONVERSATION,
  DEMO_CONVERSATION_ID,
  DEMO_USER_MESSAGE,
} from '@/server/demo-seed'
import type { ArtifactType } from '@/shared/types'
import { useAppStore } from '@/stores/app-store'

import { useDemoReplay } from './demo-replay'

const ARTIFACT_TYPE_LABEL: Record<ArtifactType, string> = {
  web_app: '网页',
  code_file: '代码',
  diff: '差异',
  document: '文档',
  image: '图片',
  ppt: '演示',
  diagram: '图表',
  project: '项目',
}

/**
 * /demo 演示页：只读回放。
 *
 * 隔离性：
 *  - 水合只在客户端 effect 里做（SSR 不写 store，避免服务端 store 被演示数据污染），
 *    且 MessageList 在 readOnly 下不发任何请求；
 *  - 回放只经过 store.applyEvent，不调任何 API、不碰数据库、不碰终端；
 *  - 卸载时清掉演示会话，不留痕迹。
 */
export function DemoShowcase() {
  const [hydrated, setHydrated] = useState(false)
  const { status, turnIndex, totalTurns, play, stop, replay, skip } = useDemoReplay()
  const previewArtifactId = useAppStore((s) => s.previewArtifactId)
  // 注意：派生数组必须包 useShallow，否则 filter+sort 每次返回新引用，
  // Zustand 5 会误判为状态变化而无限重渲染（React error #185，页面直接崩）。
  const demoArtifacts = useAppStore(
    useShallow((s) =>
      Object.values(s.artifacts)
        .filter((a) => a.conversationId === DEMO_CONVERSATION_ID)
        .sort((a, b) => a.createdAt - b.createdAt),
    ),
  )

  // 客户端水合 + 自动播放（同一个 effect，先后顺序有讲究）：
  //  - 水合必须在回放开始前完成，否则回放先建的 agent 消息会被
  //    setMessagesForConversation 覆盖掉消息列表；
  //  - 这是 effect（客户端才跑），所以用 hydrated 门控：水合前先渲染占位，
  //    与服务端预渲染的 HTML 一致，不产生 hydration mismatch；
  //  - 卸载时先停回放再清演示会话，不留痕迹。
  useEffect(() => {
    const store = useAppStore.getState()
    store.setAgents(DEMO_AGENTS)
    store.setConversations([DEMO_CONVERSATION])
    store.setMessagesForConversation(DEMO_CONVERSATION_ID, [DEMO_USER_MESSAGE])
    setHydrated(true)
    play()
    return () => {
      stop()
      store.removeConversation(DEMO_CONVERSATION_ID)
    }
  }, [play, stop])

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--agenthub-border)] px-4 py-3">
        <a href="/home" className="text-base font-semibold text-slate-900">
          {BRAND_NAME}
        </a>
        <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          在线演示 · 只读
        </span>
        <span className="hidden text-xs text-muted-foreground md:inline">
          预置内容回放 · 不消耗模型额度 · 不写入数据库
        </span>
        <div className="ml-auto flex items-center gap-2">
          {status === 'playing' ? (
            <Button type="button" variant="outline" size="sm" onClick={skip}>
              <SkipForward className="size-3.5" />
              <span className="hidden sm:inline">跳过播放</span>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={replay}>
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">重新播放</span>
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" asChild>
            <a href="/home">
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">返回主页</span>
            </a>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <main className="agenthub-card-container flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-3 border-b border-[var(--agenthub-border)] px-5 py-3">
            <div className="flex shrink-0 -space-x-2 overflow-hidden pr-1">
              {DEMO_AGENTS.map((agent) => (
                <AgentAvatar key={agent.id} agent={agent} size="sm" className="border-2 border-background" />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-slate-900">
                {DEMO_CONVERSATION.title}
              </div>
              <div className="mt-0.5 truncate text-xs text-slate-500">
                群聊 · {DEMO_AGENTS.length} 位 Agent
                {status === 'playing' ? ` · 正在播放第 ${turnIndex + 1} / ${totalTurns} 轮` : ' · 播放完成'}
              </div>
              {/* 播放进度：细进度条，与“第 N / 5 轮”文案对应；播完停在 100%。 */}
              <div
                className="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-[var(--agenthub-surface-muted)]"
                role="progressbar"
                aria-valuenow={Math.min(turnIndex, totalTurns)}
                aria-valuemin={0}
                aria-valuemax={totalTurns}
                aria-label={`回放进度：第 ${Math.min(turnIndex + 1, totalTurns)} / ${totalTurns} 轮`}
              >
                <div
                  className="h-full rounded-full bg-[var(--agenthub-accent)] transition-[width] duration-300"
                  style={{ width: `${(Math.min(turnIndex, totalTurns) / totalTurns) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {hydrated ? (
            <>
              <RunStatusSummary conversationId={DEMO_CONVERSATION_ID} />
              <MessageList conversationId={DEMO_CONVERSATION_ID} readOnly />
              {status === 'done' && <DemoEndCard />}
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              正在准备演示…
            </div>
          )}
        </main>

        <div className="hidden w-[480px] shrink-0 flex-col lg:flex">
          {previewArtifactId ? (
            <ArtifactPreviewPanel readOnly fullHeight />
          ) : (
            <DemoArtifactRail createdCount={demoArtifacts.length} />
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-[var(--agenthub-border)] px-4 py-3 text-center text-xs text-muted-foreground">
        只读回放：五位 Agent 的协作由 Mock 重放，无真实模型调用，也无终端。
        <a href="/home#download" className="font-medium text-primary hover:underline">
          下载桌面端
        </a>
        ，或
        <a
          href="https://github.com/Composure666/Multi-Agent-TeamFlow"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
        >
          查看源码
        </a>
      </footer>
      </div>
    </MotionConfig>
  )
}

/** 结束卡片：播放完成后出现，明确告诉访客回放结束了，并给下一步出口。 */
function DemoEndCard() {
  return (
    <motion.div
      className="shrink-0 border-t border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-5 py-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CheckCircle2 className="size-4 text-[var(--agenthub-accent)]" aria-hidden="true" />
          回放结束
        </span>
        <span className="text-xs text-muted-foreground">
          5 轮对话 · {DEMO_ARTIFACTS.length} 件产物 · 5 位 Agent
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" asChild>
            <a href="/home#download">
              <Download className="size-3.5" />
              下载桌面端
            </a>
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <a
              href="https://github.com/Composure666/Multi-Agent-TeamFlow"
              target="_blank"
              rel="noreferrer"
            >
              查看源码
            </a>
          </Button>
        </span>
      </div>
    </motion.div>
  )
}

/** 右栏：产物未打开时，列出回放中已生成的产物，点击打开只读预览。 */
function DemoArtifactRail({ createdCount }: { createdCount: number }) {
  const artifacts = useAppStore(
    useShallow((s) =>
      Object.values(s.artifacts)
        .filter((a) => a.conversationId === DEMO_CONVERSATION_ID)
        .sort((a, b) => a.createdAt - b.createdAt),
    ),
  )
  const openPreview = useAppStore((s) => s.openArtifactPreview)
  const agentsById = useAppStore((s) => s.agents)
  // 点亮态：最新生成的一件产物用金色边框 + 金色圆点标出（金色点缀四处之一），
  // 其余已生成产物恢复普通态；顺序即生成顺序。
  const latestArtifactId = artifacts.length > 0 ? artifacts[artifacts.length - 1].id : null

  return (
    <div className="agenthub-card-container flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--agenthub-border)] px-4 py-3">
        <div className="text-sm font-medium text-slate-900">产物链</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          已生成 {createdCount} / {DEMO_ARTIFACTS.length} · PRD → 设计稿 → 网页 → 评审
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {artifacts.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm leading-6 text-muted-foreground">
            回放开始后，产物会按生成顺序出现在这里：PRD、设计稿、网页、评审，一件接一件点亮。
          </p>
        ) : (
          artifacts.map((artifact, index) => {
            const lit = artifact.id === latestArtifactId
            return (
              <motion.button
                key={artifact.id}
                type="button"
                onClick={() => openPreview(artifact.id)}
                className={cn(
                  'agenthub-card-interactive flex w-full items-start gap-3 px-3 py-2.5 text-left',
                  lit && 'border-[var(--agenthub-gold-border)]',
                )}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                {/* 点亮过渡：刚成为最新产物时圆点轻微放大回弹，其余时间静止。 */}
                <motion.span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    lit ? 'bg-[var(--agenthub-gold)]' : 'bg-[var(--agenthub-border)]',
                  )}
                  aria-hidden="true"
                  animate={lit ? { scale: [1, 1.6, 1] } : { scale: 1 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                />
                {artifact.type === 'web_app' ? (
                  <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {index + 1}. {artifact.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {ARTIFACT_TYPE_LABEL[artifact.type]} ·{' '}
                    {agentsById[artifact.createdByAgentId]?.name ?? 'Agent'} · 点击预览
                  </span>
                </span>
              </motion.button>
            )
          })
        )}
      </div>
    </div>
  )
}
