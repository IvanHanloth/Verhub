import { requestJson } from "@/lib/api-client"

export type AnnouncementItem = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  is_hidden: boolean
  platforms: Array<"ios" | "android" | "windows" | "mac" | "web">
  author: string | null
  published_at: number
  created_at: number
  updated_at: number
}

export type ListAnnouncementsResponse = {
  total: number
  data: AnnouncementItem[]
}

export type AnnouncementMutationInput = {
  title: string
  content: string
  is_pinned?: boolean
  is_hidden?: boolean
  platforms?: Array<"ios" | "android" | "windows" | "mac" | "web">
  author?: string
  published_at?: number
}

export async function listAnnouncements(
  token: string,
  projectKey: string,
  params: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<ListAnnouncementsResponse> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })

  return requestJson<ListAnnouncementsResponse>(
    `/admin/projects/${projectKey}/announcements?${query.toString()}`,
    {
      token,
      signal,
    },
  )
}

export async function createAnnouncement(
  token: string,
  projectKey: string,
  input: AnnouncementMutationInput,
): Promise<AnnouncementItem> {
  return requestJson<AnnouncementItem>(`/admin/projects/${projectKey}/announcements`, {
    method: "POST",
    token,
    body: input,
  })
}

export async function updateAnnouncement(
  token: string,
  projectKey: string,
  id: string,
  input: AnnouncementMutationInput,
): Promise<AnnouncementItem> {
  return requestJson<AnnouncementItem>(`/admin/projects/${projectKey}/announcements/${id}`, {
    method: "PATCH",
    token,
    body: input,
  })
}

export async function deleteAnnouncement(
  token: string,
  projectKey: string,
  id: string,
): Promise<{ success: true }> {
  return requestJson<{ success: true }>(`/admin/projects/${projectKey}/announcements/${id}`, {
    method: "DELETE",
    token,
  })
}
