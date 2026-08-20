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
    #: 是否已转成 GitHub Issue。转发失败的提交不会落库，所以拿到的记录都是成功的那些。
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


class ActionItem(TypedDict):
    action_id: str
    project_key: str
    name: str
    description: str
    custom_data: Optional[Dict[str, Any]]
    created_time: int


class ActionRecordItem(TypedDict):
    action_record_id: str
    action_id: str
    created_time: int
    http: Optional[Dict[str, Any]]
    custom_data: Optional[Dict[str, Any]]
    ip: Optional[str]
    user_agent: Optional[str]
    country_code: Optional[str]
    country_name: Optional[str]
    region_name: Optional[str]
    city: Optional[str]
    platform: Optional[Platform]
    platform_version: Optional[str]


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


class ActionListResponse(TypedDict):
    total: int
    data: List[ActionItem]


class ActionRecordListResponse(TypedDict):
    total: int
    data: List[ActionRecordItem]


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


class ActionStatistics(TypedDict):
    count: int


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
