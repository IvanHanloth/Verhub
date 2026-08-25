"""
Verhub Python SDK。

接口面与 TypeScript / Rust / 纯 JS 版一一对应，方法名按各语言习惯改写（Python
用 snake_case）。契约以仓库根目录的 ``verhub.openapi.yaml`` 为准。
"""

from ._analytics import (
    analytics_namespace,
    AsyncEventQueue,
    EventQueue,
    FileStorage,
    fnv1a32_hex,
    MemoryStorage,
    NullStorage,
    origin_of,
    random_id,
)
from ._http import (
    PLATFORM_HEADER,
    PLATFORM_VERSION_HEADER,
    VERHUB_SDK_VERSION,
    detect_platform,
    detect_platform_version,
)
from ._unset import UNSET, UnsetType
from ._worker import BackgroundWorker
from .admin_api import AdminApi
from .async_client import AsyncVerhubClient
from .client import VerhubClient, VerhubSDK
from .errors import (
    VerhubApiError,
    VerhubAuthError,
    VerhubConnectionError,
    VerhubError,
)
from .models import (
    LOG_LEVEL_DEBUG,
    LOG_LEVEL_ERROR,
    LOG_LEVEL_INFO,
    LOG_LEVEL_WARNING,
    PLATFORMS,
)
from .public_api import PublicApi

__version__ = VERHUB_SDK_VERSION

__all__ = [
    "VerhubClient",
    "AsyncVerhubClient",
    "VerhubSDK",
    "PublicApi",
    "AdminApi",
    "BackgroundWorker",
    "EventQueue",
    "AsyncEventQueue",
    "MemoryStorage",
    "NullStorage",
    "FileStorage",
    "random_id",
    "analytics_namespace",
    "origin_of",
    "fnv1a32_hex",
    "VerhubError",
    "VerhubApiError",
    "VerhubAuthError",
    "VerhubConnectionError",
    "UNSET",
    "UnsetType",
    "PLATFORMS",
    "PLATFORM_HEADER",
    "PLATFORM_VERSION_HEADER",
    "LOG_LEVEL_DEBUG",
    "LOG_LEVEL_INFO",
    "LOG_LEVEL_WARNING",
    "LOG_LEVEL_ERROR",
    "detect_platform",
    "detect_platform_version",
    "VERHUB_SDK_VERSION",
    "__version__",
]
