import { buildListQuery, requestJson } from "@/lib/api-client"
import type { Platform } from "@/lib/platform"

/**
 * 某个语言下的覆盖设置，三个维度彼此独立：标题留空即用默认标题、正文留空即用
 * 默认正文、is_hidden 为真则该语言下整条公告不返回。
 */
export type AnnouncementTranslation = {
  locale: string
  title: string | null
  content: string | null
  is_hidden: boolean
}

export type AnnouncementItem = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  is_hidden: boolean
  platforms: Platform[]
  author: string | null
  min_comparable_version: string | null
  max_comparable_version: string | null
  /** 本条内容实际来自哪个语言的译文；null 表示默认内容。后台接口恒为 null。 */
  locale: string | null
  /** 全部译文，仅后台接口返回。 */
  translations?: AnnouncementTranslation[]
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
  min_comparable_version?: string | null
  max_comparable_version?: string | null
  /** 传了即整体替换全部译文，空数组即清空；不传则保持原样。 */
  translations?: AnnouncementTranslation[]
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
