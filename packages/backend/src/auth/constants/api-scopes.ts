export const AVAILABLE_API_SCOPES = [
  "projects:read",
  "projects:write",
  "versions:read",
  "versions:write",
  "announcements:read",
  "announcements:write",
  "actions:read",
  "actions:write",
  "feedbacks:read",
  "feedbacks:write",
  "logs:read",
  "logs:write",
  "tokens:read",
  "tokens:write",
] as const

export type ApiScope = (typeof AVAILABLE_API_SCOPES)[number]

export const DEFAULT_API_SCOPES: ApiScope[] = ["versions:write"]
