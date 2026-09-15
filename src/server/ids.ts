import { customAlphabet } from 'nanoid'

// 12 字符，base62（字母+数字），冲突概率足够低
const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 12)

export const newAgentId = () => `ag_${nano()}`
export const newConversationId = () => `conv_${nano()}`
export const newMessageId = () => `msg_${nano()}`
export const newArtifactId = () => `art_${nano()}`
export const newWorkspaceId = () => `ws_${nano()}`
export const newRunId = () => `run_${nano()}`
export const newToolCallId = () => `call_${nano()}`
export const newAttachmentId = () => `att_${nano()}`
export const newPendingWriteId = () => `pwr_${nano()}`
export const newPendingBashCommandId = () => `pbc_${nano()}`
export const newPendingMcpToolApprovalId = () => `pmcp_${nano()}`
export const newPendingQuestionId = () => `pq_${nano()}`
export const newPendingDispatchPlanId = () => `pdp_${nano()}`
export const newContextSummaryId = () => `ctx_${nano()}`
export const newWorkspaceMemoryId = () => `mem_${nano()}`
export const newExperienceId = () => `exp_${nano()}`
export const newExperienceFileId = () => `expf_${nano()}`
export const newExperienceRevisionId = () => `expr_${nano()}`
export const newAgentRunDebugSnapshotId = () => `rdbg_${nano()}`
export const newAgentRunDebugEventId = () => `rde_${nano()}`
export const newTerminalSessionId = () => `term_${nano()}`
export const newTerminalEventId = () => `tevt_${nano()}`
export const newDeploymentId = () => `dep_${nano()}`
export const newAutomationId = () => `auto_${nano()}`
export const newAutomationRunId = () => `arun_${nano()}`
export const newAutomationRunLogId = () => `alog_${nano()}`
export const newMcpServerId = () => `mcp_${nano()}`
export const newSkillId = () => `skill_${nano()}`
export const newNotificationId = () => `ntf_${nano()}`
export const newTeamId = () => `team_${nano()}`
export const newTeamMemberId = () => `tm_${nano()}`
