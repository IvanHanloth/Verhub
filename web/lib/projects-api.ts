import { buildListQuery, requestJson } from "@/lib/api-client"

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
  /** 事件采集总开关。关掉后采集端点空转，既有数据保留。 */
  event_collection_enabled?: boolean
  /** 事件明细的保留时长（天），独立于 stats_retention_days 且默认更短。 */
  event_retention_days?: number
  /** 改名后保留的旧 Project Key（别名），均可访问到本项目。新到旧排序。 */
  aliases?: string[]
  /** 本条 name / description 来自哪个语言的译文；null 表示项目自身的值。 */
  locale?: string | null
  /** 全部译文，仅管理接口返回。 */
  translations?: ProjectTranslation[]
  created_at: number
  updated_at: number
}

export type ListProjectsResponse = {
  total: number
  data: ProjectItem[]
}

export type ProjectAliasItem = {
  alias: string
  created_at: number
}

/** 项目注册的一个语言。只有注册过的语言能存译文，也只有它们的偏好被公开端认账。 */
export type ProjectLocaleItem = {
  locale: string
  /** 同义标签：客户端提交其中任何一个都等价于命中主标签。 */
  aliases: string[]
  label: string | null
  created_at: number
}

/** 某个语言下项目名称与描述的覆盖设置，字段留空即回落项目自身的值。 */
export type ProjectTranslation = {
  locale: string
  name: string | null
  description: string | null
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
  event_collection_enabled?: boolean
  event_retention_days?: number
  /** 传了即整体替换全部译文，空数组即清空；不传则保持原样。 */
  translations?: ProjectTranslation[]
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
  /** 末 6 位提示，完整 secret 只在设置/重新生成时返回一次。 */
  secret_hint: string | null
  /** 已存 secret 的字符数，用于把掩码铺到真实长度。 */
  secret_length: number | null
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
  params: { limit: number; offset: number; search?: string },
  signal?: AbortSignal,
): Promise<ListProjectsResponse> {
  const query = buildListQuery({
    limit: params.limit,
    offset: params.offset,
    search: params.search,
  })

  return requestJson<ListProjectsResponse>(`/admin/projects?${query}`, {
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

export async function listProjectAliases(
  token: string,
  projectKey: string,
  signal?: AbortSignal,
): Promise<{ data: ProjectAliasItem[] }> {
  return requestJson<{ data: ProjectAliasItem[] }>(`/admin/projects/${projectKey}/aliases`, {
    token,
    signal,
  })
}

export async function deleteProjectAlias(
  token: string,
  projectKey: string,
  alias: string,
): Promise<{ success: true }> {
  return requestJson<{ success: true }>(
    `/admin/projects/${projectKey}/aliases/${encodeURIComponent(alias)}`,
    { method: "DELETE", token },
  )
}

export async function listProjectLocales(
  token: string,
  projectKey: string,
  signal?: AbortSignal,
): Promise<{ data: ProjectLocaleItem[] }> {
  return requestJson<{ data: ProjectLocaleItem[] }>(`/admin/projects/${projectKey}/locales`, {
    token,
    signal,
  })
}

export async function createProjectLocale(
  token: string,
  projectKey: string,
  input: { locale: string; aliases?: string[]; label?: string },
): Promise<ProjectLocaleItem> {
  return requestJson<ProjectLocaleItem>(`/admin/projects/${projectKey}/locales`, {
    method: "POST",
    token,
    body: input,
  })
}

export async function deleteProjectLocale(
  token: string,
  projectKey: string,
  locale: string,
): Promise<{ success: true }> {
  return requestJson<{ success: true }>(
    `/admin/projects/${projectKey}/locales/${encodeURIComponent(locale)}`,
    { method: "DELETE", token },
  )
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
