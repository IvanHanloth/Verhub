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
  docs_url: string | null
  published_at: number | null
  optional_update_min_comparable_version?: string | null
  optional_update_max_comparable_version?: string | null
  stats_retention_days?: number
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
  docs_url?: string
  published_at?: number
  optional_update_min_comparable_version?: string | null
  optional_update_max_comparable_version?: string | null
  stats_retention_days?: number
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
  docs_url: string | null
  published_at: number | null
  optional_update_min_comparable_version?: string | null
  optional_update_max_comparable_version?: string | null
}

export type GithubWebhookSettings = {
  enabled: boolean
  payload_path: string
  content_type: "application/json"
  /** 末 4 位提示，完整 secret 只在设置/重新生成时返回一次。 */
  secret_hint: string | null
  secret_updated_at: number | null
}

export type GithubWebhookSecretRevealed = GithubWebhookSettings & {
  secret: string
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
  projectKey: string,
  input: ProjectMutationInput,
): Promise<ProjectItem> {
  return requestJson<ProjectItem>(`/admin/projects/${projectKey}`, {
    method: "PATCH",
    token,
    body: input,
  })
}

export async function deleteProject(token: string, projectKey: string): Promise<{ success: true }> {
  return requestJson<{ success: true }>(`/admin/projects/${projectKey}`, {
    method: "DELETE",
    token,
  })
}

export async function getGithubWebhookSettings(
  token: string,
  projectKey: string,
  signal?: AbortSignal,
): Promise<GithubWebhookSettings> {
  return requestJson<GithubWebhookSettings>(`/admin/projects/${projectKey}/github-webhook`, {
    token,
    signal,
  })
}

export async function regenerateGithubWebhookSecret(
  token: string,
  projectKey: string,
): Promise<GithubWebhookSecretRevealed> {
  return requestJson<GithubWebhookSecretRevealed>(
    `/admin/projects/${projectKey}/github-webhook/regenerate`,
    { method: "POST", token },
  )
}

export async function setGithubWebhookSecret(
  token: string,
  projectKey: string,
  secret: string,
): Promise<GithubWebhookSecretRevealed> {
  return requestJson<GithubWebhookSecretRevealed>(`/admin/projects/${projectKey}/github-webhook`, {
    method: "PUT",
    token,
    body: { secret },
  })
}

export async function clearGithubWebhookSecret(
  token: string,
  projectKey: string,
): Promise<GithubWebhookSettings> {
  return requestJson<GithubWebhookSettings>(`/admin/projects/${projectKey}/github-webhook`, {
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
