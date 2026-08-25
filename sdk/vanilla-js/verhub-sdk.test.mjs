// 平台声明与系统版本明细的行为约定。
//
// 这套断言在四个语言的 SDK 里是同一份，改一处务必同步其余三处：
// sdk/rust/src/http.rs、sdk/python/tests/、sdk/typescript/tests/。
//
// 只用 Node 内建的 node:test，不引入测试依赖：node --test sdk/vanilla-js

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { OUTPUT_PATH, render, SOURCE_PATH } from "./build.mjs"
import {
  analyticsNamespace,
  detectPlatform,
  detectPlatformVersion,
  EventQueue,
  fnv1a32Hex,
  memoryStorage,
  originOf,
  sanitizePlatformVersion,
  VerhubClient,
} from "./verhub-sdk.js"

const BASE_URL = "https://example.com/api/v1"

// 用错编码读 `cmd /C ver` 会得到的串：GBK 的「版本」被当成 UTF-8 解，首字节变成
// 替换字符、次两字节恰好凑成一个合法的汉字。
const MOJIBAKE = "Microsoft Windows [�汾 10.0.26200.8875]"

/** fetch 只接受 ISO-8859-1 的头值，非法值会让整个请求抛 TypeError。 */
function assertHeaderSafe(value) {
  assert.doesNotThrow(() => new Headers({ "x-verhub-platform-version": value }), `${value}`)
}

/** 取客户端内部记下的来源声明（HttpClient 是私有的，从 client 上读）。 */
function declaration(options) {
  const client = new VerhubClient({ baseUrl: BASE_URL, ...options })
  return { platform: client.http.platform, version: client.http.platformVersion }
}

test("清洗剔掉乱码但留下版本号", () => {
  const cleaned = sanitizePlatformVersion(MOJIBAKE)
  assert.equal(cleaned, "Microsoft Windows [ 10.0.26200.8")
  assertHeaderSafe(cleaned)
})

test("清洗折叠空白并去首尾", () => {
  assert.equal(sanitizePlatformVersion("  ubuntu\t\n 24.04  "), "ubuntu 24.04")
  assert.equal(sanitizePlatformVersion("11"), "11")
})

test("清洗按服务端上限截断", () => {
  assert.equal(sanitizePlatformVersion("9".repeat(100)).length, 32)
})

test("什么都没剩下时清洗结果为空串", () => {
  assert.equal(sanitizePlatformVersion("版本"), "")
  assert.equal(sanitizePlatformVersion("   "), "")
})

test("清洗去掉控制字符（否则构成响应头注入）", () => {
  const cleaned = sanitizePlatformVersion("11\r\nX-Injected: 1")
  assert.ok(!cleaned.includes("\r") && !cleaned.includes("\n"), cleaned)
  assertHeaderSafe(cleaned)
})

test("显式声明平台后版本仍自动探测", () => {
  const { platform, version } = declaration({ platform: "windows" })
  assert.equal(platform, "windows")
  assert.equal(version, detectPlatformVersion() || null)
})

test("什么都不给时两者都自动探测", () => {
  const { platform, version } = declaration({})
  assert.equal(platform, detectPlatform())
  assert.equal(version, detectPlatformVersion() || null)
})

test("显式给的版本优先，且同样过清洗", () => {
  const { version } = declaration({ platformVersion: "  Windows� 11  " })
  assert.equal(version, "Windows 11")
})

test("platform: null 是明确的退出声明，版本一并不报", () => {
  const { platform, version } = declaration({ platform: null })
  assert.equal(platform, null)
  assert.equal(version, null)
})

test("退出声明仍尊重显式给的版本", () => {
  const { platform, version } = declaration({ platform: null, platformVersion: "ubuntu 24.04" })
  assert.equal(platform, null)
  assert.equal(version, "ubuntu 24.04")
})

test("setter 同样清洗", () => {
  const client = new VerhubClient({ baseUrl: BASE_URL })
  client.setPlatformVersion(MOJIBAKE)
  assert.equal(client.http.platformVersion, "Microsoft Windows [ 10.0.26200.8")
  client.setPlatformVersion("版本")
  assert.equal(client.http.platformVersion, null, "洗完是空串应收敛成 null")
})

test("探测值本身可以直接进请求头", () => {
  for (const value of [detectPlatform(), detectPlatformVersion()]) {
    assertHeaderSafe(value)
    assert.ok(/^[\x20-\x7e]*$/.test(value), JSON.stringify(value))
  }
  assert.ok(detectPlatformVersion().length <= 32)
})

// ---- 事件采集队列 ----
//
// 这套断言与 sdk/typescript/tests/analytics.test.mjs 是同一份，改一处务必同步。

function recordingSend() {
  const calls = []
  let failing = false
  return {
    calls,
    send: async (payload) => {
      calls.push(payload)
      if (failing) throw new Error("network down")
      return { accepted: payload.events.length, skipped: 0, suppressed: false }
    },
    fail: () => {
      failing = true
    },
    recover: () => {
      failing = false
    },
  }
}

test("track 入队后立即返回，不阻塞调用方", () => {
  const sender = recordingSend()
  const q = new EventQueue("t", sender.send, { storage: memoryStorage(), flushIntervalMs: 5 })
  q.track("app_opened")
  assert.equal(sender.calls.length, 0)
})

test("攒够 batchSize 立即发送", async () => {
  const sender = recordingSend()
  const q = new EventQueue("t", sender.send, { storage: memoryStorage(), batchSize: 2 })
  q.track("a")
  q.track("b")
  await q.flush()
  assert.equal(sender.calls.length, 1)
  assert.equal(sender.calls[0].events.length, 2)
})

test("每条事件带唯一的幂等键，失败后用同样的键重发", async () => {
  const sender = recordingSend()
  const q = new EventQueue("t", sender.send, { storage: memoryStorage(), batchSize: 1 })

  sender.fail()
  q.track("a")
  await q.flush()
  const firstId = sender.calls[0].events[0].event_id

  sender.recover()
  await q.flush()
  assert.equal(sender.calls[1].events[0].event_id, firstId)
})

test("持久化存储让 distinct_id 跨实例保持一致", () => {
  const storage = memoryStorage()
  const id = new EventQueue("t", async () => {}, { storage }).currentDistinctId()
  assert.equal(new EventQueue("t", async () => {}, { storage }).currentDistinctId(), id)
})

test("persistence: none 不写入任何本地状态", () => {
  const storage = memoryStorage()
  const q = new EventQueue("t", async () => {}, { persistence: "none", storage })
  q.track("a")
  assert.equal(storage.read("verhub.analytics.t.distinct_id"), null)
  assert.equal(storage.read("verhub.analytics.t.queue"), null)
})

test("requireConsent 在同意之前一个字节都不写、一条都不采", async () => {
  const storage = memoryStorage()
  const sender = recordingSend()
  const q = new EventQueue("t", sender.send, { requireConsent: true, storage })

  q.track("a")
  await q.flush()
  assert.equal(sender.calls.length, 0)
  assert.equal(storage.read("verhub.analytics.t.distinct_id"), null)

  q.grantConsent()
  q.track("b")
  await q.flush()
  assert.equal(sender.calls.length, 1)
})

test("optOut 清空队列、删除本地标识并持久化退出标记", async () => {
  const storage = memoryStorage()
  const sender = recordingSend()
  const q = new EventQueue("t", sender.send, { storage })

  q.track("a")
  q.optOut()
  await q.flush()

  assert.equal(sender.calls.length, 0)
  assert.equal(storage.read("verhub.analytics.t.distinct_id"), null)
  assert.equal(storage.read("verhub.analytics.t.opt_out"), "1")
})

test("退出标记在重启后仍然生效", () => {
  const storage = memoryStorage()
  new EventQueue("t", async () => {}, { storage }).optOut()
  const restarted = new EventQueue("t", async () => {}, { storage })
  assert.equal(restarted.hasOptedOut(), true)
  assert.equal(restarted.active(), false)
})

test("optIn 生成新的匿名标识，不复用退出前的那个", () => {
  const storage = memoryStorage()
  const q = new EventQueue("t", async () => {}, { storage })
  const before = q.currentDistinctId()
  q.optOut()
  q.optIn()
  assert.notEqual(q.currentDistinctId(), before)
})

test("队列超出上限时丢最旧的", async () => {
  const sender = recordingSend()
  const q = new EventQueue("t", sender.send, {
    storage: memoryStorage(),
    maxQueueSize: 2,
    batchSize: 10,
  })
  q.track("a")
  q.track("b")
  q.track("c")
  await q.flush()
  assert.deepEqual(
    sender.calls[0].events.map((e) => e.name),
    ["b", "c"],
  )
})

test("重启后把上次没发出去的事件补发上来", async () => {
  const storage = memoryStorage()
  const sender = recordingSend()

  sender.fail()
  const first = new EventQueue("t", sender.send, { storage, batchSize: 1 })
  first.track("a")
  await first.flush()
  sender.recover()

  const restarted = new EventQueue("t", sender.send, { storage, batchSize: 1 })
  await restarted.flush()
  assert.equal(sender.calls.at(-1).events[0].name, "a")
})

test("客户端把 track 暴露在 public 命名空间上", () => {
  const client = new VerhubClient({
    baseUrl: BASE_URL,
    projectKey: "demo",
    analytics: { storage: memoryStorage() },
    fetch: async () => new Response("{}", { status: 202 }),
  })
  for (const method of [
    "track",
    "flush",
    "optOut",
    "optIn",
    "grantConsent",
    "resetIdentity",
    "exportMyData",
    "deleteMyData",
  ]) {
    assert.equal(typeof client.public[method], "function", method)
  }
})

// ---- 页面卸载时的兜底发送 ----
//
// 定时器在标签页被关掉时不会再触发，攒着不满一批的事件只能靠 sendBeacon 送出去。
// 与 sdk/typescript/tests/analytics.test.mjs 是同一份断言。

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

  await q.flush()
  assert.equal(sender.calls.length, 1)
  assert.equal(sender.calls[0].events[0].name, "a")
})

test("退出状态下 flushBeacon 什么都不发", () => {
  const beacon = recordingBeacon()
  const q = new EventQueue("t", async () => {}, { storage: memoryStorage() }, beacon.beacon)

  q.track("a")
  q.optOut()
  q.flushBeacon()

  assert.equal(beacon.calls.length, 0)
})

test("没有 beacon 实现时 flushBeacon 是空操作", async () => {
  const sender = recordingSend()
  const q = new EventQueue("t", sender.send, { storage: memoryStorage() })

  q.track("a")
  q.flushBeacon()

  await q.flush()
  assert.equal(sender.calls.length, 1)
})

// ---- 命名空间：按自部署实例隔离 ----
//
// 这组固定向量在 TS / Python / Rust 版里逐字相同。四个语言必须为同一个实例算出
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

test("verhub-sdk.global.js 与 ESM 源保持同步", () => {
  const { output } = render(readFileSync(SOURCE_PATH, "utf8"))
  assert.equal(
    readFileSync(OUTPUT_PATH, "utf8").replace(/\r\n/g, "\n"),
    output.replace(/\r\n/g, "\n"),
    "生成物已过期，跑一次 `npm run build`（在 sdk/vanilla-js 下）",
  )
})

test("公开命名空间上有条款文档方法", () => {
  const client = new VerhubClient({ baseUrl: BASE_URL, fetch: async () => new Response("{}") })
  assert.equal(typeof client.public.listTerms, "function")
  assert.equal(typeof client.public.getTerms, "function")
  assert.equal(typeof client.admin.listTermsDocuments, "function")
  assert.equal(typeof client.admin.updateTermsDocument, "function")
})

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
