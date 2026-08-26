/**
 * Shared type definitions for the versions module.
 *
 * Extracted to avoid circular dependencies between split services
 * (VersionsService, GithubReleaseService, VersionUpdateCheckService).
 */

import { Prisma, Platform } from "@prisma/client"

import type { PlatformValue } from "../common/platform"

/** 一份版本译文，语义同公告译文：留空的字段回落版本自身的值。 */
export type VersionTranslationItem = {
  locale: string
  title: string | null
  content: string | null
}

/** API-facing version item with snake_case fields. */
export type VersionItem = {
  id: string
  version: string
  comparable_version: string
  title: string | null
  content: string | null
  /**
   * 本次返回的 title / content 实际来自哪个语言，`null` = 版本自身的默认内容。
   * 让客户端一眼看出有没有发生回落。管理端与公开端都返回，与 AnnouncementItem 同口径。
   */
  locale: string | null
  /** 全部译文，只在管理接口返回，供后台编辑。 */
  translations?: VersionTranslationItem[]
  download_url: string | null
  download_links: Array<{ url: string; name?: string; platform?: string }>
  forced: boolean
  is_latest: boolean
  is_preview: boolean
  is_milestone: boolean
  is_deprecated: boolean
  platforms: PlatformValue[]
  platform: PlatformValue | null
  custom_data: Prisma.JsonValue | null
  published_at: number
  created_at: number
}

/** Paginated version list response. */
export type VersionListResponse = {
  total: number
  data: VersionItem[]
}

/** GitHub release preview for pre-fill. */
export type GithubReleasePreview = {
  version: string
  comparable_version: string
  title?: string
  content?: string
  download_url?: string
  download_links: Array<{ url: string; name?: string; platform?: string }>
  forced: boolean
  is_latest: boolean
  is_preview: boolean
  is_milestone: boolean
  is_deprecated: boolean
  published_at: number
  custom_data: Record<string, unknown>
}

/** GitHub release batch import result. */
export type VersionImportResult = {
  imported: number
  skipped: number
  scanned: number
}

/** Internal Prisma version record shape used across services. */
export type VersionRecord = {
  id: string
  projectKey: string
  version: string
  comparableVersion: string | null
  /** comparableVersion 的定长排序键，仅供数据库排序，不出现在任何响应里。 */
  comparableVersionSort: string | null
  title: string | null
  content: string | null
  downloadUrl: string | null
  forced: boolean
  isLatest: boolean
  isPreview: boolean
  isMilestone: boolean
  isDeprecated: boolean
  platforms: Platform[]
  platform: Platform | null
  customData: Prisma.JsonValue | null
  downloadLinks: Prisma.JsonValue | null
  publishedAt: number
  createdAt: number
  /**
   * 随记录一起查出来的译文。公开端只 include 请求的那一个语言，管理端 include 全部；
   * 没 include 时是 undefined，与「这个版本没有译文」（空数组）不同。
   */
  translations?: Array<{ locale: string; title: string | null; content: string | null }>
}

/** Update check response returned to clients. */
export type CheckVersionUpdateResponse = {
  should_update: boolean
  required: boolean
  reason_codes: string[]
  current_version: string | null
  current_comparable_version: string
  latest_version: VersionItem
  latest_preview_version: VersionItem | null
  target_version: VersionItem | null
  milestone: {
    current: boolean
    latest: boolean
    target_is_milestone: boolean
  }
}

// Re-export shared utilities so existing imports from this file continue to work.
export { nowSeconds, normalizeProjectKey } from "../common/utils"
