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
  /** 事件采集总开关。关掉后采集端点仍返回 202，但不入库、不计数。 */
  event_collection_enabled: boolean
  /** 事件明细保留天数，1..365，默认 90。 */
  event_retention_days: number
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
  /** 是否已转成 GitHub Issue。转发失败的提交不落库，因此列表里的记录都是转发成功的。 */
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

/** 事件定义。由采集端自动发现，没有对应的创建接口。 */
export type EventDefinitionItem = {
  event_definition_id: string
  project_key: string
  /** 客户端上报时使用的键，归一化后的小写形式。不可修改。 */
  name: string
  /** 给管理端看的名字；为空时界面回退到 name。 */
  display_name: string | null
  description: string | null
  archived: boolean
  first_seen_time: number
  last_seen_time: number
  /** 查询区间内的上报量。 */
  range_count: number
}

/** 数据主体导出里的一条事件明细。 */
export type EventSubjectRecord = {
  event_name: string
  event_id: string
  session_id: string | null
  occurred_at: number
  received_at: number
  properties: JsonObject | null
  /** 默认为匿名化后的地址（IPv4 截末段、IPv6 截末 80 位）。 */
  ip: string | null
  user_agent: string | null
  country_code: string | null
  country_name: string | null
  region_name: string | null
  city: string | null
  platform: Platform | null
  platform_version: string | null
}

export type EventSubjectExport = {
  distinct_id: string
  total: number
  data: EventSubjectRecord[]
}

/** 数据主体删除的结果。 */
export type EventSubjectDeleteResponse = {
  success: boolean
  /** 删除的事件明细条数。 */
  deleted: number
}

// ---- 条款文档 ----

/** 条款文档标识：`privacy-policy` 隐私政策，`sdk-compliance` SDK 合规性文档。 */
export type TermsDocumentSlug = "privacy-policy" | "sdk-compliance"

/** 条款正文的来源：`builtin` 为内置正文，`custom` 为实例自定义正文。 */
export type TermsDocumentSource = "builtin" | "custom"

/** 条款文档的标题与来源，不含正文。 */
export type TermsDocumentSummary = {
  slug: TermsDocumentSlug
  title: string
  /** 一句话说明，用于文档间导航。 */
  summary: string
  source: TermsDocumentSource
  /** 正文最后修订时间（Unix 秒）。 */
  updated_at: number
}

export type TermsDocumentListResponse = {
  data: TermsDocumentSummary[]
}

/** 条款文档正文视图。 */
export type TermsDocumentView = TermsDocumentSummary & {
  /** 生效的正文（Markdown）。 */
  content: string
}

/** 内置正文里待填的占位符。 */
export type TermsPlaceholder = {
  /** 正文中的写法为 `{{key}}`。 */
  key: string
  /** 填空表单的字段名。 */
  label: string
  /** 填写要求。 */
  hint: string
  /** 预填值。 */
  example: string
  /** false 表示留空也允许发布。 */
  required: boolean
}

/** 条款文档的管理端视图，含生效正文、自定义草稿与内置原文。 */
export type TermsDocumentConfigView = {
  slug: TermsDocumentSlug
  title: string
  summary: string
  /** 关闭时前台展示内置正文，草稿仍留在库里。 */
  custom: boolean
  /** 当前对外生效的正文。 */
  content: string
  /** 库里保存的自定义草稿；从未编辑过为 null。 */
  custom_content: string | null
  custom_updated_at: number | null
  /** 内置正文原文。 */
  builtin_content: string
  builtin_updated_at: number
  updated_at: number | null
  /** 内置正文里待填的占位符，按出现顺序。 */
  placeholders: TermsPlaceholder[]
}

export type TermsDocumentConfigListResponse = {
  data: TermsDocumentConfigView[]
}

/** 部分更新条款文档：只修改传入的字段。 */
export type UpdateTermsDocumentInput = {
  /** 是否启用自定义正文。 */
  custom?: boolean
  /** 自定义正文（Markdown），最长 65536；传空串清除草稿。 */
  content?: string
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
export type EventDefinitionListResponse = ListResponse<EventDefinitionItem>

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

/** 采集接口的逐条回执。`suppressed` 为 true 表示本次采集被退出信号或项目开关拦下。 */
export type IngestEventsResponse = {
  accepted: number
  skipped: number
  suppressed: boolean
}

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

/** 属性筛选条件。`op` 是闭集，值一律以参数进入服务端查询。 */
export type EventFilter = {
  /** 属性名。只支持 properties 的第一层键。 */
  property: string
  op:
    | "eq"
    | "neq"
    | "in"
    | "not_in"
    | "contains"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "exists"
    | "not_exists"
  value?: string | number | boolean | Array<string | number | boolean>
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
  /** 事件采集总开关，默认 true。关掉后采集端点仍返回 202，但不入库、不计数。 */
  event_collection_enabled?: boolean
  /** 事件明细保留天数，1..365，默认 90。 */
  event_retention_days?: number
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

/** 事件定义只能补充展示信息或归档——事件名是客户端上报时使用的键，不可修改。 */
export type UpdateEventDefinitionInput = {
  display_name?: string
  description?: string
  archived?: boolean
}

// ---- 事件分析 ----

/** 统计查询的公共区间参数。省略时服务端默认最近 7 天。 */
export type EventRangeOptions = {
  start_time?: number
  end_time?: number
  /** 相对 UTC 的分钟偏移，即 `-new Date().getTimezoneOffset()`。 */
  tz_offset_minutes?: number
}

export type ListEventDefinitionsOptions = EventRangeOptions &
  PageOptions & {
    search?: string
    /** 默认不含已归档的事件。 */
    include_archived?: boolean
  }

export type EventOverviewResponse = {
  start_time: number
  end_time: number
  /** 事件总量。 */
  total: number
  /** 独立标识数。 */
  unique_users: number
  unique_sessions: number
  event_types: number
}

export type EventTimeseriesPoint = { bucket: number; count: number }
export type EventSeries = { key: string; data: EventTimeseriesPoint[] }

export type EventTimeseriesOptions = EventRangeOptions & {
  granularity?: "hour" | "day"
  event_name?: string
  group_by?: "event" | "platform" | "region"
  limit?: number
}

export type EventTimeseriesResponse = {
  start_time: number
  end_time: number
  granularity: "hour" | "day"
  tz_offset_minutes: number
  event_name: string | null
  group_by: "event" | "platform" | "region" | null
  /** 总量序列，空桶补零。 */
  data: EventTimeseriesPoint[]
  /** 按 group_by 拆开的序列；未指定 group_by 时为 null。 */
  series: EventSeries[] | null
}

export type EventCountBucket = { key: string; label: string; count: number }

export type EventBreakdownOptions = EventRangeOptions & {
  dimension?: "event" | "platform" | "region" | "property"
  /** dimension 为 property 时必填。 */
  property_key?: string
  event_name?: string
  limit?: number
}

export type EventBreakdownResponse = {
  start_time: number
  end_time: number
  dimension: "event" | "platform" | "region" | "property"
  property_key: string | null
  /** 全量总数，不是本页之和。 */
  total: number
  data: EventCountBucket[]
}

export type EventHeatmapCell = { weekday: number; hour: number; count: number }

export type EventHeatmapResponse = {
  start_time: number
  end_time: number
  tz_offset_minutes: number
  /** 固定 168 格，含无数据的空格。 */
  data: EventHeatmapCell[]
}

export type FunnelStep = {
  event_name: string
  filters?: EventFilter[]
}

export type FunnelOptions = EventRangeOptions & {
  steps: FunnelStep[]
  /** 从**第一步**算起的转化窗口（秒），不是相邻两步之间。默认 7 天。 */
  window_seconds?: number
}

export type FunnelStepResult = {
  step: number
  event_name: string
  users: number
  /** 相对上一步的转化率，0 到 1；第一步恒为 1。 */
  conversion_rate: number
  total_conversion_rate: number
  dropped: number
}

export type FunnelResponse = {
  start_time: number
  end_time: number
  window_seconds: number
  data: FunnelStepResult[]
}

export type RetentionOptions = EventRangeOptions & {
  /** 把人纳入队列的起始事件。 */
  start_event: string
  /** 判定「回来了」的事件；省略则任意事件都算回访。 */
  return_event?: string
  period?: "day" | "week"
  periods?: number
}

export type RetentionCell = { period: number; users: number; rate: number }

export type RetentionCohort = {
  cohort: number
  size: number
  /** 尚未走完的周期为 null，不是 0。 */
  cells: Array<RetentionCell | null>
}

export type RetentionResponse = {
  start_time: number
  end_time: number
  period: "day" | "week"
  periods: number
  cohorts: RetentionCohort[]
}

export type PathsOptions = EventRangeOptions & {
  start_event?: string
  depth?: number
  branch_limit?: number
  /** `session` 按会话串联（默认），`user` 跨会话按人串联。 */
  scope?: "session" | "user"
}

export type PathEdge = {
  step: number
  from_event: string
  to_event: string
  count: number
}

export type PathsResponse = {
  start_time: number
  end_time: number
  scope: "session" | "user"
  depth: number
  /** 有分支被并入「（其他）」时为 true。 */
  truncated: boolean
  data: PathEdge[]
}

export type EventMeasure = "count" | "unique_users" | "count_per_user"

export type DslEvent = {
  name: string
  /** 单个大写字母，公式里靠它引用。 */
  alias: string
  measure?: EventMeasure
  filters?: EventFilter[]
}

export type DslGroupBy = {
  kind: "property" | "platform" | "region" | "event"
  /** kind 为 property 时必填。 */
  key?: string
}

/** 指标 DSL：查询构建器产出的结构，也是看板卡片保存下来的内容。 */
export type EventQuery = EventRangeOptions & {
  type: "timeseries" | "breakdown" | "value"
  events: DslEvent[]
  /** 作用于全部事件的公共条件，与各事件自己的 filters 取交集。 */
  filters?: EventFilter[]
  /** 跨事件运算，例如 "A / B * 100"。只认别名、数字与 + - * / ( )。 */
  formula?: string
  group_by?: DslGroupBy
  granularity?: "hour" | "day"
  limit?: number
}

/** 形状随 query.type 变化。 */
export type EventQueryResponse = {
  start_time: number
  end_time: number
  type: "timeseries" | "breakdown" | "value"
  series?: EventSeries[]
  total?: number
  buckets?: EventCountBucket[]
  values?: Record<string, number>
  result?: number
}

export type DashboardCardItem = {
  card_id: string
  project_key: string
  title: string
  description: string | null
  query: EventQuery
  layout: JsonObject | null
  sort_order: number
  created_time: number
  updated_time: number
}

export type DashboardCardListResponse = ListResponse<DashboardCardItem>

export type CreateDashboardCardInput = {
  title: string
  description?: string
  query: EventQuery
  /** 前端网格布局，服务端只存不解析。 */
  layout?: JsonObject
  sort_order?: number
}

export type UpdateDashboardCardInput = Partial<CreateDashboardCardInput>
