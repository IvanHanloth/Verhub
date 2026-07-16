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
}

export type RequestStatsTimeseries = {
  start_time: number
  end_time: number
  granularity: Granularity
  endpoint: PublicEndpoint | null
  data: { bucket: number; count: number }[]
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
      { granularity, endpoint },
    )}`,
    { token, signal },
  )
}
