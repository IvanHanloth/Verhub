import { BadRequestException } from "@nestjs/common"

import {
  compareComparableVersions,
  isComparableVersionInRange,
  parseComparableVersion,
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
})
