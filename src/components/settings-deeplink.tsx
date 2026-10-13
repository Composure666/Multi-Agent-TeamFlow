'use client'

import { useEffect } from 'react'

import { useAppStore } from '@/stores/app-store'

/**
 * 让外部链接能把用户**直接送到设置里对应的分区**。
 *
 * 为什么需要它：项目主页（`/home`）会在「使用指南」里说「先去配好 AI 模型与 OSS」，
 * 但设置面板是工作台内部的模态，主页没法直接打开它。有了这条约定，主页只要写
 * `/?setup=api-keys` 或 `/?setup=oss`，进来就会自动弹出设置并停在那一页 ——
 * 否则用户得自己从主页跳进工作台、再找到设置、再找到正确的 Tab，这是最容易被放弃的一步。
 *
 * 取值交给 `openSettingsTarget` 自己校验（内部走 `normalizeSettingsSection`），
 * 这里不维护第二份合法值清单 —— 认不出的值只会让设置弹窗停在默认分区，不会出错。
 *
 * 消费后立刻把 query 抹掉：否则用户关掉设置再刷新、或前进后退，弹窗会被反复顶出来。
 */
export function SettingsDeepLink() {
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const section = params.get('setup')
    if (!section) return

    openSettingsTarget(section)

    const url = new URL(window.location.href)
    url.searchParams.delete('setup')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [openSettingsTarget])

  return null
}
