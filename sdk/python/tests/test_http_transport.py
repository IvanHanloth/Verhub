"""
传输层行为：URL 拼装、请求头、错误映射与重试策略。

用 ``httpx.MockTransport`` 在进程内接管请求，不碰网络。只用标准库 ``unittest``，
不引入测试依赖：``python -m unittest discover -s tests``。
"""

from __future__ import annotations

import json
import unittest
from typing import Any, Callable, List, Optional, Tuple

import httpx

from verhub_sdk import VerhubApiError, VerhubAuthError, VerhubClient, VerhubConnectionError

BASE_URL = "https://example.com/api/v1"


def _mock_client(
    handler: Callable[[httpx.Request], httpx.Response],
) -> httpx.Client:
    """
    :param handler: 处理请求的假后端
    :return: 走 MockTransport 的 httpx 客户端
    """
    return httpx.Client(transport=httpx.MockTransport(handler))


class TransportTest(unittest.TestCase):
    def _client(
        self,
        handler: Callable[[httpx.Request], httpx.Response],
        **kwargs: Any,
    ) -> VerhubClient:
        """
        :param handler: 假后端
        :param kwargs: 透传给 :class:`VerhubClient` 的参数
        :return: 接到假后端上的客户端，测试结束自动关闭
        """
        http_client = _mock_client(handler)
        self.addCleanup(http_client.close)
        kwargs.setdefault("retries", 0)
        client = VerhubClient(BASE_URL, "verhub", http_client=http_client, **kwargs)
        self.addCleanup(client.close)
        return client

    def test_builds_url_and_declares_origin(self) -> None:
        seen: List[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={"items": [], "total": 0})

        client = self._client(handler, platform="linux", platform_version="ubuntu 24.04")
        client.public.list_versions(limit=10, offset=None)

        request = seen[0]
        self.assertEqual(str(request.url), f"{BASE_URL}/public/verhub/versions?limit=10")
        self.assertEqual(request.headers["x-verhub-platform"], "linux")
        self.assertEqual(request.headers["x-verhub-platform-version"], "ubuntu 24.04")
        self.assertTrue(request.headers["user-agent"].startswith("verhub-sdk-python/"))

    def test_percent_encodes_path_params(self) -> None:
        seen: List[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={})

        client = self._client(handler)
        client.public.get_version("1.0.0+build/1")

        self.assertIn("1.0.0%2Bbuild%2F1", str(seen[0].url))

    def test_sends_json_body_as_utf8(self) -> None:
        seen: List[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(201, json={"id": "log-1"})

        client = self._client(handler)
        client.public.upload_log(level=3, content="炸了")

        request = seen[0]
        self.assertEqual(request.headers["content-type"], "application/json")
        self.assertEqual(json.loads(request.content.decode("utf-8"))["content"], "炸了")

    def test_missing_token_never_reaches_the_network(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover
            raise AssertionError("不该发出请求")

        client = self._client(handler)
        with self.assertRaises(VerhubAuthError):
            client.admin.list_projects()

    def test_joins_validation_message_array(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(400, json={"message": ["content 太长", "rating 越界"]})

        client = self._client(handler)
        with self.assertRaises(VerhubApiError) as caught:
            client.public.upload_log(level=1, content="x")

        self.assertEqual(caught.exception.status, 400)
        self.assertEqual(caught.exception.message, "content 太长; rating 越界")

    def test_keeps_non_json_error_body_as_text(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(502, text="<html>bad gateway</html>")

        client = self._client(handler)
        with self.assertRaises(VerhubApiError) as caught:
            client.public.get_project()

        self.assertEqual(caught.exception.message, "请求失败，HTTP 502")
        self.assertEqual(caught.exception.body, "<html>bad gateway</html>")

    def test_wraps_transport_failure(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("连不上")

        client = self._client(handler)
        with self.assertRaises(VerhubConnectionError) as caught:
            client.public.get_project()

        self.assertIsInstance(caught.exception.cause, httpx.ConnectError)

    def test_read_timeout_carries_a_readable_message(self) -> None:
        """httpx 的超时异常 ``str()`` 常为空串，不能让错误信息烂尾。"""

        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("")

        client = self._client(handler)
        with self.assertRaises(VerhubConnectionError) as caught:
            client.public.get_project()

        self.assertTrue(str(caught.exception).endswith("ReadTimeout"))

    def test_terms_endpoints_are_instance_scoped(self) -> None:
        """条款是实例级的，路径里不带 project_key，也不要求绑定项目。"""
        seen: List[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={"data": []})

        http_client = _mock_client(handler)
        self.addCleanup(http_client.close)
        client = VerhubClient(BASE_URL, http_client=http_client, retries=0)
        self.addCleanup(client.close)

        client.public.list_terms()
        client.public.get_terms("privacy-policy")

        self.assertEqual(
            [str(request.url) for request in seen],
            [f"{BASE_URL}/public/terms", f"{BASE_URL}/public/terms/privacy-policy"],
        )


class RetryTest(unittest.TestCase):
    def _counting(
        self,
        outcome: Callable[[int], httpx.Response],
        **kwargs: Any,
    ) -> Tuple[VerhubClient, List[int]]:
        """
        :param outcome: 第 n 次（从 0 起）请求的响应，抛异常表示传输失败
        :return: 客户端与一个只有一个元素的计数器
        """
        calls = [0]

        def handler(request: httpx.Request) -> httpx.Response:
            index = calls[0]
            calls[0] += 1
            return outcome(index)

        http_client = _mock_client(handler)
        self.addCleanup(http_client.close)
        client = VerhubClient(BASE_URL, "verhub", http_client=http_client, **kwargs)
        self.addCleanup(client.close)
        return client, calls

    def test_retries_idempotent_get_on_temporary_status(self) -> None:
        client, calls = self._counting(
            lambda n: httpx.Response(200, json={}) if n else httpx.Response(503),
            retries=1,
        )
        client.public.get_project()
        self.assertEqual(calls[0], 2)

    def test_does_not_replay_post_on_temporary_status(self) -> None:
        """POST 可能已经在服务端生效了，重放会造成重复写入。"""
        client, calls = self._counting(lambda n: httpx.Response(503), retries=1)
        with self.assertRaises(VerhubApiError):
            client.public.check_update(current_version="1.0.0")
        self.assertEqual(calls[0], 1)

    def test_does_not_retry_connect_failure_for_post(self) -> None:
        """POST 不在幂等方法集合里，连接失败也不重放。四个语言的 SDK 一致。"""

        def outcome(index: int) -> httpx.Response:
            raise httpx.ConnectError("连不上")

        client, calls = self._counting(outcome, retries=2)
        with self.assertRaises(VerhubConnectionError):
            client.public.check_update(current_version="1.0.0")
        self.assertEqual(calls[0], 1)

    def test_retries_connect_failure_for_get(self) -> None:
        """GET 是幂等方法，连接没建起来时可以重放。"""

        def outcome(index: int) -> httpx.Response:
            if index == 0:
                raise httpx.ConnectError("连不上")
            return httpx.Response(200, json={"project_key": "verhub"})

        client, calls = self._counting(outcome, retries=1)
        client.public.get_project()
        self.assertEqual(calls[0], 2)

    def test_does_not_retry_read_timeout(self) -> None:
        """读超时时请求可能已经生效，只有连接失败才重放。"""

        def outcome(index: int) -> httpx.Response:
            raise httpx.ReadTimeout("")

        client, calls = self._counting(outcome, retries=2)
        with self.assertRaises(VerhubConnectionError):
            client.public.get_project()
        self.assertEqual(calls[0], 1)

    def test_retries_zero_disables_everything(self) -> None:
        client, calls = self._counting(lambda n: httpx.Response(503), retries=0)
        with self.assertRaises(VerhubApiError):
            client.public.get_project()
        self.assertEqual(calls[0], 1)


class OwnershipTest(unittest.TestCase):
    """谁建的连接池谁关：自带的 ``httpx.Client`` 不该被 SDK 顺手关掉。"""

    def test_closes_its_own_pool(self) -> None:
        client = VerhubClient(BASE_URL, "verhub")
        inner = client._http.client
        client.close()
        self.assertTrue(inner.is_closed)

    def test_leaves_a_caller_supplied_client_alone(self) -> None:
        http_client = _mock_client(lambda request: httpx.Response(200, json={}))
        self.addCleanup(http_client.close)

        client = VerhubClient(BASE_URL, "verhub", http_client=http_client)
        client.close()
        self.assertFalse(http_client.is_closed)


class TimeoutTest(unittest.TestCase):
    def _timeout_of(self, timeout: Any) -> httpx.Timeout:
        """
        :param timeout: SDK 的超时写法
        :return: 翻译后的 httpx 超时
        """
        from verhub_sdk._http import _to_httpx_timeout

        return _to_httpx_timeout(timeout)

    def test_single_value_covers_every_phase(self) -> None:
        self.assertEqual(self._timeout_of(5.0), httpx.Timeout(5.0))

    def test_tuple_splits_connect_and_read(self) -> None:
        converted = self._timeout_of((3.0, 20.0))
        self.assertEqual(converted.connect, 3.0)
        self.assertEqual(converted.read, 20.0)

    def test_none_means_no_limit(self) -> None:
        self.assertIsNone(self._timeout_of(None).read)

    def test_passes_through_httpx_timeout(self) -> None:
        given: Optional[httpx.Timeout] = httpx.Timeout(1.0, connect=2.0)
        self.assertIs(self._timeout_of(given), given)


if __name__ == "__main__":
    unittest.main()
