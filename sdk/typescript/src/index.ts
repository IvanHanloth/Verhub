/**
 * Verhub TypeScript SDK。
 *
 * 接口面与 Python / Rust / 纯 JS 版一一对应，只是方法名按各语言习惯改写
 * （这里用 camelCase）。契约以仓库根目录的 `verhub.openapi.yaml` 为准。
 */

export { AdminApi } from "./admin-api"
export { VerhubClient, VerhubSDK } from "./client"
export { VerhubApiError, VerhubAuthError, VerhubConnectionError, VerhubError } from "./errors"
export {
  detectPlatform,
  detectPlatformVersion,
  PLATFORM_HEADER,
  PLATFORM_VERSION_HEADER,
  type RequestQuery,
  type VerhubClientOptions,
} from "./http"
export * from "./models"
export { PublicApi } from "./public-api"
export { VERHUB_SDK_VERSION } from "./version"
