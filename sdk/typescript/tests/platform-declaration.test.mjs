// 平台声明与系统版本明细的行为约定。
//
// 这套断言在四个语言的 SDK 里是同一份，改一处务必同步其余三处：
// sdk/rust/src/http.rs、sdk/python/tests/、sdk/vanilla-js/。
//
// 跑在构建产物 dist 上（`npm run build` 之后），断言的是真正发出去的请求头，
// 而不是客户端的内部字段。只用 Node 内建的 node:test，不引入测试依赖。

import assert from "node:assert/strict"
import test from "node:test"

import {
  detectPlatform,
  detectPlatformVersion,
  PLATFORM_HEADER,
  PLATFORM_VERSION_HEADER,
  sanitizePlatformVersion,
  VerhubClient,
} from "../dist/index.js"

const BASE_URL = "https://example.com/api/v1"

// 用错编码读 `cmd /C ver` 会得到的串：GBK 的「版本」被当成 UTF-8 解，首字节变成
// 替换字符、次两字节恰好凑成一个合法的汉字。
const MOJIBAKE = "Microsoft Windows [�汾 10.0.26200.8875]"

/**
 * 发一次请求，返回真正带上的两个来源声明头。
 *
 * 桩 fetch 直接构造 Headers——非 ISO-8859-1 的值在这一步就会抛，正是真实 fetch
 * 的失败方式，所以「请求能发出去」本身就是一条断言。
 */
async function sentHeaders(options) {
  let captured
  const client = new VerhubClient({
    baseUrl: BASE_URL,
    ...options,
    fetch: async (_url, init) => {
      captured = new Headers(init.headers)
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    },
  })
  await client.health()
  return {
    platform: captured.get(PLATFORM_HEADER),
    version: captured.get(PLATFORM_VERSION_HEADER),
  }
}

test("清洗剔掉乱码但留下版本号", () => {
  assert.equal(sanitizePlatformVersion(MOJIBAKE), "Microsoft Windows [ 10.0.26200.8")
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
})

test("显式声明平台后版本仍自动探测并带上", async () => {
  const { platform, version } = await sentHeaders({ platform: "windows" })
  assert.equal(platform, "windows")
  assert.equal(version, detectPlatformVersion() || null)
})

test("什么都不给时两者都自动探测并带上", async () => {
  const { platform, version } = await sentHeaders({})
  assert.equal(platform, detectPlatform())
  assert.equal(version, detectPlatformVersion() || null)
})

test("显式给的版本优先，且同样过清洗", async () => {
  const { version } = await sentHeaders({ platformVersion: "  Windows� 11  " })
  assert.equal(version, "Windows 11")
})

test("乱码版本不会让请求失败，只会被洗干净", async () => {
  const { version } = await sentHeaders({ platformVersion: MOJIBAKE })
  assert.equal(version, "Microsoft Windows [ 10.0.26200.8")
})

test("platform: null 是明确的退出声明，两个头都不发", async () => {
  const { platform, version } = await sentHeaders({ platform: null })
  assert.equal(platform, null)
  assert.equal(version, null)
})

test("退出声明仍尊重显式给的版本", async () => {
  const { platform, version } = await sentHeaders({
    platform: null,
    platformVersion: "ubuntu 24.04",
  })
  assert.equal(platform, null)
  assert.equal(version, "ubuntu 24.04")
})

test("setter 同样清洗", async () => {
  let captured
  const client = new VerhubClient({
    baseUrl: BASE_URL,
    fetch: async (_url, init) => {
      captured = new Headers(init.headers)
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    },
  })
  client.setPlatformVersion(MOJIBAKE)
  await client.health()
  assert.equal(captured.get(PLATFORM_VERSION_HEADER), "Microsoft Windows [ 10.0.26200.8")

  client.setPlatformVersion("版本")
  await client.health()
  assert.equal(captured.get(PLATFORM_VERSION_HEADER), null, "洗完是空串就不发这个头")
})

test("探测值本身可以直接进请求头", () => {
  for (const value of [detectPlatform(), detectPlatformVersion()]) {
    assert.doesNotThrow(() => new Headers({ [PLATFORM_VERSION_HEADER]: value }))
    assert.ok(/^[\x20-\x7e]*$/.test(value), JSON.stringify(value))
  }
  assert.ok(detectPlatformVersion().length <= 32)
})
