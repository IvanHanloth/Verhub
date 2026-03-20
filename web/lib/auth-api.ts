import { requestJson } from "@/lib/api-client"
import { getSessionToken } from "@/lib/auth-session"

export type LoginResponse = {
  access_token: string
  expires_in: number
}

export type AdminProfile = {
  username: string
}

export type UpdateAdminProfileInput = {
  current_password: string
  username?: string
  new_password?: string
}

export type ApiKeyItem = {
  id: string
  name: string
  scopes: string[]
  all_projects: boolean
  project_ids: string[]
  is_active: boolean
  expires_at: string | null
  previous_key_expires_at?: string | null
  last_used_at: string | null
  created_at: string
  revoked_at: string | null
}

export type ListApiKeysResponse = {
  data: ApiKeyItem[]
}

export type ListApiScopesResponse = {
  data: string[]
  default: string[]
}

export type CreateApiKeyInput = {
  name: string
  scopes?: string[]
  all_projects?: boolean
  project_ids?: string[]
  never_expires?: boolean
  expires_in_days?: number
}

export type CreateApiKeyResponse = {
  id: string
  name: string
  token: string
  scopes: string[]
  all_projects: boolean
  project_ids: string[]
  expires_at: string | null
  created_at: string
}

export type UpdateApiKeyInput = {
  name?: string
  scopes?: string[]
  all_projects?: boolean
  project_ids?: string[]
  never_expires?: boolean
  expires_in_days?: number
}

export type UpdateApiKeyResponse = {
  id: string
  name: string
  scopes: string[]
  all_projects: boolean
  project_ids: string[]
  expires_at: string | null
  created_at: string
}

export type RotateApiKeyInput = {
  grace_period_minutes?: number
}

export type RotateApiKeyResponse = {
  id: string
  token: string
  grace_period_minutes: number
  previous_key_expires_at: string | null
}

export async function loginWithPassword(
  username: string,
  password: string,
): Promise<LoginResponse> {
  return requestJson<LoginResponse>("/auth/login", {
    method: "POST",
    body: {
      username,
      password,
    },
  })
}

function getTokenOrThrow(): string {
  const token = getSessionToken().trim()
  if (!token) {
    throw new Error("未检测到登录态，请重新登录。")
  }

  return token
}

export async function getAdminProfile(): Promise<AdminProfile> {
  return requestJson<AdminProfile>("/auth/admin-profile", {
    token: getTokenOrThrow(),
  })
}

export async function updateAdminProfile(input: UpdateAdminProfileInput): Promise<AdminProfile> {
  return requestJson<AdminProfile>("/auth/admin-profile", {
    method: "PATCH",
    token: getTokenOrThrow(),
    body: input,
  })
}

export async function listApiKeys(): Promise<ListApiKeysResponse> {
  return requestJson<ListApiKeysResponse>("/auth/api-keys", {
    token: getTokenOrThrow(),
  })
}

export async function listApiScopes(): Promise<ListApiScopesResponse> {
  return requestJson<ListApiScopesResponse>("/auth/api-scopes", {
    token: getTokenOrThrow(),
  })
}

export async function createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResponse> {
  return requestJson<CreateApiKeyResponse>("/auth/api-keys", {
    method: "POST",
    token: getTokenOrThrow(),
    body: input,
  })
}

export async function revokeApiKey(id: string): Promise<{ success: true }> {
  return requestJson<{ success: true }>(`/auth/api-keys/${id}`, {
    method: "DELETE",
    token: getTokenOrThrow(),
  })
}

export async function updateApiKey(
  id: string,
  input: UpdateApiKeyInput,
): Promise<UpdateApiKeyResponse> {
  return requestJson<UpdateApiKeyResponse>(`/auth/api-keys/${id}`, {
    method: "PATCH",
    token: getTokenOrThrow(),
    body: input,
  })
}

export async function rotateApiKey(
  id: string,
  input: RotateApiKeyInput,
): Promise<RotateApiKeyResponse> {
  return requestJson<RotateApiKeyResponse>(`/auth/api-keys/${id}/rotate`, {
    method: "POST",
    token: getTokenOrThrow(),
    body: input,
  })
}
