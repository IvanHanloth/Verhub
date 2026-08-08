"""
异步客户端：与同步版共用一份方法体，绑到异步客户端上返回协程。

同样用 ``httpx.MockTransport`` 在进程内接管请求，不碰网络。
"""

from __future__ import annotations

import unittest
from typing import Any, List

import httpx

from verhub_sdk import AsyncVerhubClient, VerhubApiError, VerhubAuthError, VerhubError

BASE_URL = "https://example.com/api/v1"


class AsyncClientTest(unittest.IsolatedAsyncioTestCase):
    def _client(self, handler: Any, **kwargs: Any) -> AsyncVerhubClient:
        """
        :param handler: 假后端
        :return: 接到假后端上的异步客户端，测试结束自动关闭
        """
        http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        self.addAsyncCleanup(http_client.aclose)
        kwargs.setdefault("retries", 0)
        return AsyncVerhubClient(BASE_URL, "verhub", http_client=http_client, **kwargs)

    async def test_public_methods_are_awaitable(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"version": "1.2.0"})

        async with self._client(handler) as client:
            latest = await client.public.get_latest_version()

        self.assertEqual(latest["version"], "1.2.0")

    async def test_health_shares_the_same_transport(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(str(request.url), f"{BASE_URL}/health")
            return httpx.Response(200, json={"status": "ok", "timestamp": 1})

        async with self._client(handler) as client:
            self.assertEqual((await client.health())["status"], "ok")

    async def test_concurrent_calls_share_one_pool(self) -> None:
        """真异步而非线程壳：并发在途请求不占线程。"""
        import asyncio

        seen: List[str] = []

        async def handler(request: httpx.Request) -> httpx.Response:
            seen.append(str(request.url))
            await asyncio.sleep(0)
            return httpx.Response(200, json={})

        async with self._client(handler) as client:
            await asyncio.gather(
                client.public.get_project(),
                client.public.get_latest_version(),
                client.public.get_feedback_options(),
            )

        self.assertEqual(len(seen), 3)

    async def test_api_error_surfaces_on_await(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(404, json={"message": "项目不存在"})

        async with self._client(handler) as client:
            with self.assertRaises(VerhubApiError) as caught:
                await client.public.get_project()

        self.assertEqual(caught.exception.status, 404)

    async def test_local_checks_raise_before_the_coroutine_exists(self) -> None:
        """本地前置校验在调用当下就抛，协程还没造出来。"""

        def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover
            raise AssertionError("不该发出请求")

        async with self._client(handler) as client:
            with self.assertRaises(VerhubAuthError):
                client.admin.list_projects()

            with self.assertRaises(VerhubError):
                client.public.create_feedback(content="x", forward_to_github=True)

    async def test_closes_its_own_pool_but_not_a_supplied_one(self) -> None:
        """谁建的连接池谁关：自带的 ``httpx.AsyncClient`` 不该被 SDK 顺手关掉。"""
        owned = AsyncVerhubClient(BASE_URL, "verhub")
        inner = owned._http.client
        await owned.aclose()
        self.assertTrue(inner.is_closed)

        supplied = httpx.AsyncClient(
            transport=httpx.MockTransport(lambda request: httpx.Response(200, json={}))
        )
        self.addAsyncCleanup(supplied.aclose)
        await AsyncVerhubClient(BASE_URL, "verhub", http_client=supplied).aclose()
        self.assertFalse(supplied.is_closed)

    async def test_retries_temporary_status_on_get(self) -> None:
        calls = [0]

        def handler(request: httpx.Request) -> httpx.Response:
            calls[0] += 1
            return httpx.Response(200, json={}) if calls[0] > 1 else httpx.Response(503)

        async with self._client(handler, retries=1) as client:
            await client.public.get_project()

        self.assertEqual(calls[0], 2)


if __name__ == "__main__":
    unittest.main()
