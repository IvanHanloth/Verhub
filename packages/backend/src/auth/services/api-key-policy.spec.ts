import { UnauthorizedException } from "@nestjs/common"

import { normalizeProjectIds, resolveExpiresAt, resolveRequestedScopes } from "./api-key-policy"

describe("resolveRequestedScopes", () => {
  const available = ["read", "write", "admin"] as const
  const defaults = ["read"] as const

  it("returns requested scopes when all are valid", () => {
    expect(resolveRequestedScopes(["read", "write"], available, defaults)).toEqual([
      "read",
      "write",
    ])
  })

  it("returns defaults when scopes is undefined", () => {
    expect(resolveRequestedScopes(undefined, available, defaults)).toEqual(["read"])
  })

  it("returns defaults when scopes is empty array", () => {
    expect(resolveRequestedScopes([], available, defaults)).toEqual(["read"])
  })

  it("throws UnauthorizedException for invalid scopes", () => {
    expect(() => resolveRequestedScopes(["read", "invalid"], available, defaults)).toThrow(
      UnauthorizedException,
    )
  })

  it("includes all invalid scope names in error message", () => {
    expect(() => resolveRequestedScopes(["bad1", "bad2"], available, defaults)).toThrow(
      "Invalid api scopes: bad1, bad2",
    )
  })
})

describe("resolveExpiresAt", () => {
  it("returns null when neverExpires is true", () => {
    expect(resolveExpiresAt(undefined, true)).toBeNull()
  })

  it("returns null when neverExpires is true even with days", () => {
    expect(resolveExpiresAt(90, true)).toBeNull()
  })

  it("uses 30 days as default when no arguments", () => {
    const result = resolveExpiresAt()
    const expected = Math.floor(Date.now() / 1000) + 30 * 86400
    expect(Math.abs(result! - expected)).toBeLessThanOrEqual(2)
  })

  it("uses custom days when provided", () => {
    const result = resolveExpiresAt(7)
    const expected = Math.floor(Date.now() / 1000) + 7 * 86400
    expect(Math.abs(result! - expected)).toBeLessThanOrEqual(2)
  })
})

describe("normalizeProjectIds", () => {
  it("returns empty array for undefined", () => {
    expect(normalizeProjectIds(undefined)).toEqual([])
  })

  it("returns empty array for empty array", () => {
    expect(normalizeProjectIds([])).toEqual([])
  })

  it("trims and lowercases values", () => {
    expect(normalizeProjectIds(["  MyApp  ", " TEST "])).toEqual(["myapp", "test"])
  })

  it("deduplicates entries", () => {
    expect(normalizeProjectIds(["app", "APP", "App"])).toEqual(["app"])
  })

  it("filters empty strings after trim", () => {
    expect(normalizeProjectIds(["valid", "  ", ""])).toEqual(["valid"])
  })
})
