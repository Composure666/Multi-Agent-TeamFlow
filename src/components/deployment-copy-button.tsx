'use client'

import { Check, Link2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

/** 复制部署预览链接（绝对地址）到剪贴板，带“已复制”反馈。 */
export function DeploymentCopyButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        const url = new URL(path, window.location.href).toString()
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
      {copied ? '已复制' : '复制链接'}
    </Button>
  )
}
