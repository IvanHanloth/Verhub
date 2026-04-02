import type { ClientPlatform, CreateVersionInput, VersionDownloadLink } from "@/lib/versions-api"

export const platformOptions: Array<{ label: string; value: ClientPlatform }> = [
  { label: "iOS", value: "ios" },
  { label: "Android", value: "android" },
  { label: "Windows", value: "windows" },
  { label: "macOS", value: "mac" },
  { label: "Web", value: "web" },
]

export type VersionFormState = {
  version: string
  comparable_version: string
  title: string
  content: string
  download_url: string
  download_links_json: string
  is_latest: boolean
  is_preview: boolean
  is_milestone: boolean
  is_deprecated: boolean
  published_at: string
  platforms: ClientPlatform[]
  custom_data: string
}

export const emptyVersionForm: VersionFormState = {
  version: "",
  comparable_version: "",
  title: "",
  content: "",
  download_url: "",
  download_links_json: "",
  is_latest: true,
  is_preview: false,
  is_milestone: false,
  is_deprecated: false,
  published_at: "",
  platforms: [],
  custom_data: "",
}

export function toDateTimeLocal(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000)
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

export function toTimestampSeconds(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const millis = Date.parse(trimmed)
  if (Number.isNaN(millis)) {
    throw new Error("发布时间格式不正确")
  }

  return Math.floor(millis / 1000)
}

export function parseJsonInput(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = JSON.parse(trimmed) as unknown
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("custom_data 必须是 JSON 对象。")
  }

  return parsed as Record<string, unknown>
}

export function parseDownloadLinks(value: string): VersionDownloadLink[] | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = JSON.parse(trimmed) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error("download_links 必须是数组。")
  }

  const links = parsed
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      url: typeof item.url === "string" ? item.url.trim() : "",
      name: typeof item.name === "string" ? item.name.trim() : undefined,
      platform: typeof item.platform === "string" ? item.platform.trim() : undefined,
    }))
    .filter((item) => item.url.length > 0)

  return links
}

export function toCreateInput(form: VersionFormState): CreateVersionInput {
  const trimmedDownloadUrl = form.download_url.trim()
  const trimmedTitle = form.title.trim()
  const trimmedContent = form.content.trim()

  return {
    version: form.version.trim(),
    comparable_version: form.comparable_version.trim(),
    title: trimmedTitle || undefined,
    content: trimmedContent || undefined,
    download_url: trimmedDownloadUrl || undefined,
    download_links: parseDownloadLinks(form.download_links_json),
    is_latest: form.is_latest,
    is_preview: form.is_preview,
    is_milestone: form.is_milestone,
    is_deprecated: form.is_deprecated,
    platforms: form.platforms,
    platform: form.platforms[0],
    custom_data: parseJsonInput(form.custom_data),
    published_at: toTimestampSeconds(form.published_at),
  }
}

/**
 * Validate version business rules on the frontend.
 * Returns error message if validation fails, null otherwise.
 */
export function validateVersionRules(form: VersionFormState): string | null {
  // Rule: latest version cannot be deprecated
  if (form.is_latest && form.is_deprecated) {
    return "Latest 版本不能被标记为废弃。"
  }

  return null
}
