/**
 * 请求与响应类型。
 *
 * 字段与 `verhub.openapi.yaml` 的 schema 一一对应，契约里标注 nullable 的在
 * 这里是 `| null`。输入类型上，`undefined` 表示不提交该字段（更新接口保持
 * 原值），显式的 `null` 表示提交 JSON null（更新接口把字段置空）。
 */

/** 平台取值。提交时大小写不敏感，返回时统一小写；`others` 是兜底。 */
export type Platform = "windows" | "linux" | "macos" | "ios" | "android" | "web" | "others"

/** 日志等级：0=debug 1=info 2=warning 3=error。 */
export type LogLevel = 0 | 1 | 2 | 3

/** 任意 JSON 对象，用于 custom_data / device_info 这类自由字段。 */
export type JsonObject = Record<string, unknown>

// ---- 响应 ----

export type HealthResponse = {
  status: string
  timestamp: number
}

export type DeleteSuccessResponse = {
  success: boolean
}

export type VersionDownloadLink = {
  url: string
  name?: string
  platform?: string
}

export type ProjectItem = {
  id: string
  project_key: string
  name: string
  repo_url: string | null
  description: string | null
  author: string | null
  author_homepage_url: string | null
  icon_url: string | null
  website_url: string | null
  docs_url: string | null
  published_at: number | null
  optional_update_min_comparable_version: string | null
  optional_update_max_comparable_version: string | null
  stats_retention_days: number
  created_at: number
  updated_at: number
}

export type VersionItem = {
  id: string
  version: string
  comparable_version: string
  title: string | null
  content: string | null
  download_url: string | null
  download_links: VersionDownloadLink[]
  forced: boolean
  is_latest: boolean
  is_preview: boolean
  is_milestone: boolean
  is_deprecated: boolean
  platform: Platform | null
  platforms: Platform[]
  custom_data: JsonObject | null
  published_at: number
  created_at: number
}

export type AnnouncementItem = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  is_hidden: boolean
  platforms: Platform[]
  author: string | null
  published_at: number
  created_at: number
  updated_at: number
}

export type FeedbackItem = {
  id: string
  user_id: string | null
  rating: number | null
  content: string
  platform: Platform | null
  platform_version: string | null
  custom_data: JsonObject | null
  ip: string | null
  user_agent: string | null
  country_code: string | null
  country_name: string | null
  region_name: string | null
  city: string | null
  created_at: number
}

export type LogItem = {
  id: string
  level: number
  content: string
  device_info: JsonObject | null
  custom_data: JsonObject | null
  ip: string | null
  user_agent: string | null
  country_code: string | null
  country_name: string | null
  region_name: string | null
  city: string | null
  platform: Platform | null
  platform_version: string | null
  created_at: number
}

export type ActionItem = {
  action_id: string
  project_key: string
  name: string
  description: string
  custom_data: JsonObject | null
  created_time: number
}

export type ActionRecordItem = {
  action_record_id: string
  action_id: string
  created_time: number
  http: JsonObject | null
  custom_data: JsonObject | null
  ip: string | null
  user_agent: string | null
  country_code: string | null
  country_name: string | null
  region_name: string | null
  city: string | null
  platform: Platform | null
  platform_version: string | null
}

export type ListResponse<T> = {
  total: number
  data: T[]
}

export type ProjectListResponse = ListResponse<ProjectItem>
export type VersionListResponse = ListResponse<VersionItem>
export type AnnouncementListResponse = ListResponse<AnnouncementItem>
export type FeedbackListResponse = ListResponse<FeedbackItem>
export type LogListResponse = ListResponse<LogItem>
export type ActionListResponse = ListResponse<ActionItem>
export type ActionRecordListResponse = ListResponse<ActionRecordItem>

export type CheckUpdateResponse = {
  should_update: boolean
  /** 是否为强制更新。命中项目级可选更新范围之外时为 true。 */
  required: boolean
  reason_codes: string[]
  current_version: string | null
  current_comparable_version: string
  latest_version: VersionItem
  latest_preview_version: VersionItem | null
  /** 建议升级到的目标版本；无可升级目标时为 null。 */
  target_version: VersionItem | null
  milestone: {
    current: boolean
    latest: boolean
    /** 目标版本是否因里程碑拦截而被下调；命中时 reason_codes 含 milestone_guard。 */
    target_is_milestone: boolean
  }
}

export type ProjectStatistics = { count: number }

export type VersionStatistics = {
  total_versions: number
  total_projects: number
  forced_versions: number
  latest_version_time: number | null
  first_version_time: number | null
}

export type AnnouncementStatistics = { count: number; pinned_count: number }

export type FeedbackStatistics = { count: number; rate_count: number; rate_avg: number | null }

export type LogStatistics = {
  count: number
  debug_count: number
  info_count: number
  warning_count: number
  error_count: number
}

export type ActionStatistics = { count: number }

export type GithubWebhookSettings = {
  enabled: boolean
  payload_path: string
  content_type: string
  secret_hint: string | null
  secret_updated_at: number | null
}

export type GithubWebhookSecretRevealed = GithubWebhookSettings & {
  /** 完整 secret，只在设置或重新生成时返回一次。 */
  secret: string
}

export type GithubRepoProjectPreview = {
  project_key: string
  name: string
  repo_url: string
  description: string | null
  author: string | null
  author_homepage_url: string | null
  icon_url: string | null
  website_url: string | null
  docs_url: string | null
  published_at: number | null
}

export type GithubReleaseVersionPreview = {
  version: string
  comparable_version: string
  title?: string
  content?: string
  download_url?: string
  download_links?: VersionDownloadLink[]
  forced: boolean
  is_latest: boolean
  is_preview: boolean
  is_milestone?: boolean
  is_deprecated: boolean
  platform?: Platform | null
  platforms: Platform[]
  published_at: number
  custom_data: JsonObject
}

export type VersionImportResult = {
  imported: number
  skipped: number
  scanned: number
}

// ---- 请求 ----

export type PageOptions = {
  /** 分页大小，1..100，默认 20。 */
  limit?: number
  /** 分页偏移，默认 0。 */
  offset?: number
}

export type CheckUpdateOptions = {
  /** 当前语义化版本号。 */
  current_version?: string
  /** 当前可比较版本号，如 `1.20.326`；与 current_version 同时提交时以此为准。 */
  current_comparable_version?: string
  /** 是否把 preview 版本纳入比较候选。 */
  include_preview?: boolean
}

export type ListAnnouncementsOptions = PageOptions & {
  /** 只取投放到该平台的公告。 */
  platform?: Platform
}

export type CreateFeedbackInput = {
  content: string
  user_id?: string
  /** 评分，1..5。 */
  rating?: number
  platform?: Platform
  /** 系统版本明细，如 `11` / `ubuntu 24.04`。 */
  platform_version?: string
  custom_data?: JsonObject
}

export type UpdateFeedbackInput = Partial<CreateFeedbackInput>

export type UploadLogInput = {
  level: LogLevel
  content: string
  /** 设备信息，客户端自报。 */
  device_info?: JsonObject
  custom_data?: JsonObject
}

export type CreateLogInput = UploadLogInput & {
  /** 补录没有客户端可推断，平台只能显式指定。 */
  platform?: Platform
  platform_version?: string
}

export type CreateActionRecordInput = {
  /** 行为定义 ID，需先在后台创建。 */
  action_id: string
  custom_data?: JsonObject
}

export type CreateProjectInput = {
  /** 新项目标识；省略则用客户端绑定的 projectKey。 */
  project_key?: string
  name: string
  repo_url?: string
  description?: string
  author?: string
  author_homepage_url?: string
  icon_url?: string
  website_url?: string
  docs_url?: string
  published_at?: number
  optional_update_min_comparable_version?: string
  optional_update_max_comparable_version?: string
  /** 请求统计保留天数，1..365，默认 365。 */
  stats_retention_days?: number
}

export type UpdateProjectInput = Partial<CreateProjectInput>

export type CreateVersionInput = {
  /** 展示用版本号，如 `v1.2.0`。 */
  version: string
  /** 可比较版本号，如 `1.2.0` / `1.2.0-rc.2`。 */
  comparable_version: string
  title?: string
  content?: string
  /** 传 null 清空下载地址。 */
  download_url?: string | null
  download_links?: VersionDownloadLink[]
  is_latest?: boolean
  is_preview?: boolean
  /** 里程碑版本会拦截跨里程碑的直接升级。 */
  is_milestone?: boolean
  is_deprecated?: boolean
  published_at?: number
  platform?: Platform
  platforms?: Platform[]
  custom_data?: JsonObject
}

export type UpdateVersionInput = Partial<CreateVersionInput>

/** 版本号取自路径，因此这里不再接受 `version`。 */
export type UpsertVersionInput = Omit<UpdateVersionInput, "version">

export type CreateAnnouncementInput = {
  title: string
  content: string
  is_pinned?: boolean
  /** 隐藏后公开接口取不到。 */
  is_hidden?: boolean
  /** 投放平台，最多 8 个；留空表示全平台。 */
  platforms?: Platform[]
  author?: string
  published_at?: number
}

export type UpdateAnnouncementInput = Partial<CreateAnnouncementInput>

export type ListLogsOptions = PageOptions & {
  level?: LogLevel
  /** 起始时间（Unix 秒）。 */
  start_time?: number
  /** 结束时间（Unix 秒）。 */
  end_time?: number
}

/** 行为定义在绑定项目下创建，`project_key` 由客户端注入，不在此结构里。 */
export type CreateActionInput = {
  name: string
  description: string
  custom_data?: JsonObject
}

export type UpdateActionInput = Partial<CreateActionInput>
