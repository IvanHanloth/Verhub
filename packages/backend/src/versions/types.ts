/**
 * Shared type definitions for the versions module.
 *
 * Extracted to avoid circular dependencies between split services
 * (VersionsService, GithubReleaseService, VersionUpdateCheckService).
 */

import { Prisma, ClientPlatform } from "@prisma/client"

/** API-facing version item with snake_case fields. */
export type VersionItem = {
  id: string
  version: string
  comparable_version: string
  title: string | null
  content: string | null
  download_url: string | null
  download_links: Array<{ url: string; name?: string; platform?: string }>
  forced: boolean
  is_latest: boolean
  is_preview: boolean
  is_milestone: boolean
  is_deprecated: boolean
  platforms: Array<"ios" | "android" | "windows" | "mac" | "web">
  platform: "ios" | "android" | "windows" | "mac" | "web" | null
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
  title: string | null
  content: string | null
  downloadUrl: string | null
  forced: boolean
  isLatest: boolean
  isPreview: boolean
  isMilestone: boolean
  isDeprecated: boolean
  platforms: ClientPlatform[]
  platform: ClientPlatform | null
  customData: Prisma.JsonValue | null
  downloadLinks: Prisma.JsonValue | null
  publishedAt: number
  createdAt: number
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
