import { ensureImageStored, type EnsureImageStoredResult } from '@/server/oss-image-store'

/**
 * 刚生成的图片字节流 → 可长期访问的 URL。
 *
 * 走 `ensureImageStored` 的 data URI 通道，即全项目图片存储的同一套规则：
 * 配了 OSS 就上传 OSS（稳定远程地址），没配就本地化到 `.agenthub-data/artifact-images/`
 * 并返回 `/api/artifact-images/<name>`。
 *
 * 为什么不再自己写「OSS 失败就写 `.agenthub-data/generated-images`」那套（历史实现）：
 * 那条本地回退返回的 `/api/files/generated-images/...` **在 `src/app` 下没有任何路由**，
 * 未配 OSS 的部署会拿到一屋子裂图产物。统一走 ensureImageStored 后，本地回退也指向
 * 真实存在的路由，且扩展名/Content-Type 由同一个嗅探器决定。
 *
 * 调用方：`ImageGenAdapter`（整轮 run 就是出图）与 `image_generate` 工具（按需出图）。
 */
export async function storeGeneratedImage(
  buffer: Buffer,
  workspaceDir?: string,
): Promise<EnsureImageStoredResult> {
  return ensureImageStored(`data:image/png;base64,${buffer.toString('base64')}`, workspaceDir)
}
