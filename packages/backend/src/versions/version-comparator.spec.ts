import { BadRequestException } from "@nestjs/common"

import {
  compareComparableVersions,
  isComparableVersionInRange,
  parseComparableVersion,
  toComparableVersionSortKey,
} from "./version-comparator"

describe("version-comparator", () => {
  it("parses comparable version with prerelease", () => {
    const parsed = parseComparableVersion("1.2.3.0-alpha.12")
    expect(parsed.core).toEqual([1, 2, 3, 0])
    expect(parsed.preTag).toBe("alpha")
    expect(parsed.preNumbers).toEqual([12])
  })

  it("throws for invalid comparable version", () => {
    expect(() => parseComparableVersion("v1.2.3")).toThrow(BadRequestException)
    expect(() => parseComparableVersion("1.2.3-preview.1")).toThrow(BadRequestException)
  })

  it("compares stable and prerelease versions correctly", () => {
    expect(compareComparableVersions("1.2.3", "1.2.3-rc.1")).toBeGreaterThan(0)
    expect(compareComparableVersions("1.2.3-beta.1", "1.2.3-alpha.99")).toBeGreaterThan(0)
    expect(compareComparableVersions("1.70.4", "2.00.0")).toBeLessThan(0)
    expect(compareComparableVersions("1.2.3-rc.1", "1.2.3-rc.2")).toBeLessThan(0)
    expect(compareComparableVersions("1.2.3", "1.2.3.0")).toBe(0)
    expect(compareComparableVersions("1.2.4", "1.2.3.999")).toBeGreaterThan(0)
  })

  it("checks in-range comparable versions", () => {
    expect(isComparableVersionInRange("1.2.3", "1.0.0", "1.9.9")).toBe(true)
    expect(isComparableVersionInRange("0.9.9", "1.0.0", "1.9.9")).toBe(false)
    expect(isComparableVersionInRange("2.0.0", "1.0.0", "1.9.9")).toBe(false)
    expect(isComparableVersionInRange("1.5.0-beta.1", "1.5.0-alpha.1", "1.5.0-rc.9")).toBe(true)
  })

  describe("toComparableVersionSortKey", () => {
    // 排序键存在的唯一理由：让数据库的字符串排序等价于 compareComparableVersions。
    // 这条断言就是那个契约本身，比逐个断言字面量更能防回归。
    it("字符串序与语义序完全一致", () => {
      const versions = [
        "0.9.9",
        "1.0.0",
        "1.2.3-alpha",
        "1.2.3-alpha.2",
        "1.2.3-beta.1",
        "1.2.3-rc.1",
        "1.2.3-rc.2",
        "1.2.3",
        "1.2.3.1",
        "1.2.4",
        "1.70.4",
        "2.0.0",
        // 纯字符串序会把 "10.0.0" 排在 "2.0.0" 前面，零填充后才对。
        "10.0.0",
        "20260817.1",
      ]

      const bySemantics = [...versions].sort(compareComparableVersions)
      const bySortKey = [...versions].sort((a, b) => {
        const left = toComparableVersionSortKey(a) ?? ""
        const right = toComparableVersionSortKey(b) ?? ""
        return left < right ? -1 : left > right ? 1 : 0
      })

      expect(bySortKey).toEqual(bySemantics)
    })

    it("预发布排在同一个正式版之前", () => {
      const stable = toComparableVersionSortKey("3.1.0") as string
      const rc2 = toComparableVersionSortKey("3.1.0-rc.2") as string
      const rc1 = toComparableVersionSortKey("3.1.0-rc.1") as string

      expect(rc1 < rc2).toBe(true)
      expect(rc2 < stable).toBe(true)
    })

    it("补零段等价的版本号得到同一个键", () => {
      expect(toComparableVersionSortKey("1.2.3")).toBe(toComparableVersionSortKey("1.2.3.0"))
    })

    it("定长且只含数字", () => {
      const key = toComparableVersionSortKey("1.2.3-rc.4") as string
      expect(key).toHaveLength(4 * 10 + 1 + 3 * 10)
      expect(key).toMatch(/^\d+$/)
      expect(toComparableVersionSortKey("1.2.3")).toHaveLength(key.length)
    })

    it("解析不了的旧数据落 null，三态原样透传", () => {
      expect(toComparableVersionSortKey("v1.2.3")).toBeNull()
      expect(toComparableVersionSortKey("1.2.3-preview.1")).toBeNull()
      expect(toComparableVersionSortKey(null)).toBeNull()
      expect(toComparableVersionSortKey(undefined)).toBeUndefined()
    })
  })
})
