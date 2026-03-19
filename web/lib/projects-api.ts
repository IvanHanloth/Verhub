import { requestJson } from "@/lib/api-client"

export type ProjectItem = {
  id: string
  project_key: string
  name: string
  repo_url: string | null
  description: string | null
  created_at: string
  updated_at: string
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

export async function createProject(token: string, input: ProjectMutationInput): Promise<ProjectItem> {
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
