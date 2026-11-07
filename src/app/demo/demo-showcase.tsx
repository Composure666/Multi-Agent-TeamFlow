'use client'

import { ArrowLeft, FileText, Globe, RotateCcw, SkipForward } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { AgentAvatar } from '@/components/agent-avatar'
import { ArtifactPreviewPanel } from '@/components/artifact-preview-panel'
import { MessageList } from '@/components/message-list'
import { RunStatusSummary } from '@/components/run-status-summary'
import { Button } from '@/components/ui/button'
import { BRAND_NAME } from '@/lib/brand'
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
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
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
              跳过播放
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={replay}>
              <RotateCcw className="size-3.5" />
              重新播放
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" asChild>
            <a href="/home">
              <ArrowLeft className="size-3.5" />
              返回主页
            </a>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-card">
          <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-3">
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
            </div>
          </div>

          {hydrated ? (
            <>
              <RunStatusSummary conversationId={DEMO_CONVERSATION_ID} />
              <MessageList conversationId={DEMO_CONVERSATION_ID} readOnly />
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              正在准备演示…
            </div>
          )}
        </main>

        <div className="hidden w-[440px] shrink-0 flex-col lg:flex xl:w-[560px]">
          {previewArtifactId ? (
            <ArtifactPreviewPanel readOnly fullHeight />
          ) : (
            <DemoArtifactRail createdCount={demoArtifacts.length} />
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-slate-100 px-4 py-3 text-center text-xs text-muted-foreground">
        本页为只读演示：五位 Agent 的协作过程由 Mock 回放，没有真实模型调用，也没有终端。
        想自己用——
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-card">
      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <div className="text-sm font-medium text-slate-900">产物链</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          已生成 {createdCount} / {DEMO_ARTIFACTS.length} · PRD → 设计稿 → 网页 → 评审
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {artifacts.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            产物会在回放中陆续出现，点任意产物卡片查看预览。
          </p>
        ) : (
          artifacts.map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              onClick={() => openPreview(artifact.id)}
              className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-background px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-primary/5"
            >
              {artifact.type === 'web_app' ? (
                <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">
                  {artifact.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {ARTIFACT_TYPE_LABEL[artifact.type]} ·{' '}
                  {agentsById[artifact.createdByAgentId]?.name ?? 'Agent'} · 点击预览
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
