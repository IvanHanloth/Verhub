import { describe, expect, it } from "vitest"

import { normalizeReturnTo } from "@/lib/auth-session"

describe("normalizeReturnTo", () => {
  it("falls back to admin when value is empty", () => {
    expect(normalizeReturnTo(undefined)).toBe("/admin")
    expect(normalizeReturnTo("")).toBe("/admin")
  })

  it("rejects external or malformed paths", () => {
    expect(normalizeReturnTo("https://evil.example")).toBe("/admin")
    expect(normalizeReturnTo("javascript:alert(1)")).toBe("/admin")
    expect(normalizeReturnTo("not-start-with-slash")).toBe("/admin")
  })

  it("allows internal admin paths", () => {
    expect(normalizeReturnTo("/admin/tokens")).toBe("/admin/tokens")
  })
})
