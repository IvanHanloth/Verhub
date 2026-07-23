from __future__ import annotations

from typing import Any


class VerhubError(Exception):
    """所有 SDK 异常的基类，便于调用方一次性捕获。"""


class VerhubAuthError(VerhubError):
    """本地前置校验失败：调用 admin 接口但没有设置凭据，请求根本没发出去。

    与 :class:`VerhubApiError` 区分开——后者是「请求发出去了、服务端拒了」，
    这个是「你忘了设 token」。故意不继承 ``VerhubApiError``，避免调用方用
    ``except VerhubApiError`` 把两种情况混为一谈。
    """


class VerhubApiError(VerhubError):
    """服务端返回了非 2xx 响应。"""

    def __init__(self, message: str, status: int, body: Any = None) -> None:
        """
        :param message: 错误信息，优先取响应体的 message 字段
        :param status: HTTP 状态码
        :param body: 已解析的响应体，解析失败时为原始文本
        """
        super().__init__(message)
        self.message = message
        self.status = status
        self.body = body

    def __str__(self) -> str:
        return f"[{self.status}] {self.message}"


class VerhubConnectionError(VerhubError):
    """请求没能到达服务端（超时、DNS、连接被拒等）。"""

    def __init__(self, message: str, cause: BaseException | None = None) -> None:
        """
        :param message: 错误信息
        :param cause: 底层异常
        """
        super().__init__(message)
        self.message = message
        self.cause = cause
