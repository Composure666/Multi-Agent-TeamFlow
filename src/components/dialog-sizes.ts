/**
 * 对话框尺寸三档（frontend-polish Phase 5A）。
 *
 * 全站对话框只用这三档，不再各处手写 max-w：
 * - sm：确认 / 选择类小弹窗（删除确认、统一创建、斜杠命令帮助）
 * - md：标准内容弹窗（新建对话、目录选择、添加 Agent、文件库、Agent 创建、提问）
 * - lg：大工作区弹窗（设置、用户指南、团队创建/详情、工具搜索、提示词优化）
 *
 * 用在 `DialogContent` 的 className 里；`cn`（tailwind-merge）会让它覆盖
 * `ui/dialog` 默认的 `sm:max-w-sm`。
 */
export const DIALOG_SIZE_CLASS = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-4xl',
} as const

export type DialogSize = keyof typeof DIALOG_SIZE_CLASS
