export const SESSION_TOKEN_KEY = "verhub-admin-token"
export const SESSION_COOKIE_KEY = "verhub_session"

export function normalizeReturnTo(input?: string | null): string {
  if (!input || !input.startsWith("/")) {
    return "/admin"
  }

  if (input.startsWith("//") || input.includes("://")) {
    return "/admin"
  }

  return input
}

export function getSessionToken(): string {
  if (typeof window === "undefined") {
    return ""
  }

  return window.localStorage.getItem(SESSION_TOKEN_KEY) ?? ""
}

export function setSessionToken(token: string, maxAgeSeconds: number): void {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(SESSION_TOKEN_KEY, token)
  document.cookie = `${SESSION_COOKIE_KEY}=${token}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`
}

export function clearSessionToken(): void {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(SESSION_TOKEN_KEY)
  document.cookie = `${SESSION_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`
}
