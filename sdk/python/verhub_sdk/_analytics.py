"""
事件采集的本地状态：匿名标识、退出标记与待发送队列。

这是整个 SDK 里唯一会在设备上写入数据的部分；改动这里要同步更新
《SDK 合规性文档》。

同步与异步客户端各自持有一个队列实例：发送函数不同，其余逻辑走同一个基类。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Protocol

logger = logging.getLogger("verhub_sdk")

#: 攒批的时间上限（秒）。
DEFAULT_FLUSH_INTERVAL = 5.0

#: 攒够这么多条立即发送。
DEFAULT_BATCH_SIZE = 20

#: 队列上限，超出丢最旧的。
DEFAULT_MAX_QUEUE_SIZE = 500

#: 会话空闲多久换新（秒）。
DEFAULT_SESSION_TIMEOUT = 30 * 60.0

#: 服务端单批上限，与 VERHUB_EVENT_BATCH_MAX 的默认值一致。
SERVER_BATCH_MAX = 50

#: 重试退避的上限（秒）。
MAX_BACKOFF = 60.0


class AnalyticsStorage(Protocol):
    """本地存储抽象。默认走用户状态目录里的一个 JSON 文件。"""

    def read(self, key: str) -> Optional[str]:
        """读一个键；不存在时返回 ``None``。"""
        ...

    def write(self, key: str, value: str) -> None:
        """写一个键，覆盖同名旧值。"""
        ...

    def remove(self, key: str) -> None:
        """删一个键；不存在时静默返回。"""
        ...


class MemoryStorage:
    """进程内存储，``persistence="session"`` 用，也是拿不到可写目录时的回退。"""

    def __init__(self) -> None:
        self._data: Dict[str, str] = {}

    def read(self, key: str) -> Optional[str]:
        """读一个键；不存在时返回 ``None``。"""
        return self._data.get(key)

    def write(self, key: str, value: str) -> None:
        """写一个键，覆盖同名旧值。"""
        self._data[key] = value

    def remove(self, key: str) -> None:
        """删一个键；不存在时静默返回。"""
        self._data.pop(key, None)


class NullStorage:
    """什么都不存的实现，``persistence="none"`` 用。"""

    def read(self, key: str) -> Optional[str]:
        """恒返回 ``None``。"""
        return None

    def write(self, key: str, value: str) -> None:
        """空操作。"""
        return None

    def remove(self, key: str) -> None:
        """空操作。"""
        return None


def origin_of(base_url: str) -> str:
    """
    取 base_url 的 origin（协议 + 主机 + 端口），路径一律忽略。

    主机名与协议转小写，剥掉 userinfo，``http`` 的 80 与 ``https`` 的 443 会被
    省略。不含 ``://`` 的输入原样转小写返回。四个语言的 SDK 规则相同。

    :param base_url: 已规范化（去首尾空白、去末尾斜杠）的根地址
    :return: origin
    """
    trimmed = base_url.strip()
    scheme_end = trimmed.find("://")
    if scheme_end < 0:
        return trimmed.lower()

    scheme = trimmed[:scheme_end].lower()
    rest = trimmed[scheme_end + 3 :]
    slash = rest.find("/")
    authority = (rest if slash < 0 else rest[:slash]).lower()

    at = authority.rfind("@")
    if at >= 0:
        authority = authority[at + 1 :]

    # IPv6 的冒号在方括号里，端口只可能在 `]` 之后。
    host_end = authority.rfind("]")
    colon = authority.find(":", 0 if host_end < 0 else host_end)
    if colon >= 0:
        port = authority[colon + 1 :]
        if (scheme == "http" and port == "80") or (scheme == "https" and port == "443"):
            authority = authority[:colon]

    return f"{scheme}://{authority}"


def fnv1a32_hex(value: str) -> str:
    """
    FNV-1a 32 位，按 UTF-8 字节计算，输出 8 位小写 hex。

    四个语言的 SDK 对同一输入给出同一结果。

    :param value: 输入串
    :return: 8 位小写 hex
    """
    h = 0x811C9DC5
    for byte in value.encode("utf-8"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return format(h, "08x")


def analytics_namespace(base_url: str, project_key: Optional[str]) -> str:
    """
    本地状态的命名空间：``<origin 哈希>-<小写 project_key>``。

    ``project_key`` 去首尾空白后转小写；为空或只有空白时用 ``default``。
    四个语言的 SDK 对同一组入参给出同一结果。

    :param base_url: 规范化后的根地址
    :param project_key: 绑定的项目标识
    :return: 命名空间
    """
    key = (project_key or "default").strip().lower() or "default"
    return f"{fnv1a32_hex(origin_of(base_url))}-{key}"


def _file_safe(namespace: str) -> str:
    """把命名空间洗成安全的文件名：非 ``[A-Za-z0-9._-]`` 换成下划线，截到 96 字符。"""
    return re.sub(r"[^A-Za-z0-9._-]", "_", namespace)[:96]


class FileStorage:
    """把状态写到用户状态目录的一个 JSON 文件里；目录不可写时退化成不持久化。"""

    def __init__(self, namespace: str, path: Optional[Path] = None) -> None:
        """
        :param namespace: 本地状态的命名空间
        :param path: 覆盖状态文件位置；省略则用各平台的常规用户状态目录
        """
        self._path = path or _default_state_path(namespace)
        self._lock = threading.Lock()

    def _read_all(self) -> Dict[str, str]:
        try:
            return json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def _write_all(self, data: Dict[str, str]) -> None:
        # 先写临时文件再 os.replace，写入过程中崩溃不会留下半个 JSON。
        tmp = self._path.with_suffix(f".{os.getpid()}.tmp")
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            tmp.write_text(json.dumps(data), encoding="utf-8")
            os.replace(tmp, self._path)
        except OSError:
            logger.debug("verhub: 事件采集状态写入失败，本次不持久化")
            try:
                tmp.unlink()
            except OSError:
                pass

    def read(self, key: str) -> Optional[str]:
        """读一个键；不存在时返回 ``None``。"""
        with self._lock:
            return self._read_all().get(key)

    def write(self, key: str, value: str) -> None:
        """写一个键，覆盖同名旧值。"""
        with self._lock:
            data = self._read_all()
            data[key] = value
            self._write_all(data)

    def remove(self, key: str) -> None:
        """删一个键；不存在时静默返回。"""
        with self._lock:
            data = self._read_all()
            data.pop(key, None)
            self._write_all(data)


def _default_state_path(namespace: str) -> Path:
    """各平台的常规用户状态目录，每个命名空间一个文件。"""
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local" / "state")
    return base / "verhub-sdk" / f"{_file_safe(namespace)}.json"


def random_id() -> str:
    """随机 UUIDv4。不读取任何设备特征。"""
    return str(uuid.uuid4())


def _make_storage(
    namespace: str, persistence: str, storage: Optional[AnalyticsStorage]
) -> AnalyticsStorage:
    if storage is not None:
        return storage
    if persistence == "device":
        return FileStorage(namespace)
    if persistence == "session":
        return MemoryStorage()
    return NullStorage()


class BaseEventQueue:
    """
    队列的共享逻辑：身份、会话、退出与同意、入队与裁剪、落盘与恢复。

    发送与定时由子类给出——同步版用后台线程，异步版用 asyncio 任务。
    """

    def __init__(
        self,
        namespace: str,
        *,
        enabled: bool = True,
        require_consent: bool = False,
        persistence: str = "device",
        flush_interval: float = DEFAULT_FLUSH_INTERVAL,
        batch_size: int = DEFAULT_BATCH_SIZE,
        max_queue_size: int = DEFAULT_MAX_QUEUE_SIZE,
        session_timeout: float = DEFAULT_SESSION_TIMEOUT,
        storage: Optional[AnalyticsStorage] = None,
    ) -> None:
        """
        :param namespace: 本地状态的命名空间，由 :func:`analytics_namespace` 算出
        :param enabled: 关掉后入队直接返回，不生成标识、不落盘、不发请求
        :param require_consent: 开启后在 :meth:`grant_consent` 前不采集、不写盘
        :param persistence: ``"device"`` / ``"session"`` / ``"none"``
        :param flush_interval: 攒批的时间上限（秒）
        :param batch_size: 攒够这么多条立即发送，上限 :data:`SERVER_BATCH_MAX`
        :param max_queue_size: 队列上限，超出丢最旧的
        :param session_timeout: 会话空闲多久换新（秒）
        :param storage: 自定义存储实现
        :raises ValueError: ``persistence`` 取值非法
        """
        if persistence not in ("device", "session", "none"):
            raise ValueError('persistence 必须是 "device" / "session" / "none" 之一')

        resolved = namespace

        self._enabled = enabled
        self._require_consent = require_consent
        self._persistence = persistence
        self._flush_interval = flush_interval
        self._batch_size = min(batch_size, SERVER_BATCH_MAX)
        self._max_queue_size = max_queue_size
        self._session_timeout = session_timeout
        self._storage = _make_storage(resolved, persistence, storage)

        #: 本地状态的命名空间。调用方据此判断绑定项目变化后要不要重建队列。
        self.namespace = resolved
        self._prefix = f"verhub.analytics.{resolved}."
        self._queue: List[Dict[str, Any]] = []
        self._distinct_id: Optional[str] = None
        self._session_id: Optional[str] = None
        self._last_event_at = 0.0
        self._failures = 0
        self._closed = False
        self._lock = threading.Lock()
        self._consented = not require_consent

        self._opted_out = self._storage.read(self._prefix + "opt_out") == "1"

        if self.active():
            self._restore_queue()

    # ---- 状态 ----

    def active(self) -> bool:
        """当前是否会采集。为 False 时不生成标识、不落盘、不发请求。"""
        return self._enabled and not self._opted_out and self._consented

    def has_opted_out(self) -> bool:
        """当前是否处于退出状态。"""
        return self._opted_out

    def opt_out(self) -> None:
        """停止采集、丢弃待发队列、删除本地匿名标识，并把退出标记写入本地。"""
        with self._lock:
            self._opted_out = True
            self._consented = not self._require_consent
            self._queue = []
            self._distinct_id = None
            self._session_id = None
        self._storage.remove(self._prefix + "distinct_id")
        self._storage.remove(self._prefix + "queue")
        self._storage.write(self._prefix + "opt_out", "1")

    def opt_in(self) -> None:
        """撤销退出，并生成一个新的匿名标识。"""
        with self._lock:
            self._opted_out = False
        self._storage.remove(self._prefix + "opt_out")
        self.reset_identity()

    def grant_consent(self) -> None:
        """``require_consent`` 模式下开闸。在此之前不会有任何字节写入设备。"""
        with self._lock:
            self._consented = True

    def revoke_consent(self) -> None:
        """撤回同意，等价于 :meth:`opt_out` 并回到未同意状态。"""
        self.opt_out()
        with self._lock:
            self._consented = False

    def reset_identity(self) -> None:
        """换一个新的匿名标识，切断与既往事件序列的关联。"""
        with self._lock:
            self._distinct_id = None
            self._session_id = None
        self._storage.remove(self._prefix + "distinct_id")

    def current_distinct_id(self) -> Optional[str]:
        """当前的匿名标识；未采集状态下返回 ``None``，且不会顺带生成一个。"""
        return self._identity() if self.active() else None

    # ---- 入队 ----

    def _enqueue(self, name: str, properties: Optional[Dict[str, Any]]) -> bool:
        """入队一条事件，返回是否已经攒够一批。未采集状态下返回 ``False``。"""
        if not self.active():
            return False

        event: Dict[str, Any] = {
            "event_id": random_id(),
            "name": name,
            "occurred_at": int(time.time()),
        }
        if properties:
            event["properties"] = properties

        with self._lock:
            self._queue.append(event)
            if len(self._queue) > self._max_queue_size:
                del self._queue[: len(self._queue) - self._max_queue_size]
            self._touch_session()
            full = len(self._queue) >= self._batch_size

        self._persist_queue()
        return full

    def _take_batch(self) -> Optional[Dict[str, Any]]:
        """取出下一批待发送的载荷；没有可发的返回 ``None``。"""
        distinct_id = self._identity() if self.active() else None
        if not distinct_id:
            return None

        with self._lock:
            if not self._queue:
                return None
            batch = self._queue[: self._batch_size]
            session_id = self._session_id

        payload: Dict[str, Any] = {"distinct_id": distinct_id, "events": batch}
        if session_id:
            payload["session_id"] = session_id
        return payload

    def _commit(self, sent: int) -> None:
        """一批发送成功后从队列里摘掉。"""
        with self._lock:
            del self._queue[:sent]
            self._failures = 0
        self._persist_queue()

    def _record_failure(self) -> float:
        """记一次失败并返回下次重试前应等待的秒数。"""
        with self._lock:
            self._failures += 1
            failures = self._failures
        return min(self._flush_interval * 2 ** (failures - 1), MAX_BACKOFF)

    def _pending(self) -> int:
        with self._lock:
            return len(self._queue)

    # ---- 内部 ----

    def _identity(self) -> str:
        """匿名标识。``persistence="none"`` 时每次返回一个不落盘的临时标识。"""
        with self._lock:
            if self._distinct_id:
                return self._distinct_id

        stored = self._storage.read(self._prefix + "distinct_id")
        if stored:
            with self._lock:
                self._distinct_id = stored
            return stored

        created = random_id()
        with self._lock:
            self._distinct_id = created
        self._storage.write(self._prefix + "distinct_id", created)
        return created

    def _touch_session(self) -> None:
        """空闲超过 session_timeout 就换一个会话号。会话号从不落盘。调用方持锁。"""
        now = time.monotonic()
        if not self._session_id or now - self._last_event_at > self._session_timeout:
            self._session_id = random_id()
        self._last_event_at = now

    def _persist_queue(self) -> None:
        if self._persistence != "device":
            return
        with self._lock:
            snapshot = json.dumps(self._queue)
        self._storage.write(self._prefix + "queue", snapshot)

    def _restore_queue(self) -> None:
        """启动时把上次没发出去的事件读回来。"""
        if self._persistence != "device":
            return
        raw = self._storage.read(self._prefix + "queue")
        if not raw:
            return
        try:
            parsed = json.loads(raw)
        except ValueError:
            self._storage.remove(self._prefix + "queue")
            return
        if isinstance(parsed, list) and parsed:
            with self._lock:
                self._queue = parsed[-self._max_queue_size :]


class EventQueue(BaseEventQueue):
    """
    同步版事件队列：攒批入队，满一批或到间隔时发送，失败按指数退避重试。

    每条事件带 ``event_id`` 幂等键，重发不会在服务端产生重复。定时发送由一个
    守护线程负责；退出前调 :meth:`close` 把最后一批发出去。
    """

    def __init__(
        self, namespace: str, send: Callable[[Dict[str, Any]], Any], **options: Any
    ) -> None:
        """
        :param namespace: 本地状态的命名空间，由 :func:`analytics_namespace` 算出
        :param send: 实际发送函数，接收一个载荷字典
        :param options: 其余采集配置，见 :class:`BaseEventQueue`
        """
        super().__init__(namespace, **options)
        self._send = send
        self._timer: Optional[threading.Timer] = None
        self._flush_lock = threading.Lock()

        if self.active() and self._pending():
            self._schedule(self._flush_interval)

    def track(self, name: str, properties: Optional[Dict[str, Any]] = None) -> None:
        """
        入队一条事件，立即返回，不发起网络请求。

        攒够 ``batch_size`` 条立即发送，否则排一个 ``flush_interval`` 秒后的定时发送。

        :param name: 事件名
        :param properties: 自定义属性
        """
        if self._enqueue(name, properties):
            self.flush()
        else:
            self._schedule(self._flush_interval)

    def flush(self) -> None:
        """
        立即发送队列里的所有事件。

        失败的那一批留在队列里，按指数退避重排；已在发送中时直接返回。
        """
        if not self._flush_lock.acquire(blocking=False):
            return
        try:
            self._cancel_timer()
            while True:
                payload = self._take_batch()
                if payload is None:
                    return
                try:
                    self._send(payload)
                except Exception as exc:  # noqa: BLE001 - 采集失败不影响业务
                    logger.debug("verhub: 事件发送失败，稍后重试：%s", exc)
                    self._schedule(self._record_failure())
                    return
                self._commit(len(payload["events"]))
        finally:
            self._flush_lock.release()

    def close(self) -> None:
        """停掉定时器并把队列里剩下的发出去。此后不再排新的定时发送。"""
        self._closed = True
        self._cancel_timer()
        self.flush()

    def _schedule(self, delay: float) -> None:
        if self._closed or self._timer is not None or not self.active():
            return
        timer = threading.Timer(delay, self._on_timer)
        timer.daemon = True
        self._timer = timer
        timer.start()

    def _on_timer(self) -> None:
        self._timer = None
        self.flush()

    def _cancel_timer(self) -> None:
        timer = self._timer
        if timer is not None:
            timer.cancel()
            self._timer = None


class AsyncEventQueue(BaseEventQueue):
    """
    异步版事件队列，行为与 :class:`EventQueue` 一致。

    发送是协程，定时发送靠一个 ``asyncio`` 任务而不是线程；在没有运行中的事件
    循环时（例如在循环外构造并入队）退化成「攒够一批才发」，其余靠调用方
    ``await flush()``。
    """

    def __init__(
        self, namespace: str, send: Callable[[Dict[str, Any]], Any], **options: Any
    ) -> None:
        """
        :param namespace: 本地状态的命名空间，由 :func:`analytics_namespace` 算出
        :param send: 实际发送函数，接收一个载荷字典并返回协程
        :param options: 其余采集配置，见 :class:`BaseEventQueue`
        """
        super().__init__(namespace, **options)
        self._send = send
        self._flushing = False
        self._timer: "Optional[asyncio.Task[None]]" = None

    async def track(self, name: str, properties: Optional[Dict[str, Any]] = None) -> None:
        """
        入队一条事件；攒够一批立即发送，否则排一个定时发送后返回。

        :param name: 事件名
        :param properties: 自定义属性
        """
        if self._enqueue(name, properties):
            await self.flush()
        else:
            self._schedule(self._flush_interval)

    async def flush(self) -> None:
        """
        立即发送队列里的所有事件。

        失败的那一批留在队列里，按指数退避重排；已在发送中时直接返回。
        """
        if self._flushing:
            return
        self._flushing = True
        try:
            self._cancel_timer()
            while True:
                payload = self._take_batch()
                if payload is None:
                    return
                try:
                    await self._send(payload)
                except Exception as exc:  # noqa: BLE001 - 采集失败不影响业务
                    logger.debug("verhub: 事件发送失败，稍后重试：%s", exc)
                    self._schedule(self._record_failure())
                    return
                self._commit(len(payload["events"]))
        finally:
            self._flushing = False

    async def close(self) -> None:
        """停掉定时任务并把队列里剩下的发出去。此后不再排新的定时发送。"""
        self._closed = True
        self._cancel_timer()
        await self.flush()

    def _schedule(self, delay: float) -> None:
        if self._closed or self._timer is not None or not self.active():
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # 事件循环外无处挂任务，留给下一次 track 或调用方的 flush。
            return
        self._timer = loop.create_task(self._on_timer(delay))

    async def _on_timer(self, delay: float) -> None:
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            return
        self._timer = None
        await self.flush()

    def _cancel_timer(self) -> None:
        timer = self._timer
        if timer is not None:
            self._timer = None
            timer.cancel()
