from __future__ import annotations

from typing import Any, Optional

from ._http import BaseHttpClient, compact
from ._unset import UNSET
from .errors import VerhubError
from .models import (
    ActionRecordItem,
    AnnouncementItem,
    AnnouncementListResponse,
    CheckUpdateResponse,
    FeedbackItem,
    LogItem,
    Platform,
    ProjectItem,
    PublicFeedbackOptions,
    VersionItem,
    VersionListResponse,
)


class PublicApi:
    """
    公开接口，不需要凭据。

    这些是客户端 App 会直接调用的那一组：查版本、查公告、报日志和行为。全部作用于
    客户端绑定的项目（构造时传入的 ``project_key``），因此方法不再逐次收项目参数。

    同步与异步两个客户端共用这一份实现：方法把请求转交给底层客户端，绑在
    ``VerhubClient`` 上时直接返回结果，绑在 ``AsyncVerhubClient`` 上时返回协程，
    要 ``await``。因此下面的返回值标注按同步视角写。发请求之前的本地校验
    （缺 ``project_key`` 等）两种形态下都在调用当下就抛。
    """

    def __init__(self, http: BaseHttpClient) -> None:
        """
        :param http: 底层 HTTP 客户端
        """
        self._http = http

    def get_project(self, *, locale: Optional[str] = None) -> ProjectItem:
        """
        :param locale: 语言偏好。命中项目注册的语言（主标签或同义标签，大小写不敏感）
            且该语言译文填了对应字段时，``name`` / ``description`` 返回译文，
            ``locale`` 标出实际语言；否则回落项目自身的值
        :return: 项目公开信息
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}",
            path_params={"projectKey": self._http.require_project_key()},
            query={"locale": locale},
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
        version: Optional[str] = None,
        locale: Optional[str] = None,
    ) -> AnnouncementListResponse:
        """
        :param limit: 分页大小，1..100，默认 20
        :param offset: 分页偏移，默认 0
        :param platform: 只取投放到该平台的公告
        :param version: 客户端当前版本号，用来筛掉不在可见版本范围内的公告。
            **不传时，所有设了可见版本范围的公告都不会返回。**
        :param locale: 语言偏好。命中项目注册的语言且该公告有译文时返回译文，
            否则返回默认内容；返回项的 ``locale`` 字段标出实际语言（None 即默认内容）
        :return: 公告列表
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}/announcements",
            path_params={"projectKey": self._http.require_project_key()},
            query={
                "limit": limit,
                "offset": offset,
                "platform": platform,
                "version": version,
                "locale": locale,
            },
        )

    def get_latest_announcement(
        self,
        *,
        platform: Optional[Platform] = None,
        version: Optional[str] = None,
        locale: Optional[str] = None,
    ) -> AnnouncementItem:
        """
        :param platform: 只取投放到该平台的公告
        :param version: 客户端当前版本号；不传时设了可见版本范围的公告不会返回
        :param locale: 语言偏好，未注册或无译文时回落到默认内容
        :return: 最新公告
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}/announcements/latest",
            path_params={"projectKey": self._http.require_project_key()},
            query={"platform": platform, "version": version, "locale": locale},
        )

    def get_feedback_options(self) -> PublicFeedbackOptions:
        """
        反馈提交选项。客户端据此决定要不要显示「转发到 GitHub Issue」的勾选框。

        :return: 本项目是否开放转发，以及转发时联系方式是否必填
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}/feedbacks/options",
            path_params={"projectKey": self._http.require_project_key()},
        )

    def create_feedback(
        self,
        *,
        content: str,
        user_id: Any = UNSET,
        rating: Any = UNSET,
        contact: Any = UNSET,
        forward_to_github: Any = UNSET,
        is_hidden: Any = UNSET,
        platform: Any = UNSET,
        platform_version: Any = UNSET,
        custom_data: Any = UNSET,
    ) -> FeedbackItem:
        """
        提交用户反馈。

        ``forward_to_github`` 为 True 时联系方式必填，这条本地就会拒绝
        （抛 :class:`VerhubError`），不必往服务端跑一趟；项目是否开放转发只有
        服务端知道，未开放时提交会拿到 400，Issue 建失败则整条反馈不会被记录（503）。

        :param content: 反馈内容，最长 4096
        :param user_id: 调用方自己的用户标识
        :param rating: 评分，1..5
        :param contact: 联系方式，最长 128
        :param forward_to_github: 是否把这条反馈转发成 GitHub Issue，默认 False；
            传 True 时联系方式必填且受单 IP 转发限流约束
        :param is_hidden: 是否隐藏；隐藏后后台列表默认不返回，评分仍计入统计
        :param platform: 平台声明；省略时服务端按 User-Agent 与请求头推断
        :param platform_version: 系统版本明细，如 ``11`` / ``ubuntu 24.04``
        :param custom_data: 自定义数据
        :return: 创建出的反馈
        :raises VerhubError: 选了转发却没填 ``contact``
        """
        if forward_to_github is True and not (isinstance(contact, str) and contact.strip()):
            raise VerhubError("转发到 GitHub Issue 需要联系方式：请先填写 contact")
        return self._http.request(
            "POST",
            "/public/{projectKey}/feedbacks",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {
                    "content": content,
                    "user_id": user_id,
                    "rating": rating,
                    "contact": contact,
                    "forward_to_github": forward_to_github,
                    "is_hidden": is_hidden,
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
