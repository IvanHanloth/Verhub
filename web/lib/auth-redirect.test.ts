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
