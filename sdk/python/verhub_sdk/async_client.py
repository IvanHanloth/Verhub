"""
异步客户端。

底层是原生 ``httpx.AsyncClient``，真正的非阻塞 I/O——不再是早期版本那种「线程壳
套同步」，因此高并发场景也能用，在途请求不占线程。

接口面与同步版共用同一份实现：``PublicApi`` / ``AdminApi`` 的方法体只写一遍，
把请求转交给底层客户端，绑到异步客户端上时返回的就是协程。

>>> async def main():
...     async with AsyncVerhubClient("https://verhub.example.com/api/v1", "verhub") as client:
...         latest = await client.public.get_latest_version()

没有 asyncio 事件循环的 GUI（PySide6 等）不要用这个类，用同步
:class:`~verhub_sdk.client.VerhubClient` 的 ``background``。
"""

from __future__ import annotations

from typing import Any, Optional

import httpx

from ._http import DEFAULT_RETRIES, VERHUB_SDK_VERSION, AsyncHttpClient, Timeout
from ._unset import UNSET
from .admin_api import AdminApi
from .models import HealthResponse
from .public_api import PublicApi


class AsyncVerhubClient:
    """
    Verhub SDK 的异步入口，接口面与 :class:`~verhub_sdk.client.VerhubClient` 完全
    一致，只是 ``public`` / ``admin`` 上的方法都要 ``await``。

    .. note::
       本地前置校验（未绑定 ``project_key``、转发反馈却没填联系方式等）在**调用
       当下**就抛，不等到 ``await``——协程还没创建出来，异常先到。用
       ``try`` 包住整个 ``await client.public.xxx(...)`` 表达式即可，两种时机都能兜住。

    .. note::
       ``public`` / ``admin`` 的静态类型是 ``Any``：方法体与同步版共用一份，返回值
       标注按同步签名写（``VersionItem`` 这类 ``TypedDict``），异步下实际返回协程。
       标成 ``Any`` 是为了让 ``await client.public.xxx()`` 不被类型检查器判成「await
       了一个 dict」，代价是异步侧没有返回结构的补全——需要时用
       ``cast(VersionItem, await ...)``。
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
        http_client: Optional[httpx.AsyncClient] = None,
        user_agent: Optional[str] = None,
        app_identifier: Optional[str] = None,
    ) -> None:
        """参数含义与 :class:`~verhub_sdk.client.VerhubClient` 一致，只是
        ``http_client`` 收的是 ``httpx.AsyncClient``。"""
        self._http = AsyncHttpClient(
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
        #: 公开接口，方法均返回协程。
        self.public: Any = PublicApi(self._http)
        #: 管理接口，方法均返回协程。
        self.admin: Any = AdminApi(self._http)

    @property
    def project_key(self) -> Optional[str]:
        """当前绑定的项目标识。"""
        return self._http.project_key

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

    async def health(self) -> HealthResponse:
        """
        :return: 服务健康状态
        """
        return await self._http.request("GET", "/health")

    async def aclose(self) -> None:
        """关闭连接池；自定义 ``http_client`` 由调用方自己关。"""
        await self._http.aclose()

    async def __aenter__(self) -> "AsyncVerhubClient":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.aclose()
