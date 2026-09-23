import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common"
import { Prisma, type StorageBackend, type StoredFile } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { ProjectResolverService } from "../database/project-resolver.service"
import { searchContains } from "../common/query-filters"
import { CdnRefreshService } from "./cdn-refresh.service"
import { QueryFilesDto } from "./dto/query-files.dto"
import { urlHasPath, versionUrls } from "./download-links"
import { buildDistUrl, encodeObjectKey } from "./file-naming"
import { distBaseUrl } from "./files-config"
import { StorageBackendsService } from "./storage-backends.service"
import type {
  CdnRefreshResult,
  DeleteFileResult,
  StoredFileListResponse,
  StoredFileView,
} from "./types"

type FileWithBackend = StoredFile & { storageBackend: Pick<StorageBackend, "name"> }

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
    private readonly backends: StorageBackendsService,
    private readonly cdn: CdnRefreshService,
  ) {}

  async list(projectKey: string, query: QueryFilesDto): Promise<StoredFileListResponse> {
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
    const where: Prisma.StoredFileWhereInput = {
      projectKey: canonicalKey,
      ...(query.status ? { status: query.status.toUpperCase() as StoredFile["status"] } : {}),
      ...(query.search
        ? {
            OR: [
              { filename: searchContains(query.search) },
              { id: searchContains(query.search) },
              { sha256: searchContains(query.search) },
            ],
          }
        : {}),
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.storedFile.count({ where }),
      this.prisma.storedFile.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { storageBackend: { select: { name: true } } },
      }),
    ])

    const references = await this.collectReferences(canonicalKey, rows)
    return { total, data: rows.map((row) => toFileView(row, references.get(row.id) ?? [])) }
  }

  async findOne(projectKey: string, fileId: string): Promise<StoredFileView> {
    const row = await this.findRecord(projectKey, fileId)
    const references = await this.collectReferences(row.projectKey, [row])
    return toFileView(row, references.get(row.id) ?? [])
  }

  /** 删除文件：先删存储中的对象，再删记录；启用了 CDN 刷新时随后刷新直链缓存。 */
  async remove(projectKey: string, fileId: string): Promise<DeleteFileResult> {
    const row = await this.findRecord(projectKey, fileId)
    const driver = await this.backends.driverFor(row.storageBackendId)
    await driver.remove(row.objectKey)
    await this.prisma.storedFile.delete({ where: { id: row.id } })
    const cdnRefresh =
      row.status === "READY" ? await this.cdn.refreshObjects([row.objectKey]) : null
    return { success: true, cdn_refresh: cdnRefresh }
  }

  /** 手动刷新文件直链的 CDN 缓存。未启用 CDN 刷新或未配置分发域名时 400。 */
  async refreshCdn(projectKey: string, fileId: string): Promise<CdnRefreshResult> {
    const row = await this.findRecord(projectKey, fileId)
    const result = await this.cdn.refreshObjects([row.objectKey])
    if (!result) {
      throw new BadRequestException(
        "CDN refresh is not enabled or VERHUB_DIST_BASE_URL is not configured",
      )
    }
    return result
  }

  /** 删除项目的全部文件对象并刷新其 CDN 缓存。单个对象删除失败只记日志。 */
  async purgeProject(projectKey: string): Promise<void> {
    const rows = await this.prisma.storedFile.findMany({
      where: { projectKey },
      select: { id: true, objectKey: true, storageBackendId: true },
    })
    for (const row of rows) {
      try {
        const driver = await this.backends.driverFor(row.storageBackendId)
        await driver.remove(row.objectKey)
      } catch (error) {
        this.logger.warn(
          `[files] failed to remove object ${row.objectKey} while deleting project ${projectKey}: ${(error as Error).message}`,
        )
      }
    }
    await this.cdn.refreshObjects(rows.map((row) => row.objectKey))
  }

  async findRecord(projectKey: string, fileId: string): Promise<FileWithBackend> {
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
    const row = await this.prisma.storedFile.findFirst({
      where: { id: fileId, projectKey: canonicalKey },
      include: { storageBackend: { select: { name: true } } },
    })
    if (!row) {
      throw new NotFoundException("File not found")
    }
    return row
  }

  /** 文件 id → 在下载链接中引用它的版本号列表。 */
  private async collectReferences(
    projectKey: string,
    rows: Array<Pick<StoredFile, "id" | "objectKey">>,
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (rows.length === 0) {
      return result
    }

    const versions = await this.prisma.version.findMany({
      where: { projectKey },
      select: { version: true, downloadUrl: true, downloadLinks: true },
      orderBy: { createdAt: "desc" },
    })
    const versionLinks = versions.map((version) => ({
      version: version.version,
      urls: versionUrls(version),
    }))

    for (const row of rows) {
      const path = `/${encodeObjectKey(row.objectKey)}`
      const matched = versionLinks
        .filter((entry) => entry.urls.some((url) => urlHasPath(url, path)))
        .map((entry) => entry.version)
      result.set(row.id, matched)
    }
    return result
  }
}

export function toFileView(row: FileWithBackend, referencedBy: string[]): StoredFileView {
  const base = distBaseUrl()
  return {
    id: row.id,
    project_key: row.projectKey,
    filename: row.filename,
    size: Number(row.size),
    sha256: row.sha256,
    part_size: row.partSize,
    content_type: row.contentType,
    status: row.status.toLowerCase() as StoredFileView["status"],
    source: row.source === "GITHUB_RELEASE" ? "github_release" : "upload",
    source_url: row.sourceUrl,
    error: row.error,
    storage_backend_id: row.storageBackendId,
    storage_backend_name: row.storageBackend.name,
    path: buildDistUrl(null, row.objectKey),
    url: base ? buildDistUrl(base, row.objectKey) : null,
    referenced_by: referencedBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}
