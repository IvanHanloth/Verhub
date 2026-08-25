"""
后台线程池 + 回调调度器，给没有 asyncio 事件循环的 GUI 框架用。

分两段：

1. :meth:`BackgroundWorker.submit` 把调用丢进线程池，主线程立刻返回；
2. 请求完成后回调排进一个队列，等主线程调用 :meth:`BackgroundWorker.drain`
   时才执行，因此回调运行在调用 ``drain`` 的线程上，可以直接改控件。

GUI 侧用框架自带的定时器周期性调一下 ``drain``：

>>> worker = client.background
>>> timer = QTimer(self)                      # PySide6，SDK 自己不 import Qt
>>> timer.timeout.connect(worker.drain)
>>> timer.start(50)
>>> worker.submit(
...     client.public.check_update,
...     current_version="1.1.0",
...     on_success=self.show_update,          # 在主线程执行
...     on_error=self.show_error,
... )

不需要「切回主线程」这层时忽略 ``on_success`` / ``on_error``，直接用
:meth:`submit` 返回的 :class:`~concurrent.futures.Future`，即标准的
``concurrent.futures`` 语义，``add_done_callback`` 在工作线程里执行。
"""

from __future__ import annotations

import queue
import threading
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, Callable, Optional

from ._http import logger

#: 线程池默认大小。
DEFAULT_MAX_WORKERS = 4


class BackgroundWorker:
    """
    把同步调用挪到后台线程，并把回调排队交还给调用 :meth:`drain` 的那个线程。

    线程池是共享的，底层 ``httpx.Client`` 线程安全，多个请求可以并发在途。
    有在途请求时不要并发调用客户端的 setter（``set_token`` 等）。
    """

    def __init__(
        self,
        *,
        max_workers: int = DEFAULT_MAX_WORKERS,
        thread_name_prefix: str = "verhub-sdk",
    ) -> None:
        """
        :param max_workers: 线程池大小
        :param thread_name_prefix: 工作线程名前缀，便于在调试器里认人
        """
        self._pool = ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix=thread_name_prefix
        )
        self._callbacks: "queue.SimpleQueue[Callable[[], None]]" = queue.SimpleQueue()
        self._lock = threading.Lock()
        self._closed = False

    def submit(
        self,
        fn: Callable[..., Any],
        *args: Any,
        on_success: Optional[Callable[[Any], Any]] = None,
        on_error: Optional[Callable[[BaseException], Any]] = None,
        on_done: Optional[Callable[[], Any]] = None,
        **kwargs: Any,
    ) -> "Future[Any]":
        """
        在后台线程执行 ``fn(*args, **kwargs)``，立刻返回。

        三个回调都是可选的，给了就排进队列，等 :meth:`drain` 在你的线程上执行；
        一个都不给就纯粹当线程池用，靠返回的 Future 取结果。

        .. warning::
           ``on_success`` / ``on_error`` / ``on_done`` 是保留参数名，不会透传给
           ``fn``。若目标函数恰好有同名参数，改用 ``functools.partial`` 先绑上。

        :param fn: 要在后台执行的调用，通常是 ``client.public.xxx``
        :param args: 位置参数
        :param on_success: 成功回调，收到返回值；在 :meth:`drain` 的线程上执行
        :param on_error: 失败回调，收到异常对象（``VerhubApiError`` 等）
        :param on_done: 收尾回调，成功失败都会跑，适合关掉 loading 态
        :param kwargs: 关键字参数
        :return: 这次调用的 Future
        :raises RuntimeError: 已经 :meth:`close` 过
        """
        with self._lock:
            if self._closed:
                raise RuntimeError("BackgroundWorker 已关闭，不能再提交任务")
            future = self._pool.submit(fn, *args, **kwargs)

        if on_success is None and on_error is None and on_done is None:
            return future

        def _queue_callbacks(done: "Future[Any]") -> None:
            # 这里还在工作线程里，只做入队。
            self._callbacks.put(lambda: self._dispatch(done, on_success, on_error, on_done))

        future.add_done_callback(_queue_callbacks)
        return future

    def drain(self, max_callbacks: Optional[int] = None) -> int:
        """
        在当前线程上执行已排队的回调，队列空了就返回。

        方法本身不阻塞：没有待处理的回调时立刻返回 0。回调自己抛出的异常会被记进
        ``verhub_sdk`` 日志器并跳过，不影响后面的回调。

        :param max_callbacks: 本次最多执行几个回调；``None`` 表示排空
        :return: 实际执行的回调数
        """
        processed = 0
        while max_callbacks is None or processed < max_callbacks:
            try:
                callback = self._callbacks.get_nowait()
            except queue.Empty:
                break

            processed += 1
            try:
                callback()
            except Exception:
                logger.exception("verhub 回调执行失败")

        return processed

    def pending(self) -> int:
        """
        :return: 排队等 :meth:`drain` 的回调数（近似值，仅供调试与自检）
        """
        return self._callbacks.qsize()

    def close(self, *, wait: bool = True) -> None:
        """
        关闭线程池。关闭后再 :meth:`submit` 会抛 ``RuntimeError``。

        :param wait: 是否等在途任务跑完
        """
        with self._lock:
            if self._closed:
                return
            self._closed = True

        self._pool.shutdown(wait=wait)

        leftover = self.pending()
        if leftover:
            logger.warning("verhub 后台任务关闭时仍有 %d 个回调未被 drain() 取走", leftover)

    def __enter__(self) -> "BackgroundWorker":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    def _dispatch(
        self,
        future: "Future[Any]",
        on_success: Optional[Callable[[Any], Any]],
        on_error: Optional[Callable[[BaseException], Any]],
        on_done: Optional[Callable[[], Any]],
    ) -> None:
        """
        在 :meth:`drain` 的线程上分发一次调用的结局。

        :param future: 已完成的 Future
        :param on_success: 成功回调
        :param on_error: 失败回调
        :param on_done: 收尾回调
        """
        try:
            if future.cancelled():
                # 取消没有结果可交付，只跑收尾回调。
                return

            error = future.exception()
            if error is not None:
                if on_error is not None:
                    on_error(error)
                return

            if on_success is not None:
                on_success(future.result())
        finally:
            if on_done is not None:
                on_done()
