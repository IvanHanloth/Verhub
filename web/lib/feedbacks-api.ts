import { buildListQuery, requestJson } from "@/lib/api-client"
import type { Platform } from "@/lib/platform"

export type FeedbackItem = {
  id: string
  user_id: string | null
  rating: number | null
  content: string
  /** 提交者留下的联系方式；未填写为 null。 */
  contact: string | null
  /** 隐藏的反馈默认不出现在列表里，评分仍计入统计。 */
  is_hidden: boolean
  platform: Platform | null
  platform_version: string | null
  custom_data: unknown
  /** 是否已转成 GitHub Issue。转发失败的提交不会落库，列表里为 true 的都建成了 Issue。 */
  forwarded_to_github: boolean
  /** 生成的 Issue 编号与链接；未转发时都是 null。 */
  github_issue_number: number | null
  github_issue_url: string | null
  /** Server-observed caller origin; null on rows submitted before it was captured. */
  ip: string | null
  user_agent: string | null
  country_code: string | null
  country_name: string | null
  region_name: string | null
  city: string | null
  created_at: number
}

export type ListFeedbacksResponse = {
  total: number
  data: FeedbackItem[]
}

export type FeedbackMutationInput = {
  user_id?: string
  rating?: number
  content?: string
  contact?: string
  is_hidden?: boolean
  platform?: Platform
  platform_version?: string
  custom_data?: Record<string, unknown>
}

export type ListFeedbacksParams = {
  limit: number
  offset: number
  includeHidden?: boolean
  search?: string
  platform?: Platform
  rating?: number
}

export async function listFeedbacks(
  token: string,
  projectKey: string,
  params: ListFeedbacksParams,
  signal?: AbortSignal,
): Promise<ListFeedbacksResponse> {
  const query = buildListQuery({
    limit: params.limit,
    offset: params.offset,
    include_hidden: params.includeHidden ? "true" : undefined,
    search: params.search,
    platform: params.platform,
    rating: params.rating,
  })

  return requestJson<ListFeedbacksResponse>(`/admin/projects/${projectKey}/feedbacks?${query}`, {
    token,
    signal,
  })
}

/** 后台手动补录反馈；来源字段（ip/UA/地理）由后端留空。 */
export async function createFeedback(
  token: string,
  projectKey: string,
  input: FeedbackMutationInput,
): Promise<FeedbackItem> {
  return requestJson<FeedbackItem>(`/admin/projects/${projectKey}/feedbacks`, {
    method: "POST",
    token,
    body: input,
  })
}

export async function updateFeedback(
  token: string,
  projectKey: string,
  id: string,
  input: FeedbackMutationInput,
): Promise<FeedbackItem> {
  return requestJson<FeedbackItem>(`/admin/projects/${projectKey}/feedbacks/${id}`, {
    method: "PATCH",
    token,
    body: input,
  })
}

export async function deleteFeedback(
  token: string,
  projectKey: string,
  id: string,
): Promise<{ success: true }> {
  return requestJson<{ success: true }>(`/admin/projects/${projectKey}/feedbacks/${id}`, {
    method: "DELETE",
    token,
  })
}
