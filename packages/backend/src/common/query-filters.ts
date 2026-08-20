/**
 * 列表接口的通用查询参数处理。
 *
 * 搜索与三态开关的语义在各模块之间必须一致，否则后台的同一个搜索框在不同页
 * 会表现不同。这里的两条规则是：空串等于没传（清空搜索框不应变成 `contains: ""`
 * 这种恒真条件），未出现的布尔参数等于不加条件（而不是等于 false）。
 */

import { Transform } from "class-transformer"
import { Prisma } from "@prisma/client"

/** 搜索词长度上限。够长以容纳一条完整版本号或邮箱，又不至于被当成攻击载荷。 */
export const MAX_SEARCH_LENGTH = 128

/** 去空白；空串归一成 undefined，非字符串原样透传交给校验器报错。 */
export function NormalizeSearch() {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== "string") {
      return value
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  })
}

/** 单个字段的不区分大小写子串条件。 */
export function searchContains(search: string): Prisma.StringFilter {
  return { contains: search, mode: Prisma.QueryMode.insensitive }
}

/** 三态开关：未传（含空串）不加条件，传了才按 "true" / "1" 判真。 */
export function NormalizeOptionalBoolean() {
  return Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === "") {
      return undefined
    }

    return value === true || value === "true" || value === "1"
  })
}
