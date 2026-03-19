import { requestJson } from "@/lib/api-client"

export type ClientPlatform = "ios" | "android" | "windows" | "mac" | "web"

export type VersionItem = {
  id: string
  version: string
  title: string | null
  content: string | null
  download_url: string
  forced: boolean
  platform: ClientPlatform | null
  custom_data: Record<string, unknown> | null
  created_at: string
}

export type ListVersionsResponse = {
  total: number
  data: VersionItem[]
}

export type CreateVersionInput = {
  version: string
  title?: string
  content?: string
  download_url: string
  forced?: boolean
  platform?: ClientPlatform
  custom_data?: Record<string, unknown>
}

export async function listVersions(
  token: string,
  projectId: string,
  params: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<ListVersionsResponse> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })

  return requestJson<ListVersionsResponse>(`/admin/projects/${projectId}/versions?${query.toString()}`, {
    token,
    signal,
  })
}

export async function createVersion(
  token: string,
  projectId: string,
  input: CreateVersionInput,
): Promise<VersionItem> {
  return requestJson<VersionItem>(`/admin/projects/${projectId}/versions`, {
    method: "POST",
    token,
    body: input,
  })
}
