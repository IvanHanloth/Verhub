// 平台声明与系统版本明细的行为约定。
//
// 这套断言在四个语言的 SDK 里是同一份，改一处务必同步其余三处：
// sdk/rust/src/http.rs、sdk/python/tests/、sdk/typescript/tests/。
//
// 只用 Node 内建的 node:test，不引入测试依赖：node --test sdk/vanilla-js

import assert from "node:assert/strict"
import test from "node:test"

import {
  detectPlatform,
  detectPlatformVersion,
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
