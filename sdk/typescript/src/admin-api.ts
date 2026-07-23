import { compact, type HttpClient } from "./http"
import type {
  ActionItem,
  ActionListResponse,
  ActionRecordItem,
  ActionRecordListResponse,
  ActionStatistics,
  AnnouncementItem,
  AnnouncementListResponse,
  AnnouncementStatistics,
  CreateActionInput,
  CreateAnnouncementInput,
  CreateFeedbackInput,
  CreateLogInput,
  CreateProjectInput,
  CreateVersionInput,
  DeleteSuccessResponse,
  FeedbackItem,
  FeedbackListResponse,
  FeedbackStatistics,
  GithubReleaseVersionPreview,
  GithubRepoProjectPreview,
  GithubWebhookSecretRevealed,
  GithubWebhookSettings,
  ListLogsOptions,
  LogItem,
  LogListResponse,
  LogStatistics,
  PageOptions,
  ProjectItem,
  ProjectListResponse,
  ProjectStatistics,
  UpdateActionInput,
  UpdateAnnouncementInput,
  UpdateFeedbackInput,
  UpdateProjectInput,
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
   * @param input 要改的字段；提交 `project_key` 会改键，改完记得 `setProjectKey`
   */
  updateProject(input: UpdateProjectInput): Promise<ProjectItem> {
    return this.http.request("PATCH", "/admin/projects/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...input }),
      auth: true,
    })
  }

  deleteProject(): Promise<DeleteSuccessResponse> {
    return this.http.request("DELETE", "/admin/projects/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
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
   * @param options 分页参数
   */
  listFeedbacks(options: PageOptions = {}): Promise<FeedbackListResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/feedbacks", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset },
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

  // ---- 行为 ----

  /**
   * @param options 分页参数
   */
  listActions(options: PageOptions = {}): Promise<ActionListResponse> {
    return this.http.request("GET", "/admin/projects/{projectKey}/actions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset },
      auth: true,
    })
  }

  /**
   * 在绑定项目下创建行为定义。
   *
   * @param input 行为定义字段
   */
  createAction(input: CreateActionInput): Promise<ActionItem> {
    return this.http.request("POST", "/admin/projects/actions", {
      body: compact({ ...input, project_key: this.http.requireProjectKey() }),
      auth: true,
    })
  }

  /**
   * @param actionId 行为定义 id
   * @param input 要改的字段
   */
  updateAction(actionId: string, input: UpdateActionInput): Promise<ActionItem> {
    return this.http.request("PATCH", "/admin/actions/{action_id}", {
      pathParams: { action_id: actionId },
      body: compact({ ...input }),
      auth: true,
    })
  }

  /**
   * @param actionId 行为定义 id
   */
  deleteAction(actionId: string): Promise<DeleteSuccessResponse> {
    return this.http.request("DELETE", "/admin/actions/{action_id}", {
      pathParams: { action_id: actionId },
      auth: true,
    })
  }

  /**
   * @param actionId 行为定义 id
   * @param options 分页参数
   */
  listActionRecords(
    actionId: string,
    options: PageOptions = {},
  ): Promise<ActionRecordListResponse> {
    return this.http.request("GET", "/admin/actions/{action_id}", {
      pathParams: { action_id: actionId },
      query: { limit: options.limit, offset: options.offset },
      auth: true,
    })
  }

  /**
   * @param actionRecordId 行为记录 id
   */
  getActionRecord(actionRecordId: string): Promise<ActionRecordItem> {
    return this.http.request("GET", "/admin/actions/record/{action_record_id}", {
      pathParams: { action_record_id: actionRecordId },
      auth: true,
    })
  }

  /**
   * @returns 行为定义总数
   */
  getActionStatistics(): Promise<ActionStatistics> {
    return this.http.request("GET", "/admin/actions/statistics", { auth: true })
  }

  /**
   * @returns 行为记录总数
   */
  getActionRecordStatistics(): Promise<ActionStatistics> {
    return this.http.request("GET", "/admin/actions/record/statistics", { auth: true })
  }

  // ---- GitHub Webhook ----

  /**
   * @returns 绑定项目的 webhook 配置；secret 不回显，只给末 4 位提示
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
}
