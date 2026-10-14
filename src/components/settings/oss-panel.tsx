'use client'

import { AlertTriangle, CheckCircle2, CloudUpload, Eye, EyeOff, Info } from 'lucide-react'
import { useState } from 'react'

import { Input } from '@/components/ui/input'
import type { OssSettingsView } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * 阿里云 OSS 配置面板（受控组件）。
 *
 * ❗ 为什么做成**受控**而不是像 `ProvidersPanel` 那样自带保存按钮：
 * 设置弹窗底部已经有一个「保存」，如果这一块自己再放一个，用户改完 OSS 直接点底部
 * 「保存」→ 弹窗关闭 → OSS 的改动**静默丢失**。所以字段状态与保存动作都交给
 * `SettingsDialog` 统一持有（见那边的 `form.oss*` 与 `handleSave`）。
 *
 * 两个 AccessKey 是**脱敏回显**的（`********abcd`）：输入框初始为空，用户不打字就
 * 不参与保存。是否「动过」由 `SettingsDialog` 的 dirty 标记跟踪 ——
 * 这是防止「把星号原样写回、真 key 被覆盖」的唯一可靠做法
 * （服务端 `dropMaskedSecretWrites` 只是兜底）。
 */

export interface OssFormValues {
  bucket: string
  endpoint: string
  accessKeyId: string
  accessKeySecret: string
  publicRead: boolean
}

export type OssSecretField = 'accessKeyId' | 'accessKeySecret'

export function OssPanel({
  values,
  view,
  secretsEdited,
  onChange,
  onSecretEdited,
}: {
  values: OssFormValues
  /** 服务端算出的运行时状态；null = 还没加载出来 */
  view: OssSettingsView | null
  /** 用户是否动过某个密钥输入框（动过才参与保存） */
  secretsEdited: Record<OssSecretField, boolean>
  onChange: (patch: Partial<OssFormValues>) => void
  onSecretEdited: (field: OssSecretField) => void
}) {
  const [revealSecret, setRevealSecret] = useState(false)
  const [revealKeyId, setRevealKeyId] = useState(false)

  const missing = missingFields(values, view, secretsEdited)
  const willRemainConfigured = missing.length === 0
  /**
   * 「本页没填齐，但运行时已经启用」——只可能来自环境变量兜底。
   *
   * 这时**不能**说「保存后 OSS 仍未启用」：DB 不齐时 `resolveOssConfig` 会整份退回
   * env，保存后照样是启用的。横幅说「已启用」而下面说「仍未启用」就自相矛盾了。
   */
  const coveredByEnv = !willRemainConfigured && Boolean(view?.configured)

  return (
    <div className="flex flex-col gap-4">
      <StatusBanner view={view} />

      <section className="rounded-xl border bg-muted/30 p-3">
        <div className="mb-3 flex items-center gap-2">
          <CloudUpload className="size-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-medium">图片产物远程存储</h3>
            <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
              配好后，Agent 生成的图片会直接上传到你的 bucket 并返回永久 URL；不配则回退本地目录。
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="oss-bucket">
              Bucket 名称
            </label>
            <Input
              id="oss-bucket"
              value={values.bucket}
              onChange={(event) => onChange({ bucket: event.target.value })}
              placeholder="my-teamflow-bucket"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="oss-endpoint">
              Endpoint
            </label>
            <Input
              id="oss-endpoint"
              value={values.endpoint}
              onChange={(event) => onChange({ endpoint: event.target.value })}
              placeholder="oss-cn-hangzhou.aliyuncs.com"
              autoComplete="off"
            />
            <p className="text-xs leading-4 text-muted-foreground">
              在 OSS 控制台「概览 → 访问域名」里找，形如 <code>oss-cn-&lt;地域&gt;.aliyuncs.com</code>。
            </p>
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="oss-access-key-id">
              AccessKey ID
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="oss-access-key-id"
                type={revealKeyId ? 'text' : 'password'}
                value={values.accessKeyId}
                onChange={(event) => {
                  onSecretEdited('accessKeyId')
                  onChange({ accessKeyId: event.target.value })
                }}
                placeholder={storedHint(view?.hasAccessKeyId, view?.accessKeyId, 'LTAI...')}
                autoComplete="off"
              />
              <RevealButton shown={revealKeyId} onToggle={() => setRevealKeyId((v) => !v)} />
            </div>
            <StoredHint
              stored={view?.hasAccessKeyId ?? false}
              masked={view?.accessKeyId}
              edited={secretsEdited.accessKeyId}
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="oss-access-key-secret">
              AccessKey Secret
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="oss-access-key-secret"
                type={revealSecret ? 'text' : 'password'}
                value={values.accessKeySecret}
                onChange={(event) => {
                  onSecretEdited('accessKeySecret')
                  onChange({ accessKeySecret: event.target.value })
                }}
                placeholder={storedHint(view?.hasAccessKeySecret, view?.accessKeySecret, '••••••••')}
                autoComplete="off"
              />
              <RevealButton shown={revealSecret} onToggle={() => setRevealSecret((v) => !v)} />
            </div>
            <StoredHint
              stored={view?.hasAccessKeySecret ?? false}
              masked={view?.accessKeySecret}
              edited={secretsEdited.accessKeySecret}
            />
          </div>

          <label className="mt-1 flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={values.publicRead}
              onChange={(event) => onChange({ publicRead: event.currentTarget.checked })}
              className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
            />
            <span>
              上传对象设为<strong className="font-medium text-foreground">公共读</strong>
              ，图片 URL 可被永久直连。
              <span className="mt-0.5 block text-xs leading-4">
                关闭后对象为私有，当前版本不支持签名预览，产物面板里的图会显示不出来。
              </span>
            </span>
          </label>
        </div>
      </section>

      {!willRemainConfigured && (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 flex-none" />
          <div className="min-w-0">
            {coveredByEnv ? (
              <>
                <p className="text-xs font-semibold">本页还差 {missing.join('、')}，保存后仍沿用环境变量配置</p>
                <p className="mt-1 text-xs leading-4">
                  当前生效的配置来自这台机器的系统环境变量（上面横幅已说明），所以 OSS 现在就是可用的。
                  只有四项在本页填齐，本页配置才会覆盖环境变量。
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold">还差 {missing.join('、')}，保存后 OSS 仍未启用</p>
                <p className="mt-1 text-xs leading-4">
                  四项必须全部填写才会启用。未启用时图片产物保存在本机，功能不受影响，只是不会上云。
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {values.publicRead && (
        <div className="flex gap-2 rounded-md border px-2 py-2">
          <Info className="mt-0.5 size-4 flex-none text-muted-foreground" />
          <p className="text-xs leading-4 text-muted-foreground">
            公共读意味着<b className="font-medium text-foreground">任何拿到 URL 的人都能访问该对象</b>。
            建议单独建一个只放图片产物的 bucket，不要与私有文件混用。
          </p>
        </div>
      )}
    </div>
  )
}

// ─── 子组件 ─────────────────────────────────────────────

function StatusBanner({ view }: { view: OssSettingsView | null }) {
  if (!view) {
    return (
      <div className="flex h-12 items-center justify-center rounded-xl border bg-muted/30">
        <span className="text-xs text-muted-foreground">正在读取对象存储状态…</span>
      </div>
    )
  }

  if (view.configured) {
    const fromEnv = view.source === 'environment'
    return (
      <div
        className={cn(
          'flex gap-2 rounded-md border px-2 py-2',
          'border-green-200 bg-green-50 text-green-900 dark:border-green-900/70 dark:bg-green-950/40 dark:text-green-200',
        )}
      >
        <CheckCircle2 className="mt-0.5 size-4 flex-none" />
        <div className="min-w-0">
          <p className="text-xs font-semibold">已启用，图片产物会上传到 OSS</p>
          <p className="mt-1 text-xs leading-4">
            {fromEnv
              ? '当前配置来自这台机器的系统环境变量（OSS_*）。想改请在下面填写 —— 本页填写后优先于环境变量。'
              : '当前配置来自本页，已生效。'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 flex-none" />
      <div className="min-w-0">
        <p className="text-xs font-semibold">未启用，图片产物将保存在本机</p>
        <p className="mt-1 text-xs leading-4">
          {view.envProvided
            ? '检测到这台机器设了 OSS_* 环境变量，但不完整（四项需齐全）。在下面补齐即可启用。'
            : '不配也能正常用，只是图片不会上云 —— 换机器或重装后拿不到旧图。要做对外演示建议配上。'}
        </p>
      </div>
    </div>
  )
}

function RevealButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? '隐藏' : '显示'}
      title={shown ? '隐藏' : '显示'}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  )
}

function StoredHint({
  stored,
  masked,
  edited,
}: {
  stored: boolean
  masked?: string
  edited: boolean
}) {
  if (edited) {
    return (
      <p className="text-xs leading-4 text-muted-foreground">
        保存后将替换已存的值；留空保存表示清除。
      </p>
    )
  }
  return (
    <p className="text-xs leading-4 text-muted-foreground">
      {stored ? (
        <>
          已保存 <code className="font-mono">{masked}</code>，留空保持不变。
        </>
      ) : (
        '尚未配置。'
      )}
    </p>
  )
}

// ─── 工具函数 ───────────────────────────────────────────

function storedHint(stored: boolean | undefined, masked: string | undefined, fallback: string) {
  return stored && masked ? masked : fallback
}

/**
 * 算出「还差哪几项」。
 *
 * 密钥的判定要看 dirty：没动过的密钥输入框是空的，但库里可能已经存了值
 * （受控组件不回填脱敏串），所以「空 + 未动过」要按「已存在」算。
 */
function missingFields(
  values: OssFormValues,
  view: OssSettingsView | null,
  secretsEdited: Record<OssSecretField, boolean>,
): string[] {
  const missing: string[] = []
  if (!values.bucket.trim()) missing.push('Bucket')
  if (!values.endpoint.trim()) missing.push('Endpoint')

  const keyIdPresent =
    values.accessKeyId.trim() !== '' || (!secretsEdited.accessKeyId && Boolean(view?.hasAccessKeyId))
  if (!keyIdPresent) missing.push('AccessKey ID')

  const secretPresent =
    values.accessKeySecret.trim() !== '' ||
    (!secretsEdited.accessKeySecret && Boolean(view?.hasAccessKeySecret))
  if (!secretPresent) missing.push('AccessKey Secret')

  return missing
}
