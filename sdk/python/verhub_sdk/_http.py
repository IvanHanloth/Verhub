from __future__ import annotations

import asyncio
import json
import logging
import sys
import time
import warnings
from typing import Any, Dict, Mapping, NamedTuple, Optional, Tuple, Union
from urllib.parse import quote, urlencode

import httpx

from ._analytics import AsyncEventQueue, EventQueue, analytics_namespace
from ._unset import UNSET, UnsetType
from ._version import VERHUB_SDK_VERSION
from .errors import VerhubApiError, VerhubAuthError, VerhubConnectionError, VerhubError

#: SDK 日志器。默认不输出，调用方按需 ``logging.getLogger("verhub_sdk").setLevel(DEBUG)``
#: 即可看到每次请求的方法、URL 与状态码。
logger = logging.getLogger("verhub_sdk")

#: 单次请求超时：单值表示各阶段共用，元组 ``(connect, read)`` 分别指定；也可直接
#: 传 ``httpx.Timeout`` 做精细控制，传 ``None`` 则不限时。
Timeout = Union[float, Tuple[float, float], httpx.Timeout, None]

#: 默认重试次数。
DEFAULT_RETRIES = 2

#: 会触发重试的服务端状态码。
RETRY_STATUS = (502, 503, 504)

#: 会自动重试的幂等方法；其余方法一律不重试。四个语言的 SDK 集合相同。
RETRY_METHODS = frozenset({"GET", "HEAD"})

#: 重试退避基数（秒）：第 n 次重试等 ``BACKOFF_FACTOR * 2 ** (n - 1)``，首次不等。
BACKOFF_FACTOR = 0.3

#: 客户端平台声明头。仅用于服务端请求统计，不影响接口返回内容。
PLATFORM_HEADER = "x-verhub-platform"

#: 客户端系统版本明细头，如 ``11`` / ``ubuntu 24.04``；超过 32 字符会被服务端丢弃。
PLATFORM_VERSION_HEADER = "x-verhub-platform-version"

#: 系统版本明细的长度上限，与服务端一致。
MAX_PLATFORM_VERSION_LENGTH = 32

#: Windows NT 内核号 → 市场版本号。10.0 不在表内，另按构建号区分。
WINDOWS_NT_TO_MARKET = {(6, 1): "7", (6, 2): "8", (6, 3): "8.1"}


def sanitize_platform_version(value: str) -> str:
    """
    把系统版本明细规整成能进 HTTP 头的形式。

    非可打印 ASCII 一律替换成空格，折叠连续空白，按
    :data:`MAX_PLATFORM_VERSION_LENGTH` 截断。四个语言的 SDK 规则相同。

    :param value: 原始版本明细
    :return: 清洗后的版本明细；空串表示无从得知
    """
    ascii_only = "".join(c if " " < c <= "~" else " " for c in value)
    return " ".join(ascii_only.split())[:MAX_PLATFORM_VERSION_LENGTH].rstrip()


def _header_safe(value: Optional[str]) -> Optional[str]:
    """
    清洗一个要进请求头的来源声明，洗完是空串则返回 ``None``。

    :param value: 原始声明
    :return: 可安全进头的值，或 ``None``
    """
    if not value:
        return None
    return sanitize_platform_version(value) or None


def _macos_marketing_version(product_version: str) -> str:
    """
    把 ``platform.mac_ver()`` 的产品版本号收敛成市场版本号。

    ``15.3.1`` → ``15``，``10.15.7`` → ``10.15``。与其余三个语言的 SDK 一致。

    :param product_version: 形如 ``15.3.1`` 的产品版本号
    :return: 市场版本号；无法解析时为空串
    """
    parts = [p for p in product_version.strip().split(".") if p]
    if not parts:
        return ""
    if parts[0] == "10":
        return ".".join(parts[:2])
    return parts[0]


def detect_platform() -> str:
    """
    探测当前运行平台，用于填充 :data:`PLATFORM_HEADER`。

    只区分契约里的七个取值，识别不出时返回 ``others``。

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
    探测系统版本明细，用于填充 :data:`PLATFORM_VERSION_HEADER`。

    Windows 与 macOS 给市场版本号（``11`` / ``15`` / ``10.15``），Linux 读
    os-release 拼成 ``发行版 版本号``。取不到时返回空串。

    :return: 系统版本明细；空串表示无从得知
    """
    name = sys.platform
    try:
        if name.startswith("win"):
            info = sys.getwindowsversion()  # type: ignore[attr-defined]
            # Win11 仍上报内核 10.0，只有构建号 >= 22000 能区分出来。
            if info.major == 10 and info.minor == 0:
                return "11" if info.build >= 22000 else "10"
            return WINDOWS_NT_TO_MARKET.get((info.major, info.minor), "")

        if name == "darwin":
            import platform as _platform

            return sanitize_platform_version(_macos_marketing_version(_platform.mac_ver()[0] or ""))

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
        # 探测失败时不声明版本。
        return ""

    return ""


def compact(source: Mapping[str, Any]) -> Dict[str, Any]:
    """
    丢掉值为 :data:`~verhub_sdk._unset.UNSET` 的字段，保留显式的 ``None``。

    :param source: 原始字段表
    :return: 过滤后的字段表
    """
    return {key: value for key, value in source.items() if not isinstance(value, UnsetType)}


def _normalize_base_url(base_url: str) -> str:
    """
    去掉首尾空白与末尾斜杠；不含 ``/api/v`` 时 ``warnings.warn`` 一次，不抛错。

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


def _to_httpx_timeout(timeout: Timeout) -> httpx.Timeout:
    """
    把 SDK 的超时写法翻译成 ``httpx.Timeout``。

    ``(connect, read)`` 元组里的读超时同时用于 write 与连接池等待。

    :param timeout: 单值、``(connect, read)`` 元组、``httpx.Timeout`` 或 ``None``
    :return: httpx 超时配置
    """
    if isinstance(timeout, httpx.Timeout):
        return timeout
    if isinstance(timeout, tuple):
        connect, read = timeout
        return httpx.Timeout(read, connect=connect)
    return httpx.Timeout(timeout)


def _describe(exc: BaseException) -> str:
    """
    :param exc: 底层异常
    :return: 可读的错误描述；``str()`` 为空串时退回类名
    """
    return str(exc) or exc.__class__.__name__


class _Prepared(NamedTuple):
    """一次请求在离开 SDK 前算好的全部素材，同步与异步两条路径共用。"""

    method: str
    url: str
    headers: Dict[str, str]
    content: Optional[bytes]


class BaseHttpClient:
    """
    底层 HTTP 客户端的公共部分：凭据、来源声明、URL 拼装、响应解析与重试判定。

    这一层不碰传输，真正发请求的是 :class:`SyncHttpClient` 与
    :class:`AsyncHttpClient`。两者的 ``request`` 同名同签名，业务层
    （``PublicApi`` / ``AdminApi``）因此只需写一份方法体。
    """

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
        user_agent: Optional[str] = None,
        app_identifier: Optional[str] = None,
        analytics: Optional[Mapping[str, Any]] = None,
    ) -> None:
        """
        :param base_url: API 根地址，须包含 ``/api/v1`` 前缀
        :param project_key: 绑定的项目标识；项目作用域的方法默认用它
        :param token: 管理员 JWT 或 API Key，仅 admin 接口需要
        :param platform: 平台声明；省略则自动探测，传 ``None`` 则不声明。指定它
            不影响系统版本明细，后者仍会自动探测
        :param platform_version: 系统版本明细；省略则自动探测（平台被显式关成
            ``None`` 时除外），传 ``None`` 则不声明
        :param timeout: 单次请求超时（秒）
        :param retries: GET / HEAD 在连接失败与 502/503/504 时的自动重试次数
        :param user_agent: 覆盖默认 User-Agent
        :param app_identifier: 追加到默认 User-Agent 之后的应用标识
        :param analytics: 事件采集配置，见 :mod:`verhub_sdk._analytics`。省略即启用
            默认行为（设备级匿名标识 + 本地待发队列）；面向欧盟用户的接入方应当
            设置 ``require_consent=True``
        """
        self.base_url = _normalize_base_url(base_url)
        self.project_key = project_key
        self.token = token or ""
        self.timeout = _to_httpx_timeout(timeout)
        self.retries = max(0, retries)

        if user_agent:
            self.user_agent = user_agent
        else:
            self.user_agent = f"verhub-sdk-python/{VERHUB_SDK_VERSION}"
            if app_identifier:
                self.user_agent = f"{self.user_agent} {app_identifier.strip()}"

        self.platform = _header_safe(
            detect_platform() if isinstance(platform, UnsetType) else platform
        )

        if isinstance(platform_version, UnsetType):
            self.platform_version = detect_platform_version() if self.platform else None
        else:
            self.platform_version = platform_version
        self.platform_version = _header_safe(self.platform_version)

        self.analytics_options = dict(analytics or {})
        self._analytics: Any = None

    def _analytics_namespace(self) -> str:
        """本地状态的命名空间。显式配置优先，否则由实例地址与项目算出。"""
        explicit = self.analytics_options.get("namespace")
        if explicit:
            return str(explicit)
        return analytics_namespace(self.base_url, self.project_key)

    @property
    def analytics(self) -> Any:
        """
        事件队列，首次访问时才建，命名空间变化时丢弃重建。

        旧命名空间攒下的事件留在它自己的文件里，下次绑定回去时补发。
        """
        namespace = self._analytics_namespace()
        if self._analytics is not None and self._analytics.namespace != namespace:
            logger.debug("verhub: 绑定项目已变，按新命名空间重建事件队列")
            self._analytics = None
        if self._analytics is None:
            self._analytics = self._create_analytics(namespace)
        return self._analytics

    def _queue_options(self) -> Dict[str, Any]:
        """队列构造参数。``namespace`` 是命名空间的来源而不是队列的字段，要摘出去。"""
        return {k: v for k, v in self.analytics_options.items() if k != "namespace"}

    def _create_analytics(self, namespace: str) -> Any:
        """由子类给出同步或异步的队列实现。"""
        raise NotImplementedError

    def _send_events(self, payload: Mapping[str, Any]) -> Any:
        """队列的发送函数。同步下直接返回结果，异步下返回协程。"""
        return self.request(
            "POST",
            "/public/{projectKey}/events",
            path_params={"projectKey": self.require_project_key()},
            body=payload,
        )

    def set_token(self, token: str) -> None:
        """
        :param token: 管理员 JWT 或 API Key
        """
        self.token = token

    def clear_token(self) -> None:
        """清除当前凭据，之后调用 admin 接口会抛 :class:`VerhubAuthError`。"""
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
        发起一次请求。由子类实现：同步版直接返回结果，异步版返回待 ``await`` 的协程。

        :param method: HTTP 方法
        :param path_template: 形如 ``/public/{projectKey}`` 的路径模板
        :param path_params: 路径参数，值会被 URL 编码
        :param query: 查询参数，值为 ``None`` 或 UNSET 的项会被丢弃
        :param body: JSON 请求体
        :param auth: 是否附带 Bearer 凭据
        :return: 已解析的响应体
        """
        raise NotImplementedError

    # ---- 请求前后的纯逻辑，两条路径共用 ----

    def _prepare(
        self,
        method: str,
        path_template: str,
        path_params: Optional[Mapping[str, str]],
        query: Optional[Mapping[str, Any]],
        body: Optional[Mapping[str, Any]],
        auth: bool,
    ) -> _Prepared:
        """
        :return: 算好的 URL、请求头与请求体
        :raises VerhubAuthError: 需要凭据却没有
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
                raise VerhubAuthError("缺少凭据：请先设置 token")
            headers["Authorization"] = f"Bearer {self.token}"

        content = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            content = json.dumps(body, ensure_ascii=False).encode("utf-8")

        return _Prepared(method.upper(), url, headers, content)

    def _retry_delay(
        self,
        method: str,
        attempt: int,
        *,
        exc: Optional[BaseException] = None,
        status: Optional[int] = None,
    ) -> Optional[float]:
        """
        判定这次失败要不要重试，要的话等多久。

        只对 :data:`RETRY_METHODS` 里的方法重试，且失败必须是连接建立失败或
        :data:`RETRY_STATUS` 里的状态码。读超时不重试。

        :param method: HTTP 方法（已大写）
        :param attempt: 已经重试过的次数，从 0 开始
        :param exc: 传输层异常
        :param status: 响应状态码
        :return: 重试前的等待秒数；``None`` 表示不再重试
        """
        if attempt >= self.retries or method not in RETRY_METHODS:
            return None

        if exc is not None:
            if not isinstance(exc, (httpx.ConnectError, httpx.ConnectTimeout)):
                return None
        elif status not in RETRY_STATUS:
            return None

        # 首次重试立刻重来，之后指数退避。
        return BACKOFF_FACTOR * (2**attempt) if attempt else 0.0

    def _connection_error(self, prepared: _Prepared, exc: BaseException) -> VerhubConnectionError:
        """
        :return: 包装好的连接异常
        """
        logger.debug("verhub 请求 %s %s 失败：%s", prepared.method, prepared.url, exc)
        return VerhubConnectionError(
            f"请求 {prepared.method} {prepared.url} 失败：{_describe(exc)}", exc
        )

    def _handle(self, prepared: _Prepared, response: httpx.Response) -> Any:
        """
        :return: 已解析的响应体
        :raises VerhubApiError: 服务端返回 4xx / 5xx
        """
        logger.debug("verhub 响应 %s %s -> %s", prepared.method, prepared.url, response.status_code)
        data = self._parse_json(response.text)
        if response.status_code >= 400:
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


class SyncHttpClient(BaseHttpClient):
    """同步实现，底层是 ``httpx.Client``（本身线程安全，可多线程共用）。"""

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
        http_client: Optional[httpx.Client] = None,
        user_agent: Optional[str] = None,
        app_identifier: Optional[str] = None,
        analytics: Optional[Mapping[str, Any]] = None,
    ) -> None:
        """
        :param http_client: 自定义 ``httpx.Client``，可用于配置代理、证书、连接池上限。
            传入后由调用方负责关闭，SDK 的 ``close()`` 不动它
        """
        super().__init__(
            base_url,
            project_key,
            token,
            platform=platform,
            platform_version=platform_version,
            timeout=timeout,
            retries=retries,
            user_agent=user_agent,
            app_identifier=app_identifier,
            analytics=analytics,
        )
        self.owns_client = http_client is None
        self.client = http_client or httpx.Client(timeout=self.timeout)

    def _create_analytics(self, namespace: str) -> EventQueue:
        return EventQueue(namespace, self._send_events, **self._queue_options())

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
        :return: 已解析的响应体
        :raises VerhubApiError: 服务端返回非 2xx
        :raises VerhubConnectionError: 请求未能到达服务端
        """
        prepared = self._prepare(method, path_template, path_params, query, body, auth)

        attempt = 0
        while True:
            logger.debug("verhub 请求 %s %s", prepared.method, prepared.url)
            try:
                response = self.client.request(
                    prepared.method,
                    prepared.url,
                    headers=prepared.headers,
                    content=prepared.content,
                    timeout=self.timeout,
                    follow_redirects=True,
                )
            except httpx.HTTPError as exc:
                delay = self._retry_delay(prepared.method, attempt, exc=exc)
                if delay is None:
                    raise self._connection_error(prepared, exc) from exc
                time.sleep(delay)
                attempt += 1
                continue

            delay = self._retry_delay(prepared.method, attempt, status=response.status_code)
            if delay is None:
                return self._handle(prepared, response)

            time.sleep(delay)
            attempt += 1

    def close(self) -> None:
        """关闭 SDK 自建的连接池；调用方自带的 ``httpx.Client`` 不动。"""
        if self.owns_client:
            self.client.close()


class AsyncHttpClient(BaseHttpClient):
    """异步实现，底层是 ``httpx.AsyncClient``，真正的非阻塞 I/O。"""

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
        http_client: Optional[httpx.AsyncClient] = None,
        user_agent: Optional[str] = None,
        app_identifier: Optional[str] = None,
        analytics: Optional[Mapping[str, Any]] = None,
    ) -> None:
        """
        :param http_client: 自定义 ``httpx.AsyncClient``；传入后由调用方负责关闭
        """
        super().__init__(
            base_url,
            project_key,
            token,
            platform=platform,
            platform_version=platform_version,
            timeout=timeout,
            retries=retries,
            user_agent=user_agent,
            app_identifier=app_identifier,
            analytics=analytics,
        )
        self.owns_client = http_client is None
        self.client = http_client or httpx.AsyncClient(timeout=self.timeout)

    def _create_analytics(self, namespace: str) -> AsyncEventQueue:
        return AsyncEventQueue(namespace, self._send_events, **self._queue_options())

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
        备好请求并返回一个待 ``await`` 的协程。

        本地校验（缺 token 等）在调用当下抛出，与同步版的时机一致。

        :return: 协程，await 后得到已解析的响应体
        :raises VerhubAuthError: 需要凭据却没有
        """
        return self._send(self._prepare(method, path_template, path_params, query, body, auth))

    async def _send(self, prepared: _Prepared) -> Any:
        """
        :param prepared: 已备好的请求
        :return: 已解析的响应体
        :raises VerhubApiError: 服务端返回非 2xx
        :raises VerhubConnectionError: 请求未能到达服务端
        """
        attempt = 0
        while True:
            logger.debug("verhub 请求 %s %s", prepared.method, prepared.url)
            try:
                response = await self.client.request(
                    prepared.method,
                    prepared.url,
                    headers=prepared.headers,
                    content=prepared.content,
                    timeout=self.timeout,
                    follow_redirects=True,
                )
            except httpx.HTTPError as exc:
                delay = self._retry_delay(prepared.method, attempt, exc=exc)
                if delay is None:
                    raise self._connection_error(prepared, exc) from exc
                await asyncio.sleep(delay)
                attempt += 1
                continue

            delay = self._retry_delay(prepared.method, attempt, status=response.status_code)
            if delay is None:
                return self._handle(prepared, response)

            await asyncio.sleep(delay)
            attempt += 1

    async def aclose(self) -> None:
        """关闭 SDK 自建的连接池；调用方自带的 ``httpx.AsyncClient`` 不动。"""
        if self.owns_client:
            await self.client.aclose()
