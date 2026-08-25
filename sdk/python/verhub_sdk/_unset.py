from __future__ import annotations

from typing import Any, Final


class UnsetType:
    """
    「未提供」哨兵，与显式 ``None`` 区分开。

    可选字段省略时表示保持原值，显式传 ``None`` 表示把该字段置空（服务端收到
    JSON null）。:func:`~verhub_sdk._http.compact` 会丢掉值为 ``UNSET`` 的字段。
    """

    _instance: "UnsetType | None" = None

    def __new__(cls) -> "UnsetType":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __bool__(self) -> bool:
        return False

    def __repr__(self) -> str:
        return "UNSET"


UNSET: Final[Any] = UnsetType()
