'use client'

import { AlertTriangle,
  Bell,
  Check,
  Clipboard,
  CloudUpload,
  FolderUp,
  Globe,
  Info,
  KeyRound,
  Loader2,
  Monitor,
  Network,
  Power,
  RotateCw,
  Settings as SettingsIcon,
  Smartphone, Layers, ShieldCheck, BookOpen } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { AppSettingsRow } from '@/db/schema'
import { BRAND_NAME } from '@/lib/brand'
import {
  fetchAppSettings,
  fetchConnectionHints,
  fetchOssSettings,
  fetchSiteLinks,
  regenerateMobileDeviceToken,
  updateAppSettings,
  type AppSettingsPatchBody,
  type ConnectionHint,
  type OssSettingsView,
  type SiteLinksView,
} from '@/lib/api'
import { subscribeUiCommand } from '@/lib/ui-command-events'
import { ProvidersPanel } from '@/components/settings/providers-panel'
import { ProviderPriorityPanel } from '@/components/settings/provider-priority-panel'
import { FailoverPanel } from '@/components/settings/failover-panel'
import { ModelAssignmentPanel } from '@/components/settings/model-assignment-panel'
import { OssPanel, type OssFormValues, type OssSecretField } from '@/components/settings/oss-panel'
import { SitePanel, type SiteFormValues } from '@/components/settings/site-panel'
import { useAppStore } from '@/stores/app-store'

interface SettingsForm {
  anthropicBaseUrl: string
  defaultLlmProvider: 'auto' | 'deepseek' | 'openai' | 'anthropic' | 'ark'
  companionMode: 'off' | 'lan' | 'tailnet'
  mobileDeviceToken: string
  deploymentPublishEnabled: boolean
  deploymentPublishDir: string
  deploymentPublicBaseUrl: string
  notificationTaskEnabled: boolean
  notificationErrorEnabled: boolean
  notificationSystemEnabled: boolean
  notificationConfigurationEnabled: boolean
  notificationToastEnabled: boolean
  notificationNativeEnabled: boolean
  notificationUrgentEnabled: boolean
  experienceExtractionEnabled: boolean
  // ─── 阿里云 OSS ───
  // bucket / endpoint 是普通字段（GET 原样回传，可回填）；两个 AccessKey 是**脱敏回显**，
  // 输入框恒为空，是否参与保存由 `ossSecretsEdited` 决定。
  ossBucket: string
  ossEndpoint: string
  ossAccessKeyId: string
  ossAccessKeySecret: string
  ossPublicRead: boolean
  // ─── 官网 ───
  officialWebsiteUrl: string
  desktopDownloadUrl: string
}

/**
 * 密钥类字段：`mobileDeviceToken` 在本弹窗里由 `MobileConnectionHints` 直接「重新生成」，
 * 不走文本输入，所以不需要 dirty 跟踪。
 *
 * ❗ 另外 4 个 provider key（anthropic/openai/deepseek/ark）**不在这里维护** ——
 * 它们的主入口是「供应商中心」（`ProvidersPanel` → `ProviderConfigDialog`），
 * 那个弹窗里才有对应输入框和 dirty 跟踪。本弹窗曾有的那 4 个字段从未被渲染过，
 * 已在 2026-09-22 清理掉，避免出现「看起来能改、实际改了没用」的幽灵字段。
 */

/**
 * 全局设置面板。
 *
 * 服务端返回的所有密钥字段都是**脱敏值**（`********abcd`）。前端只显示「配没配」，
 * 要改一律去供应商中心整把重填。优先级（adapter 侧）：agent.apiKey > 供应商中心 > env。
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hintsLoading, setHintsLoading] = useState(false)
  const [tokenBusy, setTokenBusy] = useState(false)
  const [restartRequired, setRestartRequired] = useState(false)
  const [connectionHints, setConnectionHints] = useState<ConnectionHint[]>([])
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [tab, setTab] = useState('keys')
  const [ossView, setOssView] = useState<OssSettingsView | null>(null)
  // 官网 / 安装包地址的「生效结果」由服务端算（含 OSS 推导与本站文件探测），
  // 这里只负责展示，不在前端重算一遍。
  const [siteLinks, setSiteLinks] = useState<SiteLinksView | null>(null)
  // 只跟踪「用户有没有动过」这两个密钥框。没动过就不参与保存 —— 否则空串会把已存的
  // 真 key 清掉，而脱敏串回写又会把它变成星号（两种都是静默自毁）。
  const [ossSecretsEdited, setOssSecretsEdited] = useState<Record<OssSecretField, boolean>>({
    accessKeyId: false,
    accessKeySecret: false,
  })
  const activeSettingsSection = useAppStore((s) => s.activeSettingsSection)
  const [form, setForm] = useState<SettingsForm>({
    anthropicBaseUrl: '',
    defaultLlmProvider: 'auto',
    companionMode: 'off',
    mobileDeviceToken: '',
    deploymentPublishEnabled: false,
    deploymentPublishDir: '',
    deploymentPublicBaseUrl: '',
    notificationTaskEnabled: true,
    notificationErrorEnabled: true,
    notificationSystemEnabled: true,
    notificationConfigurationEnabled: true,
    notificationToastEnabled: true,
    notificationNativeEnabled: true,
    notificationUrgentEnabled: true,
    experienceExtractionEnabled: true,
    ossBucket: '',
    ossEndpoint: '',
    ossAccessKeyId: '',
    ossAccessKeySecret: '',
    ossPublicRead: true,
    officialWebsiteUrl: '',
    desktopDownloadUrl: '',
  })

  useEffect(() => {
    if (!open) return
    if (activeSettingsSection === 'notifications') setTab('notifications')
    else if (activeSettingsSection === 'oss') setTab('oss')
    else if (activeSettingsSection === 'site') setTab('site')
    else if (activeSettingsSection === 'api-keys' || activeSettingsSection === 'providers') setTab('keys')
  }, [activeSettingsSection, open])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    void Promise.resolve()
      .then(() => {
        if (!cancelled) {
          setRestartRequired(false)
          setLoading(true)
        }
        return fetchAppSettings()
      })
      .then((s) => {
        if (!cancelled) setForm(rowToForm(s))
      })
      .catch((err) => console.error('[SettingsDialog] load failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  // OSS 状态与主设置分开取：它需要服务端「算出来」的生效来源（本页配置 / 系统环境变量），
  // 不是 app_settings 一行的原始字段。
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setOssView(null)
    setOssSecretsEdited({ accessKeyId: false, accessKeySecret: false })
    void fetchOssSettings()
      .then((view) => {
        if (!cancelled) setOssView(view)
      })
      .catch((err) => console.error('[SettingsDialog] load oss settings failed', err))
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void fetchSiteLinks()
      .then((links) => {
        if (!cancelled) setSiteLinks(links)
      })
      .catch((err) => console.error('[SettingsDialog] load site links failed', err))
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    void Promise.resolve()
      .then(() => {
        if (!cancelled) setHintsLoading(true)
        return fetchConnectionHints()
      })
      .then((hints) => {
        if (!cancelled) setConnectionHints(hints)
      })
      .catch((err) => console.error('[SettingsDialog] load connection hints failed', err))
      .finally(() => {
        if (!cancelled) setHintsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  const handleSave = async () => {
    if (busy) return
    setBusy(true)
    try {
      // 空串归一 null，明确「清空」语义
      const patch: AppSettingsPatchBody = {
        anthropicBaseUrl: form.anthropicBaseUrl.trim() || null,
        defaultLlmProvider: form.defaultLlmProvider,
        companionMode: form.companionMode,
        deploymentPublishEnabled: form.deploymentPublishEnabled,
        deploymentPublishDir: form.deploymentPublishDir.trim() || null,
        deploymentPublicBaseUrl: form.deploymentPublicBaseUrl.trim() || null,
        notificationTaskEnabled: form.notificationTaskEnabled,
        notificationErrorEnabled: form.notificationErrorEnabled,
        notificationSystemEnabled: form.notificationSystemEnabled,
        notificationConfigurationEnabled: form.notificationConfigurationEnabled,
        notificationToastEnabled: form.notificationToastEnabled,
        notificationNativeEnabled: form.notificationNativeEnabled,
        notificationUrgentEnabled: form.notificationUrgentEnabled,
        experienceExtractionEnabled: form.experienceExtractionEnabled,
        // ─── 阿里云 OSS ───
        // bucket / endpoint 可回填，空串即「清空」。
        ossBucket: form.ossBucket.trim() || null,
        ossEndpoint: form.ossEndpoint.trim() || null,
        // 两个 AccessKey **只在用户动过时才带上键**。没动过还带空串，等于把库里已存的值清掉；
        // 带脱敏串更糟 —— 服务端 `dropMaskedSecretWrites` 会拦下，但那样就白改一场。
        ...(ossSecretsEdited.accessKeyId
          ? { ossAccessKeyId: form.ossAccessKeyId.trim() || null }
          : {}),
        ...(ossSecretsEdited.accessKeySecret
          ? { ossAccessKeySecret: form.ossAccessKeySecret.trim() || null }
          : {}),
        ossPublicRead: form.ossPublicRead,
        // ─── 官网 ───
        officialWebsiteUrl: form.officialWebsiteUrl.trim() || null,
        desktopDownloadUrl: form.desktopDownloadUrl.trim() || null,
      }

      // 密钥字段一律不在这里写：provider key 归「供应商中心」，
      // mobileDeviceToken 由 handleEnableCompanion / handleRegenerateToken 单独负责。
      await updateAppSettings(patch)

      if (tab === 'oss') {
        // 停在「对象存储」页并立刻刷新状态：这一页的价值就在于「改完能看见已启用」，
        // 顺手关掉弹窗等于把唯一的反馈也一并关掉。
        setOssSecretsEdited({ accessKeyId: false, accessKeySecret: false })
        // 保存成功后清空两个密钥输入框：它们只承载「本次新输入」。
        // 留着（以点号显示的）明文会与下方「已保存 ····abcd，留空保持不变」自相矛盾 ——
        // 用户会以为「我框里明明有值，为什么说留空」，也会怀疑到底提交了没有。
        setForm((prev) => ({ ...prev, ossAccessKeyId: '', ossAccessKeySecret: '' }))
        setOssView(await fetchOssSettings())
      } else {
        onOpenChange(false)
      }
    } catch (err) {
      console.error('[SettingsDialog] save failed', err)
    } finally {
      setBusy(false)
    }
  }

  const handleCopyHint = async (hint: ConnectionHint) => {
    try {
      await navigator.clipboard.writeText(hint.url)
      setCopiedUrl(hint.url)
      window.setTimeout(() => setCopiedUrl(null), 1200)
    } catch (err) {
      console.error('[SettingsDialog] copy connection hint failed', err)
    }
  }

  const handleCopyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedUrl(value)
      window.setTimeout(() => setCopiedUrl(null), 1200)
    } catch (err) {
      console.error('[SettingsDialog] copy text failed', err)
    }
  }

  const handleEnableCompanion = async () => {
    if (busy) return
    setBusy(true)
    try {
      const next = await updateAppSettings({
        companionMode: 'tailnet',
        mobileDeviceToken: form.mobileDeviceToken.trim() || null,
      })
      setForm(rowToForm(next))
      setConnectionHints(await fetchConnectionHints())
      setRestartRequired(true)
    } catch (err) {
      console.error('[SettingsDialog] enable companion failed', err)
    } finally {
      setBusy(false)
    }
  }

  const handleDisableCompanion = async () => {
    if (busy) return
    setBusy(true)
    try {
      const next = await updateAppSettings({ companionMode: 'off' })
      setForm(rowToForm(next))
      setConnectionHints(await fetchConnectionHints())
      setRestartRequired(true)
    } catch (err) {
      console.error('[SettingsDialog] disable companion failed', err)
    } finally {
      setBusy(false)
    }
  }

  const handleRegenerateToken = async () => {
    if (tokenBusy) return
    setTokenBusy(true)
    try {
      const next = await regenerateMobileDeviceToken()
      setForm(rowToForm(next))
    } catch (err) {
      console.error('[SettingsDialog] regenerate mobile token failed', err)
    } finally {
      setTokenBusy(false)
    }
  }

  /** `OssPanel` 用 `oss*` 前缀外的短字段名，这里做一次映射，避免把两套命名混进表单。 */
  const handleOssChange = (patch: Partial<OssFormValues>) => {
    setForm((f) => ({
      ...f,
      ...(patch.bucket !== undefined ? { ossBucket: patch.bucket } : {}),
      ...(patch.endpoint !== undefined ? { ossEndpoint: patch.endpoint } : {}),
      ...(patch.accessKeyId !== undefined ? { ossAccessKeyId: patch.accessKeyId } : {}),
      ...(patch.accessKeySecret !== undefined ? { ossAccessKeySecret: patch.accessKeySecret } : {}),
      ...(patch.publicRead !== undefined ? { ossPublicRead: patch.publicRead } : {}),
    }))
  }

  const handleOssSecretEdited = (field: OssSecretField) => {
    setOssSecretsEdited((prev) => (prev[field] ? prev : { ...prev, [field]: true }))
  }

  /** 与 `handleOssChange` 同理：`SitePanel` 用短字段名，这里映射一次。 */
  const handleSiteChange = (patch: Partial<SiteFormValues>) => {
    setForm((f) => ({ ...f, ...patch }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        ❗ 尺寸必须**写死**，不能让它跟着内容长。
        原先是 `grid-rows-[auto_minmax(0,1fr)_auto]` + 高度自适应：每个 Tab 的内容高度不同，
        于是每切一次导航，弹窗就当着用户的面「跳」一下 —— 窗口一缩放，视觉焦点跟着跑，
        看着像页面在抽搐。中间行本来就是 `minmax(0,1fr)` + 内层 `overflow-y-auto`，
        给外层一个确定高度后，内容多的一页只会内部滚动，弹窗外框纹丝不动。
        高度取 `min(44rem, 100vh-2rem)`：够放下最长的「模型与分配」，又永远不超出视口。
      */}
      <DialogContent className="grid h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden sm:h-[min(44rem,calc(100vh-2rem))] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription className="sr-only">{BRAND_NAME} 设置</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-0 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList className="h-auto max-w-full flex-wrap justify-start overflow-x-auto">
                <TabsTrigger value="keys">
                  <KeyRound className="size-3.5" />
                  供应商
                </TabsTrigger>
                <TabsTrigger value="oss">
                  <CloudUpload className="size-3.5" />
                  对象存储
                </TabsTrigger>
                <TabsTrigger value="assignment">
                  <Layers className="size-3.5" />
                  模型与分配
                </TabsTrigger>
                <TabsTrigger value="failover">
                  <ShieldCheck className="size-3.5" />
                  故障转移
                </TabsTrigger>
                <TabsTrigger value="mobile">
                  <Smartphone className="size-3.5" />
                  移动端
                </TabsTrigger>
                <TabsTrigger value="publish">
                  <FolderUp className="size-3.5" />
                  发布
                </TabsTrigger>
                <TabsTrigger value="site">
                  <Globe className="size-3.5" />
                  官网
                </TabsTrigger>
                <TabsTrigger value="notifications">
                  <Bell className="size-3.5" />
                  通知
                </TabsTrigger>
              </TabsList>
              {tab === 'keys' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                      aria-label="供应商 Key 说明"
                    >
                      <Info className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end" className="max-w-72 whitespace-normal text-left leading-5">
                      填写常用供应商的 API Key。填写后将覆盖系统环境变量；留空则继续使用环境变量（如有）。
                      Agent 设置中单独配置的 Key 仍然优先级最高。
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            <div className="min-h-0 min-w-0 overflow-y-auto pr-1">
              <TabsContent value="keys" className="mt-0 py-1">
                <div className="flex flex-col gap-4">
                  <ProvidersPanel />
                  <div className="border-t border-slate-200 pt-4 dark:border-white/10">
                    <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">供应商优先级</div>
                    <ProviderPriorityPanel />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="oss" className="mt-0 py-1">
                <OssPanel
                  values={{
                    bucket: form.ossBucket,
                    endpoint: form.ossEndpoint,
                    accessKeyId: form.ossAccessKeyId,
                    accessKeySecret: form.ossAccessKeySecret,
                    publicRead: form.ossPublicRead,
                  }}
                  view={ossView}
                  secretsEdited={ossSecretsEdited}
                  onChange={handleOssChange}
                  onSecretEdited={handleOssSecretEdited}
                />
              </TabsContent>

              <TabsContent value="assignment" className="mt-0 py-1">
                <ModelAssignmentPanel />
              </TabsContent>

              <TabsContent value="failover" className="mt-0 py-1">
                <FailoverPanel />
              </TabsContent>

              <TabsContent value="mobile" className="mt-0 py-1">
                <MobileConnectionHints
                  hints={connectionHints}
                  loading={hintsLoading}
                  copiedUrl={copiedUrl}
                  companionMode={form.companionMode}
                  mobileDeviceToken={form.mobileDeviceToken}
                  busy={busy}
                  tokenBusy={tokenBusy}
                  restartRequired={restartRequired}
                  onCopy={(hint) => void handleCopyHint(hint)}
                  onCopyText={(value) => void handleCopyText(value)}
                  onEnable={() => void handleEnableCompanion()}
                  onDisable={() => void handleDisableCompanion()}
                  onRegenerateToken={() => void handleRegenerateToken()}
                />
              </TabsContent>

              <TabsContent value="publish" className="mt-0 py-1">
                <DeploymentPublishSettings
                  enabled={form.deploymentPublishEnabled}
                  publishDir={form.deploymentPublishDir}
                  publicBaseUrl={form.deploymentPublicBaseUrl}
                  onEnabledChange={(deploymentPublishEnabled) =>
                    setForm((f) => ({ ...f, deploymentPublishEnabled }))
                  }
                  onPublishDirChange={(deploymentPublishDir) =>
                    setForm((f) => ({ ...f, deploymentPublishDir }))
                  }
                  onPublicBaseUrlChange={(deploymentPublicBaseUrl) =>
                    setForm((f) => ({ ...f, deploymentPublicBaseUrl }))
                  }
                />
              </TabsContent>

              <TabsContent value="site" className="mt-0 py-1">
                <SitePanel
                  values={{
                    officialWebsiteUrl: form.officialWebsiteUrl,
                    desktopDownloadUrl: form.desktopDownloadUrl,
                  }}
                  links={siteLinks}
                  onChange={handleSiteChange}
                />
              </TabsContent>

              <TabsContent value="notifications" className="mt-0 py-1">
                <div className="flex flex-col gap-4">
                  <section className="rounded-xl border bg-muted/30 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <BookOpen className="size-4 text-muted-foreground" />
                      <div>
                        <h3 className="text-sm font-medium">经验资产</h3>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">run 收尾后自动反思沉淀可复用经验；关闭后仍可手动沉淀。</p>
                      </div>
                    </div>
                    <div className="rounded-md border bg-background p-2">
                      <CheckboxRow label="自动反思沉淀经验" checked={form.experienceExtractionEnabled} onChange={(experienceExtractionEnabled) => setForm((f) => ({ ...f, experienceExtractionEnabled }))} />
                    </div>
                  </section>
                <NotificationPreferenceSettings
                  form={form}
                  onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                />
                </div>
              </TabsContent>
            </div>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={busy || loading}>
            {busy ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MobileConnectionHints({
  hints,
  loading,
  copiedUrl,
  companionMode,
  mobileDeviceToken,
  busy,
  tokenBusy,
  restartRequired,
  onCopy,
  onCopyText,
  onEnable,
  onDisable,
  onRegenerateToken,
}: {
  hints: ConnectionHint[]
  loading: boolean
  copiedUrl: string | null
  companionMode: 'off' | 'lan' | 'tailnet'
  mobileDeviceToken: string
  busy: boolean
  tokenBusy: boolean
  restartRequired: boolean
  onCopy: (hint: ConnectionHint) => void
  onCopyText: (value: string) => void
  onEnable: () => void
  onDisable: () => void
  onRegenerateToken: () => void
}) {
  const enabled = companionMode !== 'off'

  return (
    <section className="rounded-xl border bg-muted/30 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smartphone className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">移动端连接</h3>
        </div>
        <Button
          type="button"
          size="sm"
          variant={enabled ? 'outline' : 'default'}
          disabled={busy}
          onClick={enabled ? onDisable : onEnable}
        >
          <Power className="size-3.5" />
          {enabled ? '关闭' : '开启'}
        </Button>
      </div>

      {loading ? (
        <div className="flex h-16 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {restartRequired && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 flex-none" />
              <div className="min-w-0">
                <p className="text-xs font-semibold">请重启桌面端 App</p>
                <p className="mt-1 text-[11px] leading-4">
                  开启或关闭移动端连接后，监听地址需要重启后才会生效。
                </p>
              </div>
            </div>
          )}

          <div className="rounded-md border bg-background px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <KeyRound className="size-4 flex-none text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">{enabled ? '已开启' : '未开启'}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {enabled ? '重启桌面端后生效' : '开启后生成设备 token'}
                  </p>
                </div>
              </div>
              {mobileDeviceToken && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="复制设备 token"
                  title="复制 token"
                  onClick={() => onCopyText(mobileDeviceToken)}
                >
                  {copiedUrl === mobileDeviceToken ? (
                    <Check className="size-4" />
                  ) : (
                    <Clipboard className="size-4" />
                  )}
                </Button>
              )}
            </div>
            {mobileDeviceToken && (
              <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                {mobileDeviceToken}
              </p>
            )}
          </div>

          {enabled && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={tokenBusy}
              onClick={onRegenerateToken}
            >
              {tokenBusy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
              重新生成 token
            </Button>
          )}

          {hints.map((hint) => (
            <div
              key={hint.url}
              className="flex items-center gap-2 rounded-md border bg-background px-2 py-2"
            >
              {hintIcon(hint.kind)}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{hint.label}</span>
                  {hint.interfaceName && (
                    <span className="text-[10px] text-muted-foreground">{hint.interfaceName}</span>
                  )}
                </div>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{hint.url}</p>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`复制 ${hint.label} 地址`}
                title="复制"
                onClick={() => onCopy(hint)}
              >
                {copiedUrl === hint.url ? <Check className="size-4" /> : <Clipboard className="size-4" />}
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function DeploymentPublishSettings({
  enabled,
  publishDir,
  publicBaseUrl,
  onEnabledChange,
  onPublishDirChange,
  onPublicBaseUrlChange,
}: {
  enabled: boolean
  publishDir: string
  publicBaseUrl: string
  onEnabledChange: (enabled: boolean) => void
  onPublishDirChange: (value: string) => void
  onPublicBaseUrlChange: (value: string) => void
}) {
  return (
    <section className="rounded-xl border bg-muted/30 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FolderUp className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">外部静态发布</h3>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.currentTarget.checked)}
            className="size-4 rounded border-input accent-primary"
          />
          启用
        </label>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium">发布目录</label>
          <Input
            value={publishDir}
            onChange={(event) => onPublishDirChange(event.target.value)}
            placeholder="D:\\sites\\agenthub"
          />
          <p className="text-[11px] leading-4 text-muted-foreground">
            {BRAND_NAME} 会写入该目录下的 dep_xxx 子目录。
          </p>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium">公开根 URL</label>
          <Input
            value={publicBaseUrl}
            onChange={(event) => onPublicBaseUrlChange(event.target.value)}
            placeholder="https://example.com/apps"
          />
          <p className="text-[11px] leading-4 text-muted-foreground">
            部署卡片会返回公开根 URL 加 deployment id 的地址。
          </p>
        </div>
      </div>
    </section>
  )
}

function NotificationPreferenceSettings({
  form,
  onChange,
}: {
  form: SettingsForm
  onChange: (patch: Partial<SettingsForm>) => void
}) {
  return (
    <section className="rounded-xl border bg-muted/30 p-3">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="size-4 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-medium">通知偏好</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">关闭分类后仍会进入信息中心，但不会弹 Toast 或系统通知。</p>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="rounded-md border bg-background p-2">
          <p className="mb-2 text-xs font-medium">通知分类</p>
          <div className="grid gap-2">
            <CheckboxRow label="任务通知" checked={form.notificationTaskEnabled} onChange={(notificationTaskEnabled) => onChange({ notificationTaskEnabled })} />
            <CheckboxRow label="异常告警" checked={form.notificationErrorEnabled} onChange={(notificationErrorEnabled) => onChange({ notificationErrorEnabled })} />
            <CheckboxRow label="系统消息" checked={form.notificationSystemEnabled} onChange={(notificationSystemEnabled) => onChange({ notificationSystemEnabled })} />
            <CheckboxRow label="配置提醒" checked={form.notificationConfigurationEnabled} onChange={(notificationConfigurationEnabled) => onChange({ notificationConfigurationEnabled })} />
          </div>
        </div>

        <div className="rounded-md border bg-background p-2">
          <p className="mb-2 text-xs font-medium">展示方式</p>
          <div className="grid gap-2">
            <CheckboxRow label="应用内 Toast" checked={form.notificationToastEnabled} onChange={(notificationToastEnabled) => onChange({ notificationToastEnabled })} />
            <CheckboxRow label="系统通知" checked={form.notificationNativeEnabled} onChange={(notificationNativeEnabled) => onChange({ notificationNativeEnabled })} />
            <CheckboxRow label="紧急提醒" checked={form.notificationUrgentEnabled} onChange={(notificationUrgentEnabled) => onChange({ notificationUrgentEnabled })} />
          </div>
        </div>
      </div>
    </section>
  )
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="size-4 rounded border-input accent-primary"
      />
    </label>
  )
}

function hintIcon(kind: ConnectionHint['kind']) {
  switch (kind) {
    case 'tailscale':
    case 'lan':
      return <Network className="size-4 flex-none text-muted-foreground" />
    case 'local':
      return <Monitor className="size-4 flex-none text-muted-foreground" />
  }
}

/** 设置 button 入口，挂在 Sidebar header。 */
export function SettingsButton() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    return subscribeUiCommand((command) => {
      if (command === 'open-settings') setOpen(true)
    })
  }, [])

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="group"
        onClick={() => setOpen(true)}
        title="API 设置"
        aria-label="API 设置"
      >
        <SettingsIcon className="size-4 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:rotate-45 motion-safe:group-active:scale-90" />
      </Button>
      <SettingsDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function rowToForm(row: AppSettingsRow): SettingsForm {
  return {
    anthropicBaseUrl: row.anthropicBaseUrl ?? '',
    defaultLlmProvider: (row.defaultLlmProvider as SettingsForm['defaultLlmProvider']) ?? 'auto',
    companionMode: row.companionMode,
    mobileDeviceToken: row.mobileDeviceToken ?? '',
    deploymentPublishEnabled: row.deploymentPublishEnabled,
    deploymentPublishDir: row.deploymentPublishDir ?? '',
    deploymentPublicBaseUrl: row.deploymentPublicBaseUrl ?? '',
    notificationTaskEnabled: row.notificationTaskEnabled,
    notificationErrorEnabled: row.notificationErrorEnabled,
    notificationSystemEnabled: row.notificationSystemEnabled,
    notificationConfigurationEnabled: row.notificationConfigurationEnabled,
    notificationToastEnabled: row.notificationToastEnabled,
    notificationNativeEnabled: row.notificationNativeEnabled,
    notificationUrgentEnabled: row.notificationUrgentEnabled,
    experienceExtractionEnabled: row.experienceExtractionEnabled,
    ossBucket: row.ossBucket ?? '',
    ossEndpoint: row.ossEndpoint ?? '',
    // ❗ 密钥恒为空串，不回填脱敏值 —— 回填后再点保存就把真 key 写成 `********abcd` 了。
    ossAccessKeyId: '',
    ossAccessKeySecret: '',
    ossPublicRead: row.ossPublicRead,
    officialWebsiteUrl: row.officialWebsiteUrl ?? '',
    desktopDownloadUrl: row.desktopDownloadUrl ?? '',
  }
}
