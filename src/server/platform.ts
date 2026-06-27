/**
 * 平台抽象。详见 specs/11-platform.md。
 *
 * 现状只区分 POSIX（macOS / Linux）与 Windows，不细分到 darwin / linux。
 * 区分到 darwin 等更细粒度的需求出现时再扩展。
 */
export type Platform = 'posix' | 'windows'

export function currentPlatform(): Platform {
  return process.platform === 'win32' ? 'windows' : 'posix'
}

/**
 * 平台判断常量。所有平台分支代码都应走这两个常量，**不要**散落 `process.platform === 'win32'`：
 * 一是统一来源便于未来注入测试，二是搜代码时一目了然。
 */
export const IS_WINDOWS = process.platform === 'win32'
export const IS_POSIX = !IS_WINDOWS
