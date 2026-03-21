import { describe, expect, it } from "vitest"

import { isProtectedPath, resolveAuthRedirect } from "@/lib/auth-redirect"

describe("isProtectedPath", () => {
  it("returns true for admin root and children", () => {
    expect(isProtectedPath("/admin")).toBe(true)
    expect(isProtectedPath("/admin/tokens")).toBe(true)
  })

  it("returns false for non-admin paths", () => {
    expect(isProtectedPath("/")).toBe(false)
    expect(isProtectedPath("/projects")).toBe(false)
  })
})

describe("resolveAuthRedirect", () => {
  it("redirects anonymous user from admin to login with returnTo", () => {
    expect(resolveAuthRedirect("/admin/tokens", "?tab=a", false)).toEqual({
      redirectTo: "/login?returnTo=%2Fadmin%2Ftokens%3Ftab%3Da",
    })
  })

  it("redirects authenticated user away from login page", () => {
    expect(resolveAuthRedirect("/login", "", true)).toEqual({
      redirectTo: "/admin",
    })
  })

  it("redirects authenticated user to safe returnTo when visiting login", () => {
    expect(resolveAuthRedirect("/login", "?returnTo=%2Fadmin%2Ftokens", true)).toEqual({
      redirectTo: "/admin/tokens",
    })

    expect(resolveAuthRedirect("/login", "?returnTo=https%3A%2F%2Fevil.example", true)).toEqual({
      redirectTo: "/admin",
    })
  })

  it("keeps home page publicly accessible for authenticated users", () => {
    expect(resolveAuthRedirect("/", "", true)).toEqual({
      redirectTo: null,
    })
  })

  it("does not redirect when state is already valid", () => {
    expect(resolveAuthRedirect("/admin", "", true)).toEqual({ redirectTo: null })
    expect(resolveAuthRedirect("/", "", false)).toEqual({ redirectTo: null })
  })
})
