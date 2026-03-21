from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional
from urllib.parse import urlencode

import requests

VERHUB_SDK_VERSION = "0.1.0"


class VerhubApiError(Exception):
    """Verhub API 错误对象。"""

    def __init__(self, message: str, status: int, body: Any) -> None:
        """
        :param message: 错误信息
        :param status: HTTP 状态码
        :param body: 响应体
        """
        super().__init__(message)
        self.status = status
        self.body = body


@dataclass
class VerhubClientOptions:
    """Verhub SDK 客户端配置。"""

    base_url: str
    token: str = ""
    timeout_seconds: float = 15.0


def _compact_dict(source: Mapping[str, Any]) -> Dict[str, Any]:
    """
    过滤掉值为 None 或空字符串的字段。

    :param source: 原始字典
    :return: 过滤后的字典
    """
    out: Dict[str, Any] = {}
    for key, value in source.items():
        if value is None or value == "":
            continue
        out[key] = value
    return out


class _VerhubBaseClient:
    """内部 HTTP 客户端。"""

    def __init__(self, options: VerhubClientOptions) -> None:
        """
        :param options: 客户端配置
        """
        self.base_url = options.base_url.rstrip("/")
        self.token = options.token
        self.timeout_seconds = options.timeout_seconds

    def set_token(self, token: str) -> None:
        """
        :param token: Bearer Token
        """
        self.token = token

    def clear_token(self) -> None:
        """清理当前 Bearer Token。"""
        self.token = ""

    def request(
        self,
        method: str,
        path_template: str,
        *,
        path_params: Optional[Mapping[str, str]] = None,
        query: Optional[Mapping[str, Any]] = None,
        body: Optional[Mapping[str, Any]] = None,
        auth: str = "none",
    ) -> Any:
        """
        :param method: HTTP 方法
        :param path_template: 路径模板
        :param path_params: 路径参数
        :param query: 查询参数
        :param body: 请求体
        :param auth: 鉴权模式（none/bearer）
        :return: 解析后的响应体
        """
        path = self._resolve_path(path_template, path_params)
        url = self._build_url(path, query)

        headers: Dict[str, str] = {"Accept": "application/json"}
        if auth == "bearer":
            if not self.token:
                raise VerhubApiError("Missing bearer token", 401, None)
            headers["Authorization"] = f"Bearer {self.token}"

        payload = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            payload = json.dumps(body)

        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            data=payload,
            timeout=self.timeout_seconds,
        )

        raw = response.text
        data = self._parse_json(raw)
        if not response.ok:
            message = self._extract_error_message(data) or f"Request failed with status {response.status_code}"
            raise VerhubApiError(message, response.status_code, data)

        return data

    def _resolve_path(self, path_template: str, path_params: Optional[Mapping[str, str]]) -> str:
        """
        :param path_template: 路径模板
        :param path_params: 路径参数
        :return: 解析后的路径
        """
        path = path_template
        for key in self._extract_placeholders(path_template):
            if not path_params or not path_params.get(key):
                raise ValueError(f"Missing path param: {key}")
            path = path.replace(f"{{{key}}}", requests.utils.quote(path_params[key], safe=""))

        return path

    def _extract_placeholders(self, path_template: str) -> list[str]:
        """
        :param path_template: 路径模板
        :return: 占位符列表
        """
        placeholders: list[str] = []
        start = 0
        while True:
            left = path_template.find("{", start)
            if left < 0:
                break
            right = path_template.find("}", left)
            if right < 0:
                break
            placeholders.append(path_template[left + 1 : right])
            start = right + 1

        return placeholders

    def _build_url(self, path: str, query: Optional[Mapping[str, Any]]) -> str:
        """
        :param path: 已解析路径
        :param query: 查询参数
        :return: 完整 URL
        """
        if not query:
            return f"{self.base_url}{path}"

        filtered = _compact_dict(query)
        if not filtered:
            return f"{self.base_url}{path}"

        return f"{self.base_url}{path}?{urlencode(filtered)}"

    def _parse_json(self, raw: str) -> Any:
        """
        :param raw: 原始文本
        :return: 解析结果
        """
        if not raw:
            return {}

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return raw

    def _extract_error_message(self, body: Any) -> Optional[str]:
        """
        :param body: 响应体
        :return: 错误消息
        """
        if not isinstance(body, dict):
            return None

        message = body.get("message")
        if isinstance(message, str):
            return message
        if isinstance(message, list) and message and isinstance(message[0], str):
            return message[0]

        return None


class VerhubPublicApi:
    """Verhub 公开接口命名空间。"""

    def __init__(self, client: _VerhubBaseClient) -> None:
        """
        :param client: 底层客户端
        """
        self._client = client

    def get_project_public_info(self, project_key: str) -> Any:
        """
        :param project_key: 项目标识
        :return: 项目公开信息
        """
        return self._client.request("GET", "/public/{projectKey}", path_params={"projectKey": project_key})

    def list_public_versions(self, project_key: str, limit: Optional[int] = None, offset: Optional[int] = None) -> Any:
        """
        :param project_key: 项目标识
        :param limit: 分页大小
        :param offset: 分页偏移
        :return: 版本列表
        """
        return self._client.request(
            "GET",
            "/public/{projectKey}/versions",
            path_params={"projectKey": project_key},
            query=_compact_dict({"limit": limit, "offset": offset}),
        )

    def get_latest_public_version(self, project_key: str) -> Any:
        """
        :param project_key: 项目标识
        :return: 最新公开版本
        """
        return self._client.request("GET", "/public/{projectKey}/versions/latest", path_params={"projectKey": project_key})

    def list_public_announcements(self, project_key: str, limit: Optional[int] = None, offset: Optional[int] = None) -> Any:
        """
        :param project_key: 项目标识
        :param limit: 分页大小
        :param offset: 分页偏移
        :return: 公告列表
        """
        return self._client.request(
            "GET",
            "/public/{projectKey}/announcements",
            path_params={"projectKey": project_key},
            query=_compact_dict({"limit": limit, "offset": offset}),
        )

    def get_latest_public_announcement(self, project_key: str) -> Any:
        """
        :param project_key: 项目标识
        :return: 最新公告
        """
        return self._client.request(
            "GET",
            "/public/{projectKey}/announcements/latest",
            path_params={"projectKey": project_key},
        )

    def create_feedback(
        self,
        project_key: str,
        content: str,
        user_id: Optional[str] = None,
        rating: Optional[int] = None,
        platform: Optional[str] = None,
    ) -> Any:
        """
        :param project_key: 项目标识
        :param content: 反馈内容
        :param user_id: 用户 ID
        :param rating: 评分
        :param platform: 平台
        :return: 创建结果
        """
        return self._client.request(
            "POST",
            "/public/{projectKey}/feedbacks",
            path_params={"projectKey": project_key},
            body=_compact_dict({"user_id": user_id, "rating": rating, "content": content, "platform": platform}),
        )

    def create_log(
        self,
        project_key: str,
        level: int,
        content: str,
        device_info: Optional[Mapping[str, Any]] = None,
        custom_data: Optional[Mapping[str, Any]] = None,
    ) -> Any:
        """
        :param project_key: 项目标识
        :param level: 日志等级
        :param content: 日志内容
        :param device_info: 设备信息
        :param custom_data: 自定义数据
        :return: 创建结果
        """
        return self._client.request(
            "POST",
            "/public/{projectKey}/logs",
            path_params={"projectKey": project_key},
            body=_compact_dict(
                {
                    "level": level,
                    "content": content,
                    "device_info": dict(device_info) if device_info else None,
                    "custom_data": dict(custom_data) if custom_data else None,
                }
            ),
        )

    def create_action_record(
        self,
        project_key: str,
        action_id: str,
        http: Optional[Mapping[str, Any]] = None,
        custom_data: Optional[Mapping[str, Any]] = None,
    ) -> Any:
        """
        :param project_key: 项目标识
        :param action_id: 行为 ID
        :param http: HTTP 上下文
        :param custom_data: 自定义数据
        :return: 创建结果
        """
        return self._client.request(
            "POST",
            "/public/{projectKey}/actions",
            path_params={"projectKey": project_key},
            body=_compact_dict(
                {
                    "action_id": action_id,
                    "http": dict(http) if http else None,
                    "custom_data": dict(custom_data) if custom_data else None,
                }
            ),
        )


class VerhubAdminApi:
    """Verhub 管理接口命名空间。"""

    def __init__(self, client: _VerhubBaseClient) -> None:
        """
        :param client: 底层客户端
        """
        self._client = client

    def create_project(
        self,
        project_key: str,
        name: str,
        repo_url: Optional[str] = None,
        description: Optional[str] = None,
        author: Optional[str] = None,
        author_homepage_url: Optional[str] = None,
        icon_url: Optional[str] = None,
        website_url: Optional[str] = None,
        published_at: Optional[int] = None,
    ) -> Any:
        """
        :param project_key: 项目标识
        :param name: 项目名
        :param repo_url: 仓库地址
        :param description: 项目描述
        :param author: 作者
        :param author_homepage_url: 作者主页
        :param icon_url: 图标地址
        :param website_url: 官网地址
        :param published_at: 发布时间
        :return: 创建结果
        """
        return self._client.request(
            "POST",
            "/admin/projects",
            auth="bearer",
            body=_compact_dict(
                {
                    "project_key": project_key,
                    "name": name,
                    "repo_url": repo_url,
                    "description": description,
                    "author": author,
                    "author_homepage_url": author_homepage_url,
                    "icon_url": icon_url,
                    "website_url": website_url,
                    "published_at": published_at,
                }
            ),
        )

    def delete_project(self, project_id: str) -> Any:
        """
        :param project_id: 项目标识
        :return: 删除结果
        """
        return self._client.request(
            "DELETE",
            "/admin/projects/{id}",
            auth="bearer",
            path_params={"id": project_id},
        )

    def create_version(
        self,
        project_key: str,
        version: str,
        title: str,
        content: str,
        download_links: Optional[list[Dict[str, Any]]] = None,
        forced: Optional[bool] = None,
        is_latest: Optional[bool] = None,
        is_preview: Optional[bool] = None,
        published_at: Optional[int] = None,
    ) -> Any:
        """
        :return: 创建结果
        """
        return self._client.request(
            "POST",
            "/admin/projects/{projectKey}/versions",
            auth="bearer",
            path_params={"projectKey": project_key},
            body=_compact_dict(
                {
                    "version": version,
                    "title": title,
                    "content": content,
                    "download_links": download_links,
                    "forced": forced,
                    "is_latest": is_latest,
                    "is_preview": is_preview,
                    "published_at": published_at,
                }
            ),
        )

    def update_version(
        self,
        project_key: str,
        version_id: str,
        title: Optional[str] = None,
        content: Optional[str] = None,
        download_links: Optional[list[Dict[str, Any]]] = None,
        forced: Optional[bool] = None,
        is_latest: Optional[bool] = None,
        is_preview: Optional[bool] = None,
        published_at: Optional[int] = None,
    ) -> Any:
        """
        :return: 更新结果
        """
        return self._client.request(
            "PATCH",
            "/admin/projects/{projectKey}/versions/{id}",
            auth="bearer",
            path_params={"projectKey": project_key, "id": version_id},
            body=_compact_dict(
                {
                    "title": title,
                    "content": content,
                    "download_links": download_links,
                    "forced": forced,
                    "is_latest": is_latest,
                    "is_preview": is_preview,
                    "published_at": published_at,
                }
            ),
        )

    def delete_version(self, project_key: str, version_id: str) -> Any:
        """
        :return: 删除结果
        """
        return self._client.request(
            "DELETE",
            "/admin/projects/{projectKey}/versions/{id}",
            auth="bearer",
            path_params={"projectKey": project_key, "id": version_id},
        )

    def create_announcement(
        self,
        project_key: str,
        title: str,
        content: str,
        is_pinned: Optional[bool] = None,
        author: Optional[str] = None,
        published_at: Optional[int] = None,
    ) -> Any:
        """
        :return: 创建结果
        """
        return self._client.request(
            "POST",
            "/admin/projects/{projectKey}/announcements",
            auth="bearer",
            path_params={"projectKey": project_key},
            body=_compact_dict(
                {
                    "title": title,
                    "content": content,
                    "is_pinned": is_pinned,
                    "author": author,
                    "published_at": published_at,
                }
            ),
        )

    def update_announcement(
        self,
        project_key: str,
        announcement_id: str,
        title: Optional[str] = None,
        content: Optional[str] = None,
        is_pinned: Optional[bool] = None,
        author: Optional[str] = None,
        published_at: Optional[int] = None,
    ) -> Any:
        """
        :return: 更新结果
        """
        return self._client.request(
            "PATCH",
            "/admin/projects/{projectKey}/announcements/{id}",
            auth="bearer",
            path_params={"projectKey": project_key, "id": announcement_id},
            body=_compact_dict(
                {
                    "title": title,
                    "content": content,
                    "is_pinned": is_pinned,
                    "author": author,
                    "published_at": published_at,
                }
            ),
        )

    def delete_announcement(self, project_key: str, announcement_id: str) -> Any:
        """
        :return: 删除结果
        """
        return self._client.request(
            "DELETE",
            "/admin/projects/{projectKey}/announcements/{id}",
            auth="bearer",
            path_params={"projectKey": project_key, "id": announcement_id},
        )

    def list_feedbacks(self, project_key: str, limit: Optional[int] = None, offset: Optional[int] = None) -> Any:
        """
        :return: 反馈列表
        """
        return self._client.request(
            "GET",
            "/admin/projects/{projectKey}/feedbacks",
            auth="bearer",
            path_params={"projectKey": project_key},
            query=_compact_dict({"limit": limit, "offset": offset}),
        )

    def update_feedback(
        self,
        project_key: str,
        feedback_id: str,
        rating: Optional[int] = None,
        content: Optional[str] = None,
        platform: Optional[str] = None,
    ) -> Any:
        """
        :return: 更新结果
        """
        return self._client.request(
            "PATCH",
            "/admin/projects/{projectKey}/feedbacks/{id}",
            auth="bearer",
            path_params={"projectKey": project_key, "id": feedback_id},
            body=_compact_dict({"rating": rating, "content": content, "platform": platform}),
        )

    def delete_feedback(self, project_key: str, feedback_id: str) -> Any:
        """
        :return: 删除结果
        """
        return self._client.request(
            "DELETE",
            "/admin/projects/{projectKey}/feedbacks/{id}",
            auth="bearer",
            path_params={"projectKey": project_key, "id": feedback_id},
        )

    def list_logs(
        self,
        project_key: str,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        level: Optional[int] = None,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
    ) -> Any:
        """
        :return: 日志列表
        """
        return self._client.request(
            "GET",
            "/admin/projects/{projectKey}/logs",
            auth="bearer",
            path_params={"projectKey": project_key},
            query=_compact_dict(
                {
                    "limit": limit,
                    "offset": offset,
                    "level": level,
                    "start_time": start_time,
                    "end_time": end_time,
                }
            ),
        )

    def list_actions(self, project_key: str, limit: Optional[int] = None, offset: Optional[int] = None) -> Any:
        """
        :return: 行为定义列表
        """
        return self._client.request(
            "GET",
            "/admin/projects/{projectKey}/actions",
            auth="bearer",
            path_params={"projectKey": project_key},
            query=_compact_dict({"limit": limit, "offset": offset}),
        )

    def create_action(self, project_key: str, name: str, description: Optional[str] = None) -> Any:
        """
        :return: 创建结果
        """
        return self._client.request(
            "POST",
            "/admin/projects/actions",
            auth="bearer",
            body=_compact_dict({"project_key": project_key, "name": name, "description": description}),
        )

    def update_action(self, action_id: str, name: Optional[str] = None, description: Optional[str] = None) -> Any:
        """
        :return: 更新结果
        """
        return self._client.request(
            "PATCH",
            "/admin/actions/{action_id}",
            auth="bearer",
            path_params={"action_id": action_id},
            body=_compact_dict({"name": name, "description": description}),
        )

    def delete_action(self, action_id: str) -> Any:
        """
        :return: 删除结果
        """
        return self._client.request(
            "DELETE",
            "/admin/actions/{action_id}",
            auth="bearer",
            path_params={"action_id": action_id},
        )


class VerhubSDK:
    """Verhub SDK 统一入口。"""

    version = VERHUB_SDK_VERSION

    def __init__(self, base_url: str, token: str = "", timeout_seconds: float = 15.0) -> None:
        """
        :param base_url: API 基址
        :param token: Bearer Token
        :param timeout_seconds: 超时时间（秒）
        """
        self._client = _VerhubBaseClient(
            VerhubClientOptions(base_url=base_url, token=token, timeout_seconds=timeout_seconds)
        )
        self.public_api = VerhubPublicApi(self._client)
        self.publicApi = self.public_api
        self.admin_api = VerhubAdminApi(self._client)
        self.adminApi = self.admin_api

    def set_token(self, token: str) -> None:
        """
        :param token: Bearer Token
        """
        self._client.set_token(token)

    def clear_token(self) -> None:
        """清理当前 Bearer Token。"""
        self._client.clear_token()
