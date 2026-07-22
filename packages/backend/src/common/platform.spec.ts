import { Platform } from "@prisma/client"
import { plainToInstance } from "class-transformer"
import { IsIn, IsOptional, validateSync } from "class-validator"

import {
  fromPlatform,
  fromPlatforms,
  NormalizePlatform,
  PLATFORM_VALUES,
  toPlatform,
} from "./platform"

describe("platform value conversion", () => {
  it("keeps the API values in sync with the Prisma enum", () => {
    // 两边都是「唯一事实来源」的候选，只有断言相等才能保证不会再分叉出
    // 一个漏了 linux 的清单。
    expect([...PLATFORM_VALUES].sort()).toEqual(
      Object.values(Platform)
        .map((value) => value.toLowerCase())
        .sort(),
    )
  })

  it("converts between lowercase API values and the enum", () => {
    expect(toPlatform("macos")).toBe(Platform.MACOS)
    expect(toPlatform("linux")).toBe(Platform.LINUX)
    expect(toPlatform(undefined)).toBeUndefined()

    expect(fromPlatform(Platform.WINDOWS)).toBe("windows")
    expect(fromPlatform(null)).toBeNull()
    expect(fromPlatforms([Platform.IOS, Platform.OTHERS])).toEqual(["ios", "others"])
    expect(fromPlatforms(null)).toEqual([])
  })
})

describe("NormalizePlatform", () => {
  class Dto {
    @IsOptional()
    @NormalizePlatform()
    @IsIn(PLATFORM_VALUES)
    platform?: string

    @IsOptional()
    @NormalizePlatform()
    @IsIn(PLATFORM_VALUES, { each: true })
    platforms?: string[]
  }

  const validate = (plain: Record<string, unknown>) => {
    const dto = plainToInstance(Dto, plain)
    return { dto, errors: validateSync(dto) }
  }

  it("accepts any casing and surrounding whitespace", () => {
    const { dto, errors } = validate({ platform: "  MacOS ", platforms: ["Windows", "LINUX"] })
    expect(errors).toHaveLength(0)
    expect(dto.platform).toBe("macos")
    expect(dto.platforms).toEqual(["windows", "linux"])
  })

  it("still rejects a value outside the enum", () => {
    expect(validate({ platform: "harmonyos" }).errors).toHaveLength(1)
  })

  it("passes non-strings through so the validator reports them", () => {
    expect(validate({ platform: 42 }).errors).toHaveLength(1)
  })
})
