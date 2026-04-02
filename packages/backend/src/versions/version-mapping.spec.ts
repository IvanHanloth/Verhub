import { ClientPlatform } from "@prisma/client"

import {
  fromClientPlatform,
  fromClientPlatforms,
  normalizeDownloadLinks,
  normalizeVersionTag,
  parseDownloadLinks,
  resolveDownloadData,
  toClientPlatform,
  toClientPlatforms,
  toGithubReleaseDownloadLinks,
  toVersionItem,
} from "./version-mapping"
import type { VersionRecord } from "./types"

// ── toVersionItem ──

describe("toVersionItem", () => {
  const baseRecord: VersionRecord = {
    id: "v1",
    projectKey: "proj",
    version: "1.0.0",
    comparableVersion: "1.0.0",
    title: "Release 1.0",
    content: "Notes",
    downloadUrl: "https://example.com/dl",
    downloadLinks: null,
    forced: false,
    isLatest: true,
    isPreview: false,
    isMilestone: false,
    isDeprecated: false,
    platforms: [ClientPlatform.IOS, ClientPlatform.ANDROID],
    platform: ClientPlatform.IOS,
    customData: null,
    publishedAt: 1000,
    createdAt: 900,
  }

  it("maps all fields to snake_case API shape", () => {
    const item = toVersionItem(baseRecord)
    expect(item.id).toBe("v1")
    expect(item.version).toBe("1.0.0")
    expect(item.comparable_version).toBe("1.0.0")
    expect(item.title).toBe("Release 1.0")
    expect(item.content).toBe("Notes")
    expect(item.download_url).toBe("https://example.com/dl")
    expect(item.forced).toBe(false)
    expect(item.is_latest).toBe(true)
    expect(item.is_preview).toBe(false)
    expect(item.is_milestone).toBe(false)
    expect(item.is_deprecated).toBe(false)
    expect(item.platforms).toEqual(["ios", "android"])
    expect(item.platform).toBe("ios")
    expect(item.published_at).toBe(1000)
    expect(item.created_at).toBe(900)
  })

  it("falls back to version string when comparableVersion is null", () => {
    const record = { ...baseRecord, comparableVersion: null }
    expect(toVersionItem(record).comparable_version).toBe("1.0.0")
  })

  it("generates download_links from downloadUrl when downloadLinks is null", () => {
    const item = toVersionItem(baseRecord)
    expect(item.download_links).toEqual([{ url: "https://example.com/dl" }])
  })

  it("uses parsed downloadLinks when present", () => {
    const record = {
      ...baseRecord,
      downloadLinks: [{ url: "https://a.com", name: "asset" }],
    }
    const item = toVersionItem(record)
    expect(item.download_links).toEqual([{ url: "https://a.com", name: "asset" }])
  })

  it("returns empty download_links when both are empty", () => {
    const record = { ...baseRecord, downloadUrl: null, downloadLinks: null }
    expect(toVersionItem(record).download_links).toEqual([])
  })
})

// ── Platform conversion ──

describe("toClientPlatform", () => {
  it("converts lowercase to enum", () => {
    expect(toClientPlatform("ios")).toBe(ClientPlatform.IOS)
    expect(toClientPlatform("android")).toBe(ClientPlatform.ANDROID)
    expect(toClientPlatform("windows")).toBe(ClientPlatform.WINDOWS)
    expect(toClientPlatform("mac")).toBe(ClientPlatform.MAC)
    expect(toClientPlatform("web")).toBe(ClientPlatform.WEB)
  })

  it("returns undefined for undefined", () => {
    expect(toClientPlatform(undefined)).toBeUndefined()
  })
})

describe("toClientPlatforms", () => {
  it("converts array of lowercase platforms", () => {
    expect(toClientPlatforms(["ios", "android"], undefined)).toEqual([
      ClientPlatform.IOS,
      ClientPlatform.ANDROID,
    ])
  })

  it("deduplicates platform values", () => {
    expect(toClientPlatforms(["ios", "ios"], undefined)).toEqual([ClientPlatform.IOS])
  })

  it("falls back to single platform when array is empty", () => {
    expect(toClientPlatforms([], "mac")).toEqual([ClientPlatform.MAC])
  })

  it("falls back to single platform when array is undefined", () => {
    expect(toClientPlatforms(undefined, "web")).toEqual([ClientPlatform.WEB])
  })

  it("returns empty array when both undefined", () => {
    expect(toClientPlatforms(undefined, undefined)).toEqual([])
  })
})

describe("fromClientPlatforms", () => {
  it("converts enum array to lowercase strings", () => {
    expect(fromClientPlatforms([ClientPlatform.IOS, ClientPlatform.WEB])).toEqual(["ios", "web"])
  })

  it("returns empty array for null", () => {
    expect(fromClientPlatforms(null)).toEqual([])
  })

  it("returns empty array for undefined", () => {
    expect(fromClientPlatforms(undefined)).toEqual([])
  })

  it("returns empty array for empty array", () => {
    expect(fromClientPlatforms([])).toEqual([])
  })
})

describe("fromClientPlatform", () => {
  it("converts single enum to lowercase", () => {
    expect(fromClientPlatform(ClientPlatform.ANDROID)).toBe("android")
  })

  it("returns null for null", () => {
    expect(fromClientPlatform(null)).toBeNull()
  })
})

// ── Download link helpers ──

describe("parseDownloadLinks", () => {
  it("returns empty when value is null", () => {
    expect(parseDownloadLinks(null)).toEqual([])
  })

  it("returns empty when value is not an array", () => {
    expect(parseDownloadLinks("not-array")).toEqual([])
    expect(parseDownloadLinks(42)).toEqual([])
  })

  it("parses valid link objects", () => {
    const links = [
      { url: "https://a.com", name: "file1" },
      { url: "https://b.com", platform: "windows" },
    ]
    expect(parseDownloadLinks(links)).toEqual([
      { url: "https://a.com", name: "file1" },
      { url: "https://b.com", platform: "windows" },
    ])
  })

  it("skips items without valid url", () => {
    const links = [{ url: "" }, { url: "   " }, { name: "no-url" }, null, 42, []]
    expect(parseDownloadLinks(links)).toEqual([])
  })

  it("ignores non-string name and platform", () => {
    const links = [{ url: "https://a.com", name: 42, platform: true }]
    expect(parseDownloadLinks(links)).toEqual([{ url: "https://a.com" }])
  })
})

describe("normalizeDownloadLinks", () => {
  it("trims url, name, and platform", () => {
    const links = [{ url: "  https://a.com  ", name: "  file  ", platform: "  ios  " }]
    expect(normalizeDownloadLinks(links)).toEqual([
      { url: "https://a.com", name: "file", platform: "ios" },
    ])
  })

  it("filters out empty urls after trim", () => {
    expect(normalizeDownloadLinks([{ url: "  " }])).toEqual([])
  })

  it("converts empty name/platform to undefined", () => {
    const links = [{ url: "https://a.com", name: "  ", platform: "" }]
    expect(normalizeDownloadLinks(links)).toEqual([{ url: "https://a.com" }])
  })
})

describe("resolveDownloadData", () => {
  it("normalizes downloadLinks when provided", () => {
    const result = resolveDownloadData(undefined, [{ url: "https://a.com" }])
    expect(result.downloadLinks).toEqual([{ url: "https://a.com" }])
    expect(result.downloadUrl).toBe("https://a.com")
  })

  it("uses explicit downloadUrl with downloadLinks", () => {
    const result = resolveDownloadData("https://explicit.com", [{ url: "https://a.com" }])
    expect(result.downloadUrl).toBe("https://explicit.com")
  })

  it("creates single-elem links from downloadUrl when no links", () => {
    const result = resolveDownloadData("https://dl.com", undefined)
    expect(result.downloadUrl).toBe("https://dl.com")
    expect(result.downloadLinks).toEqual([{ url: "https://dl.com" }])
  })

  it("clears links when downloadUrl is empty string", () => {
    const result = resolveDownloadData("", undefined)
    expect(result.downloadUrl).toBe("")
    expect(result.downloadLinks).toEqual([])
  })

  it("falls back to current values when nothing provided", () => {
    const result = resolveDownloadData(undefined, undefined, "https://old.com", [
      { url: "https://old.com" },
    ])
    expect(result.downloadUrl).toBe("https://old.com")
    expect(result.downloadLinks).toEqual([{ url: "https://old.com" }])
  })

  it("returns null downloadUrl from empty links", () => {
    const result = resolveDownloadData(undefined, [])
    expect(result.downloadUrl).toBeNull()
  })
})

// ── Tag normalization ──

describe("normalizeVersionTag", () => {
  it("strips leading v prefix", () => {
    expect(normalizeVersionTag("v1.0.0")).toBe("1.0.0")
  })

  it("strips leading V prefix", () => {
    expect(normalizeVersionTag("V2.3.4")).toBe("2.3.4")
  })

  it("leaves non-v-prefixed tags unchanged", () => {
    expect(normalizeVersionTag("1.0.0")).toBe("1.0.0")
  })

  it("trims whitespace", () => {
    expect(normalizeVersionTag("  v1.0  ")).toBe("1.0")
  })

  it("returns empty for empty string", () => {
    expect(normalizeVersionTag("")).toBe("")
  })
})

// ── GitHub asset conversion ──

describe("toGithubReleaseDownloadLinks", () => {
  it("converts assets to download links", () => {
    const assets = [
      { name: "app.zip", browser_download_url: "https://gh.com/app.zip" },
      { name: "app.dmg", browser_download_url: "https://gh.com/app.dmg" },
    ]
    expect(toGithubReleaseDownloadLinks(assets)).toEqual([
      { url: "https://gh.com/app.zip", name: "app.zip" },
      { url: "https://gh.com/app.dmg", name: "app.dmg" },
    ])
  })

  it("filters assets with empty download url", () => {
    const assets = [
      { name: "bad", browser_download_url: "" },
      { name: "good", browser_download_url: "https://gh.com/good" },
    ]
    expect(toGithubReleaseDownloadLinks(assets)).toEqual([
      { url: "https://gh.com/good", name: "good" },
    ])
  })

  it("handles undefined assets", () => {
    expect(toGithubReleaseDownloadLinks(undefined)).toEqual([])
  })

  it("handles empty asset name", () => {
    const assets = [{ name: "  ", browser_download_url: "https://gh.com/dl" }]
    expect(toGithubReleaseDownloadLinks(assets)).toEqual([{ url: "https://gh.com/dl" }])
  })
})
