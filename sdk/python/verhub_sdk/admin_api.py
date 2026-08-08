from __future__ import annotations

from typing import Any, Optional

from ._http import BaseHttpClient, compact
from ._unset import UNSET
from .models import (
    ActionItem,
    ActionListResponse,
    ActionRecordItem,
    ActionRecordListResponse,
    ActionStatistics,
    AnnouncementItem,
    AnnouncementListResponse,
    AnnouncementStatistics,
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
    ProjectGithubIntegration,
    LogItem,
    LogListResponse,
    LogStatistics,
    ProjectItem,
    ProjectAliasListResponse,
    ProjectListResponse,
    ProjectStatistics,
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
    方法（``list_projects``、各类统计、按 id 操作行为等）不涉及绑定项目。

    同步与异步两个客户端共用这一份实现：方法把请求转交给底层客户端，绑在
    ``VerhubClient`` 上时直接返回结果，绑在 ``AsyncVerhubClient`` 上时返回协程，
    要 ``await``。因此下面的返回值标注按同步视角写。
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
        published_at: Any = UNSET,
    ) -> AnnouncementItem:
        """
        :param title: 公告标题，最长 128
        :param content: 公告内容，最长 4096
        :param is_pinned: 是否置顶
        :param is_hidden: 是否隐藏，隐藏后公开接口取不到
        :param platforms: 投放平台，最多 8 个；留空表示全平台
        :param author: 作者
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

    # ---- 行为 ----

    def list_actions(
        self,
        *,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> ActionListResponse:
        """
        :param limit: 分页大小，1..100，默认 20
        :param offset: 分页偏移，默认 0
        :return: 行为定义列表
        """
        return self._http.request(
            "GET",
            "/admin/projects/{projectKey}/actions",
            path_params={"projectKey": self._http.require_project_key()},
            query={"limit": limit, "offset": offset},
            auth=True,
        )

    def create_action(
        self,
        *,
        name: str,
        description: str,
        custom_data: Any = UNSET,
    ) -> ActionItem:
        """
        在绑定项目下创建行为定义。

        :param name: 行为名称，最长 128
        :param description: 行为描述，最长 512
        :param custom_data: 自定义数据
        :return: 创建出的行为定义
        """
        return self._http.request(
            "POST",
            "/admin/projects/actions",
            body=compact(
                {
                    "project_key": self._http.require_project_key(),
                    "name": name,
                    "description": description,
                    "custom_data": custom_data,
                }
            ),
            auth=True,
        )

    def update_action(
        self,
        action_id: str,
        *,
        name: Any = UNSET,
        description: Any = UNSET,
        custom_data: Any = UNSET,
    ) -> ActionItem:
        """
        :param action_id: 行为定义 id
        :param name: 行为名称
        :param description: 行为描述
        :param custom_data: 自定义数据
        :return: 更新后的行为定义
        """
        return self._http.request(
            "PATCH",
            "/admin/actions/{action_id}",
            path_params={"action_id": action_id},
            body=compact({"name": name, "description": description, "custom_data": custom_data}),
            auth=True,
        )

    def delete_action(self, action_id: str) -> DeleteSuccessResponse:
        """
        :param action_id: 行为定义 id
        :return: 删除结果
        """
        return self._http.request(
            "DELETE",
            "/admin/actions/{action_id}",
            path_params={"action_id": action_id},
            auth=True,
        )

    def list_action_records(
        self,
        action_id: str,
        *,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> ActionRecordListResponse:
        """
        :param action_id: 行为定义 id
        :param limit: 分页大小，1..100，默认 20
        :param offset: 分页偏移，默认 0
        :return: 该行为下的记录列表
        """
        return self._http.request(
            "GET",
            "/admin/actions/{action_id}",
            path_params={"action_id": action_id},
            query={"limit": limit, "offset": offset},
            auth=True,
        )

    def get_action_record(self, action_record_id: str) -> ActionRecordItem:
        """
        :param action_record_id: 行为记录 id
        :return: 行为记录详情
        """
        return self._http.request(
            "GET",
            "/admin/actions/record/{action_record_id}",
            path_params={"action_record_id": action_record_id},
            auth=True,
        )

    def get_action_statistics(self) -> ActionStatistics:
        """
        :return: 行为定义总数
        """
        return self._http.request("GET", "/admin/actions/statistics", auth=True)

    def get_action_record_statistics(self) -> ActionStatistics:
        """
        :return: 行为记录总数
        """
        return self._http.request("GET", "/admin/actions/record/statistics", auth=True)

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
