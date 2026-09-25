// 项目语言管理与语言回落提示的请求 / 响应约定。
//
// 跑在构建产物 dist 上（`npm run build` 之后），断言的是真正发出去的请求。

import assert from "node:assert/strict"
import test from "node:test"

import { VerhubClient } from "../dist/index.js"

const BASE_URL = "https://example.com/api/v1"

/** 记下最后一次请求，并以 payload 作为 JSON 响应。 */
function stubClient(payload) {
  const calls = []
  const client = new VerhubClient({
    baseUrl: BASE_URL,
    projectKey: "demo",
    token: "tok",
    platform: null,
    fetch: async (url, init) => {
      calls.push({ url: String(url), method: init.method, body: init.body })
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    },
  })
  return { client, calls }
}

test("updateProjectLocale 以 PATCH 提交，语言路径段做 URL 编码", async () => {
  const item = { locale: "en-US", aliases: ["en"], label: null, created_at: 1 }
  const { client, calls } = stubClient(item)

  const result = await client.admin.updateProjectLocale("en (US)", {
    locale: "en-US",
    aliases: ["en"],
    label: null,
  })

  assert.deepEqual(result, item)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, "PATCH")
  assert.equal(calls[0].url, `${BASE_URL}/admin/projects/demo/locales/en%20(US)`)
  assert.deepEqual(JSON.parse(calls[0].body), { locale: "en-US", aliases: ["en"], label: null })
})

test("未命中语言时响应带 locale_message，命中时不带", async () => {
  const miss = stubClient({ id: "v1", locale: null, locale_message: "not registered" })
  const version = await miss.client.public.getLatestVersion({ locale: "en_US" })
  assert.equal(version.locale, null)
  assert.equal(version.locale_message, "not registered")
  assert.ok(miss.calls[0].url.endsWith("?locale=en_US"), miss.calls[0].url)

  const hit = stubClient({ id: "v1", locale: "en-US" })
  const matched = await hit.client.public.getLatestVersion({ locale: "en(US)" })
  assert.equal(matched.locale, "en-US")
  assert.equal(matched.locale_message, undefined)
})
