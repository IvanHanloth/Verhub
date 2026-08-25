// 事件采集队列的行为约定。
//
// 这套断言在四个语言的 SDK 里是同一份，改一处务必同步其余三处：
// sdk/rust/、sdk/python/tests/、sdk/vanilla-js/。
//
// 跑在构建产物 dist 上（`npm run build` 之后）。只用 Node 内建的 node:test。

import assert from "node:assert/strict"
import test from "node:test"

import {
  analyticsNamespace,
  fnv1a32Hex,
  originOf,
  EventQueue,
  memoryStorage,
  VerhubClient,
} from "../dist/index.js"

const BASE_URL = "https://example.com/api/v1"

/** 记录每一次 send 的载荷；可切换成失败模式来验证重试。 */
function recordingSend() {
  const calls = []
  let failing = false
  const send = async (payload) => {
    calls.push(payload)
    if (failing) {
      throw new Error("network down")
    }
    return { accepted: payload.events.length, skipped: 0, suppressed: false }
  }
  return {
    calls,
    send,
    fail: () => {
      failing = true
    },
    recover: () => {
      failing = false
    },
  }
}

function queue(options = {}, sender = recordingSend()) {
  return {
    sender,
    q: new EventQueue("test", sender.send, {
      storage: memoryStorage(),
      flushIntervalMs: 5,
      ...options,
    }),
  }
}

test("track 入队后立即返回，不阻塞调用方", () => {
  const { q, sender } = queue()
  q.track("app_opened")
  // 还没到 batchSize 也没到 flushInterval，此刻不该已经发出去。
  assert.equal(sender.calls.length, 0)
})

test("攒够 batchSize 立即发送", async () => {
  const { q, sender } = queue({ batchSize: 2 })
  q.track("a")
  q.track("b")
  await q.flush()
  assert.equal(sender.calls.length, 1)
  assert.equal(sender.calls[0].events.length, 2)
})

test("每条事件带唯一的幂等键，重发不会在服务端产生重复", async () => {
  const { q, sender } = queue({ batchSize: 2 })
  q.track("a")
  q.track("b")
  await q.flush()

  const ids = sender.calls[0].events.map((e) => e.event_id)
  assert.equal(new Set(ids).size, 2)
  for (const id of ids) {
    assert.ok(id.length > 0)
  }
})

test("发送失败时事件留在队列里，恢复后用同样的 event_id 重发", async () => {
  const sender = recordingSend()
  const { q } = queue({ batchSize: 1 }, sender)

  sender.fail()
  q.track("a")
  await q.flush()
  assert.equal(sender.calls.length, 1)
  const firstId = sender.calls[0].events[0].event_id

  sender.recover()
  await q.flush()
  assert.equal(sender.calls.length, 2)
  // 幂等键不变，服务端据此去重——这是「事件采集是不重试规则的唯一例外」的前提。
  assert.equal(sender.calls[1].events[0].event_id, firstId)
})

test("同一批事件共用一个 distinct_id 与 session_id", async () => {
  const { q, sender } = queue({ batchSize: 2 })
  q.track("a")
  q.track("b")
  await q.flush()

  assert.ok(sender.calls[0].distinct_id)
  assert.ok(sender.calls[0].session_id)
})

test("持久化存储让 distinct_id 跨实例保持一致", async () => {
  const storage = memoryStorage()
  const first = new EventQueue("test", async () => {}, { storage })
  const id = first.currentDistinctId()

  const second = new EventQueue("test", async () => {}, { storage })
  assert.equal(second.currentDistinctId(), id)
})

test("persistence: none 不写入任何本地状态", () => {
  const storage = memoryStorage()
  const q = new EventQueue("test", async () => {}, { persistence: "none", storage })
  q.track("a")
  // storage 是显式传进去的，但 none 模式下 EventQueue 不该往里写。
  assert.equal(storage.read("verhub.analytics.test.distinct_id"), null)
  assert.equal(storage.read("verhub.analytics.test.queue"), null)
})

test("requireConsent 在同意之前一个字节都不写、一条都不采", async () => {
  const storage = memoryStorage()
  const sender = recordingSend()
  const q = new EventQueue("test", sender.send, { requireConsent: true, storage })

  q.track("a")
  await q.flush()
  assert.equal(sender.calls.length, 0)
  assert.equal(storage.read("verhub.analytics.test.distinct_id"), null)
  assert.equal(q.currentDistinctId(), null)

  q.grantConsent()
  q.track("b")
  await q.flush()
  assert.equal(sender.calls.length, 1)
  assert.equal(sender.calls[0].events[0].name, "b")
})

test("optOut 清空队列、删除本地标识并持久化退出标记", async () => {
  const storage = memoryStorage()
  const sender = recordingSend()
  const q = new EventQueue("test", sender.send, { storage, flushIntervalMs: 5 })

  q.track("a")
  q.optOut()
  await q.flush()

  // 攒着的事件不补发：用户已经表示不希望被采集。
  assert.equal(sender.calls.length, 0)
  assert.equal(storage.read("verhub.analytics.test.distinct_id"), null)
  assert.equal(storage.read("verhub.analytics.test.opt_out"), "1")
  assert.equal(q.hasOptedOut(), true)
})

test("退出标记在重启后仍然生效", () => {
  const storage = memoryStorage()
  new EventQueue("test", async () => {}, { storage }).optOut()

  const restarted = new EventQueue("test", async () => {}, { storage })
  assert.equal(restarted.hasOptedOut(), true)
  assert.equal(restarted.active(), false)
})

test("optIn 生成新的匿名标识，不复用退出前的那个", () => {
  const storage = memoryStorage()
  const q = new EventQueue("test", async () => {}, { storage })
  const before = q.currentDistinctId()

  q.optOut()
  q.optIn()

  const after = q.currentDistinctId()
  assert.ok(after)
  // 复用等于把退出期间的空白两端重新接上；用户重新同意的是「从现在起」。
  assert.notEqual(after, before)
})

test("resetIdentity 换标识但保持采集开启", () => {
  const q = new EventQueue("test", async () => {}, { storage: memoryStorage() })
  const before = q.currentDistinctId()
  q.resetIdentity()
  assert.notEqual(q.currentDistinctId(), before)
  assert.equal(q.active(), true)
})

test("enabled: false 时 track 是空操作", async () => {
  const sender = recordingSend()
  const q = new EventQueue("test", sender.send, { enabled: false, storage: memoryStorage() })
  q.track("a")
  await q.flush()
  assert.equal(sender.calls.length, 0)
})

test("队列超出上限时丢最旧的", async () => {
  const { q, sender } = queue({ maxQueueSize: 2, batchSize: 10 })
  q.track("a")
  q.track("b")
  q.track("c")
  await q.flush()

  const names = sender.calls[0].events.map((e) => e.name)
  assert.deepEqual(names, ["b", "c"])
})

test("重启后把上次没发出去的事件补发上来", async () => {
  const storage = memoryStorage()
  const sender = recordingSend()

  sender.fail()
  const first = new EventQueue("test", sender.send, { storage, batchSize: 1, flushIntervalMs: 5 })
  first.track("a")
  await first.flush()
  sender.recover()

  const restarted = new EventQueue("test", sender.send, { storage, batchSize: 1 })
  await restarted.flush()

  const replayed = sender.calls.at(-1)
  assert.equal(replayed.events[0].name, "a")
})

test("客户端把 track 暴露在 public 命名空间上", () => {
  const client = new VerhubClient({
    baseUrl: BASE_URL,
    projectKey: "demo",
    analytics: { storage: memoryStorage() },
    fetch: async () => new Response("{}", { status: 202 }),
  })

  assert.equal(typeof client.public.track, "function")
  assert.equal(typeof client.public.flush, "function")
  assert.equal(typeof client.public.optOut, "function")
  assert.equal(typeof client.public.optIn, "function")
  assert.equal(typeof client.public.grantConsent, "function")
  assert.equal(typeof client.public.resetIdentity, "function")
  assert.equal(typeof client.public.exportMyData, "function")
  assert.equal(typeof client.public.deleteMyData, "function")
})

// ---- 页面卸载时的兜底发送 ----
//
// 定时器在标签页被关掉时不会再触发，攒着不满一批的事件只能靠 sendBeacon 送出去。

/** 记录每次 beacon 投递；可切换成「浏览器拒收」来验证队列保留。 */
function recordingBeacon() {
  const calls = []
  let accept = true
  return {
    calls,
    beacon: (payload) => {
      calls.push(payload)
      return accept
    },
    reject: () => {
      accept = false
    },
  }
}

test("flushBeacon 把整个队列送出去并清空", () => {
  const beacon = recordingBeacon()
  const q = new EventQueue("t", async () => {}, { storage: memoryStorage() }, beacon.beacon)

  q.track("a")
  q.track("b")
  q.flushBeacon()

  assert.equal(beacon.calls.length, 1)
  assert.deepEqual(
    beacon.calls[0].events.map((e) => e.name),
    ["a", "b"],
  )
})

test("浏览器拒收时事件留在队列里，等下次打开页面补发", async () => {
  const beacon = recordingBeacon()
  const sender = recordingSend()
  const q = new EventQueue("t", sender.send, { storage: memoryStorage() }, beacon.beacon)

  q.track("a")
  beacon.reject()
  q.flushBeacon()

  // 没被接下，队列不动；随后走正常发送仍能送出去。
  await q.flush()
  assert.equal(sender.calls.length, 1)
  assert.equal(sender.calls[0].events[0].name, "a")
})

test("超过一批时分多次 beacon，不超服务端单批上限", () => {
  const beacon = recordingBeacon()
  const q = new EventQueue(
    "t",
    async () => {},
    { storage: memoryStorage(), batchSize: 2, flushIntervalMs: 60_000 },
    beacon.beacon,
  )

  // batchSize=2 会在第 2 条时触发一次普通 flush（send 是空实现，直接成功），
  // 所以先把队列灌到 3 条再手动 beacon。
  q.track("a")
  q.track("b")
  q.track("c")
  q.flushBeacon()

  for (const call of beacon.calls) {
    assert.ok(call.events.length <= 2)
  }
})

test("退出状态下 flushBeacon 什么都不发", () => {
  const beacon = recordingBeacon()
  const q = new EventQueue("t", async () => {}, { storage: memoryStorage() }, beacon.beacon)

  q.track("a")
  q.optOut()
  q.flushBeacon()

  assert.equal(beacon.calls.length, 0)
})

test("没有 beacon 实现时 flushBeacon 是空操作（服务端运行时）", async () => {
  const sender = recordingSend()
  const q = new EventQueue("t", sender.send, { storage: memoryStorage() })

  q.track("a")
  q.flushBeacon()

  // 队列没被动过，正常发送照旧。
  await q.flush()
  assert.equal(sender.calls.length, 1)
})

// ---- 命名空间：按自部署实例隔离 ----
//
// 这组固定向量在 Python / Rust / 纯 JS 版里逐字相同。四个语言必须为同一个实例算出
// 同一个命名空间，改任何一处都要同步其余三处，并核对这里的期望值仍然成立。

const ORIGIN_CASES = [
  ["https://verhub.example.com/api/v1", "https://verhub.example.com"],
  ["https://verhub.example.com/v2/api/v1", "https://verhub.example.com"],
  ["https://verhub.example.com", "https://verhub.example.com"],
  ["HTTPS://Verhub.Example.COM/api/v1", "https://verhub.example.com"],
  ["https://verhub.example.com:443/api/v1", "https://verhub.example.com"],
  ["http://verhub.example.com:80/api/v1", "http://verhub.example.com"],
  ["http://verhub.example.com:3080/api/v1", "http://verhub.example.com:3080"],
  ["https://user:pass@verhub.example.com/api/v1", "https://verhub.example.com"],
  ["http://[::1]:3080/api/v1", "http://[::1]:3080"],
  ["https://[::1]:443/api/v1", "https://[::1]"],
]

test("origin 只取协议+主机+端口，路径一律忽略", () => {
  for (const [input, expected] of ORIGIN_CASES) {
    assert.equal(originOf(input), expected, input)
  }
})

test("FNV-1a 32 位是确定的，且与其余三个语言逐位一致", () => {
  // 这三个期望值是跨语言契约，不能只改一边。
  assert.equal(fnv1a32Hex(""), "811c9dc5")
  assert.equal(fnv1a32Hex("a"), "e40c292c")
  assert.equal(fnv1a32Hex("foobar"), "bf9cf968")
  assert.equal(fnv1a32Hex("https://verhub.example.com"), "8e08b085")
  // 非 ASCII 必须按 UTF-8 字节算，否则 JS 的 UTF-16 码元会和 Python / Rust 分道扬镳。
  assert.equal(fnv1a32Hex("héllo"), "4aa48540")
})

test("命名空间带上实例哈希，projectKey 小写化", () => {
  const a = analyticsNamespace("https://verhub.example.com/api/v1", "Demo")
  assert.equal(a, "8e08b085-demo")
  assert.equal(analyticsNamespace("https://verhub.example.com/api/v1", "demo"), a)
  // 同实例的另一挂载路径 → 同命名空间（粒度是 origin）
  assert.equal(analyticsNamespace("https://verhub.example.com/v2/api/v1", "demo"), a)
})

test("同 projectKey 的两个实例拿到不同命名空间", () => {
  assert.notEqual(
    analyticsNamespace("https://a.example.com/api/v1", "demo"),
    analyticsNamespace("https://b.example.com/api/v1", "demo"),
  )
})

test("没绑定项目时回落到 default", () => {
  // 空串与纯空白也回落到 default，四个语言的 SDK 一致。
  for (const key of [undefined, "", "  "]) {
    assert.ok(
      analyticsNamespace("https://a.example.com/api/v1", key).endsWith("-default"),
      `projectKey=${JSON.stringify(key)}`,
    )
  }
})

test("同一份存储下，两个实例的队列互不可见", async () => {
  const storage = memoryStorage()
  const ns = (host) => analyticsNamespace(`https://${host}/api/v1`, "demo")

  const senderA = recordingSend()
  const a = new EventQueue(ns("a.example.com"), senderA.send, { storage, batchSize: 1 })
  a.track("only_a")
  await a.flush()

  const senderB = recordingSend()
  const b = new EventQueue(ns("b.example.com"), senderB.send, { storage, batchSize: 1 })
  await b.flush()

  assert.equal(senderA.calls[0].events[0].name, "only_a")
  assert.equal(senderB.calls.length, 0, "B 不该看到 A 的队列")
  assert.notEqual(a.currentDistinctId(), b.currentDistinctId(), "两个实例的标识应各自独立")
})

test("显式 namespace 选项覆盖算出来的那个", () => {
  const storage = memoryStorage()
  const q = new EventQueue("ignored", async () => {}, { storage, namespace: "fixed" })
  assert.equal(q.namespace, "fixed")
  q.track("a")
  assert.ok(storage.read("verhub.analytics.fixed.queue"))
})

test("换绑项目后队列按新命名空间重建，旧队列留在原处", async () => {
  const storage = memoryStorage()
  const sent = []
  const client = new VerhubClient({
    baseUrl: BASE_URL,
    projectKey: "first",
    analytics: { storage, batchSize: 99 },
    fetch: async (_url, init) => {
      sent.push(JSON.parse(init.body))
      return new Response("{}", { status: 202 })
    },
  })

  client.public.track("in_first")
  const firstNs = analyticsNamespace(BASE_URL, "first")
  assert.ok(storage.read(`verhub.analytics.${firstNs}.queue`), "第一批应落在 first 的命名空间")

  client.setProjectKey("second")
  client.public.track("in_second")
  await client.public.flush()

  const secondNs = analyticsNamespace(BASE_URL, "second")
  assert.notEqual(firstNs, secondNs)
  assert.deepEqual(
    sent.flatMap((p) => p.events.map((e) => e.name)),
    ["in_second"],
    "换绑后不该把旧项目的事件发进新项目",
  )
  assert.ok(storage.read(`verhub.analytics.${firstNs}.queue`), "旧队列应原地留着等补发")
})

// ---- 条款文档：实例级，不作用于绑定项目 ----

test("条款文档接口打到实例级路径，不带 projectKey", async () => {
  const urls = []
  // 没有绑定 projectKey 也能调，条款是实例级的。
  const client = new VerhubClient({
    baseUrl: BASE_URL,
    fetch: async (url) => {
      urls.push(url)
      return new Response("{}", { status: 200 })
    },
  })

  await client.public.listTerms()
  await client.public.getTerms("privacy-policy")

  assert.deepEqual(urls, [`${BASE_URL}/public/terms`, `${BASE_URL}/public/terms/privacy-policy`])
})

test("管理端条款方法带上凭据并打到 /admin/terms/documents", async () => {
  const seen = []
  const client = new VerhubClient({
    baseUrl: BASE_URL,
    token: "vh_test",
    fetch: async (url, init) => {
      seen.push({ url, method: init.method, auth: init.headers.Authorization })
      return new Response("{}", { status: 200 })
    },
  })

  await client.admin.listTermsDocuments()
  await client.admin.updateTermsDocument("sdk-compliance", { custom: true, content: "# x" })
  await client.admin.resetTermsDocument("sdk-compliance")

  assert.deepEqual(
    seen.map((r) => `${r.method} ${r.url}`),
    [
      `GET ${BASE_URL}/admin/terms/documents`,
      `PUT ${BASE_URL}/admin/terms/documents/sdk-compliance`,
      `DELETE ${BASE_URL}/admin/terms/documents/sdk-compliance`,
    ],
  )
  assert.ok(seen.every((r) => r.auth === "Bearer vh_test"))
})
