from __future__ import annotations

from typing import Any, Optional

import requests

from ._http import VERHUB_SDK_VERSION, HttpClient
from ._unset import UNSET
from .admin_api import AdminApi
from .models import HealthResponse
from .public_api import PublicApi


class VerhubClient:
    """
    Verhub SDK 入口。

    客户端绑定一个项目：构造时传入 ``project_key`` 后，项目作用域的方法都用它，
    不必再逐次传项目参数。两个命名空间共用一份连接、凭据与来源声明：
    ``client.public`` 不需要凭据，``client.admin`` 需要管理员 JWT 或 API Key。

    >>> client = VerhubClient("https://verhub.example.com/api/v1", "verhub")
    >>> latest = client.public.get_latest_version()
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
        timeout: float = 15.0,
        session: Optional[requests.Session] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """
        :param base_url: API 根地址，须包含 ``/api/v1``，如
            ``https://verhub.example.com/api/v1``
        :param project_key: 绑定的项目标识；项目作用域的方法默认用它，事后可用
            ``set_project_key`` 更换
        :param token: 管理员 JWT 或 API Key；只调 public 接口时不用给
        :param platform: 平台声明；省略则按运行环境自动探测，传 ``None`` 则不声明。
            仅用于服务端请求统计，不影响接口返回内容
        :param platform_version: 系统版本明细，如 ``11`` / ``ubuntu 24.04``；省略时
            若平台也是自动探测，则一并从系统信息自动提取，传 ``None`` 则不声明
        :param timeout: 单次请求超时（秒）
        :param session: 自定义 ``requests.Session``，可用于配置代理、重试、证书
        :param user_agent: 覆盖默认 User-Agent
        """
        self._http = HttpClient(
            base_url=base_url,
            project_key=project_key,
            token=token,
            platform=platform,
            platform_version=platform_version,
            timeout=timeout,
            session=session,
            user_agent=user_agent,
        )
        self.public = PublicApi(self._http)
        self.admin = AdminApi(self._http)

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

    def health(self) -> HealthResponse:
        """
        :return: 服务健康状态
        """
        return self._http.request("GET", "/health")

    def close(self) -> None:
        """关闭底层连接池。"""
        self._http.session.close()

    def __enter__(self) -> "VerhubClient":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()


#: 兼容早期版本的旧名字。
VerhubSDK = VerhubClient
