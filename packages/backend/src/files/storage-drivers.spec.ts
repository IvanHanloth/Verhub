import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parseRange } from "./dist.controller"
import { parsePropfindLengths, WebdavStorageDriver } from "./storage-drivers"

const BASE = "https://dav.test/root"

/** 内存 WebDAV：请求体超过 bodyLimit 时模仿 WAF 返回 200 HTML 拦截页且不落盘。 */
function mockWebdav(
  options: { bodyLimit?: number; ignoreRange?: boolean; gzipUnlessIdentity?: boolean } = {},
) {
  const files = new Map<string, Buffer>()
  const collections = new Set<string>([`${BASE}/`])
  const requests: Array<{ method: string; url: string; bytes: number }> = []

  const spy = jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = decodeURI(String(input))
    const method = init?.method ?? "GET"
    const headers = new Headers(init?.headers)
    let body = Buffer.alloc(0)
    if (init?.body) {
      body = Buffer.from(await new Response(init.body as BodyInit).arrayBuffer())
    }
    requests.push({ method, url, bytes: body.length })

    if (method === "MKCOL") {
      if (collections.has(url)) {
        return new Response(null, { status: 405 })
      }
      collections.add(url)
      return new Response(null, { status: 201 })
    }
    if (method === "PUT") {
      if (options.bodyLimit !== undefined && body.length > options.bodyLimit) {
        return new Response("<html><title>Nginx缓冲区溢出</title></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
      }
      files.set(url, body)
      return new Response(null, { status: 201 })
    }
    if (method === "PROPFIND" && headers.get("depth") === "0") {
      const file = files.get(url)
      if (!file) {
        return new Response("Not Found", { status: 404 })
      }
      const xml = `<d:multistatus xmlns:d="DAV:"><d:response><d:href>${new URL(url).pathname}</d:href><d:propstat><d:prop><d:getcontentlength>${file.length}</d:getcontentlength></d:prop></d:propstat></d:response></d:multistatus>`
      return new Response(xml, { status: 207 })
    }
    if (method === "PROPFIND") {
      const entries = [...files.entries()].filter(([key]) => key.startsWith(url))
      const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>${new URL(url).pathname}</d:href></d:response>${entries
        .map(
          ([key, value]) =>
            `<d:response><d:href>${new URL(key).pathname}</d:href><d:propstat><d:prop><d:getcontentlength>${value.length}</d:getcontentlength></d:prop></d:propstat></d:response>`,
        )
        .join("")}</d:multistatus>`
      return new Response(xml, { status: 207, headers: { "Content-Type": "application/xml" } })
    }
    if (method === "DELETE") {
      for (const key of [...files.keys()]) {
        if (key.startsWith(url)) {
          files.delete(key)
        }
      }
      return new Response(null, { status: 204 })
    }

    const file = files.get(url)
    if (!file) {
      return new Response("Not Found", { status: 404 })
    }
    const compressed = options.gzipUnlessIdentity && headers.get("accept-encoding") !== "identity"
    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { "Content-Length": compressed ? "23" : String(file.length) },
      })
    }
    const range = headers.get("range")
    const match = range && !options.ignoreRange ? /bytes=(\d+)-(\d+)/.exec(range) : null
    if (match) {
      const slice = file.subarray(Number(match[1]), Number(match[2]) + 1)
      return new Response(new Uint8Array(slice), { status: 206 })
    }
    return new Response(new Uint8Array(file), { status: 200 })
  })

  return { files, requests, restore: () => spy.mockRestore() }
}

async function collect(iterable: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of iterable) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

describe("WebdavStorageDriver", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "verhub-dav-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function stage(content: Buffer): Promise<string> {
    const path = join(dir, "staged")
    await writeFile(path, content)
    return path
  }

  const key = "f/app/abc123/Setup.exe"
  const content = Buffer.from(Array.from({ length: 300 * 1024 + 17 }, (_, i) => i % 251))

  it("rejects a 200 HTML block page instead of treating it as success", async () => {
    const dav = mockWebdav({ bodyLimit: 100 * 1024 })
    try {
      const driver = new WebdavStorageDriver({ baseUrl: BASE, username: "u", password: "p" })
      await expect(driver.put(key, await stage(content), content.length)).rejects.toThrow(
        /HTML.*Nginx缓冲区溢出/,
      )
    } finally {
      dav.restore()
    }
  })

  it("splits large files into parts under the body limit and reads any range back", async () => {
    const dav = mockWebdav({ bodyLimit: 100 * 1024 })
    try {
      const driver = new WebdavStorageDriver({
        baseUrl: BASE,
        username: "u",
        password: "p",
        partSize: 64 * 1024,
      })
      const result = await driver.put(key, await stage(content), content.length)

      expect(result).toEqual({ partSize: 64 * 1024 })
      const puts = dav.requests.filter((request) => request.method === "PUT")
      expect(puts).toHaveLength(5)
      expect(Math.max(...puts.map((request) => request.bytes))).toBeLessThanOrEqual(64 * 1024)
      expect(dav.files.has(`${BASE}/f/app/abc123/parts/000004`)).toBe(true)

      const total = content.length
      expect(await collect(driver.readParts(key, 64 * 1024, total, 0, total - 1))).toEqual(content)
      expect(await collect(driver.readParts(key, 64 * 1024, total, 65530, 131080))).toEqual(
        content.subarray(65530, 131081),
      )
      expect(await collect(driver.readParts(key, 64 * 1024, total, total - 5, total - 1))).toEqual(
        content.subarray(total - 5),
      )
    } finally {
      dav.restore()
    }
  })

  it("slices locally when the server ignores Range", async () => {
    const dav = mockWebdav({ ignoreRange: true })
    try {
      const driver = new WebdavStorageDriver({
        baseUrl: BASE,
        username: null,
        password: null,
        partSize: 64 * 1024,
      })
      await driver.put(key, await stage(content), content.length)
      expect(
        await collect(driver.readParts(key, 64 * 1024, content.length, 70000, 200000)),
      ).toEqual(content.subarray(70000, 200001))
    } finally {
      dav.restore()
    }
  })

  it("stores files not larger than the part size as a single object", async () => {
    const dav = mockWebdav()
    try {
      const small = Buffer.from("hello")
      const driver = new WebdavStorageDriver({
        baseUrl: BASE,
        username: null,
        password: null,
        partSize: 64 * 1024,
      })
      expect(await driver.put(key, await stage(small), small.length)).toEqual({ partSize: null })
      expect(dav.files.get(`${BASE}/${key}`)).toEqual(small)
    } finally {
      dav.restore()
    }
  })

  it("reports a failed large write in the probe and suggests a part size", async () => {
    const dav = mockWebdav({ bodyLimit: 512 * 1024 })
    try {
      const driver = new WebdavStorageDriver({ baseUrl: BASE, username: null, password: null })
      const result = await driver.probe()
      expect(result.ok).toBe(true)
      expect(result.range_supported).toBe(true)
      expect(result.large_write_ok).toBe(false)
      expect(result.error).toMatch(/分片大小/)
    } finally {
      dav.restore()
    }
  })
})

describe("WebdavStorageDriver with gzip enabled on the server", () => {
  it("verifies writes by PROPFIND and reads with identity encoding", async () => {
    const dav = mockWebdav({ gzipUnlessIdentity: true })
    const dir = await mkdtemp(join(tmpdir(), "verhub-dav-gzip-"))
    try {
      const content = Buffer.alloc(4096, 7)
      const path = join(dir, "staged")
      await writeFile(path, content)
      const driver = new WebdavStorageDriver({ baseUrl: BASE, username: null, password: null })

      await expect(driver.put("f/a/b/c.bin", path, content.length)).resolves.toEqual({
        partSize: null,
      })
      const head = await driver.request("f/a/b/c.bin", { method: "HEAD" })
      expect(head.headers.get("content-length")).toBe("4096")
    } finally {
      dav.restore()
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("parsePropfindLengths", () => {
  it("reads names and lengths with any namespace prefix", () => {
    const xml = `<D:multistatus xmlns:D="DAV:"><D:response><D:href>/dav/parts/</D:href></D:response><D:response><D:href>/dav/parts/000000</D:href><D:propstat><D:prop><D:getcontentlength>65536</D:getcontentlength></D:prop></D:propstat></D:response><D:response><D:href>/dav/parts/%E4%B8%AD</D:href></D:response></D:multistatus>`
    const lengths = parsePropfindLengths(xml)
    expect(lengths.get("000000")).toBe(65536)
    expect(lengths.get("中")).toBeNull()
  })
})

describe("parseRange", () => {
  it.each([
    ["bytes=0-9", 100, { start: 0, end: 9 }],
    ["bytes=90-", 100, { start: 90, end: 99 }],
    ["bytes=-10", 100, { start: 90, end: 99 }],
    ["bytes=50-500", 100, { start: 50, end: 99 }],
    ["bytes=100-", 100, "unsatisfiable"],
    ["bytes=0-1,5-9", 100, null],
    ["items=0-1", 100, null],
  ])("%s of %d", (header, total, expected) => {
    expect(parseRange(header, total)).toEqual(expected)
  })
})
