import { compact, type HttpClient } from "./http"
import type {
  CreateDashboardCardInput,
  DashboardCardItem,
  DashboardCardListResponse,
  EventBreakdownOptions,
  EventBreakdownResponse,
  EventDefinitionItem,
  EventDefinitionListResponse,
  EventHeatmapResponse,
  EventOverviewResponse,
  EventQuery,
  EventQueryResponse,
  EventRangeOptions,
  EventSubjectDeleteResponse,
  EventTimeseriesOptions,
  EventTimeseriesResponse,
  FunnelOptions,
  FunnelResponse,
  ListEventDefinitionsOptions,
  PathsOptions,
  PathsResponse,
  RetentionOptions,
  RetentionResponse,
  UpdateDashboardCardInput,
  UpdateEventDefinitionInput,
  AnnouncementItem,
  AnnouncementListResponse,
  AnnouncementStatistics,
  CreateAnnouncementInput,
  CreateFeedbackInput,
  CreateLogInput,
  CreateProjectInput,
  CreateVersionInput,
  DeleteSuccessResponse,
  FeedbackItem,
  FeedbackListResponse,
  FeedbackIssueRepoTemplatePreview,
  FeedbackStatistics,
  GithubAppConfig,
  GithubReleaseVersionPreview,
  GithubRepoProjectPreview,
  GithubWebhookSecretRevealed,
  GithubWebhookSettings,
  ListFeedbacksOptions,
  ListLogsOptions,
  LogItem,
  LogListResponse,
  LogStatistics,
  PageOptions,
  ProjectAliasListResponse,
  ProjectLocaleItem,
  ProjectLocaleListResponse,
  CreateProjectLocaleInput,
  ProjectGithubIntegration,
  ProjectItem,
  ProjectListResponse,
  ProjectStatistics,
  TermsDocumentConfigListResponse,
  TermsDocumentConfigView,
  TermsDocumentSlug,
  UpdateAnnouncementInput,
  UpdateFeedbackInput,
  UpdateGithubAppConfigInput,
  UpdateProjectGithubIntegrationInput,
  UpdateProjectInput,
  UpdateTermsDocumentInput,
  UpdateVersionInput,
  UpsertVersionInput,
  VersionImportResult,
  VersionItem,
  VersionListResponse,
  VersionStatistics,
} from "./models"

/**
 * 管理接口，全部需要凭据。
 *
 * 凭据可以是 `POST /auth/login` 拿到的管理员 JWT（默认 2 小时过期），也可以是
 * 后台签发的长期 API Key（`vh_` 前缀）。两者在 admin 接口上等价，但 API Key
 * 受 scope 与项目范围限制：读接口要 `<资源>:read`，写接口要 `<资源>:write`，
 * 写权限不隐含读权限。
 *
 * 项目作用域的方法用客户端绑定的 `projectKey`，不再逐次收项目参数；跨项目的
 * 方法（`listProjects`、各类统计、按 id 操作行为等）不涉及绑定项目。
 */
export class AdminApi {
  /**
   * @param http 底层 HTTP 客户端
   */
  constructor(private readonly http: HttpClient) {}

  // ---- 项目 ----

  /**
   * @param options 分页参数
   * @returns 项目列表（全部项目，不限于绑定项目）
   */
  listProjects(options: PageOptions = {}): Promise<ProjectListResponse> {
    return this.http.request("GET", "/admin/projects", {
      query: { limit: options.limit, offset: options.offset },
      auth: true,
    })
  }

  /**
   * 创建项目。`input.project_key` 是新项目的标识，省略则用客户端绑定的那个。
   *
   * @param input 项目字段
   */
  createProject(input: CreateProjectInput): Promise<ProjectItem> {
    return this.http.request("POST", "/admin/projects", {
      body: compact({ ...input, project_key: input.project_key ?? this.http.requireProjectKey() }),
      auth: true,
    })
  }

  /**
   * @returns 绑定项目的详情
   */
  getProject(): Promise<ProjectItem> {
    return this.http.request("GET", "/admin/projects/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * 更新绑定的项目。
   *
   * @param input 要改的字段；提交 `project_key` 会改键。改键后旧 key 会自动登记为
   *   别名并继续指向本项目（旧 key 仍可访问），但客户端应 `setProjectKey` 切到新 key。
   */
  updateProject(input: UpdateProjectInput): Promise<ProjectItem> {
    return this.http.request("PATCH", "/admin/projects/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * @returns 删除结果
   */
  deleteProject(): Promise<DeleteSuccessResponse> {
    return this.http.request("DELETE", "/admin/projects/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * 列出绑定项目的别名（改名保留的旧 Project Key）。
   */
  listProjectAliases(): Promise<ProjectAliasListResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/aliases", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * 删除一个别名。删除后旧 key 不再指向本项目，此后以它访问会 404。
   *
   * @param alias 要删除的别名（旧 Project Key）
   */
  deleteProjectAlias(alias: string): Promise<DeleteSuccessResponse> {
    return this.http.request("DELETE", "/admin/projects/{projectKey}/aliases/{alias}", {
      pathParams: { projectKey: this.http.requireProjectKey(), alias },
      auth: true,
    })
  }

  /**
   * 列出绑定项目注册的语言。只有注册过的语言能存公告译文，也只有它们的偏好
   * 会被公开接口认账——公开端收到未注册的语言偏好时返回公告的默认内容。
   */
  listProjectLocales(): Promise<ProjectLocaleListResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/locales", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * 注册一个语言。已注册（大小写不敏感）时只更新展示名，不会新建第二行。
   */
  createProjectLocale(input: CreateProjectLocaleInput): Promise<ProjectLocaleItem> {
    return this.http.request("POST", "/admin/projects/{projectKey}/locales", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: input,
      auth: true,
    })
  }

  /**
   * 注销一个语言。已录入的公告译文不会被删除，只是暂时不可达，重新注册即恢复。
   *
   * @param locale 要注销的语言标签，匹配大小写不敏感
   */
  deleteProjectLocale(locale: string): Promise<DeleteSuccessResponse> {
    return this.http.request("DELETE", "/admin/projects/{projectKey}/locales/{locale}", {
      pathParams: { projectKey: this.http.requireProjectKey(), locale },
      auth: true,
    })
  }

  /**
   * @returns 项目总数
   */
  getProjectStatistics(): Promise<ProjectStatistics> {
    return this.http.request("GET", "/admin/projects/statistics", { auth: true })
  }

  /**
   * @param repoUrl GitHub 仓库地址
   * @returns 可直接用于建项目的字段草稿
   */
  previewGithubRepo(repoUrl: string): Promise<GithubRepoProjectPreview> {
    return this.http.request("GET", "/admin/projects/github-repo-preview", {
      query: { repo_url: repoUrl },
      auth: true,
    })
  }

  // ---- 版本 ----

  /**
   * @param options 分页参数
   */
  listVersions(options: PageOptions = {}): Promise<VersionListResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/versions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset },
      auth: true,
    })
  }

  /**
   * @param input 版本字段
   */
  createVersion(input: CreateVersionInput): Promise<VersionItem> {
    return this.http.request("POST", "/admin/projects/{projectKey}/versions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * @param versionId 版本记录 id
   */
  getVersion(versionId: string): Promise<VersionItem> {
    return this.http.request("GET", "/admin/projects/{projectKey}/versions/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: versionId },
      auth: true,
    })
  }

  /**
   * 省略的字段保持原值；显式传 `null` 的字段被置空（如 `download_url: null`）。
   *
   * @param versionId 版本记录 id
   * @param input 要改的字段
   */
  updateVersion(versionId: string, input: UpdateVersionInput): Promise<VersionItem> {
    return this.http.request("PATCH", "/admin/projects/{projectKey}/versions/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: versionId },
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * 按版本号创建或更新，适合在 CI 里幂等地发版。
   *
   * 目标版本号取自路径。新建时省略 `comparable_version` 会由版本号推导
   * （去掉前导 v）；更新时省略的字段保持原值。
   *
   * @param version 版本号
   * @param input 版本字段
   */
  upsertVersion(version: string, input: UpsertVersionInput = {}): Promise<VersionItem> {
    return this.http.request("PUT", "/admin/projects/{projectKey}/versions/by-version/{version}", {
      pathParams: { projectKey: this.http.requireProjectKey(), version },
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * @param versionId 版本记录 id
   */
  deleteVersion(versionId: string): Promise<DeleteSuccessResponse> {
    return this.http.request("DELETE", "/admin/projects/{projectKey}/versions/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: versionId },
      auth: true,
    })
  }

  /**
   * @returns 版本总量与时间跨度
   */
  getVersionStatistics(): Promise<VersionStatistics> {
    return this.http.request("GET", "/admin/versions/statistics", { auth: true })
  }

  /**
   * @param options Release tag；省略则取最新一个
   */
  previewGithubRelease(options: { tag?: string } = {}): Promise<GithubReleaseVersionPreview> {
    return this.http.request(
      "GET",
      "/admin/projects/{projectKey}/versions/github-release-preview",
      {
        pathParams: { projectKey: this.http.requireProjectKey() },
        query: { tag: options.tag },
        auth: true,
      },
    )
  }

  /**
   * @returns 导入结果；已存在的版本计入 skipped
   */
  importGithubReleases(): Promise<VersionImportResult> {
    return this.http.request(
      "POST",
      "/admin/projects/{projectKey}/versions/github-release-import",
      {
        pathParams: { projectKey: this.http.requireProjectKey() },
        auth: true,
      },
    )
  }

  // ---- 公告 ----

  /**
   * @param options 分页参数
   */
  listAnnouncements(options: PageOptions = {}): Promise<AnnouncementListResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/announcements", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset },
      auth: true,
    })
  }

  /**
   * @param input 公告字段
   */
  createAnnouncement(input: CreateAnnouncementInput): Promise<AnnouncementItem> {
    return this.http.request("POST", "/admin/projects/{projectKey}/announcements", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * @param announcementId 公告 id
   */
  getAnnouncement(announcementId: string): Promise<AnnouncementItem> {
    return this.http.request("GET", "/admin/projects/{projectKey}/announcements/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: announcementId },
      auth: true,
    })
  }

  /**
   * @param announcementId 公告 id
   * @param input 要改的字段
   */
  updateAnnouncement(
    announcementId: string,
    input: UpdateAnnouncementInput,
  ): Promise<AnnouncementItem> {
    return this.http.request("PATCH", "/admin/projects/{projectKey}/announcements/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: announcementId },
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * @param announcementId 公告 id
   */
  deleteAnnouncement(announcementId: string): Promise<DeleteSuccessResponse> {
    return this.http.request("DELETE", "/admin/projects/{projectKey}/announcements/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: announcementId },
      auth: true,
    })
  }

  /**
   * @returns 公告总数与置顶数
   */
  getAnnouncementStatistics(): Promise<AnnouncementStatistics> {
    return this.http.request("GET", "/admin/announcements/statistics", { auth: true })
  }

  // ---- 反馈 ----

  /**
   * @param options 分页参数与是否包含隐藏反馈
   */
  listFeedbacks(options: ListFeedbacksOptions = {}): Promise<FeedbackListResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/feedbacks", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: {
        limit: options.limit,
        offset: options.offset,
        include_hidden: options.include_hidden,
      },
      auth: true,
    })
  }

  /**
   * 后台手动补录反馈。客户端上报请用 `public.createFeedback`。
   *
   * @param input 反馈字段
   */
  createFeedback(input: CreateFeedbackInput): Promise<FeedbackItem> {
    return this.http.request("POST", "/admin/projects/{projectKey}/feedbacks", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * @param feedbackId 反馈 id
   */
  getFeedback(feedbackId: string): Promise<FeedbackItem> {
    return this.http.request("GET", "/admin/projects/{projectKey}/feedbacks/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: feedbackId },
      auth: true,
    })
  }

  /**
   * @param feedbackId 反馈 id
   * @param input 要改的字段
   */
  updateFeedback(feedbackId: string, input: UpdateFeedbackInput): Promise<FeedbackItem> {
    return this.http.request("PATCH", "/admin/projects/{projectKey}/feedbacks/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: feedbackId },
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * @param feedbackId 反馈 id
   */
  deleteFeedback(feedbackId: string): Promise<DeleteSuccessResponse> {
    return this.http.request("DELETE", "/admin/projects/{projectKey}/feedbacks/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: feedbackId },
      auth: true,
    })
  }

  /**
   * @returns 反馈总数与平均分
   */
  getFeedbackStatistics(): Promise<FeedbackStatistics> {
    return this.http.request("GET", "/admin/feedbacks/statistics", { auth: true })
  }

  // ---- 日志 ----

  /**
   * @param options 分页、等级与时间范围
   */
  listLogs(options: ListLogsOptions = {}): Promise<LogListResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/logs", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: {
        limit: options.limit,
        offset: options.offset,
        level: options.level,
        start_time: options.start_time,
        end_time: options.end_time,
      },
      auth: true,
    })
  }

  /**
   * 后台手动补录日志。客户端上报请用 `public.uploadLog`。
   *
   * @param input 日志字段
   */
  createLog(input: CreateLogInput): Promise<LogItem> {
    return this.http.request("POST", "/admin/projects/{projectKey}/logs", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * @returns 各等级日志条数
   */
  getLogStatistics(): Promise<LogStatistics> {
    return this.http.request("GET", "/admin/logs/statistics", { auth: true })
  }

  // ---- 事件分析 ----

  /**
   * 自动发现的事件清单。定义由采集端在第一次收到某个事件名时登记，没有创建接口。
   *
   * @param options 区间、分页与搜索
   */
  listEventDefinitions(
    options: ListEventDefinitionsOptions = {},
  ): Promise<EventDefinitionListResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/events/definitions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: {
        start_time: options.start_time,
        end_time: options.end_time,
        tz_offset_minutes: options.tz_offset_minutes,
        limit: options.limit,
        offset: options.offset,
        search: options.search,
        include_archived: options.include_archived,
      },
      auth: true,
    })
  }

  /**
   * @param definitionId 事件定义 id
   * @param input 显示名、描述或归档状态。事件名不可改——它是客户端上报时使用的键。
   */
  updateEventDefinition(
    definitionId: string,
    input: UpdateEventDefinitionInput,
  ): Promise<EventDefinitionItem> {
    return this.http.request(
      "PATCH",
      "/admin/projects/{projectKey}/events/definitions/{definitionId}",
      {
        pathParams: { projectKey: this.http.requireProjectKey(), definitionId },
        body: compact({ ...input }),
        auth: true,
      },
    )
  }

  /**
   * 删除事件定义本身；明细与统计保留，下一次上报会把定义重新建回来。
   * 要停用某个事件请改用归档。
   *
   * @param definitionId 事件定义 id
   */
  deleteEventDefinition(definitionId: string): Promise<DeleteSuccessResponse> {
    return this.http.request(
      "DELETE",
      "/admin/projects/{projectKey}/events/definitions/{definitionId}",
      {
        pathParams: { projectKey: this.http.requireProjectKey(), definitionId },
        auth: true,
      },
    )
  }

  /**
   * @param options 统计区间
   */
  getEventOverview(options: EventRangeOptions = {}): Promise<EventOverviewResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/events/stats/overview", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { ...options },
      auth: true,
    })
  }

  /**
   * 事件量趋势。`data` 是总量，永远返回；给了 `group_by` 时额外返回拆开的 `series`。
   *
   * @param options 区间、粒度与拆分维度
   */
  getEventTimeseries(options: EventTimeseriesOptions = {}): Promise<EventTimeseriesResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/events/stats/timeseries", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { ...options },
      auth: true,
    })
  }

  /**
   * 事件分布。`total` 是全量而非本页之和。
   *
   * @param options 区间与分布维度；`dimension: "property"` 时必须给 `property_key`
   */
  getEventBreakdown(options: EventBreakdownOptions = {}): Promise<EventBreakdownResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/events/stats/breakdown", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { ...options },
      auth: true,
    })
  }

  /**
   * 星期 × 小时活跃热力图，固定 168 格。按每条上报**来源国家**的时区折叠。
   *
   * @param options 区间与可选的单事件筛选
   */
  getEventHeatmap(
    options: EventRangeOptions & { event_name?: string } = {},
  ): Promise<EventHeatmapResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/events/stats/heatmap", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { ...options },
      auth: true,
    })
  }

  /**
   * 漏斗转化。只读接口，所需 scope 是 events:read。
   *
   * @param options 步骤数组（2 到 8 步）与转化窗口
   */
  getFunnel(options: FunnelOptions): Promise<FunnelResponse> {
    return this.http.request("POST", "/admin/projects/{projectKey}/events/analysis/funnel", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...options }),
      auth: true,
    })
  }

  /**
   * 留存矩阵。尚未走完的周期返回 null 而不是 0。
   *
   * @param options 起始事件、回访事件与周期设置
   */
  getRetention(options: RetentionOptions): Promise<RetentionResponse> {
    return this.http.request("POST", "/admin/projects/{projectKey}/events/analysis/retention", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...options }),
      auth: true,
    })
  }

  /**
   * 路径分析（桑基图边集）。默认按会话串联。
   *
   * @param options 起点、深度与分支数
   */
  getPaths(options: PathsOptions = {}): Promise<PathsResponse> {
    return this.http.request("POST", "/admin/projects/{projectKey}/events/analysis/paths", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...options }),
      auth: true,
    })
  }

  /**
   * 指标 DSL 求值。查询构建器与看板卡片共用这一个入口。
   *
   * @param query 指标定义；`formula` 支持 `A / B * 100` 形式的跨事件运算
   */
  runEventQuery(query: EventQuery): Promise<EventQueryResponse> {
    return this.http.request("POST", "/admin/projects/{projectKey}/events/analysis/query", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...query }),
      auth: true,
    })
  }

  /**
   * @returns 该项目保存的分析卡片，按 `sort_order` 升序
   */
  listDashboardCards(): Promise<DashboardCardListResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/events/dashboards/cards", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * @param input 卡片标题与指标 DSL；查询定义在写入时就完整校验，不合法直接 400
   */
  createDashboardCard(input: CreateDashboardCardInput): Promise<DashboardCardItem> {
    return this.http.request("POST", "/admin/projects/{projectKey}/events/dashboards/cards", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * @param cardId 卡片 id
   * @param input 要改的字段
   */
  updateDashboardCard(cardId: string, input: UpdateDashboardCardInput): Promise<DashboardCardItem> {
    return this.http.request(
      "PATCH",
      "/admin/projects/{projectKey}/events/dashboards/cards/{cardId}",
      {
        pathParams: { projectKey: this.http.requireProjectKey(), cardId },
        body: compact({ ...input }),
        auth: true,
      },
    )
  }

  /**
   * @param cardId 卡片 id
   */
  deleteDashboardCard(cardId: string): Promise<DeleteSuccessResponse> {
    return this.http.request(
      "DELETE",
      "/admin/projects/{projectKey}/events/dashboards/cards/{cardId}",
      {
        pathParams: { projectKey: this.http.requireProjectKey(), cardId },
        auth: true,
      },
    )
  }

  /**
   * 代最终用户删除其全部事件明细（GDPR Art.17）。小时汇总不在删除范围内。
   *
   * @param distinctId 要删除的匿名标识
   */
  deleteEventSubject(distinctId: string): Promise<EventSubjectDeleteResponse> {
    return this.http.request(
      "DELETE",
      "/admin/projects/{projectKey}/events/subjects/{distinctId}",
      {
        pathParams: { projectKey: this.http.requireProjectKey(), distinctId },
        auth: true,
      },
    )
  }

  // ---- GitHub Webhook ----

  /**
   * @returns 绑定项目的 webhook 配置；secret 不回显，只给末 6 位提示
   */
  getGithubWebhook(): Promise<GithubWebhookSettings> {
    return this.http.request("GET", "/admin/projects/{projectKey}/github-webhook", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * @param secret GitHub Webhook 表单里填的 secret 原文，16..256 字符
   * @returns 含完整 secret 的配置，仅此一次返回
   */
  setGithubWebhookSecret(secret: string): Promise<GithubWebhookSecretRevealed> {
    return this.http.request("PUT", "/admin/projects/{projectKey}/github-webhook", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: { secret },
      auth: true,
    })
  }

  /**
   * @returns 含新 secret 的配置；旧 secret 立即失效，记得同步改 GitHub
   */
  regenerateGithubWebhookSecret(): Promise<GithubWebhookSecretRevealed> {
    return this.http.request("POST", "/admin/projects/{projectKey}/github-webhook/regenerate", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * @returns 清除后的配置；接收端点随即拒绝所有推送
   */
  clearGithubWebhookSecret(): Promise<GithubWebhookSettings> {
    return this.http.request("DELETE", "/admin/projects/{projectKey}/github-webhook", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  // ---- GitHub App ----

  /**
   * 实例级 GitHub App 配置。仅管理员 JWT 可访问，API key 会得到 401。
   *
   * @returns 配置状态；私钥永不回读，只有指纹
   */
  getGithubAppConfig(): Promise<GithubAppConfig> {
    return this.http.request("GET", "/admin/github-app", { auth: true })
  }

  /**
   * @param input 要改的字段；private_key / webhook_secret 传空串表示清除
   */
  updateGithubAppConfig(input: UpdateGithubAppConfigInput): Promise<GithubAppConfig> {
    return this.http.request("PUT", "/admin/github-app", {
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * @returns 清空后的配置；所有项目的 GitHub App 功能随即失效
   */
  clearGithubAppConfig(): Promise<GithubAppConfig> {
    return this.http.request("DELETE", "/admin/github-app", { auth: true })
  }

  /**
   * @returns 绑定项目的 GitHub 集成配置
   */
  getGithubIntegration(): Promise<ProjectGithubIntegration> {
    return this.http.request("GET", "/admin/projects/{projectKey}/github-integration", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * @param input 要改的字段；打开功能开关要求实例级已启用对应功能
   */
  updateGithubIntegration(
    input: UpdateProjectGithubIntegrationInput,
  ): Promise<ProjectGithubIntegration> {
    return this.http.request("PUT", "/admin/projects/{projectKey}/github-integration", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * 预览目标仓库里的反馈 Issue 模板（模板来源为 repo 时使用）。
   *
   * @param options refresh=true 先作废服务端缓存再重新拉取
   * @returns 解析后的模板；拉取失败时 error 字段给出原因，不抛异常
   */
  getGithubIntegrationRepoTemplate(
    options: { refresh?: boolean } = {},
  ): Promise<FeedbackIssueRepoTemplatePreview> {
    return this.http.request(
      "GET",
      "/admin/projects/{projectKey}/github-integration/repo-template",
      {
        pathParams: { projectKey: this.http.requireProjectKey() },
        query: { refresh: options.refresh ? "true" : undefined },
        auth: true,
      },
    )
  }

  // ---- 条款文档 ----

  /**
   * 列出全部条款文档的设置视图（含生效正文、自定义草稿与内置原文）。
   *
   * 条款接口只接受管理员 JWT，API Key 会得到 401。不作用于绑定项目。
   */
  listTermsDocuments(): Promise<TermsDocumentConfigListResponse> {
    return this.http.request("GET", "/admin/terms/documents", { auth: true })
  }

  /**
   * @param slug 文档标识
   * @returns 单份条款文档的设置视图
   */
  getTermsDocument(slug: TermsDocumentSlug): Promise<TermsDocumentConfigView> {
    return this.http.request("GET", "/admin/terms/documents/{slug}", {
      pathParams: { slug },
      auth: true,
    })
  }

  /**
   * 部分更新条款文档，只修改传入的字段。
   *
   * `custom` 关闭时 `content` 仍会保存为草稿，重新打开即可继续编辑；
   * `content` 传空串表示清除草稿。
   *
   * @param slug 文档标识
   * @param input 自定义开关与正文
   */
  updateTermsDocument(
    slug: TermsDocumentSlug,
    input: UpdateTermsDocumentInput,
  ): Promise<TermsDocumentConfigView> {
    return this.http.request("PUT", "/admin/terms/documents/{slug}", {
      pathParams: { slug },
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * 恢复内置条款正文：关闭自定义开关并丢弃草稿，前台随即回到内置正文。
   *
   * @param slug 文档标识
   */
  resetTermsDocument(slug: TermsDocumentSlug): Promise<TermsDocumentConfigView> {
    return this.http.request("DELETE", "/admin/terms/documents/{slug}", {
      pathParams: { slug },
      auth: true,
    })
  }
}
