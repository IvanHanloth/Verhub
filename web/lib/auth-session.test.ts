import { describe, expect, it } from "vitest"

import { normalizeReturnTo } from "@/lib/auth-session"

describe("normalizeReturnTo", () => {
  it("falls back to dashboard when value is empty", () => {
    expect(normalizeReturnTo(undefined)).toBe("/dashboard")
    expect(normalizeReturnTo("")).toBe("/dashboard")
  })

  it("rejects external or malformed paths", () => {
    expect(normalizeReturnTo("https://evil.example")).toBe("/dashboard")
    expect(normalizeReturnTo("javascript:alert(1)")).toBe("/dashboard")
    expect(normalizeReturnTo("not-start-with-slash")).toBe("/dashboard")
  })

  it("allows internal dashboard paths", () => {
    expect(normalizeReturnTo("/dashboard/tokens")).toBe("/dashboard/tokens")
  })
})
