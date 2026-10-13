/**
 * 密钥脱敏 —— 只用于「把密钥送去浏览器」的那一步（HTTP 响应 / JSON 序列化）。
 *
 * 为什么需要：这个应用**自身没有登录体系**（没有 session / JWT / 中间件），
 * 访问控制完全外移到 «nginx Basic 认证 + 云安全组»。于是一旦 Basic 被关掉、
 * 被配错、或有人绕过反代直连端口，`curl /api/settings` 就能拿到全部 LLM key
 * 与 OSS AccessKey —— 相当于把后端机密降级成「能过网络就能读」。
 *
 * 脱敏后前端仍能回答「配没配」「配的是哪一把」（尾 4 位），但拿不到可用于
 * 冒用的完整值。**写接口不受影响**：PATCH/POST 仍然接受并存储完整值。
 *
 * ❗ 前端配套要求：读回来的脱敏串**不能在保存时原样回写**，否则真 key 会被
 * 星号覆盖。前端必须跟踪「用户是否真的编辑过该字段」（见 SettingsDialog /
 * ProviderConfigDialog 的 dirty 标记），只回传被改过的字段。
 */

/** 保留尾 4 位，其余用 `*` 盖住（最多 12 个星号，避免泄露长度）。 */
export function maskSecret(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return value ?? null
  if (value.length <= 4) return '****'
  return `${'*'.repeat(Math.min(value.length - 4, 12))}${value.slice(-4)}`
}

/** 判定「这个值是不是脱敏串」—— 用来在写接口处拦下前端误回写。 */
export function looksMasked(value: string): boolean {
  return /^\*{4,}[^*]{0,4}$/.test(value)
}
