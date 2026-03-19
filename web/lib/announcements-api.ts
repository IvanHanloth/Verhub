import { requestJson } from "@/lib/api-client"

export type AnnouncementItem = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  created_at: string
  updated_at: string
}

export type ListAnnouncementsResponse = {
  total: number
  data: AnnouncementItem[]
}

export type AnnouncementMutationInput = {
  title: string
  content: string
  is_pinned?: boolean
}

export async function listAnnouncements(
  token: string,
  projectId: string,
  params: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<ListAnnouncementsResponse> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })

  return requestJson<ListAnnouncementsResponse>(
    `/admin/projects/${projectId}/announcements?${query.toString()}`,
    {
      token,
      signal,
    },
  )
}

export async function createAnnouncement(
  token: string,
  projectId: string,
  input: AnnouncementMutationInput,
): Promise<AnnouncementItem> {
  return requestJson<AnnouncementItem>(`/admin/projects/${projectId}/announcements`, {
    method: "POST",
    token,
    body: input,
  })
}

export async function updateAnnouncement(
  token: string,
  projectId: string,
  id: string,
  input: AnnouncementMutationInput,
): Promise<AnnouncementItem> {
  return requestJson<AnnouncementItem>(`/admin/projects/${projectId}/announcements/${id}`, {
    method: "PATCH",
    token,
    body: input,
  })
}

export async function deleteAnnouncement(
  token: string,
  projectId: string,
  id: string,
): Promise<{ success: true }> {
  return requestJson<{ success: true }>(`/admin/projects/${projectId}/announcements/${id}`, {
    method: "DELETE",
    token,
  })
}
