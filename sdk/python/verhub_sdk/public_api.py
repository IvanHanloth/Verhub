from __future__ import annotations

from typing import Any, Optional

from ._http import HttpClient, compact
from ._unset import UNSET
from .models import (
    ActionRecordItem,
    AnnouncementItem,
    AnnouncementListResponse,
    CheckUpdateResponse,
    FeedbackItem,
    LogItem,
    Platform,
    ProjectItem,
    VersionItem,
    VersionListResponse,
)


class PublicApi:
    """
    公开接口，不需要凭据。

    这些是客户端 App 会直接调用的那一组：查版本、查公告、报日志和行为。全部作用于
    客户端绑定的项目（构造时传入的 ``project_key``），因此方法不再逐次收项目参数。
    """

    def __init__(self, http: HttpClient) -> None:
        """
        :param http: 底层 HTTP 客户端
        """
        self._http = http

    def get_project(self) -> ProjectItem:
        """
        :return: 项目公开信息
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}",
            path_params={"projectKey": self._http.require_project_key()},
        )

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
            "/public/{projectKey}/versions",
            path_params={"projectKey": self._http.require_project_key()},
            query={"limit": limit, "offset": offset},
        )

    def get_latest_version(self) -> VersionItem:
        """
        :return: 最新正式版本
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}/versions/latest",
            path_params={"projectKey": self._http.require_project_key()},
        )

    def get_latest_preview_version(self) -> Optional[VersionItem]:
        """
        :return: 最新 preview 版本；没有则为 None
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}/versions/latest-preview",
            path_params={"projectKey": self._http.require_project_key()},
        )

    def get_version(self, version: str) -> VersionItem:
        """
        :param version: 版本号，如 ``1.2.0``
        :return: 指定版本信息
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}/versions/by-version/{version}",
            path_params={"projectKey": self._http.require_project_key(), "version": version},
        )

    def check_update(
        self,
        *,
        current_version: Optional[str] = None,
        current_comparable_version: Optional[str] = None,
        include_preview: Optional[bool] = None,
    ) -> CheckUpdateResponse:
        """
        提交当前版本并检查更新。

        ``current_version`` 与 ``current_comparable_version`` 至少提供一个。
        只给 ``current_version`` 时服务端按版本号查库取其登记的可比较版本号，
        该版本未登记会返回 400；两者都给时以 ``current_comparable_version`` 为准。

        :param current_version: 当前语义化版本号
        :param current_comparable_version: 当前可比较版本号，如 ``1.20.326``
        :param include_preview: 是否把 preview 版本纳入比较候选
        :return: 更新判定结果
        """
        return self._http.request(
            "POST",
            "/public/{projectKey}/versions/check-update",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "current_version": current_version if current_version else UNSET,
                    "current_comparable_version": (
                        current_comparable_version if current_comparable_version else UNSET
                    ),
                    "include_preview": include_preview if include_preview is not None else UNSET,
                }
            ),
        )

    def list_announcements(
        self,
        *,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        platform: Optional[Platform] = None,
    ) -> AnnouncementListResponse:
        """
        :param limit: 分页大小，1..100，默认 20
        :param offset: 分页偏移，默认 0
        :param platform: 只取投放到该平台的公告
        :return: 公告列表
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}/announcements",
            path_params={"projectKey": self._http.require_project_key()},
            query={"limit": limit, "offset": offset, "platform": platform},
        )

    def get_latest_announcement(self, *, platform: Optional[Platform] = None) -> AnnouncementItem:
        """
        :param platform: 只取投放到该平台的公告
        :return: 最新公告
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}/announcements/latest",
            path_params={"projectKey": self._http.require_project_key()},
            query={"platform": platform},
        )

    def create_feedback(
        self,
        *,
        content: str,
        user_id: Any = UNSET,
        rating: Any = UNSET,
        platform: Any = UNSET,
        platform_version: Any = UNSET,
        custom_data: Any = UNSET,
    ) -> FeedbackItem:
        """
        :param content: 反馈内容，最长 4096
        :param user_id: 调用方自己的用户标识
        :param rating: 评分，1..5
        :param platform: 平台声明；省略时服务端按 User-Agent 与请求头推断
        :param platform_version: 系统版本明细，如 ``11`` / ``ubuntu 24.04``
        :param custom_data: 自定义数据
        :return: 创建出的反馈
        """
        return self._http.request(
            "POST",
            "/public/{projectKey}/feedbacks",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "content": content,
                    "user_id": user_id,
                    "rating": rating,
                    "platform": platform,
                    "platform_version": platform_version,
                    "custom_data": custom_data,
                }
            ),
        )

    def upload_log(
        self,
        *,
        level: int,
        content: str,
        device_info: Any = UNSET,
        custom_data: Any = UNSET,
    ) -> LogItem:
        """
        :param level: 日志等级，0=debug 1=info 2=warning 3=error
        :param content: 日志内容，最长 4096
        :param device_info: 设备信息，客户端自报
        :param custom_data: 自定义数据
        :return: 创建出的日志
        """
        return self._http.request(
            "POST",
            "/public/{projectKey}/logs",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "level": level,
                    "content": content,
                    "device_info": device_info,
                    "custom_data": custom_data,
                }
            ),
        )

    def create_action_record(self, *, action_id: str, custom_data: Any = UNSET) -> ActionRecordItem:
        """
        :param action_id: 行为定义 ID，需先在后台创建
        :param custom_data: 自定义数据
        :return: 创建出的行为记录
        """
        return self._http.request(
            "POST",
            "/public/{projectKey}/actions",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact({"action_id": action_id, "custom_data": custom_data}),
        )
