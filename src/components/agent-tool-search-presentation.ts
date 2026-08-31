import type { AgentRow } from '@/db/schema'
import type { ToolSearchResult } from '@/lib/api'

export type ToolSearchBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export type ToolSearchPresentation = {
  compatible: boolean
  bound: boolean
  compatibilityLabel: string
  compatibilityTone: ToolSearchBadgeTone
  completenessLabel: string
  completenessTone: ToolSearchBadgeTone
  riskLabel: string
  riskTone: ToolSearchBadgeTone
}

export function presentToolSearchResult(result: ToolSearchResult, target: AgentRow | undefined): ToolSearchPresentation {
  const compatible = target ? result.compatibility[target.adapterName] === 'supported' : false
  const boundIds = result.type === 'skill' ? target?.skillIds : target?.mcpServerIds
  const bound = Boolean(boundIds?.includes(result.id))
  const hasInstallContent = Boolean(result.installUrl)
  const hasManifest = Boolean(result.manifestUrl)

  return {
    compatible,
    bound,
    compatibilityLabel: target
      ? `${compatible ? '兼容' : '不兼容'} ${target.adapterName}`
      : '未选择 Agent',
    compatibilityTone: target ? (compatible ? 'success' : 'danger') : 'neutral',
    completenessLabel: result.type === 'mcp_server'
      ? hasManifest ? 'Manifest 完整' : '缺少 Manifest'
      : hasInstallContent && hasManifest ? '内容完整' : hasInstallContent ? '可导入内容' : '仅元数据',
    completenessTone: result.type === 'mcp_server'
      ? hasManifest ? 'success' : 'danger'
      : hasInstallContent && hasManifest ? 'success' : hasInstallContent ? 'info' : 'warning',
    riskLabel: result.type === 'mcp_server' ? '本机进程' : '提示词规则',
    riskTone: result.type === 'mcp_server' ? 'warning' : 'info',
  }
}
