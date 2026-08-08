"""
后台线程池与回调调度器：GUI（PySide6 等）不引入 Qt 依赖也能安全刷新界面。

核心约定只有一条——回调**不在**工作线程执行，而是排队等调用方的线程调 ``drain``。
这里用「记下执行回调的线程」来断言这一点，不需要真的起一个 GUI。
"""

from __future__ import annotations

import threading
import time
import unittest
from typing import Any, List

from verhub_sdk import BackgroundWorker


class BackgroundWorkerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.worker = BackgroundWorker(max_workers=2)
        self.addCleanup(self.worker.close)

    def _drain_until(self, expected: int, timeout: float = 5.0) -> int:
        """
        :param expected: 期望执行到的回调数
        :param timeout: 最长等待秒数
        :return: 实际执行的回调数
        """
        processed = 0
        deadline = time.monotonic() + timeout
        while processed < expected and time.monotonic() < deadline:
            processed += self.worker.drain()
            if processed < expected:
                time.sleep(0.005)
        return processed

    def test_runs_the_call_off_the_calling_thread(self) -> None:
        future = self.worker.submit(threading.get_ident)
        self.assertNotEqual(future.result(timeout=5), threading.get_ident())

    def test_callbacks_run_on_the_draining_thread(self) -> None:
        seen: List[int] = []

        self.worker.submit(
            lambda: "ok",
            on_success=lambda result: seen.append(threading.get_ident()),
        )
        self.assertEqual(self._drain_until(1), 1)
        self.assertEqual(seen, [threading.get_ident()])

    def test_success_callback_receives_the_return_value(self) -> None:
        seen: List[Any] = []

        self.worker.submit(lambda: {"version": "1.2.0"}, on_success=seen.append)
        self._drain_until(1)
        self.assertEqual(seen, [{"version": "1.2.0"}])

    def test_error_callback_receives_the_exception(self) -> None:
        seen: List[BaseException] = []

        def boom() -> None:
            raise ValueError("炸了")

        self.worker.submit(boom, on_error=seen.append)
        self._drain_until(1)
        self.assertIsInstance(seen[0], ValueError)

    def test_done_callback_runs_on_both_outcomes(self) -> None:
        done: List[str] = []

        def boom() -> None:
            raise ValueError("炸了")

        self.worker.submit(lambda: "ok", on_done=lambda: done.append("ok"))
        self.worker.submit(boom, on_error=lambda exc: None, on_done=lambda: done.append("err"))
        self._drain_until(2)
        self.assertEqual(sorted(done), ["err", "ok"])

    def test_drain_is_non_blocking_when_idle(self) -> None:
        self.assertEqual(self.worker.drain(), 0)

    def test_drain_honours_the_batch_limit(self) -> None:
        for _ in range(3):
            self.worker.submit(lambda: None, on_success=lambda result: None)

        # 先等三个回调都排进队列，再验证限流确实只放一个过去。
        deadline = time.monotonic() + 5.0
        while self.worker.pending() < 3 and time.monotonic() < deadline:
            time.sleep(0.005)

        self.assertEqual(self.worker.drain(max_callbacks=1), 1)
        self.assertEqual(self.worker.drain(), 2)

    def test_a_failing_callback_does_not_block_the_queue(self) -> None:
        survived: List[str] = []

        def explode(result: Any) -> None:
            raise RuntimeError("界面刷新失败")

        self.worker.submit(lambda: None, on_success=explode)
        self.worker.submit(lambda: None, on_success=lambda result: survived.append("after"))

        with self.assertLogs("verhub_sdk", level="ERROR"):
            self._drain_until(2)

        self.assertEqual(survived, ["after"])

    def test_pure_future_usage_queues_nothing(self) -> None:
        self.assertEqual(self.worker.submit(lambda: 1).result(timeout=5), 1)
        self.assertEqual(self.worker.pending(), 0)

    def test_submit_after_close_is_refused(self) -> None:
        self.worker.close()
        with self.assertRaises(RuntimeError):
            self.worker.submit(lambda: None)

    def test_close_warns_about_callbacks_nobody_drained(self) -> None:
        """忘了把 drain 接到定时器上时，界面会「没反应」，这条日志是唯一的线索。"""
        self.worker.submit(lambda: None, on_success=lambda result: None)
        deadline = time.monotonic() + 5.0
        while self.worker.pending() < 1 and time.monotonic() < deadline:
            time.sleep(0.005)

        with self.assertLogs("verhub_sdk", level="WARNING"):
            self.worker.close()


if __name__ == "__main__":
    unittest.main()
