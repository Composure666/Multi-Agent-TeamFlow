/**
 * 「AI 提示词增强」的请求/响应契约(前后端共用)。
 *
 * 设计要点:`prompt` 永远是**用户原始输入**,背景信息一律走 `context`。
 * 这样服务端有两处收益:
 *  1. 模型不可用时的本地兜底只拿得到 `prompt`,系统上下文不可能漏进最终提示词;
 *  2. 背景里没有的字段就是不传,避免「为了凑模板而把会话模式/审批模式拼进去」。
 *
 * context 的取舍标准只有一条:**它会不会改变任务怎么执行**。
 * 「会话标题」「写入审批模式」这类系统状态不改变任务本身,因此不在此列。
 */
export type PromptEnhanceContext = {
  /** 已 @ 的 Agent / 小队成员 —— 会影响是否需要分工与协作产出 */
  participants?: string[]
  /** 本次输入涉及的附件名 —— 会影响任务是否必须基于这些文件内容 */
  attachments?: string[]
  /** 当前输入是对执行计划的修改意见(不是新任务) */
  planRevision?: boolean
  /** 引用的历史消息类型与来源(label) */
  quote?: string
  /**
   * 自动化任务:任务标题 / 说明 / 触发方式。
   * 自动化提示词本身就是由这几个字段定义的,所以它们是任务内容的一部分。
   */
  title?: string
  description?: string
  schedule?: string
}

export type PromptEnhanceRequest = {
  /** 用户原始输入 */
  prompt: string
  /** 仅供理解任务意图的背景,不得出现在输出里 */
  context?: PromptEnhanceContext
}

export type PromptEnhanceResponse = {
  enhancedText: string
  /** 内容来自模型还是本地兜底 —— UI 目前不使用,留给排查与后续提示 */
  source: 'model' | 'fallback'
}
