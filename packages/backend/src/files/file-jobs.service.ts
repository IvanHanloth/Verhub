import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import { Prisma } from "@prisma/client"
import { mkdir, readdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { Readable } from "node:stream"

import { PrismaService } from "../database/prisma.service"
import { nowSeconds } from "../common/utils"
import { replaceVersionUrl } from "./download-links"
import { buildDistUrl } from "./file-naming"
import { distBaseUrl, storageRoot, uploadMaxBytes } from "./files-config"
import { StorageBackendsService } from "./storage-backends.service"
import { describeFetchError } from "./storage-drivers"
import { SizeLimitError, writeWithHash } from "./stream-utils"
import { UploadsService } from "./uploads.service"

const CONCURRENCY = 2
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000
const MAX_ERROR_LENGTH = 500
/** 转存失败的上传文件保留暂存的时长（秒），期间可重试。 */
const FAILED_STAGING_TTL_SECONDS = 7 * 24 * 3600

/** 暂存中的待转存文件路径。 */
export function stagedFilePath(fileId: string): string {
  return join(storageRoot(), "staging", "files", fileId)
}

/**
 * 文件后台任务：把暂存文件写入存储，以及下载 GitHub Release 附件后写入存储。
 * 任务在进程内排队执行，启动时会重新接管状态为 PENDING 的文件。
 */
@Injectable()
export class FileJobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FileJobsService.name)
  private readonly queue: string[] = []
  private readonly queued = new Set<string>()
  private running = 0

  constructor(
    private readonly prisma: PrismaService,
    private readonly backends: StorageBackendsService,
    private readonly uploads: UploadsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const pending = await this.prisma.storedFile.findMany({
        where: { status: "PENDING" },
        select: { id: true },
      })
      for (const row of pending) {
        this.enqueue(row.id)
      }
      if (pending.length > 0) {
        this.logger.log(`[files] resumed ${pending.length} pending file job(s)`)
      }
    } catch (error) {
      this.logger.warn(`[files] failed to resume pending jobs: ${(error as Error).message}`)
    }
  }

  /** 每小时清理过期的上传会话，以及超过保留期或已无对应记录的暂存文件。 */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupUploads(): Promise<void> {
    const removed = await this.uploads.cleanupExpired()
    if (removed > 0) {
      this.logger.log(`[files] removed ${removed} expired upload session(s)`)
    }
    await this.cleanupStagedFiles()
  }

  private async cleanupStagedFiles(): Promise<void> {
    const dir = join(storageRoot(), "staging", "files")
    const names = await readdir(dir).catch(() => [] as string[])
    if (names.length === 0) {
      return
    }
    const rows = await this.prisma.storedFile.findMany({
      where: { id: { in: names } },
      select: { id: true, status: true },
    })
    const status = new Map(rows.map((row) => [row.id, row.status]))
    const deadline = Date.now() - FAILED_STAGING_TTL_SECONDS * 1000
    for (const name of names) {
      if (status.get(name) === "PENDING" || this.queued.has(name)) {
        continue
      }
      const info = await stat(join(dir, name)).catch(() => null)
      if (!status.has(name) || (info && info.mtimeMs < deadline)) {
        await rm(join(dir, name), { force: true }).catch(() => undefined)
      }
    }
  }

  /** 把文件加入队列；已在队列中的忽略。 */
  enqueue(fileId: string): void {
    if (this.queued.has(fileId)) {
      return
    }
    this.queued.add(fileId)
    this.queue.push(fileId)
    this.drain()
  }

  private drain(): void {
    while (this.running < CONCURRENCY && this.queue.length > 0) {
      const fileId = this.queue.shift()!
      this.running += 1
      void this.process(fileId).finally(() => {
        this.running -= 1
        this.queued.delete(fileId)
        this.drain()
      })
    }
  }

  private async process(fileId: string): Promise<void> {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } })
    if (!file || file.status !== "PENDING") {
      return
    }

    const staged = stagedFilePath(fileId)
    let keepStaged = false
    try {
      let size = Number(file.size)
      let sha256 = file.sha256

      if (file.source === "GITHUB_RELEASE") {
        if (!file.sourceUrl) {
          throw new Error("Missing source URL")
        }
        const downloaded = await this.download(file.sourceUrl, staged)
        size = downloaded.bytes
        sha256 = downloaded.sha256
      } else if (!(await exists(staged))) {
        throw new Error("暂存文件已丢失，请重新上传")
      }

      const driver = await this.backends.driverFor(file.storageBackendId)
      const { partSize } = await driver.put(file.objectKey, staged, size)

      const updated = await this.prisma.storedFile
        .update({
          where: { id: fileId },
          data: {
            status: "READY",
            size: BigInt(size),
            partSize,
            sha256,
            error: null,
            updatedAt: nowSeconds(),
          },
        })
        .catch((error: unknown) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
            return null
          }
          throw error
        })

      if (!updated) {
        await driver.remove(file.objectKey).catch(() => undefined)
        return
      }

      if (updated.sourceUrl) {
        await this.applyToVersions(updated.projectKey, updated.sourceUrl, updated.objectKey)
      }
      this.logger.log(`[files] stored ${file.objectKey} (${size} bytes)`)
    } catch (error) {
      const message = describeFetchError(error).slice(0, MAX_ERROR_LENGTH)
      this.logger.warn(`[files] job failed for ${file.objectKey}: ${message}`)
      // 上传的文件保留暂存以便重试；镜像失败重试时会重新下载。
      keepStaged = file.source === "UPLOAD"
      await this.prisma.storedFile
        .updateMany({
          where: { id: fileId },
          data: { status: "FAILED", error: message, updatedAt: nowSeconds() },
        })
        .catch(() => undefined)
    } finally {
      if (!keepStaged) {
        await rm(staged, { force: true }).catch(() => undefined)
      }
    }
  }

  /** 下载远端文件到 target，跟随重定向，超过上传上限即中止。 */
  private async download(url: string, target: string): Promise<{ bytes: number; sha256: string }> {
    await mkdir(join(storageRoot(), "staging", "files"), { recursive: true })
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Verhub", Accept: "application/octet-stream" },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new Error(`下载失败，状态码 ${response.status}`)
    }

    const limit = uploadMaxBytes()
    const declared = Number(response.headers.get("content-length"))
    if (Number.isFinite(declared) && declared > limit) {
      await response.body.cancel()
      throw new SizeLimitError(limit)
    }

    try {
      return await writeWithHash(
        Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
        target,
        limit,
      )
    } catch (error) {
      await rm(target, { force: true }).catch(() => undefined)
      throw error
    }
  }

  /** 把项目内所有版本中指向 sourceUrl 的下载地址替换为直链。未配置分发域名时不替换。 */
  async applyToVersions(projectKey: string, sourceUrl: string, objectKey: string): Promise<number> {
    const base = distBaseUrl()
    if (!base) {
      return 0
    }
    const target = buildDistUrl(base, objectKey)

    const versions = await this.prisma.version.findMany({
      where: { projectKey },
      select: { id: true, downloadUrl: true, downloadLinks: true },
    })

    let updated = 0
    for (const version of versions) {
      const next = replaceVersionUrl(version, sourceUrl, target)
      if (!next) {
        continue
      }
      await this.prisma.version.update({
        where: { id: version.id },
        data: { downloadUrl: next.downloadUrl, downloadLinks: next.downloadLinks },
      })
      updated += 1
    }
    return updated
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
