'use client'

import { useRef, useEffect, useCallback } from 'react'
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Undo, Redo } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  readOnly?: boolean
  className?: string
  minHeight?: number
}

const TOOLS: { icon: typeof Bold; cmd: string; label: string; arg?: string }[] = [
  { icon: Bold, cmd: 'bold', label: '加粗' },
  { icon: Italic, cmd: 'italic', label: '斜体' },
  { icon: Underline, cmd: 'underline', label: '下划线' },
  { icon: Strikethrough, cmd: 'strikeThrough', label: '删除线' },
  { icon: ListOrdered, cmd: 'insertOrderedList', label: '有序列表' },
  { icon: List, cmd: 'insertUnorderedList', label: '无序列表' },
  { icon: AlignLeft, cmd: 'justifyLeft', label: '左对齐' },
  { icon: AlignCenter, cmd: 'justifyCenter', label: '居中' },
  { icon: AlignRight, cmd: 'justifyRight', label: '右对齐' },
  { icon: Undo, cmd: 'undo', label: '撤销' },
  { icon: Redo, cmd: 'redo', label: '重做' },
]

export function RichTextEditor({
  value,
  onChange,
  placeholder = '请输入内容…',
  readOnly = false,
  className,
  minHeight = 200,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastValueRef = useRef(value)

  // contentEditable 的内容不受 React 管控，初始值必须由这里显式写进 DOM。
  // 不能再用「value 变了才同步」那道门槛：lastValueRef 的初值就是 value，
  // 挂载时判断恒为假 → 编辑已有经验时编辑框永远是空的（线上 bug）。
  // 仍然只在 innerHTML 与目标值确实不同时写，避免每次敲键重置光标。
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (value !== el.innerHTML) el.innerHTML = value || ''
    lastValueRef.current = value
  }, [value])

  const exec = useCallback((cmd: string, arg?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, arg)
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      lastValueRef.current = html
      onChange(html)
    }
  }, [onChange])

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      lastValueRef.current = html
      onChange(html)
    }
  }, [onChange])

  const isEmpty = !value || value === '<br>' || value === '<p><br></p>'

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-md border', className)}>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1.5">
          {TOOLS.map((tool) => {
            const Icon = tool.icon
            return (
              <button
                key={tool.cmd}
                type="button"
                title={tool.label}
                onMouseDown={(e) => {
                  e.preventDefault()
                  exec(tool.cmd, tool.arg)
                }}
                className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon className="size-3.5" />
              </button>
            )
          })}
        </div>
      )}
      <div className="relative">
        {isEmpty && !readOnly && (
          <div className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground/60">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          onInput={handleInput}
          className="prose prose-sm max-w-none px-3 py-2.5 text-sm leading-relaxed focus:outline-none [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
          style={{ minHeight }}
        />
      </div>
    </div>
  )
}
