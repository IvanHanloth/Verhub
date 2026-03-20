export function isProtectedPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/")
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

  return {
    redirectTo: null,
  }
}
