import {
  API_BASE_URL,
  ApiError,
  buildListQuery,
  requestJson,
  toApiErrorMessage,
} from "@/lib/api-client"

export type StorageKind = "local" | "webdav"

export type FileStatus = "pending" | "ready" | "failed"

/** CDN 直接回源 WebDAV 所需的配置参考。 */
export type CdnOriginHint = {
  scheme: "http" | "https"
  /** 回源地址，含非默认端口。 */
  host: string
  /** 回源路径前缀；为空表示无需改写路径。 */
  path_prefix: string
}

export type StorageBackendView = {
  id: string
  name: string
  kind: StorageKind
  is_builtin: boolean
  is_default: boolean
  base_url: string | null
  username: string | null
  has_password: boolean
  password_fingerprint: string | null
  /** 分片大小（KB）；null 表示整文件写入。 */
  part_size_kb: number | null
  file_count: number
  cdn_origin: CdnOriginHint | null
  created_at: number
  updated_at: number
}

export type StorageOverview = {
  /** 分发域名 origin，来自 VERHUB_DIST_BASE_URL；未配置为 null。 */
  dist_base_url: string | null
  upload_max_bytes: number
  chunk_size: number
  backends: StorageBackendView[]
}

export type CreateStorageBackendInput = {
  name: string
  kind: "webdav"
  base_url: string
  username?: string
  password?: string
  part_size_kb?: number | null
  is_default?: boolean
}

export type UpdateStorageBackendInput = {
  name?: string
  base_url?: string
  username?: string
  /** 空字符串表示清除。 */
  password?: string
  /** null 表示取消分片。 */
  part_size_kb?: number | null
  is_default?: true
}

export type StorageProbeResult = {
  ok: boolean
  range_supported: boolean | null
  /** 单次写入 2MB（或分片大小）是否成功。 */
  large_write_ok: boolean | null
  latency_ms: number
  error: string | null
}

export type StoredFileItem = {
  id: string
  project_key: string
  filename: string
  size: number
  sha256: string | null
  /** 按分片存放时的分片大小（字节）。 */
  part_size: number | null
  content_type: string
  status: FileStatus
  source: "upload" | "github_release"
  source_url: string | null
  error: string | null
  storage_backend_id: string
  storage_backend_name: string
  /** 直链路径，以 `/f/` 开头。 */
  path: string
  /** 完整直链；未配置分发域名时为 null。 */
  url: string | null
  referenced_by: string[]
  created_at: number
  updated_at: number
}

export type StoredFileListResponse = {
  total: number
  data: StoredFileItem[]
}

export type ListFilesQuery = {
  limit?: number
  offset?: number
  search?: string
  status?: FileStatus
}

export type UploadSession = {
  upload_id: string
  filename: string
  size: number
  chunk_size: number
  total_chunks: number
  received_chunks: number[]
  storage_backend_id: string
  expires_at: number
}

/** CDN 刷新配置。目前只支持阿里云，AccessKey Secret 永不回读。 */
export type CdnConfigView = {
  provider: "aliyun"
  enabled: boolean
  configured: boolean
  access_key_id: string | null
  has_access_key_secret: boolean
  access_key_secret_fingerprint: string | null
  dist_base_url: string | null
  updated_at: number | null
}

export type UpdateCdnConfigInput = {
  enabled?: boolean
  access_key_id?: string
  /** 只写不读；空字符串表示清除。 */
  access_key_secret?: string
}

export type CdnTestResult = {
  ok: boolean
  url_remain: number | null
  url_quota: number | null
  latency_ms: number
  error: string | null
}

export type CdnRefreshResult = {
  ok: boolean
  urls: string[]
  task_ids: string[]
  error: string | null
}

export type DeleteFileResult = {
  success: boolean
  /** 未启用 CDN 刷新时为 null。 */
  cdn_refresh: CdnRefreshResult | null
}

export type MirrorAssetsResult = {
  queued: number
  reused: number
  skipped: number
}

export async function getStorageOverview(
  token: string,
  signal?: AbortSignal,
): Promise<StorageOverview> {
  return requestJson<StorageOverview>("/admin/storage", { token, signal })
}

export async function createStorageBackend(
  token: string,
  input: CreateStorageBackendInput,
): Promise<StorageBackendView> {
  return requestJson<StorageBackendView>("/admin/storage/backends", {
    method: "POST",
    token,
    body: input,
  })
}

export async function updateStorageBackend(
  token: string,
  id: string,
  input: UpdateStorageBackendInput,
): Promise<StorageBackendView> {
  return requestJson<StorageBackendView>(`/admin/storage/backends/${encodeURIComponent(id)}`, {
    method: "PATCH",
    token,
    body: input,
  })
}

export async function deleteStorageBackend(token: string, id: string): Promise<void> {
  await requestJson(`/admin/storage/backends/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  })
}

/** 写入、按 Range 读回并删除一个探测文件。失败不抛异常，原因在 error 字段里。 */
export async function testStorageBackend(token: string, id: string): Promise<StorageProbeResult> {
  return requestJson<StorageProbeResult>(`/admin/storage/backends/${encodeURIComponent(id)}/test`, {
    method: "POST",
    token,
  })
}

export async function listFiles(
  token: string,
  projectKey: string,
  query: ListFilesQuery,
  signal?: AbortSignal,
): Promise<StoredFileListResponse> {
  const search = buildListQuery(query)
  return requestJson<StoredFileListResponse>(
    `/admin/projects/${projectKey}/files${search ? `?${search}` : ""}`,
    { token, signal },
  )
}

/** 删除文件。启用了 CDN 刷新时结果里带刷新结果。 */
export async function deleteFile(
  token: string,
  projectKey: string,
  fileId: string,
): Promise<DeleteFileResult> {
  return requestJson<DeleteFileResult>(`/admin/projects/${projectKey}/files/${fileId}`, {
    method: "DELETE",
    token,
  })
}

/** 刷新文件直链的 CDN 缓存。接口失败不抛异常，原因在 error 字段里。 */
export async function refreshFileCdn(
  token: string,
  projectKey: string,
  fileId: string,
): Promise<CdnRefreshResult> {
  return requestJson<CdnRefreshResult>(
    `/admin/projects/${projectKey}/files/${fileId}/refresh-cdn`,
    { method: "POST", token },
  )
}

export async function getCdnConfig(token: string, signal?: AbortSignal): Promise<CdnConfigView> {
  return requestJson<CdnConfigView>("/admin/storage/cdn", { token, signal })
}

export async function updateCdnConfig(
  token: string,
  input: UpdateCdnConfigInput,
): Promise<CdnConfigView> {
  return requestJson<CdnConfigView>("/admin/storage/cdn", { method: "PUT", token, body: input })
}

export async function clearCdnConfig(token: string): Promise<CdnConfigView> {
  return requestJson<CdnConfigView>("/admin/storage/cdn", { method: "DELETE", token })
}

/** 用已保存的凭据查询刷新余量。失败不抛异常，原因在 error 字段里。 */
export async function testCdnConfig(token: string): Promise<CdnTestResult> {
  return requestJson<CdnTestResult>("/admin/storage/cdn/test", { method: "POST", token })
}

export async function retryFile(
  token: string,
  projectKey: string,
  fileId: string,
): Promise<StoredFileItem> {
  return requestJson<StoredFileItem>(`/admin/projects/${projectKey}/files/${fileId}/retry`, {
    method: "POST",
    token,
  })
}

/** 镜像版本下载链接中的 GitHub Release 附件。 */
export async function mirrorVersionAssets(
  token: string,
  projectKey: string,
  versionId: string,
): Promise<MirrorAssetsResult> {
  return requestJson<MirrorAssetsResult>(
    `/admin/projects/${projectKey}/versions/${versionId}/mirror-assets`,
    { method: "POST", token },
  )
}

const GITHUB_ASSET_PATTERN =
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/?#]+$/

/** 是否为 GitHub Release 附件下载地址。 */
export function isGithubReleaseAsset(url: string): boolean {
  return GITHUB_ASSET_PATTERN.test(url.trim())
}

/** 直链的完整地址：配置了分发域名用它，否则用当前站点 origin 拼接路径。 */
export function resolveFileUrl(file: Pick<StoredFileItem, "url" | "path">): string {
  if (file.url) {
    return file.url
  }
  return typeof window === "undefined"
    ? file.path
    : new URL(file.path, window.location.origin).toString()
}

const CHUNK_RETRIES = 3

/**
 * 分片上传一个文件，返回登记后的文件。
 *
 * - `onProgress` 以已上传字节数回调
 * - `signal` 取消后放弃会话并抛出 AbortError
 * - 单个分片失败重试 3 次
 */
export async function uploadFile(options: {
  token: string
  projectKey: string
  file: File
  storageBackendId?: string
  onProgress?: (uploadedBytes: number) => void
  signal?: AbortSignal
}): Promise<StoredFileItem> {
  const { token, projectKey, file, signal } = options
  const session = await requestJson<UploadSession>(`/admin/projects/${projectKey}/files/uploads`, {
    method: "POST",
    token,
    body: {
      filename: file.name,
      size: file.size,
      ...(options.storageBackendId ? { storage_backend_id: options.storageBackendId } : {}),
    },
    signal,
  })

  const basePath = `/admin/projects/${projectKey}/files/uploads/${session.upload_id}`
  let uploaded = 0

  try {
    for (let index = 0; index < session.total_chunks; index += 1) {
      const start = index * session.chunk_size
      const blob = file.slice(start, Math.min(file.size, start + session.chunk_size))
      await putChunkWithRetry(`${basePath}/chunks/${index}`, token, blob, signal)
      uploaded += blob.size
      options.onProgress?.(uploaded)
    }

    return await requestJson<StoredFileItem>(`${basePath}/complete`, {
      method: "POST",
      token,
      signal,
    })
  } catch (error) {
    if (signal?.aborted) {
      void requestJson(basePath, { method: "DELETE", token }).catch(() => undefined)
    }
    throw error
  }
}

async function putChunkWithRetry(
  path: string,
  token: string,
  blob: Blob,
  signal?: AbortSignal,
): Promise<void> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < CHUNK_RETRIES; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
        body: blob,
        signal,
      })
      if (response.ok) {
        return
      }
      const payload = await response.json().catch(() => null)
      const error = new ApiError(
        toApiErrorMessage(payload, response.status),
        response.status,
        payload,
      )
      if (response.status < 500) {
        throw error
      }
      lastError = error
    } catch (error) {
      if (signal?.aborted || (error instanceof ApiError && error.status < 500)) {
        throw error
      }
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
  }
  throw lastError instanceof Error ? lastError : new ApiError("分片上传失败", 0)
}

/** 字节数的可读形式（1024 进制）。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${bytes} B`
  }
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`
}
