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
  /** 改名后保留的旧 Project Key（别名），均可访问到本项目。新到旧排序。 */
  aliases: string[]
  /**
   * 本次返回的 name / description 实际来自哪个语言的译文；null 表示项目自身的值
   * （没提语言偏好、语言未注册，或该语言的译文两个字段都留空）。
   */
  locale: string | null
  /** 项目的全部译文，仅管理接口返回。 */
  translations?: ProjectTranslation[]
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

/**
 * 某个语言下的覆盖设置，三个维度彼此独立：title 留空即用默认标题、content 留空即用
 * 默认正文、is_hidden 为真则该语言下整条公告不返回。写入时三者至少要有一项有意义。
 */
export type AnnouncementTranslation = {
  locale: string
  title: string | null
  content: string | null
  is_hidden: boolean
}

/** 写入译文时用：三个覆盖项都可省略，但不能全省。 */
export type AnnouncementTranslationInput = {
  locale: string
  title?: string | null
  content?: string | null
  is_hidden?: boolean
}

export type AnnouncementItem = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  is_hidden: boolean
  platforms: Platform[]
  author: string | null
  /** 可见版本范围下界（含），null 表示该端不限。 */
  min_comparable_version: string | null
  /** 可见版本范围上界（含），null 表示该端不限。 */
  max_comparable_version: string | null
  /**
   * 本次返回的 title / content 实际来自哪个语言的译文；null 表示默认内容
   * （没提语言偏好、语言未注册，或该公告没有这个语言的译文）。
   */
  locale: string | null
  /** 全部译文，仅管理接口返回。 */
  translations?: AnnouncementTranslation[]
  published_at: number
  created_at: number
  updated_at: number
}

export type FeedbackItem = {
  id: string
  user_id: string | null
  rating: number | null
  content: string
  /** 提交者留下的联系方式；未填写为 null。 */
  contact: string | null
  /** 隐藏的反馈默认不出现在后台列表里，评分仍计入统计。 */
  is_hidden: boolean
  platform: Platform | null
  platform_version: string | null
  custom_data: JsonObject | null
  /** 是否已转成 GitHub Issue。转发失败的提交不会落库，所以拿到的记录一定是成功的那些。 */
  forwarded_to_github: boolean
  /** 生成的 Issue 编号与链接；未转发时都是 null。 */
  github_issue_number: number | null
  github_issue_url: string | null
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

export type ProjectAliasItem = {
  alias: string
  created_at: number
}

export type ProjectAliasListResponse = {
  data: ProjectAliasItem[]
}

/** 项目注册的语言。只有注册过的语言能存译文，也只有它们的偏好被公开端认账。 */
export type ProjectLocaleItem = {
  locale: string
  /**
   * 同义标签：客户端提交其中任何一个都等价于命中主标签（多对一）。
   * 只认显式列出的，不做 `en-*` 前缀自动回退。
   */
  aliases: string[]
  label: string | null
  created_at: number
}

/** 某个语言下项目名称与描述的覆盖设置，字段留空即回落项目自身的值。 */
export type ProjectTranslation = {
  locale: string
  name: string | null
  description: string | null
}

/** 写入项目译文时用：两个覆盖项都可省略，但不能全省。 */
export type ProjectTranslationInput = {
  locale: string
  name?: string | null
  description?: string | null
}

export type ProjectLocaleListResponse = {
  data: ProjectLocaleItem[]
}

export type CreateProjectLocaleInput = {
  /** 如 zh-CN / en-US。已注册（主标签或同义标签命中，均忽略大小写）时只更新其余字段。 */
  locale: string
  /**
   * 同义标签，例如主标签 `en` 列出 `en-US` / `en-GB`。
   * 与本项目其它语言的主标签或同义标签相撞会 400。
   */
  aliases?: string[]
  /** 后台展示名，如「简体中文」。 */
  label?: string
}
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
  /** 已存 secret 的字符数，供渲染与真实长度一致的掩码。 */
  secret_length: number | null
  secret_updated_at: number | null
}

export type GithubWebhookSecretRevealed = GithubWebhookSettings & {
  /** 完整 secret，只在设置或重新生成时返回一次。 */
  secret: string
}

/** 可启用的 GitHub App 功能。 */
export type GithubAppFeature = "feedback_issue" | "comment_commands"

/** 实例级 GitHub App 配置视图。私钥永不回读，仅返回指纹。 */
export type GithubAppConfig = {
  configured: boolean
  app_id: string | null
  has_private_key: boolean
  private_key_fingerprint: string | null
  private_key_updated_at: number | null
  has_webhook_secret: boolean
  webhook_secret_hint: string | null
  /** 已存 secret 的字符数，供渲染与真实长度一致的掩码。 */
  webhook_secret_length: number | null
  webhook_secret_updated_at: number | null
  webhook_payload_path: string
  enabled_features: GithubAppFeature[]
  /** 关闭时忽略下面两个模板字段，实例缺省即内置模板。 */
  feedback_issue_custom_template: boolean
  feedback_issue_title_template: string | null
  feedback_issue_body_template: string | null
  /** 内置模板原文，可直接作为自定义模板编辑器的初值。内置正文不含评分。 */
  builtin_feedback_issue_title_template: string
  builtin_feedback_issue_body_template: string
  /** 模板可用变量名清单。 */
  feedback_issue_template_variables: string[]
  updated_at: number | null
}

/** 部分更新实例级 GitHub App 配置。private_key / webhook_secret 传空串表示清除。 */
export type UpdateGithubAppConfigInput = {
  app_id?: string
  /** App 私钥 PEM 原文，只写不读。 */
  private_key?: string
  webhook_secret?: string
  enabled_features?: GithubAppFeature[]
  /** 关闭时下面两个模板字段被忽略，实例缺省回到内置模板。 */
  feedback_issue_custom_template?: boolean
  feedback_issue_title_template?: string
  feedback_issue_body_template?: string
}

/**
 * 反馈转发 Issue 的模板来源。
 * - `inherit`：跟随实例级模板
 * - `custom`：使用项目自己的 feedback_issue_*_template
 * - `repo`：读目标仓库里的模板文件，内容带缓存定期重取
 */
export type FeedbackIssueTemplateSource = "inherit" | "custom" | "repo"

/** 仓库模板文件的拉取结果。拉不到时 error 给出原因，其余字段为空。 */
export type FeedbackIssueRepoTemplatePreview = {
  path: string
  ref: string | null
  fetched_at: number | null
  title_template: string | null
  body_template: string | null
  /** 模板 front matter 里声明的标签，优先于项目上单独配置的标签。 */
  labels: string[]
  error: string | null
}

/** 评论命令定义：/verhub-<name> <args> → workflow_dispatch。 */
export type GithubCommandDefinition = {
  name: string
  workflow: string
  ref: string
  /** 参数写入 workflow inputs 的键名，缺省 "args"。 */
  input?: string
}

/** 项目级 GitHub 集成配置视图。*_active 是综合实例配置后的实际生效状态。 */
export type ProjectGithubIntegration = {
  project_key: string
  repo_full_name: string | null
  /** 只表示「允许转发」；是否转发由提交者逐条选择。 */
  feedback_issue_enabled: boolean
  feedback_issue_active: boolean
  feedback_issue_template_source: FeedbackIssueTemplateSource
  feedback_issue_template_repo_path: string | null
  feedback_issue_template_repo_ref: string | null
  feedback_issue_title_template: string | null
  feedback_issue_body_template: string | null
  feedback_issue_labels: string[]
  comment_commands_enabled: boolean
  comment_commands_active: boolean
  command_allowed_associations: string[]
  command_allowed_users: string[]
  commands: GithubCommandDefinition[]
  updated_at: number | null
}

/** 部分更新项目级 GitHub 集成配置。repo_full_name 传空串表示清除并连带关闭依赖开关。 */
export type UpdateProjectGithubIntegrationInput = {
  repo_full_name?: string
  feedback_issue_enabled?: boolean
  feedback_issue_template_source?: FeedbackIssueTemplateSource
  /** source=repo 时必填，仓库内的相对路径。 */
  feedback_issue_template_repo_path?: string
  feedback_issue_template_repo_ref?: string
  feedback_issue_title_template?: string
  feedback_issue_body_template?: string
  feedback_issue_labels?: string[]
  comment_commands_enabled?: boolean
  command_allowed_associations?: string[]
  command_allowed_users?: string[]
  commands?: GithubCommandDefinition[]
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
  /**
   * 客户端当前版本号，用来筛掉不在可见版本范围内的公告。
   * **不传时，所有设了可见版本范围的公告都不会返回。**
   */
  version?: string
  /**
   * 语言偏好。命中项目注册的语言且该公告有译文时返回译文，否则返回默认内容。
   * 返回项的 `locale` 字段标出实际语言（null 即默认内容）。
   */
  locale?: string
}

/** 最新公告接口的筛选项，与列表接口同义。 */
export type LatestAnnouncementOptions = {
  platform?: Platform
  version?: string
  locale?: string
}

export type ListFeedbacksOptions = PageOptions & {
  /** 是否把已隐藏的反馈一起列出来，默认 false。 */
  include_hidden?: boolean
}

export type CreateFeedbackInput = {
  content: string
  user_id?: string
  /** 评分，1..5。 */
  rating?: number
  /** 联系方式，邮箱 / 手机号 / IM 账号皆可。 */
  contact?: string
  /**
   * 由提交者选择是否把这条反馈转发成 GitHub Issue，默认 false。
   * 传 true 时 contact 必填（SDK 本地就会拒绝）且受单 IP 转发限流约束；
   * Issue 建失败时这条反馈不会被记录。仅公开提交接口生效。
   */
  forward_to_github?: boolean
  /** 隐藏后后台列表默认不返回，评分仍计入统计。 */
  is_hidden?: boolean
  platform?: Platform
  /** 系统版本明细，如 `11` / `ubuntu 24.04`。 */
  platform_version?: string
  custom_data?: JsonObject
}

export type UpdateFeedbackInput = Partial<CreateFeedbackInput>

/** 反馈提交选项，决定客户端是否显示「转发到 GitHub Issue」的勾选框。 */
export type PublicFeedbackOptions = {
  project_key: string
  github_forward_available: boolean
  /** 选择转发时联系方式是否必填；转发不可用时恒为 false。 */
  contact_required_for_forward: boolean
}

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
  /**
   * 项目名称与描述的译文。传了就整体替换全部译文，空数组即清空；不传则不动。
   * 语言必须先在项目里注册（同义标签同样算命中），否则整个请求 400。
   */
  translations?: ProjectTranslationInput[]
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
  /** 可见版本范围下界（含）。留空即该端不限。 */
  min_comparable_version?: string | null
  /** 可见版本范围上界（含）。留空即该端不限。 */
  max_comparable_version?: string | null
  /**
   * 译文集合。传了就整体替换该公告的全部译文，空数组即清空；不传则不动。
   * 语言必须先在项目里注册，否则整个请求 400。
   */
  translations?: AnnouncementTranslationInput[]
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
