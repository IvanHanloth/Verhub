/**
 * 平台取值在 API 表层与数据库枚举之间的转换。
 *
 * 数据库用大写枚举 `Platform`，对外 JSON 一律小写（`windows` / `macos`），两侧
 * 只差大小写，所以转换就是 toUpperCase/toLowerCase——但取值清单只能有一份，
 * 散在各个 DTO 里的字面量联合类型正是上一版少了 linux、mac 与 macos 混用的由来。
 */

import { Platform } from "@prisma/client"
import { Transform } from "class-transformer"

/** 对外的平台取值，与 `Platform` 枚举一一对应。 */
export const PLATFORM_VALUES = [
  "windows",
  "linux",
  "macos",
  "ios",
  "android",
  "web",
  "others",
] as const

export type PlatformValue = (typeof PLATFORM_VALUES)[number]

export function toPlatform(value: PlatformValue | undefined): Platform | undefined {
  return value ? (value.toUpperCase() as Platform) : undefined
}

export function fromPlatform(platform: Platform | null | undefined): PlatformValue | null {
  return platform ? (platform.toLowerCase() as PlatformValue) : null
}

export function fromPlatforms(platforms: Platform[] | null | undefined): PlatformValue[] {
  return (platforms ?? []).map((item) => item.toLowerCase() as PlatformValue)
}

/**
 * 归一化客户端提交的平台取值：去空白 + 转小写，取值大小写不敏感。
 *
 * 放在 `@Transform` 里而不是校验器里，是因为 class-validator 的 `IsIn` 只做
 * 全等比较；先归一化再校验，才能既接受 "Windows" 又保证存进去的是同一个值。
 * 非字符串原样透传，交给后面的 `IsIn` 报错。
 */
export function NormalizePlatform() {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value === "string") {
      return value.trim().toLowerCase()
    }
    if (Array.isArray(value)) {
      return value.map((item) => (typeof item === "string" ? item.trim().toLowerCase() : item))
    }
    return value
  })
}
