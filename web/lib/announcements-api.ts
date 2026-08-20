import { buildListQuery, requestJson } from "@/lib/api-client"
import type { Platform } from "@/lib/platform"

export type AnnouncementItem = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  is_hidden: boolean
  platforms: Platform[]
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
  platforms?: Platform[]
  author?: string
  published_at?: number
}

export type ListAnnouncementsParams = {
  limit: number
  offset: number
  search?: string
  platform?: Platform
  is_pinned?: boolean
  is_hidden?: boolean
}

export async function listAnnouncements(
  token: string,
  projectKey: string,
  params: ListAnnouncementsParams,
  signal?: AbortSignal,
): Promise<ListAnnouncementsResponse> {
  const query = buildListQuery({
    limit: params.limit,
    offset: params.offset,
    search: params.search,
    platform: params.platform,
    is_pinned: params.is_pinned,
    is_hidden: params.is_hidden,
  })

  return requestJson<ListAnnouncementsResponse>(
    `/admin/projects/${projectKey}/announcements?${query}`,
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
