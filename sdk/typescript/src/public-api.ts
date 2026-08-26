import { VerhubError } from "./errors"
import { compact, type HttpClient } from "./http"
import { analyticsNamespace, EventQueue, type AnalyticsOptions } from "./analytics"
import type {
  AnnouncementItem,
  AnnouncementListResponse,
  CheckUpdateOptions,
  CheckUpdateResponse,
  CreateFeedbackInput,
  EventSubjectDeleteResponse,
  EventSubjectExport,
  FeedbackItem,
  IngestEventsResponse,
  LatestAnnouncementOptions,
  ListAnnouncementsOptions,
  ListVersionsOptions,
  LogItem,
  PageOptions,
  ProjectItem,
  PublicFeedbackOptions,
  TermsDocumentListResponse,
  TermsDocumentSlug,
  TermsDocumentView,
  UploadLogInput,
  VersionItem,
  VersionListResponse,
} from "./models"

/**
 * 公开接口，不需要凭据。
 *
 * 项目作用域的方法用客户端绑定的 `projectKey`，不再逐次收项目参数。
 */
export class PublicApi {
  private queue: EventQueue | null = null

  /**
   * @param http 底层 HTTP 客户端
   * @param analytics 事件采集配置；省略则用默认值（设备级持久化 + 本地队列）
   */
  constructor(
    private readonly http: HttpClient,
    private readonly analytics: AnalyticsOptions = {},
  ) {}

  /**
   * @param options 语言偏好。命中项目注册的语言且该语言译文填了对应字段时，
   *   `name` / `description` 返回译文，`locale` 标出实际语言；否则回落项目自身的值。
   */
  getProject(options: { locale?: string } = {}): Promise<ProjectItem> {
    return this.http.request("GET", "/public/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { locale: options.locale },
    })
  }

  /**
   * @param options 分页参数与语言偏好
   */
  listVersions(options: ListVersionsOptions = {}): Promise<VersionListResponse> {
    return this.http.request("GET", "/public/{projectKey}/versions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset, locale: options.locale },
    })
  }

  /**
   * @param options 语言偏好。命中项目注册的语言且该版本有译文时，`title` / `content`
   *   返回译文，`locale` 标出实际语言；否则回落版本自身的内容。
   * @returns 最新正式版本
   */
  getLatestVersion(options: { locale?: string } = {}): Promise<VersionItem> {
    return this.http.request("GET", "/public/{projectKey}/versions/latest", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { locale: options.locale },
    })
  }

  /**
   * @param options 语言偏好，语义同 `getLatestVersion`
   * @returns 最新 preview 版本；没有则为 null
   */
  getLatestPreviewVersion(options: { locale?: string } = {}): Promise<VersionItem | null> {
    return this.http.request("GET", "/public/{projectKey}/versions/latest-preview", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { locale: options.locale },
    })
  }

  /**
   * @param version 版本号，如 `1.2.0`
   * @param options 语言偏好，语义同 `getLatestVersion`
   */
  getVersion(version: string, options: { locale?: string } = {}): Promise<VersionItem> {
    return this.http.request("GET", "/public/{projectKey}/versions/by-version/{version}", {
      pathParams: { projectKey: this.http.requireProjectKey(), version },
      query: { locale: options.locale },
    })
  }

  /**
   * 提交当前版本并检查更新。
   *
   * `current_version` 与 `current_comparable_version` 至少提供一个。只给
   * `current_version` 时服务端按版本号查库取其登记的可比较版本号，该版本未
   * 登记会返回 400；两者都给时以 `current_comparable_version` 为准。
   *
   * @param options 当前版本与比较选项
   */
  checkUpdate(options: CheckUpdateOptions): Promise<CheckUpdateResponse> {
    return this.http.request("POST", "/public/{projectKey}/versions/check-update", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...options }),
    })
  }

  /**
   * @param options 分页与平台筛选
   */
  listAnnouncements(options: ListAnnouncementsOptions = {}): Promise<AnnouncementListResponse> {
    return this.http.request("GET", "/public/{projectKey}/announcements", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: {
        limit: options.limit,
        offset: options.offset,
        platform: options.platform,
        version: options.version,
        locale: options.locale,
      },
    })
  }

  /**
   * @param options 平台、客户端版本号与语言偏好
   */
  getLatestAnnouncement(options: LatestAnnouncementOptions = {}): Promise<AnnouncementItem> {
    return this.http.request("GET", "/public/{projectKey}/announcements/latest", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: {
        platform: options.platform,
        version: options.version,
        locale: options.locale,
      },
    })
  }

  /**
   * 取反馈提交选项，据此决定要不要显示「转发到 GitHub Issue」的勾选框。
   *
   * @returns 本项目是否开放转发，以及转发时联系方式是否必填
   */
  getFeedbackOptions(): Promise<PublicFeedbackOptions> {
    return this.http.request("GET", "/public/{projectKey}/feedbacks/options", {
      pathParams: { projectKey: this.http.requireProjectKey() },
    })
  }

  /**
   * 提交用户反馈。
   *
   * `forward_to_github` 为 true 时联系方式必填，本地即拒绝；项目未开放转发时
   * 服务端返回 400，Issue 建失败时整条反馈不会被记录（503）。
   *
   * @param input 反馈内容与可选的评分、联系方式、平台、自定义数据
   * @throws {VerhubError} 选了转发却没填 contact
   */
  createFeedback(input: CreateFeedbackInput): Promise<FeedbackItem> {
    if (input.forward_to_github === true && !input.contact?.trim()) {
      throw new VerhubError("转发到 GitHub Issue 需要联系方式：请先填写 contact")
    }
    return this.http.request("POST", "/public/{projectKey}/feedbacks", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...input }),
    })
  }

  /**
   * @param input 日志等级、内容与可选的设备信息
   */
  uploadLog(input: UploadLogInput): Promise<LogItem> {
    return this.http.request("POST", "/public/{projectKey}/logs", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...input }),
    })
  }

  // ---- 条款文档 ----

  /**
   * 列出全部条款文档的标题与最后更新时间，不含正文。
   *
   * 不作用于绑定项目，条款是实例级的。
   */
  listTerms(): Promise<TermsDocumentListResponse> {
    return this.http.request("GET", "/public/terms")
  }

  /**
   * 取条款文档正文（Markdown）。实例未自定义时返回内置正文。
   *
   * @param slug 文档标识
   */
  getTerms(slug: TermsDocumentSlug): Promise<TermsDocumentView> {
    return this.http.request("GET", "/public/terms/{slug}", { pathParams: { slug } })
  }

  // ---- 事件采集 ----

  /**
   * 记录一次用户行为，入队即返回，不发起网络请求。
   *
   * 事件名无需预先登记，服务端第一次收到就自动建立定义。建议用小写下划线形式
   * （`checkout_clicked`）；服务端归一化为小写，只接受字母、数字、下划线、
   * 点、连字符与冒号。
   *
   * 队列满 `batchSize` 条或每 `flushIntervalMs` 毫秒发送一次；发送失败按指数
   * 退避重试，每条事件带幂等键。未同意、已退出、命中 GPC/DNT 或采集被关闭时
   * 本调用是空操作。
   *
   * @param name 事件名
   * @param properties 自定义属性，按属性统计只看第一层
   */
  track(name: string, properties?: Record<string, unknown>): void {
    this.events().track(name, properties)
  }

  /** 立即发送队列里的所有事件。退出前调用可以避免丢掉最后一批。 */
  flush(): Promise<void> {
    return this.events().flush()
  }

  /** 停止采集、丢弃待发队列、删除本地匿名标识，并把退出标记写入本地。 */
  optOut(): void {
    this.events().optOut()
  }

  /** 撤销退出，并生成一个新的匿名标识。 */
  optIn(): void {
    this.events().optIn()
  }

  /** 当前是否处于退出状态。 */
  hasOptedOut(): boolean {
    return this.events().hasOptedOut()
  }

  /**
   * `requireConsent` 模式下开闸。在此之前 SDK 不采集、不写盘，含匿名标识的生成。
   */
  grantConsent(): void {
    this.events().grantConsent()
  }

  /** 撤回同意，等价于 optOut() 并回到未同意状态。 */
  revokeConsent(): void {
    this.events().revokeConsent()
  }

  /** 换一个新的匿名标识，切断与既往事件序列的关联。保持采集开启。 */
  resetIdentity(): void {
    this.events().resetIdentity()
  }

  /** 当前的匿名标识；未采集状态下为 null。 */
  get distinctId(): string | null {
    return this.events().currentDistinctId()
  }

  /**
   * 导出本机匿名标识下的全部事件明细（GDPR Art.15 / Art.20）。
   *
   * @param distinctId 省略则用当前标识
   * @throws {VerhubError} 没有可用的匿名标识（未采集或已退出）
   */
  exportMyData(distinctId?: string): Promise<EventSubjectExport> {
    return this.http.request("GET", "/public/{projectKey}/events/me", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { distinct_id: this.requireDistinctId(distinctId) },
    })
  }

  /**
   * 删除本机匿名标识下的全部事件明细（GDPR Art.17）。小时汇总不在删除范围内。
   *
   * @param distinctId 省略则用当前标识
   * @throws {VerhubError} 没有可用的匿名标识（未采集或已退出）
   */
  deleteMyData(distinctId?: string): Promise<EventSubjectDeleteResponse> {
    return this.http.request("DELETE", "/public/{projectKey}/events/me", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { distinct_id: this.requireDistinctId(distinctId) },
    })
  }

  /**
   * 直接发一批事件，绕过本地队列。常规入口是 {@link PublicApi.track}。
   *
   * @param payload 匿名标识、可选会话与事件数组（单批上限 50）
   */
  ingestEvents(payload: {
    distinct_id: string
    session_id?: string
    events: Array<{
      event_id: string
      name: string
      occurred_at?: number
      properties?: Record<string, unknown>
    }>
  }): Promise<IngestEventsResponse> {
    return this.http.request("POST", "/public/{projectKey}/events", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...payload }),
    })
  }

  /**
   * 首次访问时才建队列，命名空间变化时丢弃重建。
   *
   * 旧命名空间攒下的事件留在它自己的存储位置，下次绑定回去时补发。
   */
  private events(): EventQueue {
    const namespace =
      this.analytics?.namespace ??
      analyticsNamespace(this.http.getBaseUrl(), this.http.getProjectKey())

    if (this.queue && this.queue.namespace !== namespace) {
      this.queue = null
    }
    if (!this.queue) {
      this.queue = new EventQueue(
        namespace,
        (payload) => this.ingestEvents(payload),
        this.analytics,
        (payload) => this.beaconEvents(payload),
      )
    }
    return this.queue
  }

  /**
   * 页面卸载时用 `navigator.sendBeacon` 把队列送出去，非浏览器环境返回 false。
   *
   * beacon 设不了请求头，平台与系统版本改走请求体。
   */
  private beaconEvents(payload: {
    distinct_id: string
    session_id?: string
    events: unknown[]
  }): boolean {
    const nav = (
      globalThis as {
        navigator?: { sendBeacon?: (url: string, data: Blob) => boolean }
      }
    ).navigator
    if (typeof nav?.sendBeacon !== "function" || typeof Blob !== "function") {
      return false
    }

    const projectKey = this.http.getProjectKey()
    if (!projectKey) {
      return false
    }

    const body = compact({
      ...payload,
      platform: this.http.getPlatform() ?? undefined,
      platform_version: this.http.getPlatformVersion() ?? undefined,
    })

    try {
      const url = this.http.resolveUrl("/public/{projectKey}/events", { projectKey })
      const blob = new Blob([JSON.stringify(body)], { type: "application/json" })
      return nav.sendBeacon(url, blob)
    } catch {
      return false
    }
  }

  private requireDistinctId(explicit?: string): string {
    const id = explicit ?? this.events().currentDistinctId()
    if (!id) {
      throw new VerhubError("没有可用的匿名标识：事件采集未启用或已退出。可显式传入 distinctId。")
    }
    return id
  }
}
