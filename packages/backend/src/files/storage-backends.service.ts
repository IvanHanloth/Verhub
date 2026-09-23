import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { Prisma, type StorageBackend } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { openSecret, sealSecret, secretFingerprint } from "../common/secret-box"
import { nowSeconds } from "../common/utils"
import { CreateStorageBackendDto, UpdateStorageBackendDto } from "./dto/storage-backend.dto"
import { distBaseUrl, UPLOAD_CHUNK_SIZE, uploadMaxBytes } from "./files-config"
import {
  LocalStorageDriver,
  WebdavStorageDriver,
  type StorageDriver,
  type StorageProbeResult,
} from "./storage-drivers"
import type { CdnOriginHint, StorageBackendView, StorageOverview } from "./types"

/** WebDAV 密码加解密的用途标签，见 secret-box。 */
const PASSWORD_PURPOSE = "storage-webdav-password"

/** 内置本机存储的 id。 */
export const LOCAL_BACKEND_ID = "local"

@Injectable()
export class StorageBackendsService {
  private readonly drivers = new Map<string, { signature: string; driver: StorageDriver }>()

  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<StorageOverview> {
    const [backends, counts] = await Promise.all([
      this.prisma.storageBackend.findMany({ orderBy: { createdAt: "asc" } }),
      this.prisma.storedFile.groupBy({ by: ["storageBackendId"], _count: { _all: true } }),
    ])
    const countMap = new Map(counts.map((row) => [row.storageBackendId, row._count._all]))

    return {
      dist_base_url: distBaseUrl(),
      upload_max_bytes: uploadMaxBytes(),
      chunk_size: UPLOAD_CHUNK_SIZE,
      backends: backends.map((backend) => toView(backend, countMap.get(backend.id) ?? 0)),
    }
  }

  async create(dto: CreateStorageBackendDto): Promise<StorageBackendView> {
    const password = dto.password?.trim() ?? ""
    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.is_default) {
        await tx.storageBackend.updateMany({ data: { isDefault: false } })
      }
      return tx.storageBackend.create({
        data: {
          name: dto.name.trim(),
          kind: "WEBDAV",
          baseUrl: normalizeBaseUrl(dto.base_url),
          username: dto.username?.trim() || null,
          passwordEncrypted: password ? sealSecret(password, PASSWORD_PURPOSE) : null,
          passwordFingerprint: password ? secretFingerprint(password) : null,
          partSize: dto.part_size_kb ? dto.part_size_kb * 1024 : null,
          isDefault: dto.is_default ?? false,
        },
      })
    })
    return toView(created, 0)
  }

  async update(id: string, dto: UpdateStorageBackendDto): Promise<StorageBackendView> {
    const current = await this.findOrThrow(id)
    const data: Prisma.StorageBackendUpdateInput = { updatedAt: nowSeconds() }

    if (dto.name !== undefined) {
      data.name = dto.name.trim()
    }

    if (current.kind === "WEBDAV") {
      if (dto.base_url !== undefined) {
        data.baseUrl = normalizeBaseUrl(dto.base_url)
      }
      if (dto.username !== undefined) {
        data.username = dto.username.trim() || null
      }
      if (dto.password !== undefined) {
        const password = dto.password.trim()
        data.passwordEncrypted = password ? sealSecret(password, PASSWORD_PURPOSE) : null
        data.passwordFingerprint = password ? secretFingerprint(password) : null
      }
      if (dto.part_size_kb !== undefined) {
        data.partSize = dto.part_size_kb ? dto.part_size_kb * 1024 : null
      }
    } else if (
      dto.base_url !== undefined ||
      dto.username !== undefined ||
      dto.password !== undefined ||
      dto.part_size_kb !== undefined
    ) {
      throw new BadRequestException("Local storage has no connection settings")
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.is_default) {
        await tx.storageBackend.updateMany({ data: { isDefault: false } })
        data.isDefault = true
      }
      return tx.storageBackend.update({ where: { id }, data })
    })

    const fileCount = await this.prisma.storedFile.count({ where: { storageBackendId: id } })
    return toView(updated, fileCount)
  }

  async remove(id: string): Promise<void> {
    const current = await this.findOrThrow(id)
    if (current.id === LOCAL_BACKEND_ID) {
      throw new BadRequestException("Built-in local storage cannot be deleted")
    }
    if (current.isDefault) {
      throw new ConflictException("Set another storage as default before deleting this one")
    }
    const fileCount = await this.prisma.storedFile.count({ where: { storageBackendId: id } })
    if (fileCount > 0) {
      throw new ConflictException(`Storage still holds ${fileCount} file(s)`)
    }
    await this.prisma.storageBackend.delete({ where: { id } })
    this.drivers.delete(id)
  }

  /** 用已保存的配置写入、读取并删除一个探测文件。 */
  async test(id: string): Promise<StorageProbeResult> {
    return (await this.driverFor(id)).probe()
  }

  /** 按后端 id 取驱动。 */
  async driverFor(id: string): Promise<StorageDriver> {
    return this.driverForBackend(await this.findOrThrow(id))
  }

  /** 按后端记录取驱动，连接配置变更后自动重建。 */
  driverForBackend(backend: StorageBackend): StorageDriver {
    const id = backend.id
    const signature = [
      backend.kind,
      backend.baseUrl,
      backend.username,
      backend.passwordEncrypted,
      backend.partSize,
    ].join("\n")
    const cached = this.drivers.get(id)
    if (cached && cached.signature === signature) {
      return cached.driver
    }

    const driver: StorageDriver =
      backend.kind === "LOCAL"
        ? new LocalStorageDriver()
        : new WebdavStorageDriver({
            baseUrl: backend.baseUrl ?? "",
            username: backend.username,
            password: backend.passwordEncrypted
              ? openSecret(backend.passwordEncrypted, PASSWORD_PURPOSE)
              : null,
            partSize: backend.partSize,
          })
    this.drivers.set(id, { signature, driver })
    return driver
  }

  /** 项目新文件应写入的后端：项目指定的，否则为实例默认，再否则为本机存储。 */
  async resolveForProject(projectKey: string, override?: string): Promise<StorageBackend> {
    if (override) {
      return this.findOrThrow(override)
    }

    const project = await this.prisma.project.findUnique({
      where: { projectKey },
      select: { storageBackend: true },
    })
    if (project?.storageBackend) {
      return project.storageBackend
    }

    const fallback =
      (await this.prisma.storageBackend.findFirst({ where: { isDefault: true } })) ??
      (await this.prisma.storageBackend.findUnique({ where: { id: LOCAL_BACKEND_ID } }))
    if (!fallback) {
      throw new NotFoundException("No storage backend available")
    }
    return fallback
  }

  async findOrThrow(id: string): Promise<StorageBackend> {
    const backend = await this.prisma.storageBackend.findUnique({ where: { id } })
    if (!backend) {
      throw new NotFoundException("Storage backend not found")
    }
    return backend
  }
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "")
}

/** 由 WebDAV 根地址推出 CDN 直接回源所需的协议、主机与路径前缀。 */
export function toCdnOriginHint(baseUrl: string | null): CdnOriginHint | null {
  if (!baseUrl) {
    return null
  }
  try {
    const url = new URL(baseUrl)
    return {
      scheme: url.protocol === "http:" ? "http" : "https",
      host: url.host,
      path_prefix: url.pathname.replace(/\/+$/, ""),
    }
  } catch {
    return null
  }
}

function toView(backend: StorageBackend, fileCount: number): StorageBackendView {
  return {
    id: backend.id,
    name: backend.name,
    kind: backend.kind === "LOCAL" ? "local" : "webdav",
    is_builtin: backend.id === LOCAL_BACKEND_ID,
    is_default: backend.isDefault,
    base_url: backend.baseUrl,
    username: backend.username,
    has_password: Boolean(backend.passwordEncrypted),
    password_fingerprint: backend.passwordFingerprint,
    part_size_kb: backend.partSize ? Math.round(backend.partSize / 1024) : null,
    file_count: fileCount,
    cdn_origin:
      backend.kind === "WEBDAV" && !backend.partSize ? toCdnOriginHint(backend.baseUrl) : null,
    created_at: backend.createdAt,
    updated_at: backend.updatedAt,
  }
}
