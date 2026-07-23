from __future__ import annotations

import json
import sys
from typing import Any, Dict, Mapping, Optional
from urllib.parse import quote, urlencode

import requests

from ._unset import UNSET, UnsetType
from ._version import VERHUB_SDK_VERSION
from .errors import VerhubApiError, VerhubConnectionError, VerhubError

#: 客户端平台声明头。仅用于服务端请求统计，不影响接口返回内容。
PLATFORM_HEADER = "x-verhub-platform"

#: 客户端系统版本明细头，如 ``11`` / ``ubuntu 24.04``；超过 32 字符会被服务端丢弃。
PLATFORM_VERSION_HEADER = "x-verhub-platform-version"

#: 系统版本明细的长度上限，与服务端一致，超出直接截断。
MAX_PLATFORM_VERSION_LENGTH = 32


def detect_platform() -> str:
    """
    猜测当前运行平台，用于填充 :data:`PLATFORM_HEADER`。

    只区分契约里的七个取值；认不出时返回 ``others`` 而不是瞎猜，
    服务端拿到 ``others`` 至少知道这是「说不清的平台」。

    :return: 平台标识
    """
    name = sys.platform
    if name.startswith("win"):
        return "windows"
    if name == "darwin":
        return "macos"
    if name.startswith("linux"):
        return "linux"
    return "others"


def detect_platform_version() -> str:
    """
    从系统信息里提取系统版本明细，用于填充 :data:`PLATFORM_VERSION_HEADER`。

    Windows 按内核构建号还原市场版本号（11 / 10 …），macOS 取产品版本号，
    Linux 读 os-release 拼成 ``发行版 版本号``。取不到就返回空串，交给服务端
    从 User-Agent 兜底推断。

    :return: 系统版本明细；空串表示无从得知
    """
    name = sys.platform
    try:
        if name.startswith("win"):
            info = sys.getwindowsversion()  # type: ignore[attr-defined]
            # Win11 仍上报内核 10.0，只有构建号 >= 22000 能区分出来。
            if info.major == 10 and info.build >= 22000:
                return "11"
            return str(info.major)

        if name == "darwin":
            import platform as _platform

            return _platform.mac_ver()[0] or ""

        if name.startswith("linux"):
            import platform as _platform

            read_os_release = getattr(_platform, "freedesktop_os_release", None)
            if read_os_release is not None:
                try:
                    data = read_os_release()
                    distro = (data.get("ID") or "").strip().lower()
                    version = (data.get("VERSION_ID") or "").strip()
                    combined = f"{distro} {version}".strip()
                    if combined:
                        return combined[:MAX_PLATFORM_VERSION_LENGTH]
                except OSError:
                    pass
            return ""
    except Exception:
        # 版本探测纯属锦上添花，任何异常都不该阻断请求。
        return ""

    return ""


def compact(source: Mapping[str, Any]) -> Dict[str, Any]:
    """
    丢掉值为 :data:`~verhub_sdk._unset.UNSET` 的字段，保留显式的 ``None``。

    ``None`` 会被序列化成 JSON null，是「把这个字段置空」的意思；只有
    完全没提供的字段才该从请求里消失。

    :param source: 原始字段表
    :return: 过滤后的字段表
    """
    return {key: value for key, value in source.items() if not isinstance(value, UnsetType)}


class HttpClient:
    """底层 HTTP 客户端，两个命名空间共用一份连接、凭据与来源声明。"""

    def __init__(
        self,
        base_url: str,
        project_key: Optional[str] = None,
        token: Optional[str] = None,
        *,
        platform: Any = UNSET,
        platform_version: Any = UNSET,
        timeout: float = 15.0,
        session: Optional[requests.Session] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """
        :param base_url: API 根地址，须包含 ``/api/v1`` 前缀
        :param project_key: 绑定的项目标识；项目作用域的方法默认用它
        :param token: 管理员 JWT 或 API Key，仅 admin 接口需要
        :param platform: 平台声明；省略则自动探测，传 ``None`` 则不声明
        :param platform_version: 系统版本明细；省略时若平台也是自动探测则一并
            自动探测，传 ``None`` 则不声明
        :param timeout: 单次请求超时（秒）
        :param session: 自定义 ``requests.Session``，可用于配置代理、重试、证书
        :param user_agent: 覆盖默认 User-Agent
        """
        self.base_url = base_url.strip().rstrip("/")
        self.project_key = project_key
        self.token = token or ""
        self.timeout = timeout
        self.session = session or requests.Session()
        self.user_agent = user_agent or f"verhub-sdk-python/{VERHUB_SDK_VERSION}"

        auto_platform = isinstance(platform, UnsetType)
        self.platform = detect_platform() if auto_platform else platform

        if isinstance(platform_version, UnsetType):
            # 平台是自己探测出来的，才顺带把版本也探测了——用户指定了平台却由我们
            # 猜版本，很容易出现「平台 linux、版本却是 windows 11」的错配。
            self.platform_version = (
                (detect_platform_version() or None) if (auto_platform and self.platform) else None
            )
        else:
            self.platform_version = platform_version

    def set_token(self, token: str) -> None:
        """
        :param token: 管理员 JWT 或 API Key
        """
        self.token = token

    def clear_token(self) -> None:
        """清除当前凭据，之后调用 admin 接口会直接抛错。"""
        self.token = ""

    def set_project_key(self, project_key: str) -> None:
        """
        :param project_key: 新的绑定项目标识
        """
        self.project_key = project_key

    def set_platform(self, platform: Optional[str]) -> None:
        """
        :param platform: 平台声明；传 ``None`` 则不再声明平台
        """
        self.platform = platform

    def set_platform_version(self, platform_version: Optional[str]) -> None:
        """
        :param platform_version: 系统版本明细；传 ``None`` 则不再声明
        """
        self.platform_version = platform_version

    def require_project_key(self) -> str:
        """
        :return: 绑定的项目标识
        :raises VerhubError: 未绑定 project_key
        """
        if not self.project_key:
            raise VerhubError("未设置 project_key：请在创建客户端时传入，或调用 set_project_key()")
        return self.project_key

    def request(
        self,
        method: str,
        path_template: str,
        *,
        path_params: Optional[Mapping[str, str]] = None,
        query: Optional[Mapping[str, Any]] = None,
        body: Optional[Mapping[str, Any]] = None,
        auth: bool = False,
    ) -> Any:
        """
        :param method: HTTP 方法
        :param path_template: 形如 ``/public/{projectKey}`` 的路径模板
        :param path_params: 路径参数，值会被 URL 编码
        :param query: 查询参数，值为 ``None`` 的项会被丢弃
        :param body: JSON 请求体
        :param auth: 是否附带 Bearer 凭据
        :return: 已解析的响应体
        :raises VerhubApiError: 服务端返回非 2xx
        :raises VerhubConnectionError: 请求未能到达服务端
        """
        url = self._build_url(self._resolve_path(path_template, path_params), query)

        headers: Dict[str, str] = {
            "Accept": "application/json",
            "User-Agent": self.user_agent,
        }
        if self.platform:
            headers[PLATFORM_HEADER] = self.platform
        if self.platform_version:
            headers[PLATFORM_VERSION_HEADER] = self.platform_version

        if auth:
            if not self.token:
                raise VerhubApiError("缺少凭据：请先设置 token", 401, None)
            headers["Authorization"] = f"Bearer {self.token}"

        payload = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            payload = json.dumps(body, ensure_ascii=False).encode("utf-8")

        try:
            response = self.session.request(
                method=method,
                url=url,
                headers=headers,
                data=payload,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise VerhubConnectionError(f"请求 {method} {url} 失败：{exc}", exc) from exc

        data = self._parse_json(response.text)
        if not response.ok:
            message = self._error_message(data) or f"请求失败，HTTP {response.status_code}"
            raise VerhubApiError(message, response.status_code, data)

        return data

    def _resolve_path(self, template: str, params: Optional[Mapping[str, str]]) -> str:
        """
        :param template: 路径模板
        :param params: 路径参数
        :return: 填充后的路径
        """
        path = template
        while True:
            left = path.find("{")
            if left < 0:
                break
            right = path.find("}", left)
            if right < 0:
                break

            key = path[left + 1 : right]
            value = (params or {}).get(key)
            if value is None or value == "":
                raise ValueError(f"缺少路径参数：{key}")

            path = f"{path[:left]}{quote(str(value), safe='')}{path[right + 1 :]}"

        return path

    def _build_url(self, path: str, query: Optional[Mapping[str, Any]]) -> str:
        """
        :param path: 已填充的路径
        :param query: 查询参数
        :return: 完整 URL
        """
        if not query:
            return f"{self.base_url}{path}"

        pairs = []
        for key, value in query.items():
            if value is None or isinstance(value, UnsetType):
                continue
            if isinstance(value, bool):
                pairs.append((key, "true" if value else "false"))
            else:
                pairs.append((key, str(value)))

        if not pairs:
            return f"{self.base_url}{path}"

        return f"{self.base_url}{path}?{urlencode(pairs)}"

    def _parse_json(self, raw: str) -> Any:
        """
        :param raw: 原始响应文本
        :return: 解析结果；不是 JSON 时原样返回文本
        """
        if not raw:
            return {}

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return raw

    def _error_message(self, body: Any) -> Optional[str]:
        """
        :param body: 已解析的响应体
        :return: 错误信息；NestJS 校验失败时 message 是字符串数组
        """
        if not isinstance(body, dict):
            return None

        message = body.get("message")
        if isinstance(message, str):
            return message
        if isinstance(message, list) and message:
            return "; ".join(str(item) for item in message)

        return None
