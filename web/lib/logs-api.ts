import { requestJson } from "@/lib/api-client"

export type LogLevel = 0 | 1 | 2 | 3

export type ClientPlatform = "ios" | "android" | "windows" | "mac" | "web"

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
  platform: ClientPlatform | null
  created_at: number
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
