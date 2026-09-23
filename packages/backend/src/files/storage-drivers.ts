/** 存储驱动：把暂存文件写入存储、删除、读取。 */

import { createReadStream } from "node:fs"
import { copyFile, mkdir, open, rename, rm, unlink } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { Readable } from "node:stream"

import { encodeObjectKey } from "./file-naming"
import { storageRoot } from "./files-config"

const CONTROL_TIMEOUT_MS = 15_000
/** 单个分片的写入超时。 */
const PART_TIMEOUT_MS = 120_000
/** 单个分片的写入重试次数。 */
const PART_RETRIES = 3
/** 分片并发写入数。 */
const PART_CONCURRENCY = 2
/** 连接测试中「大文件写入」的探测大小。 */
const LARGE_PROBE_BYTES = 2 * 1024 * 1024

export type StorageDriver = LocalStorageDriver | WebdavStorageDriver

/** 写入结果：partSize 为空表示整文件存放，否则为实际使用的分片大小。 */
export type PutResult = { partSize: number | null }

/** 连接测试的结果。 */
export type StorageProbeResult = {
  ok: boolean
  /** 读取时是否支持 Range；不支持时分片缓存与断点续传不可用。 */
  range_supported: boolean | null
  /** 单次写入 2MB（或分片大小）是否成功；为 false 时需要设置或调小分片大小。 */
  large_write_ok: boolean | null
  latency_ms: number
  error: string | null
}

/** 本机存储，文件位于 `{VERHUB_STORAGE_DIR}/objects/{objectKey}`。 */
export class LocalStorageDriver {
  readonly kind = "LOCAL" as const
  private readonly root = join(storageRoot(), "objects")

  /** objectKey 对应的绝对路径。越出根目录时抛错。 */
  resolvePath(objectKey: string): string {
    const target = resolve(this.root, ...objectKey.split("/"))
    const rel = relative(this.root, target)
    if (!rel || rel.startsWith("..") || rel.includes(`..${sep}`)) {
      throw new Error("Object key escapes storage root")
    }
    return target
  }

  /** 把 sourcePath 移入存储。调用后源文件不再存在。 */
  async put(objectKey: string, sourcePath: string): Promise<PutResult> {
    const target = this.resolvePath(objectKey)
    await mkdir(dirname(target), { recursive: true })
    try {
      await rename(sourcePath, target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
        throw error
      }
      await copyFile(sourcePath, target)
      await unlink(sourcePath)
    }
    return { partSize: null }
  }

  /** 删除文件及其所在的 `{fileId}` 目录，不存在视为成功。 */
  async remove(objectKey: string): Promise<void> {
    await rm(dirname(this.resolvePath(objectKey)), { recursive: true, force: true })
  }

  async probe(): Promise<StorageProbeResult> {
    const started = Date.now()
    try {
      await mkdir(this.root, { recursive: true })
      return {
        ok: true,
        range_supported: true,
        large_write_ok: true,
        latency_ms: Date.now() - started,
        error: null,
      }
    } catch (error) {
      return {
        ok: false,
        range_supported: null,
        large_write_ok: null,
        latency_ms: Date.now() - started,
        error: (error as Error).message,
      }
    }
  }
}

/**
 * WebDAV 存储。整文件存放在 `{baseUrl}/{objectKey}`；设置了分片大小且文件更大时，
 * 按分片存放在 objectKey 所在目录的 `parts/{六位序号}`，读取时由 {@link readParts} 拼接。
 */
export class WebdavStorageDriver {
  readonly kind = "WEBDAV" as const
  private readonly baseUrl: string
  private readonly authorization: string | null
  private readonly partSize: number | null
  private baseEnsured = false

  constructor(options: {
    baseUrl: string
    username: string | null
    password: string | null
    partSize?: number | null
  }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "")
    this.partSize = options.partSize ?? null
    this.authorization =
      options.username || options.password
        ? `Basic ${Buffer.from(`${options.username ?? ""}:${options.password ?? ""}`).toString("base64")}`
        : null
  }

  /** objectKey 对应的完整 URL。 */
  urlFor(objectKey: string): string {
    return `${this.baseUrl}/${encodeObjectKey(objectKey)}`
  }

  /** 第 index 个分片的对象路径。 */
  static partKey(objectKey: string, index: number): string {
    return `${objectKey.split("/").slice(0, -1).join("/")}/parts/${String(index).padStart(6, "0")}`
  }

  /** 上传本地文件到 objectKey，逐级创建父目录并校验写入结果。成功后删除源文件。 */
  async put(objectKey: string, sourcePath: string, size: number): Promise<PutResult> {
    await this.ensureBase()
    const segments = objectKey.split("/")
    for (let depth = 1; depth < segments.length; depth += 1) {
      await this.mkcol(segments.slice(0, depth).join("/"))
    }

    let result: PutResult
    if (this.partSize && size > this.partSize) {
      await this.putParts(objectKey, sourcePath, size, this.partSize)
      result = { partSize: this.partSize }
    } else {
      const body = Readable.toWeb(createReadStream(sourcePath)) as ReadableStream<Uint8Array>
      await this.putBody(objectKey, body, size, null)
      await this.verifyLength(objectKey, size)
      result = { partSize: null }
    }

    await unlink(sourcePath).catch(() => undefined)
    return result
  }

  /** 删除文件所在的 `{fileId}` 目录（含分片），不存在视为成功。 */
  async remove(objectKey: string): Promise<void> {
    const collection = objectKey.split("/").slice(0, -1).join("/")
    const response = await fetch(`${this.urlFor(collection)}/`, {
      method: "DELETE",
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
    })
    await response.body?.cancel()
    if (!response.ok && response.status !== 404) {
      throw new Error(`WebDAV DELETE failed with status ${response.status}`)
    }
  }

  /**
   * 读取对象。重定向由服务端跟随，不暴露给调用方。
   * 固定要求 `Accept-Encoding: identity`：服务端开了 gzip 时，压缩后的 Content-Length 与
   * Content-Range 和原始字节对不上。
   */
  async request(
    objectKey: string,
    init: { method: "GET" | "HEAD"; range?: string; signal?: AbortSignal },
  ): Promise<Response> {
    return fetch(this.urlFor(objectKey), {
      method: init.method,
      headers: {
        ...this.authHeaders(),
        "Accept-Encoding": "identity",
        ...(init.range ? { Range: init.range } : {}),
      },
      redirect: "follow",
      signal: init.signal,
    })
  }

  /**
   * 读取分片存放的文件中 [start, end] 字节（闭区间），按顺序产出数据块。
   * 只请求覆盖该区间的分片；服务端忽略 Range 时在本地截取。
   */
  async *readParts(
    objectKey: string,
    partSize: number,
    totalSize: number,
    start: number,
    end: number,
    signal?: AbortSignal,
  ): AsyncGenerator<Buffer> {
    const first = Math.floor(start / partSize)
    const last = Math.floor(end / partSize)

    for (let index = first; index <= last; index += 1) {
      const partStart = index * partSize
      const partLength = Math.min(partSize, totalSize - partStart)
      const from = Math.max(start, partStart) - partStart
      const to = Math.min(end, partStart + partLength - 1) - partStart
      const whole = from === 0 && to === partLength - 1

      const response = await this.request(WebdavStorageDriver.partKey(objectKey, index), {
        method: "GET",
        range: whole ? undefined : `bytes=${from}-${to}`,
        signal,
      })
      if ((response.status !== 200 && response.status !== 206) || !response.body) {
        await response.body?.cancel()
        throw new Error(`WebDAV part ${index} returned status ${response.status}`)
      }

      let skip = response.status === 200 ? from : 0
      let remaining = to - from + 1
      for await (const raw of response.body as unknown as AsyncIterable<Uint8Array>) {
        let chunk = Buffer.from(raw)
        if (skip > 0) {
          const dropped = Math.min(skip, chunk.length)
          chunk = chunk.subarray(dropped)
          skip -= dropped
        }
        if (chunk.length === 0) {
          continue
        }
        if (chunk.length > remaining) {
          chunk = chunk.subarray(0, remaining)
        }
        remaining -= chunk.length
        yield chunk
        if (remaining === 0) {
          break
        }
      }
      if (remaining > 0) {
        throw new Error(`WebDAV part ${index} ended ${remaining} bytes early`)
      }
    }
  }

  /**
   * 写入一个探测文件、按 Range 读回、再写入一个 2MB（设置了分片时为分片大小）的文件，最后删除。
   * 大文件写入失败时 ok 仍为 true，large_write_ok 为 false 并在 error 中给出原因。
   */
  async probe(): Promise<StorageProbeResult> {
    const started = Date.now()
    const stamp = Date.now().toString(36)
    const key = `.verhub-probe/${stamp}.txt`
    const largeKey = `.verhub-probe/${stamp}.bin`
    const content = "verhub-storage-probe"
    let rangeSupported: boolean | null = null

    try {
      this.baseEnsured = false
      await this.ensureBase()
      await this.mkcol(".verhub-probe")
      await this.putBody(key, content, Buffer.byteLength(content), CONTROL_TIMEOUT_MS)

      const read = await this.request(key, {
        method: "GET",
        range: "bytes=7-13",
        signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
      })
      const text = await read.text()
      if (!read.ok) {
        throw new Error(`读取失败，状态码 ${read.status}`)
      }
      rangeSupported = read.status === 206 && text === content.slice(7, 14)
      await this.deleteObject(key)
    } catch (error) {
      return {
        ok: false,
        range_supported: rangeSupported,
        large_write_ok: null,
        latency_ms: Date.now() - started,
        error: describeFetchError(error),
      }
    }

    const largeSize = this.partSize ?? LARGE_PROBE_BYTES
    let largeError: string | null = null
    try {
      await this.putBody(largeKey, Buffer.alloc(largeSize, 0x5a), largeSize, PART_TIMEOUT_MS)
      await this.verifyLength(largeKey, largeSize)
    } catch (error) {
      largeError = describeFetchError(error)
    }
    await this.deleteObject(largeKey).catch(() => undefined)

    return {
      ok: true,
      range_supported: rangeSupported,
      large_write_ok: largeError === null,
      latency_ms: Date.now() - started,
      error: largeError
        ? `单次写入 ${formatSize(largeSize)} 失败：${largeError}。服务端可能限制了单次请求体大小（如宝塔 WAF），请设置或调小分片大小`
        : null,
    }
  }

  /** 按分片写入，并用 PROPFIND（不支持时逐个 HEAD）校验每个分片的长度。 */
  private async putParts(
    objectKey: string,
    sourcePath: string,
    size: number,
    partSize: number,
  ): Promise<void> {
    const collection = `${objectKey.split("/").slice(0, -1).join("/")}/parts`
    await this.mkcol(collection)

    const count = Math.ceil(size / partSize)
    const handle = await open(sourcePath, "r")
    try {
      let next = 0
      const worker = async () => {
        while (next < count) {
          const index = next
          next += 1
          const length = Math.min(partSize, size - index * partSize)
          const buffer = Buffer.alloc(length)
          await handle.read(buffer, 0, length, index * partSize)
          await this.putPartWithRetry(WebdavStorageDriver.partKey(objectKey, index), buffer)
        }
      }
      await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, count) }, worker))
    } finally {
      await handle.close()
    }

    await this.verifyParts(objectKey, collection, size, partSize, count)
  }

  private async putPartWithRetry(key: string, buffer: Buffer): Promise<void> {
    let lastError: unknown = null
    for (let attempt = 0; attempt < PART_RETRIES; attempt += 1) {
      try {
        await this.putBody(key, buffer, buffer.length, PART_TIMEOUT_MS)
        return
      } catch (error) {
        lastError = error
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000 * 2 ** attempt))
      }
    }
    throw lastError
  }

  /** PUT 一个请求体。非 2xx，或以 200 返回 HTML 页面（WAF / 网关拦截页）时抛错。 */
  private async putBody(
    key: string,
    body: ReadableStream<Uint8Array> | Buffer | string,
    size: number,
    timeoutMs: number | null,
  ): Promise<void> {
    const response = await fetch(this.urlFor(key), {
      method: "PUT",
      headers: {
        ...this.authHeaders(),
        "Content-Length": String(size),
        "Content-Type": "application/octet-stream",
      },
      body,
      ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    } as RequestInit)
    const contentType = response.headers.get("content-type") ?? ""
    const text = await response.text().catch(() => "")
    if (!response.ok) {
      throw new Error(`WebDAV PUT failed with status ${response.status}${htmlTitle(text)}`)
    }
    if (contentType.includes("text/html") && /<html|<!doctype/i.test(text)) {
      throw new Error(`WebDAV PUT 返回了 HTML 页面，疑似被 WAF 或网关拦截${htmlTitle(text)}`)
    }
  }

  /**
   * 写入后校验长度：优先用 PROPFIND（Depth: 0）的 getcontentlength，
   * 服务端不支持 PROPFIND 时退回 HEAD。文件不存在或长度不符时抛错。
   */
  private async verifyLength(key: string, size: number): Promise<void> {
    const propfind = await fetch(this.urlFor(key), {
      method: "PROPFIND",
      headers: { ...this.authHeaders(), Depth: "0", "Content-Type": "application/xml" },
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
    })
    const text = await propfind.text().catch(() => "")
    if (propfind.status === 404) {
      throw new Error("写入后读取不到文件（PROPFIND 404），写入可能被 WAF 或网关拦截")
    }
    if (propfind.status === 207) {
      const length = [...parsePropfindLengths(text).values()][0]
      if (length !== undefined && length !== null && length !== size) {
        throw new Error(`WebDAV stored ${length} bytes, expected ${size}`)
      }
      if (length !== undefined) {
        return
      }
    }

    const head = await this.request(key, {
      method: "HEAD",
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
    })
    if (!head.ok) {
      throw new Error(`写入后读取不到文件（HEAD 状态码 ${head.status}），写入可能被 WAF 或网关拦截`)
    }
    const header = head.headers.get("content-length")
    if (header !== null && Number(header) !== size) {
      throw new Error(`WebDAV stored ${header} bytes, expected ${size}`)
    }
  }

  private async verifyParts(
    objectKey: string,
    collection: string,
    size: number,
    partSize: number,
    count: number,
  ): Promise<void> {
    const expected = (index: number) => Math.min(partSize, size - index * partSize)
    const response = await fetch(`${this.urlFor(collection)}/`, {
      method: "PROPFIND",
      headers: { ...this.authHeaders(), Depth: "1", "Content-Type": "application/xml" },
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
    })
    const text = await response.text().catch(() => "")

    if (response.status === 207) {
      const lengths = parsePropfindLengths(text)
      for (let index = 0; index < count; index += 1) {
        const name = String(index).padStart(6, "0")
        const length = lengths.get(name)
        if (length === undefined) {
          throw new Error(`写入后找不到分片 ${index}，写入可能被 WAF 或网关拦截`)
        }
        if (length !== null && length !== expected(index)) {
          throw new Error(`分片 ${index} 长度为 ${length}，应为 ${expected(index)}`)
        }
      }
      return
    }

    for (let index = 0; index < count; index += 1) {
      await this.verifyLength(WebdavStorageDriver.partKey(objectKey, index), expected(index))
    }
  }

  private async deleteObject(key: string): Promise<void> {
    const response = await fetch(this.urlFor(key), {
      method: "DELETE",
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
    })
    await response.body?.cancel()
    if (!response.ok && response.status !== 404) {
      throw new Error(`删除失败，状态码 ${response.status}`)
    }
  }

  /** 创建根目录本身（不含上级目录）。401 时抛错，其余结果（含部分服务对根目录返回的 403）忽略。 */
  private async ensureBase(): Promise<void> {
    if (this.baseEnsured) {
      return
    }
    const response = await fetch(`${this.baseUrl}/`, {
      method: "MKCOL",
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
    })
    await response.body?.cancel()
    if (response.status === 401) {
      throw new Error(`WebDAV authentication failed with status ${response.status}`)
    }
    this.baseEnsured = true
  }

  private async mkcol(collection: string): Promise<void> {
    const response = await fetch(`${this.urlFor(collection)}/`, {
      method: "MKCOL",
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
    })
    await response.body?.cancel()
    // 405 / 301 / 302 / 403 视为目录已存在（部分服务对已存在目录返回 403），真正的错误由后续 PUT 暴露。
    if (!response.ok && ![301, 302, 403, 405].includes(response.status)) {
      throw new Error(`WebDAV MKCOL ${collection} failed with status ${response.status}`)
    }
  }

  private authHeaders(): Record<string, string> {
    return this.authorization ? { Authorization: this.authorization } : {}
  }
}

/**
 * 从 PROPFIND（Depth: 1）响应中取出各条目的末级名称与 getcontentlength。
 * 没有 getcontentlength 的条目长度记为 null。
 */
export function parsePropfindLengths(xml: string): Map<string, number | null> {
  const result = new Map<string, number | null>()
  const blocks = xml.split(/<(?:[\w-]+:)?response[\s>]/i).slice(1)
  for (const block of blocks) {
    const href = /<(?:[\w-]+:)?href[^>]*>([^<]*)</i.exec(block)?.[1]
    if (!href) {
      continue
    }
    const segments = href.replace(/\/+$/, "").split("/")
    let name = segments[segments.length - 1] ?? ""
    try {
      name = decodeURIComponent(name)
    } catch {
      // 保留原样
    }
    const length = /<(?:[\w-]+:)?getcontentlength[^>]*>\s*(\d+)\s*</i.exec(block)?.[1]
    result.set(name, length === undefined ? null : Number(length))
  }
  return result
}

function htmlTitle(text: string): string {
  const title = /<title[^>]*>([^<]{1,80})<\/title>/i.exec(text)?.[1]?.trim()
  return title ? `（${title}）` : ""
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.round(bytes / 1024)}KB`
}

/** 把 fetch 抛出的错误整理成可读文本（undici 的真实原因在 cause 里）。 */
export function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error)
  }
  const cause = (error as Error & { cause?: unknown }).cause
  if (cause instanceof Error && cause.message) {
    return `${error.message}: ${cause.message}`
  }
  return error.message
}
