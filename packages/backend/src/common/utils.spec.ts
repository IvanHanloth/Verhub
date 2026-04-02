import { isUniqueViolation, normalizeProjectKey, nowSeconds } from "./utils"

describe("nowSeconds", () => {
  it("returns a positive integer close to Date.now()/1000", () => {
    const result = nowSeconds()
    expect(Number.isInteger(result)).toBe(true)
    expect(Math.abs(result - Math.floor(Date.now() / 1000))).toBeLessThanOrEqual(1)
  })
})

describe("normalizeProjectKey", () => {
  it("trims and lowercases", () => {
    expect(normalizeProjectKey("  MyApp  ")).toBe("myapp")
  })

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeProjectKey("   ")).toBe("")
  })

  it("handles already-normalized input", () => {
    expect(normalizeProjectKey("myapp")).toBe("myapp")
  })
})

describe("isUniqueViolation", () => {
  it("returns true for Prisma P2002 error-like object", () => {
    expect(isUniqueViolation({ code: "P2002", meta: {} })).toBe(true)
  })

  it("returns false for other Prisma codes", () => {
    expect(isUniqueViolation({ code: "P2025" })).toBe(false)
  })

  it("returns false for null", () => {
    expect(isUniqueViolation(null)).toBe(false)
  })

  it("returns false for non-objects", () => {
    expect(isUniqueViolation("P2002")).toBe(false)
    expect(isUniqueViolation(42)).toBe(false)
    expect(isUniqueViolation(undefined)).toBe(false)
  })
})
