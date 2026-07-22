import { Platform } from "@prisma/client"

import {
  MAX_PLATFORM_VERSION_LENGTH,
  parseDeclaredPlatform,
  parsePlatformFromUserAgent,
  resolvePlatform,
} from "./platform-detection"

describe("parseDeclaredPlatform", () => {
  it("maps known platform names case-insensitively", () => {
    expect(parseDeclaredPlatform("ios")).toEqual({ platform: Platform.IOS, version: "" })
    expect(parseDeclaredPlatform("Android")).toEqual({ platform: Platform.ANDROID, version: "" })
    expect(parseDeclaredPlatform("  WINDOWS ")).toEqual({ platform: Platform.WINDOWS, version: "" })
    expect(parseDeclaredPlatform("darwin")).toEqual({ platform: Platform.MACOS, version: "" })
    expect(parseDeclaredPlatform("Linux")).toEqual({ platform: Platform.LINUX, version: "" })
    expect(parseDeclaredPlatform("Others")).toEqual({ platform: Platform.OTHERS, version: "" })
  })

  it("splits a platform string that also carries the OS version", () => {
    expect(parseDeclaredPlatform("Windows 11")).toEqual({
      platform: Platform.WINDOWS,
      version: "11",
    })
    // 无分隔符也要切开，SDK 里 "MacOS26" 这种拼法很常见。
    expect(parseDeclaredPlatform("MacOS26")).toEqual({ platform: Platform.MACOS, version: "26" })
    expect(parseDeclaredPlatform("mac os x 10.15.7")).toEqual({
      platform: Platform.MACOS,
      version: "10.15.7",
    })
  })

  it("keeps a distro name in the version detail instead of stripping it", () => {
    // "24.02" 单独存在毫无意义，发行版名才是这条记录的信息量所在。
    expect(parseDeclaredPlatform("ubuntu 24.02")).toEqual({
      platform: Platform.LINUX,
      version: "ubuntu 24.02",
    })
    expect(parseDeclaredPlatform("iPhone 15")).toEqual({
      platform: Platform.IOS,
      version: "iphone 15",
    })
  })

  it("does not match a token that is only a prefix of a longer word", () => {
    expect(parseDeclaredPlatform("androidx")).toBeNull()
  })

  it("drops an oversized version detail rather than storing a truncated one", () => {
    const detail = "x".repeat(MAX_PLATFORM_VERSION_LENGTH + 1)
    expect(parseDeclaredPlatform(`windows ${detail}`)).toEqual({
      platform: Platform.WINDOWS,
      version: "",
    })
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
    ).toEqual({ platform: Platform.IOS, version: "17.0" })
    expect(
      parsePlatformFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36"),
    ).toEqual({ platform: Platform.ANDROID, version: "14" })
  })

  it("detects desktop platforms with their OS version", () => {
    expect(parsePlatformFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toEqual({
      platform: Platform.WINDOWS,
      version: "10",
    })
    expect(parsePlatformFromUserAgent("Mozilla/5.0 (Windows NT 6.1)")).toEqual({
      platform: Platform.WINDOWS,
      version: "7",
    })
    expect(parsePlatformFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toEqual({
      platform: Platform.MACOS,
      version: "10.15.7",
    })
  })

  it("detects Linux and picks up a distro name when the UA carries one", () => {
    expect(
      parsePlatformFromUserAgent("Mozilla/5.0 (X11; Ubuntu; Linux x86_64) Firefox/120.0"),
    ).toEqual({ platform: Platform.LINUX, version: "ubuntu" })
    expect(parsePlatformFromUserAgent("Mozilla/5.0 (X11; Linux x86_64) Chrome/120")).toEqual({
      platform: Platform.LINUX,
      version: "",
    })
  })

  it("returns OTHERS for missing or unrecognized User-Agents", () => {
    // WEB 只在客户端显式声明时产生：浏览器 UA 自带真实 OS，剩下的是 curl、
    // 服务端调用这类没有平台可言的流量，记成 WEB 只会虚构出一个平台分布。
    expect(parsePlatformFromUserAgent(undefined)).toEqual({
      platform: Platform.OTHERS,
      version: "",
    })
    expect(parsePlatformFromUserAgent("")).toEqual({ platform: Platform.OTHERS, version: "" })
    expect(parsePlatformFromUserAgent("curl/8.4.0")).toEqual({
      platform: Platform.OTHERS,
      version: "",
    })
  })
})

describe("resolvePlatform", () => {
  it("prefers an explicit SDK declaration over the User-Agent", () => {
    expect(
      resolvePlatform("android", undefined, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
    ).toEqual({ platform: Platform.ANDROID, version: "" })
  })

  it("prefers a separately declared version over the one embedded in the platform string", () => {
    expect(resolvePlatform("windows 10", "11", undefined)).toEqual({
      platform: Platform.WINDOWS,
      version: "11",
    })
  })

  it("falls back to the User-Agent when no platform is declared", () => {
    expect(
      resolvePlatform(undefined, undefined, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
    ).toEqual({ platform: Platform.WINDOWS, version: "10" })
  })

  it("ignores the User-Agent version when it describes a different platform", () => {
    // 否则会出现「平台 android、版本 10（其实是 UA 里的 Windows）」这种自相矛盾的行。
    expect(resolvePlatform("android", undefined, "Mozilla/5.0 (Windows NT 10.0)")).toEqual({
      platform: Platform.ANDROID,
      version: "",
    })
  })

  it("falls back to the User-Agent when the declared platform is unrecognized", () => {
    expect(
      resolvePlatform("playstation", undefined, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
    ).toEqual({ platform: Platform.MACOS, version: "10.15.7" })
  })

  it("keeps an unrecognized declaration as the detail of the OTHERS bucket", () => {
    expect(resolvePlatform("HarmonyOS 4", undefined, undefined)).toEqual({
      platform: Platform.OTHERS,
      version: "harmonyos 4",
    })
  })

  it("returns OTHERS when neither source identifies a platform", () => {
    expect(resolvePlatform(undefined, undefined, undefined)).toEqual({
      platform: Platform.OTHERS,
      version: "",
    })
  })
})
