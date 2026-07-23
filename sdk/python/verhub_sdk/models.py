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


class ProjectItem(TypedDict):
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
    created_at: int
    updated_at: int


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


class AnnouncementItem(TypedDict):
    id: str
    title: str
    content: str
    is_pinned: bool
    is_hidden: bool
    platforms: List[Platform]
    author: Optional[str]
    published_at: int
    created_at: int
    updated_at: int


class FeedbackItem(TypedDict):
    id: str
    user_id: Optional[str]
    rating: Optional[int]
    content: str
    platform: Optional[Platform]
    platform_version: Optional[str]
    custom_data: Optional[Dict[str, Any]]
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
    secret_updated_at: Optional[int]


class GithubWebhookSecretRevealed(GithubWebhookSettings):
    #: 完整 secret，只在设置或重新生成时返回一次。
    secret: str


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
