from __future__ import annotations

from typing import Any, Final


class UnsetType:
    """
    「未提供」哨兵。

    可选字段的默认值必须与显式 ``None`` 区分开：省略字段表示保持原值，
    显式传 ``None`` 表示把该字段置空（服务端收到 JSON null）。若直接用
    ``None`` 作默认值，这两种意图就没法表达了。
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
