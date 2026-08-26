from __future__ import annotations

from typing import Any, Optional

from ._http import BaseHttpClient, compact
from ._unset import UNSET
from .errors import VerhubError
from .models import (
    AnnouncementItem,
    AnnouncementListResponse,
    CheckUpdateResponse,
    EventSubjectDeleteResponse,
    EventSubjectExport,
    FeedbackItem,
    IngestEventsResponse,
    LogItem,
    Platform,
    ProjectItem,
    PublicFeedbackOptions,
    TermsDocumentListResponse,
    TermsDocumentSlug,
    TermsDocumentView,
    VersionItem,
    VersionListResponse,
)


class PublicApi:
    """
    公开接口，不需要凭据。

    项目作用域的方法用客户端绑定的 ``project_key``，不再逐次收项目参数。

    同步与异步两个客户端共用这一份实现：方法把请求转交给底层客户端，绑在
    ``VerhubClient`` 上时直接返回结果，绑在 ``AsyncVerhubClient`` 上时返回协程，
    要 ``await``。返回值标注按同步视角写；本地校验（缺 ``project_key`` 等）
    两种形态下都在调用当下就抛。
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
        locale: Optional[str] = None,
    ) -> VersionListResponse:
        """
        :param limit: 分页大小，1..100，默认 20
        :param offset: 分页偏移，默认 0
        :param locale: 语言偏好。命中项目注册的语言（主标签或同义标签，大小写不敏感）
            且该版本有译文时，``title`` / ``content`` 返回译文；否则回落版本自身的内容。
            返回项的 ``locale`` 字段标出实际语言（None 即默认内容）
        :return: 版本列表
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}/versions",
            path_params={"projectKey": self._http.require_project_key()},
            query={"limit": limit, "offset": offset, "locale": locale},
        )

    def get_latest_version(self, *, locale: Optional[str] = None) -> VersionItem:
        """
        :param locale: 语言偏好，语义同 :meth:`list_versions`
        :return: 最新正式版本
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}/versions/latest",
            path_params={"projectKey": self._http.require_project_key()},
            query={"locale": locale},
        )

    def get_latest_preview_version(self, *, locale: Optional[str] = None) -> Optional[VersionItem]:
        """
        :param locale: 语言偏好，语义同 :meth:`list_versions`
        :return: 最新 preview 版本；没有则为 None
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}/versions/latest-preview",
            path_params={"projectKey": self._http.require_project_key()},
            query={"locale": locale},
        )

    def get_version(self, version: str, *, locale: Optional[str] = None) -> VersionItem:
        """
        :param version: 版本号，如 ``1.2.0``
        :param locale: 语言偏好，语义同 :meth:`list_versions`
        :return: 指定版本信息
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}/versions/by-version/{version}",
            path_params={"projectKey": self._http.require_project_key(), "version": version},
            query={"locale": locale},
        )

    def check_update(
        self,
        *,
        current_version: Optional[str] = None,
        current_comparable_version: Optional[str] = None,
        include_preview: Optional[bool] = None,
        locale: Optional[str] = None,
    ) -> CheckUpdateResponse:
        """
        提交当前版本并检查更新。

        ``current_version`` 与 ``current_comparable_version`` 至少提供一个。
        只给 ``current_version`` 时服务端按版本号查库取其登记的可比较版本号，
        该版本未登记会返回 400；两者都给时以 ``current_comparable_version`` 为准。

        :param current_version: 当前语义化版本号
        :param current_comparable_version: 当前可比较版本号，如 ``1.20.326``
        :param include_preview: 是否把 preview 版本纳入比较候选
        :param locale: 语言偏好。命中项目注册的语言时，响应里 ``latest_version`` /
            ``latest_preview_version`` / ``target_version`` 三个版本对象的 title 与
            content 都返回对应译文；未注册或无译文时回落默认内容
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
                    "locale": locale if locale else UNSET,
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
        取反馈提交选项，据此决定要不要显示「转发到 GitHub Issue」的勾选框。

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

        ``forward_to_github`` 为 True 时联系方式必填，本地即拒绝；项目未开放转发
        时服务端返回 400，Issue 建失败时整条反馈不会被记录（503）。

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

    # ---- 条款文档 ----

    def list_terms(self) -> TermsDocumentListResponse:
        """
        列出全部条款文档的标题与最后更新时间，不含正文。

        不作用于绑定项目，条款是实例级的。

        :return: 条款文档摘要列表
        """
        return self._http.request("GET", "/public/terms")

    def get_terms(self, slug: TermsDocumentSlug) -> TermsDocumentView:
        """
        取条款文档正文（Markdown）。实例未自定义时返回内置正文。

        :param slug: 文档标识，``privacy-policy`` 或 ``sdk-compliance``
        :return: 含正文的条款文档
        """
        return self._http.request("GET", "/public/terms/{slug}", path_params={"slug": slug})

    # ---- 事件采集 ----

    def track(self, name: str, properties: Optional[dict] = None) -> None:
        """
        记录一次用户行为，入队即返回，不发起网络请求。

        事件名无需预先登记，服务端第一次收到就自动建立定义。建议用小写下划线
        形式（``checkout_clicked``）；服务端归一化为小写，只接受字母、数字、
        下划线、点、连字符与冒号。

        队列满 ``batch_size`` 条或每 ``flush_interval`` 秒发送一次；发送失败按
        指数退避重试，每条事件带幂等键。未同意、已退出或采集被关闭时本调用是
        空操作。异步客户端上返回协程，要 ``await``。

        :param name: 事件名
        :param properties: 自定义属性，按属性统计只看第一层
        """
        return self._http.analytics.track(name, properties)

    def flush(self) -> None:
        """
        立即发送队列里的所有事件。退出前调用可以避免丢掉最后一批。

        异步客户端上返回协程，要 ``await``。
        """
        return self._http.analytics.flush()

    def opt_out(self) -> None:
        """停止采集、丢弃待发队列、删除本地匿名标识，并把退出标记写入本地。"""
        self._http.analytics.opt_out()

    def opt_in(self) -> None:
        """撤销退出，并生成一个新的匿名标识。"""
        self._http.analytics.opt_in()

    def has_opted_out(self) -> bool:
        """当前是否处于退出状态。"""
        return self._http.analytics.has_opted_out()

    def grant_consent(self) -> None:
        """``require_consent`` 模式下开闸。在此之前 SDK 不采集、不写盘。"""
        self._http.analytics.grant_consent()

    def revoke_consent(self) -> None:
        """撤回同意，等价于 :meth:`opt_out` 并回到未同意状态。"""
        self._http.analytics.revoke_consent()

    def reset_identity(self) -> None:
        """换一个新的匿名标识，切断与既往事件序列的关联。保持采集开启。"""
        self._http.analytics.reset_identity()

    @property
    def distinct_id(self) -> Optional[str]:
        """当前的匿名标识；未采集状态下为 ``None``。"""
        return self._http.analytics.current_distinct_id()

    def export_my_data(self, distinct_id: Optional[str] = None) -> EventSubjectExport:
        """
        导出本机匿名标识下的全部事件明细（GDPR Art.15 / Art.20）。

        :param distinct_id: 省略则用当前标识
        :return: 事件明细
        :raises VerhubError: 没有可用的匿名标识（未采集或已退出）
        """
        return self._http.request(
            "GET",
            "/public/{projectKey}/events/me",
            path_params={"projectKey": self._http.require_project_key()},
            query={"distinct_id": self._require_distinct_id(distinct_id)},
        )

    def delete_my_data(self, distinct_id: Optional[str] = None) -> EventSubjectDeleteResponse:
        """
        删除本机匿名标识下的全部事件明细（GDPR Art.17）。小时汇总不在删除范围内。

        :param distinct_id: 省略则用当前标识
        :return: 删除结果
        :raises VerhubError: 没有可用的匿名标识（未采集或已退出）
        """
        return self._http.request(
            "DELETE",
            "/public/{projectKey}/events/me",
            path_params={"projectKey": self._http.require_project_key()},
            query={"distinct_id": self._require_distinct_id(distinct_id)},
        )

    def ingest_events(
        self,
        *,
        distinct_id: str,
        events: list,
        session_id: Any = UNSET,
    ) -> IngestEventsResponse:
        """
        直接发一批事件，绕过本地队列。常规入口是 :meth:`track`。

        :param distinct_id: 匿名标识
        :param events: 事件数组，单批上限 50，每条须带 ``event_id`` 与 ``name``
        :param session_id: 会话标识
        :return: 逐条回执
        """
        return self._http.request(
            "POST",
            "/public/{projectKey}/events",
            path_params={"projectKey": self._http.require_project_key()},
            body=compact(
                {"distinct_id": distinct_id, "session_id": session_id, "events": events}
            ),
        )

    def _require_distinct_id(self, explicit: Optional[str]) -> str:
        resolved = explicit or self._http.analytics.current_distinct_id()
        if not resolved:
            raise VerhubError(
                "没有可用的匿名标识：事件采集未启用或已退出。可显式传入 distinct_id。"
            )
        return resolved
