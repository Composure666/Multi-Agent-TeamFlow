'use client'

import { ArrowUpRight, Check, Copy, ExternalLink, MessageSquare, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { AUTHOR_WECHAT, REPO_URL, UPSTREAM_URL } from '@/components/home/home-data'
import { Button } from '@/components/ui/button'
import { BRAND_NAME, BRAND_TAGLINE_ZH } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * 剪贴板写入。
 *
 * 主页可能被挂在 http 上（自托管部署常见），而 `navigator.clipboard` 只在安全上下文
 * （https / localhost）可用。所以这里三层兜底：Async Clipboard → execCommand →
 * 返回 false 让调用方退化成「选中文本，用户自己按 Ctrl+C」。
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 权限被拒 / 非安全上下文 —— 落到下面的兜底实现
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-1000px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

function selectElementText(id: string) {
  const node = document.getElementById(id)
  if (!node) return
  const range = document.createRange()
  range.selectNodeContents(node)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

export function HomeContact() {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2200)
    return () => clearTimeout(timer)
  }, [copied])

  const handleCopy = useCallback(async () => {
    const ok = await writeClipboard(AUTHOR_WECHAT)
    if (ok) {
      setFailed(false)
      setCopied(true)
      return
    }
    setFailed(true)
    // 兜底：把号选中，用户直接 Ctrl/Cmd+C 即可
    selectElementText('home-wechat-id')
  }, [])

  return (
    <section id="contact" className="home-anchor px-5 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] p-6 shadow-sm sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-center lg:gap-12">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--agenthub-accent)]">
                <MessageSquare className="size-3.5" aria-hidden="true" />
                联系作者
              </span>

              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
                想聊聊它、想改它、想抄它，都加微信
              </h2>

              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500 sm:text-base dark:text-slate-400">
                项目由个人独立维护。使用中遇到问题、想提需求、想接一段 Agent 编排到自己的业务里，
                或者只是想知道某个模块为什么这么设计 —— 直接加微信说，比在 issue 里等回复快得多。
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-3.5 py-2.5">
                  <span className="text-sm font-medium text-slate-600">微信号</span>
                  <code
                    id="home-wechat-id"
                    className="font-mono text-base font-semibold tracking-wide text-slate-900 select-all dark:text-slate-100"
                  >
                    {AUTHOR_WECHAT}
                  </code>
                </span>

                <Button
                  type="button"
                  variant={copied ? 'secondary' : 'default'}
                  size="lg"
                  className="h-10 gap-1.5 px-4"
                  onClick={handleCopy}
                  aria-live="polite"
                >
                  {copied ? (
                    <>
                      <Check className="size-4" aria-hidden="true" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" aria-hidden="true" />
                      复制微信号
                    </>
                  )}
                </Button>
              </div>

              <p
                className={cn(
                  'mt-3 flex items-start gap-1.5 text-xs leading-5',
                  failed ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600',
                )}
              >
                <TriangleAlert className={cn('mt-0.5 size-3.5 shrink-0', failed ? '' : 'hidden')} aria-hidden="true" />
                {failed
                  ? '当前页面不是安全上下文，浏览器禁止了自动复制 —— 号已帮你选中，按 Ctrl/Cmd + C 即可。'
                  : '添加好友时请备注来意，例如「TeamFlow 使用问题」，我会优先处理。'}
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] p-5">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="size-9 shrink-0 rounded-xl bg-[#EAF2FF] bg-cover bg-center bg-no-repeat ring-1 ring-[var(--agenthub-border)]"
                  style={{ backgroundImage: "url('/icons/agenthub-mark-48.png')" }}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {BRAND_NAME}
                  </div>
                  <div className="truncate text-xs text-slate-600">
                    {BRAND_TAGLINE_ZH}
                  </div>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-600">
                不想加微信也没关系 —— 仓库、文档与问题反馈都是公开的，欢迎直接提 issue 或 PR。
              </p>

              <div className="mt-4 flex flex-col gap-2">
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-between gap-2 rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition-colors hover:border-[var(--agenthub-accent)] hover:text-[var(--agenthub-accent)] focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent)]/30 dark:text-slate-200"
                >
                  源码仓库（Gitee）
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                </a>
                <a
                  href={`${REPO_URL}/issues`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-between gap-2 rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition-colors hover:border-[var(--agenthub-accent)] hover:text-[var(--agenthub-accent)] focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent)]/30 dark:text-slate-200"
                >
                  问题反馈 / 功能建议
                  <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
                </a>
              </div>

              <p className="mt-4 border-t border-[var(--agenthub-border)] pt-3 text-xs leading-5 text-slate-600">
                本项目是{' '}
                <a href={UPSTREAM_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-slate-600 dark:hover:text-slate-300">
                  lizyoko9/bitdance-agenthub
                </a>{' '}
                的 AGPL-3.0 衍生作品。
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
