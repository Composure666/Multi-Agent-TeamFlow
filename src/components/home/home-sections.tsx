import { ArrowRight, ArrowUpRight, ChevronRight, ClipboardList, Code, Play, Sparkles, Target } from 'lucide-react'
import { Fragment } from 'react'

import {
  APP_VERSION,
  ARTIFACT_TYPES,
  BUILTIN_AGENTS,
  FEATURES,
  FOOTER_LINKS,
  PIPELINE,
  PROOF_STATS,
  REPO_URL,
  TRUST_MARKERS,
  WORKFLOW_STEPS,
} from '@/components/home/home-data'
import {
  Container,
  SectionHead,
  cardClass,
  containerCardClass,
  interactiveCardClass,
} from '@/components/home/home-primitives'
import { HomeScreenshotFigure } from '@/components/home/home-screenshot'
import { CountUp, Reveal } from '@/components/home/home-motion'
import { buttonVariants } from '@/components/ui/button'
import { BRAND_NAME, BRAND_TAGLINE_EN, BRAND_TAGLINE_ZH } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * 项目主页的静态分区（服务端组件）。
 *
 * 设计约束与本项目工作台保持一致：
 *  - 颜色 / 圆角 / 动效一律走 globals.css 的令牌（--agenthub-*、--radius、--agenthub-motion-*），
 *    因此亮暗主题、减少动效偏好都自动生效，不需要在这里写第二套值；
 *  - 卡片按 Phase 1 的三档用：大容器用 `containerCardClass`，内容卡用 `cardClass`，
 *    可 hover 的卡用 `interactiveCardClass`；
 *  - 文本色沿用工作台的 slate 阶梯（globals.css 里已为 .dark 统一重映射）。
 *  - 分区之间用背景色深浅交替分隔，不再全部用 `border-b`；
 *    `SectionHead` 居中版只在「界面预览」「架构」两区用，其余左对齐。
 */

/* ────────────────────────────────────────────────────────────────────────────
   首屏
   ──────────────────────────────────────────────────────────────────────────── */

/** Hero 气泡拼贴用的四条真实消息：/demo「光影造像工坊」 showcase 对话的开头四句，源头在 `src/server/demo-seed.ts`，不编造功能。 */
const HERO_CHAT: { name: string; icon: typeof Target | null; text: string; fromUser: boolean }[] = [
  { name: '你', icon: null, text: '给「光影造像工坊」做一个品牌落地页，要高级、有电影感，明天给客户看。', fromUser: true },
  { name: 'Orchestrator', icon: Target, text: '收到，目标很明确：电影感，明天交付。拆成四步：PRD → 设计 → 实现 → 评审，开始。', fromUser: false },
  { name: 'PM 小灰', icon: ClipboardList, text: 'PRD 写好了：定位高端人像摄影，电影感靠暗色 + 暖金点缀 + 宽幅留白来表达。', fromUser: false },
  { name: '前端工程师', icon: Code, text: '网页做好了，可以直接预览：首屏大标题 + 作品墙 + 套餐与预约区块。', fromUser: false },
]

export function HomeHero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <Container className="relative py-20 sm:py-24 lg:py-28">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className="home-rise inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] py-1 pl-1 pr-3 text-sm shadow-sm">
            <span className="rounded-full bg-[var(--agenthub-accent-soft)] px-2 py-0.5 font-mono font-semibold text-[var(--agenthub-accent)]">
              {APP_VERSION}
            </span>
            <span className="font-medium text-slate-600">
              本地优先的多 Agent 协作工作空间
            </span>
          </span>

          <h1
            className="home-rise font-heading mt-6 text-[2.1rem] leading-[1.15] font-semibold tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.1] dark:text-slate-100"
            style={{ animationDelay: '60ms' }}
          >
            把 AI 协作
            <br className="sm:hidden" />
            做成<span className="home-title-accent">一场群聊</span>
          </h1>

          <p
            className="home-rise mt-5 text-sm font-medium tracking-wide text-slate-600"
            style={{ animationDelay: '110ms' }}
          >
            {BRAND_NAME} · {BRAND_TAGLINE_ZH}
          </p>

          <p
            className="home-rise mt-5 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300"
            style={{ animationDelay: '160ms' }}
          >
            说清目标，调度 Agent 把它拆成子任务、派给不同专长的 Agent，再把交付物收拢成可预览的产物。
            会话、Agent、产物与数据库，全部留在你自己的机器上。
          </p>

          <div
            className="home-rise mt-8 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: '210ms' }}
          >
            {/* 在线演示是公开的只读回放（/demo，nginx 精确放行），不用登录就能看，
                是首页最显眼的主按钮 —— 访客第一眼先看到演示，再看下载与源码。 */}
            <a
              href="/demo"
              className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'h-10 gap-1.5 px-5')}
            >
              <Play className="size-4" aria-hidden="true" />
              在线演示
            </a>
            <a
              href="#download"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-10 gap-1.5 px-5')}
            >
              下载桌面端
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-10 gap-1.5 px-5')}
            >
              查看源码
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </div>

          <ul
            className="home-rise mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
            style={{ animationDelay: '260ms' }}
          >
            {TRUST_MARKERS.map(({ label, icon: Icon }) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600"
              >
                <Icon className="size-3.5 shrink-0 text-[var(--agenthub-accent)]" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* 群聊气泡拼贴：静态构图 + home-rise 轻微入场，不引入新动效库。 */}
        <div
          className={cn(containerCardClass, 'home-rise mx-auto mt-14 flex max-w-2xl flex-col gap-3 p-4 sm:p-5')}
          style={{ animationDelay: '310ms' }}
          aria-label="群聊示例：你发一句话目标，四位 Agent 接力产出"
        >
          {HERO_CHAT.map((bubble, index) => {
            const Icon = bubble.icon
            return (
              <div
                key={bubble.name}
                className={cn('flex items-start gap-2.5', bubble.fromUser && 'flex-row-reverse')}
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    bubble.fromUser
                      ? 'bg-[var(--agenthub-accent)] text-[var(--primary-foreground)]'
                      : 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]',
                  )}
                  aria-hidden="true"
                >
                  {Icon ? <Icon className="size-4" /> : '你'}
                </span>
                <div className={cn('min-w-0 max-w-[85%]', bubble.fromUser && 'text-right')}>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{bubble.name}</span>
                  <p
                    className={cn(
                      'home-rise mt-1 rounded-2xl px-3.5 py-2.5 text-left text-sm leading-6 text-slate-800 dark:text-slate-200',
                      bubble.fromUser
                        ? 'rounded-tr-sm bg-[var(--agenthub-accent-soft)]'
                        : 'rounded-tl-sm bg-[var(--agenthub-surface-muted)]',
                    )}
                    style={{ animationDelay: `${360 + index * 50}ms` }}
                  >
                    {bubble.text}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   界面预览（截图）
   ----------------------------------------------------------------------------
   放在首屏之后、工作流之前：访客往下滚第一屏就该看到「长什么样」，
   而不是先读一大段抽象描述。截图走仓库内静态资源 + onError 占位文案，
   不使用任何外链（离线也能看）。
   ──────────────────────────────────────────────────────────────────────────── */

export function HomeScreenshot() {
  return (
    <section id="preview" className="home-anchor bg-[var(--agenthub-surface-muted)]">
      <Container className="py-16 sm:py-20">
        <Reveal>
          <SectionHead
            eyebrow="界面预览"
            title="先看一眼真实界面"
            description="真实运行的工作台：左侧是工作区导航，右侧是品牌标题、任务输入卡片与建议入口。"
          />

          <div className="mt-10">
            <HomeScreenshotFigure />
          </div>

          {/* ❗ CTA 目标必须是访客真能到的地方。`/` 在对外托管部署里位于 nginx Basic 门禁之后，
              匿名点下去只会弹浏览器原生登录框（模态窗口、吞掉整页事件、控制台零报错）。 */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#download"
              className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'h-10 gap-1.5 px-5')}
            >
              下载桌面端
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-10 gap-1.5 px-5')}
            >
              查看源码
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   工作流
   ──────────────────────────────────────────────────────────────────────────── */

export function HomeWorkflow() {
  return (
    <section id="workflow" className="home-anchor">
      <Container className="py-16 sm:py-20">
        <Reveal>
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <SectionHead
                align="left"
                eyebrow="工作流"
                title="从一句目标，到一件可交付的产物"
                description="你只需要说清要什么。拆分、派单、传递上下文、评审这些事，交给调度 Agent 和它的同伴。"
              />
              <a
                href="#download"
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'mt-6 h-10 gap-1.5 px-4')}
              >
                下载桌面端
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </div>

            <ol className="relative flex list-none flex-col gap-7 border-l border-dashed border-[var(--agenthub-border)] pl-6">
              {WORKFLOW_STEPS.map((step, index) => (
                <li key={step.title} className="relative">
                  <span
                    className="absolute -left-9 top-0 flex size-6 items-center justify-center rounded-full border border-[var(--agenthub-accent-border)] bg-[var(--agenthub-surface)] font-mono text-xs font-semibold text-[var(--agenthub-accent)]"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-7 text-slate-600">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="mt-14">
          <div className={containerCardClass}>
            <div className="p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <Sparkles className="size-4 shrink-0 text-[var(--agenthub-accent)]" aria-hidden="true" />
                  一条典型的端到端链路
                </div>
                <code className="font-mono text-sm text-slate-600">
                  “做一个咖啡订阅服务的落地页”
                </code>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-3">
                {PIPELINE.map((node, index) => (
                  <Fragment key={node.owner}>
                    {index > 0 && (
                      <ChevronRight className="size-4 shrink-0 text-slate-300 dark:text-slate-400" aria-hidden="true" />
                    )}
                    <span className="inline-flex flex-col rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-3 py-2">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{node.owner}</span>
                      <span className="text-xs text-slate-600">{node.detail}</span>
                    </span>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   架构与流程
   ----------------------------------------------------------------------------
   用一张内联 SVG 讲清「目标 → 派单 → 产出 → 收拢」这条主干。
   之所以是内联 SVG 而不是图片：颜色要走 `currentColor` / `--agenthub-*`，
   这样亮暗主题自动生效，且天然随容器缩放、不会因外链失效而空白。
   连接线上的流动虚线由 globals.css 的 `.home-flow-line` 驱动（减少动效时停）。
   ──────────────────────────────────────────────────────────────────────────── */

const ARCH_NODES: { name: string; artifact: string; cx: number }[] = [
  { name: 'PM 小灰', artifact: '产出 PRD', cx: 110 },
  { name: 'UI 设计师', artifact: '产出设计规范', cx: 300 },
  { name: '前端工程师', artifact: '产出 web_app', cx: 490 },
  { name: 'Reviewer', artifact: '产出评审意见', cx: 680 },
]

export function HomeArchitecture() {
  return (
    <section id="architecture" className="home-anchor bg-[var(--agenthub-surface-muted)]">
      <Container className="py-16 sm:py-20">
        <Reveal>
          <SectionHead
            eyebrow="架构与流程"
            title="一句话目标进，一件可交付的产物出"
            description="Orchestrator 负责判断与派单，专长 Agent 各产出带类型的产物，全部收进产物库；下游直接读前序产物，不必从对话里重新猜上下文。"
          />

          <figure className={cn(containerCardClass, 'mt-10 p-5 sm:p-6')}>
            <svg
            viewBox="0 0 800 400"
            className="w-full text-slate-700 dark:text-slate-300"
            role="img"
            aria-label="架构流程图：你的目标交给 Orchestrator 判断与派单，再分发给 PM 小灰、UI 设计师、前端工程师与 Reviewer 四个专长 Agent，各自产出带类型的产物后统一收进产物库，可预览、可导出、可发布为可分享的 URL。"
          >
            <defs>
              <marker
                id="arch-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--agenthub-accent)" />
              </marker>
            </defs>

            {/* 1. 目标 */}
            <rect
              x="310"
              y="12"
              width="180"
              height="46"
              rx="12"
              fill="var(--agenthub-surface-muted)"
              stroke="var(--agenthub-border)"
            />
            <text x="400" y="41" textAnchor="middle" fontSize="14" fill="currentColor">
              你的目标（自然语言）
            </text>

            {/* 目标 → Orchestrator */}
            <path
              d="M400 58 V 88"
              fill="none"
              stroke="var(--agenthub-accent)"
              strokeWidth="2"
              strokeDasharray="6 6"
              markerEnd="url(#arch-arrow)"
              className="home-flow-line"
            />

            {/* 2. Orchestrator */}
            <rect
              x="290"
              y="88"
              width="220"
              height="56"
              rx="12"
              fill="var(--agenthub-accent-soft)"
              stroke="var(--agenthub-accent-border)"
            />
            <text
              x="400"
              y="112"
              textAnchor="middle"
              fontSize="15"
              fontWeight="600"
              fill="var(--agenthub-accent)"
            >
              Orchestrator
            </text>
            <text x="400" y="131" textAnchor="middle" fontSize="12" fill="currentColor">
              判断 · 拆解 · 派单
            </text>

            {/* Orchestrator → 四个 Agent（派单总线） */}
            <path
              d="M400 144 V 166 M110 166 H 690"
              fill="none"
              stroke="var(--agenthub-accent)"
              strokeWidth="2"
              strokeDasharray="6 6"
              className="home-flow-line"
            />
            {ARCH_NODES.map((node) => (
              <path
                key={`drop-${node.cx}`}
                d={`M${node.cx} 166 V 190`}
                fill="none"
                stroke="var(--agenthub-accent)"
                strokeWidth="2"
                strokeDasharray="6 6"
                markerEnd="url(#arch-arrow)"
                className="home-flow-line"
              />
            ))}

            {/* 3. 四个专长 Agent */}
            {ARCH_NODES.map((node) => (
              <g key={node.name}>
                <rect
                  x={node.cx - 80}
                  y="190"
                  width="160"
                  height="56"
                  rx="12"
                  fill="var(--agenthub-surface-muted)"
                  stroke="var(--agenthub-border)"
                />
                <text
                  x={node.cx}
                  y="214"
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="600"
                  fill="currentColor"
                >
                  {node.name}
                </text>
                <text x={node.cx} y="233" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.72">
                  {node.artifact}
                </text>
              </g>
            ))}

            {/* Agent → 产物库（收拢总线） */}
            {ARCH_NODES.map((node) => (
              <path
                key={`collect-${node.cx}`}
                d={`M${node.cx} 246 V 272`}
                fill="none"
                stroke="var(--agenthub-accent)"
                strokeWidth="2"
                strokeDasharray="6 6"
                className="home-flow-line"
              />
            ))}
            <path
              d="M110 272 H 680"
              fill="none"
              stroke="var(--agenthub-accent)"
              strokeWidth="2"
              strokeDasharray="6 6"
              className="home-flow-line"
            />
            <path
              d="M400 272 V 300"
              fill="none"
              stroke="var(--agenthub-accent)"
              strokeWidth="2"
              strokeDasharray="6 6"
              markerEnd="url(#arch-arrow)"
              className="home-flow-line"
            />

            {/* 4. 产物库 */}
            <rect
              x="260"
              y="300"
              width="280"
              height="56"
              rx="12"
              fill="var(--agenthub-accent-soft)"
              stroke="var(--agenthub-accent-border)"
            />
            <text
              x="400"
              y="324"
              textAnchor="middle"
              fontSize="14"
              fontWeight="600"
              fill="var(--agenthub-accent)"
            >
              产物库
            </text>
            <text x="400" y="343" textAnchor="middle" fontSize="11" fill="currentColor">
              预览 · 导出 · 发布为可分享 URL
            </text>

            {/* 5. 侧边约束：沙箱与审批 */}
            <rect
              x="20"
              y="300"
              width="200"
              height="56"
              rx="12"
              fill="var(--agenthub-surface-muted)"
              stroke="var(--agenthub-border)"
            />
            <text x="120" y="324" textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">
              沙箱工作区
            </text>
            <text x="120" y="343" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.72">
              路径守卫 · 高风险操作审批
            </text>
            <path
              d="M120 300 V 272 H 110"
              fill="none"
              stroke="var(--agenthub-border)"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          </svg>

          <figcaption className="mt-4 text-center text-xs leading-6 text-slate-500 dark:text-slate-400">
            主干：目标 → Orchestrator 派单 → 专长 Agent 产出带类型产物 → 收进产物库。
            全程在本机完成，文件操作受路径守卫约束，高风险命令需你批准。
          </figcaption>
          </figure>
        </Reveal>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   主要功能模块 + 内置 Agent 横条（原独立的 Agents 分区并入此处）
   ──────────────────────────────────────────────────────────────────────────── */

export function HomeFeatures() {
  return (
    <section id="features" className="home-anchor">
      <Container className="py-16 sm:py-20">
        <SectionHead
          align="left"
          eyebrow="功能模块"
          title="九个模块，覆盖从协作到交付的全过程"
          description="下面这些不是规划图 —— 它们就是工作台侧边栏里真实存在的九个入口，每个都可用。"
        />

        <Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.id} className={cn(interactiveCardClass, 'flex flex-col p-5')}>
                <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
                  <feature.icon className="size-[18px]" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {feature.label}
                </h3>
                <p className="mt-1 text-sm font-medium text-[var(--agenthub-accent)]">{feature.tagline}</p>
                <p className="mt-2.5 text-sm leading-6 text-slate-600">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>

          <div className={cn(cardClass, 'mt-4 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-6')}>
            <span className="shrink-0 text-sm font-semibold tracking-wide text-slate-600">
              产物类型
            </span>
            <ul className="flex flex-wrap gap-2">
              {ARTIFACT_TYPES.map((type) => (
                <li
                  key={type}
                  className="rounded-lg border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-2 py-1 font-mono text-xs text-slate-600 dark:text-slate-300"
                >
                  {type}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* 内置 Agent 横条：五个开箱即用的角色，全部走 claude-code 适配器；
            也可用 Agent 构建器自定义适配器、模型、工具与 system prompt。 */}
        <Reveal delay={0.08}>
          <h3 className="font-heading mt-12 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            五个开箱即用的角色
          </h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {BUILTIN_AGENTS.map((agent) => (
              <article key={agent.name} className={cn(interactiveCardClass, 'flex flex-col p-4')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
                    <agent.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="agenthub-status-badge agenthub-status-info">{agent.role}</span>
                </div>
                <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{agent.name}</h4>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{agent.duty}</p>
              </article>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   数字证明（新增）：满幅色块条，只讲四个真实数字。
   数字用金色 —— 金色点缀四处之一（proposal B 节）。
   ──────────────────────────────────────────────────────────────────────────── */

export function HomeProof() {
  return (
    <section id="proof" className="home-anchor bg-[var(--agenthub-accent-soft)]">
      <Container className="py-14 sm:py-16">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
          数字先说话
        </h2>
        <dl className="mt-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {PROOF_STATS.map((stat) => (
            <div key={stat.label}>
              <dt className="sr-only">{stat.label}</dt>
              <dd className="font-heading text-4xl font-bold tracking-tight text-[var(--agenthub-gold)] sm:text-5xl">
                <CountUp value={Number(stat.value)} />
              </dd>
              <dd className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">{stat.label}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   页脚：原「使用指南」「联系方式」两个独立分区收进这里 ——
   指南写成一句话指引，联系作者放微信二维码名片，不再各占一个分区。
   ──────────────────────────────────────────────────────────────────────────── */

export function HomeFooter() {
  return (
    <footer className="bg-[var(--agenthub-surface)]">
      <Container className="py-12 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="size-8 shrink-0 rounded-lg bg-[var(--agenthub-accent-soft)] bg-cover bg-center bg-no-repeat ring-1 ring-[var(--agenthub-border)]"
                style={{ backgroundImage: "url('/icons/agenthub-mark-32.png')" }}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {BRAND_NAME}
                </div>
                <div className="truncate text-xs text-slate-600">{BRAND_TAGLINE_EN}</div>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">
              本地优先的多 Agent 协作工作空间。所有会话、产物与数据库都在你自己的机器上，无需注册账号，
              也不经过任何云端中转。
            </p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
              使用指南：装好后打开应用，在「设置」里先配一个模型 API Key（DeepSeek / OpenAI /
              Anthropic / 火山方舟任选其一），再新建会话。
            </p>
            <div className="mt-5 flex items-start gap-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- 仓库内静态资源：作者本人提供的微信二维码名片 */}
              <img
                src="/images/wechat-qr.png"
                alt="作者微信二维码名片：Composure°，湖南郴州，扫码添加好友"
                className="w-36 shrink-0 rounded-xl border border-[var(--agenthub-border)] bg-white"
                loading="lazy"
              />
              <div className="min-w-0 pt-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">微信扫码联系作者</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">扫码添加好友，聊项目、提建议都可以。</p>
              </div>
            </div>
            <p className="mt-3 font-mono text-xs text-slate-600">
              {APP_VERSION} · AGPL-3.0-only
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {FOOTER_LINKS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h3 className="text-sm font-semibold tracking-wide text-slate-900 dark:text-slate-100">
                  {column.title}
                </h3>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...(link.href.startsWith('#')
                          ? {}
                          : { target: '_blank', rel: 'noreferrer' })}
                        className="text-sm leading-6 text-slate-600 outline-none transition-colors hover:text-[var(--agenthub-accent)] focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent)]/30"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-[var(--agenthub-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-600">
            Copyright © 2026 {BRAND_NAME} contributors.
          </p>
          <p className="text-xs leading-6 text-slate-600">
            本项目以 AGPL-3.0-only 开源，版权与来源声明、AGPL-3.0 第 13 条源码获取方式见仓库根目录{' '}
            <a
              href={`${REPO_URL}/blob/master/NOTICE.md`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-[var(--agenthub-accent)]"
            >
              NOTICE.md
            </a>
            。
          </p>
        </div>
      </Container>
    </footer>
  )
}
