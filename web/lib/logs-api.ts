import { buildListQuery, requestJson } from "@/lib/api-client"
import type { Platform } from "@/lib/platform"

export type LogLevel = 0 | 1 | 2 | 3

export type LogItem = {
  id: string
  level: LogLevel
  content: string
  device_info: unknown
  custom_data: unknown
  /** 隐藏的日志默认不出现在列表里，等级统计仍计入。 */
  is_hidden: boolean
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
  is_hidden?: boolean
}

export type ListLogsParams = {
  limit: number
  offset: number
  level?: LogLevel
  platform?: Platform
  search?: string
  start_time?: number
  end_time?: number
  include_hidden?: boolean
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
  const query = buildListQuery({
    limit: params.limit,
    offset: params.offset,
    level: params.level,
    platform: params.platform,
    search: params.search,
    start_time: params.start_time,
    end_time: params.end_time,
    include_hidden: params.include_hidden ? "true" : undefined,
  })

  return requestJson<ListLogsResponse>(`/admin/projects/${projectKey}/logs?${query}`, {
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

/** 只能改可见性；日志的内容与来源写入后不可修改。 */
export async function updateLogVisibility(
  token: string,
  projectKey: string,
  id: string,
  isHidden: boolean,
): Promise<LogItem> {
  return requestJson<LogItem>(`/admin/projects/${projectKey}/logs/${id}`, {
    method: "PATCH",
    token,
    body: { is_hidden: isHidden },
  })
}
