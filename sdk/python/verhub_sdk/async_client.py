"""
异步客户端。

实现方式是「线程壳套同步」：内部持有一个同步 :class:`VerhubClient`，每个接口
调用都用 :func:`asyncio.to_thread` 丢到线程池里跑，从而不阻塞事件循环。这样
同步版的每个方法（``public`` / ``admin`` 全部 55 个）都自动获得一个可 ``await``
的孪生版，无需逐个手写。

适用面：客户端 App 这类低并发场景（如「别卡住 GUI 主线程」）。它不是真正的
非阻塞 I/O——每个在途调用占一个线程池线程，因此**不适合高并发服务端**；那种
场景请另选原生 async HTTP 库。

>>> async def main():
...     async with AsyncVerhubClient("https://verhub.example.com/api/v1", "verhub") as client:
...         latest = await client.public.get_latest_version()
"""

from __future__ import annotations

import asyncio
import functools
from typing import Any, Optional

import requests

from ._http import DEFAULT_RETRIES, VERHUB_SDK_VERSION, Timeout
from ._unset import UNSET
from .client import VerhubClient
from .models import HealthResponse


class _AsyncNamespace:
    """把同步命名空间（``public`` / ``admin``）里的方法包成协程。

    属性若不是可调用对象就原样透出；是方法则返回一个把它丢进
    :func:`asyncio.to_thread` 执行的协程函数，签名与文档串靠 ``functools.wraps``
    保留，方便 IDE 内省。
    """

    def __init__(self, target: Any) -> None:
        """
        :param target: 被代理的同步命名空间实例
        """
        self._target = target

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._target, name)
        if not callable(attr):
            return attr

        @functools.wraps(attr)
        async def _runner(*args: Any, **kwargs: Any) -> Any:
            return await asyncio.to_thread(attr, *args, **kwargs)

        return _runner


class AsyncVerhubClient:
    """
    Verhub SDK 的异步入口，接口面与 :class:`VerhubClient` 完全一致，只是
    ``public`` / ``admin`` 上的方法都要 ``await``。

    底层是线程壳（见模块文档）：同步客户端非线程安全的可变状态（token / project_key
    等）只在你显式调用 setter 时改动，接口调用本身不改，因此并发 ``await`` 共用
    一份连接池是安全的。但请避免在有在途请求时并发调用 setter。
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
        session: Optional[requests.Session] = None,
        user_agent: Optional[str] = None,
        app_identifier: Optional[str] = None,
    ) -> None:
        """参数含义与 :class:`VerhubClient` 一致。"""
        self._sync = VerhubClient(
            base_url,
            project_key,
            token,
            platform=platform,
            platform_version=platform_version,
            timeout=timeout,
            retries=retries,
            session=session,
            user_agent=user_agent,
            app_identifier=app_identifier,
        )
        #: 公开接口，方法均为协程。
        self.public = _AsyncNamespace(self._sync.public)
        #: 管理接口，方法均为协程。
        self.admin = _AsyncNamespace(self._sync.admin)

    @property
    def project_key(self) -> Optional[str]:
        """当前绑定的项目标识。"""
        return self._sync.project_key

    def set_project_key(self, project_key: str) -> None:
        """
        :param project_key: 新的绑定项目标识
        """
        self._sync.set_project_key(project_key)

    def set_token(self, token: str) -> None:
        """
        :param token: 管理员 JWT 或 API Key
        """
        self._sync.set_token(token)

    def clear_token(self) -> None:
        """清除当前凭据，之后调用 admin 接口会直接抛错。"""
        self._sync.clear_token()

    def set_platform(self, platform: Optional[str]) -> None:
        """
        :param platform: 平台声明；传 ``None`` 则不再声明平台
        """
        self._sync.set_platform(platform)

    def set_platform_version(self, platform_version: Optional[str]) -> None:
        """
        :param platform_version: 系统版本明细；传 ``None`` 则不再声明
        """
        self._sync.set_platform_version(platform_version)

    async def health(self) -> HealthResponse:
        """
        :return: 服务健康状态
        """
        return await asyncio.to_thread(self._sync.health)

    async def aclose(self) -> None:
        """关闭底层连接池。"""
        await asyncio.to_thread(self._sync.close)

    async def __aenter__(self) -> "AsyncVerhubClient":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.aclose()
