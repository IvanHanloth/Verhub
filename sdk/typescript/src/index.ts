/**
 * Verhub TypeScript SDK。
 *
 * 接口面与 Python / Rust / 纯 JS 版一一对应，方法名按各语言习惯改写（这里用
 * camelCase）。契约以仓库根目录的 `verhub.openapi.yaml` 为准。
 */

export { AdminApi } from "./admin-api"
export {
  type AnalyticsOptions,
  analyticsNamespace,
  type AnalyticsPersistence,
  type AnalyticsStorage,
  detectDoNotTrack,
  EventQueue,
  fnv1a32Hex,
  memoryStorage,
  nullStorage,
  originOf,
  type QueuedEvent,
  randomId,
} from "./analytics"
export { VerhubClient, VerhubSDK, type VerhubOptions } from "./client"
export { VerhubApiError, VerhubAuthError, VerhubConnectionError, VerhubError } from "./errors"
export {
  detectPlatform,
  detectPlatformVersion,
  PLATFORM_HEADER,
  PLATFORM_VERSION_HEADER,
  type RequestQuery,
  sanitizePlatformVersion,
  type VerhubClientOptions,
} from "./http"
export * from "./models"
export { PublicApi } from "./public-api"
export { VERHUB_SDK_VERSION } from "./version"
