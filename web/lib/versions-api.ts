import { requestJson } from "@/lib/api-client"

export type ClientPlatform = "ios" | "android" | "windows" | "mac" | "web"

export type VersionDownloadLink = {
  url: string
  name?: string
  platform?: string
}

export type VersionItem = {
  id: string
  version: string
  comparable_version?: string
  title: string | null
  content: string | null
  download_url: string | null
  download_links: VersionDownloadLink[]
  forced: boolean
  is_latest: boolean
  is_preview: boolean
  milestone?: string | null
  is_deprecated?: boolean
  platform: ClientPlatform | null
  custom_data: Record<string, unknown> | null
  published_at: number
  created_at: number
}

export type ListVersionsResponse = {
  total: number
  data: VersionItem[]
}

export type CreateVersionInput = {
  version: string
  comparable_version: string
  title?: string
  content?: string
  download_url?: string
  download_links?: VersionDownloadLink[]
  is_latest?: boolean
  is_preview?: boolean
  milestone?: string
  is_deprecated?: boolean
  platform?: ClientPlatform
  custom_data?: Record<string, unknown>
  published_at?: number
}

export type GithubReleaseVersionPreview = {
  version: string
  comparable_version?: string
  title?: string
  content?: string
  download_url?: string
  download_links: VersionDownloadLink[]
  forced: boolean
  is_latest: boolean
  is_preview: boolean
  milestone?: string
  is_deprecated?: boolean
  custom_data: Record<string, unknown>
  published_at: number
  platform?: ClientPlatform
}

export type CheckVersionUpdateInput = {
  current_version?: string
  current_comparable_version?: string
  include_preview?: boolean
}

export type CheckVersionUpdateResponse = {
  should_update: boolean
  required: boolean
  reason_codes: string[]
  current_version: string | null
  current_comparable_version: string
  latest_version: VersionItem
  latest_preview_version: VersionItem | null
  target_version: VersionItem
  milestone: {
    current: string | null
    latest: string | null
    latest_in_current: VersionItem | null
  }
}

export async function listVersions(
  token: string,
  projectKey: string,
  params: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<ListVersionsResponse> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })

  return requestJson<ListVersionsResponse>(
    `/admin/projects/${projectKey}/versions?${query.toString()}`,
    {
      token,
      signal,
    },
  )
}

export async function createVersion(
  token: string,
  projectKey: string,
  input: CreateVersionInput,
): Promise<VersionItem> {
  return requestJson<VersionItem>(`/admin/projects/${projectKey}/versions`, {
    method: "POST",
    token,
    body: input,
  })
}

export async function updateVersion(
  token: string,
  projectKey: string,
  versionId: string,
  input: Partial<CreateVersionInput>,
): Promise<VersionItem> {
  return requestJson<VersionItem>(`/admin/projects/${projectKey}/versions/${versionId}`, {
    method: "PATCH",
    token,
    body: input,
  })
}

export async function deleteVersion(
  token: string,
  projectKey: string,
  versionId: string,
): Promise<{ success: true }> {
  return requestJson<{ success: true }>(`/admin/projects/${projectKey}/versions/${versionId}`, {
    method: "DELETE",
    token,
  })
}

export async function previewVersionFromGithubRelease(
  token: string,
  projectKey: string,
  params?: { tag?: string },
): Promise<GithubReleaseVersionPreview> {
  const query = new URLSearchParams()
  if (params?.tag) {
    query.set("tag", params.tag)
  }

  const path = query.toString()
    ? `/admin/projects/${projectKey}/versions/github-release-preview?${query.toString()}`
    : `/admin/projects/${projectKey}/versions/github-release-preview`

  return requestJson<GithubReleaseVersionPreview>(path, {
    token,
  })
}

export async function importVersionsFromGithubReleases(
  token: string,
  projectKey: string,
): Promise<{ imported: number; skipped: number; scanned: number }> {
  return requestJson<{ imported: number; skipped: number; scanned: number }>(
    `/admin/projects/${projectKey}/versions/github-release-import`,
    {
      method: "POST",
      token,
    },
  )
}

export async function checkVersionUpdate(
  projectKey: string,
  input: CheckVersionUpdateInput,
  signal?: AbortSignal,
): Promise<CheckVersionUpdateResponse> {
  return requestJson<CheckVersionUpdateResponse>(`/public/${projectKey}/versions/check-update`, {
    method: "POST",
    body: input,
    signal,
  })
}
