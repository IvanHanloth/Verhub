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

export type VersionRuleCandidate = {
  id: string
  comparable_version?: string
  is_preview: boolean
  is_deprecated?: boolean
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

type ParsedComparableVersion = {
  core: number[]
  preTag: "alpha" | "beta" | "rc" | null
  preNumbers: number[]
}

const COMPARABLE_VERSION_PATTERN =
  /^(?<core>\d+(?:\.\d+)*)(?:-(?<tag>alpha|beta|rc)(?:\.(?<tail>\d+(?:\.\d+)*))?)?$/

const PRE_RELEASE_WEIGHT: Record<"alpha" | "beta" | "rc", number> = {
  alpha: 1,
  beta: 2,
  rc: 3,
}

function parseComparableVersion(value: string): ParsedComparableVersion | null {
  const match = COMPARABLE_VERSION_PATTERN.exec(value.trim())
  if (!match?.groups?.core) {
    return null
  }

  return {
    core: match.groups.core.split(".").map((item) => Number(item)),
    preTag: (match.groups.tag as ParsedComparableVersion["preTag"]) ?? null,
    preNumbers: match.groups.tail ? match.groups.tail.split(".").map((item) => Number(item)) : [],
  }
}

function compareNumberArray(left: number[], right: number[]): number {
  const maxLength = Math.max(left.length, right.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    if (leftValue === rightValue) {
      continue
    }

    return leftValue > rightValue ? 1 : -1
  }

  return 0
}

function compareComparableVersions(left: string, right: string): number | null {
  const parsedLeft = parseComparableVersion(left)
  const parsedRight = parseComparableVersion(right)
  if (!parsedLeft || !parsedRight) {
    return null
  }

  const coreDiff = compareNumberArray(parsedLeft.core, parsedRight.core)
  if (coreDiff !== 0) {
    return coreDiff
  }

  if (!parsedLeft.preTag && !parsedRight.preTag) {
    return 0
  }
  if (!parsedLeft.preTag && parsedRight.preTag) {
    return 1
  }
  if (parsedLeft.preTag && !parsedRight.preTag) {
    return -1
  }

  const leftWeight = PRE_RELEASE_WEIGHT[parsedLeft.preTag as "alpha" | "beta" | "rc"]
  const rightWeight = PRE_RELEASE_WEIGHT[parsedRight.preTag as "alpha" | "beta" | "rc"]
  if (leftWeight !== rightWeight) {
    return leftWeight > rightWeight ? 1 : -1
  }

  return compareNumberArray(parsedLeft.preNumbers, parsedRight.preNumbers)
}

/**
 * Validate version business rules on the frontend.
 * Returns error message if validation fails, null otherwise.
 */
export function validateVersionRules(
  form: VersionFormState,
  options?: {
    candidates?: VersionRuleCandidate[]
    editingVersionId?: string | null
  },
): string | null {
  // Rule: latest version cannot be deprecated
  if (form.is_latest && form.is_deprecated) {
    return "Latest 版本不能被标记为废弃。"
  }

  // Rule: deprecated version must have at least one newer stable, non-deprecated upgrade target.
  if (form.is_deprecated) {
    const currentComparable = form.comparable_version.trim()
    if (!currentComparable) {
      return "废弃版本必须提供可比较版本号。"
    }

    const hasNewerStable = (options?.candidates ?? []).some((item) => {
      if (options?.editingVersionId && item.id === options.editingVersionId) {
        return false
      }
      if (item.is_preview || item.is_deprecated) {
        return false
      }
      if (!item.comparable_version) {
        return false
      }

      const compareResult = compareComparableVersions(item.comparable_version, currentComparable)
      return compareResult !== null && compareResult > 0
    })

    if (!hasNewerStable) {
      return "废弃版本之后必须至少存在一个可升级到的正式版本（非预发布且非废弃）。"
    }
  }

  return null
}
