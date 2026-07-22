import { requestJson } from "@/lib/api-client"
import type { Platform } from "@/lib/platform"

export type LogLevel = 0 | 1 | 2 | 3

export type LogItem = {
  id: string
  level: LogLevel
  content: string
  device_info: unknown
  custom_data: unknown
  /** Server-observed caller origin; null on rows uploaded before it was captured. */
  ip: string | null
  user_agent: string | null
  country_code: string | null
  country_name: string | null
  region_name: string | null
  city: string | null
  platform: Platform | null
  platform_version: string | null
  created_at: number
}

export type LogMutationInput = {
  level: LogLevel
  content: string
  platform?: Platform
  platform_version?: string
  device_info?: Record<string, unknown>
  custom_data?: Record<string, unknown>
}

export type ListLogsParams = {
  limit: number
  offset: number
  level?: LogLevel
  start_time?: number
  end_time?: number
}

export type ListLogsResponse = {
  total: number
  data: LogItem[]
}

export async function listLogs(
  token: string,
  projectKey: string,
  params: ListLogsParams,
  signal?: AbortSignal,
): Promise<ListLogsResponse> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })

  if (params.level !== undefined) {
    query.set("level", String(params.level))
  }

  if (params.start_time !== undefined) {
    query.set("start_time", String(params.start_time))
  }

  if (params.end_time !== undefined) {
    query.set("end_time", String(params.end_time))
  }

  return requestJson<ListLogsResponse>(`/admin/projects/${projectKey}/logs?${query.toString()}`, {
    token,
    signal,
  })
}

/** 后台手动补录日志；来源字段（ip/UA/地理）由后端留空。 */
export async function createLog(
  token: string,
  projectKey: string,
  input: LogMutationInput,
): Promise<LogItem> {
  return requestJson<LogItem>(`/admin/projects/${projectKey}/logs`, {
    method: "POST",
    token,
    body: input,
  })
}
