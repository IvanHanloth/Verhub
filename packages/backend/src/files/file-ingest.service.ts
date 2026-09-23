import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { rm, stat } from "node:fs/promises"

import { PrismaService } from "../database/prisma.service"
import { ProjectResolverService } from "../database/project-resolver.service"
import { nowSeconds } from "../common/utils"
import { githubAssetFilename, isGithubReleaseAsset, versionUrls } from "./download-links"
import {
  buildDistUrl,
  buildObjectKey,
  generateFileId,
  guessContentType,
  sanitizeFilename,
} from "./file-naming"
import { distBaseUrl } from "./files-config"
import { FileJobsService, stagedFilePath } from "./file-jobs.service"
import { toFileView } from "./files.service"
import { StorageBackendsService } from "./storage-backends.service"
import type { MirrorAssetsResult, StoredFileView } from "./types"
import { UploadsService } from "./uploads.service"

type DownloadLink = { url: string; name?: string; platform?: string }

/** 文件入库：上传完成登记、失败重试，以及 GitHub Release 附件镜像。 */
@Injectable()
export class FileIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
    private readonly backends: StorageBackendsService,
    private readonly uploads: UploadsService,
    private readonly jobs: FileJobsService,
  ) {}

  /**
   * 合并上传分片并登记文件。本机存储同步写入并返回 ready；
   * 其他存储返回 pending，由后台任务写入。
   */
  async completeUpload(projectKey: string, uploadId: string): Promise<StoredFileView> {
    const fileId = generateFileId()
    const staged = stagedFilePath(fileId)
    const assembled = await this.uploads.assemble(projectKey, uploadId, staged)
    const backend = await this.backends.findOrThrow(assembled.storageBackendId)
    const objectKey = buildObjectKey(assembled.projectKey, fileId, assembled.filename)

    const data = {
      id: fileId,
      projectKey: assembled.projectKey,
      storageBackendId: backend.id,
      objectKey,
      filename: assembled.filename,
      size: BigInt(assembled.bytes),
      sha256: assembled.sha256,
      contentType: guessContentType(assembled.filename),
      source: "UPLOAD" as const,
    }

    try {
      if (backend.kind === "LOCAL") {
        await this.backends.driverForBackend(backend).put(objectKey, staged, assembled.bytes)
        const row = await this.prisma.storedFile.create({
          data: { ...data, status: "READY" },
          include: { storageBackend: { select: { name: true } } },
        })
        return toFileView(row, [])
      }

      const row = await this.prisma.storedFile.create({
        data: { ...data, status: "PENDING" },
        include: { storageBackend: { select: { name: true } } },
      })
      this.jobs.enqueue(row.id)
      return toFileView(row, [])
    } catch (error) {
      await rm(staged, { force: true }).catch(() => undefined)
      throw error
    }
  }

  /** 重新执行失败的文件任务。上传的文件需要暂存仍在（失败后保留 7 天），镜像会重新下载。 */
  async retry(projectKey: string, fileId: string): Promise<StoredFileView> {
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
    const row = await this.prisma.storedFile.findFirst({
      where: { id: fileId, projectKey: canonicalKey },
    })
    if (!row) {
      throw new NotFoundException("File not found")
    }
    if (row.status !== "FAILED") {
      throw new ConflictException("Only failed files can be retried")
    }
    if (row.source === "UPLOAD" && !(await stat(stagedFilePath(row.id)).catch(() => null))) {
      throw new BadRequestException("Staged upload has been cleaned up, upload the file again")
    }

    const updated = await this.prisma.storedFile.update({
      where: { id: row.id },
      data: { status: "PENDING", error: null, updatedAt: nowSeconds() },
      include: { storageBackend: { select: { name: true } } },
    })
    this.jobs.enqueue(updated.id)
    return toFileView(updated, [])
  }

  /**
   * 把已镜像完成的 GitHub 附件地址替换为直链，未配置分发域名时原样返回。
   * 用于 webhook 写入版本之前，避免已镜像的附件被覆盖回 GitHub 地址。
   */
  async substituteMirrored(
    projectKey: string,
    links: DownloadLink[],
    downloadUrl: string | null,
  ): Promise<{ links: DownloadLink[]; downloadUrl: string | null }> {
    const base = distBaseUrl()
    const assetUrls = [...links.map((link) => link.url), downloadUrl ?? ""].filter(
      isGithubReleaseAsset,
    )
    if (!base || assetUrls.length === 0) {
      return { links, downloadUrl }
    }

    const ready = await this.prisma.storedFile.findMany({
      where: { projectKey, status: "READY", sourceUrl: { in: assetUrls } },
      select: { sourceUrl: true, objectKey: true },
    })
    const mapping = new Map(ready.map((row) => [row.sourceUrl!, buildDistUrl(base, row.objectKey)]))
    return {
      links: links.map((link) => ({ ...link, url: mapping.get(link.url) ?? link.url })),
      downloadUrl: downloadUrl ? (mapping.get(downloadUrl) ?? downloadUrl) : downloadUrl,
    }
  }

  /** 为一组地址中的 GitHub 附件建立镜像任务。已完成的附件立即替换到项目内所有版本。 */
  async mirrorUrls(projectKey: string, urls: string[]): Promise<MirrorAssetsResult> {
    const result: MirrorAssetsResult = { queued: 0, reused: 0, skipped: 0 }
    const assets = Array.from(new Set(urls.map((url) => url.trim())))

    for (const url of assets) {
      if (!isGithubReleaseAsset(url)) {
        result.skipped += 1
        continue
      }

      const existing = await this.prisma.storedFile.findFirst({
        where: { projectKey, sourceUrl: url },
        orderBy: { createdAt: "desc" },
      })

      if (existing?.status === "READY") {
        await this.jobs.applyToVersions(projectKey, url, existing.objectKey)
        result.reused += 1
        continue
      }

      if (existing?.status === "PENDING") {
        this.jobs.enqueue(existing.id)
        result.queued += 1
        continue
      }

      if (existing?.status === "FAILED") {
        await this.prisma.storedFile.update({
          where: { id: existing.id },
          data: { status: "PENDING", error: null, updatedAt: nowSeconds() },
        })
        this.jobs.enqueue(existing.id)
        result.queued += 1
        continue
      }

      const filename = sanitizeFilename(githubAssetFilename(url))
      if (!filename) {
        result.skipped += 1
        continue
      }
      const backend = await this.backends.resolveForProject(projectKey)
      const fileId = generateFileId()
      await this.prisma.storedFile.create({
        data: {
          id: fileId,
          projectKey,
          storageBackendId: backend.id,
          objectKey: buildObjectKey(projectKey, fileId, filename),
          filename,
          contentType: guessContentType(filename),
          status: "PENDING",
          source: "GITHUB_RELEASE",
          sourceUrl: url,
        },
      })
      this.jobs.enqueue(fileId)
      result.queued += 1
    }

    return result
  }

  /** 镜像某个版本下载链接中的 GitHub 附件。 */
  async mirrorVersion(projectKey: string, versionId: string): Promise<MirrorAssetsResult> {
    if (!distBaseUrl()) {
      throw new BadRequestException("VERHUB_DIST_BASE_URL is not configured")
    }
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
    const version = await this.prisma.version.findFirst({
      where: { id: versionId, projectKey: canonicalKey },
      select: { downloadUrl: true, downloadLinks: true },
    })
    if (!version) {
      throw new NotFoundException("Version not found")
    }
    return this.mirrorUrls(canonicalKey, versionUrls(version))
  }

  /** 项目开启了附件镜像且配置了分发域名时，为版本的 GitHub 附件建立镜像任务。 */
  async mirrorIfEnabled(projectKey: string, urls: string[]): Promise<MirrorAssetsResult | null> {
    if (!distBaseUrl()) {
      return null
    }
    const project = await this.prisma.project.findUnique({
      where: { projectKey },
      select: { mirrorGithubAssets: true },
    })
    if (!project?.mirrorGithubAssets) {
      return null
    }
    return this.mirrorUrls(projectKey, urls)
  }
}
