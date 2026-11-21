import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * E1（U-P1-7 失败反馈）+ F1（L-P2-1 队名截断）+ D1（U-P1-3 Agent 库 PageHeader 图标）的不变量锁。
 *
 * 与 sidebar-layout.test.ts 同一风格：vitest 跑在 node 环境、不渲染 JSX，
 * 直接对三个组件源码做文本断言。锁的是「失败时必须给用户可见反馈」
 * 这一行代码不能被悄悄删掉，不是运行时行为。
 */

const root = process.cwd()
const agentWorkspace = readFileSync(path.join(root, 'src/components/agent-workspace.tsx'), 'utf8')
const appWorkbench = readFileSync(path.join(root, 'src/components/app-workbench.tsx'), 'utf8')
const settingsDialog = readFileSync(path.join(root, 'src/components/settings-dialog.tsx'), 'utf8')

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

describe('E1 agent-workspace failure feedback', () => {
  it('startConversation / startTeamConversation / startTeamConversationById 失败时都写 agentFeedback', () => {
    expect(countOccurrences(agentWorkspace, "开始对话失败，请稍后重试。")).toBeGreaterThanOrEqual(2)
    expect(countOccurrences(agentWorkspace, "开始团队对话失败，请稍后重试。")).toBeGreaterThanOrEqual(2)
  })

  it('startConversation 与 startTeamConversationById 有进行中守卫（startingConversationId 防重）', () => {
    expect(countOccurrences(agentWorkspace, 'if (startingConversationId) return')).toBeGreaterThanOrEqual(2)
    expect(agentWorkspace).toContain('setStartingConversationId(`agent:${agent.id}`)')
    expect(agentWorkspace).toContain('setStartingConversationId(`team:${teamId}`)')
  })

  it('agentFeedback 横幅在 PageHeader 下方渲染（精选/我的两视图都可见）', () => {
    expect(agentWorkspace).toContain('{agentFeedback && (')
    expect(agentWorkspace).toContain("agentFeedback.type === 'success'")
  })

  it('D1 Agent 库 PageHeader 传 icon（复用已引入的 Bot）', () => {
    expect(agentWorkspace).toContain('icon={Bot}')
  })
})

describe('E1 app-workbench failure feedback', () => {
  it('召唤失败时写 summonError（异常与无可用 Agent 两条路）', () => {
    expect(appWorkbench).toContain("setSummonError('召唤团队失败，请稍后重试。')")
    expect(appWorkbench).toContain("setSummonError('该团队暂无可用 Agent，无法创建会话。')")
  })

  it('召唤错误在 TeamSummonDialog 内用 InlineError 展示', () => {
    expect(appWorkbench).toContain('<InlineError message={error} />')
  })

  it('会话列表置顶/归档/重命名/删除失败时都写 listError', () => {
    expect(appWorkbench).toContain("setListError('置顶失败，请稍后重试。')")
    expect(appWorkbench).toContain("setListError('归档失败，请稍后重试。')")
    expect(appWorkbench).toContain("setListError('重命名失败，请稍后重试。')")
    expect(appWorkbench).toContain("setListError('删除会话失败，请稍后重试。')")
  })

  it('列表错误在列表上方与删除确认弹窗内都用 InlineError 展示', () => {
    expect(countOccurrences(appWorkbench, '<InlineError message={listError} />')).toBeGreaterThanOrEqual(2)
  })

  it('F1 新建任务“最近团队”队名加 max-w-[72px] truncate', () => {
    expect(appWorkbench).toContain('max-w-[72px] truncate whitespace-nowrap')
  })
})

describe('E1 settings-dialog save failure feedback', () => {
  it('保存失败时写 saveError，页脚用 InlineError 展示并可重试', () => {
    expect(settingsDialog).toContain('setSaveError(err instanceof Error ? err.message : String(err))')
    expect(settingsDialog).toContain('保存失败：${saveError}')
    expect(settingsDialog).toContain('onRetry={() => void handleSave()}')
  })

  it('F3 长 URL 有 title 兜底（L-P2-5）', () => {
    expect(settingsDialog).toContain('title={hint.url}')
    // 设备 token 行不在 hints.map 作用域内，title 取自身值（提案字面 title={hint.url} 在此行无变量可用）
    expect(settingsDialog).toContain('title={mobileDeviceToken}')
  })
})

describe('F12 agent detail placeholder times (D-P2-9)', () => {
  it('无真实时间时时间列显示“—”，不再写状态词', () => {
    for (const word of ['time="刚刚"', 'time="预设"', 'time="可用"', 'time="已接入"']) {
      expect(agentWorkspace).not.toContain(word)
    }
    expect(countOccurrences(agentWorkspace, 'time="—"')).toBeGreaterThanOrEqual(4)
  })
})

describe('F14 app-workbench icon buttons (U-P2-5)', () => {
  it('图标按钮补 aria-label（title 保留）', () => {
    expect(appWorkbench).toContain('aria-label="打开菜单"')
    expect(appWorkbench).toContain('aria-label="设置"')
    expect(appWorkbench).toContain('aria-label="收起侧边栏"')
    expect(appWorkbench).toContain('aria-label="展开侧边栏"')
    expect(appWorkbench).toContain('aria-label="新建团队"')
  })
})

describe('D3 agent featured list header (U-P1-5)', () => {
  it('精选 Agent 列表头注明总数与加载方式', () => {
    expect(agentWorkspace).toContain('共 {filteredPresets.length} 个，滚动加载，每批 {FEATURED_AGENT_PAGE_SIZE} 条')
  })
})
