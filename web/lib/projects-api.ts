import { requestJson } from "@/lib/api-client"

export type ProjectItem = {
  id: string
  project_key: string
  name: string
  repo_url: string | null
  description: string | null
  author: string | null
  author_homepage_url: string | null
  icon_url: string | null
  website_url: string | null
  published_at: number | null
  optional_update_min_comparable_version?: string | null
  optional_update_max_comparable_version?: string | null
  created_at: number
  updated_at: number
}

export type ListProjectsResponse = {
  total: number
  data: ProjectItem[]
}

export type ProjectMutationInput = {
  project_key: string
  name: string
  repo_url?: string
  description?: string
  author?: string
  author_homepage_url?: string
  icon_url?: string
  website_url?: string
  published_at?: number
  optional_update_min_comparable_version?: string
  optional_update_max_comparable_version?: string
}

export type GithubRepoProjectPreview = {
  project_key: string
  name: string
  repo_url: string
  description: string | null
  author: string | null
  author_homepage_url: string | null
  icon_url: string | null
  website_url: string | null
  published_at: number | null
  optional_update_min_comparable_version?: string | null
  optional_update_max_comparable_version?: string | null
}

export type LoginResponse = {
  access_token: string
  expires_in: number
}

export async function loginAdmin(username: string, password: string): Promise<LoginResponse> {
  return requestJson<LoginResponse>("/auth/login", {
    method: "POST",
    body: { username, password },
  })
}

export async function listProjects(
  token: string,
  params: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<ListProjectsResponse> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })

  return requestJson<ListProjectsResponse>(`/admin/projects?${query.toString()}`, {
    token,
    signal,
  })
}

export async function createProject(
  token: string,
  input: ProjectMutationInput,
): Promise<ProjectItem> {
  return requestJson<ProjectItem>("/admin/projects", {
    method: "POST",
    token,
    body: input,
  })
}

export async function updateProject(
  token: string,
  id: string,
  input: ProjectMutationInput,
): Promise<ProjectItem> {
  return requestJson<ProjectItem>(`/admin/projects/${id}`, {
    method: "PATCH",
    token,
    body: input,
  })
}

export async function deleteProject(token: string, id: string): Promise<{ success: true }> {
  return requestJson<{ success: true }>(`/admin/projects/${id}`, {
    method: "DELETE",
    token,
  })
}

export async function previewProjectFromGithubRepo(
  token: string,
  repoUrl: string,
): Promise<GithubRepoProjectPreview> {
  const query = new URLSearchParams({ repo_url: repoUrl })

  return requestJson<GithubRepoProjectPreview>(
    `/admin/projects/github-repo-preview?${query.toString()}`,
    { token },
  )
}
