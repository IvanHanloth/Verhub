export const VERHUB_SDK_VERSION = "0.1.0"

export type QueryValue = string | number | boolean | null | undefined
export type RequestQuery = Record<string, QueryValue>

export type VerhubClientOptions = {
  baseUrl: string
  token?: string
  fetcher?: typeof fetch
}

/**
 * Verhub API 错误对象。
 */
export class VerhubApiError extends Error {
  readonly status: number
  readonly body: unknown

  /**
   * @param message 错误信息
   * @param status HTTP 状态码
   * @param body 响应体
   */
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = "VerhubApiError"
    this.status = status
    this.body = body
  }
}

class VerhubBaseClient {
  private baseUrl: string
  private token: string
  private fetcher: typeof fetch

  /**
   * @param options 客户端配置
   */
  constructor(options: VerhubClientOptions) {
    const normalized = options.baseUrl.trim()
    this.baseUrl = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized
    this.token = options.token ?? ""
    this.fetcher = options.fetcher ?? fetch
  }

  /**
   * @param token Bearer Token
   */
  setToken(token: string): void {
    this.token = token
  }

  /**
   * 清理当前 Bearer Token。
   */
  clearToken(): void {
    this.token = ""
  }

  /**
   * @param method HTTP 方法
   * @param pathTemplate 路径模板
   * @param options 请求参数
   */
  async request<T>(
    method: string,
    pathTemplate: string,
    options?: {
      pathParams?: Record<string, string>
      query?: RequestQuery
      body?: unknown
      auth?: "none" | "bearer"
    },
  ): Promise<T> {
    const authMode = options?.auth ?? "none"
    const path = this.resolvePath(pathTemplate, options?.pathParams)
    const url = this.buildUrl(path, options?.query)

    const headers: Record<string, string> = {
      Accept: "application/json",
    }

    let bodyText: string | undefined
    if (options?.body !== undefined) {
      headers["Content-Type"] = "application/json"
      bodyText = JSON.stringify(options.body)
    }

    if (authMode === "bearer") {
      if (!this.token) {
        throw new VerhubApiError("Missing bearer token", 401, null)
      }
      headers.Authorization = `Bearer ${this.token}`
    }

    const response = await this.fetcher(url, {
      method,
      headers,
      body: bodyText,
    })

    const raw = await response.text()
    const payload = this.tryParseJson(raw)

    if (!response.ok) {
      const message = this.extractErrorMessage(payload) ?? `Request failed with status ${response.status}`
      throw new VerhubApiError(message, response.status, payload)
    }

    return payload as T
  }

  /**
   * @param pathTemplate 路径模板
   * @param pathParams 路径参数
   */
  private resolvePath(pathTemplate: string, pathParams?: Record<string, string>): string {
    return pathTemplate.replace(/\{([^}]+)\}/g, (_, key: string) => {
      const value = pathParams?.[key]
      if (!value) {
        throw new Error(`Missing path param: ${key}`)
      }
      return encodeURIComponent(value)
    })
  }

  /**
   * @param path 已解析路径
   * @param query 查询参数
   */
  private buildUrl(path: string, query?: RequestQuery): string {
    if (!query) {
      return `${this.baseUrl}${path}`
    }

    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") {
        continue
      }
      params.set(key, String(value))
    }

    const queryString = params.toString()
    if (!queryString) {
      return `${this.baseUrl}${path}`
    }

    return `${this.baseUrl}${path}?${queryString}`
  }

  /**
   * @param raw 原始文本
   */
  private tryParseJson(raw: string): unknown {
    if (!raw) {
      return {}
    }

    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  /**
   * @param body 解析后的响应体
   */
  private extractErrorMessage(body: unknown): string | null {
    if (!body || typeof body !== "object") {
      return null
    }

    const candidate = body as Record<string, unknown>
    if (typeof candidate.message === "string") {
      return candidate.message
    }

    if (Array.isArray(candidate.message) && typeof candidate.message[0] === "string") {
      return candidate.message[0]
    }

    return null
  }
}

function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null && v !== "") {
      ;(out as Record<string, unknown>)[k] = v
    }
  }
  return out
}

/**
 * Verhub 公开接口命名空间。
 */
export class VerhubPublicApi {
  constructor(private readonly client: VerhubBaseClient) {}

  /**
   * @param projectKey 项目标识
   */
  getProjectPublicInfo(projectKey: string) {
    return this.client.request("GET", "/public/{projectKey}", {
      pathParams: { projectKey },
    })
  }

  /**
   * @param projectKey 项目标识
   * @param limit 分页大小
   * @param offset 分页偏移
   */
  listPublicVersions(projectKey: string, limit?: number, offset?: number) {
    return this.client.request("GET", "/public/{projectKey}/versions", {
      pathParams: { projectKey },
      query: compact({ limit, offset }),
    })
  }

  /**
   * @param projectKey 项目标识
   */
  getLatestPublicVersion(projectKey: string) {
    return this.client.request("GET", "/public/{projectKey}/versions/latest", {
      pathParams: { projectKey },
    })
  }

  /**
   * @param projectKey 项目标识
   * @param limit 分页大小
   * @param offset 分页偏移
   */
  listPublicAnnouncements(projectKey: string, limit?: number, offset?: number) {
    return this.client.request("GET", "/public/{projectKey}/announcements", {
      pathParams: { projectKey },
      query: compact({ limit, offset }),
    })
  }

  /**
   * @param projectKey 项目标识
   */
  getLatestPublicAnnouncement(projectKey: string) {
    return this.client.request("GET", "/public/{projectKey}/announcements/latest", {
      pathParams: { projectKey },
    })
  }

  /**
   * @param projectKey 项目标识
   * @param content 反馈内容
   * @param userId 用户 ID
   * @param rating 评分
   * @param platform 平台
   */
  createFeedback(projectKey: string, content: string, userId?: string, rating?: number, platform?: string) {
    return this.client.request("POST", "/public/{projectKey}/feedbacks", {
      pathParams: { projectKey },
      body: compact({ user_id: userId, rating, content, platform }),
    })
  }

  /**
   * @param projectKey 项目标识
   * @param level 日志等级
   * @param content 日志内容
   * @param deviceInfo 设备信息
   * @param customData 自定义数据
   */
  createLog(
    projectKey: string,
    level: number,
    content: string,
    deviceInfo?: Record<string, unknown>,
    customData?: Record<string, unknown>,
  ) {
    return this.client.request("POST", "/public/{projectKey}/logs", {
      pathParams: { projectKey },
      body: compact({ level, content, device_info: deviceInfo, custom_data: customData }),
    })
  }

  /**
   * @param projectKey 项目标识
   * @param actionId 行为定义 ID
   * @param http HTTP 上下文
   * @param customData 自定义数据
   */
  createActionRecord(
    projectKey: string,
    actionId: string,
    http?: Record<string, unknown>,
    customData?: Record<string, unknown>,
  ) {
    return this.client.request("POST", "/public/{projectKey}/actions", {
      pathParams: { projectKey },
      body: compact({ action_id: actionId, http, custom_data: customData }),
    })
  }
}

/**
 * Verhub 管理接口命名空间。
 */
export class VerhubAdminApi {
  constructor(private readonly client: VerhubBaseClient) {}

  /**
   * @param projectKey 项目标识
   * @param name 项目名称
   * @param repoUrl 仓库地址
   * @param description 项目描述
   * @param author 作者
   * @param authorHomepageUrl 作者主页
   * @param iconUrl 图标地址
   * @param websiteUrl 官网地址
   * @param publishedAt 发布时间
   */
  createProject(
    projectKey: string,
    name: string,
    repoUrl?: string,
    description?: string,
    author?: string,
    authorHomepageUrl?: string,
    iconUrl?: string,
    websiteUrl?: string,
    publishedAt?: number,
  ) {
    return this.client.request("POST", "/admin/projects", {
      auth: "bearer",
      body: compact({
        project_key: projectKey,
        name,
        repo_url: repoUrl,
        description,
        author,
        author_homepage_url: authorHomepageUrl,
        icon_url: iconUrl,
        website_url: websiteUrl,
        published_at: publishedAt,
      }),
    })
  }

  /**
   * @param id 项目标识
   */
  deleteProject(id: string) {
    return this.client.request("DELETE", "/admin/projects/{id}", {
      auth: "bearer",
      pathParams: { id },
    })
  }

  /**
   * @param projectKey 项目标识
   * @param version 版本号
   * @param title 标题
   * @param content 内容
   * @param downloadLinks 下载链接数组
   * @param forced 是否强更
   * @param isLatest 是否 latest
   * @param isPreview 是否预览
   * @param publishedAt 发布时间
   */
  createVersion(
    projectKey: string,
    version: string,
    title: string,
    content: string,
    downloadLinks?: Array<Record<string, unknown>>,
    forced?: boolean,
    isLatest?: boolean,
    isPreview?: boolean,
    publishedAt?: number,
  ) {
    return this.client.request("POST", "/admin/projects/{projectKey}/versions", {
      auth: "bearer",
      pathParams: { projectKey },
      body: compact({
        version,
        title,
        content,
        download_links: downloadLinks,
        forced,
        is_latest: isLatest,
        is_preview: isPreview,
        published_at: publishedAt,
      }),
    })
  }

  /**
   * @param projectKey 项目标识
   * @param id 版本 ID
   * @param title 标题
   * @param content 内容
   * @param downloadLinks 下载链接数组
   * @param forced 是否强更
   * @param isLatest 是否 latest
   * @param isPreview 是否预览
   * @param publishedAt 发布时间
   */
  updateVersion(
    projectKey: string,
    id: string,
    title?: string,
    content?: string,
    downloadLinks?: Array<Record<string, unknown>>,
    forced?: boolean,
    isLatest?: boolean,
    isPreview?: boolean,
    publishedAt?: number,
  ) {
    return this.client.request("PATCH", "/admin/projects/{projectKey}/versions/{id}", {
      auth: "bearer",
      pathParams: { projectKey, id },
      body: compact({
        title,
        content,
        download_links: downloadLinks,
        forced,
        is_latest: isLatest,
        is_preview: isPreview,
        published_at: publishedAt,
      }),
    })
  }

  /**
   * @param projectKey 项目标识
   * @param id 版本 ID
   */
  deleteVersion(projectKey: string, id: string) {
    return this.client.request("DELETE", "/admin/projects/{projectKey}/versions/{id}", {
      auth: "bearer",
      pathParams: { projectKey, id },
    })
  }

  /**
   * @param projectKey 项目标识
   * @param title 公告标题
   * @param content 公告内容
   * @param isPinned 是否置顶
   * @param author 作者
   * @param publishedAt 发布时间
   */
  createAnnouncement(
    projectKey: string,
    title: string,
    content: string,
    isPinned?: boolean,
    author?: string,
    publishedAt?: number,
  ) {
    return this.client.request("POST", "/admin/projects/{projectKey}/announcements", {
      auth: "bearer",
      pathParams: { projectKey },
      body: compact({
        title,
        content,
        is_pinned: isPinned,
        author,
        published_at: publishedAt,
      }),
    })
  }

  /**
   * @param projectKey 项目标识
   * @param id 公告 ID
   * @param title 公告标题
   * @param content 公告内容
   * @param isPinned 是否置顶
   * @param author 作者
   * @param publishedAt 发布时间
   */
  updateAnnouncement(
    projectKey: string,
    id: string,
    title?: string,
    content?: string,
    isPinned?: boolean,
    author?: string,
    publishedAt?: number,
  ) {
    return this.client.request("PATCH", "/admin/projects/{projectKey}/announcements/{id}", {
      auth: "bearer",
      pathParams: { projectKey, id },
      body: compact({
        title,
        content,
        is_pinned: isPinned,
        author,
        published_at: publishedAt,
      }),
    })
  }

  /**
   * @param projectKey 项目标识
   * @param id 公告 ID
   */
  deleteAnnouncement(projectKey: string, id: string) {
    return this.client.request("DELETE", "/admin/projects/{projectKey}/announcements/{id}", {
      auth: "bearer",
      pathParams: { projectKey, id },
    })
  }

  /**
   * @param projectKey 项目标识
   * @param limit 分页大小
   * @param offset 分页偏移
   */
  listFeedbacks(projectKey: string, limit?: number, offset?: number) {
    return this.client.request("GET", "/admin/projects/{projectKey}/feedbacks", {
      auth: "bearer",
      pathParams: { projectKey },
      query: compact({ limit, offset }),
    })
  }

  /**
   * @param projectKey 项目标识
   * @param id 反馈 ID
   * @param rating 评分
   * @param content 内容
   * @param platform 平台
   */
  updateFeedback(projectKey: string, id: string, rating?: number, content?: string, platform?: string) {
    return this.client.request("PATCH", "/admin/projects/{projectKey}/feedbacks/{id}", {
      auth: "bearer",
      pathParams: { projectKey, id },
      body: compact({ rating, content, platform }),
    })
  }

  /**
   * @param projectKey 项目标识
   * @param id 反馈 ID
   */
  deleteFeedback(projectKey: string, id: string) {
    return this.client.request("DELETE", "/admin/projects/{projectKey}/feedbacks/{id}", {
      auth: "bearer",
      pathParams: { projectKey, id },
    })
  }

  /**
   * @param projectKey 项目标识
   * @param limit 分页大小
   * @param offset 分页偏移
   * @param level 日志等级
   * @param startTime 开始时间
   * @param endTime 结束时间
   */
  listLogs(projectKey: string, limit?: number, offset?: number, level?: number, startTime?: number, endTime?: number) {
    return this.client.request("GET", "/admin/projects/{projectKey}/logs", {
      auth: "bearer",
      pathParams: { projectKey },
      query: compact({
        limit,
        offset,
        level,
        start_time: startTime,
        end_time: endTime,
      }),
    })
  }

  /**
   * @param projectKey 项目标识
   * @param limit 分页大小
   * @param offset 分页偏移
   */
  listActions(projectKey: string, limit?: number, offset?: number) {
    return this.client.request("GET", "/admin/projects/{projectKey}/actions", {
      auth: "bearer",
      pathParams: { projectKey },
      query: compact({ limit, offset }),
    })
  }

  /**
   * @param projectKey 项目标识
   * @param name 行为名称
   * @param description 行为描述
   */
  createAction(projectKey: string, name: string, description?: string) {
    return this.client.request("POST", "/admin/projects/actions", {
      auth: "bearer",
      body: compact({ project_key: projectKey, name, description }),
    })
  }

  /**
   * @param actionId 行为 ID
   * @param name 行为名称
   * @param description 行为描述
   */
  updateAction(actionId: string, name?: string, description?: string) {
    return this.client.request("PATCH", "/admin/actions/{action_id}", {
      auth: "bearer",
      pathParams: { action_id: actionId },
      body: compact({ name, description }),
    })
  }

  /**
   * @param actionId 行为 ID
   */
  deleteAction(actionId: string) {
    return this.client.request("DELETE", "/admin/actions/{action_id}", {
      auth: "bearer",
      pathParams: { action_id: actionId },
    })
  }
}

/**
 * Verhub SDK 统一入口。
 */
export class VerhubSDK {
  static readonly version = VERHUB_SDK_VERSION

  readonly publicApi: VerhubPublicApi
  readonly adminApi: VerhubAdminApi

  /**
   * @param client 底层客户端
   */
  constructor(private readonly client: VerhubBaseClient) {
    this.publicApi = new VerhubPublicApi(client)
    this.adminApi = new VerhubAdminApi(client)
  }

  /**
   * @param options 客户端配置
   */
  static create(options: VerhubClientOptions): VerhubSDK {
    return new VerhubSDK(new VerhubBaseClient(options))
  }

  /**
   * @param token Bearer Token
   */
  setToken(token: string): void {
    this.client.setToken(token)
  }

  /**
   * 清理当前 Bearer Token。
   */
  clearToken(): void {
    this.client.clearToken()
  }
}
