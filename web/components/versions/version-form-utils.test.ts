import { describe, expect, it } from "vitest"

import {
  emptyVersionForm,
  parseDownloadLinks,
  parseJsonInput,
  toCreateInput,
  toDateTimeLocal,
  toTimestampSeconds,
  validateVersionRules,
  type VersionFormState,
} from "./version-form-utils"

describe("toDateTimeLocal", () => {
  it("converts Unix seconds to datetime-local string", () => {
    // 2024-01-15T12:00:00 UTC = 1705320000
    const result = toDateTimeLocal(1705320000)
    // Format should be YYYY-MM-DDTHH:MM (local timezone)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})

describe("toTimestampSeconds", () => {
  it("returns undefined for empty string", () => {
    expect(toTimestampSeconds("")).toBeUndefined()
    expect(toTimestampSeconds("  ")).toBeUndefined()
  })

  it("parses a valid datetime-local value", () => {
    const result = toTimestampSeconds("2024-01-15T12:00")
    expect(typeof result).toBe("number")
    expect(result).toBeGreaterThan(0)
  })

  it("throws on invalid date string", () => {
    expect(() => toTimestampSeconds("not-a-date")).toThrow("发布时间格式不正确")
  })
})

describe("parseJsonInput", () => {
  it("returns undefined for empty input", () => {
    expect(parseJsonInput("")).toBeUndefined()
    expect(parseJsonInput("  ")).toBeUndefined()
  })

  it("parses valid JSON object", () => {
    expect(parseJsonInput('{"key":"value"}')).toEqual({ key: "value" })
  })

  it("throws on array", () => {
    expect(() => parseJsonInput("[1,2]")).toThrow("custom_data 必须是 JSON 对象")
  })

  it("throws on primitive", () => {
    expect(() => parseJsonInput('"hello"')).toThrow("custom_data 必须是 JSON 对象")
  })

  it("throws on invalid JSON", () => {
    expect(() => parseJsonInput("{bad}")).toThrow()
  })
})

describe("parseDownloadLinks", () => {
  it("returns undefined for empty input", () => {
    expect(parseDownloadLinks("")).toBeUndefined()
    expect(parseDownloadLinks("   ")).toBeUndefined()
  })

  it("parses valid array of links", () => {
    const json = JSON.stringify([
      { url: "https://a.com/file.zip", name: "release", platform: "windows" },
      { url: "https://b.com/file.dmg" },
    ])
    const result = parseDownloadLinks(json)
    expect(result).toHaveLength(2)
    expect(result![0]).toEqual({
      url: "https://a.com/file.zip",
      name: "release",
      platform: "windows",
    })
    expect(result![1]).toEqual({
      url: "https://b.com/file.dmg",
      name: undefined,
      platform: undefined,
    })
  })

  it("filters out entries with empty url", () => {
    const json = JSON.stringify([{ url: "" }, { url: "https://a.com" }])
    const result = parseDownloadLinks(json)
    expect(result).toHaveLength(1)
    expect(result![0]!.url).toBe("https://a.com")
  })

  it("throws on non-array", () => {
    expect(() => parseDownloadLinks('{"url":"x"}')).toThrow("download_links 必须是数组")
  })
})

describe("toCreateInput", () => {
  it("converts empty form to minimal input", () => {
    const result = toCreateInput(emptyVersionForm)
    expect(result.version).toBe("")
    expect(result.comparable_version).toBe("")
    expect(result.title).toBeUndefined()
    expect(result.content).toBeUndefined()
    expect(result.download_url).toBeUndefined()
    expect(result.is_latest).toBe(true)
    expect(result.is_preview).toBe(false)
    expect(result.platforms).toEqual([])
  })

  it("converts populated form correctly", () => {
    const form: VersionFormState = {
      ...emptyVersionForm,
      version: " 1.0.0 ",
      comparable_version: "1.0.0",
      title: "Release",
      content: "Initial release",
      download_url: "https://example.com/file.zip",
      download_links_json: "",
      platforms: ["ios", "android"],
      custom_data: '{"changelog":"v1"}',
      published_at: "2024-01-15T12:00",
    }
    const result = toCreateInput(form)
    expect(result.version).toBe("1.0.0")
    expect(result.title).toBe("Release")
    expect(result.download_url).toBe("https://example.com/file.zip")
    expect(result.platforms).toEqual(["ios", "android"])
    expect(result.platform).toBe("ios")
    expect(result.custom_data).toEqual({ changelog: "v1" })
    expect(typeof result.published_at).toBe("number")
  })
})

describe("emptyVersionForm", () => {
  it("has the expected defaults", () => {
    expect(emptyVersionForm.is_latest).toBe(true)
    expect(emptyVersionForm.is_preview).toBe(false)
    expect(emptyVersionForm.is_milestone).toBe(false)
    expect(emptyVersionForm.is_deprecated).toBe(false)
    expect(emptyVersionForm.platforms).toEqual([])
  })
})

describe("validateVersionRules", () => {
  it("rejects latest + deprecated combination", () => {
    const form: VersionFormState = {
      ...emptyVersionForm,
      version: "1.0.0",
      comparable_version: "1.0.0",
      is_latest: true,
      is_deprecated: true,
    }

    expect(validateVersionRules(form)).toBe("Latest 版本不能被标记为废弃。")
  })

  it("rejects deprecated version when no newer stable candidate exists", () => {
    const form: VersionFormState = {
      ...emptyVersionForm,
      version: "1.0.0",
      comparable_version: "1.0.0",
      is_latest: false,
      is_deprecated: true,
    }

    const candidates = [
      {
        id: "v-preview",
        comparable_version: "2.0.0-rc.1",
        is_preview: true,
        is_deprecated: false,
      },
      {
        id: "v-deprecated",
        comparable_version: "2.0.0",
        is_preview: false,
        is_deprecated: true,
      },
    ]

    expect(validateVersionRules(form, { candidates })).toBe(
      "废弃版本之后必须至少存在一个可升级到的正式版本（非预发布且非废弃）。",
    )
  })

  it("accepts deprecated version when newer stable candidate exists", () => {
    const form: VersionFormState = {
      ...emptyVersionForm,
      version: "1.0.0",
      comparable_version: "1.0.0",
      is_latest: false,
      is_deprecated: true,
    }

    const candidates = [
      {
        id: "v-newer",
        comparable_version: "1.1.0",
        is_preview: false,
        is_deprecated: false,
      },
    ]

    expect(validateVersionRules(form, { candidates })).toBeNull()
  })
})
