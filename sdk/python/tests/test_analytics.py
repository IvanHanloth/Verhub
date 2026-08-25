"""
事件采集队列的行为约定。

这套断言在四个语言的 SDK 里是同一份，改一处务必同步其余三处：
sdk/typescript/tests/analytics.test.mjs、sdk/vanilla-js/verhub-sdk.test.mjs、
sdk/rust/src/analytics.rs。
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List

import pytest

from verhub_sdk._analytics import (
    AsyncEventQueue,
    EventQueue,
    FileStorage,
    MemoryStorage,
    _default_state_path,
    _file_safe,
    analytics_namespace,
    fnv1a32_hex,
    origin_of,
)


class RecordingSend:
    """记录每一次发送的载荷；可切换成失败模式来验证重试。"""

    def __init__(self) -> None:
        self.calls: List[Dict[str, Any]] = []
        self.failing = False

    def __call__(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        self.calls.append(payload)
        if self.failing:
            raise RuntimeError("network down")
        return {"accepted": len(payload["events"]), "skipped": 0, "suppressed": False}


def make_queue(**options: Any) -> tuple[EventQueue, RecordingSend]:
    sender = RecordingSend()
    options.setdefault("storage", MemoryStorage())
    options.setdefault("flush_interval", 0.05)
    return EventQueue("test", sender, **options), sender


def test_track_returns_immediately_without_sending() -> None:
    queue, sender = make_queue()
    queue.track("app_opened")
    # 还没到 batch_size，此刻不该已经发出去。
    assert sender.calls == []


def test_full_batch_sends_at_once() -> None:
    queue, sender = make_queue(batch_size=2)
    queue.track("a")
    queue.track("b")
    assert len(sender.calls) == 1
    assert len(sender.calls[0]["events"]) == 2


def test_each_event_carries_a_unique_idempotency_key() -> None:
    queue, sender = make_queue(batch_size=2)
    queue.track("a")
    queue.track("b")

    ids = [event["event_id"] for event in sender.calls[0]["events"]]
    assert len(set(ids)) == 2


def test_failed_batch_is_replayed_with_the_same_ids() -> None:
    queue, sender = make_queue(batch_size=1)

    sender.failing = True
    queue.track("a")
    first_id = sender.calls[0]["events"][0]["event_id"]

    sender.failing = False
    queue.flush()
    # 幂等键不变，服务端据此去重——这是「事件采集是不重试规则的唯一例外」的前提。
    assert sender.calls[1]["events"][0]["event_id"] == first_id


def test_batch_shares_one_distinct_and_session_id() -> None:
    queue, sender = make_queue(batch_size=2)
    queue.track("a")
    queue.track("b")

    assert sender.calls[0]["distinct_id"]
    assert sender.calls[0]["session_id"]


def test_device_persistence_keeps_the_identity_across_instances() -> None:
    storage = MemoryStorage()
    first = EventQueue("test", lambda payload: None, storage=storage)
    identity = first.current_distinct_id()

    second = EventQueue("test", lambda payload: None, storage=storage)
    assert second.current_distinct_id() == identity


def test_persistence_none_writes_nothing_locally() -> None:
    storage = MemoryStorage()
    queue = EventQueue("test", lambda payload: None, persistence="none", storage=storage)
    queue.track("a")

    assert storage.read("verhub.analytics.test.distinct_id") is None
    assert storage.read("verhub.analytics.test.queue") is None


def test_require_consent_collects_nothing_before_consent() -> None:
    storage = MemoryStorage()
    sender = RecordingSend()
    queue = EventQueue("test", sender, require_consent=True, storage=storage)

    queue.track("a")
    queue.flush()
    assert sender.calls == []
    assert storage.read("verhub.analytics.test.distinct_id") is None
    assert queue.current_distinct_id() is None

    queue.grant_consent()
    queue.track("b")
    queue.flush()
    assert len(sender.calls) == 1
    assert sender.calls[0]["events"][0]["name"] == "b"


def test_opt_out_drops_the_queue_and_persists_the_flag() -> None:
    storage = MemoryStorage()
    sender = RecordingSend()
    queue = EventQueue("test", sender, storage=storage)

    queue.track("a")
    queue.opt_out()
    queue.flush()

    # 攒着的事件不补发：用户已经表示不希望被采集。
    assert sender.calls == []
    assert storage.read("verhub.analytics.test.distinct_id") is None
    assert storage.read("verhub.analytics.test.opt_out") == "1"
    assert queue.has_opted_out() is True


def test_opt_out_survives_a_restart() -> None:
    storage = MemoryStorage()
    EventQueue("test", lambda payload: None, storage=storage).opt_out()

    restarted = EventQueue("test", lambda payload: None, storage=storage)
    assert restarted.has_opted_out() is True
    assert restarted.active() is False


def test_opt_in_mints_a_new_identity_instead_of_reusing_the_old_one() -> None:
    storage = MemoryStorage()
    queue = EventQueue("test", lambda payload: None, storage=storage)
    before = queue.current_distinct_id()

    queue.opt_out()
    queue.opt_in()

    after = queue.current_distinct_id()
    assert after is not None
    # 复用等于把退出期间的空白两端重新接上；用户重新同意的是「从现在起」。
    assert after != before


def test_reset_identity_keeps_collection_on() -> None:
    queue, _ = make_queue()
    before = queue.current_distinct_id()
    queue.reset_identity()

    assert queue.current_distinct_id() != before
    assert queue.active() is True


def test_disabled_queue_is_a_no_op() -> None:
    queue, sender = make_queue(enabled=False)
    queue.track("a")
    queue.flush()
    assert sender.calls == []


def test_oversized_queue_drops_the_oldest() -> None:
    queue, sender = make_queue(max_queue_size=2, batch_size=10)
    queue.track("a")
    queue.track("b")
    queue.track("c")
    queue.flush()

    assert [event["name"] for event in sender.calls[0]["events"]] == ["b", "c"]


def test_restart_replays_what_was_never_sent() -> None:
    storage = MemoryStorage()
    sender = RecordingSend()

    sender.failing = True
    first = EventQueue("test", sender, storage=storage, batch_size=1)
    first.track("a")
    sender.failing = False

    restarted = EventQueue("test", sender, storage=storage, batch_size=1)
    restarted.flush()

    assert sender.calls[-1]["events"][0]["name"] == "a"


def test_invalid_persistence_is_rejected_at_construction() -> None:
    with pytest.raises(ValueError):
        EventQueue("test", lambda payload: None, persistence="disk")


def test_async_queue_matches_the_sync_behaviour() -> None:
    """异步版与同步版逐条一致，只是发送是协程。"""

    calls: List[Dict[str, Any]] = []

    async def send(payload: Dict[str, Any]) -> None:
        calls.append(payload)

    async def scenario() -> None:
        queue = AsyncEventQueue("test", send, storage=MemoryStorage(), batch_size=2)
        await queue.track("a")
        assert calls == []
        await queue.track("b")
        assert len(calls) == 1
        assert [event["name"] for event in calls[0]["events"]] == ["a", "b"]

        queue.opt_out()
        await queue.track("c")
        await queue.flush()
        assert len(calls) == 1

    asyncio.run(scenario())


# ---- 命名空间：按自部署实例隔离 ----
#
# 这组固定向量在 TypeScript / Rust / 纯 JS 版里逐字相同。四个语言必须为同一个实例
# 算出同一个命名空间，改任何一处都要同步其余三处，并核对这里的期望值仍然成立。

ORIGIN_CASES = [
    ("https://verhub.example.com/api/v1", "https://verhub.example.com"),
    ("https://verhub.example.com/v2/api/v1", "https://verhub.example.com"),
    ("https://verhub.example.com", "https://verhub.example.com"),
    ("HTTPS://Verhub.Example.COM/api/v1", "https://verhub.example.com"),
    ("https://verhub.example.com:443/api/v1", "https://verhub.example.com"),
    ("http://verhub.example.com:80/api/v1", "http://verhub.example.com"),
    ("http://verhub.example.com:3080/api/v1", "http://verhub.example.com:3080"),
    ("https://user:pass@verhub.example.com/api/v1", "https://verhub.example.com"),
    ("http://[::1]:3080/api/v1", "http://[::1]:3080"),
    ("https://[::1]:443/api/v1", "https://[::1]"),
]


def test_origin_只取协议主机端口():
    for raw, expected in ORIGIN_CASES:
        assert origin_of(raw) == expected, raw


def test_fnv1a_与其余三个语言逐位一致():
    assert fnv1a32_hex("") == "811c9dc5"
    assert fnv1a32_hex("a") == "e40c292c"
    assert fnv1a32_hex("foobar") == "bf9cf968"
    assert fnv1a32_hex("https://verhub.example.com") == "8e08b085"
    # 非 ASCII 必须按 UTF-8 字节算，否则 JS 的 UTF-16 码元会和这边分道扬镳。
    assert fnv1a32_hex("héllo") == "4aa48540"


def test_命名空间带实例哈希且_project_key_小写化():
    ns = analytics_namespace("https://verhub.example.com/api/v1", "Demo")
    assert ns == "8e08b085-demo"
    assert analytics_namespace("https://verhub.example.com/v2/api/v1", "demo") == ns


def test_同_project_key_的两个实例互不相同():
    assert analytics_namespace("https://a.example.com/api/v1", "demo") != analytics_namespace(
        "https://b.example.com/api/v1", "demo"
    )


def test_没绑定项目时回落到_default():
    # 空串与纯空白也回落到 default，四个语言的 SDK 一致。
    for key in (None, "", "  "):
        assert analytics_namespace("https://a.example.com/api/v1", key).endswith("-default"), key


def test_两个实例的队列互不可见():
    storage = MemoryStorage()
    sent_a: list = []
    sent_b: list = []

    ns_a = analytics_namespace("https://a.example.com/api/v1", "demo")
    ns_b = analytics_namespace("https://b.example.com/api/v1", "demo")

    a = EventQueue(ns_a, lambda p: sent_a.append(p), batch_size=1, storage=storage)
    a.track("only_a")
    a.flush()

    b = EventQueue(ns_b, lambda p: sent_b.append(p), batch_size=1, storage=storage)
    b.flush()

    assert sent_a and sent_a[0]["events"][0]["name"] == "only_a"
    assert sent_b == [], "B 不该看到 A 的队列"
    assert a.current_distinct_id() != b.current_distinct_id()


def test_文件存储按命名空间分开且不残留临时文件(tmp_path):
    a = FileStorage("8e08b085-demo", tmp_path / "8e08b085-demo.json")
    b = FileStorage("8e08b085-other", tmp_path / "8e08b085-other.json")

    a.write("distinct_id", "id-a")
    b.write("distinct_id", "id-b")

    assert a.read("distinct_id") == "id-a"
    assert b.read("distinct_id") == "id-b"
    assert not list(tmp_path.glob("*.tmp")), "原子写完不该留下临时文件"


def test_默认状态路径按命名空间分文件():
    p1 = _default_state_path("8e08b085-demo")
    p2 = _default_state_path("8e08b085-other")
    assert p1.name == "8e08b085-demo.json"
    assert p1.parent == p2.parent
    assert p1 != p2


def test_文件名清洗掉路径分隔符():
    assert "/" not in _file_safe("abc-a/b")
    assert "\\" not in _file_safe("abc-a\b")
    assert _file_safe("abc-a/b") == "abc-a_b"
