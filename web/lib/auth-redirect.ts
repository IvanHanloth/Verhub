export function isProtectedPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/")
}

export function resolveAuthRedirect(
  pathname: string,
  search: string,
  hasToken: boolean,
): { redirectTo: string | null } {
  if (isProtectedPath(pathname) && !hasToken) {
    const returnTo = encodeURIComponent(`${pathname}${search}`)
    return {
      redirectTo: `/?returnTo=${returnTo}`,
    }
  }

  if (pathname === "/" && hasToken) {
    return {
      redirectTo: "/dashboard",
    }
  }

  return {
    redirectTo: null,
  }
}
