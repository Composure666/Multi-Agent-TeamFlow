import { eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'

export type WriteApprovalMode = 'auto' | 'review'

/**
 * 会话的写入审批模式（auto = 直写 / review = 写前弹审批）。
 *
 * 所有「会改变工作区或产物」的工具都从这里取口径 —— 别再各写一份
 * `conv?.fsWriteApprovalMode ?? 'review'`。历史上只有 fs_write 自己读了，
 * write_artifact / bash 都没读，于是 auto / review 开关在绝大多数场景空转
 * （内置 Agent 里只有「前端工程师」带 fs_write，其余都不受影响）。
 */
export async function getWriteApprovalMode(conversationId: string): Promise<WriteApprovalMode> {
  try {
    const conv = await db.query.conversations.findFirst({
      where: eq(schema.conversations.id, conversationId),
      columns: { fsWriteApprovalMode: true },
    })
    return conv?.fsWriteApprovalMode === 'auto' ? 'auto' : 'review'
  } catch (err) {
    // 读不到就按最保守的 review 处理，并暴露根因
    console.warn('[approval-mode] read failed; falling back to review', err)
    return 'review'
  }
}
