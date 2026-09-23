/** 文件存储与分发的环境配置。 */

import { resolve } from "node:path"

/** 上传分片大小（字节）。 */
export const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024

/** 未完成的上传会话保留时长（秒），超时由定时任务清理。 */
export const UPLOAD_SESSION_TTL_SECONDS = 24 * 3600

const DEFAULT_UPLOAD_MAX_MB = 4096

/** 存储根目录：`objects/` 存本机文件，`staging/` 存上传分片与转存中的临时文件。 */
export function storageRoot(): string {
  return resolve(process.env.VERHUB_STORAGE_DIR?.trim() || "storage")
}

/**
 * 分发域名的 origin（无尾斜杠），如 `https://cdn.verhub.example.com`。
 * 未配置时返回 null，此时文件只有相对路径 `/f/...`。
 */
export function distBaseUrl(): string | null {
  const raw = process.env.VERHUB_DIST_BASE_URL?.trim()
  if (!raw) {
    return null
  }
  return raw.replace(/\/+$/, "")
}

/** 单个文件的大小上限（字节），来自 `VERHUB_UPLOAD_MAX_MB`，默认 4096 MB。 */
export function uploadMaxBytes(): number {
  const parsed = Number(process.env.VERHUB_UPLOAD_MAX_MB)
  const mb = Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : DEFAULT_UPLOAD_MAX_MB
  return mb * 1024 * 1024
}
