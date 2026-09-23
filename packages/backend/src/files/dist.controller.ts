import { Controller, Get, Logger, Param, Req, Res } from "@nestjs/common"
import type { Request, Response } from "express"
import { Readable } from "node:stream"
import type { ReadableStream as WebReadableStream } from "node:stream/web"

import { PrismaService } from "../database/prisma.service"
import { contentDisposition, DIST_PATH_PREFIX } from "./file-naming"
import { StorageBackendsService } from "./storage-backends.service"
import { describeFetchError, type WebdavStorageDriver } from "./storage-drivers"

/** 成功响应的缓存策略：直链内容不可变，CDN 与浏览器可长期缓存。 */
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
/** 404 的缓存策略。 */
const NOT_FOUND_CACHE = "public, max-age=60"

/** 响应头：告知网关不缓存本机存储的文件。网关据此跳过自身的分片缓存并移除该头。 */
const GATEWAY_CACHE_HEADER = "X-Verhub-Cache"

/**
 * 文件分发。网关把 `/f/{projectKey}/{fileId}/{filename}` 转到这里；
 * 支持 GET / HEAD、Range 与 If-None-Match，忽略查询串。
 */
@Controller("dist")
export class DistController {
  private readonly logger = new Logger(DistController.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly backends: StorageBackendsService,
  ) {}

  @Get(`${DIST_PATH_PREFIX}/:projectKey/:fileId/:filename`)
  async serve(
    @Param("projectKey") projectKey: string,
    @Param("fileId") fileId: string,
    @Param("filename") filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.removeHeader("Vary")
    res.removeHeader("Access-Control-Allow-Credentials")
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader(
      "Content-Security-Policy",
      "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    )

    const file = await this.prisma.storedFile.findUnique({
      where: { id: fileId },
      include: { storageBackend: true },
    })
    const expectedKey = [DIST_PATH_PREFIX, projectKey, fileId, filename].join("/")
    if (!file || file.status !== "READY" || file.objectKey !== expectedKey) {
      res
        .status(404)
        .setHeader("Cache-Control", NOT_FOUND_CACHE)
        .type("text/plain")
        .send("Not Found")
      return
    }

    const etag = file.sha256 ? `"${file.sha256}"` : null
    res.setHeader("Cache-Control", IMMUTABLE_CACHE)
    res.setHeader("Content-Type", file.contentType)
    res.setHeader("Content-Disposition", contentDisposition(file.filename, file.contentType))
    res.setHeader("Last-Modified", new Date(file.createdAt * 1000).toUTCString())
    res.setHeader("Accept-Ranges", "bytes")
    if (etag) {
      res.setHeader("ETag", etag)
    }

    if (etag && matchesEtag(req.headers["if-none-match"], etag)) {
      res.status(304).end()
      return
    }

    const driver = this.backends.driverForBackend(file.storageBackend)
    if (driver.kind === "LOCAL") {
      res.setHeader(GATEWAY_CACHE_HEADER, "bypass")
      res.sendFile(
        driver.resolvePath(file.objectKey),
        {
          acceptRanges: true,
          cacheControl: false,
          etag: false,
          lastModified: false,
          dotfiles: "allow",
        },
        (error?: Error) => {
          if (!error || res.headersSent) {
            return
          }
          this.logger.error(`[dist] local object unreadable ${file.objectKey}: ${error.message}`)
          this.sendUnavailable(res)
        },
      )
      return
    }

    // If-Range 与当前 ETag 不符时按完整内容返回。
    const ifRange = req.headers["if-range"]
    const range =
      typeof req.headers.range === "string" && (!ifRange || ifRange === etag)
        ? req.headers.range
        : undefined

    const controller = new AbortController()
    res.on("close", () => controller.abort())

    if (file.partSize) {
      this.servePartitioned(req, res, driver, file, range, controller)
      return
    }

    let upstream: globalThis.Response
    try {
      upstream = await driver.request(file.objectKey, {
        method: req.method === "HEAD" ? "HEAD" : "GET",
        range,
        signal: controller.signal,
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        this.logger.error(
          `[dist] webdav request failed ${file.objectKey}: ${describeFetchError(error)}`,
        )
        this.sendUnavailable(res)
      }
      return
    }

    if (upstream.status === 416) {
      await upstream.body?.cancel()
      res.status(416)
      copyHeader(upstream, res, "content-range")
      res.end()
      return
    }

    if (upstream.status !== 200 && upstream.status !== 206) {
      await upstream.body?.cancel()
      this.logger.error(`[dist] webdav returned ${upstream.status} for ${file.objectKey}`)
      this.sendUnavailable(res)
      return
    }

    res.status(upstream.status)
    copyHeader(upstream, res, "content-length")
    copyHeader(upstream, res, "content-range")

    if (req.method === "HEAD" || !upstream.body) {
      await upstream.body?.cancel()
      res.end()
      return
    }

    const body = Readable.fromWeb(upstream.body as WebReadableStream)
    body.on("error", (error) => {
      if (!controller.signal.aborted) {
        this.logger.warn(`[dist] stream interrupted ${file.objectKey}: ${error.message}`)
      }
      res.destroy(error)
    })
    body.pipe(res)
  }

  /** 分片存放的文件：本地解析 Range，按需读取分片拼接输出。 */
  private servePartitioned(
    req: Request,
    res: Response,
    driver: WebdavStorageDriver,
    file: { objectKey: string; size: bigint; partSize: number | null },
    range: string | undefined,
    controller: AbortController,
  ): void {
    const total = Number(file.size)
    const parsed = range ? parseRange(range, total) : null
    if (parsed === "unsatisfiable") {
      res.status(416).setHeader("Content-Range", `bytes */${total}`)
      res.end()
      return
    }

    const start = parsed?.start ?? 0
    const end = parsed?.end ?? total - 1
    res.status(parsed ? 206 : 200)
    res.setHeader("Content-Length", String(end - start + 1))
    if (parsed) {
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`)
    }
    if (req.method === "HEAD" || total === 0) {
      res.end()
      return
    }

    const body = Readable.from(
      driver.readParts(file.objectKey, file.partSize!, total, start, end, controller.signal),
    )
    body.on("error", (error) => {
      if (!controller.signal.aborted) {
        this.logger.error(`[dist] partitioned read failed ${file.objectKey}: ${error.message}`)
      }
      res.destroy(error)
    })
    body.pipe(res)
  }

  private sendUnavailable(res: Response): void {
    res.status(502).removeHeader("ETag")
    res.setHeader("Cache-Control", "no-store")
    res.removeHeader(GATEWAY_CACHE_HEADER)
    res.removeHeader("Content-Disposition")
    res.type("text/plain").send("Storage Unavailable")
  }
}

function copyHeader(from: globalThis.Response, to: Response, name: string): void {
  const value = from.headers.get(name)
  if (value !== null) {
    to.setHeader(name, value)
  }
}

/**
 * 解析单段 Range 头（`bytes=a-b` / `bytes=a-` / `bytes=-n`）。
 * 多段或格式不认识时返回 null（按完整内容响应），越界返回 "unsatisfiable"。
 */
export function parseRange(
  header: string,
  total: number,
): { start: number; end: number } | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === "" && match[2] === "")) {
    return null
  }
  if (match[1] === "") {
    const suffix = Number(match[2])
    if (suffix === 0) {
      return "unsatisfiable"
    }
    return { start: Math.max(0, total - suffix), end: total - 1 }
  }
  const start = Number(match[1])
  const end = match[2] === "" ? total - 1 : Math.min(Number(match[2]), total - 1)
  if (start >= total || end < start) {
    return "unsatisfiable"
  }
  return { start, end }
}

/** If-None-Match 是否命中（支持逗号分隔列表、弱校验前缀与 `*`）。 */
export function matchesEtag(header: string | string[] | undefined, etag: string): boolean {
  if (!header) {
    return false
  }
  const values = (Array.isArray(header) ? header.join(",") : header)
    .split(",")
    .map((item) => item.trim())
  return values.some((value) => value === "*" || value === etag || value === `W/${etag}`)
}
