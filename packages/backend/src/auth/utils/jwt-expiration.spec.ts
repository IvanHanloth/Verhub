import { parseExpiresInToSeconds } from "./jwt-expiration"

describe("parseExpiresInToSeconds", () => {
  it("returns default 7200 for undefined", () => {
    expect(parseExpiresInToSeconds(undefined)).toBe(7200)
  })

  it("returns default 7200 for empty string", () => {
    expect(parseExpiresInToSeconds("")).toBe(7200)
  })

  it("returns default 7200 for whitespace-only string", () => {
    expect(parseExpiresInToSeconds("   ")).toBe(7200)
  })

  it("parses raw numeric string as seconds", () => {
    expect(parseExpiresInToSeconds("3600")).toBe(3600)
  })

  it("parses seconds suffix", () => {
    expect(parseExpiresInToSeconds("30s")).toBe(30)
  })

  it("parses minutes suffix", () => {
    expect(parseExpiresInToSeconds("5m")).toBe(300)
  })

  it("parses hours suffix", () => {
    expect(parseExpiresInToSeconds("2h")).toBe(7200)
  })

  it("parses days suffix", () => {
    expect(parseExpiresInToSeconds("1d")).toBe(86400)
  })

  it("handles uppercase input", () => {
    expect(parseExpiresInToSeconds("2H")).toBe(7200)
  })

  it("returns default for invalid format", () => {
    expect(parseExpiresInToSeconds("abc")).toBe(7200)
  })

  it("returns default for unsupported unit", () => {
    expect(parseExpiresInToSeconds("5w")).toBe(7200)
  })

  it("trims whitespace before parsing", () => {
    expect(parseExpiresInToSeconds("  1h  ")).toBe(3600)
  })
})
