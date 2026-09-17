/**
 * 消息 payload 的瘦身投影 —— 给「只拿消息做预览、不需要正文」的消费方用。
 *
 * 为什么需要：run-board（会话级调试图）打开时会循环拉**整段会话历史**（200 条/页），
 * 而它只用到消息的 id / role / status / createdAt，外加 `parts` 里的 text 片段做一行卡片预览。
 * 线上实测单个会话 653 条消息的 parts 合计 **3.6MB**，构成是：
 *
 *   tool_result.result   2,160,258 B  (55%)  工具输出全文
 *   tool_use.args          699,084 B  (18%)  工具入参全文
 *   thinking.content       522,052 B  (13%)  思维链全文
 *   text.content            99,531 B  (2.6%) 唯一真正被用来做预览的部分
 *
 * 也就是 **96% 的字节对消费方毫无用处**。gzip 之后每个 200 条分页仍要 152–429KB，
 * 一次打开要发 4 个分页请求。
 *
 * 投影策略的关键约束：**不改类型、不改 `parts.length`、不改 `type` 序列**。
 * 于是下游任何「按 part.type 分支」「用 parts.length 兜底」的代码都不用动 ——
 * 包括 `summarizeMessagePreview()`（它正好读 text/code 的 content，并把 parts.length 当兜底文案）。
 *
 *   - text / code  → 保留 content，按 SLIM_TEXT_LIMIT 截断（卡片只用来渲染一行标题）
 *   - thinking     → 保留 type，content 置空字符串
 *   - tool_use     → 保留 callId / toolName（下游按 callId 关联工具调用），args 置 null
 *   - tool_result  → 保留 callId / isError（关联 + 失败标红），result 置 null
 *   - 其余（artifact_ref / deploy_status / 附件）体积很小，原样保留
 *
 * `MessagePart` 里 `args` 与 `result` 声明为 `unknown`，置 null 天然合法 ——
 * 既不需要类型断言，也不需要动 `src/shared/types.ts` 的联合类型。
 */
import type { MessageRow } from '@/db/schema'
import type { MessagePart } from '@/shared/types'

/**
 * text / code 片段的保留长度。
 *
 * 消费方是 `summarizeMessagePreview()` → `summarizeRunDisplayTitle()`，最终只渲染一行标题，
 * 所以几百字符远够用。240 与线上实测的截断口径一致。
 */
export const SLIM_TEXT_LIMIT = 240

/** 截断并留下可见的省略号标记（不静默改内容长度）。 */
function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`
}

/** 把一条消息的 parts 投影成「保结构、去正文」的轻量形态。 */
export function slimMessageParts(parts: MessagePart[]): MessagePart[] {
  return parts.map((part): MessagePart => {
    switch (part.type) {
      case 'text':
        return { type: 'text', content: truncate(part.content, SLIM_TEXT_LIMIT) }
      case 'code':
        return { type: 'code', language: part.language, content: truncate(part.content, SLIM_TEXT_LIMIT) }
      case 'thinking':
        return { type: 'thinking', content: '' }
      case 'tool_use':
        return { type: 'tool_use', callId: part.callId, toolName: part.toolName, args: null }
      case 'tool_result':
        return { type: 'tool_result', callId: part.callId, result: null, isError: part.isError }
      default:
        // artifact_ref / deploy_status / deploy_candidates / 附件：体积可忽略，保持原样
        return part
    }
  })
}

/** 投影整条消息（除 parts 外的字段原样保留，含 usage —— 它只有几百字节）。 */
export function slimMessage(row: MessageRow): MessageRow {
  return { ...row, parts: slimMessageParts(row.parts) }
}

/**
 * 解析 `?slim=` 查询参数。
 *
 * 刻意不用 `z.coerce.boolean()` —— 它把 `'0'`、`'false'` 都判成 `true`，
 * 等于给「显式要求完整数据」的调用方一个静默的反向结果。这里只认 `'1'` / `'true'`。
 */
export function parseSlimFlag(value: string | null | undefined): boolean {
  return value === '1' || value === 'true'
}

/**
 * 从「已加载的消息」里挑出还没见过的，也就是**可以安全写入 store 的那部分**。
 *
 * ⚠️ 为什么必须有这一步：store 的 `messages` 是按 id 归一化的**共享**结构，
 * 而 `setMessagesForConversation` 内部的 `areMessagesEquivalent()` 会连 `parts` 一起比，
 * 于是「谁后写谁赢」。slim 是**降级**数据 —— 无条件写进去会把 message-list 已加载的
 * 完整消息覆盖成 `result: null`，界面上工具输出直接变空白。
 *
 * 因此约定：**slim 数据只用于「补齐尚未加载的消息」，绝不覆盖已有条目**。
 * 留空给完整数据的写入路径（message-list 的分页 / SSE upsert），它们的方向天然正确：
 * 完整版写同一条 id 时 `areMessagesEquivalent` 判定不等 → 完整版胜出。
 *
 * 保持纯函数是为了能直接回归测试这条不变量（项目里没有组件测试基建）。
 */
export function selectUnloadedMessages(
  stored: Record<string, MessageRow>,
  incoming: MessageRow[],
): MessageRow[] {
  return incoming.filter((message) => !stored[message.id])
}
