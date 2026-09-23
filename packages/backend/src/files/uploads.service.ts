import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common"
import { randomBytes } from "node:crypto"
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Readable } from "node:stream"

import { ProjectResolverService } from "../database/project-resolver.service"
import { nowSeconds } from "../common/utils"
import { CreateUploadDto } from "./dto/upload.dto"
import { sanitizeFilename } from "./file-naming"
import {
  storageRoot,
  UPLOAD_CHUNK_SIZE,
  UPLOAD_SESSION_TTL_SECONDS,
  uploadMaxBytes,
} from "./files-config"
import { StorageBackendsService } from "./storage-backends.service"
import { concatWithHash, SizeLimitError, writeWithHash } from "./stream-utils"
import type { UploadSessionView } from "./types"

const UPLOAD_ID_PATTERN = /^[a-f0-9]{32}$/

/** 上传会话元数据，存于会话目录的 meta.json。 */
type UploadMeta = {
  projectKey: string
  filename: string
  size: number
  chunkSize: number
  storageBackendId: string
  createdAt: number
}

/** 合并完成、待登记入库的文件。 */
export type AssembledUpload = {
  projectKey: string
  filename: string
  storageBackendId: string
  path: string
  bytes: number
  sha256: string
}

function uploadsRoot(): string {
  return join(storageRoot(), "staging", "uploads")
}

/** 分片上传会话。分片与元数据存放在 `{VERHUB_STORAGE_DIR}/staging/uploads/{uploadId}/`。 */
@Injectable()
export class UploadsService {
  constructor(
    private readonly projectResolver: ProjectResolverService,
    private readonly backends: StorageBackendsService,
  ) {}

  async create(projectKey: string, dto: CreateUploadDto): Promise<UploadSessionView> {
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
    const filename = sanitizeFilename(dto.filename)
    if (!filename) {
      throw new BadRequestException("filename is invalid")
    }
    const limit = uploadMaxBytes()
    if (dto.size > limit) {
      throw new PayloadTooLargeException(`File exceeds the ${limit} byte limit`)
    }

    const backend = await this.backends.resolveForProject(canonicalKey, dto.storage_backend_id)
    const uploadId = randomBytes(16).toString("hex")
    const meta: UploadMeta = {
      projectKey: canonicalKey,
      filename,
      size: dto.size,
      chunkSize: UPLOAD_CHUNK_SIZE,
      storageBackendId: backend.id,
      createdAt: nowSeconds(),
    }

    const dir = join(uploadsRoot(), uploadId)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "meta.json"), JSON.stringify(meta))
    return toSessionView(uploadId, meta, [])
  }

  async status(projectKey: string, uploadId: string): Promise<UploadSessionView> {
    const meta = await this.readMeta(projectKey, uploadId)
    return toSessionView(uploadId, meta, await this.receivedChunks(uploadId))
  }

  /** 写入一个分片。分片长度必须与会话约定一致，重复写入覆盖旧分片。 */
  async putChunk(
    projectKey: string,
    uploadId: string,
    index: number,
    body: Readable,
  ): Promise<{ index: number; bytes: number }> {
    const meta = await this.readMeta(projectKey, uploadId)
    const total = totalChunks(meta)
    if (!Number.isInteger(index) || index < 0 || index >= total) {
      throw new BadRequestException(`Chunk index must be between 0 and ${total - 1}`)
    }

    const expected = index < total - 1 ? meta.chunkSize : meta.size - meta.chunkSize * (total - 1)
    const dir = join(uploadsRoot(), uploadId)
    const temp = join(dir, `${index}.part.tmp`)

    let bytes: number
    try {
      bytes = (await writeWithHash(body, temp, expected)).bytes
    } catch (error) {
      await rm(temp, { force: true })
      if (error instanceof SizeLimitError) {
        throw new BadRequestException(`Chunk ${index} must be exactly ${expected} bytes`)
      }
      throw error
    }

    if (bytes !== expected) {
      await rm(temp, { force: true })
      throw new BadRequestException(
        `Chunk ${index} must be exactly ${expected} bytes, got ${bytes}`,
      )
    }
    await rename(temp, join(dir, `${index}.part`))
    return { index, bytes }
  }

  /** 合并全部分片到 target，校验总长度后删除会话目录。 */
  async assemble(projectKey: string, uploadId: string, target: string): Promise<AssembledUpload> {
    const meta = await this.readMeta(projectKey, uploadId)
    const total = totalChunks(meta)
    const received = new Set(await this.receivedChunks(uploadId))
    const missing = Array.from({ length: total }, (_, index) => index).filter(
      (index) => !received.has(index),
    )
    if (missing.length > 0) {
      throw new ConflictException(`Missing chunks: ${missing.slice(0, 20).join(", ")}`)
    }

    const dir = join(uploadsRoot(), uploadId)
    await mkdir(join(target, ".."), { recursive: true })
    const parts = Array.from({ length: total }, (_, index) => join(dir, `${index}.part`))
    const { bytes, sha256 } = await concatWithHash(parts, target)
    if (bytes !== meta.size) {
      await rm(target, { force: true })
      throw new ConflictException(`Assembled ${bytes} bytes, expected ${meta.size}`)
    }

    await rm(dir, { recursive: true, force: true })
    return {
      projectKey: meta.projectKey,
      filename: meta.filename,
      storageBackendId: meta.storageBackendId,
      path: target,
      bytes,
      sha256,
    }
  }

  async abort(projectKey: string, uploadId: string): Promise<void> {
    await this.readMeta(projectKey, uploadId)
    await rm(join(uploadsRoot(), uploadId), { recursive: true, force: true })
  }

  /** 删除超过保留时长的会话，返回删除数。 */
  async cleanupExpired(): Promise<number> {
    let entries: string[]
    try {
      entries = await readdir(uploadsRoot())
    } catch {
      return 0
    }

    const deadline = nowSeconds() - UPLOAD_SESSION_TTL_SECONDS
    let removed = 0
    for (const entry of entries) {
      const dir = join(uploadsRoot(), entry)
      const meta = await readFile(join(dir, "meta.json"), "utf8")
        .then((raw) => JSON.parse(raw) as UploadMeta)
        .catch(() => null)
      if (!meta || meta.createdAt < deadline) {
        await rm(dir, { recursive: true, force: true })
        removed += 1
      }
    }
    return removed
  }

  private async readMeta(projectKey: string, uploadId: string): Promise<UploadMeta> {
    if (!UPLOAD_ID_PATTERN.test(uploadId)) {
      throw new NotFoundException("Upload session not found")
    }
    const canonicalKey = await this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
    const meta = await readFile(join(uploadsRoot(), uploadId, "meta.json"), "utf8")
      .then((raw) => JSON.parse(raw) as UploadMeta)
      .catch(() => null)
    if (!meta || meta.projectKey !== canonicalKey) {
      throw new NotFoundException("Upload session not found")
    }
    return meta
  }

  private async receivedChunks(uploadId: string): Promise<number[]> {
    const entries = await readdir(join(uploadsRoot(), uploadId)).catch(() => [] as string[])
    return entries
      .map((name) => /^(\d+)\.part$/.exec(name)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number)
      .sort((a, b) => a - b)
  }
}

function totalChunks(meta: UploadMeta): number {
  return Math.max(1, Math.ceil(meta.size / meta.chunkSize))
}

function toSessionView(uploadId: string, meta: UploadMeta, received: number[]): UploadSessionView {
  return {
    upload_id: uploadId,
    filename: meta.filename,
    size: meta.size,
    chunk_size: meta.chunkSize,
    total_chunks: totalChunks(meta),
    received_chunks: received,
    storage_backend_id: meta.storageBackendId,
    expires_at: meta.createdAt + UPLOAD_SESSION_TTL_SECONDS,
  }
}
