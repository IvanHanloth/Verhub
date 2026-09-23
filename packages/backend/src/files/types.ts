/** 文件存储模块对外的视图类型。 */

export const STORAGE_KINDS = ["local", "webdav"] as const
export type StorageKindValue = (typeof STORAGE_KINDS)[number]

export const FILE_STATUSES = ["pending", "ready", "failed"] as const
export type FileStatusValue = (typeof FILE_STATUSES)[number]

export type FileSourceValue = "upload" | "github_release"

/** 零带宽模式下 CDN 直接回源 WebDAV 所需的配置参考。 */
export type CdnOriginHint = {
  /** 回源协议。 */
  scheme: "http" | "https"
  /** 回源地址（域名或 IP，含非默认端口）。 */
  host: string
  /** 回源路径前缀：CDN 请求 `/f/...` 需改写为 `{path_prefix}/f/...`，为空表示无需改写。 */
  path_prefix: string
}

export type StorageBackendView = {
  id: string
  name: string
  kind: StorageKindValue
  /** 内置本机存储，不可删除。 */
  is_builtin: boolean
  is_default: boolean
  base_url: string | null
  username: string | null
  has_password: boolean
  password_fingerprint: string | null
  /** 分片大小（KB）；为 null 表示整文件写入。 */
  part_size_kb: number | null
  /** 存放在此后端的文件数。 */
  file_count: number
  cdn_origin: CdnOriginHint | null
  created_at: number
  updated_at: number
}

export type StorageOverview = {
  /** 分发域名 origin，来自 VERHUB_DIST_BASE_URL。 */
  dist_base_url: string | null
  upload_max_bytes: number
  chunk_size: number
  backends: StorageBackendView[]
}

export type StoredFileView = {
  id: string
  project_key: string
  filename: string
  size: number
  sha256: string | null
  /** 在存储中按分片存放时的分片大小（字节），整文件存放为 null。 */
  part_size: number | null
  content_type: string
  status: FileStatusValue
  source: FileSourceValue
  source_url: string | null
  error: string | null
  storage_backend_id: string
  storage_backend_name: string
  /** 直链路径，以 `/f/` 开头。 */
  path: string
  /** 完整直链；未配置分发域名时为 null。 */
  url: string | null
  /** 下载链接引用了本文件的版本号。 */
  referenced_by: string[]
  created_at: number
  updated_at: number
}

export type StoredFileListResponse = {
  total: number
  data: StoredFileView[]
}

export type UploadSessionView = {
  upload_id: string
  filename: string
  size: number
  chunk_size: number
  total_chunks: number
  /** 已接收的分片序号。 */
  received_chunks: number[]
  storage_backend_id: string
  expires_at: number
}

/** 实例级 CDN 刷新配置视图。AccessKey Secret 永不回读，只给指纹。 */
export type CdnConfigView = {
  provider: "aliyun"
  enabled: boolean
  /** AccessKey ID 与 Secret 齐全。 */
  configured: boolean
  access_key_id: string | null
  has_access_key_secret: boolean
  access_key_secret_fingerprint: string | null
  /** 刷新的直链基于该分发域名；未配置时不会发起刷新。 */
  dist_base_url: string | null
  updated_at: number | null
}

export type CdnTestResult = {
  ok: boolean
  /** 当日剩余的 URL 刷新次数。 */
  url_remain: number | null
  url_quota: number | null
  latency_ms: number
  error: string | null
}

/** 一次 CDN 刷新的结果。 */
export type CdnRefreshResult = {
  ok: boolean
  urls: string[]
  task_ids: string[]
  error: string | null
}

/** 删除文件的结果。未启用 CDN 刷新时 cdn_refresh 为 null。 */
export type DeleteFileResult = {
  success: true
  cdn_refresh: CdnRefreshResult | null
}

export type MirrorAssetsResult = {
  /** 新加入镜像队列的附件数。 */
  queued: number
  /** 已镜像完成、直接替换为直链的附件数。 */
  reused: number
  /** 不是 GitHub Release 附件、未处理的链接数。 */
  skipped: number
}
