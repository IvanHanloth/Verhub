from __future__ import annotations

import threading
from typing import Any, Optional

import httpx

from ._http import DEFAULT_RETRIES, VERHUB_SDK_VERSION, SyncHttpClient, Timeout
from ._unset import UNSET
from ._worker import DEFAULT_MAX_WORKERS, BackgroundWorker
from .admin_api import AdminApi
from .models import HealthResponse
from .public_api import PublicApi


class VerhubClient:
    """
    Verhub SDK 入口（同步）。

    客户端绑定一个项目：构造时传入 ``project_key`` 后，项目作用域的方法都用它，
    不必再逐次传项目参数。两个命名空间共用一份连接、凭据与来源声明：
    ``client.public`` 不需要凭据，``client.admin`` 需要管理员 JWT 或 API Key。

    >>> client = VerhubClient("https://verhub.example.com/api/v1", "verhub")
    >>> latest = client.public.get_latest_version()

    在 asyncio 里跑请用 :class:`~verhub_sdk.async_client.AsyncVerhubClient`；在
    PySide6 这类没有 asyncio 事件循环的 GUI 里，用本类的 :attr:`background`
    把调用挪到后台线程，见 :class:`~verhub_sdk._worker.BackgroundWorker`。
    """

    version = VERHUB_SDK_VERSION

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
        background_workers: int = DEFAULT_MAX_WORKERS,
    ) -> None:
        """
        :param base_url: API 根地址，须包含 ``/api/v1``，如
            ``https://verhub.example.com/api/v1``
        :param project_key: 绑定的项目标识；项目作用域的方法默认用它，事后可用
            ``set_project_key`` 更换
        :param token: 管理员 JWT 或 API Key；只调 public 接口时不用给
        :param platform: 平台声明；省略则按运行环境自动探测，传 ``None`` 则不声明。
            仅用于服务端请求统计，不影响接口返回内容
        :param platform_version: 系统版本明细，如 ``11`` / ``ubuntu 24.04``；省略则
            从系统信息自动提取（``platform`` 被显式关成 ``None`` 时除外），传
            ``None`` 则不声明
        :param timeout: 单次请求超时（秒）；传 ``(connect, read)`` 元组可分别指定
            连接与读取超时，也可直接传 ``httpx.Timeout``，传 ``None`` 则不限时
        :param retries: 连接失败与幂等请求的自动重试次数，默认 2；POST 不自动重试，
            传 0 关闭
        :param http_client: 自定义 ``httpx.Client``，可用于配置代理、自定义证书、
            连接池上限；传入后由调用方负责关闭，``close()`` 不动它
        :param user_agent: 覆盖默认 User-Agent，会连带丢掉 SDK 版本信息
        :param app_identifier: 追加到默认 User-Agent 之后的应用标识（如
            ``MyApp/1.2``），保留 SDK 版本又便于服务端统计
        :param background_workers: :attr:`background` 线程池的大小；用不到后台调用
            时不会创建任何线程
        """
        self._http = SyncHttpClient(
            base_url=base_url,
            project_key=project_key,
            token=token,
            platform=platform,
            platform_version=platform_version,
            timeout=timeout,
            retries=retries,
            http_client=http_client,
            user_agent=user_agent,
            app_identifier=app_identifier,
        )
        self.public = PublicApi(self._http)
        self.admin = AdminApi(self._http)

        self._background_workers = background_workers
        self._background: Optional[BackgroundWorker] = None
        self._background_lock = threading.Lock()

    @property
    def project_key(self) -> Optional[str]:
        """当前绑定的项目标识。"""
        return self._http.project_key

    @property
    def background(self) -> BackgroundWorker:
        """
        后台线程池 + 回调调度器，给 PySide6 这类没有 asyncio 的 GUI 用。

        第一次访问时才创建线程池，用不到就不会多出线程。典型用法（SDK 不 import Qt）：

        >>> timer.timeout.connect(client.background.drain)   # 每 50ms 排空回调
        >>> timer.start(50)
        >>> client.background.submit(
        ...     client.public.check_update,
        ...     current_version="1.1.0",
        ...     on_success=self.show_update,                 # 在主线程执行
        ... )
        """
        if self._background is None:
            with self._background_lock:
                if self._background is None:
                    self._background = BackgroundWorker(max_workers=self._background_workers)
        return self._background

    def set_project_key(self, project_key: str) -> None:
        """
        :param project_key: 新的绑定项目标识
        """
        self._http.set_project_key(project_key)

    def set_token(self, token: str) -> None:
        """
        :param token: 管理员 JWT 或 API Key
        """
        self._http.set_token(token)

    def clear_token(self) -> None:
        """清除当前凭据，之后调用 admin 接口会直接抛错。"""
        self._http.clear_token()

    def set_platform(self, platform: Optional[str]) -> None:
        """
        :param platform: 平台声明；传 ``None`` 则不再声明平台
        """
        self._http.set_platform(platform)

    def set_platform_version(self, platform_version: Optional[str]) -> None:
        """
        :param platform_version: 系统版本明细；传 ``None`` 则不再声明
        """
        self._http.set_platform_version(platform_version)

    def health(self) -> HealthResponse:
        """
        :return: 服务健康状态
        """
        return self._http.request("GET", "/health")

    def close(self) -> None:
        """
        关闭连接池与后台线程池，等在途请求收尾。

        自定义 ``http_client`` 由调用方自己关。
        """
        if self._background is not None:
            self._background.close()
        self._http.close()

    def __enter__(self) -> "VerhubClient":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()


#: 兼容早期版本的旧名字。
VerhubSDK = VerhubClient
