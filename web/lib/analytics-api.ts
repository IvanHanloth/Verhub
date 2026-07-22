import { requestJson } from "@/lib/api-client"

/** Mirrors the backend `PublicEndpoint` enum. */
export type PublicEndpoint =
  | "PROJECT_DETAIL"
  | "VERSION_LIST"
  | "VERSION_LATEST"
  | "VERSION_LATEST_PREVIEW"
  | "VERSION_BY_VERSION"
  | "VERSION_CHECK_UPDATE"
  | "ANNOUNCEMENT_LIST"
  | "ANNOUNCEMENT_LATEST"
  | "FEEDBACK_SUBMIT"
  | "LOG_UPLOAD"
  | "ACTION_RECORD"

/** Mirrors the backend `StatPlatform` enum. */
export type StatPlatform = "IOS" | "ANDROID" | "WINDOWS" | "MAC" | "WEB" | "UNKNOWN"

export type Granularity = "hour" | "day"

export type RequestStatsOverview = {
  start_time: number
  end_time: number
  total: number
  by_endpoint: { endpoint: PublicEndpoint; count: number }[]
  by_platform: { platform: StatPlatform; count: number }[]
  by_region: { region: string; count: number }[]
  /**
   * 国内省份分布：省级行政区划码（GB/T 2260）+ 标准中文省名 + 计数。仅有中国大陆
   * 流量时非空，驱动中国省级热力地图。境外流量只体现在 `by_region` 的国家分布。
   */
  by_province: { code: string; name: string; count: number }[]
}

export type RequestStatsTimeseries = {
  start_time: number
  end_time: number
  granularity: Granularity
  tz_offset_minutes: number
  endpoint: PublicEndpoint | null
  /** For `day` granularity the bucket is the instant local midnight started. */
  data: { bucket: number; count: number }[]
}

export type ClientVersionStats = {
  start_time: number
  end_time: number
  /** Across every version in range, not just the returned rows — the share denominator. */
  total: number
  data: { version: string; count: number }[]
}

export type RequestStatsHeatmap = {
  start_time: number
  end_time: number
  tz_offset_minutes: number
  /**
   * Always 168 cells: weekday 0=Sunday..6, hour 0..23，按每条请求的**来源当地时区**
   * （由国家码推定）折叠；`tz_offset_minutes` 仅作无法定位来源时的兜底。
   */
  data: { weekday: number; hour: number; count: number }[]
}

/** Human-readable endpoint names, keyed by the backend enum. */
export const ENDPOINT_LABELS: Record<PublicEndpoint, string> = {
  PROJECT_DETAIL: "项目详情",
  VERSION_LIST: "版本列表",
  VERSION_LATEST: "最新版本",
  VERSION_LATEST_PREVIEW: "最新预览版",
  VERSION_BY_VERSION: "指定版本查询",
  VERSION_CHECK_UPDATE: "检查更新",
  ANNOUNCEMENT_LIST: "公告列表",
  ANNOUNCEMENT_LATEST: "最新公告",
  FEEDBACK_SUBMIT: "反馈提交",
  LOG_UPLOAD: "日志上报",
  ACTION_RECORD: "行为记录",
}

export const PLATFORM_LABELS: Record<StatPlatform, string> = {
  IOS: "iOS",
  ANDROID: "Android",
  WINDOWS: "Windows",
  MAC: "macOS",
  WEB: "Web",
  UNKNOWN: "未知",
}

/** Sentinel country codes the backend records when an address cannot be placed. */
export const UNKNOWN_REGION = "UNKNOWN"
export const LOCAL_REGION = "LOCAL"

/**
 * Minutes east of UTC for the viewer's browser.
 *
 * `getTimezoneOffset` reports minutes *west*, so the sign is flipped — sending
 * it unflipped mirrors every heatmap around UTC, which looks plausible and is
 * completely wrong.
 */
export function localTzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset()
}

/**
 * Localized country name for a region bucket.
 *
 * `Intl.DisplayNames` ships with the browser, so a full ISO-3166 table does not
 * have to live in the bundle. Unsupported environments and unknown codes fall
 * back to the raw code, which is still readable.
 */
export function regionLabel(code: string): string {
  if (code === UNKNOWN_REGION) return "未知"
  if (code === LOCAL_REGION) return "内网/本机"

  try {
    return new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

type RangeParams = {
  startTime?: number
  endTime?: number
}

function toSearchParams(
  range: RangeParams,
  extra: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams()
  if (range.startTime !== undefined) params.set("start_time", String(range.startTime))
  if (range.endTime !== undefined) params.set("end_time", String(range.endTime))
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) params.set(key, value)
  }
  const query = params.toString()
  return query ? `?${query}` : ""
}

export async function getRequestStatsOverview(
  token: string,
  projectKey: string,
  range: RangeParams = {},
  signal?: AbortSignal,
): Promise<RequestStatsOverview> {
  return requestJson<RequestStatsOverview>(
    `/admin/projects/${encodeURIComponent(projectKey)}/stats/requests/overview${toSearchParams(range)}`,
    { token, signal },
  )
}

export async function getClientVersionStats(
  token: string,
  projectKey: string,
  range: RangeParams = {},
  limit?: number,
  signal?: AbortSignal,
): Promise<ClientVersionStats> {
  return requestJson<ClientVersionStats>(
    `/admin/projects/${encodeURIComponent(projectKey)}/stats/requests/client-versions${toSearchParams(
      range,
      { limit: limit === undefined ? undefined : String(limit) },
    )}`,
    { token, signal },
  )
}

export async function getRequestStatsHeatmap(
  token: string,
  projectKey: string,
  range: RangeParams = {},
  signal?: AbortSignal,
): Promise<RequestStatsHeatmap> {
  return requestJson<RequestStatsHeatmap>(
    `/admin/projects/${encodeURIComponent(projectKey)}/stats/requests/heatmap${toSearchParams(
      range,
      { tz_offset_minutes: String(localTzOffsetMinutes()) },
    )}`,
    { token, signal },
  )
}

export async function getRequestStatsTimeseries(
  token: string,
  projectKey: string,
  range: RangeParams = {},
  granularity: Granularity = "hour",
  endpoint?: PublicEndpoint,
  signal?: AbortSignal,
): Promise<RequestStatsTimeseries> {
  return requestJson<RequestStatsTimeseries>(
    `/admin/projects/${encodeURIComponent(projectKey)}/stats/requests/timeseries${toSearchParams(
      range,
      { granularity, endpoint, tz_offset_minutes: String(localTzOffsetMinutes()) },
    )}`,
    { token, signal },
  )
}
