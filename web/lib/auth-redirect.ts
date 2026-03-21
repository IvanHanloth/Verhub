import { normalizeReturnTo } from "@/lib/auth-session"

export function isProtectedPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/")
}

export function isLoginPath(pathname: string): boolean {
  return pathname === "/login"
}

function resolveLoginReturnTo(search: string): string {
  const query = search.startsWith("?") ? search.slice(1) : search
  const params = new URLSearchParams(query)
  return normalizeReturnTo(params.get("returnTo"))
}

export function resolveAuthRedirect(
  pathname: string,
  search: string,
  hasToken: boolean,
): { redirectTo: string | null } {
  if (isProtectedPath(pathname) && !hasToken) {
    const returnTo = encodeURIComponent(`${pathname}${search}`)
    return {
      redirectTo: `/login?returnTo=${returnTo}`,
    }
  }

  if (isLoginPath(pathname) && hasToken) {
    return {
      redirectTo: resolveLoginReturnTo(search),
    }
  }

  return {
    redirectTo: null,
  }
}
