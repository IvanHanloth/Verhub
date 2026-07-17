import { StatPlatform } from "@prisma/client"

import {
  parseDeclaredPlatform,
  parsePlatformFromUserAgent,
  resolvePlatform,
} from "./platform-detection"

describe("parseDeclaredPlatform", () => {
  it("maps known platform names case-insensitively", () => {
    expect(parseDeclaredPlatform("ios")).toBe(StatPlatform.IOS)
    expect(parseDeclaredPlatform("Android")).toBe(StatPlatform.ANDROID)
    expect(parseDeclaredPlatform("  WINDOWS ")).toBe(StatPlatform.WINDOWS)
    expect(parseDeclaredPlatform("darwin")).toBe(StatPlatform.MAC)
  })

  it("returns null for unknown or non-string values so the caller can fall back", () => {
    expect(parseDeclaredPlatform("playstation")).toBeNull()
    expect(parseDeclaredPlatform(undefined)).toBeNull()
    expect(parseDeclaredPlatform(42)).toBeNull()
  })
})

describe("parsePlatformFromUserAgent", () => {
  it("prefers mobile over the desktop tokens embedded in mobile User-Agents", () => {
    // iOS UAs contain "like Mac OS X"; Android UAs contain "Linux".
    expect(
      parsePlatformFromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      ),
    ).toBe(StatPlatform.IOS)
    expect(
      parsePlatformFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36"),
    ).toBe(StatPlatform.ANDROID)
  })

  it("detects desktop platforms", () => {
    expect(parsePlatformFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      StatPlatform.WINDOWS,
    )
    expect(parsePlatformFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(
      StatPlatform.MAC,
    )
  })

  it("falls back to WEB for a browser UA with no recognized OS token", () => {
    expect(parsePlatformFromUserAgent("Mozilla/5.0 (X11; Ubuntu) Firefox/120.0")).toBe(
      StatPlatform.WEB,
    )
  })

  it("returns UNKNOWN for missing or unrecognized User-Agents", () => {
    expect(parsePlatformFromUserAgent(undefined)).toBe(StatPlatform.UNKNOWN)
    expect(parsePlatformFromUserAgent("")).toBe(StatPlatform.UNKNOWN)
    expect(parsePlatformFromUserAgent("curl/8.4.0")).toBe(StatPlatform.UNKNOWN)
  })
})

describe("resolvePlatform", () => {
  it("prefers an explicit SDK declaration over the User-Agent", () => {
    expect(resolvePlatform("android", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      StatPlatform.ANDROID,
    )
  })

  it("falls back to the User-Agent when no platform is declared", () => {
    expect(resolvePlatform(undefined, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      StatPlatform.WINDOWS,
    )
  })

  it("falls back to the User-Agent when the declared platform is unrecognized", () => {
    expect(resolvePlatform("playstation", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(
      StatPlatform.MAC,
    )
  })

  it("returns UNKNOWN when neither source identifies a platform", () => {
    expect(resolvePlatform(undefined, undefined)).toBe(StatPlatform.UNKNOWN)
  })
})
