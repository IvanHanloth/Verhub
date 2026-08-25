"""
响应模型。

全部是 ``TypedDict``：运行时就是普通 dict，不做校验也不做拷贝，只为编辑器
补全和静态检查服务。字段与 ``verhub.openapi.yaml`` 的 schema 一一对应，
契约里标注 nullable 的在这里是 ``Optional``。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict

#: 平台取值。提交时大小写不敏感，返回时统一小写；``others`` 是兜底。
PLATFORMS = ("windows", "linux", "macos", "ios", "android", "web", "others")

Platform = str

#: 日志等级。与契约里的 0..3 对应。
LOG_LEVEL_DEBUG = 0
LOG_LEVEL_INFO = 1
LOG_LEVEL_WARNING = 2
LOG_LEVEL_ERROR = 3


class HealthResponse(TypedDict):
    status: str
    timestamp: int


class DeleteSuccessResponse(TypedDict):
    success: bool


class VersionDownloadLink(TypedDict, total=False):
    url: str
    name: str
    platform: str


class _ProjectItemBase(TypedDict):
    id: str
    project_key: str
    name: str
    repo_url: Optional[str]
    description: Optional[str]
    author: Optional[str]
    author_homepage_url: Optional[str]
    icon_url: Optional[str]
    website_url: Optional[str]
    docs_url: Optional[str]
    published_at: Optional[int]
    optional_update_min_comparable_version: Optional[str]
    optional_update_max_comparable_version: Optional[str]
    stats_retention_days: int
    #: 事件采集总开关。关掉后采集端点仍返回 202，但不入库、不计数。
    event_collection_enabled: bool
    #: 事件明细保留天数，默认 90。
    event_retention_days: int
    # 改名后保留的旧 Project Key（别名），均可访问到本项目。新到旧排序。
    aliases: List[str]
    #: 本次返回的 name / description 实际来自哪个语言的译文；None 表示项目自身的值
    #: （没提语言偏好、语言未注册，或该语言的译文两个字段都留空）。
    locale: Optional[str]
    created_at: int
    updated_at: int


class ProjectItem(_ProjectItemBase, total=False):
    #: 项目的全部译文，仅管理接口返回；公开接口不带这个键。
    translations: List["ProjectTranslation"]


class VersionItem(TypedDict):
    id: str
    version: str
    comparable_version: str
    title: Optional[str]
    content: Optional[str]
    download_url: Optional[str]
    download_links: List[VersionDownloadLink]
    forced: bool
    is_latest: bool
    is_preview: bool
    is_milestone: bool
    is_deprecated: bool
    platform: Optional[Platform]
    platforms: List[Platform]
    custom_data: Optional[Dict[str, Any]]
    published_at: int
    created_at: int


class AnnouncementTranslation(TypedDict):
    """
    某个语言下的覆盖设置，三个维度彼此独立：title 留空即用默认标题、
    content 留空即用默认正文、is_hidden 为真则该语言下整条公告不返回。
    写入时三者至少要有一项有意义（写入可省略字段，读取时一定存在）。
    """

    locale: str
    title: Optional[str]
    content: Optional[str]
    is_hidden: bool


class _AnnouncementItemBase(TypedDict):
    id: str
    title: str
    content: str
    is_pinned: bool
    is_hidden: bool
    platforms: List[Platform]
    author: Optional[str]
    #: 可见版本范围下界（含），None 表示该端不限。
    min_comparable_version: Optional[str]
    #: 可见版本范围上界（含），None 表示该端不限。
    max_comparable_version: Optional[str]
    #: 本次返回的 title / content 实际来自哪个语言的译文；None 表示默认内容
    #: （没提语言偏好、语言未注册，或该公告没有这个语言的译文）。
    locale: Optional[str]
    published_at: int
    created_at: int
    updated_at: int


class AnnouncementItem(_AnnouncementItemBase, total=False):
    #: 全部译文，仅管理接口返回；公开接口不带这个键。
    translations: List[AnnouncementTranslation]


class FeedbackItem(TypedDict):
    id: str
    user_id: Optional[str]
    rating: Optional[int]
    content: str
    #: 提交者留下的联系方式；未填写为 None。
    contact: Optional[str]
    #: 隐藏的反馈默认不出现在后台列表里，评分仍计入统计。
    is_hidden: bool
    platform: Optional[Platform]
    platform_version: Optional[str]
    custom_data: Optional[Dict[str, Any]]
    #: 是否已转成 GitHub Issue。转发失败的提交不落库，因此列表里的记录都是转发成功的。
    forwarded_to_github: bool
    #: 生成的 Issue 编号与链接；未转发时都是 None。
    github_issue_number: Optional[int]
    github_issue_url: Optional[str]
    ip: Optional[str]
    user_agent: Optional[str]
    country_code: Optional[str]
    country_name: Optional[str]
    region_name: Optional[str]
    city: Optional[str]
    created_at: int


class LogItem(TypedDict):
    id: str
    level: int
    content: str
    device_info: Optional[Dict[str, Any]]
    custom_data: Optional[Dict[str, Any]]
    ip: Optional[str]
    user_agent: Optional[str]
    country_code: Optional[str]
    country_name: Optional[str]
    region_name: Optional[str]
    city: Optional[str]
    platform: Optional[Platform]
    platform_version: Optional[str]
    created_at: int


class EventDefinitionItem(TypedDict):
    """事件定义。由采集端自动发现，没有对应的创建接口。"""

    event_definition_id: str
    project_key: str
    #: 客户端上报时使用的键，归一化后的小写形式。不可修改。
    name: str
    #: 给管理端看的名字；为空时界面回退到 name。
    display_name: Optional[str]
    description: Optional[str]
    archived: bool
    first_seen_time: int
    last_seen_time: int
    #: 查询区间内的上报量。
    range_count: int


class EventSubjectRecord(TypedDict):
    """数据主体导出里的一条事件明细。"""

    event_name: str
    event_id: str
    session_id: Optional[str]
    occurred_at: int
    received_at: int
    properties: Optional[Dict[str, Any]]
    #: 默认为匿名化后的地址（IPv4 截末段、IPv6 截末 80 位）。
    ip: Optional[str]
    user_agent: Optional[str]
    country_code: Optional[str]
    country_name: Optional[str]
    region_name: Optional[str]
    city: Optional[str]
    platform: Optional[Platform]
    platform_version: Optional[str]


class EventSubjectExport(TypedDict):
    distinct_id: str
    total: int
    data: List[EventSubjectRecord]


class ProjectListResponse(TypedDict):
    total: int
    data: List[ProjectItem]


class ProjectAliasItem(TypedDict):
    alias: str
    created_at: int


class ProjectAliasListResponse(TypedDict):
    data: List[ProjectAliasItem]


class ProjectLocaleItem(TypedDict):
    """项目注册的语言。只有注册过的语言能存译文，也只有它们的偏好被公开端认账。"""

    locale: str
    #: 同义标签：客户端提交其中任何一个都等价于命中主标签（多对一）。
    #: 只认显式列出的，不做 en-* 前缀自动回退。
    aliases: List[str]
    label: Optional[str]
    created_at: int


class ProjectTranslation(TypedDict):
    """某个语言下项目名称与描述的覆盖设置，字段留空即回落项目自身的值。"""

    locale: str
    name: Optional[str]
    description: Optional[str]


class ProjectLocaleListResponse(TypedDict):
    data: List[ProjectLocaleItem]


class VersionListResponse(TypedDict):
    total: int
    data: List[VersionItem]


class AnnouncementListResponse(TypedDict):
    total: int
    data: List[AnnouncementItem]


class FeedbackListResponse(TypedDict):
    total: int
    data: List[FeedbackItem]


class LogListResponse(TypedDict):
    total: int
    data: List[LogItem]


class EventDefinitionListResponse(TypedDict):
    total: int
    data: List[EventDefinitionItem]


class CheckUpdateMilestone(TypedDict):
    current: bool
    latest: bool
    target_is_milestone: bool


class CheckUpdateResponse(TypedDict):
    should_update: bool
    required: bool
    reason_codes: List[str]
    current_version: Optional[str]
    current_comparable_version: str
    latest_version: VersionItem
    latest_preview_version: Optional[VersionItem]
    target_version: Optional[VersionItem]
    milestone: CheckUpdateMilestone


class ProjectStatistics(TypedDict):
    count: int


class VersionStatistics(TypedDict):
    total_versions: int
    total_projects: int
    forced_versions: int
    latest_version_time: Optional[int]
    first_version_time: Optional[int]


class AnnouncementStatistics(TypedDict):
    count: int
    pinned_count: int


class PublicFeedbackOptions(TypedDict):
    """反馈提交选项，决定客户端是否显示「转发到 GitHub Issue」的勾选框。"""

    project_key: str
    github_forward_available: bool
    #: 选择转发时联系方式是否必填；转发不可用时恒为 False。
    contact_required_for_forward: bool


class FeedbackStatistics(TypedDict):
    count: int
    rate_count: int
    rate_avg: Optional[float]


class LogStatistics(TypedDict):
    count: int
    debug_count: int
    info_count: int
    warning_count: int
    error_count: int


class IngestEventsResponse(TypedDict):
    """采集接口的逐条回执。"""

    accepted: int
    skipped: int
    #: true 表示本次采集被退出信号或项目开关拦下，此时 accepted 恒为 0。
    suppressed: bool


class GithubWebhookSettings(TypedDict):
    enabled: bool
    payload_path: str
    content_type: str
    secret_hint: Optional[str]
    #: 已存 secret 的字符数，供渲染与真实长度一致的掩码。
    secret_length: Optional[int]
    secret_updated_at: Optional[int]


class GithubWebhookSecretRevealed(GithubWebhookSettings):
    #: 完整 secret，只在设置或重新生成时返回一次。
    secret: str


#: 可启用的 GitHub App 功能："feedback_issue" / "comment_commands"。
GithubAppFeature = str


class GithubAppConfig(TypedDict):
    """实例级 GitHub App 配置视图。私钥永不回读，仅返回指纹。"""

    configured: bool
    app_id: Optional[str]
    has_private_key: bool
    private_key_fingerprint: Optional[str]
    private_key_updated_at: Optional[int]
    has_webhook_secret: bool
    webhook_secret_hint: Optional[str]
    #: 已存 secret 的字符数，供渲染与真实长度一致的掩码。
    webhook_secret_length: Optional[int]
    webhook_secret_updated_at: Optional[int]
    webhook_payload_path: str
    enabled_features: List[GithubAppFeature]
    #: 关闭时忽略下面两个模板字段，实例缺省即内置模板。
    feedback_issue_custom_template: bool
    feedback_issue_title_template: Optional[str]
    feedback_issue_body_template: Optional[str]
    #: 内置模板原文，可直接作为自定义模板编辑器的初值。内置正文不含评分。
    builtin_feedback_issue_title_template: str
    builtin_feedback_issue_body_template: str
    #: 模板可用变量名清单。
    feedback_issue_template_variables: List[str]
    updated_at: Optional[int]


#: 反馈转发 Issue 的模板来源："inherit"（跟随实例）/ "custom"（项目自定义）/
#: "repo"（读目标仓库里的模板文件，内容带缓存定期重取）。
FeedbackIssueTemplateSource = str


class FeedbackIssueRepoTemplatePreview(TypedDict):
    """仓库模板文件的拉取结果。拉不到时 error 给出原因，其余字段为空。"""

    path: str
    ref: Optional[str]
    fetched_at: Optional[int]
    title_template: Optional[str]
    body_template: Optional[str]
    #: 模板 front matter 里声明的标签，优先于项目上单独配置的标签。
    labels: List[str]
    error: Optional[str]


class GithubCommandDefinition(TypedDict, total=False):
    """评论命令定义：/verhub-<name> <args> → workflow_dispatch。"""

    name: str
    workflow: str
    ref: str
    #: 参数写入 workflow inputs 的键名，缺省 "args"。
    input: str


class ProjectGithubIntegration(TypedDict):
    """项目级 GitHub 集成配置视图。*_active 是综合实例配置后的实际生效状态。"""

    project_key: str
    repo_full_name: Optional[str]
    #: 只表示「允许转发」；是否转发由提交者逐条选择。
    feedback_issue_enabled: bool
    feedback_issue_active: bool
    feedback_issue_template_source: FeedbackIssueTemplateSource
    feedback_issue_template_repo_path: Optional[str]
    feedback_issue_template_repo_ref: Optional[str]
    feedback_issue_title_template: Optional[str]
    feedback_issue_body_template: Optional[str]
    feedback_issue_labels: List[str]
    comment_commands_enabled: bool
    comment_commands_active: bool
    command_allowed_associations: List[str]
    command_allowed_users: List[str]
    commands: List[GithubCommandDefinition]
    updated_at: Optional[int]


class GithubRepoProjectPreview(TypedDict):
    project_key: str
    name: str
    repo_url: str
    description: Optional[str]
    author: Optional[str]
    author_homepage_url: Optional[str]
    icon_url: Optional[str]
    website_url: Optional[str]
    docs_url: Optional[str]
    published_at: Optional[int]


class GithubReleaseVersionPreview(TypedDict, total=False):
    version: str
    comparable_version: str
    title: str
    content: str
    download_url: str
    download_links: List[VersionDownloadLink]
    forced: bool
    is_latest: bool
    is_preview: bool
    is_milestone: bool
    is_deprecated: bool
    platform: Optional[Platform]
    platforms: List[Platform]
    published_at: int
    custom_data: Dict[str, Any]


class VersionImportResult(TypedDict):
    imported: int
    skipped: int
    scanned: int


# ---- 事件分析 ----


class EventFilter(TypedDict, total=False):
    """属性筛选条件。``op`` 是闭集，值一律以参数进入服务端查询。"""

    #: 属性名。只支持 properties 的第一层键。
    property: str
    op: str
    value: Any


class EventTimeseriesPoint(TypedDict):
    bucket: int
    count: float


class EventSeries(TypedDict):
    key: str
    data: List[EventTimeseriesPoint]


class EventOverviewResponse(TypedDict):
    start_time: int
    end_time: int
    #: 事件总量。
    total: int
    #: 独立标识数。
    unique_users: int
    unique_sessions: int
    event_types: int


class EventTimeseriesResponse(TypedDict):
    start_time: int
    end_time: int
    granularity: str
    tz_offset_minutes: int
    event_name: Optional[str]
    group_by: Optional[str]
    #: 总量序列，空桶补零。
    data: List[EventTimeseriesPoint]
    #: 按 group_by 拆开的序列；未指定 group_by 时为 None。
    series: Optional[List[EventSeries]]


class EventCountBucket(TypedDict):
    key: str
    label: str
    count: int


class EventBreakdownResponse(TypedDict):
    start_time: int
    end_time: int
    dimension: str
    property_key: Optional[str]
    #: 全量总数，不是本页之和。
    total: int
    data: List[EventCountBucket]


class EventHeatmapCell(TypedDict):
    weekday: int
    hour: int
    count: int


class EventHeatmapResponse(TypedDict):
    start_time: int
    end_time: int
    tz_offset_minutes: int
    #: 固定 168 格，含无数据的空格。
    data: List[EventHeatmapCell]


class FunnelStep(TypedDict, total=False):
    event_name: str
    filters: List[EventFilter]


class FunnelStepResult(TypedDict):
    step: int
    event_name: str
    users: int
    #: 相对上一步的转化率，0 到 1；第一步恒为 1。
    conversion_rate: float
    total_conversion_rate: float
    dropped: int


class FunnelResponse(TypedDict):
    start_time: int
    end_time: int
    window_seconds: int
    data: List[FunnelStepResult]


class RetentionCell(TypedDict):
    period: int
    users: int
    rate: float


class RetentionCohort(TypedDict):
    cohort: int
    size: int
    #: 尚未走完的周期为 None，不是 0。
    cells: List[Optional[RetentionCell]]


class RetentionResponse(TypedDict):
    start_time: int
    end_time: int
    period: str
    periods: int
    cohorts: List[RetentionCohort]


class PathEdge(TypedDict):
    step: int
    from_event: str
    to_event: str
    count: int


class PathsResponse(TypedDict):
    start_time: int
    end_time: int
    scope: str
    depth: int
    #: 有分支被并入「（其他）」时为 True。
    truncated: bool
    data: List[PathEdge]


class DslEvent(TypedDict, total=False):
    name: str
    #: 单个大写字母，公式里靠它引用。
    alias: str
    measure: str
    filters: List[EventFilter]


class DslGroupBy(TypedDict, total=False):
    kind: str
    #: kind 为 "property" 时必填。
    key: str


class EventQuery(TypedDict, total=False):
    """指标 DSL：查询构建器产出的结构，也是看板卡片保存下来的内容。"""

    type: str
    events: List[DslEvent]
    #: 作用于全部事件的公共条件，与各事件自己的 filters 取交集。
    filters: List[EventFilter]
    #: 跨事件运算，例如 "A / B * 100"。只认别名、数字与 + - * / ( )。
    formula: str
    group_by: DslGroupBy
    granularity: str
    limit: int
    start_time: int
    end_time: int
    tz_offset_minutes: int


class EventQueryResponse(TypedDict, total=False):
    """形状随 query["type"] 变化。"""

    start_time: int
    end_time: int
    type: str
    series: List[EventSeries]
    total: int
    buckets: List[EventCountBucket]
    values: Dict[str, float]
    result: float


class DashboardCardItem(TypedDict):
    card_id: str
    project_key: str
    title: str
    description: Optional[str]
    query: EventQuery
    layout: Optional[Dict[str, Any]]
    sort_order: int
    created_time: int
    updated_time: int


class DashboardCardListResponse(TypedDict):
    total: int
    data: List[DashboardCardItem]


class EventSubjectDeleteResponse(TypedDict):
    success: bool
    #: 删除的事件明细条数。日活去重记录一并删除但不计入此数。
    deleted: int


#: 条款文档标识：``privacy-policy`` 隐私政策，``sdk-compliance`` SDK 合规性文档。
TERMS_DOCUMENT_SLUGS = ("privacy-policy", "sdk-compliance")

TermsDocumentSlug = str


class TermsDocumentSummary(TypedDict):
    """条款文档的标题与来源，不含正文。"""

    slug: TermsDocumentSlug
    title: str
    #: 一句话说明，用于文档间导航。
    summary: str
    #: ``builtin`` 表示实例未自定义，返回的是内置正文。
    source: str
    #: 正文最后修订时间（Unix 秒）。
    updated_at: int


class TermsDocumentListResponse(TypedDict):
    data: List[TermsDocumentSummary]


class TermsDocumentView(TermsDocumentSummary):
    """条款文档正文视图。"""

    #: 生效的正文（Markdown）。
    content: str


class TermsPlaceholder(TypedDict):
    """内置正文里待填的占位符。"""

    #: 正文中的写法为 ``{{key}}``。
    key: str
    #: 填空表单的字段名。
    label: str
    #: 填写要求。
    hint: str
    #: 预填值。
    example: str
    #: ``False`` 表示留空也允许发布。
    required: bool


class TermsDocumentConfigView(TypedDict):
    """条款文档的管理端视图，含生效正文、自定义草稿与内置原文。"""

    slug: TermsDocumentSlug
    title: str
    summary: str
    #: 关闭时前台展示内置正文，草稿仍留在库里。
    custom: bool
    #: 当前对外生效的正文。
    content: str
    #: 库里保存的自定义草稿；从未编辑过为 None。
    custom_content: Optional[str]
    custom_updated_at: Optional[int]
    #: 内置正文原文。
    builtin_content: str
    builtin_updated_at: int
    updated_at: Optional[int]
    #: 内置正文里待填的占位符，按出现顺序。
    placeholders: List[TermsPlaceholder]


class TermsDocumentConfigListResponse(TypedDict):
    data: List[TermsDocumentConfigView]
