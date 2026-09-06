import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  Layers,
  MessageSquare,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

import type { AppWorkbenchView } from '@/stores/app-store'

export type WorkbenchNavigationItem = {
  id: AppWorkbenchView
  label: string
  icon: LucideIcon
  group: 'primary' | 'workspace'
  description: string
}

export const WORKBENCH_NAVIGATION: WorkbenchNavigationItem[] = [
  { id: 'conversations', label: '对话', icon: MessageSquare, group: 'primary', description: '与 Agent 协作并查看运行状态' },
  { id: 'information-center', label: '信息中心', icon: Bell, group: 'primary', description: '查看通知、审批和待处理事项' },
  { id: 'agents', label: 'Agent 库', icon: Bot, group: 'workspace', description: '管理 Agent、团队和运行配置' },
  { id: 'capability-center', label: '能力中心', icon: Boxes, group: 'workspace', description: '管理 Skills、MCP 和绑定关系' },
  { id: 'artifacts', label: '产物库', icon: Layers, group: 'workspace', description: '查看、编辑和导出生成产物' },
  { id: 'automation', label: '自动化', icon: Workflow, group: 'workspace', description: '配置计划任务和运行历史' },
  { id: 'run-board', label: '运行展板', icon: Activity, group: 'workspace', description: '调试单个 Run 的执行过程' },
  { id: 'analytics', label: '数据概览', icon: BarChart3, group: 'workspace', description: '查看所有 Run 的统计表现' },
]
