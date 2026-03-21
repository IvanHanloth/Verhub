import { requestJson } from "@/lib/api-client"
import type { AnnouncementItem } from "@/lib/announcements-api"
import type { ProjectItem } from "@/lib/projects-api"
import type { ListVersionsResponse } from "@/lib/versions-api"

export async function getPublicProject(projectKey: string): Promise<ProjectItem> {
  return requestJson<ProjectItem>(`/public/${projectKey}`)
}

export async function getPublicVersions(
  projectKey: string,
  params: { limit: number; offset: number },
): Promise<ListVersionsResponse> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })

  return requestJson<ListVersionsResponse>(`/public/${projectKey}/versions?${query.toString()}`)
}

export async function getPublicAnnouncements(
  projectKey: string,
  params: { limit: number; offset: number },
): Promise<{ total: number; data: AnnouncementItem[] }> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })

  return requestJson<{ total: number; data: AnnouncementItem[] }>(
    `/public/${projectKey}/announcements?${query.toString()}`,
  )
}
