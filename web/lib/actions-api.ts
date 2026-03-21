import { requestJson } from "@/lib/api-client"
import { getSessionToken } from "@/lib/auth-session"

export type ActionItem = {
  action_id: string
  project_key: string
  name: string
  description: string
  custom_data: Record<string, unknown> | null
  created_time: number
}

export type ActionRecordItem = {
  action_record_id: string
  action_id: string
  created_time: number
  http: Record<string, unknown> | null
  custom_data: Record<string, unknown> | null
}

export type ListActionsResponse = {
  total: number
  data: ActionItem[]
}

export type ListActionRecordsResponse = {
  total: number
  data: ActionRecordItem[]
}

export type ActionMutationInput = {
  project_key: string
  name: string
  description: string
  custom_data?: Record<string, unknown>
}

export type ActionUpdateInput = {
  name?: string
  description?: string
  custom_data?: Record<string, unknown>
}

function getTokenOrThrow() {
  const token = getSessionToken().trim()
  if (!token) {
    throw new Error("未检测到登录态，请重新登录。")
  }

  return token
}

export async function listActions(
  projectKey: string,
  params: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<ListActionsResponse> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })

  return requestJson<ListActionsResponse>(
    `/admin/projects/${projectKey}/actions?${query.toString()}`,
    {
      token: getTokenOrThrow(),
      signal,
    },
  )
}

export async function createAction(input: ActionMutationInput): Promise<ActionItem> {
  return requestJson<ActionItem>("/admin/projects/actions", {
    method: "POST",
    token: getTokenOrThrow(),
    body: input,
  })
}

export async function updateAction(
  actionId: string,
  input: ActionUpdateInput,
): Promise<ActionItem> {
  return requestJson<ActionItem>(`/admin/actions/${actionId}`, {
    method: "PATCH",
    token: getTokenOrThrow(),
    body: input,
  })
}

export async function deleteAction(actionId: string): Promise<{ success: true }> {
  return requestJson<{ success: true }>(`/admin/actions/${actionId}`, {
    method: "DELETE",
    token: getTokenOrThrow(),
  })
}

export async function listActionRecords(
  actionId: string,
  params: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<ListActionRecordsResponse> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })

  return requestJson<ListActionRecordsResponse>(`/admin/actions/${actionId}?${query.toString()}`, {
    token: getTokenOrThrow(),
    signal,
  })
}
