// 客户端本地时间头（x-verhub-client-time）的行为约定。
//
// 四个语言的 SDK 断言同一套形状，改一处务必同步其余三处：
// sdk/rust/src/http.rs、sdk/python/tests/、sdk/vanilla-js/。
//
// 跑在构建产物 dist 上（`npm run build` 之后）。

import assert from "node:assert/strict"
import test from "node:test"

import { CLIENT_TIME_HEADER, formatClientTime, VerhubClient } from "../dist/index.js"

const BASE_URL = "https://example.com/api/v1"
const SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/

/** 进程当前时区的偏移，写成 ±HH:MM。 */
function localOffset() {
  const minutes = -new Date().getTimezoneOffset()
  const abs = Math.abs(minutes)
  const pad = (n) => String(n).padStart(2, "0")
  return `${minutes < 0 ? "-" : "+"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** 在指定时区下执行；Node 在赋值 TZ 后会重读时区。 */
function withTz(tz, fn) {
  const saved = process.env.TZ
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    if (saved === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = saved
    }
  }
}

function recordingClient(options, responses = []) {
  const seen = []
  const client = new VerhubClient({
    baseUrl: BASE_URL,
    projectKey: "demo",
    ...options,
    fetch: async (_url, init) => {
      seen.push(new Headers(init.headers).get(CLIENT_TIME_HEADER))
      const status = responses.shift() ?? 200
      return new Response("{}", { status, headers: { "content-type": "application/json" } })
    },
  })
  return { client, seen }
}

test("默认带上本地时间头，形状合规、偏移等于本机时区、时刻准确", async () => {
  const { client, seen } = recordingClient({})
  const before = Date.now()
  await client.health()
  const after = Date.now()

  const value = seen[0]
  assert.match(value, SHAPE)
  assert.equal(value.slice(-6), localOffset())
  const instant = Date.parse(value)
  assert.ok(instant >= before && instant <= after, `${value} 不在 [${before}, ${after}] 内`)
})

test("管理接口同样带上", async () => {
  const { client, seen } = recordingClient({ token: "t" })
  await client.admin.listProjects().catch(() => {})
  assert.match(seen[0] ?? "", SHAPE)
})

test("sendClientTime: false 时不发", async () => {
  const { client, seen } = recordingClient({ sendClientTime: false })
  await client.health()
  assert.deepEqual(seen, [null])
})

test("重试时现取而不是沿用首发的值", async () => {
  const { client, seen } = recordingClient({}, [503, 200])
  await client.health()
  assert.equal(seen.length, 2)
  for (const value of seen) {
    assert.match(value, SHAPE)
  }
  assert.ok(Date.parse(seen[1]) > Date.parse(seen[0]), `${seen[0]} -> ${seen[1]}`)
})

test("UTC 写成 +00:00 而不是 Z", () => {
  const value = withTz("UTC", () => formatClientTime(new Date(Date.UTC(2026, 8, 24, 2, 0, 0, 5))))
  assert.equal(value, "2026-09-24T02:00:00.005+00:00")
})

test("东西半球与非整点偏移都按本地墙钟加偏移输出", () => {
  const instant = new Date(Date.UTC(2026, 8, 24, 2, 0, 0, 123))
  const cases = [
    ["Asia/Shanghai", "2026-09-24T10:00:00.123+08:00"],
    ["Asia/Kathmandu", "2026-09-24T07:45:00.123+05:45"],
    ["America/St_Johns", "2026-09-23T23:30:00.123-02:30"],
    ["America/Los_Angeles", "2026-09-23T19:00:00.123-07:00"],
  ]
  for (const [tz, expected] of cases) {
    const value = withTz(tz, () => formatClientTime(instant))
    assert.equal(value, expected, tz)
    assert.equal(Date.parse(value), instant.getTime(), tz)
  }
})

test("无效时刻返回 null 而不是抛错", () => {
  assert.equal(formatClientTime(new Date(Number.NaN)), null)
})
