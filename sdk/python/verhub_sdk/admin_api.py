from __future__ import annotations

from typing import Any, List, Optional

from ._http import BaseHttpClient, compact
from ._unset import UNSET
from .models import (
    AnnouncementItem,
    AnnouncementListResponse,
    AnnouncementStatistics,
    DashboardCardItem,
    DashboardCardListResponse,
    DeleteSuccessResponse,
    EventBreakdownResponse,
    EventDefinitionItem,
    EventDefinitionListResponse,
    EventHeatmapResponse,
    EventOverviewResponse,
    EventQuery,
    EventQueryResponse,
    EventSubjectDeleteResponse,
    EventTimeseriesResponse,
    FeedbackIssueRepoTemplatePreview,
    FeedbackItem,
    FeedbackListResponse,
    FeedbackStatistics,
    FunnelResponse,
    FunnelStep,
    GithubAppConfig,
    GithubReleaseVersionPreview,
    GithubRepoProjectPreview,
    GithubWebhookSecretRevealed,
    GithubWebhookSettings,
    LogItem,
    LogListResponse,
    LogStatistics,
    PathsResponse,
    ProjectAliasListResponse,
    ProjectGithubIntegration,
    ProjectItem,
    ProjectListResponse,
    ProjectLocaleItem,
    ProjectLocaleListResponse,
    ProjectStatistics,
    RetentionResponse,
    TermsDocumentConfigListResponse,
    TermsDocumentConfigView,
    TermsDocumentSlug,
    VersionImportResult,
    VersionItem,
    VersionListResponse,
    VersionStatistics,
)


class AdminApi:
    """
    管理接口，全部需要凭据。

    凭据可以是 ``POST /auth/login`` 拿到的管理员 JWT（默认 2 小时过期），也可以是
    后台签发的长期 API Key（``vh_`` 前缀）。两者在 admin 接口上等价，但 API Key
    受 scope 与项目范围限制：读接口要 ``<资源>:read``，写接口要 ``<资源>:write``，
    写权限不隐含读权限。

    项目作用域的方法用客户端绑定的 ``project_key``，不再逐次收项目参数；跨项目的
    方法（``list_projects``、各类统计、条款文档等）不涉及绑定项目。

    同步与异步两个客户端共用这一份实现：方法把请求转交给底层客户端，绑在
    ``VerhubClient`` 上时直接返回结果，绑在 ``AsyncVerhubClient`` 上时返回协程，
    要 ``await``。返回值标注按同步视角写。
    """

    def __init__(self, http: BaseHttpClient) -> None:
        """
        :param http: 底层 HTTP 客户端
        """
        self._http = http

    # ---- 项目 ----

    def list_projects(
        self,
        *,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> ProjectListResponse:
        """
        :param limit: 分页大小，1..100，默认 20
        :param offset: 分页偏移，默认 0
        :return: 项目列表（全部项目，不限于绑定项目）
        """
        return self._http.request(
            "GET",
            "/admin/projects",
            query={"limit": limit, "offset": offset},
            auth=True,
        )

    def create_project(
        self,
        *,
        name: str,
        project_key: Optional[str] = None,
        repo_url: Any = UNSET,
        description: Any = UNSET,
        author: Any = UNSET,
        author_homepage_url: Any = UNSET,
        icon_url: Any = UNSET,
        website_url: Any = UNSET,
        docs_url: Any = UNSET,
        published_at: Any = UNSET,
        optional_update_min_comparable_version: Any = UNSET,
        optional_update_max_comparable_version: Any = UNSET,
        stats_retention_days: Any = UNSET,
        event_collection_enabled: Any = UNSET,
        event_retention_days: Any = UNSET,
        translations: Any = UNSET,
    ) -> ProjectItem:
        """
        创建项目。``project_key`` 是新项目的标识，省略则用客户端绑定的那个。

        :param name: 项目名称
        :param project_key: 新项目标识，最长 64，全局唯一；省略则用绑定的 project_key
        :param repo_url: 仓库地址
        :param description: 项目描述
        :param author: 作者
        :param author_homepage_url: 作者主页
        :param icon_url: 图标地址
        :param website_url: 官网地址
        :param docs_url: 文档地址
        :param published_at: 发布时间（Unix 秒）
        :param optional_update_min_comparable_version: 可选更新范围下限
        :param optional_update_max_comparable_version: 可选更新范围上限
        :param stats_retention_days: 请求统计保留天数，1..365，默认 365
        :param event_collection_enabled: 事件采集总开关，默认 true
        :param event_retention_days: 事件明细保留天数，1..365，默认 90
        :param translations: 项目名称与描述的译文（ProjectTranslation 列表）。传了即整体
            替换全部译文，空列表即清空；语言必须先在项目里注册，否则整个请求 400
        :return: 创建出的项目
        """
        return self._http.request(
            "POST",
            "/admin/projects",
            body=compact(
                {
                    "project_key": project_key or self._http.require_project_key(),
                    "name": name,
                    "repo_url": repo_url,
                    "description": description,
                    "author": author,
                    "author_homepage_url": author_homepage_url,
                    "icon_url": icon_url,
                    "website_url": website_url,
                    "docs_url": docs_url,
                    "published_at": published_at,
                    "optional_update_min_comparable_version": (
                        optional_update_min_comparable_version
                    ),
                    "optional_update_max_comparable_version": (
                        optional_update_max_comparable_version
                    ),
                    "stats_retention_days": stats_retention_days,
                    "event_collection_enabled": event_collection_enabled,
                    "event_retention_days": event_retention_days,
                    "translations": translations,
                }
            ),
            auth=True,
        )

    def get_project(self) -> ProjectItem:
        """
        :return: 绑定项目的详情
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}",
            path_params={"projectKey": self._http.require_project_key()},
            auth=True,
        )

    def update_project(
        self,
        *,
        new_project_key: Any = UNSET,
        name: Any = UNSET,
        repo_url: Any = UNSET,
        description: Any = UNSET,
        author: Any = UNSET,
        author_homepage_url: Any = UNSET,
        icon_url: Any = UNSET,
        website_url: Any = UNSET,
        docs_url: Any = UNSET,
        published_at: Any = UNSET,
        optional_update_min_comparable_version: Any = UNSET,
        optional_update_max_comparable_version: Any = UNSET,
        stats_retention_days: Any = UNSET,
        event_collection_enabled: Any = UNSET,
        event_retention_days: Any = UNSET,
        translations: Any = UNSET,
    ) -> ProjectItem:
        """
        更新绑定的项目。

        :param new_project_key: 新的项目标识；改键后旧 key 会自动登记为别名并继续
            指向本项目（旧 key 仍可访问），但客户端应同步更新绑定（``set_project_key``）
        :param name: 项目名称
        :param repo_url: 仓库地址
        :param description: 项目描述
        :param author: 作者
        :param author_homepage_url: 作者主页
        :param icon_url: 图标地址
        :param website_url: 官网地址
        :param docs_url: 文档地址
        :param published_at: 发布时间（Unix 秒）
        :param optional_update_min_comparable_version: 可选更新范围下限
        :param optional_update_max_comparable_version: 可选更新范围上限
        :param stats_retention_days: 请求统计保留天数，1..365
        :param event_collection_enabled: 事件采集总开关，默认 true
        :param event_retention_days: 事件明细保留天数，1..365
        :param translations: 项目译文。传了即整体替换全部译文，空列表即清空；不传则不动
        :return: 更新后的项目
        """
        return self._http.request(
            "PATCH",
            "/admin/projects/{projectKey}",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "project_key": new_project_key,
                    "name": name,
                    "repo_url": repo_url,
                    "description": description,
                    "author": author,
                    "author_homepage_url": author_homepage_url,
                    "icon_url": icon_url,
                    "website_url": website_url,
                    "docs_url": docs_url,
                    "published_at": published_at,
                    "optional_update_min_comparable_version": (
                        optional_update_min_comparable_version
                    ),
                    "optional_update_max_comparable_version": (
                        optional_update_max_comparable_version
                    ),
                    "stats_retention_days": stats_retention_days,
                    "event_collection_enabled": event_collection_enabled,
                    "event_retention_days": event_retention_days,
                    "translations": translations,
                }
            ),
            auth=True,
        )

    def delete_project(self) -> DeleteSuccessResponse:
        """
        :return: 删除结果
        """
        return self._http.request(
            "DELETE",
            "/admin/projects/{projectKey}",
            path_params={"projectKey": self._http.require_project_key()},
            auth=True,
        )

    def list_project_aliases(self) -> ProjectAliasListResponse:
        """
        列出绑定项目的别名（改名保留的旧 Project Key）。

        :return: 别名列表
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/aliases",
            path_params={"projectKey": self._http.require_project_key()},
            auth=True,
        )

    def delete_project_alias(self, alias: str) -> DeleteSuccessResponse:
        """
        删除一个别名。删除后旧 key 不再指向本项目，此后以它访问会 404。

        :param alias: 要删除的别名（旧 Project Key）
        :return: 删除结果
        """
        return self._http.request(
            "DELETE",
            "/admin/projects/{projectKey}/aliases/{alias}",
            path_params={
                "projectKey": self._http.require_project_key(),
                "alias": alias,
            },
            auth=True,
        )

    def list_project_locales(self) -> ProjectLocaleListResponse:
        """
        列出绑定项目注册的语言。只有注册过的语言能存公告译文，也只有它们的偏好
        会被公开接口认账——公开端收到未注册的语言偏好时返回公告的默认内容。

        :return: 语言列表
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/locales",
            path_params={"projectKey": self._http.require_project_key()},
            auth=True,
        )

    def create_project_locale(
        self,
        *,
        locale: str,
        aliases: Any = UNSET,
        label: Any = UNSET,
    ) -> ProjectLocaleItem:
        """
        注册一个语言。已注册（主标签或同义标签命中，均忽略大小写）时只更新其余字段，
        不会新建第二行。

        :param locale: 语言标签，如 zh-CN / en-US
        :param aliases: 同义标签列表，例如主标签 ``en`` 列出 ``en-US`` / ``en-GB``；
            客户端提交其中任何一个都等价于命中主标签。与本项目其它语言相撞会 400
        :param label: 后台展示名，如「简体中文」
        :return: 注册后的语言
        """
        return self._http.request(
            "POST",
            "/admin/projects/{projectKey}/locales",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact({"locale": locale, "aliases": aliases, "label": label}),
            auth=True,
        )

    def delete_project_locale(self, locale: str) -> DeleteSuccessResponse:
        """
        注销一个语言。已录入的公告译文不会被删除，只是暂时不可达，重新注册即恢复。

        :param locale: 要注销的语言标签，匹配大小写不敏感
        :return: 删除结果
        """
        return self._http.request(
            "DELETE",
            "/admin/projects/{projectKey}/locales/{locale}",
            path_params={
                "projectKey": self._http.require_project_key(),
                "locale": locale,
            },
            auth=True,
        )

    def get_project_statistics(self) -> ProjectStatistics:
        """
        :return: 项目总数
        """
        return self._http.request("GET", "/admin/projects/statistics", auth=True)

    def preview_github_repo(self, repo_url: str) -> GithubRepoProjectPreview:
        """
        :param repo_url: GitHub 仓库地址
        :return: 可直接用于建项目的字段草稿
        """
        return self._http.request(
            "GET",
            "/admin/projects/github-repo-preview",
            query={"repo_url": repo_url},
            auth=True,
        )

    # ---- 版本 ----

    def list_versions(
        self,
        *,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> VersionListResponse:
        """
        :param limit: 分页大小，1..100，默认 20
        :param offset: 分页偏移，默认 0
        :return: 版本列表
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/versions",
            path_params={"projectKey": self._http.require_project_key()},
            query={"limit": limit, "offset": offset},
            auth=True,
        )

    def create_version(
        self,
        *,
        version: str,
        comparable_version: str,
        title: Any = UNSET,
        content: Any = UNSET,
        download_url: Any = UNSET,
        download_links: Any = UNSET,
        is_latest: Any = UNSET,
        is_preview: Any = UNSET,
        is_milestone: Any = UNSET,
        is_deprecated: Any = UNSET,
        published_at: Any = UNSET,
        platform: Any = UNSET,
        platforms: Any = UNSET,
        custom_data: Any = UNSET,
    ) -> VersionItem:
        """
        :param version: 展示用版本号，如 ``v1.2.0``
        :param comparable_version: 可比较版本号，如 ``1.2.0`` / ``1.2.0-rc.2``
        :param title: 版本标题
        :param content: 更新说明，最长 4096
        :param download_url: 单一下载地址
        :param download_links: 多平台下载链接，元素形如 ``{"url", "name", "platform"}``
        :param is_latest: 是否置为 latest
        :param is_preview: 是否为预览版
        :param is_milestone: 是否为里程碑版本，会拦截跨里程碑的直接升级
        :param is_deprecated: 是否已废弃
        :param published_at: 发布时间（Unix 秒）
        :param platform: 单一发布平台
        :param platforms: 多个发布平台
        :param custom_data: 自定义数据
        :return: 创建出的版本
        """
        return self._http.request(
            "POST",
            "/admin/projects/{projectKey}/versions",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "version": version,
                    "comparable_version": comparable_version,
                    "title": title,
                    "content": content,
                    "download_url": download_url,
                    "download_links": download_links,
                    "is_latest": is_latest,
                    "is_preview": is_preview,
                    "is_milestone": is_milestone,
                    "is_deprecated": is_deprecated,
                    "published_at": published_at,
                    "platform": platform,
                    "platforms": platforms,
                    "custom_data": custom_data,
                }
            ),
            auth=True,
        )

    def get_version(self, version_id: str) -> VersionItem:
        """
        :param version_id: 版本记录 id
        :return: 版本详情
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/versions/{id}",
            path_params={"projectKey": self._http.require_project_key(), "id": version_id},
            auth=True,
        )

    def update_version(
        self,
        version_id: str,
        *,
        version: Any = UNSET,
        comparable_version: Any = UNSET,
        title: Any = UNSET,
        content: Any = UNSET,
        download_url: Any = UNSET,
        download_links: Any = UNSET,
        is_latest: Any = UNSET,
        is_preview: Any = UNSET,
        is_milestone: Any = UNSET,
        is_deprecated: Any = UNSET,
        published_at: Any = UNSET,
        platform: Any = UNSET,
        platforms: Any = UNSET,
        custom_data: Any = UNSET,
    ) -> VersionItem:
        """
        省略的字段保持原值；显式传 ``None`` 的字段被置空（如 ``download_url=None``）。

        :param version_id: 版本记录 id
        :param version: 展示用版本号
        :param comparable_version: 可比较版本号
        :param title: 版本标题
        :param content: 更新说明
        :param download_url: 单一下载地址；传 ``None`` 清空
        :param download_links: 多平台下载链接
        :param is_latest: 是否置为 latest
        :param is_preview: 是否为预览版
        :param is_milestone: 是否为里程碑版本
        :param is_deprecated: 是否已废弃
        :param published_at: 发布时间（Unix 秒）
        :param platform: 单一发布平台
        :param platforms: 多个发布平台
        :param custom_data: 自定义数据
        :return: 更新后的版本
        """
        return self._http.request(
            "PATCH",
            "/admin/projects/{projectKey}/versions/{id}",
            path_params={"projectKey": self._http.require_project_key(), "id": version_id},
            body=compact(
                {
                    "version": version,
                    "comparable_version": comparable_version,
                    "title": title,
                    "content": content,
                    "download_url": download_url,
                    "download_links": download_links,
                    "is_latest": is_latest,
                    "is_preview": is_preview,
                    "is_milestone": is_milestone,
                    "is_deprecated": is_deprecated,
                    "published_at": published_at,
                    "platform": platform,
                    "platforms": platforms,
                    "custom_data": custom_data,
                }
            ),
            auth=True,
        )

    def upsert_version(
        self,
        version: str,
        *,
        comparable_version: Any = UNSET,
        title: Any = UNSET,
        content: Any = UNSET,
        download_url: Any = UNSET,
        download_links: Any = UNSET,
        is_latest: Any = UNSET,
        is_preview: Any = UNSET,
        is_milestone: Any = UNSET,
        is_deprecated: Any = UNSET,
        published_at: Any = UNSET,
        platform: Any = UNSET,
        platforms: Any = UNSET,
        custom_data: Any = UNSET,
    ) -> VersionItem:
        """
        按版本号创建或更新，适合在 CI 里幂等地发版。

        目标版本号取自路径。新建时省略 ``comparable_version`` 会由版本号推导
        （去掉前导 v）；更新时省略的字段保持原值。

        :param version: 版本号
        :param comparable_version: 可比较版本号
        :param title: 版本标题
        :param content: 更新说明
        :param download_url: 单一下载地址；传 ``None`` 清空
        :param download_links: 多平台下载链接
        :param is_latest: 是否置为 latest
        :param is_preview: 是否为预览版
        :param is_milestone: 是否为里程碑版本
        :param is_deprecated: 是否已废弃
        :param published_at: 发布时间（Unix 秒）
        :param platform: 单一发布平台
        :param platforms: 多个发布平台
        :param custom_data: 自定义数据
        :return: 创建或更新后的版本
        """
        return self._http.request(
            "PUT",
            "/admin/projects/{projectKey}/versions/by-version/{version}",
            path_params={"projectKey": self._http.require_project_key(), "version": version},
            body=compact(
                {
                    "comparable_version": comparable_version,
                    "title": title,
                    "content": content,
                    "download_url": download_url,
                    "download_links": download_links,
                    "is_latest": is_latest,
                    "is_preview": is_preview,
                    "is_milestone": is_milestone,
                    "is_deprecated": is_deprecated,
                    "published_at": published_at,
                    "platform": platform,
                    "platforms": platforms,
                    "custom_data": custom_data,
                }
            ),
            auth=True,
        )

    def delete_version(self, version_id: str) -> DeleteSuccessResponse:
        """
        :param version_id: 版本记录 id
        :return: 删除结果
        """
        return self._http.request(
            "DELETE",
            "/admin/projects/{projectKey}/versions/{id}",
            path_params={"projectKey": self._http.require_project_key(), "id": version_id},
            auth=True,
        )

    def get_version_statistics(self) -> VersionStatistics:
        """
        :return: 版本总量与时间跨度
        """
        return self._http.request("GET", "/admin/versions/statistics", auth=True)

    def preview_github_release(self, *, tag: Optional[str] = None) -> GithubReleaseVersionPreview:
        """
        :param tag: Release tag；省略则取最新一个
        :return: 可直接用于建版本的字段草稿
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/versions/github-release-preview",
            path_params={"projectKey": self._http.require_project_key()},
            query={"tag": tag},
            auth=True,
        )

    def import_github_releases(self) -> VersionImportResult:
        """
        :return: 导入结果，已存在的版本计入 skipped
        """
        return self._http.request(
            "POST",
            "/admin/projects/{projectKey}/versions/github-release-import",
            path_params={"projectKey": self._http.require_project_key()},
            auth=True,
        )

    # ---- 公告 ----

    def list_announcements(
        self,
        *,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> AnnouncementListResponse:
        """
        :param limit: 分页大小，1..100，默认 20
        :param offset: 分页偏移，默认 0
        :return: 公告列表
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/announcements",
            path_params={"projectKey": self._http.require_project_key()},
            query={"limit": limit, "offset": offset},
            auth=True,
        )

    def create_announcement(
        self,
        *,
        title: str,
        content: str,
        is_pinned: Any = UNSET,
        is_hidden: Any = UNSET,
        platforms: Any = UNSET,
        author: Any = UNSET,
        min_comparable_version: Any = UNSET,
        max_comparable_version: Any = UNSET,
        translations: Any = UNSET,
        published_at: Any = UNSET,
    ) -> AnnouncementItem:
        """
        :param title: 公告标题，最长 128
        :param content: 公告内容，最长 4096
        :param is_pinned: 是否置顶
        :param is_hidden: 是否隐藏，隐藏后公开接口取不到
        :param platforms: 投放平台，最多 8 个；留空表示全平台
        :param author: 作者
        :param min_comparable_version: 可见版本范围下界（含），留空即该端不限
        :param max_comparable_version: 可见版本范围上界（含），留空即该端不限
        :param translations: 译文集合（AnnouncementTranslation 列表）。传了即整体替换
            全部译文，空列表即清空；语言必须先在项目里注册，否则整个请求 400
        :param published_at: 发布时间（Unix 秒）
        :return: 创建出的公告
        """
        return self._http.request(
            "POST",
            "/admin/projects/{projectKey}/announcements",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "title": title,
                    "content": content,
                    "is_pinned": is_pinned,
                    "is_hidden": is_hidden,
                    "platforms": platforms,
                    "author": author,
                    "min_comparable_version": min_comparable_version,
                    "max_comparable_version": max_comparable_version,
                    "translations": translations,
                    "published_at": published_at,
                }
            ),
            auth=True,
        )

    def get_announcement(self, announcement_id: str) -> AnnouncementItem:
        """
        :param announcement_id: 公告 id
        :return: 公告详情
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/announcements/{id}",
            path_params={"projectKey": self._http.require_project_key(), "id": announcement_id},
            auth=True,
        )

    def update_announcement(
        self,
        announcement_id: str,
        *,
        title: Any = UNSET,
        content: Any = UNSET,
        is_pinned: Any = UNSET,
        is_hidden: Any = UNSET,
        platforms: Any = UNSET,
        author: Any = UNSET,
        min_comparable_version: Any = UNSET,
        max_comparable_version: Any = UNSET,
        translations: Any = UNSET,
        published_at: Any = UNSET,
    ) -> AnnouncementItem:
        """
        :param announcement_id: 公告 id
        :param title: 公告标题
        :param content: 公告内容
        :param is_pinned: 是否置顶
        :param is_hidden: 是否隐藏
        :param platforms: 投放平台，最多 8 个
        :param author: 作者
        :param min_comparable_version: 可见版本范围下界（含）
        :param max_comparable_version: 可见版本范围上界（含）
        :param translations: 译文集合。传了即整体替换全部译文，空列表即清空；不传则不动
        :param published_at: 发布时间（Unix 秒）
        :return: 更新后的公告
        """
        return self._http.request(
            "PATCH",
            "/admin/projects/{projectKey}/announcements/{id}",
            path_params={"projectKey": self._http.require_project_key(), "id": announcement_id},
            body=compact(
                {
                    "title": title,
                    "content": content,
                    "is_pinned": is_pinned,
                    "is_hidden": is_hidden,
                    "platforms": platforms,
                    "author": author,
                    "min_comparable_version": min_comparable_version,
                    "max_comparable_version": max_comparable_version,
                    "translations": translations,
                    "published_at": published_at,
                }
            ),
            auth=True,
        )

    def delete_announcement(self, announcement_id: str) -> DeleteSuccessResponse:
        """
        :param announcement_id: 公告 id
        :return: 删除结果
        """
        return self._http.request(
            "DELETE",
            "/admin/projects/{projectKey}/announcements/{id}",
            path_params={"projectKey": self._http.require_project_key(), "id": announcement_id},
            auth=True,
        )

    def get_announcement_statistics(self) -> AnnouncementStatistics:
        """
        :return: 公告总数与置顶数
        """
        return self._http.request("GET", "/admin/announcements/statistics", auth=True)

    # ---- 反馈 ----

    def list_feedbacks(
        self,
        *,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        include_hidden: Optional[bool] = None,
    ) -> FeedbackListResponse:
        """
        :param limit: 分页大小，1..100，默认 20
        :param offset: 分页偏移，默认 0
        :param include_hidden: 是否把已隐藏的反馈一起列出来，默认 False
        :return: 反馈列表
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/feedbacks",
            path_params={"projectKey": self._http.require_project_key()},
            query={"limit": limit, "offset": offset, "include_hidden": include_hidden},
            auth=True,
        )

    def create_feedback(
        self,
        *,
        content: str,
        user_id: Any = UNSET,
        rating: Any = UNSET,
        contact: Any = UNSET,
        is_hidden: Any = UNSET,
        platform: Any = UNSET,
        platform_version: Any = UNSET,
        custom_data: Any = UNSET,
    ) -> FeedbackItem:
        """
        后台手动补录反馈。客户端上报请用 ``public.create_feedback``。

        :param content: 反馈内容
        :param user_id: 用户标识
        :param rating: 评分，1..5
        :param contact: 联系方式
        :param is_hidden: 是否隐藏；隐藏后列表默认不返回，评分仍计入统计
        :param platform: 平台
        :param platform_version: 系统版本明细
        :param custom_data: 自定义数据
        :return: 创建出的反馈
        """
        return self._http.request(
            "POST",
            "/admin/projects/{projectKey}/feedbacks",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "content": content,
                    "user_id": user_id,
                    "rating": rating,
                    "contact": contact,
                    "is_hidden": is_hidden,
                    "platform": platform,
                    "platform_version": platform_version,
                    "custom_data": custom_data,
                }
            ),
            auth=True,
        )

    def get_feedback(self, feedback_id: str) -> FeedbackItem:
        """
        :param feedback_id: 反馈 id
        :return: 反馈详情
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/feedbacks/{id}",
            path_params={"projectKey": self._http.require_project_key(), "id": feedback_id},
            auth=True,
        )

    def update_feedback(
        self,
        feedback_id: str,
        *,
        content: Any = UNSET,
        user_id: Any = UNSET,
        rating: Any = UNSET,
        contact: Any = UNSET,
        is_hidden: Any = UNSET,
        platform: Any = UNSET,
        platform_version: Any = UNSET,
        custom_data: Any = UNSET,
    ) -> FeedbackItem:
        """
        :param feedback_id: 反馈 id
        :param content: 反馈内容
        :param user_id: 用户标识
        :param rating: 评分，1..5
        :param contact: 联系方式
        :param is_hidden: 是否隐藏；隐藏后列表默认不返回，评分仍计入统计
        :param platform: 平台
        :param platform_version: 系统版本明细
        :param custom_data: 自定义数据
        :return: 更新后的反馈
        """
        return self._http.request(
            "PATCH",
            "/admin/projects/{projectKey}/feedbacks/{id}",
            path_params={"projectKey": self._http.require_project_key(), "id": feedback_id},
            body=compact(
                {
                    "content": content,
                    "user_id": user_id,
                    "rating": rating,
                    "contact": contact,
                    "is_hidden": is_hidden,
                    "platform": platform,
                    "platform_version": platform_version,
                    "custom_data": custom_data,
                }
            ),
            auth=True,
        )

    def delete_feedback(self, feedback_id: str) -> DeleteSuccessResponse:
        """
        :param feedback_id: 反馈 id
        :return: 删除结果
        """
        return self._http.request(
            "DELETE",
            "/admin/projects/{projectKey}/feedbacks/{id}",
            path_params={"projectKey": self._http.require_project_key(), "id": feedback_id},
            auth=True,
        )

    def get_feedback_statistics(self) -> FeedbackStatistics:
        """
        :return: 反馈总数与平均分
        """
        return self._http.request("GET", "/admin/feedbacks/statistics", auth=True)

    # ---- 日志 ----

    def list_logs(
        self,
        *,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        level: Optional[int] = None,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
    ) -> LogListResponse:
        """
        :param limit: 分页大小，1..100，默认 20
        :param offset: 分页偏移，默认 0
        :param level: 日志等级，0=debug 1=info 2=warning 3=error
        :param start_time: 起始时间（Unix 秒）
        :param end_time: 结束时间（Unix 秒）
        :return: 日志列表
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/logs",
            path_params={"projectKey": self._http.require_project_key()},
            query={
                "limit": limit,
                "offset": offset,
                "level": level,
                "start_time": start_time,
                "end_time": end_time,
            },
            auth=True,
        )

    def create_log(
        self,
        *,
        level: int,
        content: str,
        device_info: Any = UNSET,
        custom_data: Any = UNSET,
        platform: Any = UNSET,
        platform_version: Any = UNSET,
    ) -> LogItem:
        """
        后台手动补录日志。客户端上报请用 ``public.upload_log``。

        :param level: 日志等级，0..3
        :param content: 日志内容
        :param device_info: 设备信息
        :param custom_data: 自定义数据
        :param platform: 平台；补录没有客户端可推断，只能显式指定
        :param platform_version: 系统版本明细
        :return: 创建出的日志
        """
        return self._http.request(
            "POST",
            "/admin/projects/{projectKey}/logs",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "level": level,
                    "content": content,
                    "device_info": device_info,
                    "custom_data": custom_data,
                    "platform": platform,
                    "platform_version": platform_version,
                }
            ),
            auth=True,
        )

    def get_log_statistics(self) -> LogStatistics:
        """
        :return: 各等级日志条数
        """
        return self._http.request("GET", "/admin/logs/statistics", auth=True)

    # ---- 事件分析 ----

    def list_event_definitions(
        self,
        *,
        start_time: Any = UNSET,
        end_time: Any = UNSET,
        tz_offset_minutes: Any = UNSET,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        search: Any = UNSET,
        include_archived: Any = UNSET,
    ) -> EventDefinitionListResponse:
        """
        自动发现的事件清单。定义由采集端在第一次收到某个事件名时登记，没有创建接口。

        :param start_time: 统计区间起点（Unix 秒），省略则最近 7 天
        :param end_time: 统计区间终点（Unix 秒）
        :param tz_offset_minutes: 相对 UTC 的分钟偏移
        :param limit: 分页大小，1..100，默认 20
        :param offset: 分页偏移，默认 0
        :param search: 关键字，匹配事件名、显示名与描述
        :param include_archived: 是否包含已归档的事件，默认否
        :return: 事件定义列表，``range_count`` 是区间内的上报量
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/events/definitions",
            path_params={"projectKey": self._http.require_project_key()},
            query=compact(
                {
                    "start_time": start_time,
                    "end_time": end_time,
                    "tz_offset_minutes": tz_offset_minutes,
                    "limit": limit,
                    "offset": offset,
                    "search": search,
                    "include_archived": include_archived,
                }
            ),
            auth=True,
        )

    def update_event_definition(
        self,
        definition_id: str,
        *,
        display_name: Any = UNSET,
        description: Any = UNSET,
        archived: Any = UNSET,
    ) -> EventDefinitionItem:
        """
        补充显示名与描述，或把停用的事件归档。

        事件名不在可改字段里——它是客户端上报时使用的键。

        :param definition_id: 事件定义 id
        :param display_name: 给管理端看的名字
        :param description: 事件说明
        :param archived: 是否归档
        :return: 更新后的事件定义
        """
        return self._http.request(
            "PATCH",
            "/admin/projects/{projectKey}/events/definitions/{definitionId}",
            path_params={
                "projectKey": self._http.require_project_key(),
                "definitionId": definition_id,
            },
            body=compact(
                {
                    "display_name": display_name,
                    "description": description,
                    "archived": archived,
                }
            ),
            auth=True,
        )

    def delete_event_definition(self, definition_id: str) -> DeleteSuccessResponse:
        """
        删除事件定义本身；明细与统计保留，下一次上报会把定义重新建回来。
        要停用某个事件请改用归档。

        :param definition_id: 事件定义 id
        :return: 删除结果
        """
        return self._http.request(
            "DELETE",
            "/admin/projects/{projectKey}/events/definitions/{definitionId}",
            path_params={
                "projectKey": self._http.require_project_key(),
                "definitionId": definition_id,
            },
            auth=True,
        )

    def get_event_overview(
        self,
        *,
        start_time: Any = UNSET,
        end_time: Any = UNSET,
        tz_offset_minutes: Any = UNSET,
    ) -> EventOverviewResponse:
        """
        :param start_time: 统计区间起点（Unix 秒），省略则最近 7 天
        :param end_time: 统计区间终点（Unix 秒）
        :param tz_offset_minutes: 相对 UTC 的分钟偏移
        :return: 区间内的事件总量、独立标识数、活跃会话数与事件种类数
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/events/stats/overview",
            path_params={"projectKey": self._http.require_project_key()},
            query=compact(
                {
                    "start_time": start_time,
                    "end_time": end_time,
                    "tz_offset_minutes": tz_offset_minutes,
                }
            ),
            auth=True,
        )

    def get_event_timeseries(
        self,
        *,
        start_time: Any = UNSET,
        end_time: Any = UNSET,
        tz_offset_minutes: Any = UNSET,
        granularity: Any = UNSET,
        event_name: Any = UNSET,
        group_by: Any = UNSET,
        limit: Any = UNSET,
    ) -> EventTimeseriesResponse:
        """
        事件量趋势。

        ``data`` 是总量，永远返回；给了 ``group_by`` 时额外返回拆开的 ``series``。

        :param start_time: 统计区间起点（Unix 秒），省略则最近 7 天
        :param end_time: 统计区间终点（Unix 秒）
        :param tz_offset_minutes: 相对 UTC 的分钟偏移
        :param granularity: ``"hour"`` 或 ``"day"``，默认按天
        :param event_name: 只统计这一个事件
        :param group_by: ``"event"`` / ``"platform"`` / ``"region"``
        :param limit: 拆分维度最多返回几条序列
        :return: 总量序列与可选的拆分序列
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/events/stats/timeseries",
            path_params={"projectKey": self._http.require_project_key()},
            query=compact(
                {
                    "start_time": start_time,
                    "end_time": end_time,
                    "tz_offset_minutes": tz_offset_minutes,
                    "granularity": granularity,
                    "event_name": event_name,
                    "group_by": group_by,
                    "limit": limit,
                }
            ),
            auth=True,
        )

    def get_event_breakdown(
        self,
        *,
        start_time: Any = UNSET,
        end_time: Any = UNSET,
        tz_offset_minutes: Any = UNSET,
        dimension: Any = UNSET,
        property_key: Any = UNSET,
        event_name: Any = UNSET,
        limit: Any = UNSET,
    ) -> EventBreakdownResponse:
        """
        事件分布。``total`` 是全量而非本页之和。

        :param start_time: 统计区间起点（Unix 秒），省略则最近 7 天
        :param end_time: 统计区间终点（Unix 秒）
        :param tz_offset_minutes: 相对 UTC 的分钟偏移
        :param dimension: ``"event"`` / ``"platform"`` / ``"region"`` / ``"property"``
        :param property_key: ``dimension="property"`` 时必填
        :param event_name: 只统计这一个事件
        :param limit: 最多返回几个分桶
        :return: 分布结果
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/events/stats/breakdown",
            path_params={"projectKey": self._http.require_project_key()},
            query=compact(
                {
                    "start_time": start_time,
                    "end_time": end_time,
                    "tz_offset_minutes": tz_offset_minutes,
                    "dimension": dimension,
                    "property_key": property_key,
                    "event_name": event_name,
                    "limit": limit,
                }
            ),
            auth=True,
        )

    def get_event_heatmap(
        self,
        *,
        start_time: Any = UNSET,
        end_time: Any = UNSET,
        tz_offset_minutes: Any = UNSET,
        event_name: Any = UNSET,
    ) -> EventHeatmapResponse:
        """
        星期 × 小时活跃热力图，固定 168 格。

        折叠按每条上报来源国家的代表时区进行；``tz_offset_minutes`` 是无法定位的
        来源的回退值。

        :param start_time: 统计区间起点（Unix 秒），省略则最近 7 天
        :param end_time: 统计区间终点（Unix 秒）
        :param tz_offset_minutes: 无法定位来源时使用的分钟偏移
        :param event_name: 只统计这一个事件
        :return: 168 个格子的活跃度
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/events/stats/heatmap",
            path_params={"projectKey": self._http.require_project_key()},
            query=compact(
                {
                    "start_time": start_time,
                    "end_time": end_time,
                    "tz_offset_minutes": tz_offset_minutes,
                    "event_name": event_name,
                }
            ),
            auth=True,
        )

    def get_funnel(
        self,
        *,
        steps: List[FunnelStep],
        window_seconds: Any = UNSET,
        start_time: Any = UNSET,
        end_time: Any = UNSET,
        tz_offset_minutes: Any = UNSET,
    ) -> FunnelResponse:
        """
        漏斗转化。

        每一步取「上一步之后、且仍在转化窗口内」的最早一条命中，窗口锚定在第一步。
        只读接口，所需 scope 是 ``events:read``。

        :param steps: 2 到 8 个步骤，每步至少给 ``event_name``
        :param window_seconds: 从第一步算起的转化窗口（秒），默认 7 天
        :param start_time: 统计区间起点（Unix 秒），省略则最近 7 天
        :param end_time: 统计区间终点（Unix 秒）
        :param tz_offset_minutes: 相对 UTC 的分钟偏移
        :return: 逐步转化结果
        """
        return self._http.request(
            "POST",
            "/admin/projects/{projectKey}/events/analysis/funnel",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "steps": steps,
                    "window_seconds": window_seconds,
                    "start_time": start_time,
                    "end_time": end_time,
                    "tz_offset_minutes": tz_offset_minutes,
                }
            ),
            auth=True,
        )

    def get_retention(
        self,
        *,
        start_event: str,
        return_event: Any = UNSET,
        period: Any = UNSET,
        periods: Any = UNSET,
        start_time: Any = UNSET,
        end_time: Any = UNSET,
        tz_offset_minutes: Any = UNSET,
    ) -> RetentionResponse:
        """
        留存矩阵。尚未走完的周期返回 ``None`` 而不是 0。

        :param start_event: 把人纳入队列的起始事件
        :param return_event: 判定「回来了」的事件；省略则任意事件都算回访
        :param period: ``"day"`` 或 ``"week"``
        :param periods: 观察多少个周期
        :param start_time: 统计区间起点（Unix 秒），省略则最近 7 天
        :param end_time: 统计区间终点（Unix 秒）
        :param tz_offset_minutes: 相对 UTC 的分钟偏移
        :return: 各队列的留存矩阵
        """
        return self._http.request(
            "POST",
            "/admin/projects/{projectKey}/events/analysis/retention",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "start_event": start_event,
                    "return_event": return_event,
                    "period": period,
                    "periods": periods,
                    "start_time": start_time,
                    "end_time": end_time,
                    "tz_offset_minutes": tz_offset_minutes,
                }
            ),
            auth=True,
        )

    def get_paths(
        self,
        *,
        start_event: Any = UNSET,
        depth: Any = UNSET,
        branch_limit: Any = UNSET,
        scope: Any = UNSET,
        start_time: Any = UNSET,
        end_time: Any = UNSET,
        tz_offset_minutes: Any = UNSET,
    ) -> PathsResponse:
        """
        路径分析（桑基图边集）。

        :param start_event: 路径起点；省略则从每条序列的第一个事件开始
        :param depth: 最多走几步
        :param branch_limit: 每一层保留的分支数，其余并入「（其他）」
        :param scope: ``"session"``（默认）按会话串联，``"user"`` 跨会话按人串联
        :param start_time: 统计区间起点（Unix 秒），省略则最近 7 天
        :param end_time: 统计区间终点（Unix 秒）
        :param tz_offset_minutes: 相对 UTC 的分钟偏移
        :return: 边集
        """
        return self._http.request(
            "POST",
            "/admin/projects/{projectKey}/events/analysis/paths",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "start_event": start_event,
                    "depth": depth,
                    "branch_limit": branch_limit,
                    "scope": scope,
                    "start_time": start_time,
                    "end_time": end_time,
                    "tz_offset_minutes": tz_offset_minutes,
                }
            ),
            auth=True,
        )

    def run_event_query(self, query: EventQuery) -> EventQueryResponse:
        """
        指标 DSL 求值。查询构建器与看板卡片共用这一个入口。

        :param query: 指标定义；``formula`` 支持 ``"A / B * 100"`` 形式的跨事件运算
        :return: 形状随 ``query["type"]`` 变化
        """
        return self._http.request(
            "POST",
            "/admin/projects/{projectKey}/events/analysis/query",
            path_params={"projectKey": self._http.require_project_key()},
            body=dict(query),
            auth=True,
        )

    def list_dashboard_cards(self) -> DashboardCardListResponse:
        """
        :return: 该项目保存的分析卡片，按 ``sort_order`` 升序
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/events/dashboards/cards",
            path_params={"projectKey": self._http.require_project_key()},
            auth=True,
        )

    def create_dashboard_card(
        self,
        *,
        title: str,
        query: EventQuery,
        description: Any = UNSET,
        layout: Any = UNSET,
        sort_order: Any = UNSET,
    ) -> DashboardCardItem:
        """
        保存一份指标 DSL 查询定义。只存定义不存结果——结果随时间范围变化。

        :param title: 卡片标题
        :param query: 指标定义，写入时就完整校验（含公式语法），不合法直接 400
        :param description: 卡片说明
        :param layout: 前端网格布局，服务端只存不解析
        :param sort_order: 排序值，升序
        :return: 创建出的卡片
        """
        return self._http.request(
            "POST",
            "/admin/projects/{projectKey}/events/dashboards/cards",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "title": title,
                    "query": query,
                    "description": description,
                    "layout": layout,
                    "sort_order": sort_order,
                }
            ),
            auth=True,
        )

    def update_dashboard_card(
        self,
        card_id: str,
        *,
        title: Any = UNSET,
        query: Any = UNSET,
        description: Any = UNSET,
        layout: Any = UNSET,
        sort_order: Any = UNSET,
    ) -> DashboardCardItem:
        """
        :param card_id: 卡片 id
        :param title: 卡片标题
        :param query: 指标定义
        :param description: 卡片说明
        :param layout: 前端网格布局
        :param sort_order: 排序值，升序
        :return: 更新后的卡片
        """
        return self._http.request(
            "PATCH",
            "/admin/projects/{projectKey}/events/dashboards/cards/{cardId}",
            path_params={
                "projectKey": self._http.require_project_key(),
                "cardId": card_id,
            },
            body=compact(
                {
                    "title": title,
                    "query": query,
                    "description": description,
                    "layout": layout,
                    "sort_order": sort_order,
                }
            ),
            auth=True,
        )

    def delete_dashboard_card(self, card_id: str) -> DeleteSuccessResponse:
        """
        :param card_id: 卡片 id
        :return: 删除结果
        """
        return self._http.request(
            "DELETE",
            "/admin/projects/{projectKey}/events/dashboards/cards/{cardId}",
            path_params={
                "projectKey": self._http.require_project_key(),
                "cardId": card_id,
            },
            auth=True,
        )

    def delete_event_subject(self, distinct_id: str) -> EventSubjectDeleteResponse:
        """
        代最终用户删除其全部事件明细（GDPR Art.17）。小时汇总不在删除范围内。

        :param distinct_id: 要删除的匿名标识
        :return: 删除结果
        """
        return self._http.request(
            "DELETE",
            "/admin/projects/{projectKey}/events/subjects/{distinctId}",
            path_params={
                "projectKey": self._http.require_project_key(),
                "distinctId": distinct_id,
            },
            auth=True,
        )

    # ---- GitHub Webhook ----

    def get_github_webhook(self) -> GithubWebhookSettings:
        """
        :return: 绑定项目的 webhook 配置；``secret`` 不回显，只给末 6 位提示
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/github-webhook",
            path_params={"projectKey": self._http.require_project_key()},
            auth=True,
        )

    def set_github_webhook_secret(self, secret: str) -> GithubWebhookSecretRevealed:
        """
        :param secret: GitHub Webhook 表单里填的 secret 原文，16..256 字符
        :return: 含完整 secret 的配置，仅此一次返回
        """
        return self._http.request(
            "PUT",
            "/admin/projects/{projectKey}/github-webhook",
            path_params={"projectKey": self._http.require_project_key()},
            body={"secret": secret},
            auth=True,
        )

    def regenerate_github_webhook_secret(self) -> GithubWebhookSecretRevealed:
        """
        :return: 含新 secret 的配置；旧 secret 立即失效，记得同步改 GitHub
        """
        return self._http.request(
            "POST",
            "/admin/projects/{projectKey}/github-webhook/regenerate",
            path_params={"projectKey": self._http.require_project_key()},
            auth=True,
        )

    def clear_github_webhook_secret(self) -> GithubWebhookSettings:
        """
        :return: 清除后的配置；接收端点随即拒绝所有推送
        """
        return self._http.request(
            "DELETE",
            "/admin/projects/{projectKey}/github-webhook",
            path_params={"projectKey": self._http.require_project_key()},
            auth=True,
        )

    # ---- GitHub App ----

    def get_github_app_config(self) -> GithubAppConfig:
        """
        实例级 GitHub App 配置。仅管理员 JWT 可访问，API key 会得到 401。

        :return: 配置状态；私钥永不回读，只有指纹
        """
        return self._http.request("GET", "/admin/github-app", auth=True)

    def update_github_app_config(
        self,
        *,
        app_id: Any = UNSET,
        private_key: Any = UNSET,
        webhook_secret: Any = UNSET,
        enabled_features: Any = UNSET,
        feedback_issue_custom_template: Any = UNSET,
        feedback_issue_title_template: Any = UNSET,
        feedback_issue_body_template: Any = UNSET,
    ) -> GithubAppConfig:
        """
        :param app_id: GitHub App 的数字 ID
        :param private_key: App 私钥 PEM 原文，只写不读；传空串表示清除
        :param webhook_secret: App 级 webhook secret；传空串表示清除
        :param enabled_features: 启用的功能列表，如 ["feedback_issue"]
        :param feedback_issue_custom_template: 是否启用自定义模板；关闭时下面两个模板字段被忽略，
            实例缺省回到内置模板
        :param feedback_issue_title_template: 反馈转发 Issue 标题模板（实例级缺省）
        :param feedback_issue_body_template: 反馈转发 Issue 正文模板（实例级缺省）
        :return: 更新后的配置
        """
        return self._http.request(
            "PUT",
            "/admin/github-app",
            body=compact(
                {
                    "app_id": app_id,
                    "private_key": private_key,
                    "webhook_secret": webhook_secret,
                    "enabled_features": enabled_features,
                    "feedback_issue_custom_template": feedback_issue_custom_template,
                    "feedback_issue_title_template": feedback_issue_title_template,
                    "feedback_issue_body_template": feedback_issue_body_template,
                }
            ),
            auth=True,
        )

    def clear_github_app_config(self) -> GithubAppConfig:
        """
        :return: 清空后的配置；所有项目的 GitHub App 功能随即失效
        """
        return self._http.request("DELETE", "/admin/github-app", auth=True)

    def get_github_integration(self) -> ProjectGithubIntegration:
        """
        :return: 绑定项目的 GitHub 集成配置
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/github-integration",
            path_params={"projectKey": self._http.require_project_key()},
            auth=True,
        )

    def update_github_integration(
        self,
        *,
        repo_full_name: Any = UNSET,
        feedback_issue_enabled: Any = UNSET,
        feedback_issue_template_source: Any = UNSET,
        feedback_issue_template_repo_path: Any = UNSET,
        feedback_issue_template_repo_ref: Any = UNSET,
        feedback_issue_title_template: Any = UNSET,
        feedback_issue_body_template: Any = UNSET,
        feedback_issue_labels: Any = UNSET,
        comment_commands_enabled: Any = UNSET,
        command_allowed_associations: Any = UNSET,
        command_allowed_users: Any = UNSET,
        commands: Any = UNSET,
    ) -> ProjectGithubIntegration:
        """
        :param repo_full_name: 目标仓库 "owner/repo"；传空串表示清除并连带关闭依赖开关
        :param feedback_issue_enabled: 允许把反馈转发成 Issue；打开要求实例级已启用该功能。
            只是「允许」，是否转发由提交者逐条选择
        :param feedback_issue_template_source: 模板来源 "inherit" / "custom" / "repo"
        :param feedback_issue_template_repo_path: source="repo" 时必填，仓库内的相对路径
        :param feedback_issue_template_repo_ref: 读取模板文件使用的分支/标签，留空取默认分支
        :param feedback_issue_title_template: Issue 标题模板（项目级优先）
        :param feedback_issue_body_template: Issue 正文模板
        :param feedback_issue_labels: Issue 标签列表
        :param comment_commands_enabled: 评论命令开关；打开要求实例级已启用该功能
        :param command_allowed_associations: 允许触发命令的 author_association 列表
        :param command_allowed_users: 额外放行的 GitHub 用户名列表
        :param commands: 命令定义列表，如 [{"name": "release", "workflow": "release.yml", "ref": "main", "input": "version"}]
        :return: 更新后的集成配置
        """
        return self._http.request(
            "PUT",
            "/admin/projects/{projectKey}/github-integration",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "repo_full_name": repo_full_name,
                    "feedback_issue_enabled": feedback_issue_enabled,
                    "feedback_issue_template_source": feedback_issue_template_source,
                    "feedback_issue_template_repo_path": feedback_issue_template_repo_path,
                    "feedback_issue_template_repo_ref": feedback_issue_template_repo_ref,
                    "feedback_issue_title_template": feedback_issue_title_template,
                    "feedback_issue_body_template": feedback_issue_body_template,
                    "feedback_issue_labels": feedback_issue_labels,
                    "comment_commands_enabled": comment_commands_enabled,
                    "command_allowed_associations": command_allowed_associations,
                    "command_allowed_users": command_allowed_users,
                    "commands": commands,
                }
            ),
            auth=True,
        )

    def get_github_integration_repo_template(
        self,
        *,
        refresh: bool = False,
    ) -> FeedbackIssueRepoTemplatePreview:
        """
        预览目标仓库里的反馈 Issue 模板（模板来源为 "repo" 时使用）。

        :param refresh: 先作废服务端缓存再重新拉取
        :return: 解析后的模板；拉取失败时 error 字段给出原因，不抛异常
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/github-integration/repo-template",
            path_params={"projectKey": self._http.require_project_key()},
            query={"refresh": "true"} if refresh else None,
            auth=True,
        )

    # ---- 条款文档 ----

    def list_terms_documents(self) -> TermsDocumentConfigListResponse:
        """
        列出全部条款文档的设置视图（含生效正文、自定义草稿与内置原文）。

        条款接口只接受管理员 JWT，API Key 会得到 401。不作用于绑定项目。

        :return: 条款文档设置列表
        """
        return self._http.request("GET", "/admin/terms/documents", auth=True)

    def get_terms_document(self, slug: TermsDocumentSlug) -> TermsDocumentConfigView:
        """
        :param slug: 文档标识，``privacy-policy`` 或 ``sdk-compliance``
        :return: 单份条款文档的设置视图
        """
        return self._http.request(
            "GET",
            "/admin/terms/documents/{slug}",
            path_params={"slug": slug},
            auth=True,
        )

    def update_terms_document(
        self,
        slug: TermsDocumentSlug,
        *,
        custom: Any = UNSET,
        content: Any = UNSET,
    ) -> TermsDocumentConfigView:
        """
        部分更新条款文档，只修改传入的字段。

        ``custom`` 关闭时 ``content`` 仍会保存为草稿，重新打开即可继续编辑。

        :param slug: 文档标识，``privacy-policy`` 或 ``sdk-compliance``
        :param custom: 是否启用自定义正文
        :param content: 自定义正文（Markdown），最长 65536；传空串清除草稿
        :return: 更新后的设置视图
        """
        return self._http.request(
            "PUT",
            "/admin/terms/documents/{slug}",
            path_params={"slug": slug},
            body=compact({"custom": custom, "content": content}),
            auth=True,
        )

    def reset_terms_document(self, slug: TermsDocumentSlug) -> TermsDocumentConfigView:
        """
        恢复内置条款正文：关闭自定义开关并丢弃草稿，前台随即回到内置正文。

        :param slug: 文档标识，``privacy-policy`` 或 ``sdk-compliance``
        :return: 恢复后的设置视图
        """
        return self._http.request(
            "DELETE",
            "/admin/terms/documents/{slug}",
            path_params={"slug": slug},
            auth=True,
        )
