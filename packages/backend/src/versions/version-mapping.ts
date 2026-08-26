/**
 * Pure mapping helpers for converting between Prisma Version records and API items.
 *
 * Why separated: These functions are used by all three version sub-services
 * (CRUD, GitHub release, update check). Centralising them avoids duplication
 * and keeps each service focused on its own domain logic.
 */

import { Platform, Prisma } from "@prisma/client"

import { fromPlatform, fromPlatforms, type PlatformValue } from "../common/platform"
import type { VersionItem, VersionRecord } from "./types"

/**
 * 公开端只取请求语言那一份译文。语言没命中注册表时用一个恒假的 where，
 * 让 Prisma 返回空数组——比在结果里再过滤一遍少一次遍历，也少一条分支。
 *
 * 凡是查出来要进响应的版本记录都得带上它，漏掉的话语言回落会静默失效。
 */
export function translationInclude(locale: string | null): {
  translations: { where: { locale: string } }
} {
  return { translations: { where: { locale: locale ?? "" } } }
}

/**
 * Convert a Prisma Version record to the API-facing VersionItem shape.
 *
 * @param options.locale 公开端请求的语言（已归一到主标签）。译文按字段覆盖：
 *   标题与更新说明各自留空就回落版本自身的值，所以永远有东西可返回。
 * @param options.includeTranslations 后台接口带出全部译文供编辑；公开端不带。
 */
export function toVersionItem(
  version: VersionRecord,
  options: { locale?: string | null; includeTranslations?: boolean } = {},
): VersionItem {
  const normalizedLinks = parseDownloadLinks(version.downloadLinks)
  const translations = version.translations ?? []
  const translation = options.locale
    ? translations.find((item) => item.locale === options.locale)
    : undefined
  const title = translation?.title ?? null
  const content = translation?.content ?? null

  return {
    id: version.id,
    version: version.version,
    comparable_version: version.comparableVersion ?? version.version,
    title: title ?? version.title,
    content: content ?? version.content,
    // 只有真的覆盖了内容才算「返回的是该语言的译文」，与公告同一口径。
    locale: title || content ? (translation?.locale ?? null) : null,
    ...(options.includeTranslations
      ? {
          translations: translations.map((item) => ({
            locale: item.locale,
            title: item.title,
            content: item.content,
          })),
        }
      : {}),
    download_url: version.downloadUrl,
    download_links:
      normalizedLinks.length > 0
        ? normalizedLinks
        : version.downloadUrl
          ? [{ url: version.downloadUrl }]
          : [],
    forced: version.forced,
    is_latest: version.isLatest,
    is_preview: version.isPreview,
    is_milestone: version.isMilestone,
    is_deprecated: version.isDeprecated,
    platforms: fromPlatforms(version.platforms),
    platform: fromPlatform(version.platform),
    custom_data: version.customData,
    published_at: version.publishedAt,
    created_at: version.createdAt,
  }
}

// ── Platform conversion ──

/**
 * 版本的发布目标列表。单数 `platform` 是数组字段出现之前的旧字段，仍作为
 * 未提供 `platforms` 时的兜底，避免老调用方升级后发布目标凭空清空。
 */
export function toPlatforms(
  platforms: PlatformValue[] | undefined,
  fallbackPlatform: PlatformValue | undefined,
): Platform[] {
  if (platforms && platforms.length > 0) {
    return Array.from(new Set(platforms.map((item) => item.trim().toUpperCase() as Platform)))
  }

  if (fallbackPlatform) {
    return [fallbackPlatform.trim().toUpperCase() as Platform]
  }

  return []
}

// ── Download link helpers ──

export function parseDownloadLinks(
  value: Prisma.JsonValue | null,
): Array<{ url: string; name?: string; platform?: string }> {
  if (!Array.isArray(value)) {
    return []
  }

  const result: Array<{ url: string; name?: string; platform?: string }> = []
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue
    }

    const jsonObject = item as Prisma.JsonObject
    const rawUrl = jsonObject.url
    if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
      continue
    }

    result.push({
      url: rawUrl,
      name: typeof jsonObject.name === "string" ? jsonObject.name : undefined,
      platform: typeof jsonObject.platform === "string" ? jsonObject.platform : undefined,
    })
  }

  return result
}

export function normalizeDownloadLinks(
  links: Array<{ url: string; name?: string; platform?: string }>,
): Array<{ url: string; name?: string; platform?: string }> {
  return links
    .map((item) => ({
      url: item.url.trim(),
      name: item.name?.trim() || undefined,
      platform: item.platform?.trim() || undefined,
    }))
    .filter((item) => item.url.length > 0)
}

/**
 * Resolve the effective download URL and links from the incoming DTO,
 * optionally falling back to the current persisted values during update.
 *
 * `undefined` means "not supplied" and falls back to the current value, while
 * an explicit `null` clears the stored value. Keep the two apart at call sites.
 */
export function resolveDownloadData(
  downloadUrl: string | null | undefined,
  downloadLinks: Array<{ url: string; name?: string; platform?: string }> | undefined,
  currentDownloadUrl?: string | null,
  currentDownloadLinks?: Array<{ url: string; name?: string; platform?: string }>,
): {
  downloadUrl: string | null | undefined
  downloadLinks: Array<{ url: string; name?: string; platform?: string }> | undefined
} {
  if (downloadLinks !== undefined) {
    const normalized = normalizeDownloadLinks(downloadLinks)
    const urlFromLinks = normalized[0]?.url
    return {
      downloadUrl: downloadUrl === undefined ? (urlFromLinks ?? null) : (downloadUrl ?? null),
      downloadLinks: normalized,
    }
  }

  if (downloadUrl !== undefined) {
    return {
      downloadUrl: downloadUrl ?? null,
      downloadLinks: downloadUrl ? [{ url: downloadUrl }] : [],
    }
  }

  return {
    downloadUrl: currentDownloadUrl,
    downloadLinks: currentDownloadLinks,
  }
}

/** Strip leading `v`/`V` prefix from a git tag. */
export function normalizeVersionTag(tag: string): string {
  const trimmed = tag.trim()
  if (!trimmed) {
    return trimmed
  }
  return trimmed.startsWith("v") || trimmed.startsWith("V") ? trimmed.slice(1) : trimmed
}

/** Convert GitHub release assets to our download link format. */
export function toGithubReleaseDownloadLinks(
  assets: Array<{ name?: string; browser_download_url?: string }> | undefined,
): Array<{ url: string; name?: string }> {
  return (assets ?? [])
    .filter(
      (asset): asset is { name?: string; browser_download_url: string } =>
        typeof asset.browser_download_url === "string" && asset.browser_download_url.length > 0,
    )
    .map((asset) => ({
      url: asset.browser_download_url,
      name: asset.name?.trim() || undefined,
    }))
}

// Re-export for backward compatibility with existing imports.
export { isUniqueViolation } from "../common/utils"
