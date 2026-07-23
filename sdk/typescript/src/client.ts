import { AdminApi } from "./admin-api"
import { HttpClient, type VerhubClientOptions } from "./http"
import type { HealthResponse, Platform } from "./models"
import { PublicApi } from "./public-api"
import { VERHUB_SDK_VERSION } from "./version"

/**
 * Verhub SDK 入口。
 *
 * 客户端绑定一个项目：在配置里传入 `projectKey` 后，项目作用域的方法都用它，
 * 不必再逐次传项目参数。两个命名空间共用一份连接、凭据与来源声明：`client.public`
 * 不需要凭据，`client.admin` 需要管理员 JWT 或 API Key。
 *
 * ```ts
 * const client = new VerhubClient({
 *   baseUrl: "https://verhub.example.com/api/v1",
 *   projectKey: "verhub",
 * })
 * const latest = await client.public.getLatestVersion()
 * ```
 */
export class VerhubClient {
  static readonly version = VERHUB_SDK_VERSION

  /** 公开接口，不需要凭据。 */
  readonly public: PublicApi
  /** 管理接口，需要管理员 JWT 或 API Key。 */
  readonly admin: AdminApi

  private readonly http: HttpClient

  /**
   * @param options 客户端配置；`baseUrl` 须包含 `/api/v1` 前缀
   */
  constructor(options: VerhubClientOptions) {
    this.http = new HttpClient(options)
    this.public = new PublicApi(this.http)
    this.admin = new AdminApi(this.http)
  }

  /**
   * @param options 客户端配置
   */
  static create(options: VerhubClientOptions): VerhubClient {
    return new VerhubClient(options)
  }

  /** 当前绑定的项目标识。 */
  get projectKey(): string | undefined {
    return this.http.getProjectKey()
  }

  /**
   * @param projectKey 新的绑定项目标识
   */
  setProjectKey(projectKey: string): void {
    this.http.setProjectKey(projectKey)
  }

  /**
   * @param token 管理员 JWT 或 API Key
   */
  setToken(token: string): void {
    this.http.setToken(token)
  }

  /** 清除当前凭据，之后调用 admin 接口会直接抛错。 */
  clearToken(): void {
    this.http.clearToken()
  }

  /**
   * @param platform 平台声明；传 null 则不再声明平台
   */
  setPlatform(platform: Platform | null): void {
    this.http.setPlatform(platform)
  }

  /**
   * @param platformVersion 系统版本明细；传 null 则不再声明
   */
  setPlatformVersion(platformVersion: string | null): void {
    this.http.setPlatformVersion(platformVersion)
  }

  /**
   * @returns 服务健康状态
   */
  health(): Promise<HealthResponse> {
    return this.http.request("GET", "/health")
  }
}

/** 兼容早期版本的旧名字。 */
export const VerhubSDK = VerhubClient
export type VerhubSDK = VerhubClient
