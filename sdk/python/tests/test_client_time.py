"""
客户端本地时间头（``x-verhub-client-time``）的行为约定。

四个语言的 SDK 断言同一套形状，改一处务必同步其余三处：
sdk/rust/src/http.rs、sdk/typescript/tests/client-time.test.mjs、sdk/vanilla-js/。
"""

from __future__ import annotations

import re
import time
import unittest
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, List, Optional, Tuple
from unittest import mock

import httpx

from verhub_sdk import (
    CLIENT_TIME_HEADER,
    AsyncVerhubClient,
    VerhubClient,
    format_client_time,
)

BASE_URL = "https://example.com/api/v1"
SHAPE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$")


def _local_offset() -> str:
    """进程当前时区的偏移，写成 ``±HH:MM``；取自 ``time`` 模块，与被测实现互相独立。"""
    seconds = time.localtime().tm_gmtoff
    sign = "-" if seconds < 0 else "+"
    minutes = abs(seconds) // 60
    return f"{sign}{minutes // 60:02d}:{minutes % 60:02d}"


class FormatTest(unittest.TestCase):
    def test_shape_and_local_offset(self) -> None:
        value = format_client_time()
        assert value is not None
        self.assertRegex(value, SHAPE)
        self.assertEqual(value[-6:], _local_offset())

    def test_instant_is_accurate(self) -> None:
        before = datetime.now(timezone.utc).replace(microsecond=0)
        value = format_client_time()
        after = datetime.now(timezone.utc) + timedelta(seconds=1)
        assert value is not None
        parsed = datetime.fromisoformat(value)
        self.assertTrue(before <= parsed <= after, f"{value} 不在 [{before}, {after}] 内")

    def test_truncates_to_milliseconds_without_rolling_over(self) -> None:
        moment = datetime(2026, 9, 24, 2, 0, 0, 999999, tzinfo=timezone.utc)
        value = format_client_time(moment)
        assert value is not None
        self.assertRegex(value, SHAPE)
        self.assertEqual(datetime.fromisoformat(value), moment.replace(microsecond=999000), value)

    def test_utc_is_written_as_numeric_offset(self) -> None:
        # 形状依赖 isoformat 从不输出 Z；这里钉住这个前提。
        moment = datetime(2026, 9, 24, 2, 0, 0, 5000, tzinfo=timezone.utc)
        self.assertEqual(moment.isoformat(timespec="milliseconds"), "2026-09-24T02:00:00.005+00:00")
        value = format_client_time(moment)
        assert value is not None
        self.assertNotIn("Z", value)

    def test_unrepresentable_moment_yields_none_instead_of_raising(self) -> None:
        for moment in (
            datetime.min.replace(tzinfo=timezone.utc),
            datetime.max.replace(tzinfo=timezone.utc),
        ):
            value = format_client_time(moment)
            self.assertTrue(value is None or SHAPE.match(value), value)

    def test_rejects_second_level_offsets(self) -> None:
        # 历史日期的地方平时偏移可能带秒，写不成 ±HH:MM，宁可不报。
        lmt = timezone(timedelta(hours=8, minutes=5, seconds=43))
        moment = datetime(1900, 1, 1, tzinfo=lmt)
        with mock.patch("verhub_sdk._http.datetime") as fake:
            fake.now.return_value.astimezone.return_value = moment
            self.assertIsNone(format_client_time())


class SyncTransportTest(unittest.TestCase):
    def _client(
        self,
        statuses: Optional[List[int]] = None,
        **kwargs: Any,
    ) -> Tuple[VerhubClient, List[Optional[str]]]:
        seen: List[Optional[str]] = []
        pending = list(statuses or [])

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request.headers.get(CLIENT_TIME_HEADER))
            return httpx.Response(pending.pop(0) if pending else 200, json={})

        http_client = httpx.Client(transport=httpx.MockTransport(handler))
        self.addCleanup(http_client.close)
        kwargs.setdefault("retries", 0)
        client = VerhubClient(BASE_URL, "verhub", http_client=http_client, **kwargs)
        self.addCleanup(client.close)
        return client, seen

    def test_sent_by_default(self) -> None:
        client, seen = self._client()
        client.health()
        assert seen[0] is not None
        self.assertRegex(seen[0], SHAPE)
        self.assertEqual(seen[0][-6:], _local_offset())

    def test_sent_on_admin_and_event_ingest(self) -> None:
        client, seen = self._client(token="t")
        client.admin.list_projects()
        client._http._send_events({"events": []})
        self.assertEqual(len(seen), 2)
        for value in seen:
            assert value is not None
            self.assertRegex(value, SHAPE)

    def test_opt_out(self) -> None:
        client, seen = self._client(send_client_time=False)
        client.health()
        self.assertEqual(seen, [None])

    def test_recomputed_for_each_attempt(self) -> None:
        values = iter(["2026-09-24T10:00:00.000+08:00", "2026-09-24T10:00:00.300+08:00"])
        client, seen = self._client(statuses=[503, 200], retries=1)
        with mock.patch("verhub_sdk._http.format_client_time", side_effect=lambda: next(values)):
            client.public.get_project()
        self.assertEqual(seen, ["2026-09-24T10:00:00.000+08:00", "2026-09-24T10:00:00.300+08:00"])

    def test_failure_to_compute_omits_the_header(self) -> None:
        client, seen = self._client()
        with mock.patch("verhub_sdk._http.format_client_time", return_value=None):
            client.health()
        self.assertEqual(seen, [None])


class AsyncTransportTest(unittest.IsolatedAsyncioTestCase):
    def _client(
        self, handler: Callable[[httpx.Request], httpx.Response], **kwargs: Any
    ) -> AsyncVerhubClient:
        http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        self.addAsyncCleanup(http_client.aclose)
        kwargs.setdefault("retries", 0)
        return AsyncVerhubClient(BASE_URL, "verhub", http_client=http_client, **kwargs)

    async def test_sent_by_default_and_opt_out(self) -> None:
        seen: List[Optional[str]] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request.headers.get(CLIENT_TIME_HEADER))
            return httpx.Response(200, json={})

        async with self._client(handler) as client:
            await client.health()
        async with self._client(handler, send_client_time=False) as client:
            await client.health()

        assert seen[0] is not None
        self.assertRegex(seen[0], SHAPE)
        self.assertIsNone(seen[1])

    async def test_recomputed_for_each_attempt(self) -> None:
        seen: List[Optional[str]] = []
        values = iter(["2026-09-24T10:00:00.000+08:00", "2026-09-24T10:00:00.300+08:00"])

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request.headers.get(CLIENT_TIME_HEADER))
            return httpx.Response(503 if len(seen) == 1 else 200, json={})

        with mock.patch("verhub_sdk._http.format_client_time", side_effect=lambda: next(values)):
            async with self._client(handler, retries=1) as client:
                await client.public.get_project()

        self.assertEqual(seen, ["2026-09-24T10:00:00.000+08:00", "2026-09-24T10:00:00.300+08:00"])


if __name__ == "__main__":
    unittest.main()
