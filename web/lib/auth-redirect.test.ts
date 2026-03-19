import { describe, expect, it } from "vitest"

import { isProtectedPath, resolveAuthRedirect } from "@/lib/auth-redirect"

describe("isProtectedPath", () => {
  it("returns true for dashboard root and children", () => {
    expect(isProtectedPath("/dashboard")).toBe(true)
    expect(isProtectedPath("/dashboard/tokens")).toBe(true)
  })

  it("returns false for non-dashboard paths", () => {
    expect(isProtectedPath("/")).toBe(false)
    expect(isProtectedPath("/projects")).toBe(false)
  })
})

describe("resolveAuthRedirect", () => {
  it("redirects anonymous user from dashboard to login with returnTo", () => {
    expect(resolveAuthRedirect("/dashboard/tokens", "?tab=a", false)).toEqual({
      redirectTo: "/?returnTo=%2Fdashboard%2Ftokens%3Ftab%3Da",
    })
  })

  it("redirects authenticated user from login page to dashboard", () => {
    expect(resolveAuthRedirect("/", "", true)).toEqual({
      redirectTo: "/dashboard",
    })
  })

  it("does not redirect when state is already valid", () => {
    expect(resolveAuthRedirect("/dashboard", "", true)).toEqual({ redirectTo: null })
    expect(resolveAuthRedirect("/", "", false)).toEqual({ redirectTo: null })
  })
})
