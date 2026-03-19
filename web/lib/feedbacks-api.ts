import { requestJson } from "@/lib/api-client"

export type ClientPlatform = "ios" | "android" | "windows" | "mac" | "web"

export type FeedbackItem = {
  id: string
  user_id: string | null
  rating: number | null
  content: string
  platform: ClientPlatform | null
  custom_data: unknown
  created_at: string
}

export type ListFeedbacksResponse = {
  total: number
  data: FeedbackItem[]
}

export type FeedbackMutationInput = {
  user_id?: string
  rating?: number
  content?: string
  platform?: ClientPlatform
  custom_data?: Record<string, unknown>
}

export async function listFeedbacks(
  token: string,
  projectId: string,
  params: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<ListFeedbacksResponse> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })

  return requestJson<ListFeedbacksResponse>(`/admin/projects/${projectId}/feedbacks?${query.toString()}`, {
    token,
    signal,
  })
}

export async function updateFeedback(
  token: string,
  projectId: string,
  id: string,
  input: FeedbackMutationInput,
): Promise<FeedbackItem> {
  return requestJson<FeedbackItem>(`/admin/projects/${projectId}/feedbacks/${id}`, {
    method: "PATCH",
    token,
    body: input,
  })
}

export async function deleteFeedback(
  token: string,
  projectId: string,
  id: string,
): Promise<{ success: true }> {
  return requestJson<{ success: true }>(`/admin/projects/${projectId}/feedbacks/${id}`, {
    method: "DELETE",
    token,
  })
}
