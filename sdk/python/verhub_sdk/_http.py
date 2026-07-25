from __future__ import annotations

import json
import logging
import sys
import warnings
from typing import Any, Dict, Mapping, Optional, Tuple, Union
from urllib.parse import quote, urlencode

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from ._unset import UNSET, UnsetType
from ._version import VERHUB_SDK_VERSION
from .errors import VerhubApiError, VerhubAuthError, VerhubConnectionError, VerhubError

#: SDK 日志器。默认不输出，调用方按需 ``logging.getLogger("verhub_sdk").setLevel(DEBUG)``
#: 即可看到每次请求的方法、URL 与状态码。
logger = logging.getLogger("verhub_sdk")

#: 单次请求超时：单值表示连接与读取共用，元组 ``(connect, read)`` 分别指定。
Timeout = Union[float, Tuple[float, float]]

#: 默认重试次数。只作用于连接建立失败与幂等方法（GET 等），POST 不自动重试。
DEFAULT_RETRIES = 2

#: 会触发重试的服务端状态码，均为可安全重试的临时性错误。
RETRY_STATUS = (502, 503, 504)

#: 客户端平台声明头。仅用于服务端请求统计，不影响接口返回内容。
PLATFORM_HEADER = "x-verhub-platform"

#: 客户端系统版本明细头，如 ``11`` / ``ubuntu 24.04``；超过 32 字符会被服务端丢弃。
PLATFORM_VERSION_HEADER = "x-verhub-platform-version"

#: 系统版本明细的长度上限，与服务端一致，超出直接截断。
MAX_PLATFORM_VERSION_LENGTH = 32

#: 老 Windows 的 NT 内核号 → 市场版本号。Win10/11 都是 10.0，另按构建号区分。
WINDOWS_NT_TO_MARKET = {(6, 1): "7", (6, 2): "8", (6, 3): "8.1"}


def sanitize_platform_version(value: str) -> str:
    """
    把系统版本明细规整成能安全放进 HTTP 头的形式。

    请求头只能承载 ASCII，而这个值未必干净：调用方用错编码读系统版本时拿到的
    就是 ``Microsoft Windows [\\ufffd汾 10.0.26200.8875]`` 这种串。不清洗的话，
    ``requests`` 会在 latin-1 编码这一步抛异常，整个请求跟着失败——一个纯统计
    用的头不该有本事弄挂业务请求。

    清洗规则：非可打印 ASCII 的字符一律当作空白（版本号本身是 ASCII，能完整
    留下），折叠连续空白，再按 :data:`MAX_PLATFORM_VERSION_LENGTH` 截断。
    四个语言的 SDK 用同一套规则。

    :param value: 原始版本明细
    :return: 清洗后的版本明细；空串表示无从得知，此时不发这个头
    """
    ascii_only = "".join(c if " " < c <= "~" else " " for c in value)
    return " ".join(ascii_only.split())[:MAX_PLATFORM_VERSION_LENGTH].rstrip()


def _header_safe(value: Optional[str]) -> Optional[str]:
    """
    清洗一个要进请求头的来源声明，洗完是空串就收敛成 ``None``（即不发这个头）。

    平台声明同样走这一步：它在 Python 里是自由字符串，调用方塞进非 ASCII 一样
    会让 ``requests`` 抛异常，而 Rust / TS 那边平台是枚举，天然没这个口子。

    :param value: 原始声明
    :return: 可安全进头的值，或 ``None``
    """
    if not value:
        return None
    return sanitize_platform_version(value) or None


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
            if info.major == 10 and info.minor == 0:
                return "11" if info.build >= 22000 else "10"
            # 更老的 Windows 只能靠 NT 内核号还原市场版本号。
            return WINDOWS_NT_TO_MARKET.get((info.major, info.minor), "")

        if name == "darwin":
            import platform as _platform

            return sanitize_platform_version(_platform.mac_ver()[0] or "")

        if name.startswith("linux"):
            import platform as _platform

            read_os_release = getattr(_platform, "freedesktop_os_release", None)
            if read_os_release is not None:
                try:
                    data = read_os_release()
                    distro = (data.get("ID") or "").strip().lower()
                    version = (data.get("VERSION_ID") or "").strip()
                    return sanitize_platform_version(f"{distro} {version}")
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


def _normalize_base_url(base_url: str) -> str:
    """
    去掉首尾空白与末尾斜杠；base_url 不像带 ``/api/v`` 前缀时给一句温和提醒。

    传错前缀（比如只给裸域名）时所有请求会静默 404，很难排查，这里主动 warn
    一声而不是抛错——非标准挂载路径的部署仍能正常用。

    :param base_url: 原始根地址
    :return: 规范化后的根地址
    """
    normalized = base_url.strip().rstrip("/")
    if "/api/v" not in normalized:
        warnings.warn(
            f"base_url 通常应以 /api/v1 结尾，当前为 {normalized!r}；若非有意为之，"
            f"请求可能全部 404",
            stacklevel=3,
        )
    return normalized


def _build_session(retries: int) -> requests.Session:
    """
    造一个带默认重试的 ``requests.Session``。

    只重试连接建立失败与幂等方法（GET/HEAD 等）——``urllib3.Retry`` 的
    ``allowed_methods`` 默认就不含 POST，所以 check-update 这类 POST 不会被
    重放。``backoff_factor`` 给一点退避，避开瞬时抖动。

    :param retries: 重试次数，``<=0`` 表示不重试
    :return: 配置好的 Session
    """
    session = requests.Session()
    if retries > 0:
        retry = Retry(
            total=retries,
            connect=retries,
            read=0,
            status=retries,
            status_forcelist=RETRY_STATUS,
            backoff_factor=0.3,
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
    return session


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
        timeout: Timeout = 15.0,
        retries: int = DEFAULT_RETRIES,
        session: Optional[requests.Session] = None,
        user_agent: Optional[str] = None,
        app_identifier: Optional[str] = None,
    ) -> None:
        """
        :param base_url: API 根地址，须包含 ``/api/v1`` 前缀
        :param project_key: 绑定的项目标识；项目作用域的方法默认用它
        :param token: 管理员 JWT 或 API Key，仅 admin 接口需要
        :param platform: 平台声明；省略则自动探测，传 ``None`` 则不声明。指定它
            不影响系统版本明细，后者仍会自动探测
        :param platform_version: 系统版本明细；省略则自动探测（平台被显式关成
            ``None`` 时除外），传 ``None`` 则不声明
        :param timeout: 单次请求超时（秒）。单值表示连接与读取共用，传
            ``(connect, read)`` 元组可分别指定——更新检查常希望连接快速失败、
            读取宽松些
        :param retries: 连接失败与幂等请求（GET 等）的自动重试次数，默认 2。
            仅在使用内建 Session 时生效；POST 不自动重试。传 0 关闭
        :param session: 自定义 ``requests.Session``，可用于配置代理、重试、证书。
            传入后 ``retries`` 不再挂载，重试策略由该 Session 自负
        :param user_agent: 覆盖默认 User-Agent，会连带丢掉 SDK 版本信息
        :param app_identifier: 追加到默认 User-Agent 之后的应用标识（如
            ``MyApp/1.2``），既保留 SDK 版本又能做服务端统计；与 ``user_agent``
            同时给时以后者为准
        """
        self.base_url = _normalize_base_url(base_url)
        self.project_key = project_key
        self.token = token or ""
        self.timeout = timeout
        self.session = session or _build_session(retries)

        if user_agent:
            self.user_agent = user_agent
        else:
            self.user_agent = f"verhub-sdk-python/{VERHUB_SDK_VERSION}"
            if app_identifier:
                self.user_agent = f"{self.user_agent} {app_identifier.strip()}"

        # 两个维度各管各的：显式给了就用给的，没给就自己探测。显式指定平台不再
        # 连带禁掉版本探测——那样会让「声明了平台」的调用方彻底报不上系统版本，
        # 而这正是绝大多数客户端的用法。唯一的例外是显式传 platform=None：那是
        # 明确的退出声明，版本一并不报。
        self.platform = _header_safe(
            detect_platform() if isinstance(platform, UnsetType) else platform
        )

        if isinstance(platform_version, UnsetType):
            self.platform_version = detect_platform_version() if self.platform else None
        else:
            self.platform_version = platform_version
        self.platform_version = _header_safe(self.platform_version)

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
        self.platform = _header_safe(platform)

    def set_platform_version(self, platform_version: Optional[str]) -> None:
        """
        :param platform_version: 系统版本明细；传 ``None`` 则不再声明
        """
        # 存进来就已清洗过，请求路径上拿到的一定是能进头的值。
        self.platform_version = _header_safe(platform_version)

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
                # 请求还没发出去就在本地拦下，用专门的异常，别伪造一个假的 401。
                raise VerhubAuthError("缺少凭据：请先设置 token")
            headers["Authorization"] = f"Bearer {self.token}"

        payload = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            payload = json.dumps(body, ensure_ascii=False).encode("utf-8")

        logger.debug("verhub 请求 %s %s", method, url)
        try:
            response = self.session.request(
                method=method,
                url=url,
                headers=headers,
                data=payload,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            logger.debug("verhub 请求 %s %s 失败：%s", method, url, exc)
            raise VerhubConnectionError(f"请求 {method} {url} 失败：{exc}", exc) from exc

        logger.debug("verhub 响应 %s %s -> %s", method, url, response.status_code)
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
